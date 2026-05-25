import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";

export async function getProfile(req, res) {
  console.log(req.query);
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId parameter is required" });
  }

  try {
    const result = await drizzlePg
      .select()
      .from(profileTable)
      .where(eq(profileTable.id, userId))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(result[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
