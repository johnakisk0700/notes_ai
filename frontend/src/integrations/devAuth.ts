import type { useUser } from '@clerk/clerk-react';

// ── Dev auth bypass ─────────────────────────────────────────────────────────
// When VITE_DEV_AUTH_BYPASS=true (dev builds only), the route guards and
// AuthProvider skip Clerk and treat the app as signed in as a fixed local
// "Dev User". Pairs with the backend's DEV_AUTH_BYPASS (verifyJWT) — both read
// the same root-.env switch, wired through docker-compose.override.yml.
// Double-guarded on import.meta.env.DEV so it compiles out of a prod build.
// See docs/auth.md → "Dev auth bypass". Remember to turn it back OFF when done.
export const DEV_AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

type ClerkUser = ReturnType<typeof useUser>['user'];

// Minimal Clerk-user shape — only the fields the app reads via useAuth()/useUser()
// (chiefly `id`). Cast because we deliberately don't reconstruct the full resource.
export const DEV_USER = {
  id: 'dev-user',
  firstName: 'Dev',
  lastName: 'User',
  fullName: 'Dev User',
  primaryEmailAddress: { emailAddress: 'dev@local' },
  imageUrl: '',
} as unknown as NonNullable<ClerkUser>;
