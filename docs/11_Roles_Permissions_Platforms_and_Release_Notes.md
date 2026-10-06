# 11 · Roles & Permissions, New Platforms, Saved URLs, Gmail Filtering — Release Notes

This document covers the changes introduced with migration
`20261003000000_roles_platforms_job_details` and extension v1.2.0, the
ownership/notification isolation (`20261004000000`), and account status,
blocking and account deletion (`20261006000000_user_account_status`, 2026-10-06;
see the last section).

## 1. Roles & permissions

`users.role` (`VARCHAR(20)`, default `'user'`) is `user` or `admin`. Existing
accounts become `user` automatically.

| Layer | Enforcement |
|---|---|
| API | `middleware/requireAdmin.js` runs after `authMiddleware`; it reads the role from the DB on every request (no stale JWT claims) and fails closed (`401` no user, `403 {code:"admin_required"}`, `500` on lookup failure). Mounted on `/api/scrape` and `/api/admin`. |
| Web | `AuthContext.isAdmin`; `components/AdminRoute.jsx` redirects non-admins to `/dashboard`; `Navbar` omits Job Discovery / Admin for non-admins (desktop and mobile menu); `AdminDeleteButton` renders nothing for non-admins. |
| Mobile | `AuthUser.role`; the Discovery panel on the Sources screen is rendered only for admins. |
| Extension | Does not expose discovery; Matched Jobs / Companies are read-only; Sources shows the signed-in user's own Manual / Gmail / Extension only. |

**Becoming an admin**

- `ADMIN_EMAILS=a@x.com,b@y.com` in `server/.env` — applied at boot to existing accounts (never demotes anyone).
- `cd server && npm run make-admin -- a@x.com`.
- An existing admin can promote/demote others in **Admin panel → User management** (cannot change their own role, so the last admin cannot be locked out).

**Who may do what with accounts** (all enforced server-side; hiding UI is only a convenience)

| Action | Anonymous | User | Admin |
|---|---|---|---|
| Delete **own** account (`DELETE /api/auth/account`, password required) | `401` | ✅ (`409 last_admin` if they are the last active administrator; `403 account_blocked` if blocked) | ✅ same rule |
| List accounts (`GET /api/admin/users`) | `401` | `403 admin_required` | ✅ |
| Block / unblock a **normal user** | `401` | `403 admin_required` | ✅ |
| Delete a **normal user** (`DELETE /api/admin/users/:id`) | `401` | `403 admin_required` | ✅ |
| Block / unblock / delete **another admin** | `401` | `403 admin_required` | ❌ `403 cannot_manage_admin` (demote first) |
| Block / unblock / delete **own** account via the admin API | – | – | ❌ `400 cannot_modify_self` (use self-deletion instead) |
| Change a role (`PATCH /api/admin/users/:id/role`) | `401` | `403 admin_required` | ✅ except their own role |

Because an admin cannot demote themselves and cannot block or delete another admin, there is always at least one administrator, and the last active administrator can never be blocked or deleted through the admin API (self-deletion is separately refused with `409 last_admin`).

### Admin delete rules (`/api/admin/*`)

- `DELETE /jobs/:id`, `/companies/:id`, `/sources/:id` — admin only, transactional (`services/catalogDeletion.js`).
- Company/source with jobs → `409` unless `?withJobs=true` (the UI asks for an explicit confirmation).
- Any job with an in-flight application (`queued`, `running`, `awaiting_confirmation`) → `409`; nothing is deleted.
- Deleting a catalog job/company/source never deletes users' `tracked_jobs`; `tracked_jobs.engine_job_id` is set to `NULL`. (Deleting a *user account* is different: see "Account status, blocking and deletion" below.)
- Duplicate rows that point at a deleted canonical job are deleted with it, and `canonical_job_id` is cleared first, so no dangling self-references or FK errors.

## 2. Platforms

Web discovery and the extension support **LinkedIn, Indeed, Naukri, Internshala, Wellfound, Unstop** (plus Remotive in discovery).

- Extension: `browser-extension/platform-extractors.js` (`TrackTrailPlatforms`), loaded before `jd-extract.js`.
- Server: `server/services/jobBoards/platformExtractors.js` is a byte-identical copy (`npm run sync:extractors`; `-- --check` is enforced by a test). `platforms.js` builds search URLs; `scrapePlatform.js` runs search → list extract → bounded detail enrichment, and raises `BlockedError` on CAPTCHA / login / access-denied pages.
- Adapters: `server/adapters/{naukri,internshala,wellfound,unstop}JobsAdapter.js` use `createJobBoardAdapter`; `job_sources` rows are seeded on boot.
- Fields: title, company, location, description, salary/stipend (`salary_text`), skills (`skills[]`), source, URL.
- Failure behaviour: every field has fallbacks (platform selectors → JSON-LD → meta); a missing field is omitted, never fabricated; a blocked source yields `status: "blocked"` and the other sources in the run still complete.

