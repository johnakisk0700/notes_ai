import type { Profile } from "@shared/db/schema/profile";
import { profileTable } from "@shared/db/schema/profile";
import type { Tefteri } from "@shared/db/schema/tefteri";
import { tefteriTable } from "@shared/db/schema/tefteri";
import type { PaginationResponse, QueryParameters } from "@shared/interfaces/QueryParameters";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { count, desc, eq, sql } from "drizzle-orm";
import { applyPagination } from "utils/drizzleHelpers";

export async function getProfiles(req, res) {
  const { sorting, pagination }: QueryParameters = req.queryParams;

  let query = drizzlePg
    .select()
    .from(profileTable)
    .leftJoin(tefteriTable, eq(profileTable.id, tefteriTable.userId))
    .orderBy(desc(sql`COALESCE(${tefteriTable.totalCost}, 0)`))
    .$dynamic();

  // if (sorting) query = applyOrdering(query, profileTable, sorting);
  if (!pagination?.fetchAll) query = applyPagination(query, pagination);

  const [countResult, result] = await Promise.all([drizzlePg.select({ count: count() }).from(profileTable), query]);

  const totalCount = countResult[0].count;

  const response: PaginationResponse<{
    profile: Profile;
    tefteri: Tefteri | null;
  }> = {
    data: result,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalCount,
      totalPages: pagination.fetchAll ? 1 : Math.ceil(totalCount / pagination.limit),
      hasNext: !pagination.fetchAll && pagination.page * pagination.limit < totalCount,
      hasPrev: pagination.page > 1,
    },
  };

  res.status(200).json(response);
}
