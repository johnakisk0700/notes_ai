import { useStreamChat } from '@/context/StreamChatContext';
import type { Message } from '@/hooks/useStreamChat_old';
import { cn } from '@/lib/utils';
import { Check, CopyIcon, EditIcon, RefreshCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { CustomMarkdown } from './CustomMarkdown';

interface ChatMessageProps {
  message: Message;
  style?: React.CSSProperties;
}

interface MessageActionsProps {
  content: string;
  messageId: string;
}

export const ChatMessage = ({ message, style }: ChatMessageProps) => {
  const { isUser, id, content } = message;
  if (isUser) return <UserMessage message={message} style={style} />;
  return <AIMessage content={content} messageId={id} style={style} />;
};

const UserMessage = ({ message, style }: { message: Message; style?: React.CSSProperties }) => {
  const { isUser, id, content } = message;

  const [editMode, setEditMode] = useState(false);
  const [newContent, setNewContent] = useState(content);
  const { editMessage } = useStreamChat();
  const outerCss = 'flex items-center self-end w-fit max-w-[90%] gap-2';
  if (editMode)
    return (
      <div className={cn(outerCss, 'w-full flex-col')}>
        <textarea
          className="bg-primary/10 p-2.5 rounded-lg focus-visible:border-0 outline-none resize-none w-full h-full"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
        />
        <div className="w-fit flex gap-2 self-end">
          <Button
            variant="ghost"
            className="block"
            onClick={() => {
              editMessage({
                ...message,
                content: newContent,
                timestamp: new Date(),
              });
              setEditMode(false);
            }}
          >
            <Check />
          </Button>
          <Button variant="ghost" className="block" onClick={() => setEditMode(false)}>
            <X />
          </Button>
        </div>
      </div>
    );
  return (
    <div className={outerCss} id={message.id}>
      <UserMessageActions setEditMode={setEditMode} />
      <div className="bg-primary/10 p-2.5 rounded-lg">{content}</div>
    </div>
  );
};

const AIMessage = ({
  content,
  messageId,
  style,
}: {
  content: string;
  messageId: string;
  style?: React.CSSProperties;
}) => {
  return (
    <div style={style} id={messageId}>
      <div className="prose prose-sm max-w-none">
        <CustomMarkdown>{content}</CustomMarkdown>
      </div>
      <AiMessageActions content={content} messageId={messageId} />
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
    <div className="flex gap-1 mt-2 text-foreground/50">
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        {copied ? <Check /> : <CopyIcon />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => retryMessage(messageId)}>
        <RefreshCcw />
      </Button>
    </div>
  );
};

const UserMessageActions = ({ setEditMode }) => {
  return (
    <div className="text-foreground/50">
      <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
        <EditIcon />
      </Button>
    </div>
  );
};