## 3. Saved job URL (extension → backend → DB → web)

`toSaveJob` sends `sourceUrl` (canonical: LinkedIn `/jobs/view/<id>`, Indeed `/viewjob?jk=<id>` on the original country host, others the clean detail URL). The server (`services/jobUrl.js#normalizeJobUrl`) accepts only `http(s)` URLs without embedded credentials and with a dotted host, strips tracking params and fragments (keeps Indeed `jk`), and stores `NULL` instead of failing the save when the URL is invalid or absurdly long. Duplicate saves (same `externalJobId`, or same URL for the user) update the existing row. The web Dashboard / Applied Jobs and the extension popup/dashboard show **View posting ↗** (`target="_blank" rel="noopener noreferrer"`) only for http(s) URLs; `internal://` and `javascript:` values are never linked.

## 4. Analytics funnel

`GET /api/analytics/funnel` → `{ matched, applied, interview, offer }`. The `scraped` stage was removed from the API, web, extension and mobile (the bars on mobile are scaled to `matched`).

## 5. Gmail "Scan Inbox"

See `docs/04_API_Reference.md` §11. Pipeline: Gmail query narrowing → metadata-only fetch → local scoring (`services/emailRelevance.js`) → dedup. Web and extension pre-fill company / role / status / contact email from the server response and fall back to their local parsers.

## 6. Profile autofill

`GET /api/profile` returns `full_name` and `email` falling back to the account's name/email (`prefilled: true`), so a brand-new profile is never blank. Registration no longer copies another user's profile.

## 7. Tailored resume PDF

`services/resumeTailoring/resumeRenderer.js#toPdf`: single-column ATS layout (A4, Helvetica, 22 pt name, ruled section headings kept with their first entry, bold entry headers with right-aligned dates, hanging-indent bullets, consistent margins and page breaks). Text is real, selectable text in reading order (no tables/images).

## 8. Optional environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_EMAILS` | empty | Comma-separated emails promoted to admin at boot |
| `SCRAPE_DETAIL_LIMIT` | 15 | Detail-page visits per run for Naukri/Internshala/Wellfound/Unstop |
| `SCRAPE_SELECTOR_WAIT_MS` | 15000 | Wait for posting links on a search page |

## 9. Upgrade steps

```bash
cd server
npm install
npx prisma migrate deploy   # NEVER `migrate dev` against production
npx prisma generate
# set ADMIN_EMAILS (or run npm run make-admin -- you@example.com), restart API + worker
npx playwright install chromium   # worker host, for the browser-based platforms
```

The migration is idempotent (`ADD COLUMN IF NOT EXISTS`) and backward compatible: old clients keep working; new columns are nullable/defaulted.

## 10. Known limitations

- `prisma generate` / `prisma migrate deploy` could not be run in the build sandbox (Prisma engine download blocked). The schema validates and the SQL was applied to PostgreSQL 16, but run `npx prisma generate` and a `prisma migrate status` on your side.
- Selectors for Naukri, Internshala, Wellfound and Unstop were written from public markup and unit-tested against fixtures; they were **not** verified against the live sites. These sites change markup and several (Naukri, Wellfound, Unstop, Indeed) aggressively block automated browsers, so discovery runs may report `blocked`.
- Discovery needs the separate worker process, Redis and Playwright Chromium.
- Gmail scanning needs your own Google OAuth credentials and a verified consent screen for production use.
- Role changes take effect on the next API call; web clients must reload to see the new nav items.
- The same sandbox limitation applied to migration `20261006000000_user_account_status` (see the account section at the end of this document).

## Job ownership, Sources and notification isolation (migration `20261004000000`)

**Two kinds of jobs, one rule: a query may only return GLOBAL jobs OR the caller's own.**

| | Global jobs | Private jobs |
|---|---|---|
| Origin | Admin-fetched: LinkedIn, Naukri, Remotive, Unstop, Indeed, Wellfound, Internshala | Manual, Gmail, browser extension |
| `job_sources.scope` | `global` | `private` |
| `jobs.owner_user_id` | `NULL` | the owning user |
| Visible to | everyone | only the owner (admins included: they see their *own* only) |

