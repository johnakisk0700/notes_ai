import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";

export const verifyJWT = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  try {
    // Resolve the Clerk user from the verified session.
    const user = await clerkClient.users.getUser(userId);

    // Ensure a local profile row exists. Clerk owns identity; our Postgres owns
    // role/settings keyed by the Clerk user ID. Lazily provision on first request
    // so users created directly in Clerk (or before create-profile ran) still work.
    let rows = await drizzlePg
      .select({ role: profileTable.role })
      .from(profileTable)
      .where(eq(profileTable.id, userId));

    if (rows.length === 0) {
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses?.[0]?.emailAddress ??
        `${userId}@no-email.local`;

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

      rows = await drizzlePg
        .select({ role: profileTable.role })
        .from(profileTable)
        .where(eq(profileTable.id, userId));
    }

    req.user = user; // Clerk user object; req.user.id is the Clerk user ID
    req.user.isAdmin = rows[0]?.role === "admin";
    next();
  } catch (err) {
    console.error("JWT verification error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
};
