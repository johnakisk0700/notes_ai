import type { ThreadDetail, ThreadSummary } from '@shared';
import { api } from './api';

// AI chat threads, persisted server-side (Mongo). The streamed answer itself
// rides the Vercel AI SDK transport (see StreamChatContext); these are the
// plain CRUD calls the sidebar + history-loading use.
export async function fetchThreads(): Promise<ThreadSummary[]> {
  const {
    data: { data },
  } = await api.get<{ data: ThreadSummary[] }>('get-threads');
  return data ?? [];
}

export async function fetchThread(threadId: string): Promise<ThreadDetail> {
  const { data } = await api.get<ThreadDetail>('get-thread', {
    params: { threadId },
  });
  return data;
}

export async function deleteThread(threadId: string): Promise<void> {
  await api.post('delete-thread', { threadId });
}
