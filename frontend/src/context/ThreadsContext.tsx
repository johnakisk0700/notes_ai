import { fetchThreads, deleteThread as apiDeleteThread } from '@/integrations/threads';
import type { ThreadSummary } from '@shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface ThreadsContextType {
  threads: ThreadSummary[];
  refresh: () => Promise<void>;
  removeThread: (id: string) => Promise<void>;
}

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);

// Holds the current user's chat thread list for the sidebar. Mounted inside the
// authed Layout, so it only fetches once a session token is available.
export function ThreadsProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      setThreads(await fetchThreads());
    } catch (error) {
      // Sidebar simply shows no threads if the list can't be loaded.
      console.error('Failed to load chat threads:', error);
    }
  }, []);

  const removeThread = useCallback(async (id: string) => {
    await apiDeleteThread(id);
    setThreads(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <ThreadsContext.Provider value={{ threads, refresh, removeThread }}>{children}</ThreadsContext.Provider>;
}

export function useThreads() {
  const context = useContext(ThreadsContext);
  if (context === undefined) {
    throw new Error('useThreads must be used within a ThreadsProvider');
  }
  return context;
}
