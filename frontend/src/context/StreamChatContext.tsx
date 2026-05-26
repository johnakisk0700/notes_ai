import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BASE_URL, getClerkToken } from '@/integrations/api';
import { fetchThread } from '@/integrations/threads';
import { getNowToLocalISOString } from '@/utils/getNowToLocalISOString';
import { useThreads } from './ThreadsContext';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_EFFORT,
  isChatModelId,
  isReasoningEffort,
  type ChatModelId,
  type ReasoningEffort,
} from '@shared/ai/chatModels';

// The chat now rides the AI SDK UI message stream: messages carry typed `parts`
// (text + `tool-<name>` tool calls), so the UI can show the agent's tool use.
export type AppUIMessage = UIMessage;

interface StreamChatContextType {
  sendQuery: (query: string, setQuery?: (value: string) => void, selectedUsers?: string[]) => Promise<void>;
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

/** Concatenated text of a message's text parts (ignores tool/reasoning parts). */
function textOf(message: AppUIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('');
}

export const StreamChatProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh: refreshThreads } = useThreads();

  // Active thread id from the URL (/thread/:id). Derived from pathname rather than
  // useParams so it works from this provider, which sits above the param route.
  const routeThreadId = useMemo(() => {
    const m = location.pathname.match(/^\/thread\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  }, [location.pathname]);

  // Values the transport reads at send time, and a guard so the hydrate effect
  // doesn't refetch a thread we just created locally mid-stream.
  const threadIdRef = useRef<string | undefined>(undefined);
  const selectedUsersRef = useRef<string[]>([]);
  const loadedThreadRef = useRef<string | undefined>(undefined);

  // Selected chat model, persisted to localStorage. A ref mirrors it so the memoized
  // transport body always sends the current choice without re-creating the transport.
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
          selectedUsers: selectedUsersRef.current,
          model: modelRef.current,
          effort: effortRef.current,
          now: getNowToLocalISOString(),
        }),
      }),
    []
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport,
    onData: dataPart => {
      // First message of a new chat: the server streams back the created thread id.
      if (dataPart.type === 'data-thread') {
        const id = (dataPart.data as { id?: string } | undefined)?.id;
        if (id) {
          threadIdRef.current = id;
          loadedThreadRef.current = id; // adopt it so the hydrate effect won't refetch
          navigate(`/thread/${id}`, { replace: true });
          refreshThreads();
        }
      }
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Hydrate (or reset) the conversation when the active /thread/:id changes.
  useEffect(() => {
    if (!routeThreadId) {
      // Root "/" = new chat: clear unless already empty.
      if (loadedThreadRef.current !== undefined) {
        loadedThreadRef.current = undefined;
        threadIdRef.current = undefined;
        setMessages([]);
      }
      return;
    }
    // Already showing this thread (incl. one we just created) — nothing to load.
    if (routeThreadId === loadedThreadRef.current) return;

    let cancelled = false;
    loadedThreadRef.current = routeThreadId;
    threadIdRef.current = routeThreadId;
    (async () => {
      try {
        const detail = await fetchThread(routeThreadId);
        if (cancelled) return;
        setMessages(
          detail.messages.map(m => ({
            id: m.id,
            role: m.role === 'user' ? 'user' : 'assistant',
            parts: [{ type: 'text', text: m.content }],
          })) as AppUIMessage[]
        );
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeThreadId, setMessages]);

  const sendQuery = async (query: string, setQuery?: (value: string) => void, selectedUsers?: string[]) => {
    if (!query.trim() || isStreaming) return;
    selectedUsersRef.current = selectedUsers ?? [];
    setQuery?.('');
    await sendMessage({ text: query.trim() });
  };

  const stopTextStream = () => {
    stop();
  };

  // Re-run the user turn that produced `messageId` (the assistant reply just above it).
  const retryMessage = (messageId: string) => {
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 1) return;
    const prevUser = messages[idx - 1];
    if (prevUser.role !== 'user') return;
    const text = textOf(prevUser);
    setMessages(messages.slice(0, idx - 1));
    void sendMessage({ text });
  };

  // Replace a user message with edited text and re-run from there.
  const editMessage = (messageId: string, newText: string) => {
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    setMessages(messages.slice(0, idx));
    void sendMessage({ text: newText });
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
