const { query } = require("../lib/prisma");
const { normalize, contentHash } = require("./textUtils");
const { findDuplicate } = require("./dedupService");
const { matchQueue } = require("../queue");

/**
 * Single entrypoint for both ingestion paths: the Playwright scheduled
 * scraper and the existing browser extension's manual "save job" action.
 * Keeping this in one place means dedup/normalization logic is never
 * duplicated between the two capture methods.
 *
 * payload: { title, company, description, location, remoteType,
 *            sourceName: 'linkedin'|'indeed', sourceUrl, externalJobId, postedAt }
 */
async function ingestJob(payload) {
  const sourceRes = await query("SELECT id FROM job_sources WHERE name = $1", [
    payload.sourceName,
  ]);
  if (!sourceRes.rows.length) {
    throw new Error(`Unknown job source: ${payload.sourceName}`);
  }
  const sourceId = sourceRes.rows[0].id;

  const normalizedCompany = normalize(payload.company);
  // Was SELECT-then-INSERT: two concurrent ingestions of a job from a
  // brand-new company (the scrape worker runs with concurrency:2 — see
  // workers/scrapeWorker.js — so two discovery runs, or a run overlapping
  // a manual browser-extension capture, can genuinely land here at the
  // same moment) could both find no existing row and both attempt the
  // INSERT; whichever lost the race hit the `normalized_name` unique
  // constraint (Postgres 23505) as a raw, uncaught error — silently
  // dropping that one job posting rather than crashing anything (the
  // per-job try/catch in services/jobDiscovery/index.js's runDiscovery
  // loop swallows it), but that's still real, silent data loss, not
  // just a noisy log line.
  //
  // `INSERT ... ON CONFLICT ... DO UPDATE` makes the check-and-create a
  // single atomic statement instead of two round-trips, so there's no
  // window for a second insert to race the first — the loser of the
  // race reuses the winner's row instead of failing. `DO UPDATE SET
  // name = EXCLUDED.name` (rather than `DO NOTHING`) is what makes
  // Postgres return the existing row from `RETURNING id` on a conflict;
  // `DO NOTHING` would return zero rows on conflict and still require a
  // follow-up SELECT, just with the same race moved one statement later.
  const upserted = await query(
    `INSERT INTO companies (name, normalized_name)
     VALUES ($1, $2)
     ON CONFLICT (normalized_name) DO UPDATE SET name = companies.name
     RETURNING id`,
    [payload.company, normalizedCompany],
  );
  const companyId = upserted.rows[0].id;

  const duplicate = await findDuplicate({
    title: payload.title,
    company: payload.company,
    description: payload.description,
    companyId,
    postedAt: payload.postedAt,
  });

  const hash = contentHash(payload);
  const normalizedTitle = normalize(payload.title);

  if (duplicate) {
    // Still record the row (useful for audit — "seen on 2 platforms"), but
    // mark it inert so it never enters matching/apply twice.
    const inserted = await query(
      `INSERT INTO jobs (company_id, title, normalized_title, description, location,
                          remote_type, source_id, source_url, external_job_id,
                          canonical_job_id, status, posted_at, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'duplicate',$11,$12)
       ON CONFLICT (source_id, external_job_id) DO NOTHING
       RETURNING id`,
      [
        companyId,
        payload.title,
        normalizedTitle,
        payload.description,
        payload.location,
        payload.remoteType,
        sourceId,
        payload.sourceUrl,
        payload.externalJobId,
        duplicate.id,
        payload.postedAt || null,
        hash,
      ],
    );

    // BUG FIX (integration audit): this branch used to return here without
    // ever touching matchQueue. That meant whoever submitted this
    // duplicate (their tracked_jobs.engine_job_id still correctly points
    // at the canonical job below) would never get a match_scores row for
    // it — the canonical job had only ever been queued for whichever user
    // submitted it FIRST. Every submitter of the same job needs to be
    // scored against it, not just the first one, so this queues the
    // canonical job for the current submitter's profile too. Same
    // ownerUserId semantics as the non-duplicate path: undefined for
    // ownerless scrape/discovery submissions, which matchWorker already
    // fans out to every profile for.
    if (payload.ownerUserId) {
      await matchQueue.add(
        "score",
        { jobId: duplicate.id, ownerUserId: payload.ownerUserId },
        { attempts: 3, backoff: { type: "exponential", delay: 3000 } },
      );
    }

    return {
      status: "duplicate",
      canonicalJobId: duplicate.id,
      jobId: inserted.rows[0]?.id,
    };
  }

  const inserted = await query(
    `INSERT INTO jobs (company_id, title, normalized_title, description, location,
                        remote_type, source_id, source_url, external_job_id,
                        status, posted_at, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11)
     ON CONFLICT (source_id, external_job_id) DO UPDATE SET scraped_at = now()
     RETURNING id`,
    [
      companyId,
      payload.title,
      normalizedTitle,
      payload.description,
      payload.location,
      payload.remoteType,
      sourceId,
      payload.sourceUrl,
      payload.externalJobId,
      payload.postedAt || null,
      hash,
    ],
  );
  const jobId = inserted.rows[0].id;

  // canonical_job_id points to itself for non-duplicate rows (simplifies joins)
  await query("UPDATE jobs SET canonical_job_id = $1 WHERE id = $1", [jobId]);

  await matchQueue.add(
    "score",
    // ownerUserId (set by engineBridge.js for manual/extension/gmail
    // sources) tells matchWorker to score only that user's profile.
    // Left undefined for scrape/discovery jobs, which have no single
    // owner — matchWorker fans out over every user's profile for those,
    // since the job is genuinely shared catalog data.
    { jobId, ownerUserId: payload.ownerUserId },
    { attempts: 3, backoff: { type: "exponential", delay: 3000 } },
  );

  return { status: "new", jobId };
}

module.exports = { ingestJob };
