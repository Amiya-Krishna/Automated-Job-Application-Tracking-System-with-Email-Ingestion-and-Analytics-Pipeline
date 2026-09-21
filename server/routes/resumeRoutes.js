// /api/resume/*  — HTTP surface of the Resume Tailoring service.
// Every route requires authentication (mounted behind authMiddleware in
// server.js) and every data access is scoped to req.user.id in the repo, so a
// user can only ever reach their own resumes, analyses, versions and sessions.
// Cross-user access returns 404 (not 403) so existence is not leaked.
const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const { createRateLimiter } = require("../middleware/rateLimit");
const { createResumeTailoringService, HttpError } = require("../services/resumeTailoring/service");
const { createProvider } = require("../services/resumeTailoring/providers");
const { LIMITS } = require("../services/resumeTailoring/constants");

const intId = z.coerce.number().int().positive();
const shortStr = (n) => z.string().trim().max(n);

const JobSchema = z.object({
  trackedJobId: intId.optional(),
  engineJobId: intId.optional(),
  title: shortStr(255).optional(),
  company: shortStr(255).optional(),
  location: shortStr(255).nullish(),
  description: z.string().max(LIMITS.MAX_JD_CHARS * 2).optional(), // hard cap; sanitiser trims further
  sourceUrl: shortStr(1000).nullish(),
  sourceName: shortStr(50).nullish(),
  externalJobId: shortStr(255).nullish(),
}).strict();

const AnalyzeSchema = z.object({ job: JobSchema, resumeId: intId.optional() }).strict();
const TailorSchema = z.object({ job: JobSchema, resumeId: intId.optional(), regenerate: z.boolean().optional() }).strict();
const DecisionSchema = z.enum(["accepted", "rejected", "pending"]);
const ApproveSchema = z.object({
  action: z.enum(["accept_all", "reject_all", "review"]),
  decisions: z.record(z.string().max(20), DecisionSchema).optional(),
}).strict();
const PreviewSchema = z.object({ decisions: z.record(z.string().max(20), DecisionSchema).optional() }).strict();
const ExportSchema = z.object({ format: z.enum(["txt", "md", "html", "docx", "pdf"]) }).strict();

const num = (env, dflt) => (Number(env) > 0 ? Number(env) : dflt);

