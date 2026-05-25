import {
  SortCriterion,
  ParsedPagination,
} from "@shared/interfaces/QueryParameters";
import { asc, desc, SQL } from "drizzle-orm";
import { PgSelect, PgTable } from "drizzle-orm/pg-core";

export function applyOrdering<T extends PgTable, Q extends PgSelect>(
  query: Q,
  table: T,
  sorting: SortCriterion[]
): Q {
  const orderClauses = sorting.map((crit) =>
    crit.direction === "ASC" ? asc(table[crit.field]) : desc(table[crit.field])
  );
  return query.orderBy(...orderClauses) as Q;
}

export function applyPagination<Q extends PgSelect>(
  query: Q,
  pagination: ParsedPagination
): Q {
  if (pagination.fetchAll) {
    return query; // No limit/offset when fetching all
  }

  return query.limit(pagination.limit).offset(pagination.offset) as Q;
}
