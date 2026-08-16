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
  let companyRes = await query(
    "SELECT id FROM companies WHERE normalized_name = $1",
    [normalizedCompany],
  );
  let companyId;
  if (companyRes.rows.length) {
    companyId = companyRes.rows[0].id;
  } else {
    const inserted = await query(
      "INSERT INTO companies (name, normalized_name) VALUES ($1, $2) RETURNING id",
      [payload.company, normalizedCompany],
    );
    companyId = inserted.rows[0].id;
  }

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
    { jobId },
    { attempts: 3, backoff: { type: "exponential", delay: 3000 } },
  );

  return { status: "new", jobId };
}

module.exports = { ingestJob };
