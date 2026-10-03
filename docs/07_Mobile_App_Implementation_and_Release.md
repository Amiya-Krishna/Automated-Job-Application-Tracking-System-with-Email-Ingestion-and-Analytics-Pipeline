# Mobile App — Implementation, Redesign & Release

> **Consolidated from:** `MOBILE_PRODUCTION_IMPLEMENTATION.md`, `REDESIGN_NOTES.md` and the "Mobile" section of `IMPLEMENTATION_SUMMARY.md`.
> Related: mobile endpoints (sessions, account, notifications, deep-link files) → `04`; Gmail on mobile and mobile resume manager → `09`; mobile QA results and password-reset verification → `10`.

---

## 1. Production implementation (Expo SDK 57)

Scope: `mobile/` (Expo SDK 57), plus the minimum additive backend in `server/` the mobile app needs. Web client and browser extension behaviour is unchanged (they keep the 7‑day token). Everything below was verified only with light checks (syntax parse of all 152 TS/TSX files, JSON/YAML validation, and the Node test suites: server 178/178, mobile 63/63 + 1 pre‑existing skip). **No native build, `tsc`, lint or device run was performed** — see "First things to run".

### What was implemented

**1. Auth** – `GET /api/auth/me`; mobile login (`X-Client: mobile`) returns a 15‑min access JWT + opaque refresh token. Refresh tokens are stored hashed (`user_sessions`), rotated on every use, and replaying a rotated token (after a 10 s grace) revokes the whole chain. `POST /auth/refresh|logout|logout-all`, `DELETE /auth/account`. Password reset and logout‑all revoke all sessions. Login/register/forgot/reset/refresh are rate limited. Purpose tokens (reset, Gmail `state`) can no longer act as login tokens; invalid/expired tokens now return **401** (was 400 for invalid). Mobile stores tokens only in SecureStore; the API client refreshes proactively and on 401 (single‑flight), replays the request once, and signs out only when the server says the session is over (offline/5xx never logs you out). Legacy 7‑day tokens from older builds keep working until they expire.

**2. Push** – `expo-notifications`, contextual permission prompt (Notifications tab / Settings toggle), Android channels, device registration/unregistration, token‑rotation handling. Server: `push_devices`, `notification_preferences`, `notification_log`; Expo push sender (no SDK, free), dead‑token pruning; reminder engine (interview tomorrow/today, 7‑day follow‑up, daily strong‑match digest) in each user's timezone, exactly‑once via a unique dedupe key; in‑process scheduler or external cron (`reminders-cron.yml`). Preferences are server‑side (the fake "Email notifications" toggle was removed — no such backend exists). Taps deep‑link via an allow‑list; cold start, foreground and signed‑out taps are handled (target is held until sign‑in).

**3. Reliability** – Sentry (optional, off without DSN, PII/request/console/network breadcrumbs scrubbed, user = numeric id), root error boundary, offline detection (`expo-network`) with instant offline errors and a banner, GET retries with backoff/jitter, `Retry-After` handling for 429, timeout message for cold starts, TanStack Query wired to app foreground/reconnect, non‑sensitive query cache persisted per user (allow‑list: applications, analytics, jobs, sources, companies — never resume/profile/Gmail) and wiped on logout, foreground session refresh + `/auth/me` revalidation.

**4. Tests** – `server/tests/auth/mobileSessions.test.js`, `server/tests/notifications/*`, `mobile/tests/{api-client.integration,deep-links,query-cache-and-logger,production-config}.test.cjs` (real API client against a real HTTP server: refresh rotation, concurrent 401s, 429/5xx/offline, deep links, notification targets, log redaction, store‑config guards). Existing resume/Gmail/notification tests updated for the 401 change.

**5. CI/CD** – `.github/workflows/ci.yml` (server tests; mobile lint, typecheck, critical tests, Expo config check), `mobile-release.yml` (staging OTA on push to `main`; production update/build/submit/rollback by manual dispatch behind the `production` environment), `reminders-cron.yml`. `eas.json`: `development`, `staging` (channel `staging`), `preview`, `production` (channel `production`, AAB, auto‑increment). **Rollback**: OTA → `update:republish` a previous group; binary → keep previous build, Play staged rollout/halt; DB migration is additive so older apps keep working.

