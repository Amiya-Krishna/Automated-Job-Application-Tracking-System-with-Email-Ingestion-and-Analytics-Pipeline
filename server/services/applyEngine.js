const path = require("path");
const fs = require("fs");
const { selectAdapter } = require("../adapters");
const { allowApply, humanDelay } = require("./rateLimiter");
const { query } = require("..@prisma/client");

const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR))
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const NAV_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

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
  const fieldMap = await adapter.detectFields(page);

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
      if (fieldKey === "resume_upload") {
        await page.setInputFiles(selector, value); // value = local file path
      } else {
        await page.fill(selector, value);
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
  await query(
    `INSERT INTO applications (job_id, status, playwright_log, retry_count)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (job_id) DO UPDATE
       SET status = $2,
           playwright_log = applications.playwright_log || $3::jsonb,
           retry_count = CASE WHEN $2 = 'failed' THEN applications.retry_count + 1 ELSE applications.retry_count END`,
    [jobId, status, JSON.stringify(logExtra)],
  );
}

module.exports = { prepareApplication };
