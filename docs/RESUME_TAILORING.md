# AI-Powered Job-Specific Resume Tailoring

One central backend service (`server/services/resumeTailoring/`, HTTP at
`/api/resume/*`) used by the web client, the mobile app and the browser
extension. The clients only extract, authenticate, call the API and display
results — none contains tailoring logic or AI credentials.

```
Extension ─┐
Mobile ────┼─▶ /api/resume/* ─▶ service.js ─▶ resumeParser ─▶ jdAnalyzer ─▶ matcher
Web ───────┘        (auth, rate-limit,             │
                     validation)                    ▼
                                    engine.js ─▶ AIProvider (optional LLM: rewrites only)
                                        │                   │
                                        ▼                   ▼
                              evidenceValidator  ◀── every proposal checked
                                        │
                                        ▼
                    verifyResult (structural invariant) ─▶ ResumeVersion + ResumeChange rows
```

## The no-fabrication guarantee — how it is enforced

The rule is enforced in layers, and **none of them depends on an LLM behaving**:

1. **No "add" operation exists.** Output is the original profile plus a list of
   typed changes: `reorder` (a permutation of an existing list) or `rewrite`
   (new text for one *existing* bullet/summary/skill). Adding a job, project,
   skill, degree, certification, title or company is impossible by construction
   (`profileOps.applyChanges`).
2. **Deterministic evidence.** Resume parsing, JD analysis and matching are
   deterministic (no LLM). Every fact is a verbatim span of the resume, has an id
   and `confidence: 1.0`. A requirement is `MATCHED` only if the term (or a
   taxonomy-equivalent alias) literally appears; `PARTIAL_MATCH` (related
   evidence, e.g. GCP for AWS) is never treated as having the skill;
   otherwise `NOT_FOUND` ("Missing / Not found in your profile").
3. **Evidence validator on every rewrite** (`evidenceValidator.js`). A rewrite
   may only use words, skills and numbers already present in *its own*
   bullet + that entry's header/tech line (summary: the whole resume) — so
   "Docker from another project" cannot leak in. It rejects invented numbers,
   skills, employers/entities, seniority/outcome wording ("led", "scalable",
   "production-grade", "improved"…), JD requirements the resume lacks, prompt-injection
   artefacts, and any wording outside a small neutral allow-list. Rejected
   rewrites fall back to the user's original text and are listed as
   *unsupported claims* (shown to the user).
4. **Final structural verification** (`engine.verifyResult`) re-proves, before
   anything is stored/approved/exported, that the result is *source + allowed
   edits*, and re-validates every rewrite independently of the provider (a
   compromised provider validator is tested: `api.test.js`).
5. **The model never sees the job description text** — only vetted requirement
   labels — and never sees contact details. Resume bullets that look like
   instructions are withheld from the model. Model-written "reasons"/"evidence"
   are ignored; reasons shown to users are generated server-side.
6. **User approval.** Nothing is applied silently. Undecided changes are treated
   as rejected. The original resume is immutable; each tailored version stores
   its own snapshot.

If no LLM is configured the feature still works: skills / projects / bullets are
re-ordered by relevance and skill spellings are aligned to the JD (only where
the taxonomy says it is the same skill). The strictness of the validator means
LLM rewrites are deliberately conservative.

## API (all require the `token` header; every query is scoped to the user)

