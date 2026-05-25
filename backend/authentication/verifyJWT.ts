import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { clerkClient, requireAuth, getAuth } from "@clerk/express";

export const verifyJWT = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  try {
    // Use Clerk's JavaScript Backend SDK to get the user's User object
    const user = await clerkClient.users.getUser(userId);

    const role = await drizzlePg
      .select({ role: profileTable.role })
      .from(profileTable)
      .where(eq(profileTable.id, userId));
    const isAdmin = role[0].role === "admin";

    req.user = user;
    req.user.isAdmin = isAdmin;
    next();
  } catch (err) {
    console.error("JWT verification error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
};
