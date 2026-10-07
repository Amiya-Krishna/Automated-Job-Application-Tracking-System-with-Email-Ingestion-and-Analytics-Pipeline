# TrackTrail Web App

React 19 + Vite 8 + Tailwind 4 single-page app, including the admin console. Talks to the REST API in `../server`. Overview and architecture: [docs/06](../docs/06_Web_Client_Production_and_Responsiveness.md).

```bash
npm ci
npm run dev        # http://localhost:5173 → API at http://localhost:5000/api
npm test           # 54 tests (Vitest, jsdom)
npm run lint
npm run build
```

Some tests import server test helpers, so run `npm ci` in `../server` first.

## Configuration

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | HTTPS API origin for production builds (no `/api`) |
| `VITE_USE_REMOTE_API` | `true` to use a deployed API during `npm run dev` |
| `VITE_ERROR_REPORTING_ENDPOINT` | Optional endpoint for sanitised client errors |

Copy `.env.local.example` to `.env.local` for local development. Only public values belong in `VITE_*` variables.

## Security notes

- Access token in memory only; refresh token is an `HttpOnly` cookie handled by the API. Nothing durable in web storage.
- Admin routes and buttons are hidden for non-admins as a convenience; the API enforces every rule.
- Account deletion (Profile → Danger zone) requires typing `DELETE` and the password; a blocked account sees a persistent blocked message at login.

`vercel.json` rewrites `/api/*` to the API origin and falls back to `index.html`; change the API origin for your deployment.
