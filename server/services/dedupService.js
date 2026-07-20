const { query } = require("../db/pg");
const { normalize, contentHash, titleSimilarity } = require("./textUtils");
const { TfIdf } = require("natural");

const FUZZY_THRESHOLD = 0.85;
const DATE_WINDOW_DAYS = 14;

function descriptionSimilarity(a, b) {
  const tfidf = new TfIdf();
  tfidf.addDocument(normalize(a));
  tfidf.addDocument(normalize(b));

  const termsA = tfidf.listTerms(0);
  const termsB = tfidf.listTerms(1);
  const vecA = {}, vecB = {};
  termsA.forEach((t) => (vecA[t.term] = t.tfidf));
  termsB.forEach((t) => (vecB[t.term] = t.tfidf));

  const terms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, normA = 0, normB = 0;
  for (const t of terms) {
    const va = vecA[t] || 0, vb = vecB[t] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Finds an existing job matching `newJob` (exact hash, then fuzzy).
 * Returns { id } of the canonical duplicate, or null if genuinely new.
 * newJob: { title, company, description, companyId, postedAt }
 */
async function findDuplicate(newJob) {
  const hash = contentHash(newJob);

  const exact = await query("SELECT id FROM jobs WHERE content_hash = $1 LIMIT 1", [hash]);
  if (exact.rows.length) return { id: exact.rows[0].id, matchType: "exact" };

  if (!newJob.companyId) return null;

  const candidates = await query(
    `SELECT id, normalized_title, description FROM jobs
     WHERE company_id = $1
       AND ($2::timestamptz IS NULL OR posted_at BETWEEN $2::timestamptz - make_interval(days => $3)
                                                       AND $2::timestamptz + make_interval(days => $3))`,
    [newJob.companyId, newJob.postedAt || null, DATE_WINDOW_DAYS]
  );

  for (const candidate of candidates.rows) {
    const titleSim = titleSimilarity(newJob.title, candidate.normalized_title);
    const descSim = descriptionSimilarity(newJob.description, candidate.description);
    const combined = 0.4 * titleSim + 0.6 * descSim;
    if (combined > FUZZY_THRESHOLD) {
      return { id: candidate.id, matchType: "fuzzy", score: combined };
    }
  }
  return null;
}

module.exports = { findDuplicate, contentHash, descriptionSimilarity };
