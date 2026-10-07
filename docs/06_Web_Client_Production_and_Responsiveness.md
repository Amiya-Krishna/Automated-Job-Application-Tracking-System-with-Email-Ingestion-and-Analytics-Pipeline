# 06 — Web Client (React) and Admin Console

Stack: React 19, Vite 8, React Router 7, Tailwind 4, Recharts, Axios. 54 tests (Vitest + Testing Library), ESLint clean, production build verified.

## Session handling

- The access token lives **in memory only** (`src/utils/auth.js`); nothing durable is kept in `localStorage`/`sessionStorage`. The refresh token is an `HttpOnly` cookie scoped to `/api/auth` and rotated on every refresh.
- On load the app restores the session through `/auth/refresh` then `/auth/me`. A failed GET with `401` is retried once after a refresh; mutations are never replayed automatically. Requests have a timeout and consistent offline / permission / rate-limit / server error messages.
- A blocked account (`403 account_blocked`) ends the session and the login page shows a persistent blocked message. Deleted accounts (`401 token_invalid`) sign out.
- Sign-out and account deletion clear the cookie, the in-memory token and per-user caches (notifications, activity feed) so a later user on the same browser sees nothing of the previous one.

## Pages and routing

Route-level code splitting (lazy routes), `ErrorBoundary` with optional sanitised error reporting (`VITE_ERROR_REPORTING_ENDPOINT`), `ProtectedRoute` (signed-in) and `AdminRoute` (admin) wrappers.

| Area | Pages |
|---|---|
| Everyone | Dashboard, Applied Jobs, Matched Jobs, Companies, Sources, Analytics, Integrations (Gmail), Resume tailoring and versions, Profile (including **Danger zone: delete account**), Login / Register / Forgot / Reset password |
| Admin only | Job Discovery, Admin console (overview, roles, **User management**), delete actions on Sources, Companies and Matched Jobs |

User management (`components/UserManagement.jsx`): search, status and role filters, pagination, Active/Blocked badges, block / unblock / delete with confirmation dialogs; the signed-in admin and other admins are shown as protected (the API enforces this too). Account deletion requires typing `DELETE` and the password.

## Responsiveness and accessibility

Tables collapse to card lists below the mobile breakpoint; touch targets are at least 40 px; the notification panel is viewport-aware; dialogs and state views (loading, empty, error) are shared components. Automated accessibility auditing has not been run; these are implementation practices, not a certified result.

## Configuration

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | HTTPS API origin (required for production builds; no `/api`) |
| `VITE_USE_REMOTE_API` | Opt in to using a deployed API during `npm run dev` |
| `VITE_ERROR_REPORTING_ENDPOINT` | Optional HTTPS endpoint for sanitised client errors |

Only public values belong in `VITE_*` variables. `client/vercel.json` rewrites `/api/*` to the API origin and falls back to `index.html` for the SPA; keep an equivalent on any other host.

## Limits

- The in-app activity feed is local to the browser; browser push is deliberately not implemented (push is a mobile feature).
- The production API origin appears in `vercel.json` and must be changed per deployment.
