import { countThreads, listThreads } from "services/chat-threads";
import { buildPaginationResponse } from "utils/drizzleHelpers";

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

  res.status(200).json(buildPaginationResponse(threads, pagination, totalCount));
}
