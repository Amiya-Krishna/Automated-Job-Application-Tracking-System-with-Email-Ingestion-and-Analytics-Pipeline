// Deterministic matching of JD requirements against verified resume facts.
//
//   MATCHED        the requirement (or a taxonomy-equivalent alias) literally
//                  appears in the user's own text
//   PARTIAL_MATCH  no literal match, but the user has related evidence
//                  (Next.js for React, GCP for AWS). NEVER treated as having
//                  the skill; only used to explain and to give half credit.
//   NOT_FOUND      no supporting evidence at all
//
// Nothing here calls an LLM.

const { findSkillMentions, relation, literalTermRegex, getSkill } = require("./skillTaxonomy");
const { MATCH, STATE_CREDIT, MSG, LIMITS } = require("./constants");

const DEMONSTRATING = new Set(["experience_bullet", "project_bullet", "experience_tech", "project_tech", "experience_header", "project_header"]);

/** Index resume facts by the taxonomy skills they mention. */
function buildResumeIndex(facts) {
  const bySkill = new Map(); // skillId -> fact[]
  const enriched = facts.map((f) => {
    const skillIds = [...new Set(findSkillMentions(f.text).map((m) => m.id))];
    for (const id of skillIds) {
      if (!bySkill.has(id)) bySkill.set(id, []);
      bySkill.get(id).push(f);
    }
    return { ...f, skillIds };
  });
  return { facts: enriched, bySkill };
}

const evidenceOf = (f) => ({ factId: f.factKey, unitId: f.unitId, text: f.text, sourcePath: f.sourcePath, kind: f.kind });

function rankEvidence(list) {
  return [...list].sort((a, b) => Number(DEMONSTRATING.has(b.kind)) - Number(DEMONSTRATING.has(a.kind)));
}

function matchOne(req, index) {
  if (req.recognized) {
    const direct = index.bySkill.get(req.canonical) || [];
    if (direct.length) {
      const ranked = rankEvidence(direct);
      const demonstrated = ranked.some((f) => DEMONSTRATING.has(f.kind));
      return {
        state: MATCH.MATCHED,
        evidence: ranked.slice(0, 4).map(evidenceOf),
        strength: demonstrated ? "demonstrated" : "listed",
        note: demonstrated ? "Found in your project/experience text." : "Found in your skills/summary, but not tied to a project or role.",
      };
    }
    // related evidence -> PARTIAL only
    const related = [];
    const relatedNames = new Set();
    for (const [skillId, factsFor] of index.bySkill) {
      const rel = relation(req.canonical, skillId);
      if (rel === "implies" || rel === "family") {
        related.push(...factsFor);
        relatedNames.add(getSkill(skillId).name);
      }
    }
    if (related.length) {
      const uniq = [...new Map(related.map((f) => [f.factKey, f])).values()];
      const names = [...relatedNames].slice(0, 4).join(", ");
      return {
        state: MATCH.PARTIAL,
        evidence: rankEvidence(uniq).slice(0, 4).map(evidenceOf),
        strength: "related",
        relatedTerms: [...relatedNames],
        note: `You have related experience (${names}), but “${req.requirement}” itself is not on your resume.`,
      };
    }
    return { state: MATCH.NOT_FOUND, evidence: [], strength: "none", note: MSG.NOT_FOUND_LABEL };
  }

  // unrecognised (literal) requirement
  const re = literalTermRegex(req.requirement);
  const hits = index.facts.filter((f) => re.test(f.text));
  if (hits.length) {
    return { state: MATCH.MATCHED, evidence: rankEvidence(hits).slice(0, 4).map(evidenceOf), strength: hits.some((f) => DEMONSTRATING.has(f.kind)) ? "demonstrated" : "listed", note: "Found literally in your resume." };
  }
  return { state: MATCH.NOT_FOUND, evidence: [], strength: "none", note: MSG.NOT_FOUND_LABEL };
}

/**
 * @returns {{ score:number|null, results:object[], matchedSkills:string[], partialSkills:string[], missingSkills:string[] }}
 */
function matchRequirements(requirements, facts) {
  const index = buildResumeIndex(facts);
  const results = requirements.map((req) => ({ ...req, ...matchOne(req, index) }));

  let num = 0;
  let den = 0;
  for (const r of results) {
    den += r.weight;
    num += r.weight * STATE_CREDIT[r.state];
  }
  const score = den > 0 ? Math.round((num / den) * 100) : null;
  const names = (state) => results.filter((r) => r.state === state).map((r) => r.requirement);
  return {
    score,
    results,
    matchedSkills: names(MATCH.MATCHED),
    partialSkills: names(MATCH.PARTIAL),
    missingSkills: names(MATCH.NOT_FOUND),
    index,
  };
}

