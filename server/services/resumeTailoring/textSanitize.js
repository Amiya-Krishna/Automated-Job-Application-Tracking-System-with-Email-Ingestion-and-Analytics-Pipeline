// Sanitization + prompt-injection screening for the two untrusted inputs of
// this feature: job descriptions and resumes. Both are DATA, never
// instructions. Nothing in this file "trusts" either input; it only makes
// the text safe to analyse and flags text that tries to talk to an AI.
const { stripHtml } = require("../textUtils");

const ZERO_WIDTH_AND_BIDI = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Private-use glyphs that PDF/Word bullet fonts (Symbol, Wingdings) extract as.
const PUA_BULLETS = /[\uF0A7\uF0B7\uF076\uF0D8\uF0FC\uF0A8\uF06E\uF0E0]/g;

// Patterns are intentionally aimed at text that addresses a model/system,
// so ordinary job-description prose ("Add value to the team") is not flagged.
const INJECTION_PATTERNS = [
  { id: "ignore_instructions", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|system|your)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|guidelines?|constraints?)\b/i },
  { id: "system_prompt", re: /\b(system prompt|developer message|system message|jailbreak)\b/i },
  { id: "role_switch", re: /\byou are (now |no longer )?(an? |the )?(ai|assistant|chatbot|language model|llm|gpt|resume (writer|optimi[sz]er))\b/i },
  { id: "model_address", re: /\b(ai|llm|language model|chatgpt|gpt-?\d?|claude|assistant|resume (parser|screening|scanner)|applicant tracking system|ats)\b[^.\n]{0,60}\b(must|should|please|ignore|insert|rank|score|prioriti[sz]e|approve|hire|recommend)\b/i },
  { id: "fabricate_directive", re: /\b(add|insert|include|inject|append|claim|invent|fabricate|pretend|state|list)\b[^.\n]{0,50}\b(experience|skills?|certifications?|proficien\w+|years|projects?|degree)\b[^.\n]{0,40}\b(even if|regardless|anyway|although|if (?:they|you|the candidate) (?:do not|don't|dont|lack))\b/i },
  { id: "hidden_marker", re: /(<\s*\/?\s*(system|assistant|instruction|prompt)\s*>|\[\s*\/?\s*INST\s*\]|<\|im_(start|end)\|>|^#{2,}\s*(system|instructions?)\b)/im },
  { id: "do_not_reveal", re: /\bdo not (reveal|mention|tell|disclose)\b[^.\n]{0,40}\b(instruction|prompt|this (text|message))\b/i },
];

function detectInjection(text = "") {
  const hits = [];
  for (const { id, re } of INJECTION_PATTERNS) {
    const m = String(text).match(re);
    if (m) hits.push({ id, excerpt: m[0].slice(0, 120) });
  }
  return hits;
}

function baseClean(input) {
  let t = String(input ?? "");
  t = t.normalize("NFKC");
  t = t.replace(/\r\n?/g, "\n");
  t = t.replace(ZERO_WIDTH_AND_BIDI, "");
  t = t.replace(CONTROL_CHARS, "");
  t = t.replace(PUA_BULLETS, "•");
  // pdf-parse page markers, e.g. "-- 1 of 2 --"
  t = t.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/ *\n */g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * Sanitize a resume. Injection-looking lines are KEPT (they are the user's
 * own data and must round-trip unchanged) but reported, and the tailoring
 * engine refuses to hand such lines to an LLM (see engine.isSuspicious).
 */
function sanitizeResumeText(input, { maxChars = 40_000 } = {}) {
  let text = baseClean(input);
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  const suspiciousLines = text
    .split("\n")
    .map((line, i) => ({ line: i, hits: detectInjection(line) }))
    .filter((x) => x.hits.length)
    .map((x) => ({ line: x.line, signals: x.hits.map((h) => h.id) }));
  return { text, truncated, suspiciousLines };
}

/**
 * Sanitize a job description: strip markup (reusing the repo's stripHtml,
 * which already handles script/style/entity edge cases), normalize, then
 * DROP any line that looks like an instruction to an AI so it can never
 * influence requirement extraction. Dropped lines are reported.
 */
function sanitizeJobDescription(input, { maxChars = 30_000 } = {}) {
  const raw = String(input ?? "");
  const looksHtml = /<\/?[a-z][\s\S]*?>/i.test(raw);
  let text = baseClean(looksHtml ? stripHtml(raw) : raw);
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  const kept = [];
  const removed = [];
  for (const line of text.split("\n")) {
    const hits = detectInjection(line);
    if (hits.length) removed.push({ excerpt: line.slice(0, 160), signals: hits.map((h) => h.id) });
    else kept.push(line);
  }
  return {
    text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    truncated,
    removedInjectionLines: removed,
  };
}

/** Whitespace/quote/dash-insensitive form used when comparing texts. */
function normalizeForCompare(s = "") {
  return String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  sanitizeResumeText,
  sanitizeJobDescription,
  detectInjection,
  normalizeForCompare,
  baseClean,
};
