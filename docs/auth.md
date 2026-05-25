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
  2. `clerkClient.users.getUser(userId)` → the Clerk user, attached as `req.user`.
  3. Loads `role` from the `profile` table; sets `req.user.isAdmin`.
- The `profile` PK is the Clerk user ID (`text`), so no ID mapping is needed.

## Profile provisioning

Every Clerk user needs a matching `profile` row (for role + tefteri). The email/password
sign-up calls `POST /api/create-profile`. For everyone else — Google OAuth users, users
created directly in Clerk, or if `create-profile` failed — `verifyJWT` lazily creates the
row from the Clerk user (`firstName`/`lastName`/primary email) on the first authenticated
request. So no auth path can end up without a profile.

## Required config

- Backend `.env`: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`.
- Frontend `.env`: `VITE_CLERK_PUBLISHABLE_KEY`.
- Clerk dashboard: enable **Google** under _User & Authentication → Social Connections_
  (and email/password name fields under _Personal information_). Dev uses Clerk's shared
  OAuth credentials; production needs your own Google OAuth client configured in Clerk.
