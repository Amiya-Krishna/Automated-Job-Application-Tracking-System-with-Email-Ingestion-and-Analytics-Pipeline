const path = require("path");
const fs = require("fs");
const { selectAdapter } = require("../adapters");
const { allowApply, humanDelay } = require("./rateLimiter");
const { query } = require("../lib/prisma");

const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR))
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const NAV_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

// BUG FIX: adapters build selectors from things like a <label for="...">
// id (see adapters/genericAdapter.js), which HTML doesn't actually
// guarantee is unique — real-world ATS pages routinely have several
// elements sharing an id (duplicate desktop/mobile form variants, hidden
// steps of a multi-step form all present in the DOM at once, honeypot
// fields). `page.fill(selector, value)` silently takes the FIRST
// DOM-order match with no regard for whether it's visible, then
// auto-waits for that element to become actionable — if it never will
// (because it's a hidden duplicate, not a transiently-loading one), the
// whole thing times out after 30s, which is exactly the reported
// "locator resolved to 6 elements... element is not visible... Timeout
// 30000ms exceeded" failure. The fix is to pick the first VISIBLE match
// ourselves rather than trust DOM order — not `force: true` (which would
// happily fill a hidden decoy field instead of the real one, silently
// submitting wrong/no data) and not a longer timeout (a hidden element
// that's never going to become visible just fails slower).
async function resolveVisibleField(page, selector) {
  const locator = page.locator(selector);
  const count = await locator.count();

  if (count <= 1) {
    return locator.first();
  }

  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    // eslint-disable-next-line no-await-in-loop -- must check in DOM order, one at a time
    if (await candidate.isVisible()) {
      return candidate;
    }
  }

  // Every match is hidden — surface that plainly (caught by the
  // per-field try/catch above and recorded as `skipped`) rather than
  // silently falling back to a hidden element and pretending it worked.
  throw new Error(`selector "${selector}" matched ${count} element(s), but none are visible`);
}

// BUG FIX: many ATS pages (React/Angular-driven application forms) do a
// client-side redirect shortly AFTER `domcontentloaded` fires — e.g. an
// initial loading shell that immediately navigates to the real form.
// If `adapter.detectFields(page)` runs a `page.$$eval`/`page.$` call
// exactly during that second navigation, Playwright's execution context
// for the old document is torn down mid-evaluation and throws
// "Execution context was destroyed, most likely because of a
// navigation" — a real, expected race on some sites, not a broken
// selector. Retrying once after the page has settled is the
// Playwright-recommended way to handle this specific error (as opposed
// to a longer fixed timeout, which wouldn't help if the destroying
// navigation simply hasn't started yet when the wait begins) — this
// only retries on that exact error, so a genuinely broken adapter still
// fails immediately and visibly instead of being masked by a retry.
async function withNavigationRetry(page, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!/execution context was destroyed/i.test(err.message)) {
      throw err;
    }
    console.warn("[applyEngine] page navigated mid-detection — retrying once after it settles");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return fn();
  }
}

/**
 * Prepares (but never submits) an application. Fills known fields, stops at
 * the final submit button, and leaves the page/status ready for human review.
 *
 * @param {object} job - { id, sourceUrl }
 * @param {object} profile - { full_name, email, phone, resume_path, linkedin_url }
 * @param {import('playwright').BrowserContext} browserContext - a persistent,
 *   already-logged-in context (reused across runs; see workers/applyWorker.js)
 */
