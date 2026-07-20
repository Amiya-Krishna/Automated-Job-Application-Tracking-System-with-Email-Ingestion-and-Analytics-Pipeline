const { TfIdf } = require("natural");
const { tokenize, normalize } = require("./textUtils");
const { extractSkills } = require("./skills");

/**
 * Free-tier TF-IDF + keyword matcher.
 * corpusDescriptions: array of other job descriptions, used so IDF reflects
 * real term rarity across your scraped corpus (pass an empty array early on;
 * falls back to a 2-doc idf which is weaker but still functional).
 */
function scoreTfIdf(job, profile, corpusDescriptions = []) {
  const tfidf = new TfIdf();
  const corpus = [...corpusDescriptions, job.description];
  corpus.forEach((doc) => tfidf.addDocument(normalize(doc)));
  const jobIndex = corpus.length - 1;

  const jobTerms = {};
  tfidf.listTerms(jobIndex).forEach((t) => (jobTerms[t.term] = t.tfidf));

  const resumeTokens = new Set(tokenize(profile.resume_text || ""));

  let dot = 0, jobNorm = 0;
  for (const term in jobTerms) {
    jobNorm += jobTerms[term] ** 2;
    if (resumeTokens.has(term)) dot += jobTerms[term];
  }
  const resumeNorm = Math.sqrt(resumeTokens.size || 1);
  const similarity = jobNorm > 0 ? dot / (Math.sqrt(jobNorm) * resumeNorm) : 0;

  const jobSkills = extractSkills(job.description);
  const profileSkills = (profile.skills || []).map((s) => s.toLowerCase());
  const skillWeights = profile.skill_weights || {};

  const matchedSkills = jobSkills.filter((s) => profileSkills.includes(s));
  const missingSkills = jobSkills.filter((s) => !profileSkills.includes(s));

  // Learning-loop weighted skill boost (see learningService.js) instead of a
  // flat 1-point-per-skill boost — weights start at 1.0 and drift with outcomes.
  const weightedMatched = matchedSkills.reduce((sum, s) => sum + (skillWeights[s] ?? 1), 0);
  const weightedTotal = jobSkills.reduce((sum, s) => sum + (skillWeights[s] ?? 1), 0);
  const skillBoost = weightedTotal > 0 ? weightedMatched / weightedTotal : 0;

  const score = Math.round(Math.min(1, 0.6 * similarity + 0.4 * skillBoost) * 100 * 100) / 100;

  return {
    method: "tfidf",
    score,
    explanation: {
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      similarity: Math.round(similarity * 1000) / 1000,
      skill_boost: Math.round(skillBoost * 1000) / 1000,
    },
  };
}

/**
 * Advanced embedding-based matcher. `embedFn` is injected (e.g. an OpenAI /
 * Anthropic / local sentence-transformers call) so this file has no hard
 * dependency on a specific embeddings provider.
 * profile.resume_embedding must already be precomputed (see README).
 */
async function scoreEmbedding(job, profile, embedFn) {
  const jobEmbedding = await embedFn(job.description);
  const resumeEmbedding = profile.resume_embedding;
  if (!resumeEmbedding) {
    throw new Error("profile.resume_embedding not set — run the resume embed step first");
  }

  const dot = jobEmbedding.reduce((sum, v, i) => sum + v * resumeEmbedding[i], 0);
  const normJob = Math.sqrt(jobEmbedding.reduce((s, v) => s + v * v, 0));
  const normResume = Math.sqrt(resumeEmbedding.reduce((s, v) => s + v * v, 0));
  const cosineSim = dot / (normJob * normResume || 1);

  const score = Math.round(((cosineSim + 1) / 2) * 100 * 100) / 100; // map [-1,1] -> [0,100]

  const jobSkills = extractSkills(job.description);
  const profileSkills = (profile.skills || []).map((s) => s.toLowerCase());

  return {
    method: "embedding",
    score,
    explanation: {
      matched_skills: jobSkills.filter((s) => profileSkills.includes(s)),
      missing_skills: jobSkills.filter((s) => !profileSkills.includes(s)),
      embedding_similarity_raw: Math.round(cosineSim * 1000) / 1000,
    },
  };
}

module.exports = { scoreTfIdf, scoreEmbedding };
