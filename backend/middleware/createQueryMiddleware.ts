import type { QueryMiddlewareOptions, SortCriterion } from "@shared/interfaces/QueryParameters";

export function createQueryMiddleware(options: QueryMiddlewareOptions) {
  const { defaultSort = [], defaultLimit = -1, maxLimit } = options;

  return (req, res, next) => {
    const { sort, page = 1, limit = defaultLimit } = req.query;

    // Parse sorting - let individual endpoints handle field validation
    let sortCriteria: SortCriterion[] = defaultSort;
    if (sort) {
      const sortParams = Array.isArray(sort) ? sort : [sort];

      sortCriteria = sortParams
        .map(sortParam => {
          if (typeof sortParam !== "string") return null;

          const [field, direction] = sortParam.split(":");

          // Only validate direction, let the endpoint validate fields
          if (!field || !direction || !["ASC", "DESC"].includes(direction.toUpperCase())) {
            return null;
          }

          return {
            field,
            direction: direction.toUpperCase() as "ASC" | "DESC",
          };
        })
        .filter((item): item is SortCriterion => item !== null);
    }

    // Parse limit with support for fetching all records
    const parsedLimit = parseInt(String(limit));
    let finalLimit = -1; // Default to fetch all

    if (!isNaN(parsedLimit)) {
      if (parsedLimit === -1) {
        finalLimit = -1; // Explicitly fetch all
      } else if (parsedLimit > 0) {
        finalLimit = maxLimit ? Math.min(parsedLimit, maxLimit) : parsedLimit;
      }
    }

    // Store parsed sort criteria for the endpoint to use
    req.queryParams = {
      sorting: sortCriteria,
      pagination: {
        page: Math.max(1, parseInt(String(page)) || 1),
        limit: finalLimit,
        offset: 0, // Will be calculated when needed
        fetchAll: finalLimit === -1,
      },
    };

    next();
  };
}
