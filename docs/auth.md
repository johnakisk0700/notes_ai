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
- Route guards: `ProtectedRoute` redirects unauthenticated users to sign-in;
  `AdminGuard` checks `isAdmin`. Both read from the app `AuthProvider`, which wraps
  Clerk's `useUser` and fetches the user's `role` from `/api/get-profile` to derive
  `isAdmin`.
- Sign-in/up uses Clerk (`LoginPage`). After a successful sign-up, the app calls
  `POST /api/create-profile` so a Postgres `profile` row exists.

## Backend

- `clerkMiddleware()` is applied globally in `server.ts`.
- `verifyJWT` (`backend/authentication/verifyJWT.ts`):
  1. `getAuth(req)` → `userId` (401 if missing).
  2. `clerkClient.users.getUser(userId)` → the Clerk user, attached as `req.user`.
  3. Loads `role` from the `profile` table; sets `req.user.isAdmin`.
- The `profile` PK is the Clerk user ID (`text`), so no ID mapping is needed.

## Profile provisioning

Every Clerk user needs a matching `profile` row (for role + tefteri). It is created
via `POST /api/create-profile` on sign-up. If a profile can be missing on first
request (e.g. users created directly in Clerk), `verifyJWT` lazily creates one from
the Clerk user data.

## Required config

- Backend `.env`: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`.
- Frontend `.env`: `VITE_CLERK_PUBLISHABLE_KEY`.
