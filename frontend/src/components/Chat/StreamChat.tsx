import { useFadeInOut } from '@/hooks/useFadeInOut';
import type { Message } from '@/context/StreamChatContext';
import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { CustomMarkdown } from './CustomMarkdown';
import { useStreamChat } from '@/context/StreamChatContext';

interface StreamChatProps {
  aiMessageHeight: number | 'auto';
  onAIContainerReady?: () => void;
}

export const StreamChat = ({ aiMessageHeight, onAIContainerReady }: StreamChatProps) => {
  const { streamText, messages, isStreaming, statusUpdate } = useStreamChat();

  const statusFade = useFadeInOut(statusUpdate, 300);
  const aiContainerRef = useRef<HTMLDivElement>(null);
  const hasCalledReadyRef = useRef<boolean>(false);

  // Reset the flag when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      hasCalledReadyRef.current = false;
    }
  }, [isStreaming]);

  // Notify parent when AI container gets its height - only once per streaming session
  useEffect(() => {
    if (
      isStreaming &&
      aiContainerRef.current &&
      aiMessageHeight !== 'auto' &&
      onAIContainerReady &&
      !hasCalledReadyRef.current
    ) {
      hasCalledReadyRef.current = true;
      // Use requestAnimationFrame to ensure the height is applied
      requestAnimationFrame(() => {
        onAIContainerReady();
      });
    }
  }, [isStreaming, aiMessageHeight, onAIContainerReady]);

  return (
    <div className="flex flex-col p-1.5 pt-3 gap-2">
      {messages.map((message, i) => (
        <ChatMessage
          message={message}
          key={message.id}
          style={{ minHeight: i === messages.length - 1 && !message.isUser ? aiMessageHeight : '' }}
        />
      ))}
      {isStreaming && (streamText || statusUpdate) ? (
        <div ref={aiContainerRef} className="" style={{ minHeight: aiMessageHeight }}>
          {statusUpdate ? <div style={statusFade.style}>{statusFade.displayValue}</div> : null}
          <div className="prose prose-sm max-w-none">
            <CustomMarkdown>{streamText}</CustomMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  );
};
