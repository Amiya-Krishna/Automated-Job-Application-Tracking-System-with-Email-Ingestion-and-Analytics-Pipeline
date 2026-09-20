// No-fabrication validator. Every proposed rewrite (from an LLM or anywhere
// else) must pass this before it can become a change the user is shown.
//
// Principle: a rewrite may only use information that is ALREADY in its own
// "support" text —
//   * bullets:  the bullet itself + that entry's header line(s) + tech line
//   * summary:  the whole resume
// It is NOT enough for a term to exist somewhere else in the resume when
// rewriting a bullet: that would let "Docker" (used in one project) leak into
// a different project's bullet, which is a fabricated claim about that
// project.
//
// The check is intentionally conservative (strict). It rejects:
//   missing_requirement  a JD requirement the resume doesn't support
//   unsupported_skill    any taxonomy skill/tool not in the support text
//   invented_number      any number/metric/quantity not in the support text
//   unsupported_entity   a proper noun (company, product, client) not in support
//   claim_strength       expertise/seniority/leadership/outcome wording not in support
//   novel_wording        any other content word outside support + a small
//                        allowlist of neutral verbs/nouns
//   prompt_injection_artifact, multi_line, empty, too_long
// A rejected rewrite simply falls back to the user's original text.

const natural = require("natural");
const { findSkillMentions, literalTermRegex } = require("./skillTaxonomy");
const { detectInjection } = require("./textSanitize");

const stem = (w) => natural.PorterStemmer.stem(w.toLowerCase());

// Small, deliberately boring vocabulary that can be used in a rewrite without
// asserting anything new about the person. Verbs that assert design
// responsibility, ownership, deployment, optimisation or results
// (designed, architected, deployed, optimized, improved, led, ...) are NOT
// here: they change what the user is claiming to have done.
const NEUTRAL_WORDS = new Set(`
  built build building developed develop developing created create creating
  implemented implement implementing wrote write writing written worked work working
  used use using added add adding fixed fix fixing made make making applied
  integrated integrate integrating connected handled helped help contributed
  contribute participated collaborated supported tested test testing coded coding
  programmed set setup configured maintained updated update updating
  application applications app apps feature features website websites site page pages
  project projects system systems tool tools component components module modules
  interface interfaces code data report reports layout layouts bug bugs issue issues
  screen screens team teams company internal public request requests based
  also both each other new existing several various multiple different
`.split(/\s+/).filter(Boolean));
const NEUTRAL_STEMS = new Set([...NEUTRAL_WORDS].map(stem));

const CLAIM_WORDS = new Set(`
  expert expertise advanced extensive extensively senior lead led leading leader leadership
  manage managed managing mentor mentored architect architected spearhead spearheaded
  owned ownership proficient proficiency fluent mastery seasoned deep strong robust scalable
  enterprise production mission-critical cutting-edge world-class award-winning years
  successfully improved increased reduced decreased optimized optimised boosted accelerated
  streamlined enhanced delivered drove achieved launched deployed shipped scaled automated
  secured cut saved grew engineered pioneered transformed revamped overhauled
  designed design production-grade high-performance high-quality highly
`.split(/\s+/).filter(Boolean));
const CLAIM_STEMS = new Set([...CLAIM_WORDS].map(stem));

const STOP = new Set([...natural.stopwords, "via", "per", "etc", "eg", "ie", "vs", "its", "into", "within"]);

const NUMBER_WORDS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozens?|hundreds|thousands|millions|double|doubled|triple|tripled|half|twice|zero)\b/gi;
const NUMBER_TOKENS = /\d[\d,]*(?:\.\d+)?\s*(?:%|x\b|k\b|m\b|b\b|\+)?/gi;

function maskSkillSpans(text) {
  const spans = findSkillMentions(text);
  let out = text;
  // Replace from the end so indexes stay valid. Skill surfaces are masked
  // because they are validated by taxonomy id, not by word.
  for (const m of [...spans].reverse()) out = out.slice(0, m.index) + " ".repeat(m.surface.length) + out.slice(m.index + m.surface.length);
  return out;
}

