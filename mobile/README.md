# TrackTrail Mobile (Expo / React Native)

Native client for the TrackTrail API: Expo SDK 57, React Native 0.86, Expo Router, TypeScript (strict), TanStack Query, React Hook Form + Zod. No WebViews, no backend of its own. Design and release notes: [docs/07](../docs/07_Mobile_App_Implementation_and_Release.md).

## Features

Authentication (incl. password reset deep link), home overview, applications (add / edit / status / search / filter), job discovery view with match scores, analytics, profile, Gmail connect and inbox scan, companies, sources, resume list / activation / tailoring, push and in-app reminders, account deletion.

## Run

```bash
npm ci
cp .env.example .env        # set EXPO_PUBLIC_API_URL
npx expo start              # then choose Android / iOS / web
```

`EXPO_PUBLIC_API_URL` has no trailing slash and no `/api`:

| Target | Value |
|---|---|
| Web | `http://localhost:5000` |
| Android emulator | `http://10.0.2.2:5000` |
| Physical device | `http://<LAN-IP>:5000` (same Wi-Fi, firewall open) |
| Production | HTTPS API origin |

Other variables: `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_SENTRY_DSN` (optional). Use an Expo Go build matching SDK 57 or a development build.

## Verify

```bash
npm run typecheck && npm run lint && npm test      # 75 tests
npm run verify:bundle                              # requests the real Android + iOS bundles from Metro
npx expo install --check                           # dependency versions match the SDK
```

Some tests boot server modules; run `npm ci` in `../server` first.

## Security

Session in Expo SecureStore (Keychain / Keystore); 15-minute access token with rotating refresh token; single-flight refresh; per-account caches cleared on sign-out; blocked accounts are signed out with a clear message; Settings → Delete account needs `DELETE` plus the password; release logging redacts tokens and personal data. There is no admin UI on mobile.

## Known limitations

- Resume file upload is a hand-off to the web app.
- The password-reset deep link does not open while a session is active; sign out first.
- Hosted legal pages (`server/public/legal/`) are templates and must be completed before a store submission.
- Store builds and push delivery were not exercised in the verification environment.

## Troubleshooting

"Failed to download remote update" means the bundle could not be built or fetched. Run `npm run verify:bundle` to check that Metro can build; if it can, the cause is the network (same Wi-Fi, no VPN or client isolation, or `npx expo start -c --tunnel`), an old installed dev build, or an Expo Go version that does not match SDK 57.

## Release

EAS profiles (`development`, `staging`, `preview`, `production`) are in `eas.json`; `expo-updates` uses the `appVersion` runtime policy. CI and release workflows: [docs/05](../docs/05_Deployment_and_Operations.md).