- Single source of truth: `server/services/visibility.js` (`visibleJobsWhere(userId)`, `normalizeOrigin`). A DB trigger (`enforce_job_scope`) enforces "private source ⇔ owner set" and forbids re-owning, so a future code path cannot create an ownerless private job or an owned global one. Uniqueness of `(source_id, external_job_id)` is per global source / per owner (partial unique indexes); dedup only matches global jobs or the same owner's jobs.
- The server decides a saved job's origin (`manual`/`gmail`/`extension`); a website name sent by the extension is stored as `tracked_jobs.platform`. `POST /api/ingest` can only create the caller's private jobs.
- **Sources** (`GET /api/sources`, role from the DB): users get Manual/Gmail/Extension with their own counts and jobs; admins get the seven fetched sources with global jobs only. A source of the other audience is a 404.
- **Companies**: a company is visible if it has a visible (global or own) job, or matches one of the caller's own tracked companies; counts, search and detail follow. Companies that exist only because someone else saved a private job are 404.
- **Notifications**: `notifications` table, every row has `user_id`; `/api/notifications/inbox` (list, unread-count, create-for-self, read, read-all, delete, clear) always filters by the caller. Foreign ids are 404. Web and mobile read from the server; the old shared localStorage/AsyncStorage lists are wiped. Mobile saved jobs are stored per account and cleared on logout.
- Admin deletion (`catalogDeletion`) only touches global jobs/sources; `/api/analytics/summary` (system-wide) is admin-only and the analytics rollup counts global jobs only.

Tests: `server/tests/isolation/routes.test.js` (User A, User B, Admin over HTTP) and `server/tests/isolation/postgres.test.js` (real SQL: migration backfill, trigger, scoped ingest/dedup; set `TEST_DATABASE_URL` to run). `npm test` in `server/` preloads a stand-in for an un-generated Prisma client only when `prisma generate` has not run.

**Upgrade note:** rows saved by older extension versions under a website name and already linked to a *global* job cannot be told apart from catalog applications; they stay attributed to that global source.


## Account status, blocking and account deletion (migration `20261006000000_user_account_status`, 2026-10-06)

Release notes, 2026-10-06: administrators can list, block, unblock and delete normal users; users can delete their own account; blocking takes effect immediately on every client.

### Database changes

| Change | Detail |
|---|---|
| `users.status` | `VARCHAR`, `ACTIVE` (default) or `BLOCKED`, guarded by CHECK constraint `users_status_check` |
| `users.blocked_at` | nullable timestamp, set while blocked |
| `users.token_version` | integer, default `0`; embedded in access tokens as `tv` and compared on every request |
| `match_scores.profile_id` FK | now `ON DELETE CASCADE` (deleting a user whose profile had scores previously failed with a foreign-key error) |

The migration is additive and idempotent. The server logs a boot warning if the new columns are missing (migration not applied).

### Enforcement (`middleware/authMiddleware.js`, `middleware/requireAdmin.js`, `lib/accountStatus.js`, `lib/sessions.js`)

`authMiddleware` loads the account from the database on **every** authenticated request (one primary-key query); the JWT alone is never trusted. `requireAdmin` re-checks status and role from the database as well.

| Scenario | Result |
|---|---|
| Account no longer exists | `401 {code:"token_invalid"}` |
| Account is `BLOCKED` | `403 {code:"account_blocked", message:"Your account has been blocked. Please contact an administrator."}` |
| Token `tv` differs from `users.token_version` (issued before a block) | `401 {code:"token_invalid"}` |
| Login with correct password, blocked account (web, mobile, extension, admin door) | `403 account_blocked`; no session is issued |
| `POST /api/auth/refresh` for a blocked account | `403 account_blocked`; the refresh family is revoked and the web cookie cleared |
| `GET /api/auth/me` for a blocked account | `403 account_blocked` |
| Gmail OAuth callback for a blocked account | no grant is saved (only ACTIVE users can connect Gmail) |
| Push reminders | blocked users are skipped |
| Admin blocks a user | status `BLOCKED`, `blocked_at` = now, `token_version + 1` and all refresh-token sessions revoked in one transaction: every earlier access and refresh token dies at once |
| Admin unblocks the user | status `ACTIVE`, `blocked_at` cleared; **old tokens stay dead**, the user must sign in again |

### Block vs delete

| | Block | Delete |
|---|---|---|
| Reversible | Yes (`unblock`) | No |
| Data | Nothing is deleted or recreated; unblocking restores access to everything | Permanently removed (see below) |
| Sessions | All revoked; old tokens never revive | All revoked and removed |
| Who | Admin, on normal users only | The user themselves, or an admin on normal users only |

### Account deletion (`services/accountDeletion.js`)