function numbersIn(text) {
  const masked = maskSkillSpans(text);
  const set = new Set();
  for (const m of masked.matchAll(NUMBER_TOKENS)) set.add(m[0].toLowerCase().replace(/[,\s]/g, ""));
  for (const m of masked.matchAll(NUMBER_WORDS)) set.add(m[0].toLowerCase());
  return set;
}

function wordsIn(text) {
  return (text.match(/[A-Za-z](?:[A-Za-z'’-]*[A-Za-z])?/g) || []);
}

/**
 * @param {object} p
 * @param {string} p.proposed        text to validate
 * @param {string} p.original        the user's original text of this unit
 * @param {string} p.support         text this rewrite is allowed to draw facts from
 * @param {string[]} [p.forbiddenTerms] JD requirements the resume does NOT support
 * @param {"summary"|"bullet"} [p.kind]
 * @returns {{ok:boolean, violations:{code:string, detail:string}[]}}
 */
function validateRewrite({ proposed, original, support, forbiddenTerms = [], kind = "bullet" }) {
  const violations = [];
  const bad = (code, detail) => violations.push({ code, detail });

  if (typeof proposed !== "string" || !proposed.trim()) return { ok: false, violations: [{ code: "empty", detail: "Proposed text is empty." }] };
  const text = proposed.trim();
  if (/\n/.test(text)) bad("multi_line", "Proposed text spans multiple lines.");
  if (kind === "bullet" && text.length > Math.max(60, original.length * 1.4 + 25)) bad("too_long", "Proposed text is much longer than the original.");
  if (kind === "summary" && text.length > Math.max(200, original.length * 1.4 + 40)) bad("too_long", "Proposed summary is much longer than the original.");

  for (const h of detectInjection(text)) bad("prompt_injection_artifact", `Looks like an instruction to an AI ("${h.excerpt}").`);

  // 1. JD requirements the resume doesn't support must not be asserted.
  for (const term of forbiddenTerms) {
    if (!term) continue;
    const re = literalTermRegex(term);
    if (re.test(text) && !re.test(support)) bad("missing_requirement", `“${term}” is required by the job but is not supported by your resume.`);
  }

  // 2. Every taxonomy skill/tool in the proposal must exist in the support text.
  const supportIds = new Set(findSkillMentions(support).map((m) => m.id));
  for (const m of findSkillMentions(text)) {
    if (!supportIds.has(m.id)) bad("unsupported_skill", `“${m.surface}” does not appear in the source text for this item.`);
  }

  // 3. Numbers / quantities / metrics.
  const supportNums = numbersIn(support);
  for (const n of numbersIn(text)) if (!supportNums.has(n)) bad("invented_number", `The figure “${n}” is not in the source text.`);

  // 4. Remaining words: must come from the support text or the neutral list.
  const masked = maskSkillSpans(text);
  const supportStems = new Set(wordsIn(support).map(stem));
  const seen = new Set();
  const tokens = wordsIn(masked);
  tokens.forEach((tok, i) => {
    const lower = tok.toLowerCase();
    if (lower.length < 3 || STOP.has(lower)) return;
    const st = stem(tok);
    if (supportStems.has(st) || NEUTRAL_STEMS.has(st) || seen.has(st)) return;
    seen.add(st);
    if (CLAIM_STEMS.has(st) || CLAIM_WORDS.has(lower)) bad("claim_strength", `“${tok}” asserts something that is not in your resume.`);
    else if (i > 0 && /^[A-Z]/.test(tok)) bad("unsupported_entity", `“${tok}” looks like a name/term that is not in your resume.`);
    else bad("novel_wording", `“${tok}” is not in the original text.`);
  });

  return { ok: violations.length === 0, violations };
}

module.exports = { validateRewrite, NEUTRAL_WORDS, numbersIn };
