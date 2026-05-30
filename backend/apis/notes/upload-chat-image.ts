// POST /api/chat-image — accepts a base64 image (mirroring /get-transcription's
// base64-in-JSON convention) and stores it on disk under the caller's dir, returning a
// reference `{ id, mediaType, url }` the chat carries in its message parts. The bytes are
// never sent to the model from here; the agentic loop inlines them at request time
// (services/ai/agentic-rag.ts).
import type { Request, Response } from "express";
import { AppError } from "middleware/common/AppError";
import { saveChatImage } from "services/chat-images";

async function uploadChatImage(req: Request, res: Response) {
  const base64 = req.body?.image?.content;
  if (typeof base64 !== "string" || !base64) {
    throw new AppError({ message: "No image data provided", statusCode: 400 });
  }
  const saved = await saveChatImage(req.user.id, base64);
  res.status(201).json(saved);
}

export default uploadChatImage;
