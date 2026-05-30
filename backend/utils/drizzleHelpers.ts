import type { ParsedPagination, PaginationResponse, SortCriterion } from "@shared/interfaces/QueryParameters";
import { asc, desc } from "drizzle-orm";
import type { PgSelect, PgTable } from "drizzle-orm/pg-core";

/**
 * Builds the standard `{ data, pagination }` envelope returned by every list endpoint.
 * Single source of the paging contract (totalPages / hasNext / hasPrev), so the list
 * handlers don't each re-derive it.
 */
export function buildPaginationResponse<T>(
  data: T[],
  pagination: ParsedPagination,
  totalCount: number
): PaginationResponse<T> {
  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalCount,
      totalPages: pagination.fetchAll ? 1 : Math.ceil(totalCount / pagination.limit),
      hasNext: !pagination.fetchAll && pagination.page * pagination.limit < totalCount,
      hasPrev: pagination.page > 1,
    },
  };
}

export function applyOrdering<T extends PgTable, Q extends PgSelect>(query: Q, table: T, sorting: SortCriterion[]): Q {
  const orderClauses = sorting.map(crit =>
    crit.direction === "ASC" ? asc(table[crit.field]) : desc(table[crit.field])
  );
  return query.orderBy(...orderClauses) as Q;
}

export function applyPagination<Q extends PgSelect>(query: Q, pagination: ParsedPagination): Q {
  if (pagination.fetchAll) {
    return query; // No limit/offset when fetching all
  }

  return query.limit(pagination.limit).offset(pagination.offset) as Q;
}
