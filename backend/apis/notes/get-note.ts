import { notesRepo } from "repositories/notes";

export async function getNote(req, res) {
  const { noteId } = req.query;

  if (!noteId) {
    return res.status(400).json({ error: "noteId parameter is required" });
  }

  const note = await notesRepo.findForUser(noteId, req.user.id);

  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.status(200).json(note);
}
