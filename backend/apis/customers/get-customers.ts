import { customersTable } from "@shared/db/schema/customers";
import { drizzlePg } from "clients/drizzle_postgres_client";

export async function getCustomers(req, res) {
  const rows = await drizzlePg.select({ name: customersTable.name }).from(customersTable);

  res.status(200).json({ names: rows.map(r => r.name).filter(Boolean) });
}
