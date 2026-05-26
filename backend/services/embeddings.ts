// Builds a note's embedding and upserts it into the Qdrant `notes` collection.
//
// What we embed is the note's MEANING — title + content, nothing else. The old version
// also baked in the user's name, a formatted "Created at" (which was literally "Invalid
// Date" due to a field-name bug), and "[Reminder: none]" — boilerplate that's near-identical
// across every note, so it only diluted the vector. Structured metadata (user, dates) now
// lives in the payload, used for filtering/display, not for similarity.
//
// Callers run this INSIDE the note's save transaction (store-note / update-note): if it
// throws, the whole save rolls back, so Postgres and Qdrant never drift apart.
import { qdrantClient } from "clients/qdrant_client";
import { embedText, EMBEDDING_DIM } from "clients/embedding_client";
import { cleanNoteText } from "utils/noteText";

const NOTES_COLLECTION = "notes";

// Matches a Drizzle `notes` row — store-note / update-note pass their `.returning()` row
// straight through, so there's no field-name remapping to get wrong.
export interface EmbeddableNote {
  id: string;
  userId: string;
  title: string | null;
  content: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}

function noteEmbeddingText(note: EmbeddableNote): string {
  return cleanNoteText([note.title?.trim(), note.content?.trim()].filter(Boolean).join("\n\n"));
}

export async function createAndSaveNoteEmbedding(note: EmbeddableNote): Promise<void> {
  const vector = await embedText(noteEmbeddingText(note));
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding has ${vector.length} dims, expected ${EMBEDDING_DIM} — EMBEDDING_MODEL and the 'notes' collection are out of sync.`
    );
  }

  await qdrantClient.upsert(NOTES_COLLECTION, {
    wait: true,
    points: [
      {
        id: note.id,
        vector,
        payload: {
          title: note.title ?? "",
          content: note.content,
          user_id: note.userId,
          created_at: toIso(note.created_at),
          updated_at: toIso(note.updated_at),
        },
      },
    ],
  });
}
