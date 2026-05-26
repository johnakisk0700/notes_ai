// One-shot: ensures the Qdrant collections the app expects exist, then exits.
//
// Run automatically by the compose `qdrant-init` service (which the backend waits
// on via service_completed_successfully) and manually via `bun scripts/qdrant-ensure.ts`.
//
// This is the SAFE, non-destructive entry — it only reuses `init_collections()`
// (create-on-404, tolerates concurrent-create conflicts). The reset path that
// DROPS + reseeds `polites` lives in qdrant-init.ts's own `main()`; run that by
// hand only when you intend to wipe.
import { qdrantClient } from "clients/qdrant_client";
import { init_collections } from "./qdrant-init";

const MAX_ATTEMPTS = 30;
const DELAY_MS = 2000;

// Compose only gates on Qdrant `service_started`, and `init_collections()`
// silently swallows non-404 errors — so probe for real readiness here, otherwise
// a not-yet-ready Qdrant would let this "succeed" without creating anything.
for (let attempt = 1; ; attempt++) {
  try {
    await qdrantClient.getCollections();
    break;
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`Qdrant not reachable after ${MAX_ATTEMPTS} attempts:`, err);
      process.exit(1);
    }
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }
}

await init_collections();
console.log("Qdrant collections ensured.");
process.exit(0);
