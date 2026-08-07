const natural = require("natural");

const { JaroWinklerDistance } = natural;

const DATE_WINDOW_DAYS = 3;
const COMPANY_SUFFIXES =
  /\b(incorporated|inc\.?|llc|ltd\.?|limited|corp\.?|corporation|company|co\.?|plc|gmbh)\b/gi;

function stripAccents(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return stripAccents(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompany(value) {
  return normalizeText(value)
    .replace(COMPANY_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRole(value) {
  return normalizeText(value);
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function resolveApplicationDate(value) {
  return parseDateOnly(value) || new Date().toISOString().slice(0, 10);
}

function normalizeTrackedJobInput(input) {
  const company = String(input.company || "").trim();
  const role = String(input.role || "").trim();
  const status = String(input.status || "Applied").trim() || "Applied";
  const interviewDate = String(input.interviewDate || "").trim();
  const notes = String(input.notes || "").trim();
  const applicationDate = resolveApplicationDate(
    input.applicationDate || input.createdAt,
  );

  return {
    company,
    role,
    status,
    interviewDate: interviewDate || null,
    notes: notes || null,
    applicationDate,
    duplicateStrategy: String(input.duplicateStrategy || "merge").toLowerCase(),
    normalizedCompany: normalizeCompany(company),
    normalizedRole: normalizeRole(role),
  };
}

function buildLockKey(userId, normalizedCompany, applicationDate) {
  // Why: the lock serializes competing inserts for the same logical job
  // without forcing the whole table through a heavyweight lock.
  return `tracked_jobs:${userId}:${normalizedCompany}:${applicationDate}`;
}

function dayDifference(left, right) {
  const leftDate = parseDateOnly(left);
  const rightDate = parseDateOnly(right);

  if (!leftDate || !rightDate) return Number.POSITIVE_INFINITY;

  return Math.abs(
    (new Date(`${leftDate}T00:00:00Z`).getTime() -
      new Date(`${rightDate}T00:00:00Z`).getTime()) /
      86400000,
  );
}

function scoreDuplicateCandidate(normalizedJob, candidate) {
  const candidateCompany = normalizeCompany(candidate.company);
  const candidateRole = normalizeRole(candidate.role);
  const companyScore = JaroWinklerDistance(
    normalizedJob.normalizedCompany,
    candidateCompany,
  );
  const roleScore = JaroWinklerDistance(
    normalizedJob.normalizedRole,
    candidateRole,
  );
  const dayGap = dayDifference(
    normalizedJob.applicationDate,
    candidate.application_date,
  );
  const dateScore = Number.isFinite(dayGap)
    ? Math.max(0, 1 - dayGap / (DATE_WINDOW_DAYS + 1))
    : 0;

  const combinedScore =
    companyScore * 0.45 + roleScore * 0.45 + dateScore * 0.1;
  const companyMatch = companyScore >= 0.92;
  const roleMatch = roleScore >= 0.88;
  const dateMatch = dayGap <= DATE_WINDOW_DAYS;

  return {
    candidate,
    companyScore,
    roleScore,
    dateGapDays: dayGap,
    combinedScore,
    duplicate: companyMatch && roleMatch && dateMatch && combinedScore >= 0.89,
  };
}

async function findExactDuplicate(client, userId, normalizedJob) {
  const { rows } = await client.query(
    `SELECT *
     FROM tracked_jobs
     WHERE user_id = $1
       AND lower(btrim(company)) = $2
       AND lower(btrim(role)) = $3
       AND application_date = $4::date
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [
      userId,
      normalizedJob.normalizedCompany,
      normalizedJob.normalizedRole,
      normalizedJob.applicationDate,
    ],
  );

  return rows[0] || null;
}

async function findFuzzyDuplicate(client, userId, normalizedJob) {
  const { rows } = await client.query(
    `SELECT *
     FROM tracked_jobs
     WHERE user_id = $1
       AND application_date BETWEEN ($2::date - INTERVAL '3 days') AND ($2::date + INTERVAL '3 days')
     ORDER BY application_date DESC, updated_at DESC, id DESC
     LIMIT 25`,
    [userId, normalizedJob.applicationDate],
  );

  const scored = rows.map((candidate) =>
    scoreDuplicateCandidate(normalizedJob, candidate),
  );
  scored.sort((left, right) => right.combinedScore - left.combinedScore);

  return scored.find((entry) => entry.duplicate) || null;
}

function resolveStatus(existingStatus, incomingStatus) {
  const rank = {
    Applied: 1,
    Interview: 2,
    Rejected: 2,
    Offer: 3,
  };

  const existingRank = rank[existingStatus] || 0;
  const incomingRank = rank[incomingStatus] || 0;

  if (!existingStatus) return incomingStatus || "Applied";
  if (incomingRank > existingRank) return incomingStatus;
  return existingStatus;
}

function mergeNotes(existingNotes, incomingNotes) {
  const cleanIncoming = String(incomingNotes || "").trim();
  if (!cleanIncoming) return existingNotes || null;

  const cleanExisting = String(existingNotes || "").trim();
  if (!cleanExisting) return cleanIncoming;
  if (cleanExisting.includes(cleanIncoming)) return cleanExisting;

  return `${cleanExisting}\n\n${cleanIncoming}`;
}

function mergeTrackedJob(existingRow, incoming) {
  return {
    company: existingRow.company || incoming.company,
    role: existingRow.role || incoming.role,
    status: resolveStatus(existingRow.status, incoming.status),
    interviewDate: incoming.interviewDate || existingRow.interview_date || null,
    notes: mergeNotes(existingRow.notes, incoming.notes),
    applicationDate: existingRow.application_date || incoming.applicationDate,
  };
}

module.exports = {
  buildLockKey,
  findExactDuplicate,
  findFuzzyDuplicate,
  mergeTrackedJob,
  normalizeTrackedJobInput,
};
