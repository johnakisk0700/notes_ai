import { StreamChat } from '@/components/Chat/StreamChat';
import { MainTextArea } from '@/components/MainTextarea';
import { useStreamChat } from '@/context/StreamChatContext';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const MainChatPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const today = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [userMessageHeight, setUserMessageHeight] = useState<number>(0);
  const [initialViewportHeight, setInitialViewportHeight] = useState<number>(0);

  const { messages, isStreaming, sendQuery, stopTextStream } = useStreamChat();

  // Capture initial viewport height on mount
  useLayoutEffect(() => {
    setInitialViewportHeight(window.innerHeight);
  }, []);

  // Clean effect to handle height calculation
  useLayoutEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;

    const userMessageElement = document.getElementById(lastMessage.id);
    if (userMessageElement) {
      const height = userMessageElement.offsetHeight;
      setUserMessageHeight(height);
    }
  }, [messages]);

  // Callback when AI container is ready
  const handleAIContainerReady = () => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;

    const userMessageElement = document.getElementById(lastMessage.id);
    if (userMessageElement && scrollContainerRef.current) {
      const elementRect = userMessageElement.getBoundingClientRect();
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const paddingFromTop = 10; // Adjust this value for desired padding

      const scrollTop = scrollContainerRef.current.scrollTop + elementRect.top - containerRect.top - paddingFromTop;
      scrollContainerRef.current.scrollTo({
        top: scrollTop,
        behavior: 'smooth',
      });
    }
  };

  // Calculate remaining height for AI message - Fix the dependency
  const calculateAIMessageHeight = useMemo(() => {
    if (userMessageHeight === 0) return 'auto';

    // Use screen height to get full screen size (ignores virtual keyboard completely)
    const viewportHeight = initialViewportHeight;
    const paddingBottom = 128; // pb-32 = 128px
    const additionalPadding = 24; // Your existing padding/margins
    const remainingHeight = viewportHeight - userMessageHeight - paddingBottom - additionalPadding;
    return Math.max(remainingHeight, 300);
  }, [userMessageHeight]);

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="nb-paper absolute bottom-0 left-0 overflow-y-scroll max-h-full scrollbar-thin top-0 w-full pb-32 pl-[8px] text-sm"
      >
        <div className="min-h-[calc(100dvh-10rem)] mx-auto max-w-4xl w-full top-0 relative ">
          <header className="mx-auto mb-3 mt-4 flex w-full max-w-3xl items-baseline justify-between gap-3 border-b border-border/70 pb-2">
            <span className="truncate font-mono text-xs text-muted-foreground">{t('chat_tips')}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">{today}</span>
          </header>
          <StreamChat aiMessageHeight={calculateAIMessageHeight} onAIContainerReady={handleAIContainerReady} />
        </div>
      </div>
      <MainTextArea sendQuery={sendQuery} stopTextStream={stopTextStream} isStreaming={isStreaming} />
    </>
  );
};
