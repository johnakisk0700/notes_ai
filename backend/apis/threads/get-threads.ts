import type { PaginationResponse, ThreadSummary } from "@shared";
import { countThreads, listThreads } from "services/chat-threads";

// List the current user's chat threads, newest first (sidebar). Goes through
// queryMiddleware, so it returns the standard { data, pagination } envelope and
// supports page/limit/fetchAll like the other list endpoints.
export async function getThreads(req, res) {
  const userId = req.user.id;
  const { pagination } = req.queryParams;

  const [threads, totalCount] = await Promise.all([
    listThreads(userId, {
      limit: pagination.fetchAll ? undefined : pagination.limit,
      offset: pagination.fetchAll ? undefined : pagination.offset,
    }),
    countThreads(userId),
  ]);

  const response: PaginationResponse<ThreadSummary> = {
    data: threads,
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
