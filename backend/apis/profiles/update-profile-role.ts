import { profileTable } from "@shared/db/schema/profile";

import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";

export async function updateProfileRole(req, res) {
  const { profileId, role } = req.body;

  const updatedProfile = await drizzlePg
    .update(profileTable)
    .set({
      role: role,
      updated_at: new Date(), // Assuming you have this timestamp field
    })
    .where(eq(profileTable.id, profileId))
    .returning();

  res.status(200).json(updatedProfile[0]);
}
