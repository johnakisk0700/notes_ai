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
import { lookupsRepo } from "repositories/lookups";
import { cleanNoteText } from "utils/noteText";
import { rerank } from "./rerank.js";
import { createNote, updateNote } from "services/notes-write";
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

// Char budgets for the note text handed to the model. search_notes returns the FULL note for its
// small reranked set (the relevant few), so the model isn't answering off a half-note; the list/date
// tools return a short preview because they can return many rows (keeps tokens bounded). Either way,
// a clipped note carries `truncated:true` and the model can call read_note for the rest.
// FULL_NOTE_CHARS is a high safety cap, not an expected clip — it only bites a pathologically huge note.
const PREVIEW_CHARS = 600; // list_recent_notes / filter_by_date (possibly many rows)
const FULL_NOTE_CHARS = 8000; // search_notes' final few + read_note — effectively the whole note
const RERANK_CHARS = 2000; // sent to the reranker (more signal)

// `notes.id` is a Postgres uuid, so querying it with a non-uuid string throws ("invalid
// input syntax for type uuid"). The model is told to take ids from search results, but it
// can still pass a bad one — validate before hitting the DB so a tool call never throws.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NoteHit {
  noteId: string;
  title: string;
  date: string;
  content: string;
  // True when `content` was clipped to the budget — tells the model the note has more text it can
  // pull with read_note, so it never silently answers off a half-note.
  truncated: boolean;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function isoOrEmpty(date: Date | string | null): string {
  return date ? new Date(date as unknown as string).toISOString() : "";
}

