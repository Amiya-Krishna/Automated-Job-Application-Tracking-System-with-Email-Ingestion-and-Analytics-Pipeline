// Deterministic resume parser: plain text -> ResumeProfile + evidence facts.
//
// Design rules that make the no-fabrication guarantee enforceable:
//   1. LOSSLESS   — every line of the source ends up somewhere in the profile
//                   (unknown sections and unclassified header lines are kept
//                   verbatim), so rendering the profile never drops content.
//   2. VERBATIM   — every text leaf (bullet, skill, summary, ...) is a span of
//                   the source text (only whitespace re-joined where a bullet
//                   wrapped over lines). Nothing is paraphrased at parse time.
//   3. TRACEABLE  — every leaf has a stable id ("exp1.b2", "skl1.i3") and is
//                   mirrored as a `fact` with the same id, source path and
//                   confidence 1.0, so downstream evidence can cite it.
//
// No LLM is involved: an LLM "parse" could itself hallucinate content, and
// then every later safety check would be validating against invented facts.

const { baseClean } = require("./textSanitize");
const { PARSER_VERSION } = require("./constants");

const HEADING_NAMES = {
  summary: ["summary", "professional summary", "career summary", "profile", "professional profile", "objective", "career objective", "about me", "about"],
  education: ["education", "academic background", "academics", "education and training", "education & training", "academic qualifications", "educational qualifications"],
  experience: ["experience", "work experience", "professional experience", "employment", "employment history", "work history", "internships", "internship", "internship experience", "industrial experience", "relevant experience", "professional background"],
  projects: ["projects", "personal projects", "academic projects", "selected projects", "key projects", "technical projects", "project experience", "side projects", "notable projects"],
  skills: ["skills", "technical skills", "core competencies", "technologies", "tech stack", "skills and tools", "skills & tools", "skills and technologies", "skills & technologies", "key skills", "technical proficiencies", "tools and technologies", "tools & technologies", "languages and technologies"],
  certifications: ["certifications", "certification", "licenses", "licenses and certifications", "certificates", "courses", "training", "courses and certifications", "certifications and courses"],
  achievements: ["achievements", "awards", "honors", "honours", "accomplishments", "awards and achievements", "awards & achievements", "honors and awards", "achievements and awards", "achievements & awards", "accolades"],
};
const HEADING_LOOKUP = new Map();
for (const [key, names] of Object.entries(HEADING_NAMES)) for (const n of names) HEADING_LOOKUP.set(n, key);

const BULLET_RE = /^\s*(?:[•●▪◦‣∙·▸►➢➤✓✔■□○*]|[-–—](?=\s)|\d{1,2}[.)](?=\s))\s*/;
const TECH_LINE_RE = /^(?:tech(?:nologies)?(?: stack)?|built with|stack|tools(?: used)?|technologies used)\s*[:\-–—]\s*\S/i;
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RANGE_RE = new RegExp(`(?:${MONTH}\\.?\\s+)?(?:19|20)\\d{2}\\s*(?:[-–—]|to)\\s*(?:(?:${MONTH}\\.?\\s+)?(?:19|20)\\d{2}|present|current|now|ongoing)`, "i");
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}(?!\d)/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/[^\s|,;]+|github\.com\/[^\s|,;]+|gitlab\.com\/[^\s|,;]+|[a-z0-9-]+\.(?:dev|io|me|app|xyz|vercel\.app|netlify\.app|github\.io)(?:\/[^\s|,;]*)?|https?:\/\/[^\s|,;]+)/i;

const isBullet = (line) => BULLET_RE.test(line);
const stripBullet = (line) => line.replace(BULLET_RE, "").trim();
const hasDateRange = (line) => DATE_RANGE_RE.test(line);
const endsSentence = (s) => /[.!?;:)\]"'”]$/.test(s.trim());
const words = (s) => s.trim().split(/\s+/).filter(Boolean);

