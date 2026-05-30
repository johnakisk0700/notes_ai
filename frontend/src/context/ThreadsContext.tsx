import { fetchThreads, deleteThread as apiDeleteThread } from '@/integrations/threads';
import { threadKeys } from '@/integrations/threadQueries';
import type { ThreadSummary } from '@shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, type ReactNode } from 'react';

interface ThreadsContextType {
  threads: ThreadSummary[];
  refresh: () => Promise<void>;
  removeThread: (id: string) => Promise<void>;
}

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);

// Holds the current user's chat thread list for the sidebar, backed by the shared TanStack
// Query cache (key ['threads']). Mounted inside the authed Layout, so it only fetches once a
// session token is available. The chat flow invalidates ['threads'] when a turn finishes, so a
// newly-created thread appears without a manual refresh.
export function ThreadsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: threads = [] } = useQuery({
    queryKey: threadKeys.list,
    queryFn: fetchThreads,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: threadKeys.list });
  }, [queryClient]);

  const remove = useMutation({
    mutationFn: apiDeleteThread,
    // Optimistically drop the thread from the list + its cached detail; the list query
    // reconciles on its next fetch.
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ThreadSummary[]>(threadKeys.list, prev => prev?.filter(t => t.id !== id));
      queryClient.removeQueries({ queryKey: threadKeys.detail(id) });
    },
  });

  const removeThread = useCallback(
    async (id: string) => {
      await remove.mutateAsync(id);
    },
    [remove]
  );

  return <ThreadsContext.Provider value={{ threads, refresh, removeThread }}>{children}</ThreadsContext.Provider>;
}

export function useThreads() {
  const context = useContext(ThreadsContext);
  if (context === undefined) {
    throw new Error('useThreads must be used within a ThreadsProvider');
  }
  return context;
}
