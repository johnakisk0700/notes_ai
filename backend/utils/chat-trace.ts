// TEMPORARY dev instrument — a structured, append-only JSONL trace of one chat turn, keyed by
// generationId. Purpose: turn the chat flow's "reasoned but unobserved" behaviours (AI SDK event
// ordering, image inlining, the REAL Mongo updateOne return shapes the persistence branches key
// off) into captured evidence we can read back.
//
// Each line is ONE complete JSON object so the clustered workers can interleave writes without
// corrupting each other; lines stay small because image bytes are redacted to a length and any
// oversized string is clipped as a safety net. Written under the bind-mounted backend/ dir
// (container cwd = /app/backend) so it's readable on the host at backend/.chat-trace/.
//
// Fire-and-forget and never throws — tracing must not affect a turn. REMOVE this file and its
// call sites once the chat flow is validated.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import cluster from "node:cluster";

const TRACE_DIR = path.join(process.cwd(), ".chat-trace");
export const CHAT_TRACE_FILE = path.join(TRACE_DIR, "chat-trace.jsonl");

// Clip any string longer than this (base64 image bytes, runaway content) so a line stays small
// enough to append atomically across workers and stays readable.
const MAX_STR = 1500;

let dirReady: Promise<unknown> | null = null;
function ensureDir(): Promise<unknown> {
  return (dirReady ??= mkdir(TRACE_DIR, { recursive: true }).catch(() => {}));
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === "string" && v.length > MAX_STR) return `«str len=${v.length}»`;
      if (v && typeof v === "object") {
        if (seen.has(v as object)) return "«circular»";
        seen.add(v as object);
      }
      return v;
    });
  } catch {
    return JSON.stringify({ traceError: "stringify failed" });
  }
}

export function chatTrace(generationId: string, event: string, data?: unknown): void {
  const line =
    safeStringify({ t: Date.now(), w: cluster.worker?.id ?? "primary", gen: generationId, event, data }) + "\n";
  ensureDir()
    .then(() => appendFile(CHAT_TRACE_FILE, line))
    .catch(() => {});
}
