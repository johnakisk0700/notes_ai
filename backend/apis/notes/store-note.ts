import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { createAndSaveNoteEmbedding } from "service/embeddings";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { Reminder, remindersTable } from "@shared/db/schema/reminders";
import { AppError } from "middleware/common/AppError";

export async function storeNote(req, res, next) {
  validateRequestBody(req.body, ["noteText"]);
  const { noteText, title, remindAt } = req.body;

  try {
    let noteRecord;
    let reminderRecord: any = null;

    await drizzlePg.transaction(async (tx) => {
      // Save the note
      const noteResult = await tx
        .insert(notesTable)
        .values({
          content: noteText,
          title: title,
          userId: req.user.id,
        })
        .returning({
          id: notesTable.id,
          content: notesTable.content,
          userId: notesTable.userId,
          title: notesTable.title,
          createdAt: notesTable.created_at,
        });

      if (!noteResult || noteResult.length === 0) {
        throw new Error("Note could not be saved.");
      }
      noteRecord = noteResult[0];

      if (remindAt) {
        const remindDate = new Date(remindAt);
        if (!remindDate)
          throw new AppError({
            message: "Something went wrong parsing the reminder date.",
          });
        const reminderResult = await tx
          .insert(remindersTable)
          .values({
            noteId: noteRecord.id,
            userId: req.user.id,
            remindAt: remindDate,
          })
          .returning({
            id: remindersTable.id,
            remindAt: remindersTable.remindAt,
          });

        if (!reminderResult || reminderResult.length === 0) {
          throw new Error("Reminder could not be saved.");
        }
        reminderRecord = reminderResult[0];
      }

      await createAndSaveNoteEmbedding(req.user.id, reminderRecord, noteRecord);
    });

    res.status(200).json({
      message: "Note saved successfully.",
      id: noteRecord.id,
      content: noteRecord.content,
      created_at: noteRecord.createdAt,
      remind_at: reminderRecord ? reminderRecord.remindAt : "",
    });
  } catch (error) {
    next(error);
  }
}
