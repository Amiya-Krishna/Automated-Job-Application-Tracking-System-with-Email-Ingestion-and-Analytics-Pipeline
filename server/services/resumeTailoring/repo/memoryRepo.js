// In-memory implementation of the resume-tailoring repository contract.
// Used by the test-suite (and usable for local experiments). The Prisma
// implementation in prismaRepo.js exposes exactly the same methods.
// Every read is scoped by userId: cross-user access returns null.
const crypto = require("crypto");

function createMemoryRepo() {
  let seq = 0;
  const nextId = () => ++seq;
  const db = {
    profiles: new Map(),
    trackedJobs: [],
    engineJobs: [],
    resumes: [],
    facts: [],
    jds: [],
    analyses: [],
    versions: [],
    changes: [],
    sessions: [],
  };
  const strip = (r) => {
    if (!r) return null;
    const { fileData, ...rest } = r;
    return { ...rest, hasFile: Boolean(fileData) };
  };
  const clone = (o) =>
    o === undefined ? undefined : JSON.parse(JSON.stringify(o));

  return {
    _db: db,
    // ---- test seeding helpers (not part of the production contract)
    _seedProfile(userId, p) {
      db.profiles.set(userId, {
        user_id: userId,
        updated_at: new Date(),
        skills: [],
        ...p,
      });
    },
    _seedTrackedJob(userId, j) {
      const row = { id: nextId(), userId, sourceName: "manual", ...j };
      db.trackedJobs.push(row);
      return row;
    },
    _seedEngineJob(j) {
      const row = { id: nextId(), ...j };
      db.engineJobs.push(row);
      return row;
    },

    async getProfileRow(userId) {
      return clone(db.profiles.get(userId)) || null;
    },

    async upsertProfileResumeText(userId, text) {
      const cur = db.profiles.get(userId);
      db.profiles.set(userId, {
        user_id: userId,
        skills: [],
        ...(cur || {}),
        resume_text: text,
        updated_at: new Date(),
      });
    },

    async findResumeById(userId, id) {
      return strip(
        clone(db.resumes.find((r) => r.userId === userId && r.id === id)),
      );
    },
    async findResumeByHash(userId, textHash) {
      return strip(
        clone(
          db.resumes.find(
            (r) => r.userId === userId && r.textHash === textHash,
          ),
        ),
      );
    },
    async findProfileTextTombstone(userId, textHash) {
      return strip(
        clone(
          db.resumes.find(
            (r) =>
              r.userId === userId &&
              r.sourceType === "profile_text_deleted" &&
              r.textHash === textHash,
          ),
        ),
      );
    },
    async listResumes(userId) {
      return db.resumes
        .filter(
          (r) => r.userId === userId && r.sourceType !== "profile_text_deleted",
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
        .map((r) => strip(clone(r)));
    },
    async findActiveResume(userId) {
      const l = db.resumes
        .filter((r) => r.userId === userId && r.activatedAt)
        .sort((a, b) => b.activatedAt - a.activatedAt || b.id - a.id);
      return strip(clone(l[0]));
    },
    async setActiveResume(userId, id) {
      const r = db.resumes.find((x) => x.userId === userId && x.id === id);
      if (!r) return null;
      r.activatedAt = new Date();
      return strip(clone(r));
    },
    async deleteResume(userId, id) {
      const r = db.resumes.find((x) => x.userId === userId && x.id === id);
      if (!r) return { deleted: false, deletedVersions: 0 };
      if (r.sourceType === "profile_text")
        return this.suppressProfileTextResume(userId, id);
      const vids = new Set(
        db.versions.filter((v) => v.resumeId === id).map((v) => v.id),
      );
      db.versions = db.versions.filter((v) => !vids.has(v.id));
      db.changes = db.changes.filter((c) => !vids.has(c.versionId));
      db.analyses = db.analyses.filter((a) => a.resumeId !== id);
      db.facts = db.facts.filter((f) => f.resumeId !== id);
      db.resumes = db.resumes.filter((x) => x.id !== id);
      return { deleted: true, deletedVersions: vids.size };
    },
    async suppressProfileTextResume(userId, id) {
      const r = db.resumes.find(
        (x) =>
          x.userId === userId && x.id === id && x.sourceType === "profile_text",
      );
      if (!r) return { deleted: false, deletedVersions: 0 };
      const vids = new Set(
        db.versions.filter((v) => v.resumeId === id).map((v) => v.id),
      );
      db.versions = db.versions.filter((v) => !vids.has(v.id));
      db.changes = db.changes.filter((c) => !vids.has(c.versionId));
      db.analyses = db.analyses.filter((a) => a.resumeId !== id);
      db.facts = db.facts.filter((f) => f.resumeId !== id);
      Object.assign(r, {
        sourceType: "profile_text_deleted",
        rawText: "",
        parsed: null,
        parserVersion: null,
        parseQuality: null,
        activatedAt: null,
      });
      return { deleted: true, deletedVersions: vids.size };
    },
    async findLatestUploadResume(userId) {
      const list = db.resumes
        .filter((r) => r.userId === userId && r.sourceType === "upload")
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
      return strip(clone(list[0]));
    },
    async createResume(userId, data) {
      if (
        db.resumes.some(
          (r) => r.userId === userId && r.textHash === data.textHash,
        )
      )
        throw Object.assign(new Error("unique violation"), { code: "P2002" });
      const row = {
        id: nextId(),
        userId,
        label: "Original",
        parsed: null,
        parserVersion: null,
        parseQuality: null,
        createdAt: new Date(),
        ...data,
      };
      db.resumes.push(row);
      return strip(clone(row));
    },
    async attachFile(userId, id, data) {
      const r = db.resumes.find((x) => x.userId === userId && x.id === id);
      if (!r) return null;
      Object.assign(r, data);
      return strip(clone(r));
    },
    async getResumeFile(userId, id) {
      const r = db.resumes.find((x) => x.userId === userId && x.id === id);
      return r && r.fileData
        ? { fileName: r.fileName, mimeType: r.mimeType, fileData: r.fileData }
        : null;
    },
    async saveParse(resumeId, { parsed, parserVersion, quality, facts }) {
      const r = db.resumes.find((x) => x.id === resumeId);
      Object.assign(r, {
        parsed: clone(parsed),
        parserVersion,
        parseQuality: clone(quality),
      });
      db.facts = db.facts.filter((f) => f.resumeId !== resumeId);
      for (const f of facts)
        db.facts.push({ id: nextId(), resumeId, ...clone(f) });
    },
    async listFacts(resumeId) {
      return clone(
        db.facts
          .filter((f) => f.resumeId === resumeId)
          .sort((a, b) => a.id - b.id),
      );
    },

    async countVersions(userId) {
      return db.versions.filter((v) => v.userId === userId).length;
    },

    async getTrackedJob(userId, id) {
      return (
        clone(db.trackedJobs.find((j) => j.userId === userId && j.id === id)) ||
        null
      );
    },
    async getEngineJob(id) {
      return clone(db.engineJobs.find((j) => j.id === id)) || null;
    },

    async findJd(userId, jdHash) {
      return (
        clone(db.jds.find((j) => j.userId === userId && j.jdHash === jdHash)) ||
        null
      );
    },
    async createJd(userId, data) {
      const row = {
        id: nextId(),
        userId,
        createdAt: new Date(),
        ...clone(data),
      };
      db.jds.push(row);
      return clone(row);
    },

    async findAnalysis(resumeId, jdId, taxonomyVersion) {
      return (
        clone(
          db.analyses.find(
            (a) =>
              a.resumeId === resumeId &&
              a.jdId === jdId &&
              a.taxonomyVersion === taxonomyVersion,
          ),
        ) || null
      );
    },
    async createAnalysis(data) {
      const row = { id: nextId(), createdAt: new Date(), ...clone(data) };
      db.analyses.push(row);
      return clone(row);
    },
    async latestAnalysis(userId, jobKey, resumeId) {
      const l = db.analyses
        .filter(
          (a) =>
            a.userId === userId &&
            a.jobKey === jobKey &&
            (!resumeId || a.resumeId === resumeId),
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
      return clone(l[0]) || null;
    },

    async createVersion(userId, data, changes) {
      const v = {
        id: nextId(),
        userId,
        createdAt: new Date(),
        approvedAt: null,
        ...clone(data),
      };
      db.versions.push(v);
      changes.forEach((c, i) =>
        db.changes.push({
          id: nextId(),
          versionId: v.id,
          position: i,
          ...clone(c),
        }),
      );
      return this.findVersion(userId, v.id);
    },
    async findVersion(userId, id) {
      const v = db.versions.find((x) => x.userId === userId && x.id === id);
      if (!v) return null;
      return {
        ...clone(v),
        changes: clone(
          db.changes
            .filter((c) => c.versionId === id)
            .sort((a, b) => a.position - b.position),
        ),
      };
    },
    async listVersions(userId) {
      return db.versions
        .filter((v) => v.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
        .map((v) => {
          const { profile, analysis, snapshot, ...rest } = clone(v);
          const cs = db.changes.filter((c) => c.versionId === v.id);
          return {
            ...rest,
            changeCount: cs.length,
            acceptedCount: cs.filter((c) => c.status === "accepted").length,
          };
        });
    },
    async findReusableVersion(userId, resumeId, jdHash) {
      const l = db.versions
        .filter(
          (v) =>
            v.userId === userId &&
            v.resumeId === resumeId &&
            v.jdHash === jdHash &&
            v.status !== "rejected",
        )
        .sort((a, b) => b.id - a.id);
      return l[0] ? this.findVersion(userId, l[0].id) : null;
    },
    async updateVersion(userId, id, data) {
      const v = db.versions.find((x) => x.userId === userId && x.id === id);
      if (!v) return null;
      Object.assign(v, clone(data));
      return this.findVersion(userId, id);
    },
    async setChangeStatuses(versionId, statusByKey) {
      for (const c of db.changes)
        if (c.versionId === versionId && statusByKey[c.changeKey])
          c.status = statusByKey[c.changeKey];
    },

    async createSession(userId, data) {
      const s = {
        id: crypto.randomUUID(),
        userId,
        status: "queued",
        stage: "queued",
        versionId: null,
        error: null,
        errorCode: null,
        warnings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
        ...clone(data),
      };
      db.sessions.push(s);
      return clone(s);
    },
    async updateSession(id, data) {
      const s = db.sessions.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, clone(data), { updatedAt: new Date() });
      return clone(s);
    },
    async findSession(userId, id) {
      return (
        clone(db.sessions.find((s) => s.userId === userId && s.id === id)) ||
        null
      );
    },
    async findRunningSession(userId) {
      return (
        clone(
          db.sessions.find(
            (s) =>
              s.userId === userId &&
              (s.status === "queued" || s.status === "running"),
          ),
        ) || null
      );
    },
  };
}

module.exports = { createMemoryRepo };
