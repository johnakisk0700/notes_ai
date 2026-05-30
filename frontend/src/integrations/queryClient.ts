import { QueryClient } from '@tanstack/react-query';

// One module-level QueryClient (survives re-renders + StrictMode double-mount — never create
// it inside a component). Tuned for a flaky-mobile, poll-first chat: built-in retry with
// exponential backoff, and networkMode 'online' (the default) which pauses queries while
// offline and auto-resumes on reconnect. A short staleTime lets a returning user catch up on
// focus without hammering the API; the thread query overrides focus/reconnect to 'always' so
// the mobile catch-up refetch is guaranteed regardless of staleness.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});
