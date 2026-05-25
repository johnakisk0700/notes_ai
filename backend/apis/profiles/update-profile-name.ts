import { profileTable } from "@shared/db/schema/profile";

import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";

// Sets the signed-in user's name on their own profile row. Backs the onboarding
// step that collects first/last name for users whose OAuth provider supplied
// none (Clerk owns identity, so the client updates Clerk; this mirrors it into
// Postgres). Always keyed by the verified req.user.id — never a body-supplied id.
export async function updateProfileName(req, res) {
  const first_name = typeof req.body?.first_name === "string" ? req.body.first_name.trim() : "";
  const last_name = typeof req.body?.last_name === "string" ? req.body.last_name.trim() : "";

  if (!first_name || !last_name) {
    return res.status(400).json({ error: "first_name and last_name are required" });
  }

  try {
    const updated = await drizzlePg
      .update(profileTable)
      .set({ first_name, last_name, updated_at: new Date() })
      .where(eq(profileTable.id, req.user.id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updating profile name:", error);
    res.status(500).json({ error: "Failed to update profile name" });
  }
}
