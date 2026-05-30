import type { ThreadToolTransactionStatus } from "@shared";
import { validateRequestBody } from "middleware/common/validation/requiredValidator";
import { updateThreadToolTransaction } from "services/chat-threads";

const VALID_STATUSES = new Set<ThreadToolTransactionStatus>(["applied", "discarded", "retry_saved"]);

function isTransactionStatus(value: unknown): value is ThreadToolTransactionStatus {
  return typeof value === "string" && VALID_STATUSES.has(value as ThreadToolTransactionStatus);
}

// Persist the user's UI decision for a note-action tool card on the owning assistant
// message. Owner-scoped by thread + req.user.id; raw tool parts still render, while
// the model later sees only the deterministic text projection.
export async function updateToolTransaction(req, res) {
  validateRequestBody(req.body, ["threadId", "messageId", "toolCallId", "status"]);
  const { threadId, messageId, toolCallId, status, output } = req.body;

  if (
    typeof threadId !== "string" ||
    typeof messageId !== "string" ||
    typeof toolCallId !== "string" ||
    !isTransactionStatus(status)
  ) {
    return res.status(400).json({ error: "Invalid tool transaction payload." });
  }

  const transaction = { status, updatedAt: new Date().toISOString() };
  const updated = await updateThreadToolTransaction({
    threadId,
    userId: req.user.id,
    assistantMessageId: messageId,
    toolCallId,
    transaction,
    output,
  });

  if (!updated) {
    return res.status(404).json({ error: "Assistant message not found" });
  }

  res.status(200).json({ success: true, transaction });
}
