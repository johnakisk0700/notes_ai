import { QdrantClient } from "@qdrant/qdrant-js";
import "dotenv/config";

export const qdrantClient = new QdrantClient({
  https: false,
  host: process.env.QDRANT_HOST || "localhost",
  port: Number(process.env.QDRANT_PORT) || 6971,
  apiKey: process.env.QDRANT__SERVICE__API_KEY,
  checkCompatibility: false,
  // Bound every request so a wedged upsert/query can't hang a note save or a search
  // indefinitely — the tool then resolves to a failed state instead of spinning forever.
  timeout: 10_000,
});
