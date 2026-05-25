import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq } from "drizzle-orm";

export async function createProfile(req, res) {
  const { id, first_name, last_name, email } = req.body;

  try {
    const result = await drizzlePg.insert(profileTable).values({
      id: id,
      first_name: first_name,
      last_name: last_name,
      role: "user",
      email: email,
    });

    res.status(200).json(result[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
