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

## Password reset — known limitation

`POST /api/auth/forgot-password` and `POST /api/auth/reset-password` work
exactly as the web client uses them. The **Forgot Password** screen is
fully functional with zero backend changes.

**Reset Password currently uses manual token entry** (paste the code from
the email) rather than a one-tap deep link, and this is a deliberate,
documented gap rather than an oversight. The reset email links to
`${CLIENT_URL}/reset-password?token=...` — the *web* client's domain,
decided once per server deployment. Unlike Gmail OAuth, there is no
per-request parameter here for the mobile app to ask for a different link
shape (the only input to `/forgot-password` is an email address). Making
the email open the mobile app directly would require one of:

- **Universal Links (iOS) / App Links (Android)** — hosting an
  `apple-app-site-association` / `assetlinks.json` file on the server's
  domain, plus native entitlements in the mobile build. This is
  infrastructure and native-build configuration, not a code-only change,
  and isn't something that can be verified from a development sandbox.
- **Splitting `CLIENT_URL` by request source**, which would change what
  *every* platform's reset email links to, including already-deployed web
  users — too broad a change to make unilaterally.

If you want one-tap reset links on mobile, pick one of the above
deliberately; don't guess at it.

## Known limitations

- Password reset deep linking (above).
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
