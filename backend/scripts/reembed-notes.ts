// One-off backfill: re-embed every note in Postgres into Qdrant with the CURRENT embedding
// model. Run by hand after changing EMBEDDING_MODEL / its dim, or to repair a stale index:
//   docker compose exec backend bun scripts/reembed-notes.ts   (or, from backend/: bun scripts/reembed-notes.ts)
//
// DESTRUCTIVE for the `notes` collection only: it drops + recreates it at EMBEDDING_DIM —
// safe, because Postgres is the source of truth for note text — then re-embeds every note
// with the clean payload shape (services/embeddings.ts). Other collections are untouched.
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { qdrantClient } from "clients/qdrant_client";
import { createAndSaveNoteEmbedding } from "services/embeddings";
import { embedText, EMBEDDING_MODEL, EMBEDDING_DIM } from "clients/embedding_client";

const COLLECTION = "notes";

async function main() {
  // Validate the embedding endpoint + dimension BEFORE dropping anything, so a bad key or
  // dim mismatch fails loudly without leaving an empty collection behind.
  const probe = await embedText("δοκιμή");
  if (probe.length !== EMBEDDING_DIM) {
    throw new Error(`Probe embedding is ${probe.length}-dim but EMBEDDING_DIM=${EMBEDDING_DIM}; aborting before touching Qdrant.`);
  }
  console.log(`Embedding OK (${EMBEDDING_MODEL}, ${probe.length}-dim). Recreating '${COLLECTION}'…`);

  try {
    await qdrantClient.deleteCollection(COLLECTION);
  } catch {
    // Collection didn't exist — fine.
  }
  await qdrantClient.createCollection(COLLECTION, { vectors: { size: EMBEDDING_DIM, distance: "Cosine" } });

  const notes = await drizzlePg.select().from(notesTable);
  console.log(`Re-embedding ${notes.length} notes…`);

  let embedded = 0;
  let failed = 0;
  for (const note of notes) {
    try {
      await createAndSaveNoteEmbedding(note);
      embedded++;
    } catch (err: any) {
      failed++;
      console.error(`  FAILED ${note.id}: ${err?.message ?? err}`);
    }
  }

  console.log(`Done. embedded=${embedded} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
