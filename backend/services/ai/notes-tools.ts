// Retrieval tools the chat model calls during the agentic loop. Each tool is built
// per-request and hard-scoped to the caller's user id(s) — the model never supplies a
// user id, preserving tenancy.
//
// search_notes retrieves a candidate pool by dense embedding, then RERANKS it and returns
// only the relevance-gated top few, so the model isn't handed loosely-related notes.
// (Embedding/hybrid upgrades remain tracked in docs/rag-execution-plan.md.)
import { tool } from "ai";
import { z } from "zod";
import { openai } from "clients/openai_client";
import { qdrantClient } from "clients/qdrant_client";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import { desc, inArray } from "drizzle-orm";
import { rerank } from "./rerank.js";

// Keep write (embeddings.ts) and query embedding models identical — one constant.
const EMBEDDING_MODEL = "text-embedding-ada-002";

// Retrieval tuning (env-overridable). CANDIDATE_K is the pool fed to the reranker;
// FINAL_K is how many survive to the model; RERANK_MIN_SCORE drops weak matches.
const CANDIDATE_K = Number(process.env.NOTES_CANDIDATE_K) || 30;
const FINAL_K = Number(process.env.NOTES_FINAL_K) || 6;
const RERANK_MIN_SCORE = Number(process.env.NOTES_RERANK_MIN_SCORE ?? 0.2);
// Optional coarse cosine cut on the Qdrant pass (off unless set) — a no-reranker
// strictness lever. Tune per corpus; leave unset to let the reranker do the gating.
const MIN_COSINE = process.env.NOTES_MIN_COSINE ? Number(process.env.NOTES_MIN_COSINE) : undefined;

const SNIPPET_CHARS = 800; // shown to the model
const RERANK_CHARS = 2000; // sent to the reranker (more signal)

interface NoteHit {
  noteId: string;
  title: string;
  date: string;
  snippet: string;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function payloadText(payload: Record<string, unknown> | null | undefined): string {
  return (((payload?.concatenated as string) ?? (payload?.content as string)) ?? "").trim();
}

export function buildNoteTools({ userIds }: { userIds: string[] }) {
  return {
    search_notes: tool({
      description:
        "Search the user's notes by meaning. Use this for ANY question about note content. " +
        "Results are reranked by relevance, so only the most relevant notes are returned. " +
        "Call it again with a different phrasing to refine or to compare topics.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "A focused search query in the user's language (Greek/English). Rephrase the question into a clean query; don't paste it verbatim."
          ),
        top_k: z.number().int().min(1).max(20).optional().describe("Max notes to return (default 6)."),
      }),
      execute: async ({ query, top_k }): Promise<{ count: number; notes: NoteHit[] }> => {
        const embedding = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: query });

        // 1) Retrieve a bounded candidate pool by vector similarity.
        const result = await qdrantClient.query("notes", {
          query: embedding.data[0].embedding,
          with_payload: true,
          with_vector: false,
          limit: CANDIDATE_K,
          filter: { must: [{ key: "user_id", match: { any: userIds } }] },
          ...(MIN_COSINE != null ? { score_threshold: MIN_COSINE } : {}),
        });

        const candidates = result.points.map(p => {
          const full = payloadText(p.payload as Record<string, unknown>);
          return {
            noteId: String(p.id),
            title: (p.payload?.title as string) ?? "",
            date: p.payload?.created_at ? new Date(p.payload.created_at as string).toISOString() : "",
            snippet: clip(full, SNIPPET_CHARS),
            text: clip(full, RERANK_CHARS), // Rerankable.text
          };
        });

        // 2) Rerank → keep only the relevance-gated top few (the strict step).
        const ranked = await rerank(query, candidates, { topN: top_k ?? FINAL_K, minScore: RERANK_MIN_SCORE });

        const notes: NoteHit[] = ranked.map(({ noteId, title, date, snippet }) => ({ noteId, title, date, snippet }));
        return { count: notes.length, notes };
      },
    }),

    list_recent_notes: tool({
      description:
        "List the user's most recent notes (newest first), without a search query. " +
        "Use for questions like 'what did I write recently' or 'my latest notes'.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(30).optional().describe("How many notes (default 10)."),
      }),
      execute: async ({ limit }): Promise<{ count: number; notes: NoteHit[] }> => {
        const rows = await drizzlePg
          .select({
            id: notesTable.id,
            title: notesTable.title,
            content: notesTable.content,
            created_at: notesTable.created_at,
          })
          .from(notesTable)
          .where(inArray(notesTable.userId, userIds))
          .orderBy(desc(notesTable.created_at))
          .limit(limit ?? 10);
        const notes: NoteHit[] = rows.map(r => ({
          noteId: String(r.id),
          title: r.title ?? "",
          date: r.created_at ? new Date(r.created_at as unknown as string).toISOString() : "",
          snippet: clip((r.content ?? "").trim(), SNIPPET_CHARS),
        }));
        return { count: notes.length, notes };
      },
    }),
  };
}
