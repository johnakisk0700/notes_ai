import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { ArrowUp, ImageIcon, Loader2Icon, Square, X } from 'lucide-react';
import AudioRecorder from './Common/AudioRecorder';
import { toast } from 'sonner';
import { api } from '@/integrations/api';
import { UserSelector } from './Admin/UserSelector';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { useStreamChat, type ChatImageAttachment } from '@/context/StreamChatContext';
import { ModelSelector } from './Chat/ModelSelector';
import { useTranslation } from 'react-i18next';
import { modelHasVision, type ChatModelId } from '@shared/ai/chatModels';

// Keep in step with the backend cap (services/chat-images.ts) — reject oversized files
// before base64-encoding so they never hit the wire / spike memory.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface MainTextAreaProps {
  sendQuery: (
    query: string,
    setQuery: (value: string) => void,
    selectedUsers: string[],
    image?: ChatImageAttachment | null
  ) => Promise<void>;
  stopTextStream: () => void;
  isStreaming: boolean;
}

/** A pending image attachment plus the local preview shown until it's sent. */
type PendingImage = ChatImageAttachment & { previewUrl: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** First image File in a clipboard/drag payload, or null. Screenshots arrive as image/png
 *  Blobs; copied web images may sit in `.files` or as a `.items` file entry. */
function imageFileFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const fromFiles = Array.from(dt.files ?? []).find(f => f.type.startsWith('image/'));
  if (fromFiles) return fromFiles;
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export const MainTextArea = ({ sendQuery, stopTextStream, isStreaming }: MainTextAreaProps) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { model, setModel, effort, setEffort } = useStreamChat();
  const [query, setQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [image, setImage] = useState<PendingImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAttachImages = modelHasVision(model);

  const clearImage = () => {
    setImage(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  // Switching to a model without vision drops a pending image — it can't be sent.
  const handleModelChange = (id: ChatModelId) => {
    setModel(id);
    if (!modelHasVision(id) && image) {
      clearImage();
      toast.info('Η εικόνα αφαιρέθηκε — το επιλεγμένο μοντέλο δεν βλέπει εικόνες.');
    }
  };

  const handleSendMessage = async () => {
    if (isStreaming || (!query.trim() && !image)) return;
    if (image && !canAttachImages) {
      toast.error('Διάλεξε μοντέλο με όραση για να στείλεις εικόνα.');
      return;
    }
    textareaRef.current?.blur(); // close the mobile keyboard
    const pending = image;
    if (pending) {
      URL.revokeObjectURL(pending.previewUrl);
      setImage(null);
    }
    await sendQuery(query, setQuery, selectedUsers, pending);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePickImage = () => fileInputRef.current?.click();

  // Shared by the file picker, paste, and drag-drop — validate then upload one image File.
  const uploadImageFile = async (file: File) => {
    if (!canAttachImages) {
      toast.error('Διάλεξε μοντέλο με όραση για να επισυνάψεις εικόνα.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Το αρχείο δεν είναι εικόνα.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Η εικόνα είναι πολύ μεγάλη (μέγιστο 8MB).');
      return;
    }
    try {
      setIsUploading(true);
      const base64 = await fileToBase64(file);
      const { data } = await api.post('/chat-image', { image: { content: base64 }, mediaType: file.type });
      clearImage(); // one image per message — replace any previous
      setImage({
        id: data.id,
        url: data.url,
        mediaType: data.mediaType,
        filename: file.name || 'pasted-image', // pasted screenshots have no filename
        previewUrl: URL.createObjectURL(file),
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error uploading image:', error);
      toast.error('Αποτυχία μεταφόρτωσης εικόνας.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user re-pick the same file
    if (file) void uploadImageFile(file);
  };

  // Ctrl/Cmd+V a screenshot or copied image straight into the composer.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = imageFileFromDataTransfer(e.clipboardData);
    if (file) {
      e.preventDefault(); // don't also drop the image's path/markup into the text
      void uploadImageFile(file);
    }
  };

  // Drag an image file onto the composer.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const file = imageFileFromDataTransfer(e.dataTransfer);
    if (file) {
      e.preventDefault();
      void uploadImageFile(file);
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
      if (import.meta.env.DEV) console.error('Error transcribing audio:', error);
      toast.error('Failed to transcribe audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="absolute bottom-0 right-0 left-0 flex justify-center px-3">
      <div
        className="relative w-[45rem] max-w-full rounded-t-2xl border border-b-0 border-border bg-card/95 px-4 pt-3.5 pb-2 backdrop-blur-md transition-colors focus-within:border-primary/40"
        style={{
          boxShadow:
            '0 -10px 28px -18px rgba(0,0,0,0.55), inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 7%, transparent)',
        }}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {image ? (
          <div className="mb-2 flex">
            <div className="relative">
              <img
                src={image.previewUrl}
                alt={image.filename ?? 'attachment'}
                className="max-h-24 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Αφαίρεση εικόνας"
                className="absolute -top-1.5 -right-1.5 rounded-full border border-border bg-card p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}

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
            onPaste={handlePaste}
          />
        </div>

        <div className="mt-1.5 flex w-full items-center gap-2 border-t border-border/60 pb-1.5 pt-2">
          <ModelSelector value={model} onChange={handleModelChange} effort={effort} onEffortChange={setEffort} />
          {isAdmin ? <UserSelector selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} /> : null}
          <div className="flex gap-2 items-center ml-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleImageSelected}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handlePickImage}
              disabled={!canAttachImages || isUploading || isStreaming}
              title={canAttachImages ? 'Επισύναψη εικόνας' : 'Διάλεξε μοντέλο με όραση για εικόνες'}
              className="rounded-full size-9"
            >
              {isUploading ? <Loader2Icon className="size-4 animate-spin" /> : <ImageIcon className="size-4.5" />}
            </Button>
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
