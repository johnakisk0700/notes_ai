import getSupabaseForUser from "clients/supabase_client";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { remindersTable } from "@shared/db/schema/reminders";
import { createAndSaveNoteEmbedding } from "service/embeddings";
import { eq } from "drizzle-orm";
import { AppError } from "middleware/common/AppError";

export const updateNote = async (req, res) => {
  const { content, noteId, remindAt, title } = req.body;

  try {
    let noteRecord;
    let reminderRecord: any = null;

    await drizzlePg.transaction(async (tx) => {
      // 1. Update the note
      const noteResult = await tx
        .update(notesTable)
        .set({
          content: content,
          title: title,
          updated_at: new Date(),
        })
        .where(eq(notesTable.id, noteId))
        .returning({
          id: notesTable.id,
          content: notesTable.content,
          userId: notesTable.userId,
          title: notesTable.title,
          createdAt: notesTable.created_at,
          updatedAt: notesTable.updated_at,
        });

      if (!noteResult || noteResult.length === 0) {
        throw new Error("Note update failed or note not found.");
      }
      noteRecord = noteResult[0];

      if (remindAt) {
        const remindDate = new Date(remindAt);
        if (!remindDate)
          throw new AppError({
            message: "Something went wrong parsing the reminder date.",
          });
        // 2a. Upsert reminder
        const reminderResult = await tx
          .insert(remindersTable)
          .values({
            noteId: noteId,
            userId: req.user.id,
            remindAt: remindDate,
          })
          .onConflictDoUpdate({
            target: remindersTable.noteId,
            set: {
              remindAt: remindDate,
              updated_at: new Date(),
            },
          })
          .returning({
            id: remindersTable.id,
            noteId: remindersTable.noteId,
            userId: remindersTable.userId,
            remindAt: remindersTable.remindAt,
          });

        if (!reminderResult || reminderResult.length === 0) {
          throw new Error("Reminder upsert failed.");
        }
        reminderRecord = reminderResult[0];
      } else {
        // 2b. Delete reminder if it exists
        await tx
          .delete(remindersTable)
          .where(eq(remindersTable.noteId, noteId));
        // reminderRecord remains null
      }

      // 3. Call createAndSaveNoteEmbedding
      const supabase = getSupabaseForUser(req.token);
      await createAndSaveNoteEmbedding(req.user.id, reminderRecord, noteRecord);
    });

    res.status(200).json({
      message: "Note successfully updated.",
      data: { note: noteRecord, reminder: reminderRecord },
    });
  } catch (error) {
    throw error;
  }
};
