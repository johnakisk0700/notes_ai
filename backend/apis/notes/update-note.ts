import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { remindersTable } from "@shared/db/schema/reminders";
import { createAndSaveNoteEmbedding } from "services/embeddings";
import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { eq } from "drizzle-orm";
import { AppError } from "middleware/common/AppError";

// Errors throw and propagate to asyncHandler → errorHandler (the repo's convention).
export const updateNote = async (req, res) => {
  validateRequestBody(req.body, ["noteId", "content"]);
  const { content, noteId, remindAt, title } = req.body;

  let noteRecord;
  let reminderRecord: any = null;

  await drizzlePg.transaction(async tx => {
    const [note] = await tx
      .update(notesTable)
      .set({ content, title, updated_at: new Date() })
      .where(eq(notesTable.id, noteId))
      .returning();
    if (!note) throw new Error("Note update failed or note not found.");
    noteRecord = note;

    if (remindAt) {
      const remindDate = new Date(remindAt);
      if (isNaN(remindDate.getTime())) {
        throw new AppError({ message: "Something went wrong parsing the reminder date." });
      }
      const [reminder] = await tx
        .insert(remindersTable)
        .values({ noteId, userId: req.user.id, remindAt: remindDate })
        .onConflictDoUpdate({
          target: remindersTable.noteId,
          set: { remindAt: remindDate, updated_at: new Date() },
        })
        .returning({
          id: remindersTable.id,
          noteId: remindersTable.noteId,
          userId: remindersTable.userId,
          remindAt: remindersTable.remindAt,
        });
      if (!reminder) throw new Error("Reminder upsert failed.");
      reminderRecord = reminder;
    } else {
      await tx.delete(remindersTable).where(eq(remindersTable.noteId, noteId));
    }

    // Re-embed as part of the update (sync-or-fail): a failed embed rolls back the whole
    // update, so Postgres and Qdrant never drift apart. The client keeps its draft.
    await createAndSaveNoteEmbedding(note);
  });

  res.status(200).json({
    message: "Note successfully updated.",
    data: { note: noteRecord, reminder: reminderRecord },
  });
};
