# Job Tracker — Mobile (Expo / React Native)

Native mobile client for the **Automated Job Application Tracking System**,
covering the same backend as `client/` (the web app) and
`browser-extension/`. Built with Expo Router, TypeScript (strict), TanStack
Query, React Hook Form + Zod, and Axios — no WebViews anywhere in the app.

## Overview

This app talks to the existing Express/Prisma/PostgreSQL backend in
`server/` over the same REST API the web client uses. It does not have its
own backend, database, or duplicated business logic — every screen is a
native UI over the same endpoints `client/` calls.

Feature areas: authentication (incl. forgot/reset password), a home
dashboard, applications (add/edit/status/search/filter/sort), job discovery
(search, match scoring, apply), analytics, profile editing, Gmail
integration (OAuth connect, inbox scan, add-to-pipeline), companies,
sources, and a secondary "Engine Applications" queue view for the
automated apply-engine's own records.

## Architecture

- **`app/`** — Expo Router file-based routes. `(tabs)/` is the main tab bar
  (Home, Applications, Jobs, Analytics, Profile); `application/`, `job/`,
  `account/`, `companies/`, `sources/` are separate stacks reached from the
  tabs (kept as distinct route names from their plural tab equivalents to
  avoid Expo Router path collisions); `(auth)/` is the logged-out stack;
  `engine-applications.tsx` is a single secondary screen.
- **`services/`** — one file per API area, each wrapping the shared `api`
  Axios instance (`services/api.ts`). This is the only layer that knows
  endpoint paths and request/response shapes.
- **`hooks/`** — TanStack Query hooks (`useQuery`/`useMutation`) built on
  top of `services/`. Screens call hooks, never `services/` directly.
- **`types/`** — one file per API area, documenting the *exact* backend
  contract each type matches (verified against `server/routes/*.js`, not
  assumed) and any casing/shape quirks worth knowing about.
- **`components/`** — shared UI (cards, badges, empty/loading/error states,
  form fields) reused across screens rather than re-implemented per screen.
- **`providers/`** — `AuthProvider` (SecureStore-backed session) and
  `QueryProvider` (TanStack Query client).

## Prerequisites

- Node.js and npm
- The backend running (`server/` — see its own README/`.env.example`) and
  reachable from wherever you run the app (see the networking note below)
- Expo Go (for quick device testing) or a dev/standalone build, for
  Android/iOS
- A modern browser, for the web target

## Installation

```bash
cd mobile
npm install
cp .env.example .env
# then edit .env — see the next section
```

## Environment variables

