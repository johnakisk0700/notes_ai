import { StreamChat } from '@/components/Chat/StreamChat';
import { MainTextArea } from '@/components/MainTextarea';
import { useStreamChat } from '@/context/StreamChatContext';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

export const MainChatPage: React.FC = () => {
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
    const scroller = scrollContainerRef.current;
    if (!userMessageElement || !scroller) return;

    // Align the question's top with the sidebar toggle, so it lines up with the
    // floating header controls (the see-through header sits over the conversation).
    const toggle = document.querySelector('[data-sidebar="trigger"]');
    const targetTop = toggle ? toggle.getBoundingClientRect().top : scroller.getBoundingClientRect().top + 10;
    const elementTop = userMessageElement.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + elementTop - targetTop, behavior: 'smooth' });
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
          <StreamChat aiMessageHeight={calculateAIMessageHeight} onAIContainerReady={handleAIContainerReady} />
        </div>
      </div>
      <MainTextArea sendQuery={sendQuery} stopTextStream={stopTextStream} isStreaming={isStreaming} />
    </>
  );
};