function normHeading(line) {
  return line
    .toLowerCase()
    .replace(/[:•|_\-–—]+$/g, "")
    .replace(/[^a-z& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** -> "summary" | ... | "other" (unknown heading) | null (not a heading) */
function classifyHeading(line) {
  const t = line.trim();
  if (!t || t.length > 45 || isBullet(t)) return null;
  const known = HEADING_LOOKUP.get(normHeading(t));
  if (known) return known;
  // Unknown ALL-CAPS short line ("POSITIONS OF RESPONSIBILITY") = its own section.
  if (/^[A-Z][A-Z &/,'’-]{2,}$/.test(t) && words(t).length <= 5 && !/\d/.test(t) && !hasDateRange(t)) return "other";
  return null;
}

// ----------------------------------------------------------- entry parsing
function looksHeaderish(line) {
  return hasDateRange(line) || (line.length <= 80 && !endsSentence(line) && words(line).length <= 12);
}

/** Continuation of the previous bullet, or start of a new entry header? */
function startsNewEntry(line, { lastWasBlank, prevBullet }) {
  if (/^[a-z(\[,;]/.test(line)) return false; // wrapped sentence
  if (hasDateRange(line)) return true;
  if (lastWasBlank && line.length <= 110 && !endsSentence(line)) return true;
  if (!endsSentence(prevBullet) && line.length > 35) return false; // wrapped sentence
  return line.length <= 110 && !endsSentence(line);
}

function parseEntries(lines) {
  const sawGlyph = lines.some((l) => isBullet(l.trim()));
  const entries = [];
  let cur = null;
  let lastWasBlank = false;
  const fresh = () => ({ headerLines: [], bullets: [], tech: null });

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { lastWasBlank = true; continue; }
    const glyph = isBullet(line);

    if (glyph) {
      if (!cur) cur = fresh();
      cur.bullets.push({ text: stripBullet(line) });
      lastWasBlank = false;
      continue;
    }
    if (TECH_LINE_RE.test(line) && cur && !cur.tech) {
      cur.tech = line;
      lastWasBlank = false;
      continue;
    }
    if (!cur) {
      cur = fresh();
      cur.headerLines.push(line);
      lastWasBlank = false;
      continue;
    }

    if (!sawGlyph) {
      // No bullet glyphs anywhere in this section (e.g. some DOCX/PDF
      // extractions): classify each line as header-ish or as a bullet.
      if (cur.bullets.length === 0 && cur.headerLines.length < 3 && looksHeaderish(line)) {
        cur.headerLines.push(line);
      } else if (looksHeaderish(line) && cur.bullets.length > 0 && (hasDateRange(line) || lastWasBlank)) {
        entries.push(cur);
        cur = fresh();
        cur.headerLines.push(line);
      } else if (cur.bullets.length > 0 && !endsSentence(cur.bullets[cur.bullets.length - 1].text) && /^[a-z]/.test(line)) {
        cur.bullets[cur.bullets.length - 1].text += " " + line;
      } else {
        cur.bullets.push({ text: line });
      }
      lastWasBlank = false;
      continue;
    }

    if (cur.bullets.length === 0) {
      if (cur.headerLines.length < 3 && !(lastWasBlank && cur.headerLines.length >= 1 && hasDateRange(line))) {
        cur.headerLines.push(line);
      } else {
        entries.push(cur);
        cur = fresh();
        cur.headerLines.push(line);
      }
    } else if (startsNewEntry(line, { lastWasBlank, prevBullet: cur.bullets[cur.bullets.length - 1].text })) {
      entries.push(cur);
      cur = fresh();
      cur.headerLines.push(line);
    } else {
      cur.bullets[cur.bullets.length - 1].text += " " + line;
    }
    lastWasBlank = false;
  }
  if (cur) entries.push(cur);
  return entries.filter((e) => e.headerLines.length || e.bullets.length || e.tech);
}

// ----------------------------------------------------------------- skills
function splitSkillItems(s) {
  return s
    .split(/[,;|•·●▪]|\s{2,}/)
    .map((x) => x.trim().replace(/^and\s+/i, "").replace(/[.:]+$/, ""))
    .filter((x) => x && x.length <= 60);
}

function parseSkills(lines) {
  const groups = [];
  let loose = null;
  for (const raw of lines) {
    const line = stripBullet(raw.trim());
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z &/+#.()-]{1,40}?)\s*:\s*(.+)$/);
    if (m && splitSkillItems(m[2]).length) {
      loose = null;
      groups.push({ category: m[1].trim(), items: splitSkillItems(m[2]).map((text) => ({ text })) });
    } else {
      const items = splitSkillItems(line);
      if (!items.length) continue;
      if (!loose) { loose = { category: null, items: [] }; groups.push(loose); }
      loose.items.push(...items.map((text) => ({ text })));
    }
  }
  return groups;
}

// ---------------------------------------------------------------- header
function parseHeader(lines) {
  const personal = { name: null, contactItems: [], otherLines: [] };
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (!nonEmpty.length) return personal;

  let nameIdx = nonEmpty.findIndex(
    (l) => !EMAIL_RE.test(l) && !URL_RE.test(l) && !/\d{5,}/.test(l) && l.length <= 60 && !isBullet(l),
  );
  if (nameIdx === -1) nameIdx = 0;
  personal.name = nonEmpty[nameIdx];

  nonEmpty.forEach((line, idx) => {
    if (idx === nameIdx) return;
    const segs = line.split(/\s*[|•·●▪]\s*/).map((s) => s.trim()).filter(Boolean);
    let anyContact = false;
    const collected = [];
    for (const seg of segs) {
      if (EMAIL_RE.test(seg)) { collected.push({ type: "email", text: seg }); anyContact = true; }
      else if (URL_RE.test(seg)) { collected.push({ type: "link", text: seg }); anyContact = true; }
      else if (PHONE_RE.test(seg) && /\d{7,}/.test(seg.replace(/\D/g, "")) && seg.replace(/\D/g, "").length <= 15 && !/[a-z]{4,}/i.test(seg.replace(/\+?\d[\d\s().-]*/g, ""))) {
        collected.push({ type: "phone", text: seg }); anyContact = true;
      } else collected.push({ type: "text", text: seg });
    }
    if (anyContact || segs.length > 1) personal.contactItems.push(...collected);
    else personal.otherLines.push(line);
  });
  return personal;
}

// ------------------------------------------------------------------ main
/**
 * @returns {{ profile: object, facts: object[], quality: object }}
 */
function parseResume(rawInput) {
  const text = baseClean(rawInput);
  const lines = text.split("\n");

  // 1. split into sections
  const sections = []; // {key, title, lines}
  let header = [];
  let current = null;
  for (const line of lines) {
    const key = classifyHeading(line);
    if (key) {
      current = { key, title: line.trim().replace(/:$/, ""), lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
    else header.push(line);
  }

  const profile = {
    parserVersion: PARSER_VERSION,
    personalInfo: parseHeader(header),
    summary: null,
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: [],
    achievements: [],
    extraSections: [],
    sectionOrder: [],
  };

  let n = { edu: 0, exp: 0, prj: 0, skl: 0, crt: 0, ach: 0, ext: 0 };
  const nonBlank = (arr) => arr.map((l) => l.trim()).filter(Boolean);

  for (const sec of sections) {
    switch (sec.key) {
      case "summary": {
        const para = nonBlank(sec.lines).map(stripBullet).join(" ").trim();
        if (para && !profile.summary) {
          profile.summary = { id: "sum", title: sec.title, text: para };
          profile.sectionOrder.push("summary");
        }
        break;
      }
      case "education": {
        // entries separated by blank lines; every line is kept verbatim
        const entries = sec.lines.join("\n").split(/\n\s*\n/).map((b) => nonBlank(b.split("\n"))).filter((b) => b.length);
        entries.forEach((b) => {
          n.edu += 1;
          profile.education.push({ id: `edu${n.edu}`, lines: b.map((t, i) => ({ id: `edu${n.edu}.l${i + 1}`, text: stripBullet(t) })) });
        });
        if (!profile.sectionOrder.includes("education")) profile.sectionOrder.push("education");
        profile._eduTitle = sec.title;
        break;
      }
      case "experience":
      case "projects": {
        const isExp = sec.key === "experience";
        const list = isExp ? profile.experience : profile.projects;
        for (const e of parseEntries(sec.lines)) {
          const idx = isExp ? ++n.exp : ++n.prj;
          const id = `${isExp ? "exp" : "prj"}${idx}`;
          list.push({
            id,
            headerLines: e.headerLines.map((t, i) => ({ id: `${id}.h${i + 1}`, text: t })),
            tech: e.tech ? { id: `${id}.t`, text: e.tech } : null,
            bullets: e.bullets.map((b, i) => ({ id: `${id}.b${i + 1}`, text: b.text })),
          });
        }
        if (!profile.sectionOrder.includes(sec.key)) profile.sectionOrder.push(sec.key);
        profile[`_${sec.key}Title`] = sec.title;
        break;
      }
      case "skills": {
        for (const g of parseSkills(sec.lines)) {
          n.skl += 1;
          const id = `skl${n.skl}`;
          profile.skills.push({
            id,
            category: g.category,
            items: g.items.map((it, i) => ({ id: `${id}.i${i + 1}`, text: it.text })),
          });
        }
        if (!profile.sectionOrder.includes("skills")) profile.sectionOrder.push("skills");
        profile._skillsTitle = sec.title;
        break;
      }
      case "certifications":
      case "achievements": {
        const isCert = sec.key === "certifications";
        for (const l of nonBlank(sec.lines)) {
          const idx = isCert ? ++n.crt : ++n.ach;
          (isCert ? profile.certifications : profile.achievements).push({ id: `${isCert ? "crt" : "ach"}${idx}`, text: stripBullet(l) });
        }
        if (!profile.sectionOrder.includes(sec.key)) profile.sectionOrder.push(sec.key);
        profile[`_${sec.key}Title`] = sec.title;
        break;
      }
      default: {
        n.ext += 1;
        const id = `ext${n.ext}`;
        profile.extraSections.push({
          id,
          title: sec.title,
          lines: nonBlank(sec.lines).map((t, i) => ({ id: `${id}.l${i + 1}`, text: t })),
        });
        profile.sectionOrder.push(id);
      }
    }
  }

  // Original section titles are preserved for rendering (the user's own
  // wording is never renamed).
  profile.sectionTitles = {
    summary: profile.summary?.title || "Summary",
    education: profile._eduTitle || "Education",
    experience: profile._experienceTitle || "Experience",
    projects: profile._projectsTitle || "Projects",
    skills: profile._skillsTitle || "Skills",
    certifications: profile._certificationsTitle || "Certifications",
    achievements: profile._achievementsTitle || "Achievements",
  };
  for (const k of Object.keys(profile)) if (k.startsWith("_")) delete profile[k];

  const facts = buildFacts(profile);
  const quality = assessQuality(profile, facts);
  return { profile, facts, quality };
}

// ------------------------------------------------------------------ facts
function buildFacts(p) {
  const facts = [];
  const add = (kind, section, id, text, path, extra = {}) => {
    if (!text || !String(text).trim()) return;
    facts.push({ factKey: `fact_${facts.length + 1}`, unitId: id, kind, section, text: String(text).trim(), sourcePath: path, confidence: 1.0, ...extra });
  };
  if (p.summary) add("summary", "summary", p.summary.id, p.summary.text, "summary");
  p.education.forEach((e, ei) => e.lines.forEach((l, li) => add("education", "education", l.id, l.text, `education[${ei}].lines[${li}]`)));
  p.experience.forEach((e, ei) => {
    e.headerLines.forEach((h, hi) => add("experience_header", "experience", h.id, h.text, `experience[${ei}].headerLines[${hi}]`, { entryId: e.id }));
    if (e.tech) add("experience_tech", "experience", e.tech.id, e.tech.text, `experience[${ei}].tech`, { entryId: e.id });
    e.bullets.forEach((b, bi) => add("experience_bullet", "experience", b.id, b.text, `experience[${ei}].bullets[${bi}]`, { entryId: e.id }));
  });
  p.projects.forEach((e, ei) => {
    e.headerLines.forEach((h, hi) => add("project_header", "projects", h.id, h.text, `projects[${ei}].headerLines[${hi}]`, { entryId: e.id }));
    if (e.tech) add("project_tech", "projects", e.tech.id, e.tech.text, `projects[${ei}].tech`, { entryId: e.id });
    e.bullets.forEach((b, bi) => add("project_bullet", "projects", b.id, b.text, `projects[${ei}].bullets[${bi}]`, { entryId: e.id }));
  });
  p.skills.forEach((g, gi) => g.items.forEach((it, ii) => add("skill", "skills", it.id, it.text, `skills[${gi}].items[${ii}]`, { category: g.category })));
  p.certifications.forEach((c, i) => add("certification", "certifications", c.id, c.text, `certifications[${i}]`));
  p.achievements.forEach((a, i) => add("achievement", "achievements", a.id, a.text, `achievements[${i}]`));
  p.extraSections.forEach((s, si) => s.lines.forEach((l, li) => add("other", s.id, l.id, l.text, `extraSections[${si}].lines[${li}]`)));
  return facts;
}

function assessQuality(p, facts) {
  const bullets = facts.filter((f) => /_bullet$/.test(f.kind)).length;
  const skills = facts.filter((f) => f.kind === "skill").length;
  const sectionsFound = ["summary", "education", "experience", "projects", "skills", "certifications", "achievements"].filter((k) => p.sectionOrder.includes(k));
  const warnings = [];
  if (!p.experience.length && !p.projects.length) warnings.push("No Experience or Projects section was recognised.");
  if (bullets === 0) warnings.push("No bullet points were recognised.");
  if (!skills) warnings.push("No Skills section was recognised.");
  if (!p.personalInfo.name) warnings.push("Could not identify your name at the top.");
  // Reliable enough to tailor: there is real content to work with.
  const reliable = (p.experience.length + p.projects.length > 0 && bullets >= 2) || (skills >= 3 && facts.length >= 8);
  return { reliable, sectionsFound, counts: { facts: facts.length, bullets, skills, experience: p.experience.length, projects: p.projects.length }, warnings };
}

module.exports = { parseResume, classifyHeading, isBullet, PARSER_VERSION };
