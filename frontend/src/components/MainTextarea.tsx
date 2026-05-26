import { useState, useRef } from 'react';
import { Button } from './ui/button';
import { ArrowUp, Square } from 'lucide-react';
import AudioRecorder from './Common/AudioRecorder';
import { toast } from 'sonner';
import { api } from '@/integrations/api';
import { UserSelector } from './Admin/UserSelector';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { useStreamChat } from '@/context/StreamChatContext';
import { ModelSelector } from './Chat/ModelSelector';
import { EffortSelector } from './Chat/EffortSelector';
import { supportsReasoning } from '@shared/ai/chatModels';
import { useTranslation } from 'react-i18next';

interface MainTextAreaProps {
  sendQuery: (query: string, setQuery: any, selectedUsers: string[]) => Promise<void>;
  stopTextStream: () => void;
  isStreaming: boolean;
}

export const MainTextArea = ({ sendQuery, stopTextStream, isStreaming }: MainTextAreaProps) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { model, setModel, effort, setEffort } = useStreamChat();
  const [query, setQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = async () => {
    if (query.trim() && !isStreaming) {
      // Blur the textarea to close the keyboard
      textareaRef.current?.blur();
      await sendQuery(query, setQuery, selectedUsers);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRecordingComplete = async base64Audio => {
    try {
      setIsTranscribing(true);
      const request = {
        audio: {
          content: base64Audio, // The base64-encoded audio content
        },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000, // Adjust based on your recording
          languageCode: 'en-US', // Adjust based on your needs
        },
      };

      const { data } = await api.post('/get-transcription', request);
      setQuery(prev => prev + data.transcript);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast.error('Failed to transcribe audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="absolute bottom-0 right-0 left-0 flex justify-center">
      <div
        className="relative w-[45rem] max-w-full rounded-t-lg bg-background/90 p-3 pb-1 backdrop-blur-md"
        style={{ boxShadow: '0 -4px 16px -14px color-mix(in srgb, var(--primary) 22%, transparent)' }}
      >
        <div className="flex items-start gap-2">
          <span className="font-mono text-sm leading-5 text-primary/70 select-none" aria-hidden>
            ❯
          </span>
          <textarea
            ref={textareaRef}
            placeholder={t('ask_anything')}
            id="main_textarea"
            className="w-full resize-none border-none bg-transparent font-sans text-sm outline-none placeholder:text-muted-foreground focus:border-none focus:outline-none"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="w-full pb-1.5 pt-0.5 flex items-center gap-2">
          <ModelSelector value={model} onChange={setModel} />
          {supportsReasoning(model) ? <EffortSelector value={effort} onChange={setEffort} /> : null}
          {isAdmin ? <UserSelector selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} /> : null}
          <div className="flex gap-2 items-center ml-auto">
            <AudioRecorder onTranscriptionComplete={handleRecordingComplete} isTranscribing={isTranscribing} />
            {!isStreaming ? (
              <Button className="size-8.5 rounded-md" onClick={handleSendMessage}>
                <ArrowUp />
              </Button>
            ) : (
              <Button className="size-8.5 rounded-md" onClick={stopTextStream}>
                <Square />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
