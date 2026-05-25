import { deleteThread as removeThread } from "services/chat-threads";

// Delete one of the current user's threads. Owner-scoped: a non-owner (or an
// unknown id) gets 404 rather than deleting anything.
export async function deleteThread(req, res) {
  const { threadId } = req.body;
  if (!threadId) {
    return res.status(400).json({ error: "threadId is required" });
  }

  const deleted = await removeThread(String(threadId), req.user.id);
  if (!deleted) {
    return res.status(404).json({ error: "Thread not found" });
  }

  res.status(200).json({ success: true });
}
