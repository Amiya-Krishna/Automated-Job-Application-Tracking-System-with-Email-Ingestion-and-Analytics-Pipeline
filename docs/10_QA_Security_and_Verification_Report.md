# 10 — QA, Security and Verification Report

Final production-readiness pass over the account-management release. Everything here was run, not assumed; items that could not be verified are listed in §7.

## 1. Test and build results

| Package | Command | Result |
|---|---|---|
| Server | `npm test` with a real PostgreSQL 16 (`TEST_DATABASE_URL`) | **311 / 311 pass**, 0 skipped |
| Server | `npm test` without a database | 304 pass, 7 skipped (the real-PostgreSQL tests), 0 fail |
| Web | `npm test` · `npm run lint` · `npm run build` | **54 / 54 pass** · lint clean · build succeeds |
| Extension | `npm test` | **92 / 92 pass** |
| Mobile | `npm test` · `npm run typecheck` · `npm run lint` | **75 / 75 pass** · `tsc --noEmit` clean · `expo lint` clean |
| Total | | **532 automated tests, 0 failures** |

CI (`.github/workflows/ci.yml`) runs the same commands on every change; the server job uses a PostgreSQL service so the database tests are not skipped.

## 2. Database and migration verification

| Check | Result |
|---|---|
| Whole migration chain applied to an **empty** PostgreSQL 16 database (9 migrations) | Succeeds |
| Chain applied a second time (idempotency) | Succeeds, no errors |
| Result compared with `schema.prisma`: every table, column, type, nullability, and every named index/constraint | Match (permanent test: `tests/accounts/migrationChain.test.js`) |
| Delete rules | Every user-owned foreign key (including `jobs.owner_user_id` and `match_scores.profile_id`) is `ON DELETE CASCADE`; shared-catalog keys (`jobs.company_id`, `source_id`, `canonical_job_id`) are `NO ACTION` |
| Account migration on a legacy-shaped database | Safe defaults, `CHECK` constraint, idempotent; a bare `DELETE FROM users` cascades through match scores (`tests/accounts/postgres.test.js`) |
| Ownership migration | Backfill correct and idempotent; trigger refuses an ownerless private job, an owned global job and a change of owner; scoped de-duplication and per-owner uniqueness on real SQL (`tests/isolation/postgres.test.js`) |

**Found and fixed:** the migration history had no baseline, so an empty database could not be built from the repository (the first migration altered tables nothing created). An idempotent baseline migration (`20260801000000_baseline_core_tables`) was added; on existing databases it is a no-op.

**Not possible here:** `prisma generate`, `prisma validate` and `prisma migrate deploy` need Prisma's engine binaries, whose download is blocked in the verification environment. The schema/migration equivalence was therefore proven with direct SQL against PostgreSQL plus the test above. Run `npx prisma generate && npx prisma migrate status` once in your own environment (CI does `prisma generate`).

## 3. Account-management verification

Driven over real HTTP through the real auth routes, middleware, admin routes and deletion service, against a strict stateful in-memory database that models cascades, foreign-key violations and transaction rollback (`tests/accounts/accountLifecycle.test.js`), plus the real-PostgreSQL tests above.

| Requirement | Verified |
|---|---|
| Self-delete requires the current password; missing/wrong password changes nothing | ✅ |
| Self-delete removes private data (tracked jobs, private jobs, profile + match scores, resumes and tailoring data, sessions, push devices, notifications) in one transaction; failure rolls everything back | ✅ |
| Global jobs, companies and sources survive; other users' data is untouched; a global job pointing at a deleted private job has the pointer cleared | ✅ |
| Gmail grant revoked at Google on deletion (best effort, never blocks) | ✅ |
| Last active admin cannot delete themselves (`409 last_admin`) | ✅ |
| Admin block / unblock / delete of normal users | ✅ |
| Admin cannot act on themselves (`cannot_modify_self`) or other admins (`cannot_manage_admin`); non-admins get `403`, anonymous `401` | ✅ |
| Blocked user: login refused on web, mobile, extension and admin door; refresh refused; existing access token rejected on the next call; Gmail callback refuses; no push | ✅ |
| Block revokes sessions and bumps token version; unblock restores access without reviving old tokens | ✅ |
| Deleted user: token rejected immediately; refresh impossible; cannot log in | ✅ |
| Self-delete has no id parameter to tamper with (user B cannot delete or alter anyone by changing an id) | ✅ |
| Jobs / Sources / Companies / Notifications isolation (user A, user B, admin) | ✅ (`tests/isolation/`) |

