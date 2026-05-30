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
import { createNote } from "services/notes-write";
import { chatImageExists } from "services/chat-images";
import { logger } from "utils/logger";

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

// `notes.id` is a Postgres uuid, so querying it with a non-uuid string throws ("invalid
// input syntax for type uuid"). The model is told to take ids from search results, but it
// can still pass a bad one — validate before hitting the DB so a tool call never throws.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface NotesResult {
  count: number;
  notes: NoteHit[];
}

// The read tools must NEVER throw (a thrown execute surfaces a raw tool-error to the model and an
// error card to the user, instead of the intended "no notes" state). Run their body through this so
// a transient embed / Qdrant / Postgres fault degrades to a typed empty result. Written as a thunk
// wrapper (not an execute wrapper) so each tool's input stays typed from its zod schema by the SDK.
// The write tools keep their own try/catch (they return {saved:false}/{found:false}).
function safeNotesQuery(run: () => Promise<NotesResult>): Promise<NotesResult> {
  return run().catch(err => {
    logger.error("Note retrieval tool failed:", err);
    return { count: 0, notes: [] };
  });
}

export function buildNoteTools({ userIds, userId }: { userIds: string[]; userId: string }) {
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
      execute: ({ query, top_k }) =>
        safeNotesQuery(async () => {
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
        }),
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
          .describe(
            "Start of range, inclusive. ISO 8601 in the USER'S LOCAL timezone — use the SAME offset as " +
              "today's date in the system prompt (e.g. 2026-05-01T00:00:00+03:00), so day boundaries match " +
              "the user's local day, not UTC. Omit for no lower bound."
          ),
        to: z
          .string()
          .optional()
          .describe(
            "End of range, inclusive. Same local-offset ISO 8601 as `from` (e.g. 2026-05-31T23:59:59+03:00). " +
              "Omit for no upper bound."
          ),
        limit: z.number().int().min(1).max(50).optional().describe("Max notes (default 20)."),
      }),
      execute: ({ from, to, limit }) =>
        safeNotesQuery(async () => {
          const rows = await notesRepo.byDateRange(userIds, { from, to, limit: limit ?? 20 });
          return { count: rows.length, notes: rows.map(toNoteHit) };
        }),
    }),

    list_recent_notes: tool({
      description:
        "List the user's most recent notes (newest first), without a search query. " +
        "Use for questions like 'what did I write recently' or 'my latest notes'.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(30).optional().describe("How many notes (default 10)."),
      }),
      execute: ({ limit }) =>
        safeNotesQuery(async () => {
          const rows = await notesRepo.recent(userIds, limit ?? 10);
          return { count: rows.length, notes: rows.map(toNoteHit) };
        }),
    }),

    // Re-examine an OLDER attached image. The most-recent image is already inlined for the
    // model; older ones appear as "[εικόνα <id> …]" placeholders. Calling this makes the
    // server re-inject that image as a user message on the next step (images aren't honored
    // on tool-result messages over OpenRouter's OpenAI-compatible transport — see
    // services/ai/agentic-rag.ts), so the tool itself only acknowledges the request.
    view_image: tool({
      description:
        "Δες ξανά μια εικόνα που έστειλε νωρίτερα ο χρήστης. Χρησιμοποίησέ το ΜΟΝΟ για εικόνες που εμφανίζονται " +
        "ως placeholder «[εικόνα <id> …]» στη συνομιλία — η πιο πρόσφατη εικόνα είναι ήδη ορατή. Δώσε το id από το " +
        "placeholder· η εικόνα θα εμφανιστεί ώστε να μπορείς να την περιγράψεις ή να απαντήσεις γι' αυτήν.",
      inputSchema: z.object({
        imageId: z.string().describe("Το id της εικόνας, όπως φαίνεται στο placeholder «[εικόνα <id> …]»."),
      }),
      execute: async ({ imageId }): Promise<{ found: boolean; imageId: string }> => {
        return { found: await chatImageExists(userId, imageId), imageId };
      },
    }),

    // --- Write / action tools ---------------------------------------------------------
    // Unlike the read tools (scoped to `userIds`, which may be a broader read set), writes
    // target the single authoritative logged-in user `userId`. The model never supplies an
    // id — tenancy stays a server-side invariant.

    create_note: tool({
      description:
        "Save a NEW note for the user — it is persisted IMMEDIATELY. Use when the user asks you to " +
        "write/keep/save a note (e.g. 'κράτα σημείωση…', 'save a note about…'). Write a short title and " +
        "the body as Markdown, in the user's language. Do NOT use this to change an existing note " +
        "(use propose_note_edit) or when the user wants to edit it themselves first (use draft_note).",
      inputSchema: z.object({
        title: z.string().describe("A short title in the user's language."),
        content: z.string().describe("The note body as Markdown, in the user's language."),
      }),
      // Never throw: a thrown execute can abort the tool stream and leave the UI card stuck
      // on a spinner. On failure return a typed error result the card can render instead.
      execute: async ({ title, content }) => {
        try {
          const note = await createNote({ userId, title, content });
          return {
            saved: true as const,
            noteId: note.id,
            title: note.title ?? title,
            content: note.content,
            date: isoOrEmpty(note.created_at),
          };
        } catch (err) {
          return { saved: false as const, error: err instanceof Error ? err.message : "Save failed." };
        }
      },
    }),

    propose_note_edit: tool({
      description:
        "Propose an edit to ONE existing note (find it first with search_notes/list_recent_notes). This " +
        "does NOT save — it shows the user a before→after they Apply or discard. Use for requests like " +
        "'διόρθωσε/πρόσθεσε/ενημέρωσε τη σημείωσή μου'. Provide the FULL new content (the entire note after " +
        "your changes), not a diff — for an addition, repeat the existing text plus the new part.",
      inputSchema: z.object({
        noteId: z.string().describe("Id of the note to edit, from a prior search/list result."),
        title: z.string().optional().describe("New title, if it should change. Omit to keep the current title."),
        newContent: z.string().describe("The FULL new note body as Markdown (the complete note after edits)."),
      }),
      // Never throw (a bad/non-uuid noteId would otherwise crash the query and freeze the
      // card on a spinner): validate the id, guard the DB read, and return found:false instead.
      execute: async ({ noteId, title, newContent }) => {
        if (!UUID_RE.test(noteId)) return { found: false as const, noteId };
        try {
          const current = await notesRepo.findForUser(noteId, userId);
          if (!current) return { found: false as const, noteId };
          return {
            found: true as const,
            noteId,
            title: title ?? current.title ?? "",
            before: current.content ?? "",
            after: newContent,
            // Carry the existing reminder so Apply can preserve it (a content-only update that
            // dropped remindAt would wipe the reminder — see apis/notes/update-note).
            remindAt: current.reminder?.remindAt ? new Date(current.reminder.remindAt).toISOString() : "",
          };
        } catch {
          return { found: false as const, noteId };
        }
      },
    }),

    draft_note: tool({
      description:
        "Prepare a DRAFT note and open it in the user's note editor so THEY review/edit and save it " +
        "themselves — you save NOTHING. Use when the user wants to write it themselves, or asks for a " +
        "'προσχέδιο/draft να το πειράξω'. Provide a short title and the body as Markdown, in their language.",
      inputSchema: z.object({
        title: z.string().describe("A short title in the user's language."),
        content: z.string().describe("The draft body as Markdown, in the user's language."),
      }),
      // No persistence — the client opens the editor pre-filled with this draft.
      execute: async ({ title, content }) => ({ openedInEditor: true as const, title, content }),
    }),
  };
}