// ---------------------------------------------------------------- ATS
function titleRelevance(jdTitle, profile) {
  const stop = new Set(["the", "a", "an", "and", "of", "for", "to", "in", "at", "i", "ii", "iii", "junior", "senior", "sr", "jr", "intern", "internship", "trainee", "engineer", "developer"]);
  const tokens = (s) => String(s).toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !stop.has(t));
  const jdTok = [...new Set(tokens(jdTitle))];
  if (!jdTok.length) return { status: "warn", detail: "The job title has no distinctive keywords to compare." };
  const corpus = [
    ...profile.experience.flatMap((e) => e.headerLines.map((h) => h.text)),
    ...profile.projects.flatMap((e) => e.headerLines.map((h) => h.text)),
    profile.summary?.text || "",
  ].join(" ").toLowerCase();
  const hit = jdTok.filter((t) => corpus.includes(t));
  if (hit.length === jdTok.length) return { status: "pass", detail: "Your resume already uses the words in this job title." };
  if (hit.length) return { status: "warn", detail: `Partly aligned with the job title (found: ${hit.join(", ")}). Your titles are never changed.` };
  return { status: "warn", detail: "None of the job title's keywords appear in your titles or summary. TrackTrail will not rename your titles." };
}

function analyzeAts({ profile, rawText, jd, match, requirements }) {
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

  const req = match.results.filter((r) => r.type === "required" || r.type === "mentioned");
  const reqHit = req.filter((r) => r.state === MATCH.MATCHED).length;
  const allHit = match.results.filter((r) => r.state === MATCH.MATCHED).length;
  const reqPct = req.length ? Math.round((reqHit / req.length) * 100) : null;
  const allPct = match.results.length ? Math.round((allHit / match.results.length) * 100) : null;

  add("required_coverage", "Required skills coverage", reqPct === null ? "warn" : reqPct >= 70 ? "pass" : reqPct >= 40 ? "warn" : "fail",
    reqPct === null ? "No required skills were recognised in the job description." : `${reqHit} of ${req.length} required/mentioned skills are on your resume (${reqPct}%).`);
  add("keyword_coverage", "Keyword coverage", allPct === null ? "warn" : allPct >= 60 ? "pass" : allPct >= 35 ? "warn" : "fail",
    allPct === null ? "No keywords to compare." : `${allHit} of ${match.results.length} JD keywords are supported by your resume (${allPct}%). Missing keywords are never added.`);

  const tr = titleRelevance(jd.title, profile);
  add("title_relevance", "Job title relevance", tr.status, tr.detail);

  const have = (k) => profile.sectionOrder.includes(k);
  const missingSections = ["education", "skills"].filter((k) => !have(k)).concat(!have("experience") && !have("projects") ? ["experience or projects"] : []);
  add("section_structure", "Section structure", missingSections.length ? "warn" : "pass",
    missingSections.length ? `Standard section(s) not found: ${missingSections.join(", ")}.` : "Standard sections (Education, Skills, Experience/Projects) were found.");

  // terminology: resume uses an alias where JD uses a different spelling
  const mismatches = [];
  for (const r of match.results) {
    if (r.state !== MATCH.MATCHED || !r.recognized) continue;
    const jdForms = new Set(r.surfaceForms.map((s) => s.toLowerCase()));
    const resumeForms = new Set();
    for (const ev of r.evidence) for (const m of findSkillMentions(ev.text)) if (m.id === r.canonical) resumeForms.add(m.surface.toLowerCase());
    if (resumeForms.size && ![...resumeForms].some((f) => jdForms.has(f))) mismatches.push(`${[...resumeForms][0]} → ${r.surfaceForms[0]}`);
  }
  add("skill_terminology", "Skill terminology", mismatches.length ? "warn" : "pass",
    mismatches.length ? `Your resume uses different spellings than the JD: ${mismatches.slice(0, 5).join("; ")}.` : "Skill names match the job description's wording.");

  const bullets = [...profile.experience, ...profile.projects].flatMap((e) => e.bullets);
  const long = bullets.filter((b) => b.text.length > 220).length;
  const noVerb = bullets.filter((b) => !/^[A-Z][a-z]+(ed|ing)?\b/.test(b.text)).length;
  add("bullet_clarity", "Bullet clarity", long || noVerb > bullets.length / 2 ? "warn" : "pass",
    long ? `${long} bullet(s) run over ~220 characters; shorter bullets scan better.` : bullets.length ? "Bullets are a readable length." : "No bullets found to assess.");

  const wc = rawText.split(/\s+/).filter(Boolean).length;
  add("resume_length", "Resume length", wc > 900 ? "warn" : wc < 120 ? "warn" : "pass",
    wc > 900 ? `About ${wc} words — consider trimming to a page or two.` : wc < 120 ? `Only ${wc} words — recruiters may find this thin.` : `About ${wc} words.`);

  const fmtRisks = [];
  if (/\t| {4,}\S/.test(rawText) && rawText.split("\n").filter((l) => / {4,}\S/.test(l)).length > 6) fmtRisks.push("wide gaps suggest multi-column layout or tables");
  if (!profile.personalInfo.contactItems.some((c) => c.type === "email")) fmtRisks.push("no email address found in the header");
  add("formatting_risks", "Formatting risks", fmtRisks.length ? "warn" : "pass", fmtRisks.length ? `Possible ATS issues: ${fmtRisks.join("; ")}.` : "No obvious ATS parsing risks were detected in the extracted text.");

  const credit = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round((checks.reduce((s, c) => s + credit[c.status], 0) / checks.length) * 100);
  return { score, checks };
}

module.exports = { matchRequirements, buildResumeIndex, analyzeAts, LIMITS };
