import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { useStreamChat } from '@/context/StreamChatContext';

interface StreamChatProps {
  aiMessageHeight: number | 'auto';
  onAIContainerReady?: () => void;
}

export const StreamChat = ({ aiMessageHeight, onAIContainerReady }: StreamChatProps) => {
  const { messages, isStreaming } = useStreamChat();

  const aiContainerRef = useRef<HTMLDivElement>(null);
  const hasCalledReadyRef = useRef<boolean>(false);

  // Reset the flag when streaming stops.
  useEffect(() => {
    if (!isStreaming) hasCalledReadyRef.current = false;
  }, [isStreaming]);

  // Notify the parent once per streaming session so it can reserve space + scroll
  // the user's question to the top while Lexi works.
  useEffect(() => {
    if (isStreaming && aiMessageHeight !== 'auto' && onAIContainerReady && !hasCalledReadyRef.current) {
      hasCalledReadyRef.current = true;
      requestAnimationFrame(() => onAIContainerReady());
    }
  }, [isStreaming, aiMessageHeight, onAIContainerReady]);

  const last = messages[messages.length - 1];
  // While streaming, the assistant reply IS the last message and grows in place.
  // Before its first token arrives, show a placeholder that reserves the height.
  const awaitingAssistant = isStreaming && (!last || last.role === 'user');

  return (
    <div className="flex flex-col gap-3 p-1.5 pt-3">
      {messages.map((message, i) => (
        <ChatMessage
          message={message}
          key={message.id}
          style={{ minHeight: i === messages.length - 1 && message.role !== 'user' ? aiMessageHeight : '' }}
        />
      ))}
      {awaitingAssistant ? (
        <div ref={aiContainerRef} style={{ minHeight: aiMessageHeight }} className="chat-md max-w-none">
          <span className="inline-block animate-pulse font-mono text-xs text-muted-foreground">…</span>
        </div>
      ) : null}
    </div>
  );
};
