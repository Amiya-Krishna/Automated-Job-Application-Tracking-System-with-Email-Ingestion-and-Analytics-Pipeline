# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Local vs Production API

The web client now has an explicit two-environment setup:

- `npm run dev` -> `http://localhost:5000/api` by default.
- Production build -> same-origin `/api` through the deployed web proxy.
- A deployed API URL in `.env` cannot accidentally override local development.
- If local development intentionally needs the deployed API, set `VITE_USE_REMOTE_API=true`.

For local development, copy `client/.env.local.example` to `client/.env.local`.

## Roles (User / Admin)

`AuthContext` exposes `isAdmin` (from `/auth/me` → `user.role`). Admin-only
pieces: `/job-discovery` and `/admin` (wrapped in `components/AdminRoute.jsx`),
the "Job Discovery"/"Admin" nav items, and `components/AdminDeleteButton.jsx`
on Sources, Companies and Matched Jobs. The API enforces the same rules
(`requireAdmin`), so hiding UI is only a convenience. Shared action-button
styles (`.tt-btn`, `.tt-actions`) live in `src/index.css`. The Admin panel's
**User management** (`components/UserManagement.jsx`) lists accounts (search,
status filter, pagination) and lets admins block, unblock or delete normal users
with confirmation dialogs; the signed-in admin and other admins are protected
(the API refuses them with `cannot_modify_self` / `cannot_manage_admin`).
`pages/Profile.jsx` has a **Danger zone** to delete your own account (type
`DELETE` + password). `Login` shows a persistent "account blocked" message,
also after an active session is ended by a block (`403 account_blocked`). See
`docs/11_Roles_Permissions_Platforms_and_Release_Notes.md`.

## Tests

```bash
cd client
npm test && npm run lint && npm run build
```
