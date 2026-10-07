# 11 — Roles, Permissions, Data Isolation, Account Management and Release Notes

All rules below are enforced **server-side**. Hiding a button in a client is a convenience, never the security boundary.

## 1. Roles

`users.role` is `user` (default) or `admin`. The role is read from the database on every admin request (`middleware/requireAdmin.js`), never from a token or from client input, and fails closed.

| Capability | User | Admin |
|---|---|---|
| Tracker, Applied Jobs, Matched Jobs (view), Analytics, Gmail, resume tailoring | ✅ | ✅ |
| Sources page | Manual / Gmail / Extension, **own** data only | The seven fetched sources only; never users' private jobs |
| Companies | Global companies + companies from own jobs | Same rule |
| Job Discovery (UI and `/api/scrape/*`) | ❌ `403` | ✅ |
| Delete catalog jobs / companies / sources (`/api/admin/*`) | ❌ | ✅ |
| Admin console: overview, roles, user management | ❌ | ✅ |
| Block / unblock / delete **another admin** or **yourself** via admin API | n/a | ❌ |
| Delete **own** account (password required) | ✅ | ✅ unless last active admin |

**Becoming an admin**

- `npm run make-admin -- you@example.com` — promotes one specific account (recommended for the first admin).
- `ADMIN_EMAILS=a@x.com,b@y.com` — promotes *existing* accounts at boot; never creates accounts, never demotes. If an address matches more than one account differing only by letter case, **none is promoted** and a warning is logged (this closes a path where someone could register `Boss@x.com` to piggy-back on `boss@x.com`). Because sign-up does not verify email ownership, prefer `make-admin`.
- An admin can change other users' roles in the console but not their own, so at least one admin always remains.

## 2. Global vs private data

| | Global jobs | Private jobs |
|---|---|---|
| Origin | Admin discovery: LinkedIn, Naukri, Remotive, Unstop, Indeed, Wellfound, Internshala | Manual, Gmail, browser extension |
| `job_sources.scope` | `global` | `private` |
| `jobs.owner_user_id` | `NULL` | the owner |
| Visible to | everyone | the owner only (admins see only their own) |

- One source of truth: `server/services/visibility.js` (`visibleJobsWhere`, `visibleJobSql`, `normalizeOrigin`). A trigger (`enforce_job_scope`) refuses an ownerless private job, an owned global job and any change of owner; partial unique indexes keep de-duplication separate for global and per-owner rows.
- The server decides a saved job's origin. A website name sent by the extension is stored as `tracked_jobs.platform`. `POST /api/ingest` can only create the caller's private jobs.
- **Sources**: users get Manual/Gmail/Extension with their own counts; admins get the seven fetched sources with global jobs only. A source of the other audience is `404`.
- **Companies**: visible if reachable through a global job, one of the caller's private jobs, or one of the caller's tracked companies; a company that exists only because someone else saved a private job is `404`.
- **Notifications**: every row has `user_id`; every query filters by the caller; foreign ids are `404`. Web and mobile hold no cross-user cache and clear it on logout.
- Verified by `server/tests/isolation/` (two users and an admin over HTTP) and, on real PostgreSQL, the migration backfill, trigger and scoped ingest.

## 3. Account lifecycle

### Status and token model

`users.status` is `ACTIVE` or `BLOCKED` (`CHECK` constraint), with `blocked_at` and `token_version`. `authMiddleware` loads the account on every request:

| Situation | Response |
|---|---|
| Account deleted | `401 token_invalid` |
| Account blocked | `403 account_blocked` ("Your account has been blocked. Please contact an administrator.") |
| Token `tv` ≠ `users.token_version` | `401 token_invalid` |
| Login with correct password, blocked (web, mobile, extension, admin door) | `403 account_blocked`; no session issued. Checked only after the password, so it cannot probe which emails are blocked |
| `POST /api/auth/refresh`, blocked | `403 account_blocked`; token family revoked, web cookie cleared |
| `GET /api/auth/me`, blocked | `403 account_blocked` |
| Gmail OAuth callback, blocked or deleted | no grant saved (`updateMany ... status = ACTIVE`) |
| Push reminders | blocked users skipped |

### Block and unblock (admin, normal users only)

`POST /api/admin/users/:id/block` sets `BLOCKED`, `blocked_at`, increments `token_version` and revokes all refresh sessions in **one transaction**. Nothing is deleted. `POST .../unblock` restores `ACTIVE`; tokens issued before the block stay dead, so the user signs in again.

### Account deletion

One implementation (`services/accountDeletion.js`) serves both `DELETE /api/auth/account` (self) and `DELETE /api/admin/users/:id`, in **one transaction**.

| Deleted (private to the account) | Preserved (global) |
|---|---|
| Tracked jobs (manual, Gmail, extension), private jobs and their applications/match scores, scrape runs | Jobs with `owner_user_id IS NULL`, companies, job sources |
| Profile and every match score computed for it | Other users' data, including their match scores and tracked jobs for global jobs |
| Resumes, facts, analyses, versions, changes, job descriptions, tailoring sessions | A global job that named a deleted private job as its canonical duplicate has that pointer cleared |
| Login sessions (every refresh token dies), push devices, notification preferences / log / inbox | |
| Gmail grant revoked at Google (best effort; never blocks the deletion) | |

