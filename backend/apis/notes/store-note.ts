import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { createNote } from "services/notes-write";

// Errors throw and propagate to asyncHandler → errorHandler (the repo's convention).
// The save itself (insert + embed, in one transaction) lives in services/notes-write
// so this endpoint and the chat's create_note tool share a single save path.
export async function storeNote(req, res) {
  validateRequestBody(req.body, ["noteText"]);
  const { noteText, title } = req.body;

  const note = await createNote({ userId: req.user.id, content: noteText, title });

  res.status(200).json({
    message: "Note saved successfully.",
    id: note.id,
    content: note.content,
    created_at: note.created_at,
  });
}
