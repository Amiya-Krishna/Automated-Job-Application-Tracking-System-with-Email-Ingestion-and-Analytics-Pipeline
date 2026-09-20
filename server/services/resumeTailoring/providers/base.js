// AIProvider abstraction. The application is not coupled to any vendor: it
// only ever talks to this interface.
//
//   analyzeResume(rawText)                -> { profile, facts, quality }
//   analyzeJobDescription(input)          -> { jd, requirements, ... }
//   matchResumeToJob(requirements, facts) -> { score, results, ... }
//   generateTailoring(request)            -> { rewrites: [{unitId, proposed}] }
//   validateTailoring({ ... })            -> { ok, violations }
//
// The base class implements every stage deterministically. That is a
// deliberate safety + cost decision: parsing, JD analysis, matching and
// VALIDATION never depend on a model (a model must not be its own fabrication
// judge). Only generateTailoring may be overridden by an LLM-backed provider,
// and its output is always re-checked by validateTailoring().

const { parseResume } = require("../resumeParser");
const { analyzeJobDescription } = require("../jdAnalyzer");
const { matchRequirements } = require("../matcher");
const { validateRewrite } = require("../evidenceValidator");

class AIProvider {
  get name() { return "deterministic"; }
  get model() { return null; }
  get usesLLM() { return false; }

  async analyzeResume(rawText) { return parseResume(rawText); }
  async analyzeJobDescription(input) { return analyzeJobDescription(input); }
  async matchResumeToJob(requirements, facts) { return matchRequirements(requirements, facts); }
  // Deterministic provider proposes no rewrites; reordering is done by the engine.
  // eslint-disable-next-line no-unused-vars
  async generateTailoring(request) { return { rewrites: [], usage: null }; }
  validateTailoring(args) { return validateRewrite(args); }
}

module.exports = { AIProvider };
