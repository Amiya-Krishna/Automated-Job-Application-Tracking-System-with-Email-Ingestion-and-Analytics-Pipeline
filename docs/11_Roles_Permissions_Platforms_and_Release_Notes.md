# 11 · Roles & Permissions, New Platforms, Saved URLs, Gmail Filtering — Release Notes

This document covers the changes introduced with migration
`20261003000000_roles_platforms_job_details` and extension v1.2.0.

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
- An existing admin can promote/demote others in **Admin panel → Users & roles** (cannot change their own role, so the last admin cannot be locked out).

### Admin delete rules (`/api/admin/*`)

- `DELETE /jobs/:id`, `/companies/:id`, `/sources/:id` — admin only, transactional (`services/catalogDeletion.js`).
- Company/source with jobs → `409` unless `?withJobs=true` (the UI asks for an explicit confirmation).
- Any job with an in-flight application (`queued`, `running`, `awaiting_confirmation`) → `409`; nothing is deleted.
- Users' `tracked_jobs` are never deleted; `tracked_jobs.engine_job_id` is set to `NULL`.
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
