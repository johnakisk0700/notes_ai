// Creating a note is a two-store write — a Postgres row plus its Qdrant embedding —
// wrapped in ONE transaction: if the embed throws, the whole save rolls back, so the
// stores never drift apart. This lives here (not inline in the HTTP handler) so the
// /store-note endpoint and the chat's create_note tool share a single save path instead
// of keeping two copies of the sync-or-fail invariant.
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { remindersTable } from "@shared/db/schema/reminders";
import { createAndSaveNoteEmbedding } from "services/embeddings";
import { AppError } from "middleware/common/AppError";

export interface CreateNoteInput {
  userId: string;
  content: string;
  title?: string | null;
  remindAt?: string | null;
}

export interface CreatedNote {
  id: string;
  title: string | null;
  content: string;
  created_at: Date | string;
  remindAt: Date | null;
}

export async function createNote({ userId, content, title, remindAt }: CreateNoteInput): Promise<CreatedNote> {
  let created: CreatedNote | null = null;

  await drizzlePg.transaction(async tx => {
    const [note] = await tx.insert(notesTable).values({ content, title, userId }).returning();
    if (!note) throw new Error("Note could not be saved.");

    let reminderAt: Date | null = null;
    if (remindAt) {
      const remindDate = new Date(remindAt);
      if (isNaN(remindDate.getTime())) {
        throw new AppError({ message: "Something went wrong parsing the reminder date." });
      }
      const [reminder] = await tx
        .insert(remindersTable)
        .values({ noteId: note.id, userId, remindAt: remindDate })
        .returning({ remindAt: remindersTable.remindAt });
      if (!reminder) throw new Error("Reminder could not be saved.");
      reminderAt = reminder.remindAt;
    }

    // Embed inside the save (sync-or-fail): a failed embed rolls back the row above, so
    // Postgres and Qdrant stay in lockstep. See services/embeddings.
    await createAndSaveNoteEmbedding(note);

    created = { id: note.id, title: note.title, content: note.content, created_at: note.created_at, remindAt: reminderAt };
  });

  if (!created) throw new Error("Note could not be saved.");
  return created;
}
