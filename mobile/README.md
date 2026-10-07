# TrackTrail Mobile — Expo / React Native

Native TrackTrail client built with Expo SDK 57, React Native 0.86, Expo Router and strict TypeScript.

The mobile application is a client of the same REST API as the web application. It has no separate backend and uses no WebViews.

## Product surface

- Authentication and password reset.
- Application tracking.
- Job discovery and match scores.
- Analytics.
- Profile and source/company views.
- Gmail connection and inbox scanning.
- Resume management and tailoring.
- In-app and push reminder flows.
- Account deletion.
- Deep links for supported authentication flows.

## Run locally

```bash
npm ci
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to the API origin without `/api`:

| Target | Example |
|---|---|
| Web | `http://localhost:5000` |
| Android emulator | `http://10.0.2.2:5000` |
| Physical device | `http://<LAN-IP>:5000` |
| Production | HTTPS API origin |

Optional variables include `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_WEB_URL` and `EXPO_PUBLIC_SENTRY_DSN`.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run verify:bundle
npx expo install --check
```

The documented verification run contains **75 mobile tests**.

## Security

- Session material uses Expo SecureStore backed by the platform keystore.
- Access tokens are short-lived.
- Refresh tokens rotate through the same backend session model.
- Refresh is single-flight to avoid concurrent refresh races.
- Per-account caches are cleared on sign-out.
- Blocked accounts are signed out.
- Account deletion requires confirmation and the current password.
- Logging avoids tokens and personal data.
- There is no mobile admin console.

## Known limitations

- Resume file upload is currently handed off to the web app.
- Password-reset deep linking does not open while an active session is present; the user must sign out first.
- Hosted legal pages are templates and require completion before store submission.
- Store builds and live push delivery were not exercised in the verification environment.

See [`docs/07`](../docs/07_Mobile_App_Implementation_and_Release.md) for implementation and release details.
