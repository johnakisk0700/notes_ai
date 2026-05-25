import { fetchApi } from '@/integrations/api';
import { getNowToLocalISOString } from '@/utils/getNowToLocalISOString';
import { handleStreamProcessing } from '@/utils/handleStreamProcessing';
import { useEffect, useRef, useState } from 'react';

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

export const _useStreamChat_old = () => {
  // Status update for manually setting the status of the processing from backend
  const [statusUpdate, setStatusUpdate] = useState('');

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [messages, setMessages] = useState<Message[] | []>([
    {
      id: 'msg-1',
      content: 'Ti thes re?',
      isUser: true,
      timestamp: new Date(),
    },
    {
      id: 'msg-2',
      content: 'Ti na thelw re mlk? \nTi na thelw re mlk? \nTi na thelw re mlk? \nTi na thelw re mlk?',
      isUser: false,
      timestamp: new Date(),
    },
  ]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef(''); // Add ref to track accumulated text

  const sendQuery = async (query: string, setQuery?: any, selectedUsers?: string[]) => {
    console.log('Sending query:', query);
    if (!query.trim()) return;

    let queryBackup = query.trim();
    setQuery('');
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
        },
        signal: abortControllerRef.current!.signal,
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();

      await handleStreamProcessing(reader, {
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
          console.log('Stream processing done', streamTextRef.current);
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
          ? streamTextRef.current + '\n\nRequest was aborted.'
          : streamTextRef.current + '\n\nInternal server error.';

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
      // setQuery(queryBackup); // Restore the original query (not needed for now)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null; // Clean up ref on unmount
      }
    };
  }, []);

  return {
    sendQuery,
    retryMessage,
    stopTextStream,
    messages,
    setMessages,
    isStreaming,
    streamText,
    statusUpdate,
  };
};