Details that matter: the target's role is re-read inside the transaction; deleting an administrator runs at Serializable isolation and is retried once on a serialization conflict; a foreign-key race with a background scorer is retried once. The access token stops working immediately because the account row is gone.

**Self-deletion** takes `{ "password": "..." }`; there is no id parameter (no IDOR). Rate-limited (`RL_DELETE_MAX`, default 5/hour).

| Status | Meaning |
|---|---|
| `200` | Deleted |
| `400` | Password missing or wrong |
| `401` | Not authenticated |
| `403 account_blocked` | Blocked users cannot self-delete |
| `409 last_admin` | Caller is the last active administrator |
| `429` | Rate limited |

The web (Profile → Danger zone) and mobile (Settings → Delete account) clients additionally require typing `DELETE`, list what is removed, then clear the session and local caches.

### Admin user management

| Method & path | Purpose |
|---|---|
| `GET /api/admin/users?q=&status=&role=&page=&pageSize=` | Paged list (max 200). Never returns password hashes, tokens or the Gmail grant (only `gmailConnected`) |
| `POST /api/admin/users/:id/block` · `/unblock` | See above; idempotent |
| `DELETE /api/admin/users/:id` | Delete a normal user |
| `PATCH /api/admin/users/:id/role` | Change role (not your own) |
| `GET /api/admin/overview` | Headline counts incl. `blockedUsers` |

Guards on block / unblock / delete: invalid id `400`; own account `400 cannot_modify_self`; unknown `404`; target is an admin `403 cannot_manage_admin`; non-admin caller `403 admin_required`; anonymous `401`. The target always comes from the URL and is re-loaded from the database.

There is no admin UI on mobile or in the extension; user management is web-only.

## 4. Catalog deletion (admin)

`DELETE /api/admin/jobs/:id`, `/companies/:id`, `/sources/:id` run in one transaction (`services/catalogDeletion.js`):

- Only **global** jobs and sources are deletable; a user's private job is not even findable here.
- A company or source with jobs returns `409` unless `?withJobs=true`; a company still referenced by a user's private jobs returns `409 in_use_by_users`.
- A job with an in-flight application (`queued`, `pending`, `applying`, `processing`, `running`) returns `409`; nothing is deleted.
- Users' `tracked_jobs` are never deleted; their `engine_job_id` link is set to `NULL`. Duplicates pointing at a deleted canonical job are removed with it.

## 5. Job platforms

Discovery and the extension support LinkedIn, Indeed, Naukri, Internshala, Wellfound and Unstop (plus Remotive in discovery). Extraction is layered per field: platform selectors → schema.org `JobPosting` JSON-LD → page title/meta; a missing field is omitted, never invented. The server keeps a verified copy of the extension's extractor (`npm run sync:extractors`; a test fails if they drift). Saved URLs are canonicalised, and the server accepts only `http(s)` URLs without embedded credentials.

## 6. Migration history

| Migration | Purpose |
|---|---|
| `20260801000000_baseline_core_tables` | Core tables, so an empty database can be built from the repository (no-op on existing databases) |
| `20260820000000_engine_bridge_scrape_runs_and_user_scoped_profile` | Tracked-job source fields, `scrape_runs`, per-user profiles and match scores |
| `20260823000000_tracked_jobs_user_engine_job_unique` | One tracked job per (user, engine job) |
| `20260919000000_resume_tailoring` · `20260920000000_resume_manager` | Resume tailoring tables; active-resume choice |
| `20260929000000_mobile_sessions_push` | Refresh-token sessions, push devices, preferences, notification log |
| `20261003000000_roles_platforms_job_details` | `users.role`, salary and skills columns |
| `20261004000000_ownership_scopes_and_notifications` | Global vs private jobs (scope, owner, trigger, partial indexes), notification inbox |
| `20261006000000_user_account_status` | `status`, `blocked_at`, `token_version`; `match_scores.profile_id` cascades |

All are additive and idempotent. Release process: `npx prisma migrate deploy` (never `migrate dev` in production), `npx prisma generate`, then restart API and worker.

## 7. Current release notes

**Account management hardening pass**

- Added: idempotent baseline migration; real-PostgreSQL migration-chain test; CI PostgreSQL service so database tests run on every change.
- Fixed: `ADMIN_EMAILS` bootstrap could promote an account registered under a case variant of an admin address.
- Fixed: a password reset did not invalidate already-issued 7-day legacy access tokens (it now increments `token_version`).
- Fixed: auth routes could echo internal error text on `500`.
- Fixed: the deletion service now re-reads the target's role inside the transaction.

## 8. Known limitations

- Selectors for Naukri, Internshala, Wellfound and Unstop come from public markup and fixtures; they were not verified against the live sites, which change often and may block automated browsers.
- Discovery needs the worker process, Redis and Playwright Chromium.
- Gmail scanning needs your own Google OAuth credentials and a verified consent screen for production use.
- Role changes apply on the next API call; web clients need a reload to show new navigation.
- Email addresses are not verified at sign-up; email comparison is case-sensitive.
