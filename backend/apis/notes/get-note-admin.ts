import { notesRepo } from "repositories/notes";

// Admin read: fetch any note by id, with no owner scoping (use notesRepo.findForUser
// for the owner-scoped read).
export async function getNoteAdmin(req, res) {
  const { noteId } = req.query;

  if (!noteId) {
    return res.status(400).json({ error: "noteId parameter is required" });
  }

  const noteWithReminder = await notesRepo.findAny(noteId);

  if (!noteWithReminder) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.status(200).json(noteWithReminder);
}
