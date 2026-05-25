import { notesTable } from "@shared/db/schema/notes";
import { FullNote } from "@shared/dto/GetNoteDTO";
import {
  PaginationResponse,
  QueryParameters,
} from "@shared/interfaces/QueryParameters";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { count, eq } from "drizzle-orm";

export async function getNotes(req, res) {
  const userId = req.user.id;
  const { sorting, pagination }: QueryParameters = req.queryParams;

  try {
    const whereClause = eq(notesTable.userId, userId);

    const countQuery = drizzlePg
      .select({ count: count() })
      .from(notesTable)
      .where(whereClause);

    const notesQuery = drizzlePg.query.notesTable.findMany({
      where: whereClause,
      with: {
        reminder: true, // This includes the related reminder
      },
      orderBy: (notes, { asc, desc }) =>
        sorting?.length
          ? sorting.map((s) =>
              s.direction.toLowerCase() === "asc"
                ? asc(notes[s.field])
                : desc(notes[s.field])
            )
          : [desc(notes.updated_at)],
      limit: pagination.fetchAll ? undefined : pagination.limit,
      offset: pagination.fetchAll ? undefined : pagination.offset,
    });

    const [[{ count: totalCount }], notesWithReminders] = await Promise.all([
      countQuery,
      notesQuery,
    ]);

    const response: PaginationResponse<FullNote> = {
      data: notesWithReminders,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalCount,
        totalPages: pagination.fetchAll
          ? 1
          : Math.ceil(totalCount / pagination.limit),
        hasNext:
          !pagination.fetchAll &&
          pagination.page * pagination.limit < totalCount,
        hasPrev: pagination.page > 1,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
