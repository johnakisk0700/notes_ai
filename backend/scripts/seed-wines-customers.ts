import "dotenv/config";
import fs from "fs";
import path from "path";
import { customersTable } from "@shared/db/schema/customers";
import { winesTable } from "@shared/db/schema/wines";
import { drizzlePg } from "clients/drizzle_postgres_client";

// Seeds the `wines` / `customers` tables (editor autocomplete) from the JSON
// files the project already uses for Qdrant seeding.
//   - wines:     `gptNormalizedWines_v2_grouped.json` — each row carries both a
//                full `product_name` and a `producer`; we seed both (deduped).
//   - customers: `polites.json` ({ Sheet: [{ name, title }] }). This file holds
//                customer PII (emails, AFM, addresses) and is intentionally NOT
//                bundled — drop it in `data/` yourself if you need it; otherwise
//                customer seeding no-ops.
// Run: `bun run scripts/seed-wines-customers.ts`
const DATA_DIR = path.resolve(process.cwd(), "data");

function readJson(file: string): any | null {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  ${p} not found — skipping.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function extractName(item: any): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (item && typeof item === "object") return (item.name ?? item.title ?? "").toString().trim() || null;
  return null;
}

async function seedWines() {
  const raw = readJson("gptNormalizedWines_v2_grouped.json");
  if (!raw) return;
  const items: any[] = Array.isArray(raw) ? raw : (raw.Sheet ?? []);
  // Seed both the specific bottle (`product_name`) and its maker (`producer`),
  // so autocomplete matches either granularity.
  const names = [
    ...new Set(
      items
        .flatMap(w => [w?.product_name, w?.producer])
        .map(v => (v ?? "").toString().trim())
        .filter(Boolean),
    ),
  ];
  for (const name of names) {
    await drizzlePg.insert(winesTable).values({ name }).onConflictDoNothing();
  }
  console.log(`🍷 Seeded ${names.length} wines.`);
}

async function seedCustomers() {
  const raw = readJson("polites.json");
  if (!raw) return;
  const items: any[] = Array.isArray(raw) ? raw : (raw.Sheet ?? []);
  const seen = new Set<string>();
  let count = 0;
  for (const item of items) {
    const name = extractName(item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    await drizzlePg
      .insert(customersTable)
      .values({ name, title: item?.title ?? null })
      .onConflictDoNothing();
    count++;
  }
  console.log(`👤 Seeded ${count} customers.`);
}

async function main() {
  await seedWines();
  await seedCustomers();
  console.log("✅ Seed complete.");
}

main().catch(e => {
  console.error("💥 Seed failed:", e);
  process.exit(1);
});
