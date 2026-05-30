// On-disk store for chat image attachments. Bytes live on disk (one file per image,
// keyed by a crypto-random id, under a per-user dir); the chat only ever carries a
// *reference* (`/api/chat-image/<id>`) in the message parts. Used by the upload/serve
// endpoints, the agentic loop (which inlines the bytes for the model — see agentic-rag),
// and thread-delete cleanup.
//
// Security: the id is server-generated and validated on every read; the user dir is
// derived from the authenticated `req.user.id` (never a client value); the media type
// is decided by MAGIC BYTES, not the client-declared type; SVG is rejected (script in
// <img> XSS); size is capped to guard memory/disk against base64 inflation.
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "middleware/common/AppError";

// Images live outside the bundled app dir so they ride the ./data bind mount (mounted to
// /app/data/chat-images in the backend container — see docker-compose.yml). cwd is
// /app/backend in the container and backend/ when run on the host; ".." lands on the
// repo-root data/ dir in both, which .rsyncignore + .gitignore already exclude.
const BASE_DIR = process.env.CHAT_IMAGES_DIR ?? path.resolve(process.cwd(), "../data/chat-images");

// Max decoded image bytes. Mirrors the client-side cap; guards against base64 inflation
// under the 100mb json limit.
const MAX_BYTES = Number(process.env.CHAT_IMAGE_MAX_BYTES) || 8 * 1024 * 1024;

// Max length of the *encoded* base64 string for MAX_BYTES of data. base64 expands N bytes
// to ceil(N/3)*4 chars; the +1024 slack covers padding/whitespace. We reject on this BEFORE
// the Buffer.from decode so an oversized payload can't allocate a ~75MB heap buffer first.
const MAX_BASE64_LEN = Math.ceil(MAX_BYTES / 3) * 4 + 1024;

// An image must be older than this before the orphan sweep may reclaim it — so an image that's
// been uploaded but not yet sent (staged in the composer) is never reaped out from under the user.
export const ORPHAN_IMAGE_MIN_AGE_MS = Number(process.env.CHAT_IMAGE_ORPHAN_MIN_AGE_MS) || 24 * 60 * 60 * 1000;

const ID_RE = /^[a-f0-9]{32}$/;
const SAFE_USER_RE = /^[A-Za-z0-9_-]+$/;

// Raster types only — SVG is intentionally absent (script-in-<img> XSS). Type is decided
// here by magic bytes, never by the client-declared media type.
const MAGIC: Array<{ mediaType: string; test: (b: Buffer) => boolean }> = [
  { mediaType: "image/png", test: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mediaType: "image/jpeg", test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mediaType: "image/gif",
    test: b => b.length > 6 && (b.toString("ascii", 0, 6) === "GIF89a" || b.toString("ascii", 0, 6) === "GIF87a"),
  },
  {
    mediaType: "image/webp",
    test: b => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  },
];

function detectMediaType(buf: Buffer): string | null {
  return MAGIC.find(m => m.test(buf))?.mediaType ?? null;
}

function userDir(userId: string): string {
  if (!SAFE_USER_RE.test(userId)) throw new AppError({ message: "Invalid user", statusCode: 400 });
  return path.join(BASE_DIR, userId);
}

/** The reference the chat carries for a stored image (a file-part url). */
export function chatImageUrl(id: string): string {
  return `/api/chat-image/${id}`;
}

/** Extract a chat-image id from a stored file-part url, or null if it isn't one. */
export function chatImageIdFromUrl(url: string): string | null {
  const m = url.match(/\/api\/chat-image\/([a-f0-9]{32})\b/);
  return m ? m[1] : null;
}

export interface SavedImage {
  id: string;
  mediaType: string;
  url: string;
}

