// Prisma implementation of the resume-tailoring repository contract.
// Same method names/semantics as memoryRepo.js. Every query that touches
// user data filters on userId, so a caller can never load another user's row
// even by guessing ids.
//
// The Prisma client is required lazily so that requiring the routes module
// (e.g. in unit tests) does not need a generated client.

function createPrismaRepo(prismaArg) {
  const prisma = prismaArg || require("../../../lib/prisma");
  const RESUME_NO_FILE = {
    id: true,
    userId: true,
    sourceType: true,
    label: true,
    fileName: true,
    mimeType: true,
    fileSize: true,
    fileSha256: true,
    rawText: true,
    textHash: true,
    parsed: true,
    parserVersion: true,
    parseQuality: true,
    activatedAt: true,
    createdAt: true,
  };
  const withFileFlag = async (row) =>
    row ? { ...row, hasFile: Boolean(row.fileName) } : null;

  const verToObj = (v) =>
    v && { ...v, changes: (v.changes || []).map(chToObj) };
  const chToObj = (c) => ({
    id: c.id,
    versionId: c.versionId,
    changeKey: c.changeKey,
    position: c.position,
    section: c.section,
    op: c.op,
    listPath: c.listPath,
    unitId: c.unitId,
    originalText: c.originalText,
    proposedText: c.proposedText,
    before: c.beforeIds,
    after: c.afterIds,
    reason: c.reason,
    evidenceIds: c.evidenceIds,
    source: c.source,
    status: c.status,
    validation: c.validation,
  });
  const chToRow = (c, i) => ({
    changeKey: c.changeKey || c.id,
    position: i,
    section: c.section,
    op: c.op,
    listPath: c.listPath ?? null,
    unitId: c.unitId ?? null,
    originalText: c.originalText,
    proposedText: c.proposedText,
    beforeIds: c.before ?? undefined,
    afterIds: c.after ?? undefined,
    reason: c.reason,
    evidenceIds: c.evidenceIds || [],
    source: c.source,
    status: c.status,
    validation: c.validation || {},
  });

  return {
    async getProfileRow(userId) {
      return prisma.user_profile.findUnique({ where: { user_id: userId } });
    },

    // Used only when the user explicitly asks to also use an uploaded resume
    // as their matching profile text. Never called implicitly.
    async upsertProfileResumeText(userId, text) {
      await prisma.user_profile.upsert({
        where: { user_id: userId },
        update: { resume_text: text, updated_at: new Date() },
        create: { user_id: userId, resume_text: text },
      });
    },

    async findResumeById(userId, id) {
      return withFileFlag(
        await prisma.resume.findFirst({
          where: { id, userId },
          select: RESUME_NO_FILE,
        }),
      );
    },
    async findResumeByHash(userId, textHash) {
      return withFileFlag(
        await prisma.resume.findFirst({
          where: { userId, textHash },
          select: RESUME_NO_FILE,
        }),
      );
    },
    async findProfileTextTombstone(userId, textHash) {
      return withFileFlag(
        await prisma.resume.findFirst({
          where: { userId, textHash, sourceType: "profile_text_deleted" },
          select: RESUME_NO_FILE,
        }),
      );
    },
    async listResumes(userId) {
      const rows = await prisma.resume.findMany({
        where: { userId, sourceType: { not: "profile_text_deleted" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: RESUME_NO_FILE,
      });
      return rows.map((r) => ({ ...r, hasFile: Boolean(r.fileName) }));
    },
    async findActiveResume(userId) {
      return withFileFlag(
        await prisma.resume.findFirst({
          where: { userId, activatedAt: { not: null } },
          orderBy: [{ activatedAt: "desc" }, { id: "desc" }],
          select: RESUME_NO_FILE,
        }),
      );
    },
    async setActiveResume(userId, id) {
      const r = await prisma.resume.updateMany({
        where: { id, userId },
        data: { activatedAt: new Date() },
      });
      return r.count ? this.findResumeById(userId, id) : null;
    },
    // Versions, changes, facts and analyses go with it (ON DELETE CASCADE in the migration).
    async deleteResume(userId, id) {
      const row = await prisma.resume.findFirst({
        where: { id, userId },
        select: { sourceType: true },
      });
      if (!row) return { deleted: false, deletedVersions: 0 };
      if (row.sourceType === "profile_text")
        return this.suppressProfileTextResume(userId, id);
      const deletedVersions = await prisma.resumeVersion.count({
        where: { userId, resumeId: id },
      });
      const r = await prisma.resume.deleteMany({ where: { id, userId } });
      return {
        deleted: r.count > 0,
        deletedVersions: r.count > 0 ? deletedVersions : 0,
      };
    },
    async suppressProfileTextResume(userId, id) {
      const found = await prisma.resume.findFirst({
        where: { id, userId, sourceType: "profile_text" },
        select: { id: true },
      });
      if (!found) return { deleted: false, deletedVersions: 0 };
      const deletedVersions = await prisma.resumeVersion.count({
        where: { userId, resumeId: id },
      });
      await prisma.$transaction([
        prisma.resumeAnalysis.deleteMany({ where: { resumeId: id } }),
        prisma.resumeFact.deleteMany({ where: { resumeId: id } }),
        prisma.resumeVersion.deleteMany({ where: { userId, resumeId: id } }),
        prisma.resume.update({
          where: { id },
          data: {
            sourceType: "profile_text_deleted",
            rawText: "",
            parsed: null,
            parserVersion: null,
            parseQuality: null,
            activatedAt: null,
          },
        }),
      ]);
      return { deleted: true, deletedVersions };
    },
    async findLatestUploadResume(userId) {
      return withFileFlag(
        await prisma.resume.findFirst({
          where: { userId, sourceType: "upload" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: RESUME_NO_FILE,
        }),
      );
    },
    async createResume(userId, data) {
      const row = await prisma.resume.create({
        data: { userId, ...data },
        select: RESUME_NO_FILE,
      });
      return withFileFlag(row);
    },
    async attachFile(userId, id, data) {
      const found = await prisma.resume.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!found) return null;
      return withFileFlag(
        await prisma.resume.update({
          where: { id },
          data,
          select: RESUME_NO_FILE,
        }),
      );
    },
    async getResumeFile(userId, id) {
      const r = await prisma.resume.findFirst({
        where: { id, userId },
        select: { fileName: true, mimeType: true, fileData: true },
      });
      return r && r.fileData ? r : null;
    },
    async saveParse(resumeId, { parsed, parserVersion, quality, facts }) {
      await prisma.$transaction([
        prisma.resume.update({
          where: { id: resumeId },
          data: { parsed, parserVersion, parseQuality: quality },
        }),
        prisma.resumeFact.deleteMany({ where: { resumeId } }),
        prisma.resumeFact.createMany({
          data: facts.map((f) => ({
            resumeId,
            factKey: f.factKey,
            unitId: f.unitId,
            kind: f.kind,
            section: f.section,
            text: f.text,
            sourcePath: f.sourcePath,
            entryId: f.entryId ?? null,
            confidence: f.confidence ?? 1,
          })),
        }),
      ]);
    },
    async listFacts(resumeId) {
      return prisma.resumeFact.findMany({
        where: { resumeId },
        orderBy: { id: "asc" },
      });
    },

    async countVersions(userId) {
      return prisma.resumeVersion.count({ where: { userId } });
    },

    async getTrackedJob(userId, id) {
      return prisma.trackedJob.findFirst({ where: { id, userId } });
    },
    async getEngineJob(id) {
      const j = await prisma.jobs.findUnique({
        where: { id: BigInt(id) },
        include: { companies: { select: { name: true } } },
      });
      return (
        j && {
          id: Number(j.id),
          title: j.title,
          company: j.companies?.name || "",
          description: j.description,
          location: j.location,
          sourceUrl: j.source_url,
          externalJobId: j.external_job_id,
        }
      );
    },

    async findJd(userId, jdHash) {
      return prisma.jobDescription.findFirst({ where: { userId, jdHash } });
    },
    async createJd(userId, data) {
      return prisma.jobDescription.create({ data: { userId, ...data } });
    },

    async findAnalysis(resumeId, jdId, taxonomyVersion) {
      return prisma.resumeAnalysis.findFirst({
        where: { resumeId, jdId, taxonomyVersion },
      });
    },
    async createAnalysis(data) {
      return prisma.resumeAnalysis.create({ data });
    },
    async latestAnalysis(userId, jobKey, resumeId) {
      return prisma.resumeAnalysis.findFirst({
        where: { userId, jobKey, ...(resumeId ? { resumeId } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    },

    async createVersion(userId, data, changes) {
      const v = await prisma.resumeVersion.create({
        data: { userId, ...data, changes: { create: changes.map(chToRow) } },
        include: { changes: { orderBy: { position: "asc" } } },
      });
      return verToObj(v);
    },
    async findVersion(userId, id) {
      return verToObj(
        await prisma.resumeVersion.findFirst({
          where: { id, userId },
          include: { changes: { orderBy: { position: "asc" } } },
        }),
      );
    },
    async listVersions(userId) {
      const rows = await prisma.resumeVersion.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          userId: true,
          resumeId: true,
          jdId: true,
          jobKey: true,
          trackedJobId: true,
          jdHash: true,
          label: true,
          targetCompany: true,
          targetTitle: true,
          status: true,
          matchScore: true,
          aiUsed: true,
          aiProvider: true,
          aiModel: true,
          createdAt: true,
          approvedAt: true,
          changes: { select: { status: true } },
        },
      });
      return rows.map(({ changes, ...rest }) => ({
        ...rest,
        changeCount: changes.length,
        acceptedCount: changes.filter((c) => c.status === "accepted").length,
      }));
    },
    async findReusableVersion(userId, resumeId, jdHash) {
      const v = await prisma.resumeVersion.findFirst({
        where: { userId, resumeId, jdHash, status: { not: "rejected" } },
        orderBy: { id: "desc" },
        include: { changes: { orderBy: { position: "asc" } } },
      });
      return verToObj(v);
    },
    async updateVersion(userId, id, data) {
      const r = await prisma.resumeVersion.updateMany({
        where: { id, userId },
        data,
      });
      if (!r.count) return null;
      return this.findVersion(userId, id);
    },
    async setChangeStatuses(versionId, statusByKey) {
      await prisma.$transaction(
        Object.entries(statusByKey).map(([changeKey, status]) =>
          prisma.resumeChange.updateMany({
            where: { versionId, changeKey },
            data: { status },
          }),
        ),
      );
    },

    async createSession(userId, data) {
      return prisma.tailoringSession.create({ data: { userId, ...data } });
    },
    async updateSession(id, data) {
      return prisma.tailoringSession.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      });
    },
    async findSession(userId, id) {
      return prisma.tailoringSession.findFirst({ where: { id, userId } });
    },
    async findRunningSession(userId) {
      return prisma.tailoringSession.findFirst({
        where: { userId, status: { in: ["queued", "running"] } },
      });
    },
  };
}

module.exports = { createPrismaRepo };
