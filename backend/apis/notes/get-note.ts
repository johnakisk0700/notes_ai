import { notesTable } from "@shared/db/schema/notes";
import type { FullNote } from "@shared/dto/GetNoteDTO";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq, and } from "drizzle-orm";

export async function getNote(req, res) {
  const { noteId } = req.query;

  if (!noteId) {
    return res.status(400).json({ error: "noteId parameter is required" });
  }

  const noteWithReminder: FullNote | undefined = await drizzlePg.query.notesTable.findFirst({
    where: and(eq(notesTable.id, noteId), eq(notesTable.userId, req.user.id)),
    with: {
      reminder: true, // This includes the related reminder
    },
  });

  if (!noteWithReminder) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.status(200).json(noteWithReminder);
}
