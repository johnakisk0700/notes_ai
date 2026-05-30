// Embedding model for note RAG — used by BOTH the write (services/embeddings.ts) and the
// query (services/ai/notes-tools.ts) paths through one shared constant so they can never
// drift (a write/query model mismatch silently destroys retrieval).
//
// Pick: google/gemini-embedding-001 — the best multilingual *retrieval* embedding reachable
// through our existing keys (MTEB-multilingual 68.4 vs OpenAI text-embedding-3-large 59.0),
// which is what matters for the Greek corpus. Served via OpenRouter (OpenAI-compatible), so
// it rides the existing OPENROUTER_API_KEY — no new provider or key. See
// docs/rag-execution-plan.md §3.2 (Qwen3-Embedding scores higher but isn't on OpenRouter).
import OpenAI from "openai";

export const EMBEDDING_MODEL = "google/gemini-embedding-001";
export const EMBEDDING_DIM = 3072;

// gemini-embedding-001 caps input at ~2048 tokens; clip here (the single choke point) so no
// caller can overflow it. The full content is still stored in the payload — only the text we
// embed is clipped. Proper per-note chunking is the planned follow-up (rag-execution-plan §3.4).
const MAX_INPUT_CHARS = 6000;

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  // Bound the call: the SDK default is a 10-MINUTE timeout with 2 retries, so a wedged
  // embedding would hang a note save (inside its transaction) or a search for many minutes —
  // a spinner that never resolves. Fail fast instead; the caller surfaces a failed state.
  timeout: 12_000,
  maxRetries: 1,
});

export async function embedText(text: string): Promise<number[]> {
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text.slice(0, MAX_INPUT_CHARS) });
  return res.data[0].embedding;
}