// A PG row → the hit handed back to the model: mention markup stripped, content clipped to `maxChars`
// (with the truncation flagged so the model can read_note for the full text).
function toNoteHit(row: NoteRow, maxChars: number): NoteHit {
  const full = cleanNoteText(row.content ?? "");
  return {
    noteId: String(row.id),
    title: row.title ?? "",
    date: isoOrEmpty(row.created_at),
    content: full.length > maxChars ? full.slice(0, maxChars) + "…" : full,
    truncated: full.length > maxChars,
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
  // One edit action per note per turn. The agentic loop can't pause for the user mid-turn, so a
  // model that calls BOTH propose_edit and save_edit for the same note (it does) would show a review
  // card AND write immediately — the "saved despite Discard" surprise. The FIRST edit tool to touch a
  // note this turn wins; a later propose/save for the SAME note returns {skipped:true} (no write, no
  // second card). Per-turn because buildNoteTools is constructed once per turn.
  const editedNotesThisTurn = new Set<string>();
  return {
    search_notes: tool({
      description:
        "Search the user's notes by meaning. Use this for ANY question about note content. " +
        "Results are reranked by relevance, so only the most relevant notes are returned, each with " +
        "its full content. (If a result is ever marked `truncated`, call read_note with its id for " +
        "the complete text.) Call it again with a different phrasing to refine or to compare topics.",
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
            .map(row => ({ ...toNoteHit(row, FULL_NOTE_CHARS), text: rerankText(row) }));

          // 3) Rerank → keep only the relevance-gated top few (the strict step). The ranked
          //    items are candidates (a NoteHit plus the reranker-only `text`); drop `text`.
          const ranked = await rerank(query, candidates, { topN: top_k ?? FINAL_K, minScore: RERANK_MIN_SCORE });
          return {
            count: ranked.length,
            notes: ranked.map(({ noteId, title, date, content, truncated }) => ({ noteId, title, date, content, truncated })),
          };
        }),
    }),

    filter_by_date: tool({
      description:
        "List the user's notes created within a date range (newest first), BY CREATION DATE — " +
        "not by meaning. Use for time-scoped questions like 'what did I write last week / in May / " +
        "between two dates'. For a topic within a period, also call search_notes. Notes come back as a " +
        "short preview; if one is `truncated` and you need its full text, call read_note with its id.",
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
          return { count: rows.length, notes: rows.map(r => toNoteHit(r, PREVIEW_CHARS)) };
        }),
    }),

    list_recent_notes: tool({
      description:
        "List the user's most recent notes (newest first), without a search query. " +
        "Use for questions like 'what did I write recently' or 'my latest notes'. Notes come back as " +
        "a short preview; if one is `truncated` and you need its full text, call read_note with its id.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(30).optional().describe("How many notes (default 10)."),
      }),
      execute: ({ limit }) =>
        safeNotesQuery(async () => {
          const rows = await notesRepo.recent(userIds, limit ?? 10);
          return { count: rows.length, notes: rows.map(r => toNoteHit(r, PREVIEW_CHARS)) };
        }),
    }),

    // The "read the rest" companion to the list/search tools: those return a clipped preview (or a
    // note flagged `truncated`); this returns ONE note's full content by id, so the model can ground
    // an answer on the complete text instead of half of it. Scoped to `userIds` like the other reads.
    read_note: tool({
      description:
        "Read the FULL text of ONE note by id. Use when a note from search_notes/filter_by_date/" +
        "list_recent_notes came back with `truncated: true` (its content was cut off) and you need the " +
        "whole note to answer accurately. Pass the note's id from that earlier result.",
      inputSchema: z.object({
        noteId: z.string().describe("Id of the note to read in full, from a prior search/list result."),
      }),
      // Never throw: a bad/non-uuid id or a transient DB fault degrades to found:false, not a tool error.
      execute: async ({ noteId }) => {
        if (!UUID_RE.test(noteId)) return { found: false as const, noteId };
        try {
          const [row] = await notesRepo.candidatesByIds(userIds, [noteId]);
          if (!row) return { found: false as const, noteId };
          return { found: true as const, ...toNoteHit(row, FULL_NOTE_CHARS) };
        } catch (err) {
          logger.error("read_note failed:", err);
          return { found: false as const, noteId };
        }
      },
    }),

    lookup_names: tool({
      description:
        "Look up KNOWN names the app already has on file — wine names, customer names, or user names " +
        "(the same lists used for the editor's @-mentions). These are app-wide lists, NOT 'names the user " +
        "wrote about'. Give a `query` to fuzzy-match a name (tolerant of typos and missing accents, Greek " +
        "or English) and resolve it to its canonical spelling before calling search_notes; omit `query` to " +
        "list what's on file. Returns the closest names, best match first.",
      inputSchema: z.object({
        kind: z.enum(["wines", "customers", "users"]).describe("Which list to look in."),
        query: z
          .string()
          .optional()
          .describe("A name (or partial/misspelled name) to fuzzy-match. Omit to just list the names."),
        limit: z.number().int().min(1).max(50).optional().describe("Max names to return (default 20)."),
      }),
      // Never throw: degrade to an empty list so a transient DB fault can't error the turn.
      execute: async ({ kind, query, limit }) => {
        try {
          const names = await lookupsRepo.searchNames(kind, query, limit ?? 20);
          return { kind, count: names.length, names };
        } catch (err) {
          logger.error("lookup_names failed:", err);
          return { kind, count: 0, names: [] as string[] };
        }
      },
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
        "Create a NEW note for the user. `mode` decides what happens with it: \"save\" persists it " +
        "IMMEDIATELY (use when the user asks you to keep/save a note — 'κράτα σημείωση…', 'save a note about…'); " +
        "\"draft\" persists NOTHING and instead opens it pre-filled in the user's note editor so THEY finish and " +
        "save it (use when the user wants to write/edit it themselves — 'φτιάξε ένα προσχέδιο να το πειράξω'). " +
        "Write a short title and the body as Markdown, in the user's language. To change an EXISTING note, use propose_edit (or save_edit to commit immediately).",
      inputSchema: z.object({
        title: z.string().describe("A short title in the user's language."),
        content: z.string().describe("The note body as Markdown, in the user's language."),
        mode: z
          .enum(["save", "draft"])
          .optional()
          .describe('"save" = persist it now (default). "draft" = open it in the editor for the user to finish; saves nothing.'),
      }),
      // Never throw: a thrown execute can abort the tool stream and leave the UI card stuck
      // on a spinner. On failure return a typed error result the card can render instead.
      execute: async ({ title, content, mode }) => {
        if (mode === "draft") return { mode: "draft" as const, openedInEditor: true as const, title, content };
        try {
          const note = await createNote({ userId, title, content });
          return {
            mode: "save" as const,
            saved: true as const,
            noteId: note.id,
            title: note.title ?? title,
            content: note.content,
            date: isoOrEmpty(note.created_at),
          };
        } catch (err) {
          return { mode: "save" as const, saved: false as const, error: err instanceof Error ? err.message : "Save failed." };
        }
      },
    }),

    // Propose a change to ONE existing note: returns a before→after card the user Applies/discards.
    // Writes NOTHING — the user's Apply commits it (client-side /update-note). The DEFAULT edit path.
    propose_edit: tool({
      description:
        "Propose a change to ONE existing note (find it first with search_notes/list_recent_notes/read_note). " +
        "Shows the user a before→after card they Apply or discard — writes NOTHING; the user's Apply commits it. " +
        "This is the DEFAULT for edits. After calling it you are DONE — do NOT also call save_edit for the same " +
        "note; the user decides via the card. Give the FULL new content (the entire note after your change), not a " +
        "diff — for an addition, repeat the existing text plus the new part.",
      inputSchema: z.object({
        noteId: z.string().describe("Id of the note to edit, from a prior search/list result."),
        title: z.string().optional().describe("New title, if it should change. Omit to keep the current title."),
        newContent: z.string().describe("The FULL new note body as Markdown (the complete note after edits)."),
      }),
      // Never throw: a bad/non-uuid id or DB fault degrades to found:false, not a tool error.
      execute: async ({ noteId, title, newContent }) => {
        if (!UUID_RE.test(noteId)) return { found: false as const, noteId };
        try {
          const current = await notesRepo.findForUser(noteId, userId);
          if (!current) return { found: false as const, noteId };
          const newTitle = title ?? current.title ?? "";
          // One edit per note per turn — skip a duplicate (see editedNotesThisTurn).
          if (editedNotesThisTurn.has(noteId)) return { found: true as const, skipped: true as const, noteId, title: newTitle };
          editedNotesThisTurn.add(noteId);
          return {
            found: true as const,
            noteId,
            title: newTitle,
            before: current.content ?? "",
            after: newContent,
          };
        } catch {
          return { found: false as const, noteId };
        }
      },
    }),

    // Write a change to ONE existing note IMMEDIATELY (no review card). Only when the user clearly
    // wants it committed now; otherwise propose_edit. The per-turn guard makes a save for a note
    // already proposed/saved this turn a no-op, so a stray propose+save can't double-write.
    save_edit: tool({
      description:
        "Save a change to ONE existing note IMMEDIATELY (find it first). Writes the change now, no review card. " +
        "Use ONLY when the user clearly wants it done at once ('διόρθωσέ το και αποθήκευσέ το', 'απλά πρόσθεσέ το') " +
        "— otherwise prefer propose_edit so the user reviews. Give the FULL new content (the entire note), not a diff.",
      inputSchema: z.object({
        noteId: z.string().describe("Id of the note to edit, from a prior search/list result."),
        title: z.string().optional().describe("New title, if it should change. Omit to keep the current title."),
        newContent: z.string().describe("The FULL new note body as Markdown (the complete note after edits)."),
      }),
      // Never throw: validate the id, guard the read, keep a failed write a typed {saved:false}.
      execute: async ({ noteId, title, newContent }) => {
        if (!UUID_RE.test(noteId)) return { found: false as const, noteId };
        try {
          const current = await notesRepo.findForUser(noteId, userId);
          if (!current) return { found: false as const, noteId };
          const newTitle = title ?? current.title ?? "";
          // One edit per note per turn: if this note was already proposed/saved this turn, skip the
          // duplicate save — this is what stops a propose+save double-write on the same note.
          if (editedNotesThisTurn.has(noteId)) return { found: true as const, skipped: true as const, noteId, title: newTitle };
          editedNotesThisTurn.add(noteId);
          try {
            const updated = await updateNote({ userId, noteId, content: newContent, title: newTitle });
            if (!updated) return { found: true as const, saved: false as const, noteId, title: newTitle, error: "Note not found." };
            return {
              found: true as const,
              saved: true as const,
              noteId,
              title: updated.title ?? newTitle,
              content: updated.content,
              date: isoOrEmpty(updated.created_at),
            };
          } catch (err) {
            return { found: true as const, saved: false as const, noteId, title: newTitle, error: err instanceof Error ? err.message : "Update failed." };
          }
        } catch {
          return { found: false as const, noteId };
        }
      },
    }),
  };
}
