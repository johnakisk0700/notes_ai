import { drizzlePg } from "clients/drizzle_postgres_client";
import { qdrantClient } from "clients/qdrant_client";
import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { notesTable } from "@shared/db/schema/notes";
import { remindersTable } from "@shared/db/schema/reminders";
import { eq, and } from "drizzle-orm";
import { logger } from "utils/logger";

export async function deleteNote(req, res) {
  validateRequestBody(req.body, ["noteId"]);
  const { noteId } = req.body;
  const userId = req.user.id;
  const isAdmin = req.user.isAdmin;

  // Owners can delete their own notes; admins can delete any note.
  const whereClause = isAdmin
    ? eq(notesTable.id, noteId)
    : and(eq(notesTable.id, noteId), eq(notesTable.userId, userId));

  await drizzlePg.transaction(async tx => {
    const [deleted] = await tx.delete(notesTable).where(whereClause).returning({ id: notesTable.id });
    if (!deleted) throw new Error("Note not found or access denied.");
    // Remove the note's reminder too (the note FK also cascades, but be explicit).
    await tx.delete(remindersTable).where(eq(remindersTable.noteId, deleted.id));
  });

  // Qdrant cleanup runs after the PG commit and is best-effort: a Qdrant hiccup must not
  // 500 an already-successful delete. An orphaned vector is harmless — search_notes
  // validates every hit against Postgres, and reembed-notes prunes orphans on reindex.
  try {
    await qdrantClient.delete("notes", { points: [noteId] });
  } catch (err) {
    logger.error(`Qdrant delete failed for note ${noteId} (removed from Postgres; vector orphaned until reindex):`, err);
  }

  logger.info(`Note deleted (id: ${noteId}, user: ${userId})`);
  res.send("Success.");
}
