import { useStreamChat } from '@/context/StreamChatContext';
import type { AppUIMessage } from '@/context/StreamChatContext';
import { useAuthedImageUrl } from '@/integrations/useAuthedImageUrl';
import { Check, CopyIcon, EditIcon, ImageOff, RefreshCcw, X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { CustomMarkdown } from './CustomMarkdown';
import { NotePreviewCard } from './NotePreviewCard';
import { ReasoningCard } from './ReasoningCard';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ToolCallCard } from './ToolCallCard';

// Tool calls that get the rich note-preview card; every other tool stays on the chip.
// (tool-propose_note_edit / tool-draft_note are legacy names kept so old threads still render.)
const NOTE_ACTION_TOOLS = new Set([
  'tool-create_note',
  'tool-propose_edit',
  'tool-save_edit',
  'tool-edit_note', // legacy unified edit
  'tool-propose_note_edit', // legacy name
  'tool-draft_note', // legacy standalone draft
]);

interface ChatMessageProps {
  message: AppUIMessage;
  // Reserved height for the last assistant reply (a primitive, so React.memo can skip
  // prior messages — an inline style object would get a fresh identity every render).
  minHeight?: number | string;
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

type ImageFilePart = { type: 'file'; url: string; mediaType: string; filename?: string };

/** Image file parts attached to a (user) message. */
function imagePartsOf(message: AppUIMessage): ImageFilePart[] {
  return message.parts.filter(
    (p): p is ImageFilePart =>
      p.type === 'file' &&
      typeof (p as { mediaType?: string }).mediaType === 'string' &&
      (p as { mediaType: string }).mediaType.startsWith('image/')
  );
}

// A user's attached image. The bytes are behind a bearer-gated route, so fetch them via
// the authed hook (an <img> tag can't send the token) and show a skeleton / broken state.
const ChatImageThumb = ({ url, alt }: { url: string; alt?: string }) => {
  const { src, loading, error } = useAuthedImageUrl(url);
  if (error)
    return (
      <div
        title={alt ?? 'Image unavailable'}
        className="flex size-24 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"
      >
        <ImageOff className="size-5" />
      </div>
    );
  if (loading || !src) return <div className="size-24 animate-pulse rounded-md border border-border bg-muted/40" />;
  return (
    <img
      src={src}
      alt={alt ?? 'attachment'}
      className="max-h-48 max-w-[16rem] rounded-md border border-border object-cover"
    />
  );
};

interface AnswerMeta {
  model?: string;
  costEur?: number;
  // Lifecycle of a turn caught via polling (poll-first durability), folded into metadata when
  // the message comes from the persisted thread. Absent on a live-streaming message.
  status?: 'streaming' | 'complete' | 'error';
}

/** "qwen3.6-plus · €0.0018" from the message metadata, or null if unavailable. */
function answerBadge(metadata: unknown): string | null {
  const m = metadata as AnswerMeta | undefined;
  if (!m?.model) return null;
  const model = m.model.includes('/') ? m.model.split('/').pop()! : m.model;
  const cost = typeof m.costEur === 'number' ? ` · €${m.costEur.toFixed(4)}` : '';
  return `${model}${cost}`;
}

/** Turn lifecycle from the message metadata (poll-first durability), or undefined. */
function statusOf(metadata: unknown): AnswerMeta['status'] {
  return (metadata as AnswerMeta | undefined)?.status;
}

// Memoized so prior (non-streaming) messages don't re-render on every streaming tick.
// useChat keeps stable identities for finalized turns — only the streaming message updates —
// so memo skips them as long as props stay primitive (see `minHeight`).
export const ChatMessage = memo(({ message, minHeight, thinking }: ChatMessageProps) => {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AIMessage message={message} minHeight={minHeight} thinking={thinking} />;
});

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

  const images = imagePartsOf(message);

