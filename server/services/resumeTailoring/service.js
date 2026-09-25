// Resume Tailoring service — the ONE place the business logic lives. The web
// client, mobile app and browser extension all call it through the HTTP
// routes; none of them contain tailoring logic.

const crypto = require("crypto");
const {
  LIMITS,
  MATCH,
  MSG,
  PARSER_VERSION,
  TAXONOMY_VERSION,
  VERSION_STATUS,
  CHANGE_STATUS,
  SESSION_STATUS,
} = require("./constants");
const { sanitizeResumeText } = require("./textSanitize");
const { analyzeAts } = require("./matcher");
const { buildTailoring, resolveProfile, verifyResult } = require("./engine");
const { toText, exportProfile, EXPORT_FORMATS } = require("./resumeRenderer");
const { extractResumeText } = require("./fileExtract");

const STAGES = {
  queued: "Queued…",
  analyzing_resume: "Analyzing Resume…",
  analyzing_jd: "Analyzing Job Description…",
  matching: "Matching Requirements…",
  generating: "Generating Tailored Resume…",
  validating: "Validating Changes…",
  ready: "Resume Ready",
};
const STALE_SESSION_MS = 5 * 60 * 1000;
const MAX_VERSIONS_PER_USER = 200;

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const STATE_LABEL = {
  [MATCH.MATCHED]: "Matched",
  [MATCH.PARTIAL]: MSG.PARTIAL_LABEL,
  [MATCH.NOT_FOUND]: MSG.NOT_FOUND_LABEL,
};
const safeFile = (s) =>
  String(s || "resume")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "resume";

