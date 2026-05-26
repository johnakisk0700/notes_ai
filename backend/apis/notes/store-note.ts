import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { createAndSaveNoteEmbedding } from "services/embeddings";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { remindersTable } from "@shared/db/schema/reminders";
import { AppError } from "middleware/common/AppError";

// Errors throw and propagate to asyncHandler → errorHandler (the repo's convention).
export async function storeNote(req, res) {
  validateRequestBody(req.body, ["noteText"]);
  const { noteText, title, remindAt } = req.body;

  let noteRecord;
  let reminderRecord: any = null;

  await drizzlePg.transaction(async tx => {
    const [note] = await tx
      .insert(notesTable)
      .values({ content: noteText, title, userId: req.user.id })
      .returning();
    if (!note) throw new Error("Note could not be saved.");
    noteRecord = note;

    if (remindAt) {
      const remindDate = new Date(remindAt);
      if (isNaN(remindDate.getTime())) {
        throw new AppError({ message: "Something went wrong parsing the reminder date." });
      }
      const [reminder] = await tx
        .insert(remindersTable)
        .values({ noteId: note.id, userId: req.user.id, remindAt: remindDate })
        .returning({ id: remindersTable.id, remindAt: remindersTable.remindAt });
      if (!reminder) throw new Error("Reminder could not be saved.");
      reminderRecord = reminder;
    }

    // Embed as part of the save (sync-or-fail): if embedding throws, the whole transaction
    // rolls back — no half-saved note, no duplicate on retry — so Postgres and Qdrant stay
    // in lockstep. The client keeps its localStorage draft, so nothing is lost on failure.
    await createAndSaveNoteEmbedding(note);
  });

  res.status(200).json({
    message: "Note saved successfully.",
    id: noteRecord.id,
    content: noteRecord.content,
    created_at: noteRecord.created_at,
    remind_at: reminderRecord ? reminderRecord.remindAt : "",
  });
}
