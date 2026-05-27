import { StreamChat } from '@/components/Chat/StreamChat';
import { MainTextArea } from '@/components/MainTextarea';
import { useStreamChat } from '@/context/StreamChatContext';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

const QUESTION_OPTICAL_NUDGE_PX = 1;

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

    const alignQuestionToToggle = () => {
      const userMessageElement = document.getElementById(lastMessage.id);
      const scroller = scrollContainerRef.current;
      if (!userMessageElement || !scroller) return;

      const toggle = document.querySelector('[data-sidebar="trigger"]');
      const questionContent = userMessageElement.querySelector<HTMLElement>('[data-chat-user-content]');
      const questionBounds = (questionContent ?? userMessageElement).getBoundingClientRect();
      const toggleBounds = toggle?.getBoundingClientRect();
      const offset = toggleBounds
        ? questionBounds.top +
          Math.min(questionBounds.height, toggleBounds.height) / 2 -
          (toggleBounds.top + toggleBounds.height / 2 + QUESTION_OPTICAL_NUDGE_PX)
        : questionBounds.top - (scroller.getBoundingClientRect().top + 10);
      if (Math.abs(offset) > 0.5) {
        scroller.scrollTo({ top: scroller.scrollTop + offset, behavior: 'smooth' });
      }
    };

    // Preserve the glide into place while giving freshly mounted placeholders
    // one extra frame to settle before confirming the same destination.
    alignQuestionToToggle();
    requestAnimationFrame(alignQuestionToToggle);
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
        className="nb-paper absolute bottom-0 left-0 top-0 max-h-full w-full overflow-y-scroll pb-32 text-sm [overflow-anchor:none] scrollbar-thin"
      >
        <div className="min-h-[calc(100dvh-10rem)] mx-auto max-w-2xl w-full top-0 relative">
          <StreamChat aiMessageHeight={calculateAIMessageHeight} onAIContainerReady={handleAIContainerReady} />
        </div>
      </div>
      <MainTextArea sendQuery={sendQuery} stopTextStream={stopTextStream} isStreaming={isStreaming} />
    </>
  );
};
