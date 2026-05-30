import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";

export async function createProfile(req, res) {
  const { id, first_name, last_name, email } = req.body;

  await drizzlePg
    .insert(profileTable)
    .values({
      id: id,
      first_name: first_name,
      last_name: last_name,
      role: "user",
      email: email,
    })
    .onConflictDoNothing();

  res.status(200).json({ ok: true });
}
