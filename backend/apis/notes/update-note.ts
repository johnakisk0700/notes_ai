import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { updateNote as updateNoteWrite } from "services/notes-write";

// Errors throw and propagate to asyncHandler → errorHandler (the repo's convention). The
// update itself (re-write + re-embed, in one transaction, scoped to the owner) lives in
// services/notes-write so this endpoint and the chat's edit_note tool share one save path.
export const updateNote = async (req, res) => {
  validateRequestBody(req.body, ["noteId", "content"]);
  const { content, noteId, title } = req.body;

  const note = await updateNoteWrite({ userId: req.user.id, noteId, content, title });
  if (!note) throw new Error("Note update failed or note not found.");

  res.status(200).json({
    message: "Note successfully updated.",
    data: { note },
  });
};