function createResumeTailoringService({
  repo,
  provider,
  logger = console,
  now = () => new Date(),
}) {
  // ------------------------------------------------------------ resumes
  async function ensureParsed(resume) {
    let facts;
    let profile = resume.parsed;
    let quality = resume.parseQuality;
    if (!profile || resume.parserVersion !== PARSER_VERSION) {
      const parsed = await provider.analyzeResume(resume.rawText);
      await repo.saveParse(resume.id, {
        parsed: parsed.profile,
        parserVersion: PARSER_VERSION,
        quality: parsed.quality,
        facts: parsed.facts,
      });
      profile = parsed.profile;
      quality = parsed.quality;
    }
    facts = await repo.listFacts(resume.id);
    if (!quality?.reliable)
      throw new HttpError(422, "resume_unreadable", MSG.PARSE_FAILED, {
        warnings: quality?.warnings || [],
      });
    return { resume, profile, facts, quality };
  }

  async function createResumeRow(userId, data) {
    try {
      return await repo.createResume(userId, data);
    } catch (e) {
      if (e && e.code === "P2002")
        return repo.findResumeByHash(userId, data.textHash); // concurrent create
      throw e;
    }
  }

  /**
   * The user's "original" resume: an explicit resumeId, else whichever of
   * (latest upload, current profile text) was updated most recently. Resume
   * rows are immutable; new source text creates a new row.
   */
  async function resolveOriginalResume(userId, resumeId) {
    if (resumeId) {
      const r = await repo.findResumeById(userId, resumeId);
      if (!r) throw new HttpError(404, "resume_not_found", "Resume not found.");
      return ensureParsed(r);
    }
    const profileRow = await repo.getProfileRow(userId);
    const profText = profileRow?.resume_text
      ? sanitizeResumeText(profileRow.resume_text, {
          maxChars: LIMITS.MAX_RESUME_CHARS,
        }).text
      : "";

    // An explicit choice ("Use for tailoring", or an upload) wins — unless the user has since edited their
    // profile text to something different, in which case the newest action wins (the previous behaviour).
    const active = await repo.findActiveResume(userId);
    if (active) {
      const profileNewer =
        profText &&
        sha256(profText) !== active.textHash &&
        new Date(profileRow.updated_at || 0) > new Date(active.activatedAt);
      if (!profileNewer) return ensureParsed(active);
    }

    const upload = await repo.findLatestUploadResume(userId);

    let chosen = null;
    if (profText) {
      const hash = sha256(profText);
      const profileDeleted = await repo.findProfileTextTombstone(userId, hash);
      if (profileDeleted) chosen = upload;
      else if (upload && upload.textHash === hash) chosen = upload;
      else if (
        upload &&
        new Date(upload.createdAt) >= new Date(profileRow.updated_at || 0)
      )
        chosen = upload;
      else {
        if (profText.length < LIMITS.MIN_RESUME_CHARS && !upload)
          throw new HttpError(422, "resume_unreadable", MSG.PARSE_FAILED);
        chosen =
          (await repo.findResumeByHash(userId, hash)) ||
          (await createResumeRow(userId, {
            sourceType: "profile_text",
            label: "Original",
            rawText: profText,
            textHash: hash,
          }));
      }
    } else if (upload) chosen = upload;

    if (!chosen) throw new HttpError(422, "no_resume", MSG.NO_RESUME);
    return ensureParsed(chosen);
  }

  /** Make sure the resume derived from the user's profile text exists as a row (no-op when there is none). */
  async function materializeProfileTextResume(userId) {
    const profileRow = await repo.getProfileRow(userId);
    const text = profileRow?.resume_text
      ? sanitizeResumeText(profileRow.resume_text, {
          maxChars: LIMITS.MAX_RESUME_CHARS,
        }).text
      : "";
    if (text.length < LIMITS.MIN_RESUME_CHARS) return null;
    const hash = sha256(text);
    // A profile-text resume can be explicitly removed without changing the
    // user's profile. The tombstone is keyed by its content hash, so a later
    // profile edit creates a new selectable resume while the deleted text is
    // never materialized again.
    if (await repo.findProfileTextTombstone(userId, hash)) return null;
    const row =
      (await repo.findResumeByHash(userId, hash)) ||
      (await createResumeRow(userId, {
        sourceType: "profile_text",
        label: "Original",
        rawText: text,
        textHash: hash,
      }));
    if (row && !row.parsed) {
      try {
        await ensureParsed(row);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
      }
    }
    return row;
  }

  const fileTypeOf = (r) => {
    const m = /\.([a-z0-9]+)$/i.exec(r.fileName || "");
    return m
      ? m[1].toLowerCase()
      : r.sourceType === "profile_text"
        ? "text"
        : null;
  };
  const resumeDto = (r, quality) => ({
    id: r.id,
    label: r.label,
    sourceType: r.sourceType,
    fileName: r.fileName || null,
    fileSize: r.fileSize || null,
    fileType: fileTypeOf(r),
    name: r.fileName || "Resume from profile text",
    hasFile: Boolean(r.hasFile),
    createdAt: r.createdAt,
    parseQuality: quality || r.parseQuality || null,
    factsCount: (quality || r.parseQuality)?.counts?.facts ?? 0,
  });

  async function getCurrentResume(userId) {
    try {
      const ctx = await resolveOriginalResume(userId);
      return { resume: resumeDto(ctx.resume, ctx.quality) };
    } catch (e) {
      if (
        e instanceof HttpError &&
        (e.code === "no_resume" || e.code === "resume_unreadable")
      )
        return {
          resume: null,
          reason: e.code,
          message: e.message,
          warnings: e.extra.warnings || [],
        };
      throw e;
    }
  }

  async function uploadResume(
    userId,
    { buffer, fileName, mimeType },
    { syncProfile = false } = {},
  ) {
    const { text: extracted, format } = await extractResumeText(buffer, {
      fileName,
    });
    const { text, truncated } = sanitizeResumeText(extracted, {
      maxChars: LIMITS.MAX_RESUME_CHARS,
    });
    const parsed = await provider.analyzeResume(text);
    if (!parsed.quality.reliable)
      throw new HttpError(422, "resume_unreadable", MSG.PARSE_FAILED, {
        warnings: parsed.quality.warnings,
      });

    const hash = sha256(text);
    const fileMeta = {
      sourceType: "upload",
      fileName: String(fileName).slice(0, 255),
      mimeType:
        mimeType ||
        (format === "pdf" ? "application/pdf" : EXPORT_FORMATS.docx.mime),
      fileSize: buffer.length,
      fileSha256: sha256(buffer),
      fileData: buffer,
    };
    let row = await repo.findResumeByHash(userId, hash);
    if (row) {
      if (!row.hasFile) row = await repo.attachFile(userId, row.id, fileMeta);
    } else {
      row = await createResumeRow(userId, {
        ...fileMeta,
        label: "Original",
        rawText: text,
        textHash: hash,
      });
    }
    await repo.saveParse(row.id, {
      parsed: parsed.profile,
      parserVersion: PARSER_VERSION,
      quality: parsed.quality,
      facts: parsed.facts,
    });
    await repo.setActiveResume(userId, row.id); // a freshly uploaded resume is the one in use (as before: newest upload wins)
    if (syncProfile) await repo.upsertProfileResumeText(userId, text);
    return {
      resume: { ...resumeDto(row, parsed.quality), isActive: true },
      truncated,
      syncedToProfile: Boolean(syncProfile),
    };
  }

  // ------------------------------------------------------- resume manager
  const versionSummary = (v) => ({
    id: v.id,
    label: v.label,
    status: v.status,
    targetCompany: v.targetCompany,
    targetTitle: v.targetTitle,
    jobKey: v.jobKey,
    resumeId: v.resumeId,
    matchScore: v.matchScore,
    changeCount: v.changeCount,
    acceptedCount: v.acceptedCount,
    aiUsed: v.aiUsed,
    aiProvider: v.aiProvider || null,
    aiModel: v.aiModel || null,
    createdAt: v.createdAt,
    approvedAt: v.approvedAt,
  });

  /** Every resume of the user, the active one flagged, each with its tailored versions. */
  async function listResumes(userId) {
    let activeId = null;
    try {
      activeId = (await resolveOriginalResume(userId)).resume.id;
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
    }
    await materializeProfileTextResume(userId); // the profile text is always a selectable resume
    const [rows, versions] = await Promise.all([
      repo.listResumes(userId),
      repo.listVersions(userId),
    ]);
    return {
      activeResumeId: activeId,
      resumes: rows.map((r) => ({
        ...resumeDto(r),
        isActive: r.id === activeId,
        status: r.id === activeId ? "active" : "available",
        versionCount: versions.filter((v) => v.resumeId === r.id).length,
        versions: versions
          .filter((v) => v.resumeId === r.id)
          .map(versionSummary),
      })),
    };
  }

  async function getResume(userId, id) {
    const row = await repo.findResumeById(userId, id);
    if (!row) throw new HttpError(404, "resume_not_found", "Resume not found.");
    let profile = row.parsed;
    if (!profile || row.parserVersion !== PARSER_VERSION) {
      try {
        profile = (await ensureParsed(row)).profile;
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        profile = null;
      }
    }
    const all = await listResumes(userId);
    const entry = all.resumes.find((r) => r.id === id);
    return {
      resume: entry,
      resumeText: profile ? toText(profile) : row.rawText,
    };
  }

  async function activateResume(userId, id) {
    const r = await repo.setActiveResume(userId, id);
    if (!r) throw new HttpError(404, "resume_not_found", "Resume not found.");
    return listResumes(userId);
  }

  async function deleteResume(userId, id) {
    const row = await repo.findResumeById(userId, id);
    if (!row) throw new HttpError(404, "resume_not_found", "Resume not found.");
    const out = await repo.deleteResume(userId, id);
    if (!out.deleted)
      throw new HttpError(404, "resume_not_found", "Resume not found.");
    return { ...out, ...(await listResumes(userId)) };
  }

  async function getOriginalFile(userId, resumeId) {
    const ctx = resumeId
      ? { resume: await repo.findResumeById(userId, resumeId) }
      : await resolveOriginalResume(userId);
    if (!ctx.resume)
      throw new HttpError(404, "resume_not_found", "Resume not found.");
    const file = await repo.getResumeFile(userId, ctx.resume.id);
    if (!file)
      throw new HttpError(
        404,
        "no_original_file",
        "No uploaded file is stored for this resume (it was created from pasted text).",
      );
    return file;
  }

  // --------------------------------------------------------------- jobs
  async function resolveJobInput(userId, job) {
    const j = job || {};
    const provided = [j.trackedJobId, j.engineJobId, j.description].filter(
      (x) => x !== undefined && x !== null && x !== "",
    );
    if (!provided.length)
      throw new HttpError(
        400,
        "job_required",
        "Provide a trackedJobId, engineJobId, or a job description.",
      );

    let base = {
      title: j.title || "",
      company: j.company || "",
      location: j.location || null,
      description: j.description || "",
      sourceUrl: j.sourceUrl || null,
      sourceName: j.sourceName || null,
      externalJobId: j.externalJobId || null,
    };
    let jobKey = null;
    let trackedJobId = null;

    if (j.trackedJobId) {
      const t = await repo.getTrackedJob(userId, j.trackedJobId);
      if (!t) throw new HttpError(404, "job_not_found", "Job not found.");
      base = {
        title: j.title || t.role,
        company: j.company || t.company,
        location: j.location || t.location || null,
        description: j.description || t.description || "",
        sourceUrl: t.sourceUrl || j.sourceUrl || null,
        sourceName: t.sourceName || null,
        externalJobId: t.externalJobId || null,
      };
      jobKey = `tracked-${t.id}`;
      trackedJobId = t.id;
    } else if (j.engineJobId) {
      const e = await repo.getEngineJob(j.engineJobId);
      if (!e) throw new HttpError(404, "job_not_found", "Job not found.");
      base = {
        title: j.title || e.title,
        company: j.company || e.company,
        location: j.location || e.location || null,
        description: j.description || e.description || "",
        sourceUrl: e.sourceUrl || null,
        sourceName: null,
        externalJobId: e.externalJobId || null,
      };
      jobKey = `engine-${e.id}`;
    }
    if (base.description.trim().length < LIMITS.MIN_JD_CHARS)
      throw new HttpError(422, "jd_too_short", MSG.JD_TOO_SHORT);
    return { base, jobKey, trackedJobId };
  }

  async function analyzeJobAndStore(userId, resolved) {
    const res = await provider.analyzeJobDescription(resolved.base);
    if (!res.sufficient)
      throw new HttpError(422, "jd_too_short", MSG.JD_TOO_SHORT);
    const jobKey = resolved.jobKey || `jd-${res.jdHash.slice(0, 16)}`;
    let row = await repo.findJd(userId, res.jdHash);
    if (!row) {
      try {
        row = await repo.createJd(userId, {
          jdHash: res.jdHash,
          jobKey,
          title: res.jd.title || resolved.base.title || "Untitled role",
          company: res.jd.company || resolved.base.company || "Unknown company",
          location: res.jd.location,
          sourceUrl: resolved.base.sourceUrl,
          sourceName: resolved.base.sourceName,
          rawText: res.jd.description,
          parsed: {
            jd: res.jd,
            requirements: res.requirements,
            warnings: res.warnings,
            removedInjectionLines: res.removedInjectionLines,
          },
          taxonomyVersion: TAXONOMY_VERSION,
        });
      } catch (e) {
        if (e && e.code === "P2002")
          row = await repo.findJd(userId, res.jdHash);
        else throw e;
      }
    }
    return { res, row, jobKey };
  }

  // ----------------------------------------------------------- analysis
  function buildView({ resumeCtx, jdCtx, match, ats, jobKey }) {
    const requirements = match.results.map((r) => ({
      id: r.id,
      requirement: r.requirement,
      canonical: r.canonical,
      recognized: r.recognized,
      type: r.type,
      weight: r.weight,
      source: r.source,
      surfaceForms: r.surfaceForms,
      quote: r.quote,
      state: r.state,
      label: STATE_LABEL[r.state],
      strength: r.strength,
      note: r.note,
      relatedTerms: r.relatedTerms || [],
      evidence: r.evidence,
    }));
    const names = (f) => requirements.filter(f).map((r) => r.requirement);
    return {
      jobKey,
      resumeId: resumeCtx.resume.id,
      jdHash: jdCtx.res.jdHash,
      jd: { ...jdCtx.res.jd },
      matchScore: match.score,
      requirements,
      matchedSkills: names((r) => r.state === MATCH.MATCHED),
      strongMatches: names(
        (r) => r.state === MATCH.MATCHED && r.strength === "demonstrated",
      ),
      partialSkills: names((r) => r.state === MATCH.PARTIAL),
      missingSkills: names((r) => r.state === MATCH.NOT_FOUND),
      unsupportedClaims: [],
      recommendations: [],
      ats,
      reviewManually: {
        experience: jdCtx.res.jd.experienceRequirements,
        education: jdCtx.res.jd.educationRequirements,
        note: "TrackTrail does not infer years of experience or degrees. Check these yourself.",
      },
      warnings: [...jdCtx.res.warnings],
    };
  }

  async function analyzeCore(userId, { job, resumeId }) {
    const resumeCtx = await resolveOriginalResume(userId, resumeId);
    const resolved = await resolveJobInput(userId, job);
    const jdCtx = await analyzeJobAndStore(userId, resolved);

    const cached = await repo.findAnalysis(
      resumeCtx.resume.id,
      jdCtx.row.id,
      TAXONOMY_VERSION,
    );
    if (cached && cached.result && cached.result.requirements) {
      const view = {
        ...cached.result,
        jobKey: jdCtx.jobKey,
        analysisId: cached.id,
        cached: true,
      };
      return {
        resumeCtx,
        jdCtx,
        resolved,
        view,
        match: {
          score: cached.matchScore,
          results: cached.result.requirements,
        },
      };
    }
    const match = await provider.matchResumeToJob(
      jdCtx.res.requirements,
      resumeCtx.facts,
    );
    const ats = analyzeAts({
      profile: resumeCtx.profile,
      rawText: resumeCtx.resume.rawText,
      jd: jdCtx.res.jd,
      match,
      requirements: jdCtx.res.requirements,
    });
    const view = buildView({
      resumeCtx,
      jdCtx,
      match,
      ats,
      jobKey: jdCtx.jobKey,
    });
    view.recommendations = recommendationsFor(match, resumeCtx.profile);
    let row;
    try {
      row = await repo.createAnalysis({
        userId,
        resumeId: resumeCtx.resume.id,
        jdId: jdCtx.row.id,
        jobKey: jdCtx.jobKey,
        taxonomyVersion: TAXONOMY_VERSION,
        matchScore: match.score,
        matchedSkills: view.matchedSkills,
        partialSkills: view.partialSkills,
        missingSkills: view.missingSkills,
        unsupportedClaims: [],
        recommendations: view.recommendations,
        result: view,
      });
    } catch (e) {
      if (e && e.code === "P2002")
        row = await repo.findAnalysis(
          resumeCtx.resume.id,
          jdCtx.row.id,
          TAXONOMY_VERSION,
        );
      else throw e;
    }
    view.analysisId = row.id;
    return { resumeCtx, jdCtx, resolved, view, match };
  }

  function recommendationsFor(match, profile) {
    const recs = [];
    for (const r of match.results) {
      if (r.state === MATCH.NOT_FOUND)
        recs.push({
          type: "missing",
          requirement: r.requirement,
          message: `“${r.requirement}” is not on your resume, so it will not be added. If you genuinely have this experience, add it to your profile or resume first.`,
        });
      else if (r.state === MATCH.PARTIAL)
        recs.push({
          type: "partial",
          requirement: r.requirement,
          message: `You have related experience (${(r.relatedTerms || []).slice(0, 3).join(", ")}), but not “${r.requirement}” itself. It will not be claimed.`,
        });
      else if (r.strength === "listed")
        recs.push({
          type: "listed_only",
          requirement: r.requirement,
          message: `“${r.requirement}” appears only in your skills list. If you used it in a project or role, describe that in a bullet.`,
        });
    }
    if (!profile.summary)
      recs.push({
        type: "no_summary",
        message: "Your resume has no summary; none will be written for you.",
      });
    return recs;
  }

  async function analyze(userId, { job, resumeId }) {
    const { view } = await analyzeCore(userId, { job, resumeId });
    return view;
  }

  async function getMatchAnalysis(userId, jobKey, resumeId) {
    if (resumeId && !(await repo.findResumeById(userId, resumeId)))
      throw new HttpError(404, "resume_not_found", "Resume not found.");
    const row = await repo.latestAnalysis(userId, jobKey, resumeId);
    if (row && row.result)
      return { ...row.result, jobKey, analysisId: row.id, cached: true };
    // not analysed yet: compute (deterministic, no LLM) if the job is one we can resolve
    let job = null;
    let m;
    if ((m = /^tracked-(\d+)$/.exec(jobKey)))
      job = { trackedJobId: Number(m[1]) };
    else if ((m = /^engine-(\d+)$/.exec(jobKey)))
      job = { engineJobId: Number(m[1]) };
    if (!job)
      throw new HttpError(
        404,
        "analysis_not_found",
        "No analysis found for this job. Analyze it first.",
      );
    return analyze(userId, { job, resumeId });
  }

  // ---------------------------------------------------------- versions
  const changeDto = (c, factsByKey) => ({
    id: c.changeKey,
    section: c.section,
    op: c.op,
    listPath: c.listPath || null,
    unitId: c.unitId || null,
    original: c.originalText,
    proposed: c.proposedText,
    reason: c.reason,
    source: c.source,
    status: c.status,
    evidence: (c.evidenceIds || [])
      .map((k) => factsByKey.get(k))
      .filter(Boolean),
    evidenceIds: c.evidenceIds || [],
    validation: c.validation,
  });

  function versionDto(v) {
    const factsByKey = new Map(
      (v.snapshot?.facts || []).map((f) => [
        f.factKey,
        {
          factId: f.factKey,
          text: f.text,
          sourcePath: f.sourcePath,
          kind: f.kind,
        },
      ]),
    );
    return {
      id: v.id,
      label: v.label,
      status: v.status,
      targetCompany: v.targetCompany,
      targetTitle: v.targetTitle,
      jobKey: v.jobKey,
      trackedJobId: v.trackedJobId || null,
      jdHash: v.jdHash,
      resumeId: v.resumeId,
      createdAt: v.createdAt,
      approvedAt: v.approvedAt,
      matchScore: v.matchScore,
      aiUsed: v.aiUsed,
      aiProvider: v.aiProvider,
      aiModel: v.aiModel,
      analysis: v.analysis,
      unsupportedClaims: v.unsupportedClaims,
      recommendations: v.recommendations,
      warnings: v.warnings,
      profile: v.profile,
      resumeText: toText(v.profile),
      changes: (v.changes || []).map((c) => changeDto(c, factsByKey)),
    };
  }

  async function getVersion(userId, id) {
    const v = await repo.findVersion(userId, id);
    if (!v)
      throw new HttpError(
        404,
        "version_not_found",
        "Tailored resume not found.",
      );
    return versionDto(v);
  }

  async function listVersions(userId) {
    const versions = await repo.listVersions(userId);
    let original = null;
    try {
      const ctx = await resolveOriginalResume(userId);
      original = {
        id: "original",
        label: "Original",
        status: "original",
        resumeId: ctx.resume.id,
        sourceType: ctx.resume.sourceType,
        fileName: ctx.resume.fileName || null,
        createdAt: ctx.resume.createdAt,
      };
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
    }
    return {
      original,
      versions: versions.map((v) => ({
        id: v.id,
        label: v.label,
        status: v.status,
        targetCompany: v.targetCompany,
        targetTitle: v.targetTitle,
        jobKey: v.jobKey,
        trackedJobId: v.trackedJobId || null,
        jdHash: v.jdHash,
        resumeId: v.resumeId,
        matchScore: v.matchScore,
        changeCount: v.changeCount,
        acceptedCount: v.acceptedCount,
        aiUsed: v.aiUsed,
        aiProvider: v.aiProvider || null,
        aiModel: v.aiModel || null,
        createdAt: v.createdAt,
        approvedAt: v.approvedAt,
      })),
    };
  }

  // ---------------------------------------------------------- tailoring
  async function updateStage(sessionId, stage) {
    await repo.updateSession(sessionId, {
      status: SESSION_STATUS.RUNNING,
      stage,
    });
  }

  async function runTailoring(
    sessionId,
    userId,
    { job, resumeId, regenerate },
  ) {
    try {
      await updateStage(sessionId, "analyzing_resume");
      const resumeCtx = await resolveOriginalResume(userId, resumeId);
      await updateStage(sessionId, "analyzing_jd");
      const resolved = await resolveJobInput(userId, job);
      const jdCtx = await analyzeJobAndStore(userId, resolved);
      await updateStage(sessionId, "matching");
      const core = await analyzeCore(userId, {
        job,
        resumeId: resumeCtx.resume.id,
      });

      if (!regenerate) {
        const reuse = await repo.findReusableVersion(
          userId,
          resumeCtx.resume.id,
          jdCtx.res.jdHash,
        );
        if (reuse) {
          await repo.updateSession(sessionId, {
            status: SESSION_STATUS.SUCCEEDED,
            stage: "ready",
            versionId: reuse.id,
            finishedAt: now(),
            warnings: [
              "An existing tailored version for this job and resume was reused.",
            ],
          });
          return reuse.id;
        }
      }

      const hasAnySupport = core.match.results.some(
        (r) => r.state !== MATCH.NOT_FOUND,
      );
      if (!hasAnySupport) {
        await repo.updateSession(sessionId, {
          status: SESSION_STATUS.FAILED,
          stage: "ready",
          error:
            "None of this job's requirements are supported by your resume, so there is nothing truthful to tailor. See the match analysis for details.",
          errorCode: "no_matching_skills",
          finishedAt: now(),
        });
        return null;
      }

      await updateStage(sessionId, "generating");
      const facts = resumeCtx.facts;
      let t = await buildTailoring({
        profile: resumeCtx.profile,
        facts,
        match: core.match,
        resumeText: resumeCtx.resume.rawText,
        provider,
        log: (k, m) => logger.warn?.(`[resume] ${k}: ${m}`),
      });

      await updateStage(sessionId, "validating");
      let resolvedProfile = resolveProfile(resumeCtx.profile, t.changes, {
        include: [CHANGE_STATUS.PENDING],
      });
      let verdict = verifyResult({
        source: resumeCtx.profile,
        result: resolvedProfile.profile,
        applied: resolvedProfile.applied,
        resumeText: resumeCtx.resume.rawText,
        forbiddenTerms: t.forbiddenTerms,
      });
      if (!verdict.ok) {
        // Unsupported claim detected -> reject this generation and regenerate conservatively (no AI text).
        logger.warn?.(
          "[resume] final verification failed; falling back to deterministic-only changes",
        );
        const detOnly = t.changes.filter((c) => c.source === "deterministic");
        for (const c of t.changes.filter((x) => x.source !== "deterministic"))
          t.unsupportedClaims.push({
            unitId: c.unitId,
            section: c.section,
            original: c.originalText,
            proposed: c.proposedText,
            violations: verdict.violations,
            source: c.source,
          });
        t = { ...t, changes: detOnly };
        resolvedProfile = resolveProfile(resumeCtx.profile, t.changes, {
          include: [CHANGE_STATUS.PENDING],
        });
        verdict = verifyResult({
          source: resumeCtx.profile,
          result: resolvedProfile.profile,
          applied: resolvedProfile.applied,
          resumeText: resumeCtx.resume.rawText,
          forbiddenTerms: t.forbiddenTerms,
        });
        if (!verdict.ok)
          throw new HttpError(
            500,
            "validation_failed",
            "The generated resume failed safety validation, so nothing was saved.",
          );
      }

      if ((await repo.countVersions(userId)) >= MAX_VERSIONS_PER_USER)
        throw new HttpError(
          409,
          "version_limit",
          "You've reached the limit of saved tailored resumes. Delete some before creating more.",
        );

      const title = jdCtx.res.jd.title || resolved.base.title || "Role";
      const company =
        jdCtx.res.jd.company || resolved.base.company || "Company";
      const analysisView = { ...core.view };
      analysisView.unsupportedClaims = t.unsupportedClaims;
      analysisView.recommendations = t.recommendations;
      const version = await repo.createVersion(
        userId,
        {
          resumeId: resumeCtx.resume.id,
          jdId: jdCtx.row.id,
          jobKey: jdCtx.jobKey,
          trackedJobId: resolved.trackedJobId,
          jdHash: jdCtx.res.jdHash,
          label: `${title} - ${company}`.slice(0, 255),
          targetCompany: company.slice(0, 255),
          targetTitle: title.slice(0, 255),
          status: VERSION_STATUS.DRAFT,
          profile: resolvedProfile.profile,
          matchScore: core.match.score,
          analysis: analysisView,
          snapshot: {
            baseProfile: resumeCtx.profile,
            facts: facts.map((f) => ({
              factKey: f.factKey,
              unitId: f.unitId,
              kind: f.kind,
              text: f.text,
              sourcePath: f.sourcePath,
            })),
            forbiddenTerms: t.forbiddenTerms,
            parserVersion: PARSER_VERSION,
          },
          unsupportedClaims: t.unsupportedClaims,
          recommendations: t.recommendations,
          warnings: [...t.warnings, ...jdCtx.res.warnings],
          aiProvider: t.aiServedBy
            ? t.aiServedBy.name
            : provider.usesLLM
              ? provider.name
              : null,
          aiModel: t.aiServedBy
            ? t.aiServedBy.model
            : provider.usesLLM
              ? provider.model
              : null,
          aiUsed: t.aiUsed,
        },
        t.changes.map((c) => ({ ...c, changeKey: c.id })),
      );

      await repo.updateSession(sessionId, {
        status: SESSION_STATUS.SUCCEEDED,
        stage: "ready",
        versionId: version.id,
        warnings: t.warnings,
        finishedAt: now(),
      });
      return version.id;
    } catch (err) {
      const known = err instanceof HttpError || err?.name === "UploadError";
      if (!known) logger.error?.("[resume] tailoring failed:", err);
      await repo
        .updateSession(sessionId, {
          status: SESSION_STATUS.FAILED,
          error: known
            ? err.message
            : "Something went wrong while tailoring. Please try again.",
          errorCode: known ? err.code : "internal_error",
          finishedAt: now(),
        })
        .catch(() => {});
      return null;
    }
  }

  async function startTailoring(userId, input, { wait = false } = {}) {
    // cheap pre-flight so obvious problems fail immediately, not inside a session
    await resolveOriginalResume(userId, input.resumeId).catch((e) => {
      throw e;
    });
    await resolveJobInput(userId, input.job);

    const running = await repo.findRunningSession(userId);
    if (running) {
      if (now() - new Date(running.updatedAt) > STALE_SESSION_MS)
        await repo.updateSession(running.id, {
          status: SESSION_STATUS.FAILED,
          error: "Timed out.",
          errorCode: "timeout",
          finishedAt: now(),
        });
      else
        throw new HttpError(
          409,
          "session_in_progress",
          "A tailoring run is already in progress. Please wait for it to finish.",
          { sessionId: running.id },
        );
    }
    const session = await repo.createSession(userId, {
      jobKey: input.job?.trackedJobId
        ? `tracked-${input.job.trackedJobId}`
        : input.job?.engineJobId
          ? `engine-${input.job.engineJobId}`
          : "adhoc",
      resumeId: input.resumeId || null,
    });
    const run = runTailoring(session.id, userId, input);
    if (wait) await run;
    else run.catch(() => {});
    return sessionDto(
      wait ? await repo.findSession(userId, session.id) : session,
    );
  }

  function sessionDto(s) {
    return {
      id: s.id,
      status: s.status,
      stage: s.stage,
      stageLabel: STAGES[s.stage] || s.stage,
      versionId: s.versionId || null,
      error: s.error || null,
      errorCode: s.errorCode || null,
      warnings: s.warnings || [],
      createdAt: s.createdAt,
      finishedAt: s.finishedAt || null,
    };
  }

  async function getSession(userId, id) {
    let s = await repo.findSession(userId, id);
    if (!s) throw new HttpError(404, "session_not_found", "Session not found.");
    if (
      (s.status === SESSION_STATUS.RUNNING ||
        s.status === SESSION_STATUS.QUEUED) &&
      now() - new Date(s.updatedAt) > STALE_SESSION_MS
    ) {
      s = await repo.updateSession(s.id, {
        status: SESSION_STATUS.FAILED,
        error: "The run timed out. Please try again.",
        errorCode: "timeout",
        finishedAt: now(),
      });
    }
    return sessionDto(s);
  }

  // ------------------------------------------------- review / approval
  function baseOf(v) {
    return v.snapshot.baseProfile;
  }

  function decisionsToStatuses(v, { action, decisions = {} }) {
    const keys = v.changes.map((c) => c.changeKey);
    if (action === "accept_all")
      return Object.fromEntries(keys.map((k) => [k, CHANGE_STATUS.ACCEPTED]));
    if (action === "reject_all")
      return Object.fromEntries(keys.map((k) => [k, CHANGE_STATUS.REJECTED]));
    const unknown = Object.keys(decisions).filter((k) => !keys.includes(k));
    if (unknown.length)
      throw new HttpError(
        400,
        "unknown_change",
        `Unknown change id(s): ${unknown.join(", ")}`,
      );
    // "review": anything the user did not explicitly accept is NOT applied.
    return Object.fromEntries(
      keys.map((k) => [
        k,
        decisions[k] === CHANGE_STATUS.ACCEPTED
          ? CHANGE_STATUS.ACCEPTED
          : CHANGE_STATUS.REJECTED,
      ]),
    );
  }

  const toChangeObjs = (v, statusByKey) =>
    v.changes.map((c) => ({
      ...c,
      id: c.changeKey,
      status: statusByKey ? statusByKey[c.changeKey] : c.status,
    }));

  async function previewVersion(userId, id, decisions = {}) {
    const v = await repo.findVersion(userId, id);
    if (!v)
      throw new HttpError(
        404,
        "version_not_found",
        "Tailored resume not found.",
      );
    if (v.status !== VERSION_STATUS.DRAFT)
      return {
        profile: v.profile,
        resumeText: toText(v.profile),
        status: v.status,
      };
    const merged = Object.fromEntries(
      v.changes.map((c) => [c.changeKey, decisions[c.changeKey] || c.status]),
    );
    const changes = toChangeObjs(v, merged).map((c) => ({
      ...c,
      before: c.before ?? c.beforeIds,
      after: c.after ?? c.afterIds,
    }));
    const { profile, applied } = resolveProfile(baseOf(v), changes, {
      include: [CHANGE_STATUS.PENDING, CHANGE_STATUS.ACCEPTED],
    });
    const verdict = verifyResult({
      source: baseOf(v),
      result: profile,
      applied,
      resumeText: await resumeTextOf(userId, v),
      forbiddenTerms: v.snapshot.forbiddenTerms || [],
    });
    if (!verdict.ok)
      throw new HttpError(
        500,
        "validation_failed",
        "This combination of changes failed safety validation.",
      );
    return { profile, resumeText: toText(profile), status: v.status };
  }

  async function resumeTextOf(userId, v) {
    const r = await repo.findResumeById(userId, v.resumeId);
    return r ? r.rawText : "";
  }

  async function approveVersion(userId, id, { action, decisions }) {
    const v = await repo.findVersion(userId, id);
    if (!v)
      throw new HttpError(
        404,
        "version_not_found",
        "Tailored resume not found.",
      );
    if (v.status !== VERSION_STATUS.DRAFT)
      throw new HttpError(
        409,
        "already_finalized",
        "This version has already been reviewed.",
      );

    const statusByKey = decisionsToStatuses(v, { action, decisions });
    const changes = toChangeObjs(v, statusByKey).map((c) => ({
      ...c,
      before: c.beforeIds ?? c.before,
      after: c.afterIds ?? c.after,
    }));
    const { profile, applied } = resolveProfile(baseOf(v), changes, {
      include: [CHANGE_STATUS.ACCEPTED],
    });
    const verdict = verifyResult({
      source: baseOf(v),
      result: profile,
      applied,
      resumeText: await resumeTextOf(userId, v),
      forbiddenTerms: v.snapshot.forbiddenTerms || [],
    });
    if (!verdict.ok)
      throw new HttpError(
        422,
        "validation_failed",
        "The selected changes failed safety validation, so nothing was applied.",
        { violations: verdict.violations },
      );

    await repo.setChangeStatuses(v.id, statusByKey);
    const acceptedCount = applied.length;
    await repo.updateVersion(userId, v.id, {
      status:
        acceptedCount === 0 ? VERSION_STATUS.REJECTED : VERSION_STATUS.APPROVED,
      profile,
      approvedAt: now(),
    });
    return getVersion(userId, v.id);
  }

  // -------------------------------------------------------------- export
  async function exportVersion(userId, id, format) {
    if (!EXPORT_FORMATS[format])
      throw new HttpError(
        400,
        "bad_format",
        `Unsupported format. Use one of: ${Object.keys(EXPORT_FORMATS).join(", ")}.`,
      );
    let profile;
    let name;
    if (id === "original") {
      const ctx = await resolveOriginalResume(userId);
      profile = ctx.profile;
      name = `${ctx.profile.personalInfo?.name || "resume"}_original`;
    } else {
      const v = await repo.findVersion(userId, Number(id));
      if (!v)
        throw new HttpError(
          404,
          "version_not_found",
          "Tailored resume not found.",
        );
      if (v.status === VERSION_STATUS.DRAFT)
        throw new HttpError(
          409,
          "not_approved",
          "Review and approve the changes before exporting.",
        );
      profile = v.profile;
      name = `${v.snapshot.baseProfile.personalInfo?.name || "resume"}_${v.targetCompany}_${v.targetTitle}`;
    }
    const out = await exportProfile(profile, format);
    return { ...out, filename: `${safeFile(name)}.${out.ext}` };
  }

  return {
    HttpError,
    STAGES,
    getCurrentResume,
    uploadResume,
    getOriginalFile,
    listResumes,
    getResume,
    activateResume,
    deleteResume,
    analyze,
    getMatchAnalysis,
    startTailoring,
    getSession,
    getVersion,
    listVersions,
    previewVersion,
    approveVersion,
    exportVersion,
    _resolveOriginalResume: resolveOriginalResume,
  };
}

module.exports = { createResumeTailoringService, HttpError, STAGES };
