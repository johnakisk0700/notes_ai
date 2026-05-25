import { winesTable } from "@shared/db/schema/wines";
import { drizzlePg } from "clients/drizzle_postgres_client";

export async function getWines(req, res) {
  const rows = await drizzlePg.select({ name: winesTable.name }).from(winesTable);

  res.status(200).json({ names: rows.map(r => r.name).filter(Boolean) });
}
