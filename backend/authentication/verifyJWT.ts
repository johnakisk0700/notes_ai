import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";

// ── Dev auth bypass ─────────────────────────────────────────────────────────
// When MODE=dev AND DEV_AUTH_BYPASS=true, skip Clerk entirely and authenticate
// every request as a fixed local user, so the app opens without signing in while
// iterating on UI. Double-guarded on MODE=dev so it can NEVER engage in prod.
// Toggle from the root .env (single switch, wired to both containers via
// docker-compose.override.yml). See docs/auth.md → "Dev auth bypass".
// Remember to turn it back OFF when you're done.
const DEV_AUTH_BYPASS = process.env.MODE === "dev" && process.env.DEV_AUTH_BYPASS === "true";
const DEV_USER_ID = "dev-user";

if (DEV_AUTH_BYPASS) {
  console.warn("⚠️  DEV_AUTH_BYPASS is ON — every request authenticates as the local dev user. Never enable in production.");
}

// Provision the dev user's profile once (admin, so all UI is reachable). Mirrors
// the lazy provisioning the real Clerk path does, keyed by the fixed dev id.
let devProfileReady = false;
async function ensureDevProfile() {
  if (devProfileReady) return;
  await drizzlePg
    .insert(profileTable)
    .values({ id: DEV_USER_ID, email: "dev@local", first_name: "Dev", last_name: "User", role: "admin" })
    .onConflictDoNothing();
  devProfileReady = true;
}

export const verifyJWT = async (req, res, next) => {
  if (DEV_AUTH_BYPASS) {
    await ensureDevProfile();
    req.user = { id: DEV_USER_ID, isAdmin: true };
    return next();
  }

  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  try {
    // Ensure a local profile row exists. Clerk owns identity; our Postgres owns
    // role/settings keyed by the Clerk user ID. Lazily provision on first request
    // so users created directly in Clerk (or before create-profile ran) still work.
    // Existing users do not need a remote Clerk user lookup on every API request.
    let rows = await drizzlePg
      .select({ role: profileTable.role })
      .from(profileTable)
      .where(eq(profileTable.id, userId));

    if (rows.length === 0) {
      const user = await clerkClient.users.getUser(userId);
      const email =
        user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? `${userId}@no-email.local`;

      await drizzlePg
        .insert(profileTable)
        .values({
          id: userId,
          email,
          first_name: user.firstName ?? null,
          last_name: user.lastName ?? null,
          role: "user",
        })
        .onConflictDoNothing();

      rows = await drizzlePg.select({ role: profileTable.role }).from(profileTable).where(eq(profileTable.id, userId));
    }

    req.user = { id: userId, isAdmin: rows[0]?.role === "admin" };
    next();
  } catch (err) {
    console.error("JWT verification error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
};
