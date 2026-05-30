import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { useStreamChat } from '@/context/StreamChatContext';
import { useNoteEditor } from '@/context/NoteEditorContext';
import { PageRule } from '../Common/PageRule';
import { useTranslation } from 'react-i18next';

// A draft_note tool result means "open this draft in the editor". Fire openWithDraft once
// per tool call, and ONLY for drafts produced in the live turn (isStreaming) — a draft part
// rehydrated from thread history is marked handled without reopening the editor.
function useDraftNoteAutoOpen(
  messages: ReturnType<typeof useStreamChat>['messages'],
  isStreaming: boolean,
  threadId: string | undefined
) {
  const { openWithDraft } = useNoteEditor();
  const handledRef = useRef<Set<string>>(new Set());

  // StreamChat stays mounted across thread switches, so reset the dedupe set per thread —
  // otherwise it would grow unbounded and could suppress a draft in a newly viewed thread.
  useEffect(() => {
    handledRef.current = new Set();
  }, [threadId]);

  useEffect(() => {
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      for (const part of m.parts) {
        if (part.type !== 'tool-draft_note') continue;
        const p = part as { toolCallId?: string; state?: string; output?: { title?: string; content?: string } };
        if (p.state !== 'output-available' || !p.output) continue;
        // Drafts always carry a toolCallId; without one we can't dedupe safely, so skip it.
        if (!p.toolCallId) continue;
        if (handledRef.current.has(p.toolCallId)) continue;
        handledRef.current.add(p.toolCallId);
        if (isStreaming) openWithDraft({ title: p.output.title ?? '', content: p.output.content ?? '' });
      }
    }
  }, [messages, isStreaming, openWithDraft]);
}

interface StreamChatProps {
  aiMessageHeight: number | 'auto';
  onAIContainerReady?: () => void;
}

export const StreamChat = ({ aiMessageHeight, onAIContainerReady }: StreamChatProps) => {
  const { messages, isStreaming, threadId } = useStreamChat();
  const { t } = useTranslation();
  useDraftNoteAutoOpen(messages, isStreaming, threadId);

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
    <div className="flex flex-col gap-3 px-3 pb-1.5 md:pl-11.5 lg:pl-0">
      <PageRule
        label={t('chat_tips')}
        className="mb-3 mt-0 h-14"
        contentClassName="h-full items-center pb-0"
        hideLabelOnMobile
        uppercaseLabel={false}
      />
      {messages.map((message, i) => {
        const isLast = i === messages.length - 1;
        return (
          <ChatMessage
            message={message}
            key={message.id}
            minHeight={isLast && message.role !== 'user' ? aiMessageHeight : undefined}
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
