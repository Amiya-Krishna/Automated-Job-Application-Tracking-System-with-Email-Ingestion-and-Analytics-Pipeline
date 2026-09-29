# Web production implementation

## Completed

- Replaced browser JWT persistence with the existing rotating session architecture. Web access tokens are memory-only; the API stores the web refresh token in an `HttpOnly` cookie and rotates it through `/api/auth/refresh`. Mobile JSON refresh tokens and extension legacy tokens remain unchanged.
- Added startup restoration through `/auth/refresh` and `/auth/me`, safe GET-only 401 retry, explicit sign-out, request timeout, and consistent offline/permission/rate-limit/server error messages.
- Added a React error boundary with optional sanitized error-event reporting, route-level code splitting, loading states, production API URL validation, metadata, and an SPA rewrite already present in `client/vercel.json`.
- Hardened API transport with CSP/security headers, production `CLIENT_URL` enforcement, strict CORS in production, cookie cleanup on logout/account deletion, and sanitized server/Gmail error logs.
- Added client lint/test/build validation to CI and a public-only client environment example.

## Areas changed

- `client/src/api.js`, `client/src/context/AuthContext.jsx`, `client/src/utils/auth.js`: web session lifecycle and API recovery.
- `client/src/main.jsx`, `client/src/App.jsx`, `client/src/components/ErrorBoundary.jsx`, `client/src/components/ProtectedRoute.jsx`, `client/src/components/Navbar.jsx`, `client/src/pages/Login.jsx`: authenticated UX, boundary, lazy routes, and accessible login labels.
- `server/routes/authRoutes.js`, `server/server.js`, `server/routes/gmailRoutes.js`: cookie-compatible web sessions, production CORS/security, safe errors.
- `.github/workflows/ci.yml`, `client/.env.example`, `client/index.html`: deployment/validation configuration.

## Required configuration

Client (production):

- `VITE_API_BASE_URL=https://api.your-domain.example` (required and HTTPS only).
- `VITE_ERROR_REPORTING_ENDPOINT` is optional and must accept only sanitized client errors.

Server (production):

- `NODE_ENV=production`, `JWT_SECRET`, database settings, and existing Gmail/Redis settings.
- `CLIENT_URL` must contain the exact HTTPS web origin(s), comma separated if needed.
- Deploy the client and API over HTTPS. Cross-origin production cookies use `SameSite=None; Secure`; HTTP cannot support them.

## Deployment requirements and limits

- Keep the Vercel SPA rewrite (or configure the equivalent fallback on another host).
- Register the API Gmail callback URL and the HTTPS client origin with Google.
- The existing notification backend provides account preferences and mobile push delivery. The web app deliberately does not invent a parallel browser-push delivery channel; its in-app activity feed remains local, matching the existing client event model.
- Rate limiting is currently per API instance. For horizontally scaled production deployments, back it with the existing Redis infrastructure before relying on it as a global abuse control.
