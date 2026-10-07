# 02 — Ingestion, Discovery, Matching and Apply Engine

This document covers the pipeline behind the tracker: how jobs enter the system, how they are de-duplicated and scored, and how automated application preparation works. Ownership rules (global vs private) are in [docs/01](01_Project_Structure_and_Architecture.md) and [docs/11](11_Roles_Permissions_Platforms_and_Release_Notes.md).

## 1. Single ingestion path

Every job — admin discovery, extension capture, Gmail import, manual tracker — enters through `ingestJob()` (`server/services/ingestionService.js`). One place owns normalisation and de-duplication.

| Step | Detail |
|---|---|
| Resolve source | The **source row decides ownership**: a private source (`manual`, `gmail`, `extension`) requires an owner; a global source never has one, whatever the payload says. |
| Normalise | Lower-case, strip punctuation, collapse whitespace; HTML stripped from descriptions; URLs validated (`jobUrl.js`). |
| Company | Atomic `INSERT ... ON CONFLICT (normalized_name) DO UPDATE ... RETURNING id`. Concurrent ingests of a brand-new company reuse one row instead of failing on the unique constraint. |
| Exact duplicate | Indexed `content_hash` lookup. |
| Fuzzy duplicate | Only on an exact miss: same company, ±14 days, title Jaro-Winkler combined with description TF-IDF cosine similarity; threshold `0.85` (`dedupService.js`). Scoped to the same owner for private jobs. |
| Insert | New rows point at themselves as `canonical_job_id`; duplicates point at the original. Conflict targets match the partial unique indexes. |
| Enqueue | `match:score` on the `match` queue. |

Design choice: de-duplication is **synchronous**, not a queue stage. The candidate set is bounded, and running it inline closes a race in which two near-simultaneous ingests would both pass an asynchronous "no duplicate yet" check. The cost is a little latency on the ingest call.

The extension endpoint (`POST /api/ingest`) enqueues instead of writing inline, with a deterministic job id (`ingest:<origin>:u<userId>:<externalId|hash>`) so repeated clicks cannot enqueue twice; 5 attempts with exponential backoff.

## 2. Job discovery (admin only)

```
POST /api/scrape/run  ->  ScrapeRun(queued)  ->  "scrape" queue  ->  scrapeWorker (concurrency 2)
   -> per-source adapter -> ingestJob() -> ScrapeRun: running -> succeeded | failed | blocked
GET  /api/scrape/runs/:id   (polled by the UI; Cache-Control: no-store)
```

| Source | Method |
|---|---|
| Remotive | Public JSON API; no credentials; remote roles only |
| LinkedIn, Indeed, Naukri, Internshala, Wellfound, Unstop | Playwright, via one shared adapter factory and the same extractor module the browser extension uses (kept in sync by `npm run sync:extractors`, verified by a test) |

- Each adapter reports `ok`, `error`, `blocked` or `unavailable` with a message. A login wall or bot check becomes `blocked` for that source while the others in the run continue. The system does **not** attempt to bypass CAPTCHAs, authentication walls or anti-bot controls.
- Detail pages are visited for at most `SCRAPE_DETAIL_LIMIT` results per run (default 15) to read description, salary/stipend and skills.
- A run row deleted mid-flight (a user clears history) is handled: updates that hit Prisma `P2025` are treated as "nobody to report to", not as crashes.
- The polling endpoint disables ETags/caching: a `304` would make the web client's axios call reject and stop polling.
- The UI stops polling after 45 s still `queued` and tells the user the worker may not be running.
- Playwright Chromium must be installed on the worker host; discovery is inherently less stable than a documented API.

## 3. Matching

```
score = 0.6 * tfidf_cosine(resume, job) + 0.4 * weighted_skill_overlap     (clamped to 0–100)
```

- TF-IDF uses corpus-relative IDF from a sample of recent jobs; skill overlap uses a curated vocabulary (`services/skills.js`) with per-skill weights.
- Every score is stored in `match_scores` with a JSON explanation (matched skills, missing skills, raw similarity). Unique on `(job_id, profile_id, method)`, so two users' scores for one job never collide.
- Score ≥ 70 sets a job's status to `matched` (`matchWorker`, concurrency 4).
- This is **deterministic scoring, not a trained model**. An embedding scorer is defined behind the same interface (`scoreEmbedding`) but is not enabled; the reason for TF-IDF is that each score must be explainable.

### Learning loop

Recorded outcomes adjust per-skill weights: interview +0.05, offer +0.1, rejection −0.02; weights are clamped to [0.1, 3.0] so no single event dominates. It has a cold-start problem: until enough outcomes exist, ranking is TF-IDF plus flat weights.

## 4. Apply engine (human in the loop)

`POST /api/applications/:jobId` queues a preparation job. `applyWorker` (concurrency 2, per-domain Redis rate limiting) opens the posting with Playwright, fills fields it can identify (Greenhouse adapter plus a generic label-based fallback), screenshots the result and stops at `pending_review`. **It never submits.** The user confirms (`POST /api/applications/:id/submit`) and later records the outcome (`/outcome`).

Hardening that came from real-page failures: visibility-aware field resolution (duplicate ids across hidden steps), one retry on a navigation race, and missing-profile failures recorded on the application row instead of only in server logs.

Ownership: `applications` is a per-job engine record with no user column. A user may act on one only through their own `tracked_jobs` row (`ownsApplicationJob`), and may only queue jobs they can see (`visibleJobsWhere`).

Limit: adapter coverage (Greenhouse + generic) bounds how much is hands-off; multi-step wizards fall back to `pending_review` with unmapped fields flagged.

## 5. Analytics

`/api/analytics` computes per-user numbers live from that user's `tracked_jobs` (`WHERE user_id = $1`). A system-wide rollup (`analytics_daily`) is still populated by `analyticsWorker` but is not what the dashboard reads.

```
Applied → Interview = count(status='Interview') / count(*)
Interview → Offer   = count(status='Offer') / count(status='Interview')
Applied → Offer     = count(status='Offer') / count(*)
```

A metric with no denominator renders `—`, not `0%`. **Limitation:** only the *current* status is stored, so the figures mean "share currently at this stage", not "ever reached". Average response time is not computed because the schema has no reliable outcome timestamp. `GET /api/analytics/summary` is admin-only.

## 6. Reminders and push

`reminderService` evaluates, in each user's own timezone and at their chosen hour, interview reminders, application follow-ups (default after 7 days, up to 30 days old) and high-match job alerts (score ≥ 70). Delivery uses Expo push. Exactly-once is guaranteed by inserting a `notification_log` row with a unique `(user_id, dedupe_key)` before sending; if no device accepted the push the row is removed so the next pass retries. Only `ACTIVE` accounts are considered. The scheduler runs in-process, or via `POST /api/notifications/run-reminders` with `CRON_SECRET` (GitHub Actions cron workflow provided for hosts that sleep).