## 4. Security review

Scope: every route module and middleware in `server/`, reviewed for authentication bypass, authorization bypass and IDOR. Method: reading each handler and its query scoping, plus the HTTP-level tests above.

**Verified safe**

- `server.js` mounts admin and discovery routers behind `auth` **and** `requireAdmin`; per-user routers behind `auth`. The only unauthenticated data routes are registration/login/refresh/reset, the signed-`state` Gmail callback and static/well-known files.
- Every per-user query filters on `req.user.id` (tracked jobs, scrape runs, notifications, resumes, sessions, devices); foreign ids return `404`. Applications are reachable only through the caller's own tracked job. Shared-table reads use `visibleJobsWhere`.
- Purpose tokens (password reset, OAuth state) are rejected as session tokens; reset tokens are bound to the password hash; the Gmail callback validates redirect targets against an allow-list.
- The target of block/unblock/delete comes from the URL and is re-loaded from the database; the caller's identity and role come only from the verified token and the database.
- Uploads are size-limited and validated; secrets never leave the server; CORS is an allow-list; 5xx bodies are generic in production.

**Found and fixed in this pass**

| # | Issue | Fix |
|---|---|---|
| 1 | **Privilege escalation path.** `ADMIN_EMAILS` promotion matched emails case-insensitively while registration compares them case-sensitively, so registering `Boss@x.com` could get promoted at the next boot alongside `boss@x.com`. | An address matching more than one account is never promoted (warning logged); `make-admin` likewise refuses to guess and requires the exact address. Tests added. |
| 2 | A password reset left already-issued 7-day legacy access tokens valid. | Reset now increments `token_version` (and still revokes refresh sessions). Test added. |
| 3 | Auth routes could return internal error text on `500`. | Generic messages; only error class/code is logged. |
| 4 | Account deletion decided the last-admin rule from a role read before the transaction. | Role re-read inside the transaction. |
| 5 | No baseline migration (see §2). | Added. |

**Residual risks (not fixed; stated plainly)**

- Email addresses are not verified at sign-up and are compared case-sensitively, so anyone can register an unowned address; do not rely on email identity for privilege. Prefer `npm run make-admin`.
- Rate-limit counters are per process; behind several instances the effective limit multiplies.
- A queued ingest for an account deleted before it runs fails on the foreign key and is parked in BullMQ's failed set; no data is created.
- The self-deletion rate limiter (`RL_DELETE_MAX`) exists but is not exercised by the tests (they raise the limit).
- Passwords require only 6 characters; there is no breach-list or lockout beyond rate limiting.
- Many non-auth handlers still return `err.message` in their `500` bodies; in production a global filter replaces every 5xx message with a generic one, but development/staging environments expose them.
- No third-party penetration test or dependency audit was performed.

## 5. Reliability checks included in the suites

Refresh-token rotation, reuse detection and the grace window; concurrent refresh (`refresh_in_progress`); exactly-once reminders; discovery runs deleted mid-flight; non-cacheable polling; atomic company creation under contention; queue-failure tolerance of the manual tracker; resume-tailoring adversarial tests (invented skills, numbers, prompt injection, hostile provider output).

## 6. Documentation status

All READMEs and documents were reviewed and rewritten in this pass: removed unverifiable metrics (duplicate-suppression and time-saved percentages, form-fill rates, "tested with >1,000 records"), broken image links, duplicated tables and stale statements (for example that mobile has no push or OTA support), and added the recruiter summary ([docs/00](00_Recruiter_Project_Summary.md)).

## 7. Limitations of this verification

- Prisma client generation and `migrate deploy` could not run (§2). Application code was exercised against test doubles (in-memory database) and the SQL against real PostgreSQL, **not** against a Prisma-generated client talking to PostgreSQL end to end.
- Redis, BullMQ workers, Playwright discovery/apply, Gmail OAuth, Expo push, the Chrome extension on live job sites, and iOS/Android builds were not exercised against real services; they are covered by unit/integration tests with fakes and by configuration tests.
- No load, performance, accessibility or visual-regression testing was performed.
- Hosted legal pages are templates containing a placeholder (a bracketed retention period) and must be completed before a store submission.
