# Auth (Clerk)

Auth is **Clerk end-to-end**. Supabase has been removed. Identity (sign-in,
sessions, the user record) lives in Clerk; app data (role, notes, …) lives in our
Postgres, keyed by the Clerk user ID.

## Frontend

- `ClerkProvider` wraps the app in `frontend/src/main.tsx` with
  `VITE_CLERK_PUBLISHABLE_KEY`.
- Token injection: `src/integrations/api.ts` reads the active Clerk session token
  (`window.Clerk.session.getToken()`) and sets `Authorization: Bearer <token>` on
  every axios request. The same is done in the raw-`fetch` helper `fetchApi`.
- Route guards: `ProtectedRoute` redirects unauthenticated users to sign-in, and
  redirects signed-in users with **no name in Clerk** to `/onboarding` (see below);
  `AdminGuard` checks `isAdmin`. Both read from the app `AuthProvider`, which wraps
  Clerk's `useUser` and fetches the user's `role` from `/api/get-profile` to derive
  `isAdmin`.
- Onboarding (`/onboarding`, `OnboardingPage`): shown only when a signed-in user has
  no `firstName`/`lastName` in Clerk — i.e. an OAuth provider that supplied none, or a
  user created directly in the Clerk dashboard. It collects the name, updates Clerk
  (`user.update`, the identity source of truth) so the guard lets them through, then
  mirrors it to Postgres via `POST /api/update-profile-name`. Lives outside
  `ProtectedRoute` so the redirect can't loop. Email/password and most Google users
  already have a name, so they never see it.
- Sign-in/up uses Clerk (`LoginPage`), with two paths:
  - **Email + password** (custom flow via `useSignIn`/`useSignUp`). Sign-up emails a
    one-time code; the verification step resumes after a refresh (Clerk keeps the
    in-progress sign-up) but offers a "use a different email" escape so it can't trap
    the user. After verification the app calls `POST /api/create-profile`
    (best-effort — `verifyJWT` also provisions it).
  - **Google OAuth** ("Continue with Google" button) via
    `signIn.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: '/sso-callback' })`.
    Clerk transfers an unknown Google identity into a sign-up automatically, so one
    button serves both new and returning users. The round-trip lands on the
    `/sso-callback` route (`SSOCallbackPage` → Clerk's `AuthenticateWithRedirectCallback`),
    which finishes the handshake and redirects to `/`. No `create-profile` call on this
    path — the profile is provisioned lazily on the first API request (see below).

## Backend

- `clerkMiddleware()` is applied globally in `server.ts`.
- `verifyJWT` (`backend/authentication/verifyJWT.ts`):
  1. `getAuth(req)` → `userId` (401 if missing).
  2. Loads `role` from the `profile` table and attaches `{ id, isAdmin }` as `req.user`.
  3. Only when that profile row is missing, fetches the Clerk user to lazily populate it.
- The `profile` PK is the Clerk user ID (`text`), so no ID mapping is needed.

## Profile provisioning

Every Clerk user needs a matching `profile` row (for role + tefteri). The email/password
sign-up calls `POST /api/create-profile`. For everyone else — Google OAuth users, users
created directly in Clerk, or if `create-profile` failed — `verifyJWT` lazily fetches
the Clerk user and creates the row (`firstName`/`lastName`/primary email) on the first
authenticated request. Established users are served from Postgres without a per-request
Clerk API fetch. So no auth path can end up without a profile.

## Required config

- Backend `.env`: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`.
- Frontend `.env`: `VITE_CLERK_PUBLISHABLE_KEY`.
- Clerk dashboard: enable **Google** under _User & Authentication → Social Connections_
  (and email/password name fields under _Personal information_). Dev uses Clerk's shared
  OAuth credentials; production needs your own Google OAuth client configured in Clerk.

## Dev auth bypass

A dev-only escape hatch to open the app **without signing in** — handy when iterating
on UI you'd otherwise have to log in to reach. **Off by default.**

- **Switch:** `DEV_AUTH_BYPASS` in the **root `.env`** (single source). Compose passes it
  to the backend as `DEV_AUTH_BYPASS` and to the frontend as `VITE_DEV_AUTH_BYPASS`
  (`docker-compose.override.yml`), so one value drives both.
- **Backend** (`verifyJWT`): when `MODE=dev` **and** `DEV_AUTH_BYPASS=true`, Clerk is
  skipped and every request authenticates as a fixed local user (id `dev-user`, role
  `admin`, profile provisioned on first request). The `MODE=dev` guard means it can
  **never** engage in prod, even if the var leaks into a prod env.
- **Frontend** (`src/integrations/devAuth.ts`): when `import.meta.env.DEV` **and**
  `VITE_DEV_AUTH_BYPASS=true`, `ProtectedRoute` skips the Clerk gate + onboarding check
  and `AuthProvider` serves a synthetic admin `DEV_USER`. The `import.meta.env.DEV` guard
  compiles it out of any prod build.
- Clerk keys must still be present (the `ClerkProvider` stays mounted; the bypass only
  skips the gate + token, it doesn't remove Clerk).
- **Enable:** set `DEV_AUTH_BYPASS=true` in the root `.env`, then recreate the two app
  containers so they re-read env:
  `docker compose up -d --no-deps --force-recreate backend frontend`.
- **Turn it OFF when done:** set it back to empty/`false` and recreate again. The backend
  logs a loud `⚠️ DEV_AUTH_BYPASS is ON` warning at startup so an accidentally-left-on
  bypass is obvious in the logs.
