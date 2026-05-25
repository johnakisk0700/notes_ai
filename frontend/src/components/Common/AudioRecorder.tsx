import { cn } from '@/lib/utils';
import { Loader2Icon, MicIcon, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';

const AudioRecorder = ({ onTranscriptionComplete, isTranscribing = false, ...props }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const mediaRecorderOptions = { mimeType: 'audio/mp4' };
  let mediaBlobFormat = 'audio/mp4';

  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    // audio/webm;codecs=opus is not supported on ios
    mediaRecorderOptions.mimeType = 'audio/webm;codecs=opus';
    mediaBlobFormat = 'audio/webm';
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      mediaRecorder.current = new MediaRecorder(stream, mediaRecorderOptions);
      chunks.current = [];

      mediaRecorder.current.ondataavailable = e => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        const blob = await convertAudioToMono(new Blob(chunks.current, { type: mediaBlobFormat }));

        // Convert blob to base64 using FileReader
        const base64Audio = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => {
            // Type cast result to string since we know readAsDataURL returns a string
            const result = reader.result as string;
            // Remove the data URL prefix (data:audio/webm;base64,)
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });

        console.log('Base64 size in MB:', base64Audio.length / (1024 * 1024));

        onTranscriptionComplete(base64Audio);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error('Error accessing microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  if (!isRecording)
    return (
      <Button
        onClick={startRecording}
        variant="outline"
        {...props}
        className={cn(`rounded-full size-9`, props.className)}
      >
        {!isTranscribing ? <MicIcon className="size-4.5" /> : <Loader2Icon className="size-4 animate-spin" />}
      </Button>
    );
  return (
    <Button onClick={stopRecording} variant="outline" {...props} className={cn(`rounded-full size-9`, props.className)}>
      <Square />
    </Button>
  );
};

async function convertAudioToMono(file: File | Blob): Promise<Blob> {
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Create offline context for processing
  const offlineContext = new OfflineAudioContext(1, audioBuffer.length, 16000);
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start();

  // Render audio
  const renderedBuffer = await offlineContext.startRendering();

  // Convert to WAV format
  const length = renderedBuffer.length * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  // Write audio data
  const data = new Float32Array(renderedBuffer.getChannelData(0));
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export default AudioRecorder;