  // A soft ink wash keeps the question distinct without turning it into a
  // heavy chat bubble; UI sans contrasts with Lexi's serif reply. Attached images
  // sit above the text (or stand alone for an image-only turn).
  return (
    <div className="group flex w-full flex-col items-end gap-1.5" id={message.id}>
      {images.length > 0 ? (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {images.map((p, i) => (
            <ChatImageThumb key={i} url={p.url} alt={p.filename} />
          ))}
        </div>
      ) : null}
      {content ? (
        <div className="flex w-fit max-w-[85%] items-start gap-1 self-end">
          <UserMessageActions setEditMode={setEditMode} />
          <div
            data-chat-user-content
            className="whitespace-pre-wrap rounded-md border-primary/80 bg-primary/60 py-1 pl-3 pr-3 text-sm font-medium leading-5 text-foreground/95"
          >
            {content}
          </div>
        </div>
      ) : (
        <div className="flex self-end">
          <UserMessageActions setEditMode={setEditMode} />
        </div>
      )}
    </div>
  );
};

const AIMessage = ({
  message,
  minHeight,
  thinking,
}: {
  message: AppUIMessage;
  minHeight?: number | string;
  thinking?: boolean;
}) => {
  const { t } = useTranslation();
  // A turn caught mid-generation via polling (no live stream): keep the indicator going.
  // One that was cut short (lost connection / timeout) shows an interrupted note + retry.
  const status = statusOf(message.metadata);
  const streaming = thinking || status === 'streaming';
  const interrupted = !streaming && status === 'error';
  // The turn has finished (a clean/complete or errored turn, vs one still streaming). Tool cards
  // use this so a chip never stays on a spinner once the answer is in, even if the live overlay
  // left its part mid-state (see ToolCallCard / toolCallVisualState).
  const settled = !streaming;
  return (
    <div style={{ minHeight }} id={message.id}>
      {message.parts.map((part, i) => {
        // Stable key per part: tool parts keep their card instance (and its local state)
        // across re-renders even if earlier parts grow/shift; others fall back to index.
        const key = (part as { toolCallId?: string }).toolCallId ?? `${part.type}-${i}`;
        if (part.type === 'text') {
          return (
            <div key={key} className="chat-md max-w-none">
              <CustomMarkdown>{part.text}</CustomMarkdown>
            </div>
          );
        }
        // Note-action tools (create/edit/draft) → rich note preview; the rest → tool chip.
        if (part.type.startsWith('tool-')) {
          if (NOTE_ACTION_TOOLS.has(part.type))
            return <NotePreviewCard key={key} part={part} messageId={message.id} settled={settled} />;
          return <ToolCallCard key={key} part={part} settled={settled} />;
        }
        // The model's reasoning (when the provider streams it) → quiet disclosure.
        if (part.type === 'reasoning') {
          return <ReasoningCard key={key} part={part} settled={settled} />;
        }
        return null;
      })}
      {/* Still generating (live, or caught mid-generation by a poll) → indicator. Otherwise the
          copy/retry actions, prefixed by an interrupted note when the turn was cut short. */}
      {streaming ? (
        <ThinkingIndicator />
      ) : (
        <>
          {interrupted ? <p className="mt-1.5 text-xs text-muted-foreground/70">{t('chat_interrupted')}</p> : null}
          <AiMessageActions content={textOf(message)} messageId={message.id} metadata={message.metadata} />
        </>
      )}
    </div>
  );
};

const AiMessageActions = ({ content, messageId, metadata }: MessageActionsProps) => {
  const [copied, setCopied] = useState(false);
  const { retryMessage } = useStreamChat();
  // One reset timer at a time; cleared on rapid re-clicks and on unmount so it can't
  // fire setCopied after the component is gone.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  // Optional-chained + awaited: navigator.clipboard is undefined on non-secure-context
  // origins (HTTP over a LAN IP — our mobile case), so guard against the TypeError/rejection.
  const handleCopy = async () => {
    clearTimeout(resetTimerRef.current);
    try {
      await navigator.clipboard?.writeText(content);
      setCopied(true);
      resetTimerRef.current = setTimeout(() => setCopied(false), 1000);
    } catch {
      /* clipboard unavailable / denied — no-op */
    }
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
