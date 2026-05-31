// Writing a note is a two-store write — a Postgres row plus its Qdrant embedding —
// wrapped in ONE transaction: if the embed throws, the whole write rolls back, so the
// stores never drift apart. This lives here (not inline in the HTTP handlers) so the
// /store-note + /update-note endpoints and the chat's create_note/edit_note tools share
// one save path instead of copying the sync-or-fail invariant around.
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { createAndSaveNoteEmbedding } from "services/embeddings";
import { and, eq } from "drizzle-orm";

export interface CreateNoteInput {
  userId: string;
  content: string;
  title?: string | null;
}

export interface UpdateNoteInput {
  userId: string;
  noteId: string;
  content: string;
  title?: string | null;
}

export interface CreatedNote {
  id: string;
  title: string | null;
  content: string;
  created_at: Date | string;
}

export async function createNote({ userId, content, title }: CreateNoteInput): Promise<CreatedNote> {
  let created: CreatedNote | null = null;

  await drizzlePg.transaction(async tx => {
    const [note] = await tx.insert(notesTable).values({ content, title, userId }).returning();
    if (!note) throw new Error("Note could not be saved.");

    // Embed inside the save (sync-or-fail): a failed embed rolls back the row above, so
    // Postgres and Qdrant stay in lockstep. See services/embeddings.
    await createAndSaveNoteEmbedding(note);

    created = { id: note.id, title: note.title, content: note.content, created_at: note.created_at };
  });

  if (!created) throw new Error("Note could not be saved.");
  return created;
}

// The update mirror of createNote: re-write a note's content/title and re-embed in ONE
// transaction (a failed embed rolls back the update, so the stores stay in lockstep). The
// WHERE is scoped to the owner — a noteId for someone else's note simply matches no row and
// returns null (tenancy stays a server-side invariant; the chat tool never trusts a model id).
export async function updateNote({ userId, noteId, content, title }: UpdateNoteInput): Promise<CreatedNote | null> {
  let updated: CreatedNote | null = null;

  await drizzlePg.transaction(async tx => {
    const [note] = await tx
      .update(notesTable)
      .set({ content, title, updated_at: new Date() })
      .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, userId)))
      .returning();
    if (!note) return; // not found / not owned — leave updated = null (don't throw)

    await createAndSaveNoteEmbedding(note);
    updated = { id: note.id, title: note.title, content: note.content, created_at: note.created_at };
  });

  return updated;
}
