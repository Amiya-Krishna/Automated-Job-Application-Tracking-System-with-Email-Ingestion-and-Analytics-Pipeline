const crypto = require("crypto");
const natural = require("natural");

const STOPWORDS = new Set(natural.stopwords);

function normalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str = "") {
  return normalize(str)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function contentHash({ title, company, description }) {
  const base = `${normalize(title)}|${normalize(company)}|${normalize(
    description
  ).slice(0, 500)}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

// Jaro-Winkler via `natural`'s implementation
function titleSimilarity(a, b) {
  return natural.JaroWinklerDistance(normalize(a), normalize(b), {});
}

module.exports = { normalize, tokenize, contentHash, titleSimilarity, STOPWORDS };