async function prepareApplication(job, profile, browserContext) {
  const allowed = await allowApply(job.sourceUrl);
  if (!allowed) {
    await setStatus(job.id, "rate_limited", {
      reason: "domain hourly cap reached",
    });
    return { status: "rate_limited" };
  }

  const page = await browserContext.newPage();
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      await page.goto(job.sourceUrl, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
      break;
    } catch (err) {
      attempt += 1;
      if (attempt >= MAX_RETRIES) {
        await setStatus(job.id, "failed", {
          reason: `navigation timeout: ${err.message}`,
        });
        await page.close();
        return { status: "failed", reason: err.message };
      }
      await humanDelay(2000, 5000 * attempt); // exponential-ish backoff
    }
  }

  const adapter = selectAdapter(page.url());
  const fieldMap = await withNavigationRetry(page, () => adapter.detectFields(page));

  const filled = [];
  const skipped = [];
  for (const [fieldKey, selector] of Object.entries(fieldMap)) {
    const value = profile[fieldKey];
    if (!value) {
      skipped.push(fieldKey);
      continue;
    }
    try {
      await humanDelay();
      const target = await resolveVisibleField(page, selector);
      if (fieldKey === "resume_upload") {
        await target.setInputFiles(value); // value = local file path
      } else {
        await target.fill(value);
      }
      filled.push(fieldKey);
    } catch (err) {
      console.warn(
        `[applyEngine] field fill failed (${fieldKey}):`,
        err.message,
      );
      skipped.push(fieldKey);
    }
  }

  if (await adapter.isCaptchaPresent(page)) {
    await setStatus(job.id, "needs_captcha", { filled, skipped });
    // Intentionally leave `page` open — the worker hands this session to the
    // dashboard's "solve manually" action instead of closing it.
    return { status: "needs_captcha", page, filled, skipped };
  }

  const screenshotPath = path.join(SCREENSHOT_DIR, `job-${job.id}.png`);
  await page.screenshot({ path: screenshotPath });

  await setStatus(job.id, "pending_review", {
    filled,
    skipped,
    screenshotPath,
  });

  // Do NOT click submit. The user reviews `pending_review` applications in
  // the dashboard and confirms manually — see routes/applyRoutes.js
  // POST /api/applications/:id/submit.
  return { status: "pending_review", filled, skipped, screenshotPath, page };
}

async function setStatus(jobId, status, logExtra = {}) {
  // BUG FIX (P0 — apply worker JSONB failure): the VALUES() clause below
  // used to bind $3 with no cast at all — only the UPDATE branch's `||`
  // concatenation had an explicit `::jsonb` cast. $queryRawUnsafe sends
  // JS strings (JSON.stringify(logExtra) is always a string) as a plain
  // `text`-typed parameter unless the SQL tells Postgres otherwise, and
  // Postgres won't implicitly convert text -> jsonb on INSERT — hence
  // "column playwright_log is of type jsonb but expression is of type
  // text". Casting the VALUES-clause usage too (`$3::jsonb`) makes both
  // occurrences of the parameter explicitly jsonb, matching the column's
  // real type; `logExtra` (an array/object) is preserved as structured
  // JSON, not double-encoded or flattened to a bare string.
  // COALESCE guards a row created by applyRoutes.js's initial
  // `applications` upsert (POST /api/applications/:jobId creates the row
  // with only job_id/status — playwright_log starts out NULL there).
  // Postgres's jsonb `||` concatenation returns NULL if either side is
  // NULL, which would otherwise silently discard this update's log
  // entry instead of merging into it. Default is `'{}'::jsonb` (an empty
  // object), not an array — `logExtra` is always object-shaped here
  // ({reason}, {filled, skipped}, ...) and jsonb `||` between two
  // objects merges keys, which is the accumulating-fields behavior this
  // was written for; `'[]'::jsonb` would instead wrap each update as an
  // array element, changing that semantics.
  await query(
    `INSERT INTO applications (job_id, status, playwright_log, retry_count)
     VALUES ($1, $2, $3::jsonb, 0)
     ON CONFLICT (job_id) DO UPDATE
       SET status = $2,
           playwright_log = COALESCE(applications.playwright_log, '{}'::jsonb) || $3::jsonb,
           retry_count = CASE WHEN $2 = 'failed' THEN applications.retry_count + 1 ELSE applications.retry_count END`,
    [jobId, status, JSON.stringify(logExtra)],
  );
}

module.exports = { prepareApplication, setStatus };
