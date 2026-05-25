import { drizzlePg } from "clients/drizzle_postgres_client";
import { qdrantClient } from "clients/qdrant_client";
import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { notesTable } from "@shared/db/schema/notes";
import { remindersTable } from "@shared/db/schema/reminders";
import { eq, and } from "drizzle-orm";

export async function deleteNote(req, res) {
  validateRequestBody(req.body, ["noteId"]);
  const { noteId } = req.body;
  const userId = req.user.id;
  const isAdmin = req.user.isAdmin;

  try {
    let deletedNoteId;

    await drizzlePg.transaction(async tx => {
      // Owners can delete their own notes; admins can delete any note.
      const whereClause = isAdmin
        ? eq(notesTable.id, noteId)
        : and(eq(notesTable.id, noteId), eq(notesTable.userId, userId));

      // Delete the note from the database and retrieve its ID
      const noteDeleteResult = await tx.delete(notesTable).where(whereClause).returning({
        id: notesTable.id,
      });

      // Check if the note was actually found and deleted
      if (!noteDeleteResult || noteDeleteResult.length === 0) {
        throw new Error("Note not found or access denied.");
      }

      deletedNoteId = noteDeleteResult[0].id;

      // Delete associated reminders
      // This will attempt to delete reminders and will not error if no reminders exist for the note.
      await tx.delete(remindersTable).where(eq(remindersTable.noteId, deletedNoteId));
    });

    // Delete the note from Qdrant (outside transaction since it's external service)
    await qdrantClient.delete("notes", { points: [noteId] });

    console.log(`Note successfully deleted! (message id: [${deletedNoteId}] user id: [${userId}])`);
    res.send("Success.");
  } catch (error) {
    throw error;
  }
}
