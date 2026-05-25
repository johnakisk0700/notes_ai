import { getThread as loadThread } from "services/chat-threads";

// One thread (with its messages) by id, owner-scoped. Used to hydrate the chat
// when opening /thread/:id in the frontend.
export async function getThread(req, res) {
  const { threadId } = req.query;
  if (!threadId) {
    return res.status(400).json({ error: "threadId parameter is required" });
  }

  const thread = await loadThread(String(threadId), req.user.id);
  if (!thread) {
    return res.status(404).json({ error: "Thread not found" });
  }

  res.status(200).json(thread);
}
