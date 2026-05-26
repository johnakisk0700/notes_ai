import { qdrantClient } from "clients/qdrant_client";
import fs from "fs";
import { qdrantBatchUpsert } from "utils/qdrantUpsert";

// Per-collection vector dims. `notes` uses google/gemini-embedding-001 (3072-dim); the
// legacy domain collections were seeded from precomputed ada-002 embeddings, so they stay
// 1536. (Recreating an existing collection at a new dim is the reindex script's job, not
// this create-on-404 path's.)
const COLLECTION_DIMS: Record<string, number> = {
  notes: 3072,
  beverages: 1536,
  customers: 1536,
  sales: 1536,
  polites: 1536,
};

export async function init_collections() {
  for (const [col, size] of Object.entries(COLLECTION_DIMS)) {
    try {
      await qdrantClient.getCollection(col);
    } catch (e: any) {
      if (e.status === 404) {
        try {
          await qdrantClient.createCollection(col, {
            vectors: { size, distance: "Cosine" },
          });
        } catch (e: any) {
          if (e.statusText !== "Conflict") {
            throw new Error("kati phge ontws strava"); // Assuming this is intentional
          }
          // If it's a conflict, it means the collection is being created concurrently.
          // You might want to log this or handle it differently.  For example:
          console.warn(`Collection ${col} creation conflict. Likely created concurrently.`);
        }
      }
    }
  }
}

async function migrateBeverages() {
  const beverages = JSON.parse(
    fs.readFileSync("./data/gptNormalizedWines_v2_grouped.json", {
      encoding: "utf8",
    })
  );
  const beverageEmbeddings = JSON.parse(
    fs.readFileSync("./data/BEVERAGES_embeddings.json", {
      encoding: "utf8",
    })
  );

  const points = beverageEmbeddings.map((emb, i) => ({
    id: i,
    vector: emb,
    payload: beverages[i],
  }));

  await qdrantBatchUpsert("beverages", points);
}

async function migrateCustomersNew() {
  const customers = JSON.parse(
    fs.readFileSync("./data/polites.json", {
      encoding: "utf8",
    })
  ).Sheet;
  const customerEmbeddings = JSON.parse(
    fs.readFileSync("./data/polites_embeddings.json", {
      encoding: "utf8",
    })
  );

  const points = customerEmbeddings.map((emb, i) => ({
    id: i,
    vector: emb,
    payload: {
      concatenated: `Shop/Μαγαζί: ${customers[i].name} ${customers[i].title} Πωλητής/Salesman: ${customers[i].salesman}`,
      ...customers[i],
    },
  }));

  await qdrantBatchUpsert("polites", points);
}

async function migrateSales() {
  const sales = JSON.parse(
    fs.readFileSync("./data/polites.json", {
      encoding: "utf8",
    })
  ).Sheet;
  const salesEmbeddings = JSON.parse(
    fs.readFileSync("./data/polites_embeddings.json", {
      encoding: "utf8",
    })
  );

  const points = salesEmbeddings.map((emb, i) => ({
    id: i,
    vector: emb,
    payload: sales[i],
  }));

  await qdrantBatchUpsert("sales", points);
}

async function main() {
  await qdrantClient.deleteCollection("polites");
  await init_collections();
  // await migrateCustomersNew();
  // await migrateBeverages();
  // await migrateCustomers();
  // await migrateSales();
}

// Only run the destructive reset (drops + reseeds `polites`) when this file is
// executed directly (`bun scripts/qdrant-init.ts`). Importing it — e.g. the
// startup `qdrant-ensure.ts` reusing `init_collections()` — must have NO side
// effects, so guard the entrypoint.
if (import.meta.main) {
  main();
}
