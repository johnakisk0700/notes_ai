import { Profile, profileTable } from "@shared/db/schema/profile";
import { Tefteri, tefteriTable } from "@shared/db/schema/tefteri";
import {
  PaginationResponse,
  QueryParameters,
} from "@shared/interfaces/QueryParameters";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { count, desc, eq, sql } from "drizzle-orm";
import { applyPagination } from "utils/drizzleHelpers";

export async function updateProfileRole(req, res) {
  const { profileId, role } = req.body;

  try {
    const updatedProfile = await drizzlePg
      .update(profileTable)
      .set({
        role: role,
        updated_at: new Date(), // Assuming you have this timestamp field
      })
      .where(eq(profileTable.id, profileId))
      .returning();

    res.status(200).json(updatedProfile[0]);
  } catch (error) {
    console.error("Error updating profile role:", error);
    res.status(500).json({ error: "Failed to update profile role" });
  }
}