Self-deletion (`DELETE /api/auth/account`) and admin deletion (`DELETE /api/admin/users/:id`) share one service and run in **one transaction** (retried once on a foreign-key/serialization race with background workers; Serializable isolation when the target is an administrator, which also enforces the last-admin guard).

**Deleted:** `tracked_jobs` (manual, Gmail-imported and extension-saved applications); the user's private `jobs` rows (`owner_user_id` = user; their applications and match scores cascade); `scrape_runs`; `user_profile` and every `match_scores` row of that profile; resumes with their facts, analyses, versions and changes; job descriptions; tailoring sessions; `user_sessions` (all refresh tokens); `push_devices`; `notification_preferences`; `notification_log`; `notifications`. The Gmail grant is revoked at Google on a best-effort basis after the database commit.

**Preserved:** all global admin-fetched data: jobs with `owner_user_id IS NULL` (LinkedIn, Naukri, Remotive, Unstop, Indeed, Wellfound, Internshala), `companies`, `job_sources`, and other users' applications and match scores for global jobs. A global job whose `canonical_job_id` pointed at one of the deleted user's private jobs keeps its row and has the pointer cleared. Only the deleted user's own relationship rows are removed.

> Earlier text describing account deletion as a plain database cascade of "all data" is superseded by this list.

### Self-deletion `DELETE /api/auth/account`

Body `{ "password": "..." }`, authentication required. It always acts on the authenticated user (there is no id parameter, so no IDOR). Rate limited to 5 per hour per user (`RL_DELETE_MAX`).

| Status | Meaning |
|---|---|
| `200` | Account deleted |
| `400` | Password missing or wrong |
| `401` | Not authenticated / token invalid |
| `403 account_blocked` | Blocked users cannot self-delete; an administrator must handle them |
| `409 last_admin` | The caller is the last active administrator |
| `429` | Rate limit |

Web (Profile → Danger zone) and mobile (Settings → Delete account) additionally require typing `DELETE` plus the password, list what will be deleted, show loading and error states, then clear the session, caches and local data and return to login.

### Admin user management (`/api/admin/users`, behind `authMiddleware` + `requireAdmin`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users?q=&status=ACTIVE\|BLOCKED&role=admin\|user&page=1&pageSize=50` | Paged list (`pageSize` max 200). `{ data:[{id,name,email,role,status,createdAt,blockedAt,gmailConnected,trackedJobs,lastActiveAt}], meta:{total,page,pageSize} }`; never password hashes, tokens or the Gmail grant |
| POST | `/api/admin/users/:id/block` | Block (see enforcement table) |
| POST | `/api/admin/users/:id/unblock` | Unblock (idempotent) |
| DELETE | `/api/admin/users/:id` | Delete a normal user (same service as self-deletion) |
| PATCH | `/api/admin/users/:id/role` | Unchanged; you cannot change your own role |
| GET | `/api/admin/overview` | Now also returns `blockedUsers` |

Guards on block/unblock/delete: invalid id `400`; own account `400 {code:"cannot_modify_self"}`; unknown id `404`; target is an administrator `403 {code:"cannot_manage_admin"}`; non-admin caller `403 {code:"admin_required"}`; anonymous `401`. The target id always comes from the URL and is re-loaded from the database. Each action writes an audit line `[admin-audit] admin#<id> blocked|unblocked|deleted user#<id>` (ids only, no emails).

### Client behaviour

- **Web:** Admin panel → **User management** (search, status filter, table with Active/Blocked badges, role, created, tracked jobs, last active and Gmail; Block/Unblock/Delete with confirmation dialogs; own and admin rows protected; role change retained; pagination). Profile → **Danger zone** delete dialog. Login shows a persistent "account blocked" message, also after a session ends because of a block.
- **Mobile:** Settings → Delete account (`DELETE` + password). Blocked accounts see the blocked message at login and when an active session is ended. There is **no admin user-management UI on mobile** (the app has no admin panel); administration is web-only.
- **Extension:** a blocked account is signed out and shown the blocked message (no retry); login surfaces it.

### Environment and upgrade

New optional variable: `RL_DELETE_MAX` (default `5`): self-deletion attempts per user per hour.

```bash
cd server
npx prisma migrate deploy   # never `migrate dev` in production (`npm run release` / `npm run build` already do this)
npx prisma generate
npx prisma validate
```

### Tests

`server/tests/accounts/accountLifecycle.test.js` (HTTP-level, strict in-memory database, covering the required lifecycle scenarios), `server/tests/accounts/postgres.test.js` (real PostgreSQL migration and cascade test; runs only when `TEST_DATABASE_URL` is set) and `server/tests/helpers/accountFakePrisma.js`. See `docs/10` for the verification run and its limits.
