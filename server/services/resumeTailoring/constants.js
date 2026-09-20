// Central constants for the Resume Tailoring feature.
// Bump PARSER_VERSION / TAXONOMY_VERSION whenever parsing or matching rules
// change: cached parses/analyses are keyed on them, so a bump invalidates
// stale cache entries instead of serving results from old rules.
module.exports = {
  PARSER_VERSION: "rp-1.0",
  TAXONOMY_VERSION: "tx-2026.09.1",
  VALIDATOR_VERSION: "ev-1.0",

  LIMITS: {
    MAX_RESUME_CHARS: 40_000,
    MIN_RESUME_CHARS: 150,
    MAX_JD_CHARS: 30_000,
    MIN_JD_CHARS: 120,
    MAX_UPLOAD_BYTES: 2 * 1024 * 1024, // 2 MB
    MAX_ZIP_UNCOMPRESSED_BYTES: 25 * 1024 * 1024,
    MAX_ZIP_ENTRIES: 500,
    MAX_PDF_PAGES: 8,
    MAX_REWRITE_UNITS: 14,
  },

  MATCH: { MATCHED: "MATCHED", PARTIAL: "PARTIAL_MATCH", NOT_FOUND: "NOT_FOUND" },

  // Weight of a requirement in the coverage score, by how the JD frames it.
  REQ_WEIGHT: { required: 1, mentioned: 0.8, preferred: 0.5 },
  // Credit for a match state. PARTIAL is deliberately worth half: related
  // experience is not the requested skill and is never claimed as such.
  STATE_CREDIT: { MATCHED: 1, PARTIAL_MATCH: 0.5, NOT_FOUND: 0 },

  VERSION_STATUS: { DRAFT: "draft", APPROVED: "approved", REJECTED: "rejected" },
  CHANGE_STATUS: { PENDING: "pending", ACCEPTED: "accepted", REJECTED: "rejected" },
  SESSION_STATUS: { QUEUED: "queued", RUNNING: "running", SUCCEEDED: "succeeded", FAILED: "failed" },

  MSG: {
    NO_RESUME: "Upload your resume before tailoring.",
    JD_TOO_SHORT: "The job description does not contain enough information.",
    PARSE_FAILED: "We couldn't reliably extract your resume.",
    NOT_FOUND_LABEL: "Missing / Not found in your profile",
    PARTIAL_LABEL: "Not currently supported by your resume",
  },
};
