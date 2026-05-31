import { useRealtimeTranscriber } from '@/hooks/useRealtimeTranscriber';
import { cn } from '@/lib/utils';
import { Loader2Icon, MicIcon, Square } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../ui/button';

interface RealtimeAudioRecorderProps {
  onStreamingText?: (text: string) => void;
  onFinalText?: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  className?: string;
  [key: string]: any;
}

export const RealtimeAudioRecorder = ({
  onStreamingText,
  onFinalText,
  onRecordingChange,
  className,
  ...props
}: RealtimeAudioRecorderProps) => {
  const { isConnecting, isRecording, streamingTranscript, finalTranscript, startRecording, stopRecording } =
    useRealtimeTranscriber();

  // Handle streaming updates
  useEffect(() => {
    if (streamingTranscript && onStreamingText) {
      onStreamingText(streamingTranscript);
    }
  }, [streamingTranscript, onStreamingText]);

  // Handle final transcript
  useEffect(() => {
    if (finalTranscript && onFinalText) {
      onFinalText(finalTranscript);
    }
  }, [finalTranscript, onFinalText]);

  // Let the parent react to start/stop (e.g. commit a leftover interim on stop).
  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  const isLoading = isConnecting;
  const showStopButton = isRecording;

  return (
    <Button
      onClick={showStopButton ? stopRecording : startRecording}
      variant="outline"
      disabled={isLoading}
      className={cn('rounded-full size-9', className)}
      {...props}
    >
      {isLoading ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : showStopButton ? (
        <Square className="size-4" />
      ) : (
        <MicIcon className="size-4" />
      )}
    </Button>
  );
};
