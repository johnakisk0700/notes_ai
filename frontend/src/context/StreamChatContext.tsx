import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type FileUIPart, type UIMessage } from 'ai';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BASE_URL, getClerkToken } from '@/integrations/api';
import { fetchThread } from '@/integrations/threads';
import { latestAssistantStatus, mintObjectId, THREAD_POLL_MS, threadKeys } from '@/integrations/threadQueries';
import { mergeThreadNoRegress, optimisticThread, textOf, toUIMessage } from '@/integrations/threadMessages';
import { getNowToLocalISOString } from '@/utils/getNowToLocalISOString';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_EFFORT,
  isChatModelId,
  isReasoningEffort,
  type ChatModelId,
  type ReasoningEffort,
} from '@shared/ai/chatModels';
import type { ThreadDetail } from '@shared';

// The chat rides the AI SDK UI message stream: messages carry typed `parts` (text +
// `tool-<name>` tool calls + `file` image attachments), so the UI can show the agent's tool
// use and the user's uploaded images.
export type AppUIMessage = UIMessage;

/** An uploaded chat image, ready to attach to the next message as a file part. */
export interface ChatImageAttachment {
  id: string;
  url: string;
  mediaType: string;
  filename?: string;
}

interface StreamChatContextType {
  sendQuery: (
    query: string,
    setQuery?: (value: string) => void,
    selectedUsers?: string[],
    image?: ChatImageAttachment | null
  ) => Promise<void>;
  retryMessage: (messageId: string) => void;
  editMessage: (messageId: string, newText: string) => void;
  stopTextStream: () => void;
  messages: AppUIMessage[];
  isStreaming: boolean;
  model: ChatModelId;
  setModel: (model: ChatModelId) => void;
  effort: ReasoningEffort;
  setEffort: (effort: ReasoningEffort) => void;
}

const StreamChatContext = createContext<StreamChatContextType | undefined>(undefined);

/** A message's file parts (image attachments) — preserved when retrying/editing a turn. */
function filesOf(message: AppUIMessage): FileUIPart[] {
  return message.parts.filter((p): p is FileUIPart => p.type === 'file');
}

