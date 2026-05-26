import { useStreamChat } from '@/context/StreamChatContext';
import type { AppUIMessage } from '@/context/StreamChatContext';
import { Check, CopyIcon, EditIcon, RefreshCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { CustomMarkdown } from './CustomMarkdown';
import { ToolCallCard } from './ToolCallCard';

interface ChatMessageProps {
  message: AppUIMessage;
  style?: React.CSSProperties;
}

interface MessageActionsProps {
  content: string;
  messageId: string;
}

/** Concatenated text of a message's text parts. */
function textOf(message: AppUIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('');
}

export const ChatMessage = ({ message, style }: ChatMessageProps) => {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AIMessage message={message} style={style} />;
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

  // The question: no bubble — just the one approved skeuomorphic touch, an ink
  // margin rule down its left edge, set in the UI sans (vs. Lexi's serif reply).
  return (
    <div className="group flex w-fit max-w-[85%] items-start gap-1 self-end" id={message.id}>
      <UserMessageActions setEditMode={setEditMode} />
      <div className="whitespace-pre-wrap border-l-2 border-primary py-0.5 pl-2.5 text-sm text-foreground/90">
        {content}
      </div>
    </div>
  );
};

const AIMessage = ({ message, style }: { message: AppUIMessage; style?: React.CSSProperties }) => {
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
        return null;
      })}
      <AiMessageActions content={textOf(message)} messageId={message.id} />
    </div>
  );
};

const AiMessageActions = ({ content, messageId }: MessageActionsProps) => {
  const [copied, setCopied] = useState(false);
  const { retryMessage } = useStreamChat();

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="mt-1.5 flex gap-0.5 text-muted-foreground">
      <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
        {copied ? <Check className="text-primary" /> : <CopyIcon />}
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => retryMessage(messageId)}>
        <RefreshCcw />
      </Button>
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
