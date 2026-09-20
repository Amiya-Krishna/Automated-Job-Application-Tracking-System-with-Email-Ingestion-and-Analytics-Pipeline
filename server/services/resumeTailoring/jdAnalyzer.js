// Job-description analysis. Normalises any JD source (extension capture,
// pasted text, tracked job, engine job) into ONE structure, and derives a list
// of requirements where every requirement is grounded in a literal quote from
// the JD. Deterministic on purpose: an LLM "extraction" could invent
// requirements, and this step feeds the matcher.
//
// The original (sanitised) JD text is always returned alongside the parsed
// structure so it can be verified against.

const crypto = require("crypto");
const { sanitizeJobDescription, normalizeForCompare } = require("./textSanitize");
const { findSkillMentions, getSkill, literalTermRegex } = require("./skillTaxonomy");
const { LIMITS, REQ_WEIGHT } = require("./constants");

const H = {
  required: /^(?:(?:basic|minimum|required|key|core|essential)\s+)?(?:requirements?|qualifications?|skills?(?:\s+(?:and|&)\s+(?:qualifications?|experience))?|must[- ]haves?)$|^(?:requirements?|qualifications?)\s+(?:and|&)\s+(?:qualifications?|requirements?)$|^what you(?:'|’)?ll need|^what we(?:'|’)?re looking for|^who you are|^you have|^you(?:'|’)?ll bring|^about you|^your profile|^what you bring|^ideal candidate|^skills required|^technical skills|^eligibility/i,
  preferred: /^(?:preferred|desired|bonus|additional)\b|^nice[- ]to[- ]haves?|^good to have|^extra credit|^plus(?:es)?$|^it(?:'|’)?s a plus|^bonus points/i,
  responsibilities: /^(?:key\s+)?(?:responsibilities|duties)|^what you(?:'|’)?ll do|^what you will do|^the role$|^role$|^your impact|^in this role|^day[- ]to[- ]day|^what the (?:role|job) involves|^job description$|^the opportunity$|^about the role|^about the job|^overview$/i,
  ignore: /^(?:benefits|perks|compensation|salary|about (?:us|the company|the team|our)|who we are|equal opportunity|eeo|why join|how to apply|our (?:culture|values|mission)|working hours|what we offer|life at)/i,
};

const BULLET = /^\s*(?:[•●▪◦‣∙·*]|[-–—](?=\s)|\d{1,2}[.)](?=\s))\s*/;

function headingType(line) {
  const t = line.trim().replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/[:：]\s*$/, "").trim();
  if (!t || t.length > 70 || BULLET.test(line) || /[.!?]$/.test(t)) return null;
  for (const key of ["preferred", "required", "responsibilities", "ignore"]) if (H[key].test(t)) return key;
  return null;
}

const PREFERRED_INLINE = /\b(preferred|nice to have|nice-to-have|a plus|is a plus|bonus|desirable|advantage|good to have)\b/i;
const REQUIRED_INLINE = /\b(required|must have|must-have|must|minimum|mandatory|essential|strong (?:knowledge|understanding|experience|proficiency))\b/i;
const YEARS_RE = /\b\d{1,2}\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b[^.\n]{0,100}/i;
const EDU_RE = /\b(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|bca|mca|degree|ph\.?\s?d|pursuing|currently enrolled|graduat\w+|computer science)\b/i;
const CUE_LIST_RE = /(?:experience (?:with|in|using)|proficien(?:t|cy) (?:in|with)|knowledge of|familiarity with|familiar with|hands-on (?:experience )?(?:with|in)|such as|e\.g\.?,?|including)\s+([^.;\n]{3,160})/gi;

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const TYPE_RANK = { required: 3, mentioned: 2, preferred: 1 };

/** Tech-shaped tokens after cue phrases that the taxonomy doesn't know. Literal-match only. */
function extractUnrecognized(line, knownNames) {
  const out = [];
  let m;
  CUE_LIST_RE.lastIndex = 0;
  while ((m = CUE_LIST_RE.exec(line))) {
    for (let item of m[1].split(/,|\bor\b|\band\b|\/|&/)) {
      item = item.trim().replace(/^(?:and|or)\s+/i, "").replace(/[()]/g, "").trim();
      if (!item || item.split(/\s+/).length > 3 || item.length < 2 || item.length > 30) continue;
      const shaped = /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(item) || /[0-9]/.test(item) && /[A-Za-z]/.test(item) || /[.+#]/.test(item) && /[A-Za-z]/.test(item) || /^[A-Z]{2,6}$/.test(item);
      if (!shaped) continue;
      if (knownNames.has(item.toLowerCase())) continue;
      out.push(item);
    }
  }
  return out;
}

/**
 * @param {object} input {title, company, location, description, sourceUrl?, externalJobId?, sourceName?}
 */
function analyzeJobDescription(input = {}) {
  const san = sanitizeJobDescription(input.description, { maxChars: LIMITS.MAX_JD_CHARS });
  const text = san.text;
  const title = clip(input.title || input.role, 200);
  const company = clip(input.company, 200);
  const location = clip(input.location, 200) || null;

  const lines = text.split("\n").map((l) => l.trim());
  const hasHeadings = lines.some((l) => headingType(l));

  let section = hasHeadings ? "preamble" : "flat";
  const bySkill = new Map(); // id -> aggregate
  const literal = new Map(); // lowerTerm -> aggregate
  const responsibilities = [];
  const qualifications = [];
  const experienceRequirements = [];
  const educationRequirements = [];
  const knownNames = new Set();

  const note = (map, key, meta, type, quote, source) => {
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...meta, type, quote: clip(quote, 220), sources: new Set([source]), surfaces: new Set(meta.surface ? [meta.surface] : []), count: 1 });
    } else {
      cur.count += 1;
      cur.sources.add(source);
      if (meta.surface) cur.surfaces.add(meta.surface);
      if (TYPE_RANK[type] > TYPE_RANK[cur.type]) { cur.type = type; cur.quote = clip(quote, 220); }
    }
  };

  // Skills named in the title are requirements by definition.
  for (const m of findSkillMentions(title)) note(bySkill, m.id, { id: m.id, surface: m.surface }, "required", title, "JD.title");

  for (const rawLine of lines) {
    if (!rawLine) continue;
    const ht = headingType(rawLine);
    if (ht) { section = ht; continue; }
    if (section === "ignore") continue;

    const line = rawLine.replace(BULLET, "").trim();
    if (!line) continue;

    let type;
    if (section === "required") type = "required";
    else if (section === "preferred") type = "preferred";
    else type = "mentioned";
    if (PREFERRED_INLINE.test(line)) type = "preferred";
    else if (type === "mentioned" && REQUIRED_INLINE.test(line)) type = "required";

    const srcLabel = section === "required" ? "JD.requiredSkills" : section === "preferred" ? "JD.preferredSkills" : section === "responsibilities" ? "JD.responsibilities" : "JD.description";

    if (section === "responsibilities" && BULLET.test(rawLine)) responsibilities.push(clip(line, 300));
    else if (section === "responsibilities" && line.length > 20) responsibilities.push(clip(line, 300));
    if (section === "required" && line.length > 3) qualifications.push(clip(line, 300));

    const y = line.match(YEARS_RE);
    if (y && section !== "ignore") experienceRequirements.push(clip(line, 300));
    if (EDU_RE.test(line) && line.length < 260) educationRequirements.push(clip(line, 300));

    for (const m of findSkillMentions(line)) {
      knownNames.add(m.surface.toLowerCase());
      knownNames.add(m.name.toLowerCase());
      note(bySkill, m.id, { id: m.id, surface: m.surface }, type, line, srcLabel);
    }
  }
  // second pass: literal tech tokens the taxonomy doesn't know (after cue phrases)
  for (const rawLine of lines) {
    if (!rawLine || headingType(rawLine)) continue;
    const line = rawLine.replace(BULLET, "").trim();
    for (const item of extractUnrecognized(line, knownNames)) {
      const type = PREFERRED_INLINE.test(line) ? "preferred" : "mentioned";
      note(literal, item.toLowerCase(), { term: item, surface: item }, type, line, "JD.description");
    }
  }

  const requirements = [];
  for (const agg of bySkill.values()) {
    const sk = getSkill(agg.id);
    requirements.push({
      id: `req_${agg.id}`,
      requirement: sk.name,
      canonical: sk.id,
      recognized: true,
      type: agg.type,
      weight: REQ_WEIGHT[agg.type],
      source: [...agg.sources][0],
      surfaceForms: [...agg.surfaces],
      quote: agg.quote,
      occurrences: agg.count,
    });
  }
  let litCount = 0;
  for (const agg of literal.values()) {
    if (litCount >= 8) break;
    litCount += 1;
    requirements.push({
      id: `req_lit_${agg.term.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      requirement: agg.term,
      canonical: null,
      recognized: false,
      type: agg.type,
      weight: REQ_WEIGHT[agg.type] * 0.6,
      source: [...agg.sources][0],
      surfaceForms: [...agg.surfaces],
      quote: agg.quote,
      occurrences: agg.count,
    });
  }
  const order = { required: 0, mentioned: 1, preferred: 2 };
  requirements.sort((a, b) => order[a.type] - order[b.type] || b.occurrences - a.occurrences || a.requirement.localeCompare(b.requirement));

  const byType = (t) => requirements.filter((r) => r.type === t).map((r) => r.requirement);
  const haystack = `${title} ${text.slice(0, 2500)}`;
  const employmentType = /\binternship\b|\bintern\b/i.test(haystack)
    ? "Internship"
    : /\bfull[- ]time\b/i.test(haystack) ? "Full-time"
    : /\bpart[- ]time\b/i.test(haystack) ? "Part-time"
    : /\bcontract(?:or)?\b/i.test(haystack) ? "Contract"
    : /\bfreelance\b/i.test(haystack) ? "Freelance" : null;

  const jd = {
    title,
    company,
    location,
    employmentType,
    description: text,
    responsibilities: [...new Set(responsibilities)].slice(0, 25),
    requiredSkills: [...byType("required"), ...byType("mentioned")],
    preferredSkills: byType("preferred"),
    qualifications: [...new Set(qualifications)].slice(0, 25),
    experienceRequirements: [...new Set(experienceRequirements)].slice(0, 10),
    educationRequirements: [...new Set(educationRequirements)].slice(0, 10),
    keywords: requirements.map((r) => r.requirement).slice(0, 40),
  };

  const warnings = [];
  if (san.truncated) warnings.push("The job description was very long and was truncated for analysis.");
  if (san.removedInjectionLines.length) warnings.push("Some text in this job description looked like instructions to an AI system. It was ignored and had no effect.");
  if (!requirements.length) warnings.push("No specific skills or technologies were recognised in this description.");
  if (!hasHeadings) warnings.push("This description has no clear Requirements / Preferred sections, so skills are treated as “mentioned” rather than strictly required.");

  const jdHash = crypto
    .createHash("sha256")
    .update(normalizeForCompare(`${title}|${company}|${text}`))
    .digest("hex");

  return {
    jd,
    requirements,
    jdHash,
    warnings,
    removedInjectionLines: san.removedInjectionLines,
    sufficient: text.length >= LIMITS.MIN_JD_CHARS && (requirements.length > 0 || text.split(/\s+/).length >= 40),
  };
}

module.exports = { analyzeJobDescription, headingType, literalTermRegex };
