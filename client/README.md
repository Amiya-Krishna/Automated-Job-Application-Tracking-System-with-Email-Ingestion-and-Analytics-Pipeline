# TrackTrail Web Application

React 19 + Vite 8 + Tailwind 4 single-page application containing the user dashboard and admin console.

The web app is a client of the REST API in `../server`; it does not contain the authorization boundary. The API remains authoritative for authentication, roles and data ownership.

## Product surface

- Authentication and password reset.
- Application tracking.
- Matched jobs and job discovery views.
- Companies and sources.
- Analytics.
- Gmail connection and inbox scanning.
- Resume management and tailoring.
- Notifications/reminders.
- Admin user and catalog management.
- Account deletion.

## Local development

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # 54 tests
npm run lint
npm run build
```

In development, Vite proxies `/api` to `http://localhost:5000/api`.

Some tests import server helpers, so install dependencies in `../server` first.

## Configuration

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | HTTPS API origin for production builds; omit `/api` |
| `VITE_USE_REMOTE_API` | Use a deployed API while developing locally |
| `VITE_ERROR_REPORTING_ENDPOINT` | Optional endpoint for sanitized client errors |

Only public values belong in `VITE_*` variables.

## Session and security behavior

- Access tokens are kept in memory rather than browser storage.
- Refresh tokens are handled by the API in an HttpOnly cookie.
- UI visibility for admin features is only a convenience; the API enforces authorization.
- Account deletion requires explicit confirmation and the current password.
- Blocked accounts are signed out and shown a persistent blocked state.
- Client caches are cleared when the session ends.

## Deployment

`vercel.json` contains API rewrites and the SPA fallback. Production deployments should point the web client at the correct API origin.

See [`docs/06`](../docs/06_Web_Client_Production_and_Responsiveness.md) and [`docs/05`](../docs/05_Deployment_and_Operations.md).
