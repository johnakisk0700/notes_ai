import { drizzlePg } from "clients/drizzle_postgres_client";
import { eq, count, inArray, lt, and } from "drizzle-orm";
import { remindersTable } from "@shared/db/schema/reminders";
import { notesTable } from "@shared/db/schema/notes";
import { applyOrdering, applyPagination } from "utils/drizzleHelpers";
import type { QueryParameters } from "@shared/interfaces/QueryParameters";

export async function getReminders(req, res) {
  const userId = req.user.id;
  const { include_note_content, due_only } = req.query;
  const { sorting, pagination }: QueryParameters = req.queryParams;

  // Get user's note IDs
  const userNotesResult = await drizzlePg
    .select({ id: notesTable.id })
    .from(notesTable)
    .where(eq(notesTable.userId, userId));

  const userNoteIds = userNotesResult.map(note => note.id);

  if (userNoteIds.length === 0) {
    return res.status(200).json({
      data: [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalCount: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }

  // Build WHERE conditions
  const whereConditions = [inArray(remindersTable.noteId, userNoteIds), eq(remindersTable.status, "pending")];

  if (due_only === "true") {
    whereConditions.push(lt(remindersTable.remindAt, new Date()));
  }

  const whereClause = and(...whereConditions);

  // Get total count
  const totalCount = await drizzlePg
    .select({ count: count() })
    .from(remindersTable)
    .where(whereClause)
    .then(result => result[0].count);

  // Build main query
  let query;

  if (include_note_content === "true") {
    query = drizzlePg
      .select({
        id: remindersTable.id,
        noteId: remindersTable.noteId,
        remindAt: remindersTable.remindAt,
        status: remindersTable.status,
        noteContent: notesTable.content,
      })
      .from(remindersTable)
      .leftJoin(notesTable, eq(remindersTable.noteId, notesTable.id))
      .where(whereClause)
      .$dynamic();
  } else {
    query = drizzlePg
      .select({
        id: remindersTable.id,
        noteId: remindersTable.noteId,
        remindAt: remindersTable.remindAt,
        status: remindersTable.status,
      })
      .from(remindersTable)
      .where(whereClause)
      .$dynamic();
  }

  // Apply sorting and pagination
  if (sorting.length > 0) {
    query = applyOrdering(query, remindersTable, sorting);
  }

  if (!pagination?.fetchAll) {
    query = applyPagination(query, pagination);
  }

  const result = await query;

  // Transform if note content included
  const data =
    include_note_content === "true"
      ? result.map(({ noteContent, ...rest }) => ({
          ...rest,
          notes: { content: noteContent },
        }))
      : result;

  res.status(200).json({
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalCount,
      totalPages: pagination.fetchAll ? 1 : Math.ceil(totalCount / pagination.limit),
      hasNext: !pagination.fetchAll && pagination.page * pagination.limit < totalCount,
      hasPrev: pagination.page > 1,
    },
  });
}