function createResumeRouter({ repo, provider, service } = {}) {
  const svc = service || createResumeTailoringService({
    repo: repo || require("../services/resumeTailoring/repo/prismaRepo").createPrismaRepo(),
    provider: provider || createProvider(process.env),
  });

  const router = express.Router();
  const limit = (name, max, windowMs = 60 * 60 * 1000) => createRateLimiter({ name, max, windowMs });
  const analyzeLimit = limit("analyze", num(process.env.RESUME_RL_ANALYZE, 60));
  const tailorLimit = limit("tailor", num(process.env.RESUME_RL_TAILOR, 15));
  const uploadLimit = limit("upload", num(process.env.RESUME_RL_UPLOAD, 10));
  const exportLimit = limit("export", num(process.env.RESUME_RL_EXPORT, 60));
  const readLimit = limit("read", num(process.env.RESUME_RL_READ, 600));
  const manageLimit = limit("manage", num(process.env.RESUME_RL_MANAGE, 120));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

  const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res, next); } catch (e) { next(e); }
  };
  const parse = (schema, body) => {
    const r = schema.safeParse(body ?? {});
    if (!r.success) {
      throw new HttpError(400, "invalid_request", "Invalid request.", { issues: r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    return r.data;
  };
  const versionId = (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "invalid_request", "Invalid id.");
    return n;
  };
  const noStore = (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); };
  router.use(noStore);

  // ---- the user's current original resume
  router.get("/current", readLimit, wrap(async (req, res) => { res.json(await svc.getCurrentResume(req.user.id)); }));

  router.post("/upload", uploadLimit, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, "file_too_large", `File is too large. The limit is ${Math.round(LIMITS.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`));
      return next(new HttpError(400, "invalid_upload", "Invalid upload."));
    });
  }, wrap(async (req, res) => {
    if (!req.file) throw new HttpError(400, "file_required", "Attach a PDF or DOCX file in the “file” field.");
    const syncProfile = String(req.body?.syncProfile || "").toLowerCase() === "true";
    const out = await svc.uploadResume(req.user.id, { buffer: req.file.buffer, fileName: req.file.originalname, mimeType: req.file.mimetype }, { syncProfile });
    res.status(201).json(out);
  }));

  // ---- resume manager (list / view / choose active / delete). Upload, file download,
  // analysis, tailoring, versions and export reuse the endpoints below.
  router.get("/resumes", readLimit, wrap(async (req, res) => { res.json(await svc.listResumes(req.user.id)); }));
  router.get("/resumes/:id", readLimit, wrap(async (req, res) => { res.json(await svc.getResume(req.user.id, versionId(req.params.id))); }));
  router.post("/resumes/:id/activate", manageLimit, wrap(async (req, res) => { res.json(await svc.activateResume(req.user.id, versionId(req.params.id))); }));
  router.delete("/resumes/:id", manageLimit, wrap(async (req, res) => { res.json(await svc.deleteResume(req.user.id, versionId(req.params.id))); }));

  router.get("/original/file", readLimit, wrap(async (req, res) => {
    const f = await svc.getOriginalFile(req.user.id, req.query.resumeId ? versionId(req.query.resumeId) : undefined);
    res.set("Content-Type", f.mimeType || "application/octet-stream");
    res.set("Content-Disposition", `attachment; filename="${String(f.fileName).replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    res.set("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(f.fileData));
  }));

  // ---- analysis / tailoring
  router.post("/analyze", analyzeLimit, wrap(async (req, res) => {
    const body = parse(AnalyzeSchema, req.body);
    res.json(await svc.analyze(req.user.id, body));
  }));

  router.post("/tailor", tailorLimit, wrap(async (req, res) => {
    const body = parse(TailorSchema, req.body);
    const wait = String(req.query.wait || "") === "true";
    const session = await svc.startTailoring(req.user.id, body, { wait });
    res.status(wait ? 200 : 202).json(session);
  }));

  router.get("/sessions/:id", readLimit, wrap(async (req, res) => { res.json(await svc.getSession(req.user.id, String(req.params.id))); }));

  router.get("/tailored/:id", readLimit, wrap(async (req, res) => { res.json(await svc.getVersion(req.user.id, versionId(req.params.id))); }));
  router.get("/versions", readLimit, wrap(async (req, res) => { res.json(await svc.listVersions(req.user.id)); }));
  router.get("/match-analysis/:jobId", readLimit, wrap(async (req, res) => {
    const jobId = String(req.params.jobId);
    // plain number = tracked job id; otherwise "tracked-<n>" / "engine-<n>" / "jd-<hash>"
    const key = /^\d+$/.test(jobId) ? `tracked-${jobId}` : jobId;
    if (!/^(tracked|engine)-\d+$|^jd-[a-f0-9]{16}$/.test(key)) throw new HttpError(400, "invalid_request", "Invalid job id.");
    const resumeId = req.query.resumeId ? versionId(req.query.resumeId) : undefined;
    res.json(await svc.getMatchAnalysis(req.user.id, key, resumeId));
  }));

  // ---- review / approval / export
  router.post("/versions/:id/preview", readLimit, wrap(async (req, res) => {
    const body = parse(PreviewSchema, req.body);
    res.json(await svc.previewVersion(req.user.id, versionId(req.params.id), body.decisions));
  }));
  router.post("/versions/:id/approve", readLimit, wrap(async (req, res) => {
    const body = parse(ApproveSchema, req.body);
    res.json(await svc.approveVersion(req.user.id, versionId(req.params.id), body));
  }));
  router.post("/versions/:id/export", exportLimit, wrap(async (req, res) => {
    const { format } = parse(ExportSchema, req.body);
    const idRaw = String(req.params.id);
    const out = await svc.exportVersion(req.user.id, idRaw === "original" ? "original" : versionId(idRaw), format);
    res.set("Content-Type", out.mime);
    res.set("Content-Disposition", `attachment; filename="${out.filename}"`);
    res.set("X-Content-Type-Options", "nosniff");
    res.send(out.buffer);
  }));

  // ---- errors: never leak internals
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err && (err.name === "HttpError" || err.name === "UploadError")) {
      return res.status(err.status || 400).json({ message: err.message, code: err.code, ...(err.extra || {}) });
    }
    console.error("[resume] unexpected error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again.", code: "internal_error" });
  });

  router.service = svc;
  return router;
}

module.exports = { createResumeRouter };
