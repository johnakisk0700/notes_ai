// Notes data-access — the single home for how we read the `notes` table and, crucially,
// how we scope it to a user. The tenancy predicate (`userId`) is a security invariant;
// keeping it here (instead of hand-copied across handlers and the chat tools) makes
// "is this query scoped?" a typed choice — `findForUser` vs the explicit `findAny`.
import { drizzlePg } from "clients/drizzle_postgres_client";
import { notesTable } from "@shared/db/schema/notes";
import type { FullNote } from "@shared/dto/GetNoteDTO";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

// The "read a note" relation — kept in one place so adding a relation is a one-line change.
const withReminder = { reminder: true } as const;

// The column projection the chat retrieval tools select. Lives here so the shape is
// declared once rather than re-typed in each tool.
export const NOTE_COLUMNS = {
  id: notesTable.id,
  title: notesTable.title,
  content: notesTable.content,
  created_at: notesTable.created_at,
};

// A `notes` row as the retrieval tools project it (see NOTE_COLUMNS).
export interface NoteRow {
  id: string;
  title: string | null;
  content: string | null;
  created_at: Date | string | null;
}

export const notesRepo = {
  /** A single note scoped to its owner — tenancy enforced by the signature. */
  findForUser: (noteId: string, userId: string): Promise<FullNote | undefined> =>
    drizzlePg.query.notesTable.findFirst({
      where: and(eq(notesTable.id, noteId), eq(notesTable.userId, userId)),
      with: withReminder,
    }) as Promise<FullNote | undefined>,

  /** A single note with NO owner filter — the explicit admin path (intentionally unscoped). */
  findAny: (noteId: string): Promise<FullNote | undefined> =>
    drizzlePg.query.notesTable.findFirst({
      where: eq(notesTable.id, noteId),
      with: withReminder,
    }) as Promise<FullNote | undefined>,

  /** The ids of a user's notes (e.g. to scope reminders or purge vectors). */
  idsForUser: async (userId: string): Promise<string[]> => {
    const rows = await drizzlePg.select({ id: notesTable.id }).from(notesTable).where(eq(notesTable.userId, userId));
    return rows.map(r => r.id);
  },

  /** Candidate rows for the given ids, scoped to the caller's user(s) — used by search_notes. */
  candidatesByIds: (userIds: string[], ids: string[]): Promise<NoteRow[]> =>
    drizzlePg
      .select(NOTE_COLUMNS)
      .from(notesTable)
      .where(and(inArray(notesTable.id, ids), inArray(notesTable.userId, userIds))),

  /** A user's notes in a creation-date range, newest first — used by filter_by_date. */
  byDateRange: (userIds: string[], opts: { from?: string; to?: string; limit: number }): Promise<NoteRow[]> => {
    const conds: SQL[] = [inArray(notesTable.userId, userIds)];
    if (opts.from) conds.push(gte(notesTable.created_at, new Date(opts.from)));
    if (opts.to) conds.push(lte(notesTable.created_at, new Date(opts.to)));
    return drizzlePg
      .select(NOTE_COLUMNS)
      .from(notesTable)
      .where(and(...conds))
      .orderBy(desc(notesTable.created_at))
      .limit(opts.limit);
  },

  /** A user's most recent notes, newest first — used by list_recent_notes. */
  recent: (userIds: string[], limit: number): Promise<NoteRow[]> =>
    drizzlePg
      .select(NOTE_COLUMNS)
      .from(notesTable)
      .where(inArray(notesTable.userId, userIds))
      .orderBy(desc(notesTable.created_at))
      .limit(limit),
};
