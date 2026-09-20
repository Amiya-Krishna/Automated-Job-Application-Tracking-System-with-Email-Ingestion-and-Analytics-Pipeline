// Operations on a ResumeProfile. The tailoring output is ALWAYS expressed as
// a list of small, typed changes applied to the untouched original profile:
//
//   { op: "reorder", listPath, after: [ids] }   permute an existing list
//   { op: "rewrite", unitId, proposed }         replace the text of one unit
//
// There is deliberately no "add" or "remove" operation. Because the only ways
// to alter a profile are permuting existing items and rewording existing
// text units, structural fabrication (a new job, project, skill, degree...)
// is impossible by construction, and assertStructurallySound() re-verifies it
// on the final result as defence in depth.

const clone = (o) => JSON.parse(JSON.stringify(o));
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Resolve a listPath to the array it names inside `profile`, or null. */
function resolveList(profile, listPath) {
  if (listPath === "projects") return profile.projects;
  if (listPath === "skills") return profile.skills;
  const [ownerId, field] = listPath.split(".");
  if (field === "items") return profile.skills.find((g) => g.id === ownerId)?.items || null;
  if (field === "bullets") {
    const e = profile.experience.find((x) => x.id === ownerId) || profile.projects.find((x) => x.id === ownerId);
    return e ? e.bullets : null;
  }
  return null;
}

/** All rewritable text units (and skill items) keyed by id. */
function collectUnits(profile) {
  const units = new Map();
  if (profile.summary) {
    units.set(profile.summary.id, { id: profile.summary.id, kind: "summary", section: "summary", text: profile.summary.text, entryId: null, support: null });
  }
  for (const [list, kind, section] of [[profile.experience, "experience_bullet", "experience"], [profile.projects, "project_bullet", "projects"]]) {
    for (const e of list) {
      const support = [...e.headerLines.map((h) => h.text), e.tech?.text || ""].join(" \n ");
      for (const b of e.bullets) units.set(b.id, { id: b.id, kind, section, text: b.text, entryId: e.id, support });
    }
  }
  for (const g of profile.skills) for (const it of g.items) units.set(it.id, { id: it.id, kind: "skill", section: "skills", text: it.text, entryId: g.id, support: null });
  return units;
}

function setUnitText(profile, unitId, text) {
  if (profile.summary?.id === unitId) { profile.summary.text = text; return true; }
  for (const e of [...profile.experience, ...profile.projects]) {
    const b = e.bullets.find((x) => x.id === unitId);
    if (b) { b.text = text; return true; }
  }
  for (const g of profile.skills) {
    const it = g.items.find((x) => x.id === unitId);
    if (it) { it.text = text; return true; }
  }
  return false;
}

/** Apply changes to a deep copy of `profile`. Throws on any malformed change. */
function applyChanges(profile, changes) {
  const out = clone(profile);
  for (const c of changes) {
    if (c.op === "reorder") {
      const list = resolveList(out, c.listPath);
      if (!list) throw new Error(`reorder: unknown list ${c.listPath}`);
      const byId = new Map(list.map((x) => [x.id, x]));
      const ids = c.after;
      if (ids.length !== list.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
        throw new Error(`reorder: ${c.listPath} is not a permutation of the original list`);
      }
      list.splice(0, list.length, ...ids.map((id) => byId.get(id)));
    } else if (c.op === "rewrite") {
      if (!setUnitText(out, c.unitId, c.proposed)) throw new Error(`rewrite: unknown unit ${c.unitId}`);
    } else {
      throw new Error(`unknown change op: ${c.op}`);
    }
  }
  return out;
}

/**
 * Structural invariant: `result` may differ from `source` ONLY by
 *   - order of projects, skill groups, skill items, bullets within an entry
 *   - text of units listed in `allowedRewriteIds`
 * Everything else (contact info, education, certifications, achievements,
 * extra sections, section order/titles, experience order, entry headers,
 * tech lines, the set of bullets/skills/projects/jobs) must be identical.
 */
function assertStructurallySound(source, result, allowedRewriteIds = new Set()) {
  const v = [];
  const same = (label, a, b) => { if (!deepEqual(a, b)) v.push(`${label} was modified`); };

  same("personalInfo", source.personalInfo, result.personalInfo);
  same("education", source.education, result.education);
  same("certifications", source.certifications, result.certifications);
  same("achievements", source.achievements, result.achievements);
  same("extraSections", source.extraSections, result.extraSections);
  same("sectionOrder", source.sectionOrder, result.sectionOrder);
  same("sectionTitles", source.sectionTitles, result.sectionTitles);

  if (!!source.summary !== !!result.summary) v.push("summary was added or removed");
  else if (source.summary && source.summary.text !== result.summary.text && !allowedRewriteIds.has(source.summary.id)) v.push("summary text changed without an approved rewrite");

  // experience: same entries, same ORDER, same headers
  if (source.experience.length !== result.experience.length) v.push("experience entries were added or removed");
  else {
    source.experience.forEach((s, i) => {
      const r = result.experience[i];
      if (s.id !== r.id) v.push("experience entries were reordered");
      same(`${s.id} header`, s.headerLines, r.headerLines);
      same(`${s.id} tech`, s.tech, r.tech);
      checkBullets(s, r);
    });
  }
  // projects: same set of entries (order may change)
  if (source.projects.length !== result.projects.length || !sameIdSet(source.projects, result.projects)) v.push("project entries were added or removed");
  else {
    for (const s of source.projects) {
      const r = result.projects.find((x) => x.id === s.id);
      same(`${s.id} header`, s.headerLines, r.headerLines);
      same(`${s.id} tech`, s.tech, r.tech);
      checkBullets(s, r);
    }
  }
  // skills: same groups, same items per group (order may change; text only via allowed rewrite)
  if (!sameIdSet(source.skills, result.skills)) v.push("skill groups were added or removed");
  else {
    for (const s of source.skills) {
      const r = result.skills.find((x) => x.id === s.id);
      if (s.category !== r.category) v.push(`${s.id} category was renamed`);
      if (!sameIdSet(s.items, r.items)) v.push(`skills were added or removed in ${s.id}`);
      else for (const si of s.items) {
        const ri = r.items.find((x) => x.id === si.id);
        if (si.text !== ri.text && !allowedRewriteIds.has(si.id)) v.push(`skill "${si.text}" was renamed without an approved change`);
      }
    }
  }
  return { ok: v.length === 0, violations: v };

  function checkBullets(s, r) {
    if (!sameIdSet(s.bullets, r.bullets)) { v.push(`bullets were added or removed in ${s.id}`); return; }
    for (const sb of s.bullets) {
      const rb = r.bullets.find((x) => x.id === sb.id);
      if (sb.text !== rb.text && !allowedRewriteIds.has(sb.id)) v.push(`bullet ${sb.id} changed without an approved rewrite`);
    }
  }
}

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((x) => x.id));
  return b.every((x) => ids.has(x.id));
}

/** Short human label for an item, used in reorder before/after displays. */
function labelOf(item) {
  if (item.headerLines) return item.headerLines[0]?.text || item.id;
  if (item.items) return item.category ? `${item.category}: ${item.items.map((i) => i.text).join(", ")}` : item.items.map((i) => i.text).join(", ");
  return item.text || item.id;
}

module.exports = { clone, deepEqual, resolveList, collectUnits, applyChanges, assertStructurallySound, labelOf, setUnitText };
