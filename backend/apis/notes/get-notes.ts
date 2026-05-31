import { notesTable } from "@shared/db/schema/notes";
import type { QueryParameters } from "@shared/interfaces/QueryParameters";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { buildPaginationResponse } from "utils/drizzleHelpers";
import { count, eq } from "drizzle-orm";

export async function getNotes(req, res) {
  const userId = req.user.id;
  const { sorting, pagination }: QueryParameters = req.queryParams;

  const whereClause = eq(notesTable.userId, userId);

  const countQuery = drizzlePg.select({ count: count() }).from(notesTable).where(whereClause);

  const notesQuery = drizzlePg.query.notesTable.findMany({
    where: whereClause,
    orderBy: (notes, { asc, desc }) =>
      sorting?.length
        ? sorting.map(s => (s.direction.toLowerCase() === "asc" ? asc(notes[s.field]) : desc(notes[s.field])))
        : [desc(notes.updated_at)],
    limit: pagination.fetchAll ? undefined : pagination.limit,
    offset: pagination.fetchAll ? undefined : pagination.offset,
  });

  const [[{ count: totalCount }], notes] = await Promise.all([countQuery, notesQuery]);

  res.status(200).json(buildPaginationResponse(notes, pagination, totalCount));
}
