import { QdrantClient } from "@qdrant/qdrant-js";
import "dotenv/config";

export const qdrantClient = new QdrantClient({
  https: false,
  host: process.env.QDRANT_HOST || "localhost",
  port: Number(process.env.QDRANT_PORT) || 6971,
  apiKey: process.env.QDRANT__SERVICE__API_KEY,
  checkCompatibility: false,
});
