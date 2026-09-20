// Tailoring engine.
//
//   1. deterministic changes (no model): reorder skills / projects / bullets by
//      relevance to supported requirements; align skill spelling to the JD
//      when the taxonomy says the two spellings are the same thing
//   2. optional AI rewrites (only if a provider that uses an LLM is
//      configured): every proposal is checked by the evidence validator; one
//      conservative retry for rejected units; anything still failing is
//      dropped and recorded as an "unsupported claim"
//   3. verifyResult(): re-proves that any final profile is "source + allowed
//      edits" before it is stored or exported.
//
// Reasons, evidence ids and validation status attached to every change are
// produced HERE from verified data — never copied from model output.

const { collectUnits, applyChanges, assertStructurallySound, labelOf, clone } = require("./profileOps");
const { findSkillMentions, relation, getSkill, literalTermRegex } = require("./skillTaxonomy");
const { validateRewrite } = require("./evidenceValidator");
const { detectInjection, normalizeForCompare } = require("./textSanitize");
const { LIMITS, MATCH, CHANGE_STATUS, VALIDATOR_VERSION } = require("./constants");

const listJoin = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`);

function makeRelevance(match) {
  const cache = new Map();
  const reqs = match.results;
  const skillScore = (id) => {
    if (cache.has(id)) return cache.get(id);
    let best = 0;
    for (const r of reqs) {
      if (!r.recognized) continue;
      const rel = relation(r.canonical, id);
      if (rel === "same") best = Math.max(best, r.weight);
      else if ((rel === "implies" || rel === "family") && r.state !== MATCH.MATCHED) best = Math.max(best, r.weight * 0.25);
    }
    cache.set(id, best);
    return best;
  };
  const literalReqs = reqs.filter((r) => !r.recognized);
  return (text) => {
    let sum = 0;
    for (const id of new Set(findSkillMentions(text).map((m) => m.id))) sum += skillScore(id);
    for (const r of literalReqs) if (literalTermRegex(r.requirement).test(text)) sum += r.weight;
    return sum;
  };
}

/** stable sort by descending score; returns ids */
function stableOrder(items, scoreOf) {
  return items
    .map((it, i) => ({ it, i, s: scoreOf(it) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
}

function buildTailoring({ profile, facts, match, resumeText, provider, log = () => {} }) {
  return (async () => {
    const relevance = makeRelevance(match);
    const factByUnit = new Map(facts.map((f) => [f.unitId, f.factKey]));
    const changes = [];
    const unsupportedClaims = [];
    const warnings = [];
    let seq = 0;
    const push = (c) => { changes.push({ id: `chg_${++seq}`, status: CHANGE_STATUS.PENDING, validation: { ok: true, by: "evidence-validator", version: VALIDATOR_VERSION }, ...c }); };

    // -------------------------------------------------- skills: item order
    for (const g of profile.skills) {
      if (g.items.length < 2) continue;
      const ranked = stableOrder(g.items, (it) => relevance(it.text));
      const after = ranked.map((r) => r.it.id);
      if (after.join() === g.items.map((i) => i.id).join()) continue;
      const moved = ranked.filter((r, newIdx) => r.s > 0 && newIdx < r.i).map((r) => r.it.text);
      push({
        section: "skills", op: "reorder", listPath: `${g.id}.items`,
        originalText: g.items.map((i) => i.text).join(", "),
        proposedText: ranked.map((r) => r.it.text).join(", "),
        before: g.items.map((i) => i.id), after,
        reason: `Moved ${listJoin(moved.slice(0, 4))} earlier${g.category ? ` in “${g.category}”` : ""} because ${moved.length > 1 ? "they match" : "it matches"} skills in the job description. No skills were added or removed.`,
        evidenceIds: ranked.filter((r) => r.s > 0).map((r) => factByUnit.get(r.it.id)).filter(Boolean),
        source: "deterministic",
      });
    }
    // group order
    if (profile.skills.length > 1) {
      const gScore = (g) => Math.max(0, ...g.items.map((i) => relevance(i.text)));
      const ranked = stableOrder(profile.skills, gScore);
      const after = ranked.map((r) => r.it.id);
      if (after.join() !== profile.skills.map((g) => g.id).join()) {
        push({
          section: "skills", op: "reorder", listPath: "skills",
          originalText: profile.skills.map(labelOf).join("\n"),
          proposedText: ranked.map((r) => labelOf(r.it)).join("\n"),
          before: profile.skills.map((g) => g.id), after,
          reason: "Moved the skill groups that contain the job's requested skills higher. No skills were added or removed.",
          evidenceIds: ranked.filter((r) => r.s > 0).flatMap((r) => r.it.items.map((i) => factByUnit.get(i.id))).filter(Boolean).slice(0, 12),
          source: "deterministic",
        });
      }
    }

    // ------------------------------------ skills: spelling alignment (alias)
    const renameTaken = new Map(profile.skills.map((g) => [g.id, new Set(g.items.map((i) => i.text.toLowerCase()))]));
    for (const g of profile.skills) {
      for (const it of g.items) {
        const ms = findSkillMentions(it.text);
        if (ms.length !== 1 || ms[0].surface.toLowerCase() !== it.text.trim().toLowerCase()) continue;
        const req = match.results.find((r) => r.recognized && r.canonical === ms[0].id && r.state === MATCH.MATCHED);
        if (!req || !req.surfaceForms.length) continue;
        if (req.surfaceForms.some((s) => s.toLowerCase() === it.text.trim().toLowerCase())) continue;
        const jdForm = req.surfaceForms[0];
        const proposed = jdForm === jdForm.toLowerCase() ? getSkill(ms[0].id).name : jdForm;
        if (proposed === it.text || renameTaken.get(g.id).has(proposed.toLowerCase())) continue;
        const check = validateSkillRename(it.text, proposed);
        if (!check.ok) continue;
        renameTaken.get(g.id).add(proposed.toLowerCase());
        push({
          section: "skills", op: "rewrite", unitId: it.id,
          originalText: it.text, proposedText: proposed,
          reason: `The job description writes this skill as “${proposed}”. Same skill, spelled the way the job (and its ATS) expects.`,
          evidenceIds: [factByUnit.get(it.id)].filter(Boolean), source: "deterministic",
        });
      }
    }

    // ----------------------------------------------------- projects order
    if (profile.projects.length > 1) {
      const entryText = (e) => [...e.headerLines.map((h) => h.text), e.tech?.text || "", ...e.bullets.map((b) => b.text)].join("\n");
      const ranked = stableOrder(profile.projects, (e) => relevance(entryText(e)));
      const after = ranked.map((r) => r.it.id);
      if (after.join() !== profile.projects.map((p) => p.id).join()) {
        const top = ranked[0];
        const skillNames = [...new Set(findSkillMentions(entryText(top.it)).filter((m) => relevance(m.surface) > 0).map((m) => m.name))].slice(0, 3);
        push({
          section: "projects", op: "reorder", listPath: "projects",
          originalText: profile.projects.map(labelOf).join("\n"),
          proposedText: ranked.map((r) => labelOf(r.it)).join("\n"),
          before: profile.projects.map((p) => p.id), after,
          reason: `Moved “${labelOf(top.it)}” higher${skillNames.length ? ` because it uses ${listJoin(skillNames)}, which the job asks for` : " because it is the most relevant to this job"}. Projects themselves are unchanged.`,
          evidenceIds: ranked.filter((r) => r.s > 0).map((r) => factByUnit.get(r.it.headerLines[0]?.id)).filter(Boolean),
          source: "deterministic",
        });
      }
    }

    // ------------------------------------------- bullets order within entry
    for (const [list, section] of [[profile.experience, "experience"], [profile.projects, "projects"]]) {
      for (const e of list) {
        if (e.bullets.length < 2) continue;
        const ranked = stableOrder(e.bullets, (b) => relevance(b.text));
        const after = ranked.map((r) => r.it.id);
        if (after.join() === e.bullets.map((b) => b.id).join()) continue;
        push({
          section, op: "reorder", listPath: `${e.id}.bullets`,
          originalText: e.bullets.map((b) => `• ${b.text}`).join("\n"),
          proposedText: ranked.map((r) => `• ${r.it.text}`).join("\n"),
          before: e.bullets.map((b) => b.id), after,
          reason: `Moved the bullets that mention skills the job asks for to the top of “${labelOf(e)}”. Wording is unchanged.`,
          evidenceIds: ranked.filter((r) => r.s > 0).map((r) => factByUnit.get(r.it.id)).filter(Boolean),
          source: "deterministic",
        });
      }
    }

    // ------------------------------------------------------- AI rewrites
    let aiStatus = provider.usesLLM ? "ok" : "not_configured";
    let aiUsage = null;
    let aiServedBy = null; // which provider actually answered (differs from the primary when a fallback was used)
    let aiFallbackUsed = false;
    if (provider.configNote) warnings.push(provider.configNote);

    const forbiddenTerms = [...new Set(match.results.filter((r) => r.state !== MATCH.MATCHED).flatMap((r) => [r.requirement, ...(r.surfaceForms || [])]))];
    const units = collectUnits(profile);
    const matchedReqs = match.results.filter((r) => r.state === MATCH.MATCHED);

    if (provider.usesLLM) {
      const cands = [];
      for (const u of units.values()) {
        if (u.kind === "skill") continue;
        if (detectInjection(u.text).length) continue; // never hand instruction-like text to a model
        const support = supportFor(u, resumeText);
        const supportIds = new Set(findSkillMentions(support).map((m) => m.id));
        const jdTerms = [...new Set(matchedReqs.filter((r) => r.recognized && supportIds.has(r.canonical)).flatMap((r) => r.surfaceForms))];
        const verifiedTerms = u.kind === "summary" ? [...new Set(findSkillMentions(u.text).map((m) => m.name))] : [...new Set(findSkillMentions(u.text + " " + (u.support || "")).map((m) => m.name))];
        const rel = relevance(u.text);
        if (u.kind !== "summary" && rel <= 0) continue;
        cands.push({ ...u, verifiedTerms, jdTerms: u.kind === "summary" ? jdTerms : jdTerms.filter((t) => supportIds.size), rel: u.kind === "summary" ? Number.MAX_SAFE_INTEGER : rel });
      }
      cands.sort((a, b) => b.rel - a.rel);
      const chosen = cands.slice(0, LIMITS.MAX_REWRITE_UNITS);
      const accepted = new Map();
      let pending = chosen;
      let feedback = [];

      for (let attempt = 0; attempt < 2 && pending.length; attempt += 1) {
        let resp;
        try {
          resp = await provider.generateTailoring({ units: pending, forbiddenTerms, conservative: attempt > 0, feedback });
          aiUsage = resp.usage || aiUsage;
          aiServedBy = resp.servedBy || aiServedBy;
          aiFallbackUsed = aiFallbackUsed || Boolean(resp.fallbackUsed);
        } catch (err) {
          aiStatus = "failed";
          warnings.push("AI rewriting was unavailable, so only reordering suggestions are shown. Your resume was not changed.");
          log("ai_failed", err.message);
          break;
        }
        const byId = new Map(pending.map((u) => [u.id, u]));
        const failedNow = new Map();
        const seen = new Set();
        for (const rw of resp.rewrites) {
          const unit = byId.get(rw.unitId);
          if (!unit || seen.has(rw.unitId)) continue; // unknown / duplicate unit ids are ignored
          seen.add(rw.unitId);
          if (normalizeForCompare(rw.proposed) === normalizeForCompare(unit.text)) continue; // no-op
          const res = provider.validateTailoring({
            proposed: rw.proposed, original: unit.text, support: supportFor(unit, resumeText), forbiddenTerms,
            kind: unit.kind === "summary" ? "summary" : "bullet",
          });
          if (res.ok) accepted.set(unit.id, { unit, proposed: rw.proposed.trim() });
          else failedNow.set(unit.id, { unit, proposed: rw.proposed, violations: res.violations });
        }
        // The retry is conservative and only covers units that failed.
        pending = [...failedNow.values()].map((f) => f.unit);
        feedback = [...failedNow.values()].map((f) => ({ unitId: f.unit.id, problems: f.violations.map((v) => v.code) }));
        if (attempt === 1 || !pending.length) {
          for (const f of failedNow.values()) {
            unsupportedClaims.push({ unitId: f.unit.id, section: f.unit.section, original: f.unit.text, proposed: f.proposed, violations: f.violations, source: "ai" });
          }
        }
      }

      for (const { unit, proposed } of accepted.values()) {
        const supportIds = new Set(findSkillMentions(proposed).map((m) => m.id));
        const names = matchedReqs.filter((r) => r.recognized && supportIds.has(r.canonical)).map((r) => r.requirement);
        push({
          section: unit.section, op: "rewrite", unitId: unit.id,
          originalText: unit.text, proposedText: proposed,
          reason: names.length
            ? `Reworded to make your existing ${listJoin(names.slice(0, 4))} experience clearer. Every skill and fact in the new wording was already in this item.`
            : "Reworded for clarity. Every skill and fact in the new wording was already in this item.",
          evidenceIds: [factByUnit.get(unit.id), ...entryHeaderFacts(profile, unit.entryId, factByUnit)].filter(Boolean),
          source: "ai",
        });
      }
    }

    const recommendations = buildRecommendations({ match, profile, changes });
    return { changes, unsupportedClaims, recommendations, warnings, aiStatus, aiUsed: provider.usesLLM && aiStatus === "ok", aiUsage, aiServedBy, aiFallbackUsed, forbiddenTerms };
  })();
}

function supportFor(unit, resumeText) {
  return unit.kind === "summary" ? resumeText : `${unit.text} \n ${unit.support || ""}`;
}

function entryHeaderFacts(profile, entryId, factByUnit) {
  if (!entryId) return [];
  const e = [...profile.experience, ...profile.projects].find((x) => x.id === entryId);
  return e ? e.headerLines.map((h) => factByUnit.get(h.id)) : [];
}

/** A skill rename is only allowed when it stays the SAME taxonomy skill. */
function validateSkillRename(original, proposed) {
  const a = findSkillMentions(original);
  const b = findSkillMentions(proposed);
  const ok = a.length === 1 && b.length === 1 && a[0].id === b[0].id && b[0].surface.length === proposed.trim().length;
  return { ok, violations: ok ? [] : [{ code: "unsupported_skill", detail: "Renamed skill is not the same skill." }] };
}

function buildRecommendations({ match, profile, changes }) {
  const recs = [];
  for (const r of match.results) {
    if (r.state === MATCH.NOT_FOUND) {
      recs.push({ type: "missing", requirement: r.requirement, message: `“${r.requirement}” is not on your resume, so it was not added. If you genuinely have this experience, add it to your profile or resume first.` });
    } else if (r.state === MATCH.PARTIAL) {
      recs.push({ type: "partial", requirement: r.requirement, message: `You have related experience (${(r.relatedTerms || []).slice(0, 3).join(", ")}), but not “${r.requirement}” itself. It was not claimed. Add it only if you have really used it.` });
    } else if (r.state === MATCH.MATCHED && r.strength === "listed") {
      recs.push({ type: "listed_only", requirement: r.requirement, message: `“${r.requirement}” appears only in your skills list. If you used it in a project or role, describe that in a bullet so recruiters can see it.` });
    }
  }
  if (!profile.summary) recs.push({ type: "no_summary", message: "Your resume has no summary, so none was written for you. Add one yourself if you want one." });
  if (!changes.length) recs.push({ type: "no_changes", message: "No safe improvements were found for this job. Your resume was left exactly as it is." });
  return recs;
}

/** Apply decisions ({changeId: "accepted"|"rejected"}); `include` picks which statuses to apply. */
function resolveProfile(sourceProfile, changes, { include }) {
  const applied = changes.filter((c) => include.includes(c.status));
  return { profile: applyChanges(sourceProfile, applied.map(toOp)), applied };
}

const toOp = (c) => (c.op === "reorder" ? { op: "reorder", listPath: c.listPath, after: c.after } : { op: "rewrite", unitId: c.unitId, proposed: c.proposedText });

/**
 * Re-prove that `result` is the source plus only allowed, validated edits.
 * Used before storing/approving/exporting. Returns { ok, violations }.
 */
function verifyResult({ source, result, applied, resumeText, forbiddenTerms }) {
  const rewriteIds = new Set(applied.filter((c) => c.op === "rewrite").map((c) => c.unitId));
  const structural = assertStructurallySound(source, result, rewriteIds);
  const violations = structural.violations.map((v) => ({ code: "structure", detail: v }));
  const units = collectUnits(source);
  for (const c of applied.filter((x) => x.op === "rewrite")) {
    const u = units.get(c.unitId);
    if (!u) { violations.push({ code: "structure", detail: `unknown unit ${c.unitId}` }); continue; }
    if (u.kind === "skill") {
      const r = validateSkillRename(u.text, c.proposedText);
      if (!r.ok) violations.push({ code: "unsupported_skill", detail: `${c.unitId}: ${r.violations[0].detail}` });
      continue;
    }
    const r = validateRewrite({ proposed: c.proposedText, original: u.text, support: supportFor(u, resumeText), forbiddenTerms, kind: u.kind === "summary" ? "summary" : "bullet" });
    if (!r.ok) for (const v of r.violations) violations.push({ ...v, detail: `${c.unitId}: ${v.detail}` });
  }
  return { ok: violations.length === 0, violations };
}

module.exports = { buildTailoring, resolveProfile, verifyResult, validateSkillRename, toOp, clone };
