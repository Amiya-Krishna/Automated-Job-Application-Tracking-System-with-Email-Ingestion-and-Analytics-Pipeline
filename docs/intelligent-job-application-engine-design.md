# Intelligent Job Application Engine (Decision-Based + Semi-Automated)
### System Design — upgrade path from TrackTrail (current: Node/Express + PostgreSQL + browser extension)

> **Note on your current stack vs. this design:** the repo now runs Express 5
> on a single hosted PostgreSQL database — the original Mongo/Mongoose
> auth+tracker layer has been migrated over (see "Migration Notes" at the
> bottom, updated to reflect what's actually done). A browser extension
> (`content.js`) still does the LinkedIn/Indeed manual capture, feeding the
> same `/api/ingest` entrypoint this doc designs for the Playwright scraper.
> The rest of this document describes the *target* engine (matching, dedup,
> semi-automated apply, analytics) built on top of that now-unified Postgres
> database.

---

## 1. High-Level Architecture

Four services, one shared Postgres instance, one Redis instance for queues/cache. Everything async and worker-driven — the API layer never blocks on scraping, matching, or browser automation.

```
                         ┌─────────────────────────┐
                         │   Browser Extension      │
                         │ (existing capture path)  │
                         └────────────┬─────────────┘
                                      │ POST /ingest (manual capture)
                                      ▼
┌──────────────┐   enqueue    ┌───────────────┐   enqueue    ┌──────────────────┐
│  Playwright    │───────────▶│  Ingestion API  │───────────▶│  Redis Queues     │
│  Scrapers      │  scrape:*  │  (Express)      │  match:*    │  (BullMQ)         │
│  (LinkedIn,    │            │                 │  apply:*    │                   │
│   Indeed)      │            └───────┬─────────┘  analytics:*└─────────┬─────────┘
└──────────────┘                     │                                 │
                                       │ writes                         │ consumes
                                       ▼                                 ▼
                            ┌───────────────────┐            ┌───────────────────────┐
                            │   PostgreSQL       │◀──────────│  Worker Pool           │
                            │  (jobs, companies, │  writes   │  - MatchWorker         │
                            │  applications,      │           │  - DedupWorker         │
                            │  match_scores,      │           │  - ApplyWorker         │
                            │  user_profile,      │           │  - AnalyticsWorker     │
                            │  job_sources)       │           └───────────┬───────────┘
                            └─────────┬──────────┘                       │
                                      │                                  │ drives (headed)
                                      ▼                                  ▼
                            ┌───────────────────┐            ┌───────────────────────┐
                            │  REST API           │◀─────────│  Playwright Apply       │
                            │  (jobs, analytics,   │  status  │  Session (human-in-loop)│
                            │  apply-review)       │  updates │                         │
                            └─────────┬──────────┘            └───────────────────────┘
                                      │
                                      ▼
                            ┌───────────────────┐
                            │  React Dashboard    │
                            └───────────────────┘
```

**Services:**

1. **Ingestion pipeline** — extends your existing capture. Two sources feed the same table: (a) Playwright scrapers running on a schedule (cron via BullMQ repeatable jobs), (b) your existing browser extension for ad-hoc manual capture. Both write through the same `POST /internal/ingest` endpoint so dedup/normalization logic lives in one place instead of being duplicated in the extension and the scraper.
2. **Matching service** — a worker that consumes `match:score` jobs, runs TF-IDF (v1) or embedding similarity (v2) against the user's profile, writes to `match_scores`.
3. **Apply service** — queue-based, Playwright-driven, but stops before the final submit click (human-in-the-loop). Emits `apply:pending_review` events the dashboard subscribes to.
4. **Analytics service** — scheduled aggregation worker + read-optimized API endpoints (materialized views, not live joins, once volume grows).

**Why queue-based instead of synchronous request/response:** scraping and Playwright automation are slow (seconds to minutes) and flaky (timeouts, layout changes, CAPTCHAs). Putting them behind a queue means the API stays responsive, retries are centralized, and you get a natural audit trail (queue job history) for free — this is the single biggest "why did you design it this way" answer you'll give in an interview.

---

## 2. Data Flow

```
1. Scrape trigger (cron, every N hours) or manual save (extension)
      → raw HTML/JSON payload
2. Ingestion API normalizes payload → checks job_sources + companies
      → enqueue `dedup:check`
3. DedupWorker: fuzzy-match against existing jobs
      → if duplicate: link to existing job_id, mark source as secondary listing
      → if new: INSERT into jobs (status = 'new')
      → enqueue `match:score`
4. MatchWorker: pulls job + user_profile
      → runs TF-IDF or embedding scorer
      → INSERT into match_scores
      → if score > threshold: mark job status = 'matched', enqueue `notify:matched` (optional)
5. User reviews matched jobs on dashboard → clicks "Prepare Application"
      → enqueue `apply:prepare`
6. ApplyWorker (Playwright): opens job page, autofills known fields,
      pauses at submit → status = 'pending_review'
7. User manually reviews & clicks submit in the browser session (or confirms via dashboard)
      → status = 'applied', applied_at = now()
      → enqueue `analytics:recompute`
8. Outcome updates (interview/rejected) come in via dashboard forms
      → AnalyticsWorker recomputes aggregates
      → LearningLoop adjusts scoring weights
```

Every arrow above is a queue message, a DB write, or an API call — nothing in this pipeline is a synchronous chain of function calls, which is what makes it recoverable (any stage can crash and be retried without losing state).

---

**Design notes (interview-relevant):**
- `canonical_job_id` self-referencing FK is the dedup backbone: duplicates point to the "real" job, so `applications` only ever needs a FK to the canonical row — you physically cannot apply twice to the same job even if it was scraped from both LinkedIn and Indeed.
- `content_hash` gives an O(1) exact-duplicate check before falling back to the more expensive fuzzy-match pass (section 5).
- `explanation JSONB` on `match_scores` is what turns "we compute a score" into "we can explain the score" in the UI — cheap to add, high UX/interview value.
- `resume_embedding VECTOR(768)` requires the `pgvector` extension (`CREATE EXTENSION vector;`) — mention this explicitly if asked, since plain Postgres doesn't have vector similarity ops.

---

## 3. Matching Engine

### (A) Free version — TF-IDF / keyword-based

**Preprocessing:**
1. Lowercase, strip HTML/markdown from job description.
2. Tokenize, remove stopwords, lemmatize (e.g. `natural` or `compromise` in Node, or call a small Python microservice with `spaCy`/`nltk` if you want better lemmatization).
3. Extract a **skills vocabulary** — a curated list (React, Node.js, PostgreSQL, Docker, ...) you maintain, plus generic n-gram extraction for anything not in the list.
4. Build TF-IDF vectors: corpus = all scraped job descriptions (IDF improves as your corpus grows), document = job description, query = resume text.

```

**Tradeoffs:** fast, free, fully explainable (you can literally show which words drove the score), but blind to synonyms — "ML" vs "machine learning", "React" vs "React.js" need a synonym map you maintain by hand. Precision drops on jobs with generic descriptions.

### (B) Advanced version — embeddings-based

**Preprocessing:** same cleanup, but no stopword removal/stemming needed — embedding models handle semantics natively. Chunk long job descriptions if they exceed the model's context window (rare for job postings, but resumes with lots of project detail can run long).

```

**Tradeoffs:** captures semantic matches TF-IDF misses ("led a team of engineers" ~ "management experience"), but costs money per call (or GPU if self-hosted), is a black box for the "explanation" requirement, and needs `pgvector` + an ANN index (`ivfflat` or `hnsw`) once you have more than a few thousand jobs, or cosine-similarity scans get slow.

**Recommendation for a 2–4 week resume project:** ship (A) as the default, add (B) as an optional "smart mode" toggle. This is a stronger interview answer than shipping only embeddings — it shows you understand when the simpler, cheaper, explainable approach is the right engineering call, not just the fancier one.

---

## 4. Apply Engine (Semi-Automated, Playwright)

**Flow:**
```
ApplyWorker.process(job):
    1. launch persistent browser context (reuse cookies/session across runs)
    2. navigate to job.source_url
    3. detect page type:
         - "Easy Apply" style (LinkedIn) → in-page modal form
         - External redirect (many Indeed listings, most companies) → follow redirect, land on ATS (Greenhouse/Lever/Workday)
    4. formFieldMapper.detect(page) → returns a field map { name, email, phone, resume_upload, ... }
       (built via a library of known ATS DOM signatures + a generic fallback: label-text matching)
    5. for each known field in map: fill from user_profile
    6. for unknown/custom fields (e.g. "why do you want to work here?"): leave blank, flag for user
    7. STOP before clicking Submit. Take a screenshot, save playwright_log.
    8. set applications.status = 'pending_review'
    9. surface in dashboard: "Ready — 8/10 fields filled, 2 need your input"
    10. user reviews in a live/headed browser tab (or a screen-share style session) and clicks submit themselves
```

**Handling dynamic forms:** maintain a small registry of ATS "adapters" (Greenhouse, Lever, Workday, LinkedIn Easy Apply each have fairly stable DOM patterns) with a generic fallback adapter that matches `<label>` text to field types via fuzzy string match. New/unrecognized ATS platforms fall back to: fill what you can via `autocomplete` attributes and `name`/`id` heuristics, flag everything else.

**Failures:**
- **Timeouts:** wrap every `page.goto` / `page.click` in a retry with exponential backoff (max 3 attempts), then mark `applications.status = 'failed'`, `failure_reason`.
- **Broken pages / layout changes:** wrap field detection in try/catch per-field, not per-page — one broken selector shouldn't fail the whole run. Log which fields failed so you can patch the adapter.
- **CAPTCHA:** detect via known selectors (`iframe[src*=recaptcha]`, hCaptcha markers) or a timeout heuristic (page stuck > N seconds with no navigation). On detection: **pause the job, set status = 'needs_captcha'**, surface a "solve manually" action in the dashboard that hands control of that specific browser session to the user, then resumes the worker once solved.

**Rate limiting / anti-bot considerations:**
- Random delays between actions (`sleep(random(800, 2500))` ms) instead of instant fills — instant, uniform timing is the single easiest bot signal.
- Cap applications per domain per hour (e.g. max 5/hour to any single ATS domain) via a Redis-backed token bucket per source domain.
- Reuse a persistent, "warmed" browser profile per platform (real cookies, real session) rather than a fresh headless context every time — cold, cookie-less sessions from a datacenter IP are the most common trigger for bot-detection.
- Respect `robots.txt` / ToS realistically: this system is explicitly designed as **assistive, human-in-the-loop** — it never submits without you, which is both the right engineering call and the honest answer if an interviewer asks about ToS/ethics.

---

## 5. Job Deduplication

**Two-stage approach:**

**Stage 1 — exact/near-exact (fast path):** compare `content_hash = sha256(normalized_title + normalized_company + first_500_chars_of_description)`. Catches identical postings re-scraped on a schedule, or the same listing appearing verbatim on both platforms.

**Stage 2 — fuzzy match (for re-worded cross-platform postings):**
```
function findDuplicate(newJob):
    candidates = jobs.where(
        company_id = newJob.company_id,
        posted_at BETWEEN newJob.posted_at - 14 days AND newJob.posted_at + 14 days
    )
    for candidate in candidates:
        titleSim = jaroWinkler(newJob.normalized_title, candidate.normalized_title)
        descSim  = cosineSimilarity(tfidfVec(newJob.description), tfidfVec(candidate.description))
        combinedScore = 0.4 * titleSim + 0.6 * descSim
        if combinedScore > 0.85:
            return candidate   # treat as duplicate
    return null   # genuinely new job
```
Narrowing candidates by `company_id` + a date window before running the expensive similarity check keeps this from becoming an O(n²) scan as the jobs table grows — this narrowing step is usually the detail interviewers probe for, since naive dedup implementations skip it and don't scale past a few thousand rows.

On duplicate: insert the new row anyway (for audit/history — you still want to know it was seen on Indeed too), but set `canonical_job_id` to the existing job's id, and leave `status` as an inert `'duplicate'` so it never enters the matching/apply pipeline twice.

---

## 6. Analytics Dashboard (Backend)

**Metrics:** total scraped, matched, applied, response rate, interview conversion.

Store this as a materialized view (`analytics_daily`) refreshed by the worker rather than computing it live on every dashboard load — at low volume it doesn't matter, but it's the right answer when asked "how would this scale."

**API endpoints:**
```
GET  /api/engine/jobs?status=matched&minScore=70&page=1
GET  /api/engine/jobs/:id
POST /api/applications/:jobId       -> enqueues apply:prepare
GET  /api/applications?status=pending_review
POST /api/applications/:id/submit   -> user confirms manual submit, sets status='applied'
POST /api/applications/:id/outcome  -> body: { status: 'interview' | 'rejected' | 'offer' }
GET  /api/analytics/summary?range=30d
GET  /api/analytics/funnel          -> scraped -> matched -> applied -> interview -> offer
```

*(These are the actual mounted routes — `engineJobsRoutes.js`, `applyRoutes.js`,
`analyticsRoutes.js` — see [API_ENDPOINTS.md](API_ENDPOINTS.md) for full
request/response shapes.)*

---

## 7. Learning Loop

**Concept:** treat outcomes as labeled training signal for a lightweight per-skill/per-keyword weight vector, not a full model retrain — this is realistic to implement in 2–4 weeks, a full ML retraining pipeline is not.

This is simple enough to explain end-to-end in an interview (it's essentially a bandit-style weight update, not a black box), and directly answers "how does the system improve over time" without requiring you to stand up a training pipeline.

---

## 8. Interview Discussion Points

| Component | Why this design | Tradeoffs | Scaling considerations | Likely questions |
|---|---|---|---|---|
| Queue-based architecture | Decouples slow/flaky I/O (scraping, browser automation) from the API; centralizes retries | Extra infra (Redis) and eventual-consistency UX (statuses update async) vs. a simpler synchronous monolith | Add more workers horizontally; partition queues by source/priority | "Why not just call Playwright synchronously from the API route?" |
| `canonical_job_id` self-FK dedup | One `applications` row per real job, physically enforced by a unique constraint | Requires a correct dedup pass *before* insert, or you get orphaned duplicates | Narrow candidates by company+date window before fuzzy match to avoid O(n²) | "How do you handle a false-positive dedup merge?" |
| TF-IDF default, embeddings optional | Explainable, free, fast to ship; embeddings added as opt-in | Embeddings score better semantically but cost money/compute and are harder to explain | pgvector + ANN index (ivfflat/hnsw) once job count grows past a few thousand | "Why not embeddings from day one?" |
| Human-in-the-loop apply | Real ToS/ethical constraint + safety net against broken auto-fills | Slower than full automation, but avoids garbage submissions and account bans | Rate-limit per domain via Redis token bucket; adapter registry per ATS | "How do you handle CAPTCHA?" / "What stops this from spamming applications?" |
| Learning loop as weight updates, not model retraining | Realistic for a 2–4 week solo project; still demonstrably "learns" | Not a real ML model — say this proactively, it shows judgment | Could later become a real logistic regression over `match_scores` + outcomes once you have enough labeled data | "How would you turn this into a proper ML model later?" |

---

## Migration Notes from Your Current TrackTrail Repo

1. **MongoDB → PostgreSQL: done.** `users` and `tracked_jobs` tables now live
   in `db/schema.sql` alongside the engine tables, and `models/User.js` /
   `models/Job.js` are plain functions over the shared `pg` pool instead of
   Mongoose schemas — there's a single database for the whole app now, not a
   dual-write or a long-term Mongo/Postgres split.
2. **Browser extension stays** — repurpose it as one of the two ingestion paths (manual capture) alongside the new Playwright scheduled scraper, both writing through the same normalization/dedup entrypoint.
3. **Auth (JWT + bcrypt, already in `authRoutes.js`)** carries over as-is; it's orthogonal to this redesign — only its storage layer changed (Postgres instead of Mongo).
4. **Remaining pieces to build, in rough priority order for a 2–4 week build:** dedup logic → TF-IDF matcher → analytics endpoints → Playwright apply skeleton (generic adapter only, skip per-ATS adapters until the core loop works) → learning loop last, since it depends on having real outcome data to be meaningful. (The Postgres schema/migration step that used to head this list is already in place.)
