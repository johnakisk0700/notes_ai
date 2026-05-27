import { useStreamChat } from '@/context/StreamChatContext';
import type { AppUIMessage } from '@/context/StreamChatContext';
import { Check, CopyIcon, EditIcon, RefreshCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { CustomMarkdown } from './CustomMarkdown';
import { ReasoningCard } from './ReasoningCard';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ToolCallCard } from './ToolCallCard';

interface ChatMessageProps {
  message: AppUIMessage;
  style?: React.CSSProperties;
  // True for the in-flight assistant reply that hasn't started streaming text yet
  // (initial wait / tool calls / between-step gaps) — render the thinking indicator.
  thinking?: boolean;
}

interface MessageActionsProps {
  content: string;
  messageId: string;
  metadata?: unknown;
}

/** Concatenated text of a message's text parts. */
function textOf(message: AppUIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('');
}

interface AnswerMeta {
  model?: string;
  costEur?: number;
}

/** "qwen3.6-plus · €0.0018" from the message metadata, or null if unavailable. */
function answerBadge(metadata: unknown): string | null {
  const m = metadata as AnswerMeta | undefined;
  if (!m?.model) return null;
  const model = m.model.includes('/') ? m.model.split('/').pop()! : m.model;
  const cost = typeof m.costEur === 'number' ? ` · €${m.costEur.toFixed(4)}` : '';
  return `${model}${cost}`;
}

export const ChatMessage = ({ message, style, thinking }: ChatMessageProps) => {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AIMessage message={message} style={style} thinking={thinking} />;
};

const UserMessage = ({ message }: { message: AppUIMessage }) => {
  const content = textOf(message);

  const [editMode, setEditMode] = useState(false);
  const [newContent, setNewContent] = useState(content);
  const { editMessage } = useStreamChat();

  if (editMode)
    return (
      <div className="flex w-full flex-col items-end gap-2 self-end">
        <textarea
          className="w-full resize-none rounded-md border border-border bg-card/60 p-2.5 text-sm outline-none focus-visible:border-primary/60"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
        />
        <div className="flex gap-1 self-end">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              editMessage(message.id, newContent);
              setEditMode(false);
            }}
          >
            <Check />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => setEditMode(false)}>
            <X />
          </Button>
        </div>
      </div>
    );

  // A soft ink wash keeps the question distinct without turning it into a
  // heavy chat bubble; UI sans contrasts with Lexi's serif reply.
  return (
    <div className="group flex w-fit max-w-[85%] items-start gap-1 self-end" id={message.id}>
      <UserMessageActions setEditMode={setEditMode} />
      <div
        data-chat-user-content
        className="whitespace-pre-wrap rounded-md border-primary/80 bg-primary/60 py-1 pl-3 pr-3 text-sm font-medium leading-5 text-foreground/95"
      >
        {content}
      </div>
    </div>
  );
};

const AIMessage = ({
  message,
  style,
  thinking,
}: {
  message: AppUIMessage;
  style?: React.CSSProperties;
  thinking?: boolean;
}) => {
  return (
    <div style={style} id={message.id}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <div key={i} className="chat-md max-w-none">
              <CustomMarkdown>{part.text}</CustomMarkdown>
            </div>
          );
        }
        // Tool calls (tool-search_notes, tool-list_recent_notes, …) → collapsible card.
        if (part.type.startsWith('tool-')) {
          return <ToolCallCard key={i} part={part} />;
        }
        // The model's reasoning (when the provider streams it) → quiet disclosure.
        if (part.type === 'reasoning') {
          return <ReasoningCard key={i} part={part} />;
        }
        return null;
      })}
      {/* While still thinking there's nothing to copy/retry yet — show the indicator instead. */}
      {thinking ? (
        <ThinkingIndicator />
      ) : (
        <AiMessageActions content={textOf(message)} messageId={message.id} metadata={message.metadata} />
      )}
    </div>
  );
};

const AiMessageActions = ({ content, messageId, metadata }: MessageActionsProps) => {
  const [copied, setCopied] = useState(false);
  const { retryMessage } = useStreamChat();

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  const badge = answerBadge(metadata);

  return (
    <div className="mt-1.5 flex items-center gap-0.5 text-muted-foreground">
      <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
        {copied ? <Check className="text-primary" /> : <CopyIcon />}
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => retryMessage(messageId)}>
        <RefreshCcw />
      </Button>
      {/* Muted model + cost stamp — just visible, grouped with the answer's footer. */}
      {badge ? (
        <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/60">{badge}</span>
      ) : null}
    </div>
  );
};

const UserMessageActions = ({ setEditMode }: { setEditMode: (v: boolean) => void }) => {
  return (
    <div className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
      <Button variant="ghost" size="icon-xs" onClick={() => setEditMode(true)}>
        <EditIcon />
      </Button>
    </div>
  );
};
