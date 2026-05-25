import { useState, useRef } from 'react';
import { Button } from './ui/button';
import { ArrowUp, Square } from 'lucide-react';
import AudioRecorder from './Common/AudioRecorder';
import { toast } from 'sonner';
import { api } from '@/integrations/api';
import { UserSelector } from './Admin/UserSelector';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { useTranslation } from 'react-i18next';

interface MainTextAreaProps {
  sendQuery: (query: string, setQuery: any, selectedUsers: string[]) => Promise<void>;
  stopTextStream: () => void;
  isStreaming: boolean;
}

export const MainTextArea = ({ sendQuery, stopTextStream, isStreaming }: MainTextAreaProps) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
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
      <div className="w-[45rem] max-w-full relative rounded-lg rounded-b-none p-3 pb-1 backdrop-blur-md bg-primary/5 border-2 border-b-0 border-primary/25">
        <textarea
          ref={textareaRef}
          placeholder={t('ask_anything')}
          id="main_textarea"
          className="px-1 w-full bg-transparent rounded-xl resize-none border-none focus:border-none outline-none focus:outline-none"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="w-full pb-1.5 pt-0.5 flex gap-2">
          {isAdmin ? <UserSelector selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} /> : null}
          <div className="flex gap-2 items-center ml-auto">
            <AudioRecorder onTranscriptionComplete={handleRecordingComplete} isTranscribing={isTranscribing} />
            {!isStreaming ? (
              <Button className="size-8.5 rounded-lg" onClick={handleSendMessage}>
                <ArrowUp />
              </Button>
            ) : (
              <Button className="size-8.5 rounded-lg" onClick={stopTextStream}>
                <Square />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