| Method & path | Purpose |
|---|---|
| `GET /api/resume/current` | The resume that will be used (original) |
| `GET /api/resume/resumes` | **All** resumes (active flagged) with file type, date, parsed-facts count and their tailored versions |
| `GET /api/resume/resumes/:id` | One resume + its parsed text (for viewing) |
| `POST /api/resume/resumes/:id/activate` | "Use for tailoring" — choose the active resume |
| `DELETE /api/resume/resumes/:id` | Delete an uploaded resume and its tailored versions (the profile-text resume can't be deleted) |
| `POST /api/resume/upload` | multipart `file` (PDF/DOCX ≤ 2 MB), optional `syncProfile=true` |
| `GET /api/resume/original/file` | Download the uploaded original file |
| `POST /api/resume/analyze` | `{ job, resumeId? }` → match analysis (deterministic, cached, no LLM) |
| `POST /api/resume/tailor[?wait=true]` | `{ job, resumeId?, regenerate? }` → `202` session (or `200` with `wait`) |
| `GET /api/resume/sessions/:id` | Real stage: `analyzing_resume → analyzing_jd → matching → generating → validating → ready` |
| `GET /api/resume/tailored/:id` | Version with changes, evidence, unsupported claims |
| `GET /api/resume/versions` | Original + all tailored versions |
| `GET /api/resume/match-analysis/:jobId` | `:jobId` = tracked id, `tracked-N`, `engine-N`, or `jd-<hash>` |
| `POST /api/resume/versions/:id/preview` | `{ decisions }` → resulting resume text (server applies decisions) |
| `POST /api/resume/versions/:id/approve` | `{ action: accept_all \| reject_all \| review, decisions? }` |
| `POST /api/resume/versions/:id/export` | `{ format: txt\|md\|html\|docx\|pdf }`; `:id` may be `original`; drafts are refused |

`job` = exactly one of `{ trackedJobId }`, `{ engineJobId }`, or a pasted /
extension JD `{ title, company, description, … }` (a description may also be
supplied alongside an id for jobs that have none stored).
Errors: `{ message, code }` — e.g. `no_resume`, `jd_too_short`, `resume_unreadable`,
`no_matching_skills`, `rate_limited`, `session_in_progress`.

## Resume manager (web, browser extension, mobile)

One backend, one set of records. The web client, the browser extension ("My Resumes" in the dashboard)
and the mobile app (Profile → My Resumes) all read `GET /api/resume/resumes`; there are no client-local resumes.

- **Upload** (`POST /api/resume/upload`, PDF/DOCX): the file goes only to the backend, which does all size, magic-byte and
  ZIP validation, parsing, fact extraction and storage. A new upload becomes the active resume.
- **Active resume**: the most recently chosen ("Use for tailoring") or uploaded resume; if the user later edits their profile
  text to something different, the newer profile text wins (the previous behaviour). Every `analyze` / `tailor` call may also
  pass an explicit `resumeId` for one job without changing the active resume.
- **Browser extension**: on **Tailor Resume** it lists the resumes; one resume is used automatically, several show
  *Select resume for this job → Continue to Analysis*, and the chosen `resumeId` is used for both the analysis and the tailoring.
  **View Full Analysis** opens `/tailor?analysis=…&resume=<id>` in the web app.
- **Mobile**: lists resumes, switches the active one, shows versions and opens them, and starts tailoring from a job.
  Uploading a file is a secure hand-off to the web app (native document picking would add a native module that could not be
  verified here); uploads then appear in the app automatically.
- Deleting a resume also deletes its tailored versions (database `ON DELETE CASCADE`, verified on Postgres).

## Data model (migration `20260919000000_resume_tailoring`, purely additive)

`resumes`, `resume_facts`, `job_descriptions`, `resume_analyses`,
`resume_versions`, `resume_changes`, `tailoring_sessions`. No existing table or
column is modified. Parsing is cached per resume, JD analysis per JD hash,
analysis per (resume, JD, taxonomy version); re-tailoring the same job+resume
reuses the existing version (no LLM call) unless `regenerate` is set.

## AI Provider Configuration

The AI provider is used for exactly one thing: **proposing rewordings of existing
bullets/summary**. It never parses resumes or job descriptions, matches skills,
extracts evidence, authorizes anything, or validates its own output — those stay
deterministic. Every proposal, whichever provider produced it, goes through the
same pipeline:

```
Web / Mobile / Extension ─▶ TrackTrail API ─▶ Resume Tailoring Engine ─▶ AI Provider Factory
                                                                          │  (none | gemini | groq | openrouter | …)
                                                                          ▼
                                             Adapter: build request / read response, retry, timeout
                                                                          ▼
                                                        Schema validation (zod)
                                                                          ▼
                                             Evidence validation (no-fabrication rules)
                                                                          ▼
                                             Structural validation (source + allowed edits)
                                                                          ▼
                                                            Save resume version
```

Supported `AI_PROVIDER` values: `none` (default), `gemini`, `groq`, `openrouter`,
plus the previously supported `anthropic`, `openai` and `openai-compatible`.
**API keys are configured only in the backend environment** (`server/.env`, or your
host's secret store). Never put them in `client/.env`, `mobile/.env`, or the extension.

### Gemini (Google)
```env
AI_PROVIDER=gemini
AI_API_KEY=...            # from Google AI Studio
AI_MODEL=...              # a model id from Google's current model list
```
Uses the Gemini `generateContent` API with the key in the `x-goog-api-key` header
(never in the URL). Default base URL `https://generativelanguage.googleapis.com/v1beta`.

### Groq
```env
AI_PROVIDER=groq
AI_API_KEY=...
AI_MODEL=...
AI_BASE_URL=https://api.groq.com/openai/v1
```
OpenAI-compatible; the shared OpenAI-style request/response code is reused.

### OpenRouter
```env
AI_PROVIDER=openrouter
AI_API_KEY=...
AI_MODEL=...              # OpenRouter ids look like "vendor/model"
AI_BASE_URL=https://openrouter.ai/api/v1
```
OpenAI-compatible. Optional, non-secret attribution headers can be set with
`AI_OPENROUTER_REFERER` / `AI_OPENROUTER_TITLE`.

### Models
There is **no default model** anywhere in the code — set `AI_MODEL` explicitly and
change it any time without a code change. Availability, pricing and free-tier limits
change and differ per provider; check each provider's current official documentation.
This project does not assume any model or quota is free or permanent. If the model id
is wrong the provider returns an HTTP 4xx, which is surfaced (not silently retried or
hidden by fallback) and tailoring degrades to the deterministic reorder-only mode.

### Fallback (optional)
```env
AI_PROVIDER=gemini
AI_API_KEY=...
AI_MODEL=...
AI_FALLBACK_PROVIDER=groq
AI_FALLBACK_API_KEY=...
AI_FALLBACK_MODEL=...
AI_FALLBACK_BASE_URL=     # optional
```
The fallback is tried **only** for transient provider-side failures, after the
primary has used its own retries: timeouts, network errors, rate limits (429) and
provider 5xx. It is **not** used for auth errors (401/403), bad requests or unknown
models (4xx), malformed or schema-invalid output, or provider safety blocks —
those are surfaced instead of being masked by another vendor. A fallback on a
*different* vendor needs its own key (the primary key is never reused for another
vendor). The fallback's answer receives no special treatment: it passes through the
identical schema → evidence → structural validation. The version records which
provider actually served it (`aiProvider` / `aiModel`).

### Behaviour on failure
Any provider failure (or a missing/invalid configuration) never breaks tailoring: the
user still gets safe reorder-only suggestions plus a warning. An unusable
`AI_BASE_URL` (not https, or containing credentials) or an unsafe `AI_MODEL` for
Gemini is refused **before** any key is sent.

### Logging
Provider calls log one metadata-only line: provider, model, duration, status, retry
count, fallback events. Logs never contain API keys, resume/JD text, prompts,
responses or tokens (`AI_LOG_LEVEL=silent` turns them off).

### Verification status
Adapters are covered by mocked-HTTP tests only (success, malformed JSON, HTTP
400/401/403/429/5xx, timeouts, retries, fallback, security). **They have not been
exercised against the real Gemini, Groq or OpenRouter APIs** in this repository's
tests; do a real smoke test with your own key before relying on a provider.

## Configuration

See `server/.env.example` and **AI Provider Configuration** below. Mobile: optional
`EXPO_PUBLIC_WEB_URL`. Extension: `DEFAULT_WEB_APP_URL` in `config.js`. AI keys
are server-only and appear in none of the clients.

## Install / run / test

```bash
cd server && npm install && npx prisma migrate deploy && npx prisma generate
npm test                          # 100+ tests, incl. adversarial safety + provider/security tests
cd ../client && npm install && npm test && npm run build
cd ../browser-extension && npm install && npm test
cd ../mobile && npm install && npm run test:integration && npx tsc --noEmit
```

## Known limitations

- **PARTIAL/related logic is taxonomy-driven** (`skillTaxonomy.js`, ~200 skills). Skills
  outside it are only matched literally (a few tech-shaped tokens after cues like
  "experience with …"). Extend the taxonomy to widen coverage.
- **Resume parsing is heuristic.** Unusual layouts (multi-column PDFs, tables,
  scanned images) can fail; the API then says *"We couldn't reliably extract your
  resume"* instead of guessing. Years-of-experience and degree requirements are
  listed for manual review, never inferred.
- **PDF export uses built-in fonts** (Latin/WinAnsi): other scripts export as `?`.
  DOCX/HTML/TXT/MD export is unaffected.
- **Sessions run in-process** (not on the BullMQ worker). A server restart
  mid-run leaves the session to time out (5 min) and the user can retry.
- **Rate limiter is in-memory per instance.**
- **Browser extension** supports LinkedIn and Indeed job pages only (matching the
  existing manifest); other career sites can use the web app's "paste job
  description". URL-based server-side JD import is intentionally not implemented
  (SSRF risk).
- **Mobile** has no resume file upload (use the web app, or paste text in
  Profile); export is "share as text" plus a link to the web app for PDF/Word.
