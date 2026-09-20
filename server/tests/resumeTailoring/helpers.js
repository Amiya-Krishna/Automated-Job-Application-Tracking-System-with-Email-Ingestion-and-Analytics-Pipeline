// Test helpers: a real Express app with the REAL auth middleware and the
// real /api/resume router, backed by the in-memory repo.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.DOTENV_CONFIG_QUIET = "true";
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const auth = require("../../middleware/authMiddleware");
const { createResumeRouter } = require("../../routes/resumeRoutes");
const { createMemoryRepo } = require("../../services/resumeTailoring/repo/memoryRepo");
const { AIProvider } = require("../../services/resumeTailoring/providers/base");

class FakeLlm extends AIProvider {
  constructor(fn, { name = "fake-llm" } = {}) { super(); this.fn = fn; this._name = name; this.calls = []; }
  get usesLLM() { return true; }
  get name() { return this._name; }
  get model() { return "fake-model"; }
  async generateTailoring(req) { this.calls.push(req); return this.fn(req, this.calls.length); }
}

async function startApp({ provider = new AIProvider(), repo = createMemoryRepo(), cors = false } = {}) {
  const app = express();
  if (cors) app.use(require("cors")({ exposedHeaders: ["Content-Disposition"] }));
  app.use(express.json());
  app.use("/api/resume", auth, createResumeRouter({ repo, provider }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api/resume`;
  const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
  const call = async (method, path, { token, body, raw, form } = {}) => {
    const headers = {};
    if (token) headers.token = token;
    let payload;
    if (form) payload = form;
    else if (body !== undefined && !raw) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); } else if (raw) payload = raw;
    const res = await fetch(base + path, { method, headers, body: payload });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
  return { repo, base, origin: base.replace(/\/api\/resume$/, ""), tokenFor, call, close: () => new Promise((r) => server.close(r)) };
}

const LONG_TAIL = "\nWe are a product team building web applications used by customers around the world every single day.";
module.exports = { startApp, FakeLlm, LONG_TAIL };