export const StreamChatProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Active thread id from the URL (/thread/:id). Derived from pathname rather than useParams
  // so it works from this provider, which sits above the param route.
  const routeThreadId = useMemo(() => {
    const m = location.pathname.match(/^\/thread\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  }, [location.pathname]);

  // Values the transport reads at send time. `generationId` is minted per turn so the live
  // stream and the persisted placeholder reconcile to one message; `threadId` is minted for a
  // new chat so we can poll it before the first byte arrives.
  const threadIdRef = useRef<string | undefined>(undefined);
  const generationIdRef = useRef<string | undefined>(undefined);
  const selectedUsersRef = useRef<string[]>([]);
  // Edit/retry only: how many persisted messages to KEEP before this turn (server truncates the
  // discarded tail). Cleared for a normal send. See editMessage/retryMessage.
  const truncateRef = useRef<number | undefined>(undefined);
  // The thread whose messages are currently seeded into useChat — so switching threads clears
  // the stale conversation instead of flashing it under the new URL.
  const loadedThreadRef = useRef<string | undefined>(undefined);
  // The thread + generation actually being streamed, captured at send time. onFinish and the
  // reconcile effect read THIS (not the route-mutable threadIdRef) so navigating to another
  // thread mid-stream can't misroute the finished answer's optimistic write / invalidate.
  const streamingTurnRef = useRef<{ threadId: string; generationId: string } | undefined>(undefined);
  // Whether the just-ended turn still needs a server refetch to reconcile. A clean success makes
  // the optimistic cache write authoritative (skip the refetch → no flicker); anything else
  // (error/disconnect) needs the catch-up poll.
  const needsReconcileRef = useRef(true);
  // Reactive mirror of streamingTurnRef.threadId for the render gate (refs aren't reactive):
  // the live overlay is shown only on the thread that's actually streaming.
  const [streamingThreadId, setStreamingThreadId] = useState<string | undefined>(undefined);

  // Selected chat model, persisted to localStorage. A ref mirrors it so the memoized transport
  // body always sends the current choice without re-creating the transport.
  const [model, setModelState] = useState<ChatModelId>(() => {
    const saved = localStorage.getItem('chat_model');
    return isChatModelId(saved) ? saved : DEFAULT_CHAT_MODEL;
  });
  const modelRef = useRef(model);
  const setModel = (next: ChatModelId) => {
    modelRef.current = next;
    setModelState(next);
    localStorage.setItem('chat_model', next);
  };

  // Reasoning effort, same persisted-state + ref pattern as the model.
  const [effort, setEffortState] = useState<ReasoningEffort>(() => {
    const saved = localStorage.getItem('chat_effort');
    return isReasoningEffort(saved) ? saved : DEFAULT_REASONING_EFFORT;
  });
  const effortRef = useRef(effort);
  const setEffort = (next: ReasoningEffort) => {
    effortRef.current = next;
    setEffortState(next);
    localStorage.setItem('chat_effort', next);
  };

  const transport = useMemo(
    () =>
      // body()/fetch() are deferred callbacks invoked per request (not during render), so
      // reading the latest refs here is correct — silence the render-time ref-access rule.
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport({
        api: `${BASE_URL}search-notes`,
        // Custom fetch injects the (async) Clerk bearer token + credentials per request.
        fetch: (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const token = await getClerkToken();
          const headers = new Headers(init?.headers);
          if (token) headers.set('Authorization', `Bearer ${token}`);
          return fetch(input, { ...init, headers, credentials: 'include' });
        }) as typeof globalThis.fetch,
        body: () => ({
          threadId: threadIdRef.current,
          generationId: generationIdRef.current,
          truncateToCount: truncateRef.current,
          selectedUsers: selectedUsersRef.current,
          model: modelRef.current,
          effort: effortRef.current,
          now: getNowToLocalISOString(),
        }),
      }),
    []
  );

  // The persisted thread is the poll-first source of truth. We poll while its latest assistant
  // turn is still streaming server-side (the server applies the staleness rule, so an abandoned
  // turn comes back 'error' and stops the poll). refetchOnWindowFocus/Reconnect 'always' catch
  // a returning mobile user up; refetchIntervalInBackground keeps the poll alive while the tab
  // is backgrounded (self-limiting — the interval only exists while streaming).
  const threadQuery = useQuery({
    queryKey: threadKeys.detail(routeThreadId ?? ''),
    // Merge against the cache so an in-flight poll that read the placeholder before the server
    // finalize committed can't regress an already-finalized turn back to "streaming" (flicker).
    queryFn: async () => {
      const id = routeThreadId as string;
      const fresh = await fetchThread(id);
      return mergeThreadNoRegress(queryClient.getQueryData<ThreadDetail>(threadKeys.detail(id)), fresh);
    },
    enabled: !!routeThreadId,
    refetchInterval: query => (latestAssistantStatus(query.state.data) === 'streaming' ? THREAD_POLL_MS : false),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

  const {
    messages: liveMessages,
    sendMessage,
    status,
    stop,
    setMessages,
  } = useChat({
    transport,
    // Coalesce the token-by-token state updates so the tree re-renders at ~20 fps instead of
    // on every chunk — the single biggest win against streaming jank.
    experimental_throttle: 50,
    // On finish, write the just-finished turn into the cache so the swap to RQ is flicker-free and
    // the answer survives a Mongo-down reconcile refetch. A clean success makes the optimistic
    // write authoritative (no reconcile refetch → no flicker-back-to-streaming); a disconnect
    // stays 'streaming' so the poll catches the server-side completion; error/abort is terminal.
    // Read streamingTurnRef (captured at send), NOT the route-mutable refs.
    onFinish: ({ message, messages: turnMessages, isAbort, isDisconnect, isError }) => {
      const turn = streamingTurnRef.current;
      if (!turn) return;
      const clean = !isError && !isAbort && !isDisconnect;
      if (clean) needsReconcileRef.current = false;
      const finalStatus = clean ? 'complete' : isDisconnect ? 'streaming' : 'error';
      queryClient.setQueryData<ThreadDetail>(threadKeys.detail(turn.threadId), prev =>
        optimisticThread(turn.threadId, turnMessages, message.id, turn.generationId, finalStatus, prev)
      );
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  const persistedMessages = useMemo(
    () => (threadQuery.data ? threadQuery.data.messages.map(toUIMessage) : undefined),
    [threadQuery.data]
  );

  // Model A render rule: the live overlay ONLY while a turn streams on the thread we're viewing
  // (so navigating to another thread mid-stream shows that thread, not the live one); otherwise
  // the persisted thread. Never render empty over a streamed answer when the persisted read is
  // missing (Mongo down) — fall back to the live messages.
  const showLiveOverlay = isStreaming && routeThreadId === streamingThreadId;
  const messages = showLiveOverlay ? liveMessages : (persistedMessages ?? liveMessages);

  // Reset / adopt on route change. New chat ("/") clears; switching to a different thread
  // clears the stale conversation until RQ seeds the new one; a thread we just created
  // mid-stream is adopted without clearing.
  useEffect(() => {
    if (!routeThreadId) {
      if (isStreaming) return;
      threadIdRef.current = undefined;
      if (loadedThreadRef.current !== undefined) {
        loadedThreadRef.current = undefined;
        setMessages([]);
      }
      return;
    }
    threadIdRef.current = routeThreadId;
    if (routeThreadId === loadedThreadRef.current) return;
    loadedThreadRef.current = routeThreadId;
    // Adopt a just-created thread (mid-stream) without wiping its live messages.
    if (isStreaming) return;
    setMessages([]);
  }, [routeThreadId, isStreaming, setMessages]);

  // Seed useChat with the persisted history when idle, so a follow-up send carries context and
  // the live overlay starts from the right place. Skipped while streaming (the overlay owns the
  // turn). RQ's structural sharing keeps `threadQuery.data` stable when unchanged, so this only
  // fires on a real data change.
  useEffect(() => {
    if (isStreaming || !persistedMessages || routeThreadId !== loadedThreadRef.current) return;
    setMessages(persistedMessages);
  }, [persistedMessages, isStreaming, routeThreadId, setMessages]);

  // When a turn ends, reconcile with the server. Refetch the thread ONLY if the turn didn't
  // finish cleanly (error/disconnect) — a clean success already wrote the authoritative answer
  // optimistically, and an immediate refetch could race a still-pending server finalize and
  // flicker the answer back to the thinking indicator. Always refresh the sidebar list. Both
  // target the captured streaming thread, not the route-mutable ref.
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const turn = streamingTurnRef.current;
      if (needsReconcileRef.current && turn) {
        queryClient.invalidateQueries({ queryKey: threadKeys.detail(turn.threadId) });
      }
      queryClient.invalidateQueries({ queryKey: threadKeys.list });
      setStreamingThreadId(undefined);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, queryClient]);

  // Open a new assistant turn: mint its id and capture the (thread, generation) the onFinish /
  // reconcile path will key off — immune to a route change mid-stream.
  const startTurn = (threadId: string) => {
    const generationId = mintObjectId();
    generationIdRef.current = generationId;
    streamingTurnRef.current = { threadId, generationId };
    needsReconcileRef.current = true;
    setStreamingThreadId(threadId);
  };

  const sendQuery = async (
    query: string,
    setQuery?: (value: string) => void,
    selectedUsers?: string[],
    image?: ChatImageAttachment | null
  ) => {
    const text = query.trim();
    if ((!text && !image) || isStreaming) return;
    selectedUsersRef.current = selectedUsers ?? [];
    setQuery?.('');
    truncateRef.current = undefined; // a normal send appends; no truncation
    // New chat: mint the thread id up front + adopt and route to it, so we can poll the answer
    // even if the stream never delivers a byte.
    let id = threadIdRef.current;
    if (!id) {
      id = mintObjectId();
      threadIdRef.current = id;
      loadedThreadRef.current = id;
      navigate(`/thread/${id}`, { replace: true });
    }
    startTurn(id);
    const files: FileUIPart[] | undefined = image
      ? [{ type: 'file', url: image.url, mediaType: image.mediaType, filename: image.filename }]
      : undefined;
    await sendMessage({ text, files });
  };

  const stopTextStream = () => {
    stop();
  };

  // Re-run the user turn that produced `messageId` (the assistant reply just above it). The
  // surviving prefix (everything before that user turn) is truncated server-side too, so the
  // discarded tail can't resurface from the persisted source of truth.
  const retryMessage = (messageId: string) => {
    const id = threadIdRef.current;
    if (!id) return;
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 1) return;
    const prevUser = messages[idx - 1];
    if (prevUser.role !== 'user') return;
    const text = textOf(prevUser);
    const files = filesOf(prevUser); // keep the image attachment on retry
    truncateRef.current = idx - 1; // keep everything before the user turn being retried
    setMessages(messages.slice(0, idx - 1));
    startTurn(id);
    void sendMessage({ text, files: files.length ? files : undefined });
  };

  // Replace a user message with edited text and re-run from there (durably truncating the tail).
  const editMessage = (messageId: string, newText: string) => {
    const id = threadIdRef.current;
    if (!id) return;
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const files = filesOf(messages[idx]); // keep the image attachment on edit
    truncateRef.current = idx; // keep everything before the edited message
    setMessages(messages.slice(0, idx));
    startTurn(id);
    void sendMessage({ text: newText, files: files.length ? files : undefined });
  };

  const value: StreamChatContextType = {
    sendQuery,
    retryMessage,
    editMessage,
    stopTextStream,
    messages,
    isStreaming,
    model,
    setModel,
    effort,
    setEffort,
  };

  return <StreamChatContext.Provider value={value}>{children}</StreamChatContext.Provider>;
};

export const useStreamChat = () => {
  const context = useContext(StreamChatContext);
  if (context === undefined) {
    throw new Error('useStreamChat must be used within a StreamChatProvider');
  }
  return context;
};