/** Validate + persist an uploaded image; returns its id, detected type, and reference url. */
export async function saveChatImage(userId: string, base64: string): Promise<SavedImage> {
  // Bound the decode-time allocation: reject by encoded string length before Buffer.from
  // turns a ~100MB payload into a ~75MB heap buffer (the post-decode check below stays as
  // defense in depth).
  if ((base64?.length ?? 0) > MAX_BASE64_LEN) throw new AppError({ message: "Image too large", statusCode: 413 });

  const buf = Buffer.from(base64 ?? "", "base64");
  if (buf.length === 0) throw new AppError({ message: "Empty image", statusCode: 400 });
  if (buf.length > MAX_BYTES) throw new AppError({ message: "Image too large", statusCode: 413 });

  const mediaType = detectMediaType(buf);
  if (!mediaType) throw new AppError({ message: "Unsupported image type (PNG/JPEG/WebP/GIF only)", statusCode: 415 });

  const id = randomBytes(16).toString("hex"); // 32 hex chars
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), buf);
  return { id, mediaType, url: chatImageUrl(id) };
}

/** Load an image's raw bytes + type, or null if missing/invalid. Re-detects the type from
 *  magic bytes (no sidecar metadata). Guards the id and asserts path containment. */
export async function loadChatImageBuffer(
  userId: string,
  id: string
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  if (!ID_RE.test(id) || !SAFE_USER_RE.test(userId)) return null;
  const dir = path.resolve(userDir(userId));
  const filePath = path.resolve(dir, id);
  // Defense in depth: the resolved path must stay inside the user's own dir.
  if (filePath !== path.join(dir, id) || !filePath.startsWith(dir + path.sep)) return null;
  try {
    const buffer = await fs.readFile(filePath);
    const mediaType = detectMediaType(buffer);
    return mediaType ? { buffer, mediaType } : null;
  } catch {
    return null;
  }
}

/** Same as loadChatImageBuffer but base64-encoded — for inlining into model messages. */
export async function loadChatImage(userId: string, id: string): Promise<{ base64: string; mediaType: string } | null> {
  const r = await loadChatImageBuffer(userId, id);
  return r ? { base64: r.buffer.toString("base64"), mediaType: r.mediaType } : null;
}

/** Cheap existence check (no read) — used by the view_image tool to validate an id. */
export async function chatImageExists(userId: string, id: string): Promise<boolean> {
  if (!ID_RE.test(id) || !SAFE_USER_RE.test(userId)) return false;
  try {
    await fs.access(path.join(userDir(userId), id));
    return true;
  } catch {
    return false;
  }
}

/** Delete one image file (best-effort; missing files are fine). */
export async function deleteChatImage(userId: string, id: string): Promise<void> {
  if (!ID_RE.test(id) || !SAFE_USER_RE.test(userId)) return;
  try {
    await fs.unlink(path.join(userDir(userId), id));
  } catch {
    /* already gone — best-effort */
  }
}

/** The user-id directories that currently hold chat images (for the orphan sweep). Empty if the
 *  base dir doesn't exist yet. Only well-formed user dirs are returned. */
export async function listImageOwners(): Promise<string[]> {
  try {
    const entries = await fs.readdir(BASE_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory() && SAFE_USER_RE.test(e.name)).map(e => e.name);
  } catch {
    return []; // base dir not created yet — nothing stored
  }
}

/** A user's stored image files with their last-modified time (ms). Used by the orphan sweep to
 *  age files; malformed names and vanished files are skipped. */
export async function listUserImages(userId: string): Promise<Array<{ id: string; mtimeMs: number }>> {
  if (!SAFE_USER_RE.test(userId)) return [];
  let names: string[];
  try {
    names = await fs.readdir(userDir(userId));
  } catch {
    return []; // user dir gone — nothing to do
  }
  const out: Array<{ id: string; mtimeMs: number }> = [];
  for (const name of names) {
    if (!ID_RE.test(name)) continue;
    try {
      const stat = await fs.stat(path.join(userDir(userId), name));
      out.push({ id: name, mtimeMs: stat.mtimeMs });
    } catch {
      /* vanished between readdir and stat — skip */
    }
  }
  return out;
}

/** Collect the chat-image ids referenced by a set of stored messages (their file parts). */
export function imageIdsFromMessages(messages: Array<{ parts?: unknown }>): string[] {
  const ids = new Set<string>();
  for (const m of messages) {
    const parts = Array.isArray(m?.parts) ? (m.parts as Array<{ type?: string; url?: string }>) : [];
    for (const p of parts) {
      if (p?.type === "file" && typeof p.url === "string") {
        const id = chatImageIdFromUrl(p.url);
        if (id) ids.add(id);
      }
    }
  }
  return [...ids];
}
