// GET /api/chat-image/:id — stream a stored image back to its owner. The user dir is
// derived from req.user.id (verifyJWT), so a user can only ever read their own images;
// an unknown or non-owned id is an ordinary 404 (the file simply isn't in their dir).
// Served inline + nosniff as defense for the <img> tag that renders it.
import type { Request, Response } from "express";
import { loadChatImageBuffer } from "services/chat-images";

async function getChatImage(req: Request, res: Response) {
  const image = await loadChatImageBuffer(req.user.id, String(req.params.id ?? ""));
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.setHeader("Content-Type", image.mediaType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.status(200).send(image.buffer);
}

export default getChatImage;