**6. Deep links** – scheme `tracktrail` (legacy `mobile://` still accepted server‑side for reset emails already sent). Verified https App Links/Universal Links on the API host under `/app/*` (the server serves `assetlinks.json` and `apple-app-site-association` from env vars). `app/+native-intent.ts` is the single choke point: reset‑password always opens the public screen (signed in or out), Gmail OAuth callback never becomes a 404 route, protected links wait for sign‑in. Duplicate `(auth)/reset-password` route removed; reset screen validates the token param, clears it after use and ends stale local sessions.

**7. Native config** – ids `com.tracktrail.mobile` (change if you want another — see below), `versionCode`/`buildNumber` (EAS remote versioning), `runtimeVersion: appVersion`, `allowBackup: false`, unused permissions blocked, no cleartext traffic in release, iOS privacy manifest + `ITSAppUsesNonExemptEncryption:false`, splash/icon/adaptive‑icon config, `app.config.ts` fails a release build without an https API URL.

**8. Security/privacy** – `services/logger.ts` (silent in release, redacts JWTs/emails/tokens/resume/email fields); all `console.*` and the TEMP DIAGNOSTIC code removed (test‑enforced); generic 5xx messages in production (server + client); HSTS/nosniff/frame headers; `trust proxy`; account deletion end‑to‑end (in‑app with password, cascade delete, Gmail grant revoked); push token in SecureStore; notification list cleared on sign‑out.

**9. Performance/a11y** – list virtualization props, memoized rows, paging kept; loading/empty/error states with alert/progress roles; cache‑first (no blocking error when cached data exists; offline empty state); labels/roles/hints, ≥44 pt targets, WCAG‑AA contrast fixes (secondary text, danger), text scaling capped at 1.4×; charts announce a text summary instead of an unreadable SVG.

**10. Home typography** – Inter (400/500/600/700) via `@expo-google-fonts/inter`, one type scale in `constants/theme.ts`, `ThemedText` maps weight→font file (works on Android), oversized 48/32 px titles replaced (28 title, 32 display numbers, 20 subtitle, 17 headline), emoji glyph buttons and 🔔 replaced by clean labels/SVG icon. Colours and layout unchanged.

**11. Store readiness** – hosted placeholder pages `server/public/legal/{privacy,terms,delete-account}.html` (served at `<API>/legal/…`, must be edited before submission), in‑app links, in‑app deletion, version display, dev artifacts removed.

### Required environment variables / secrets

