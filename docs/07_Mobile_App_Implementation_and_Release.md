# 07 — Mobile App (Expo / React Native)

Stack: Expo SDK 57, React Native 0.86, Expo Router, TypeScript (strict), TanStack Query, React Hook Form + Zod, Axios. No WebViews. 75 tests; `tsc --noEmit` and `expo lint` clean.

The app is a native client of the same REST API as the web app; it has no backend or business logic of its own.

## Architecture

| Layer | Role |
|---|---|
| `app/` | File-based routes: `(auth)` stack, `(drawer)/(tabs)` (Home, Jobs, Applications, Alerts, Profile) and feature stacks (application, job, companies, sources, resumes, tailor, account, legal) |
| `services/` | The only code that knows endpoint paths; one shared Axios client with token refresh |
| `hooks/` | TanStack Query hooks over `services/`; screens never call `services/` directly |
| `types/` | Contract types for each API area |
| `providers/` | `AuthProvider` (session), `QueryProvider` (persisted cache, cleared on sign-out) |

## Security

- Session in **Expo SecureStore** (Keychain / Android Keystore, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`): 15-minute access token plus rotating refresh token. Concurrent 401s share one refresh; a revoked or blocked session ends cleanly.
- Blocked account → session ended, blocked message shown (also at login). Settings → **Delete account** requires typing `DELETE` plus the password, then clears the session, query cache, saved items and push registration.
- Notifications and saved jobs are per account, not per device; caches are keyed to the user and cleared on logout.
- Logging is silent in release builds and redacts tokens, emails and resume content; Sentry is optional (off without a DSN) and scrubs PII.
- There is **no admin UI on mobile**; administration is web-only.

## Push, reminders and deep links

- Expo push with contextual permission prompts, Android channels, device registration/removal and token rotation handling; server-side reminders (interviews, follow-ups, high-match jobs) in the user's timezone, exactly-once.
- URL scheme `tracktrail` (legacy `mobile://` accepted for already-sent reset emails); verified https App Links / Universal Links under `/app/*` when `APP_LINK_BASE_URL` and the platform identifiers are configured. Reset-password redirects are validated against a strict allow-list so a forged `redirectUri` cannot receive a token.
- Gmail OAuth uses a mobile redirect signed into the OAuth `state` and validated server-side.

## Configuration

`EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL` (HTTPS in production; no trailing slash, no `/api`), optional `EXPO_PUBLIC_WEB_URL` and `EXPO_PUBLIC_SENTRY_DSN`. Per-environment values are set as EAS environment variables.

## Build and release

```bash
cd mobile
eas build --profile staging --platform all        # internal test builds
eas build --profile production --platform all     # store builds
eas submit --profile production --platform android   # (or ios)
```

`expo-updates` is installed with the `appVersion` runtime policy. CI publishes a staging OTA update on push; production build/submit is a manual workflow behind a protected environment ([docs/05](05_Deployment_and_Operations.md)). Application ids: `com.tracktrail.mobile` (iOS and Android).

## Known limitations

- Resume **file upload** is a hand-off to the web app (no native document picker); mobile lists, activates and exports as text.
- A password-reset deep link does not navigate while the device already has an active session (the reset screen lives in the signed-out route group); sign out first.
- The hosted legal pages under `server/public/legal/` are templates with placeholders (for example a data-retention figure in brackets) and **must be edited before a store submission**.
- Store builds and push delivery were not exercised in the verification environment (no devices or store accounts); they are covered by configuration tests only.
