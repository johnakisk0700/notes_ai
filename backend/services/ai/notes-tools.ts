// Retrieval tools the chat model calls during the agentic loop. Each tool is built
// per-request and hard-scoped to the caller's user id(s) — the model never supplies a
// user id, preserving tenancy.
//
// Postgres is the source of truth: every tool returns note title/content straight from PG
// (via notesRepo). search_notes uses Qdrant ONLY to rank candidate ids by meaning, then
// reads the live rows from PG (dropping ids that no longer exist there) — so a Qdrant/PG
// desync can never surface a deleted note or stale text. It then reranks and returns the
// relevance-gated few.
import { tool } from "ai";
import { z } from "zod";
import { embedText } from "clients/embedding_client";
import { qdrantClient } from "clients/qdrant_client";
import { notesRepo, type NoteRow } from "repositories/notes";
import { cleanNoteText } from "utils/noteText";
import { rerank } from "./rerank.js";

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

function isoOrEmpty(date: Date | string | null): string {
  return date ? new Date(date as unknown as string).toISOString() : "";
}

// A PG row → the hit handed back to the model: mention markup stripped, snippet clipped.
function toNoteHit(row: NoteRow): NoteHit {
  return {
    noteId: String(row.id),
    title: row.title ?? "",
    date: isoOrEmpty(row.created_at),
    snippet: clip(cleanNoteText(row.content ?? ""), SNIPPET_CHARS),
  };
}

// The longer text the reranker scores against: title + content, mentions stripped.
function rerankText(row: NoteRow): string {
  return clip(cleanNoteText([row.title, row.content].filter(Boolean).join("\n")), RERANK_CHARS);
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
        const vector = await embedText(query);

        // 1) Rank a bounded candidate pool by vector similarity — Qdrant just gives ordered ids.
        const result = await qdrantClient.query("notes", {
          query: vector,
          with_payload: false,
          with_vector: false,
          limit: CANDIDATE_K,
          filter: { must: [{ key: "user_id", match: { any: userIds } }] },
          ...(MIN_COSINE != null ? { score_threshold: MIN_COSINE } : {}),
        });
        const ids = result.points.map(p => String(p.id));
        if (ids.length === 0) return { count: 0, notes: [] };

        // 2) Postgres is the source of truth: pull live rows for those ids (scoped to the
        //    user), dropping any id missing from PG. A deleted note whose vector lingers is
        //    silently filtered out, and the text we rerank/show is always current.
        const rows = await notesRepo.candidatesByIds(userIds, ids);
        const byId = new Map(rows.map(r => [String(r.id), r]));
        const candidates = ids
          .map(id => byId.get(id))
          .filter((r): r is NoteRow => r != null)
          .map(row => ({ ...toNoteHit(row), text: rerankText(row) }));

        // 3) Rerank → keep only the relevance-gated top few (the strict step). The ranked
        //    items are candidates (a NoteHit plus the reranker-only `text`); drop `text`.
        const ranked = await rerank(query, candidates, { topN: top_k ?? FINAL_K, minScore: RERANK_MIN_SCORE });
        return {
          count: ranked.length,
          notes: ranked.map(({ noteId, title, date, snippet }) => ({ noteId, title, date, snippet })),
        };
      },
    }),

    filter_by_date: tool({
      description:
        "List the user's notes created within a date range (newest first), BY CREATION DATE — " +
        "not by meaning. Use for time-scoped questions like 'what did I write last week / in May / " +
        "between two dates'. For a topic within a period, also call search_notes.",
      inputSchema: z.object({
        from: z
          .string()
          .optional()
          .describe("Start of range, ISO 8601 (e.g. 2026-05-01 or 2026-05-01T00:00:00Z), inclusive. Omit for no lower bound."),
        to: z.string().optional().describe("End of range, ISO 8601, inclusive. Omit for no upper bound."),
        limit: z.number().int().min(1).max(50).optional().describe("Max notes (default 20)."),
      }),
      execute: async ({ from, to, limit }): Promise<{ count: number; notes: NoteHit[] }> => {
        const rows = await notesRepo.byDateRange(userIds, { from, to, limit: limit ?? 20 });
        return { count: rows.length, notes: rows.map(toNoteHit) };
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
        const rows = await notesRepo.recent(userIds, limit ?? 10);
        return { count: rows.length, notes: rows.map(toNoteHit) };
      },
    }),
  };
}