**Server (`server/.env`, see `.env.example`)**: existing vars plus `NODE_ENV=production`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `APP_LINK_BASE_URL` (your API's https origin), `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_CERT_FINGERPRINTS`, `IOS_BUNDLE_ID`, `APPLE_TEAM_ID`, `REMINDERS_ENABLED`, `CRON_SECRET`, optional `EXPO_ACCESS_TOKEN`.
**Mobile (EAS environment variables, `eas env:create --environment staging|production`)**: `EXPO_PUBLIC_API_URL` (**https**, required), optional `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL/TERMS_URL/DELETE_ACCOUNT_URL`; build‑time: `GOOGLE_SERVICES_JSON` (file), `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (secret).
**GitHub secrets**: `EXPO_TOKEN`; for the cron workflow `API_URL`, `CRON_SECRET`.

### First things to run (once, locally)

```bash
cd server && npx prisma migrate deploy && npx prisma generate      # adds 4 additive tables (migration 20260929000000)
cd ../mobile && npm install                                          # refreshes package-lock.json with the new deps
npx expo install --check                                             # confirms versions match SDK 57
npm run typecheck && npm run lint && npm run test:critical          # I could not run tsc/lint here
```

### Production commands

```bash
cd mobile
eas login && eas init                                   # only if the EAS project id in app.json is not yours
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://YOUR-API --visibility plaintext
eas credentials                                         # first time: Android keystore, iOS certs/profiles (EAS can generate them)
eas build --profile staging --platform all              # internal test builds
eas build --profile production --platform all           # store builds (AAB + IPA)
eas submit --profile production --platform android      # -> Play internal track (draft)
eas submit --profile production --platform ios          # -> TestFlight
eas update --channel production --environment production --message "fix: ..."   # OTA
eas update:list --branch production                     # find a previous group id
eas update:republish --group <GROUP_ID> --destination-channel production        # OTA rollback
```

### Actions only you can do (credentials/accounts)

1. **Identifiers**: confirm `com.tracktrail.mobile` (both stores) or change it in `app.json`, `server/.env` (`ANDROID_PACKAGE_NAME`, `IOS_BUNDLE_ID`) — it cannot change after publishing.
2. **EAS**: `eas init` if the project id in `app.json` (`extra.eas.projectId`, `updates.url`) is not your project. Set the environment variables above.
3. **Apple**: Developer Program account, Team ID → `APPLE_TEAM_ID`; App Store Connect app record; APNs key (EAS manages it when you run `eas credentials`).
4. **Google Play**: Play Console app; copy the **App signing** SHA‑256 (Play Console → App integrity) into `ANDROID_SHA256_CERT_FINGERPRINTS`; Firebase project → `google-services.json` (FCM, needed for Android push) uploaded as the `GOOGLE_SERVICES_JSON` EAS file variable, and FCM V1 credentials via `eas credentials`; service‑account key for `eas submit`.
5. **Sentry (optional, free tier)**: create a React Native project; set DSN + org/project/auth token.
6. **Legal**: edit the three pages in `server/public/legal/` (and in‑app `app/legal/*.tsx` summaries); fill store privacy forms (Play Data safety, App Privacy labels: account info, user content, optional Gmail read‑only, diagnostics, push token; deletion URL = `<API>/legal/delete-account.html`).
7. **Google OAuth**: add `tracktrail://gmail-callback` handling is via the backend; no Google console change is needed unless you also changed the API host.
8. **Redeploy the backend** (new routes/migration) *before* shipping the new app; old apps keep working.
9. **Assets**: icon/splash use your existing files; supply final store artwork (1024×1024 icon, screenshots). Remove the unused starter assets in `mobile/assets/images` if you like.
10. Real‑device testing: push (Expo Go cannot receive pushes), App Link verification (`adb shell pm get-app-links com.tracktrail.mobile`), Universal Links, the reset‑email flow on both OSes.

### Known limits / notes

* Rate limiters and the reminder scheduler are per server instance (fine for one instance; use a shared store if you scale out — the reminder dedupe key is DB‑backed so duplicates are still prevented).
* Offline writes are not queued: they fail fast with a clear message; reads work from cache.
* A verified https reset link requires the association files (step 3/4); until then set no `APP_LINK_BASE_URL` and the email uses the `tracktrail://` link as before.
* `mobile/.env` from the uploaded ZIP was not included; recreate it from `mobile/.env.example`.

---

## 2. Redesign integration notes

This documents what changed in the redesign pass and exactly what to do to run it.

### 1. Install new dependencies

```bash
cd mobile
npx expo install @react-native-async-storage/async-storage @react-navigation/drawer @react-navigation/native react-native-svg
```

(`package.json` already lists them; the command above just gets Expo to
resolve SDK-compatible versions and install native code where needed.)

### 2. Rebuild native code if you use dev builds / EAS

`@react-navigation/drawer` and `react-native-svg` include native modules.
If you run via Expo Go this "just works" for SVG and Drawer's JS parts;
if you use a custom dev client or EAS build, run a new native build:

```bash
npx expo prebuild --clean   # if you manage native projects locally
# or
eas build --profile development
```

### 3. What moved / was renamed

- `app/(tabs)/*` → `app/(drawer)/(tabs)/*` (all URLs unchanged — group
  folders never appear in the URL, so every existing `router.push('/jobs')`
  etc. still works).
- `app/(tabs)/applications.tsx` → `app/applications.tsx`, now a top-level
  Stack screen titled "Job Tracker" with a native back button, reachable
  from the drawer, from Home's "Recent applications"/"Upcoming interviews"
  sections, and from anywhere that already linked to `/applications`.
- Bottom tabs are now exactly: **Home, Jobs, Analytics, Notifications, Profile**.

### 4. New architecture pieces

| Piece | File(s) |
|---|---|
| Theme (light/dark/system, persisted) | `context/ThemeContext.tsx`, `hooks/use-theme*.ts`, `hooks/use-color-scheme*.ts` |
| Drawer navigation | `app/(drawer)/_layout.tsx`, `components/drawer-content.tsx` |
| Notifications | `context/NotificationContext.tsx`, `services/notifications.ts`, `types/notifications.ts`, `hooks/use-notifications.ts`, `hooks/use-notification-preferences.ts` |
| Saved Jobs | `services/savedJobs.ts`, `hooks/use-saved-jobs.ts` |
| Reusable UI | `components/card.tsx`, `button.tsx`, `avatar.tsx`, `search-bar.tsx`, `screen-header.tsx`, `dashboard-header.tsx`, `theme-toggle.tsx`, `themed-stack.tsx` (shared themed header Stack used by the feature `_layout.tsx` files), `notification-item.tsx`, `charts/bar-chart.tsx`, `charts/donut-chart.tsx` |
| New screens | Dashboard (redesigned `index.tsx`), `notifications.tsx`, `(drawer)/resume-insights.tsx`, `saved-jobs.tsx`, `help.tsx`, `about.tsx`, `legal/privacy.tsx`, `legal/terms.tsx`; Settings redesigned |

### 5. Honest limitations (by design, not oversight)

- **Push notifications**: there's no Expo push-token registration
  endpoint on your backend, so Settings' Push/Email toggles are
  device-local preferences that gate the in-app Notifications tab only.
  Wiring true push needs `expo-notifications` + a backend table/route for
  tokens — out of scope here, but the toggle UI and notification model
  are ready for it.
- **Saved Jobs**: stored on-device (AsyncStorage) since there's no
  bookmark endpoint on the backend.
- **Change Password**: there's no "change password while logged in"
  endpoint, so Settings reuses the existing forgot-password email flow.
- **Privacy Policy / Terms**: placeholder copy — replace before shipping.
- **NativeTabs badge**: the unread-notifications badge is shown in the
  Dashboard's bell icon and the Notifications tab itself, not as a native
  badge dot on the tab bar icon — `expo-router/unstable-native-tabs`'s
  badge API varies by SDK version and wasn't something I could verify
  without your exact installed version; safe to add later.

### 6. Design conventions followed

New components use the same kebab-case flat-file convention as the rest
of `components/` (not nested `Card/`, `Button/` folders) to stay
consistent with the existing codebase, with one exception: `components/charts/`
groups the two chart primitives since they're a genuinely new category.

> **Cross-reference:** push registration, server-side notification preferences and in-app account deletion were subsequently implemented; see Section 1 (items 1, 2 and 8) for the production implementation.

---

## 3. Mobile screen changes (implementation pass)

- Profile: identity card with avatar, **Edit profile** and **Settings** directly on Profile,
  "Connected" rows (Gmail Integration with live status, My Resumes), skills.
- Settings: **Edit profile and Change password removed.** Sections: Account (+Gmail shortcut),
  Preferences (appearance, notification toggles - existing, persisted), Support (About, Privacy,
  Terms), Log out. No delete-account (backend has no endpoint) and no invented settings.
- New dedicated **Gmail Integration** screen (`app/account/gmail.tsx`), reusing the existing
  hooks/backend: status, connect, disconnect, scan, add-to-pipeline, loading/error/empty states.
- Home: added "Paste JD" (`/tailor`) and "Gmail" quick actions; Gmail card opens the new screen.
- Removed the orphaned top-level `app/(tabs)` route group (never registered in the root Stack).