Only one is required: `EXPO_PUBLIC_API_URL`, the backend's base URL
(no trailing slash, no `/api` suffix — that's appended automatically).
**Where this points depends on where you're running the app**, because
`localhost` means something different on each platform:

| Running on | `EXPO_PUBLIC_API_URL` |
|---|---|
| Web (`npx expo start --web`) | `http://localhost:5000` |
| Android emulator | `http://10.0.2.2:5000` (the emulator's alias for your host machine) |
| Physical device (Expo Go / dev build) | `http://<your-computer's-LAN-IP>:5000`, same Wi-Fi, firewall open on that port |
| Production | your deployed backend's HTTPS URL |

See `mobile/.env.example` for the full explanation inline. `mobile/.env` is
gitignored — never commit real values, though for this project the only
value here is a URL, not a secret.

## Running

```bash
npx expo start          # then choose a target from the terminal UI
npx expo start --web    # web directly
npx expo start --android
npx expo start --ios
```

Static verification (what CI/a reviewer should run):

```bash
npx tsc --noEmit
npx expo export --platform web
```

## Backend setup

This app has no backend of its own. Start `server/` first (see
`server/README.md` / `server/.env.example`), then point
`EXPO_PUBLIC_API_URL` at it as above. The mobile app uses the exact same
`token` auth header convention, JWT format, and REST contracts as
`client/` — nothing backend-side needs to change to support mobile, with
one exception (Gmail OAuth, below).

## Gmail integration

Gmail OAuth needs one small, already-implemented backend addition beyond
what the web client uses: `GET /api/gmail/auth-url` accepts
`source=mobile&redirectUri=<...>` in addition to the existing
`source=extension` the browser extension uses. This exists because,
unlike the extension's fixed redirect URL, there's no single fixed
redirect URI that works for mobile — Expo Go generates a different
`exp://<lan-ip>:8081/...` URL per machine, while a standalone/dev-client
build uses the stable `mobile://` scheme from `app.json`. The mobile app
computes its own redirect with `Linking.createURL(...)` and sends it
along; the backend signs it into the existing OAuth `state` JWT and
validates it's a `mobile://` or `exp://` URL before honoring it (see
`server/routes/gmailRoutes.js` and `mobile/hooks/use-gmail.ts`).

No other backend change is required — connect/disconnect/scan/add-to-
pipeline all use the same endpoints the web client's Integrations page
uses.

**Add to Pipeline shows exactly where the job landed.** After a scanned
email is added, the Profile screen shows a confirmation card — "Added to
Applications" or "Already in Applications" if the backend's own
duplicate check (`findExistingTrackedJob` in `server/routes/jobRoutes.js`)
matched an existing tracked job — with a "View Application" button that
opens the real application detail screen using the actual id `POST
/api/jobs` returned (`{ ...TrackedJobRecord, duplicate }`). No second
detail view and no client-side duplicate guessing; the backend's decision
is shown as-is.

## Password reset

`POST /api/auth/forgot-password` and `POST /api/auth/reset-password` work
exactly as the web client uses them.

**Web and Mobile have completely separate, isolated reset flows —
separate emails, separate destinations, no cross-platform handoff.**
This app's Forgot Password screen (`app/(auth)/forgot-password.tsx`)
explicitly requests its own reset email:

```ts
POST /api/auth/forgot-password
{ email, source: 'mobile', redirectUri: Linking.createURL('reset-password') }
```

`redirectUri` is this app's own deep link -- the same mechanism Gmail
OAuth's mobile connect flow uses (`hooks/use-gmail.ts`), validated
server-side against the same `mobile://`/`exp://` allow-list
(`server/utils/mobileRedirect.js`, shared between both features so the
two can't drift apart). The web app never sends `source`/`redirectUri`
at all, so it always gets its own unchanged `${CLIENT_URL}/reset-password`
link -- there is deliberately no "continue in the mobile app" button on
the web page, no mobile-browser detection, and no fallback that could
send a web user into the mobile app or vice versa.

The mobile reset email links straight to `mobile://reset-password?token=...`
-- no web page in between. Tapping it in Gmail opens
`app/(auth)/reset-password.tsx` directly, with the token pre-filled via
`useLocalSearchParams` (read-only in that case); manual paste remains
the fallback for anyone who reaches this screen without a token already
in hand (e.g. copy-pasting it from a desktop email client).

**Known remaining edge case:** the reset screen sits inside this app's
"unauthenticated only" route group (`Stack.Protected guard={status ===
'unauthenticated'}` in `app/_layout.tsx`). If the device already has an
active session, that group is guarded out and the deep link won't
navigate there -- the person would need to log out first. Fixing this
would mean restructuring the auth-guard logic to make one screen
reachable regardless of session state, which wasn't done here to avoid
touching working auth-gating logic without dedicated testing.

**Also outside this app's control:** Gmail's own webmail UI opens link
taps in a new tab/window regardless of what the email's HTML specifies
-- there is no `target="_blank"` or `window.open` anywhere in
`server/services/emailService.js`'s template. That's Gmail's own
link-handling behavior, not something either the server or this app can
override.

## Known limitations

- Password reset deep linking's already-logged-in edge case (above).
- Push notifications: **not implemented, and correctly so** — the backend
  has no notification/device-token/push-provider infrastructure at all
  (confirmed by inspection, not assumed), so there is nothing to build a
  mobile UI on top of without inventing a new backend feature.
- `expo lint` could not be run in every development environment used to
  build this app — some sandboxes' network restrictions block the
  one-time ESLint config check `expo lint` performs. `npx tsc --noEmit`
  and `npx expo export --platform web` are the verified static checks.
- Engine Applications is intentionally a secondary, clearly-labeled screen
  (linked from the Applications tab, not a main tab) — the web app's own
  code marks this as a legacy view superseded by the unified Applied Jobs
  page, and this app follows that lead rather than promoting it back to a
  primary workflow.

## Production considerations

- Set `EXPO_PUBLIC_API_URL` to your deployed backend's HTTPS URL before
  building for release.
- The Gmail mobile redirect (`mobile://...`) only resolves correctly in a
  standalone or dev-client build with the custom scheme registered — it
  will not work inside Expo Go in production use, only during development.
- Review Prisma/backend `CLIENT_URL` and CORS configuration to make sure
  your deployed backend accepts requests from your mobile app's origin
  where applicable.
