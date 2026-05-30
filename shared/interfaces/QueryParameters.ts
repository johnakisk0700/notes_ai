import type { SQL } from "drizzle-orm";

/**
 * Defines the structure for a single sort criterion.
 */
export interface SortCriterion {
  field: string; // The name of the field to sort by
  direction: "ASC" | "DESC";
}

/**
 * Parsed pagination information, ready for Drizzle.
 */
export interface ParsedPagination {
  page: number;
  limit: number; // Will be -1 if fetchAll is true
  offset: number;
  fetchAll: boolean;
}

export interface QueryParameters {
  sorting: SortCriterion[];
  pagination: ParsedPagination;
}

/**
 * Options for configuring the query middleware.
 */
export interface QueryMiddlewareOptions {
  /** Default sort criteria if none are provided by the client. */
  defaultSort?: SortCriterion[];
  /** Default limit per page if not specified or if invalid value is sent. Use -1 for fetchAll by default. */
  defaultLimit?: number;
  /** Maximum number of items per page. */
  maxLimit?: number;
  /** Optional field validation - if not provided, any field is allowed */
  allowedOrderFields?: Record<string, SQL>;
}

/**
 * Standard structure for paginated API responses.
 */
export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number; // Reflects the requested limit; -1 if fetchAll was true
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
