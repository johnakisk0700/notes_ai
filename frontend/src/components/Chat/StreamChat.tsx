import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { useStreamChat } from '@/context/StreamChatContext';

interface StreamChatProps {
  aiMessageHeight: number | 'auto';
  onAIContainerReady?: () => void;
}

export const StreamChat = ({ aiMessageHeight, onAIContainerReady }: StreamChatProps) => {
  const { messages, isStreaming } = useStreamChat();

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
  const lastPart = last?.role === 'assistant' ? last.parts[last.parts.length - 1] : undefined;
  // Lexi is "thinking" while the turn streams but no answer text is flowing yet —
  // before her first token, and in the gaps between tool calls and the reply.
  const thinking = isStreaming && lastPart?.type !== 'text';
  // No assistant message yet: reserve the answer's height and show the indicator there.
  const awaitingAssistant = isStreaming && (!last || last.role === 'user');

  return (
    <div className="flex flex-col gap-3 p-1.5 pt-3">
      {messages.map((message, i) => {
        const isLast = i === messages.length - 1;
        return (
          <ChatMessage
            message={message}
            key={message.id}
            style={{ minHeight: isLast && message.role !== 'user' ? aiMessageHeight : '' }}
            thinking={isLast && message.role === 'assistant' && thinking}
          />
        );
      })}
      {awaitingAssistant ? (
        <div style={{ minHeight: aiMessageHeight }} className="max-w-none">
          <ThinkingIndicator />
        </div>
      ) : null}
    </div>
  );
};
