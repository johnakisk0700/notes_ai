import { fetchApi } from '@/integrations/api';
import { fetchThread } from '@/integrations/threads';
import { getNowToLocalISOString } from '@/utils/getNowToLocalISOString';
import { handleStreamProcessing } from '@/utils/handleStreamProcessing';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useThreads } from './ThreadsContext';

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface StreamChatContextType {
  sendQuery: (query: string, setQuery?: any, selectedUsers?: string[]) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  editMessage: (newMessage: Message) => Promise<void>;
  stopTextStream: () => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isStreaming: boolean;
  streamText: string;
  statusUpdate: string;
}

const StreamChatContext = createContext<StreamChatContextType | undefined>(undefined);

interface StreamChatProviderProps {
  children: ReactNode;
}

export const StreamChatProvider = ({ children }: StreamChatProviderProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh: refreshThreads } = useThreads();

  // Active thread id from the URL (/thread/:id). Derived from pathname rather
  // than useParams so it works from this provider, which sits above the param
  // route (see ChatLayout in App.tsx).
  const routeThreadId = useMemo(() => {
    const m = location.pathname.match(/^\/thread\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  }, [location.pathname]);

  // Status update for manually setting the status of the processing from backend
  const [statusUpdate, setStatusUpdate] = useState('');

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [messages, setMessages] = useState<Message[] | []>([]);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef(''); // Add ref to track accumulated text
  // Which thread's messages are currently in state. A ref (not state) so the
  // hydrate effect can compare synchronously and skip refetching a thread we
  // just created locally mid-stream.
  const loadedThreadRef = useRef<string | undefined>(undefined);

  // Hydrate (or reset) the conversation when the active /thread/:id changes.
  useEffect(() => {
    if (!routeThreadId) {
      // Root "/" = new chat: clear unless already empty.
      if (loadedThreadRef.current !== undefined) {
        loadedThreadRef.current = undefined;
        setThreadId(undefined);
        setMessages([]);
      }
      return;
    }
    // Already showing this thread (incl. one we just created) — nothing to load.
    if (routeThreadId === loadedThreadRef.current) return;

    let cancelled = false;
    loadedThreadRef.current = routeThreadId;
    setThreadId(routeThreadId);
    (async () => {
      try {
        const detail = await fetchThread(routeThreadId);
        if (cancelled) return;
        setMessages(
          detail.messages.map(m => ({
            id: m.id,
            content: m.content,
            isUser: m.role === 'user',
            timestamp: new Date(m.timestamp),
          }))
        );
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeThreadId]);

  const sendQuery = async (query: string, setQuery?: any, selectedUsers?: string[]) => {
    if (!query.trim()) return;

    if (setQuery) setQuery('');
    const userMessage = {
      id: Date.now().toString(),
      content: query.trim(),
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]); // Add user message to chat

    try {
      setIsStreaming(true); // Streaming starts now
      streamTextRef.current = ''; // Reset the ref
      abortControllerRef.current = new AbortController(); // Create a new AbortController for this request
      const response = await fetchApi('search-notes', {
        method: 'POST',
        body: {
          query: query.trim(), // Use the trimmed query
          previousQueries: messages.map(msg => ({
            role: msg.isUser ? 'user' : 'assistant',
            content: msg.content,
          })),
          selectedUsers,
          now: getNowToLocalISOString(),
          threadId, // undefined for a new chat; server creates one and streams its id back
        },
        signal: abortControllerRef.current!.signal,
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();

      await handleStreamProcessing(reader, {
        onThreadEvent: newThreadId => {
          // First message of a new chat: adopt the server's id and route to it.
          // ChatLayout keeps this provider mounted, so the in-flight stream
          // survives the navigation; refresh the sidebar to show the new thread.
          loadedThreadRef.current = newThreadId;
          setThreadId(newThreadId);
          navigate(`/thread/${newThreadId}`, { replace: true });
          refreshThreads();
        },
        onData: data => {
          setStatusUpdate('');
          streamTextRef.current += data; // Update ref
          setStreamText(streamTextRef.current); // Update state
        },
        onManualEvent: (manualData: string) => {
          setStatusUpdate(manualData);
        },
        onErrorEvent: errorMessage => {
          setIsStreaming(false);
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              content: `${streamTextRef.current}\nStream error: ${errorMessage}`,
              isUser: false,
              timestamp: new Date(),
            },
          ]);
          setStreamText('');
          streamTextRef.current = '';
        },
        onDoneEvent: () => {
          const newMsg: Message = {
            id: Date.now().toString(),
            content: streamTextRef.current.trim(),
            isUser: false,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, { ...newMsg, isTemp: false, timestamp: new Date() }]);
          setIsStreaming(false);
          setStreamText('');
          streamTextRef.current = '';
        },
      });
    } catch (error) {
      const userMessage =
        error instanceof Error && error.name === 'AbortError'
          ? streamTextRef.current + '\n\n' + t('aborted')
          : streamTextRef.current + '\n\n' + t('generic_error');

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          content: userMessage,
          isUser: false,
          timestamp: new Date(),
        },
      ]);
      setStreamText('');
      streamTextRef.current = '';
    } finally {
      setIsStreaming(false);
    }
  };

  const stopTextStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const retryMessage = async (messageId: string) => {
    const retryMsgIdx = messages.findIndex(msg => msg.id === messageId);
    const previousUserMsg = messages[retryMsgIdx - 1];
    const newMessages = messages.slice(0, retryMsgIdx - 1);
    setMessages(newMessages);
    await sendQuery(previousUserMsg.content);
  };

  const editMessage = async (newMessage: Message) => {
    const editMsgIdx = messages.findIndex(msg => msg.id === newMessage.id);

    let newMessages: Message[] = [];
    if (editMsgIdx !== 0) {
      newMessages = messages.slice(0, editMsgIdx - 1);
    }
    setMessages(newMessages);
    await sendQuery(newMessage.content);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null; // Clean up ref on unmount
      }
    };
  }, []);

  const value: StreamChatContextType = {
    sendQuery,
    retryMessage,
    editMessage,
    stopTextStream,
    messages,
    setMessages,
    isStreaming,
    streamText,
    statusUpdate,
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
