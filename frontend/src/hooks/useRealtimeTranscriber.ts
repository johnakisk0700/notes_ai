import { api } from '@/integrations/api';
import type { OpenAIEphemeralTokenResponse } from '@shared/interfaces/OpenAI';
import { useCallback, useState, useRef, useEffect } from 'react';

export const useRealtimeTranscriber = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [streamingTranscript, setStreamingTranscript] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);

  const startRecording = useCallback(async () => {
    if (isConnecting || isRecording) return;

    setIsConnecting(true);

    try {
      const connection = await connectToOpenAIRTC(setFinalTranscript, setStreamingTranscript);
      pcRef.current = connection;
      setIsRecording(true);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to start recording:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isRecording]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setIsRecording(false);
    setStreamingTranscript(''); // Clear streaming transcript when stopping
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, []);

  return {
    isConnecting,
    isRecording,
    finalTranscript,
    streamingTranscript,
    startRecording,
    stopRecording,
  };
};

const connectToOpenAIRTC = async (
  onFinalTranscript: (t: string) => void,
  onStreamingTranscript: (t: string) => void
): Promise<RTCPeerConnection> => {
  // 1. fetch ephemeral token from your backend
  const { data } = await api.get<OpenAIEphemeralTokenResponse>('get-openai-ephemeral-token');
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  // 2. add microphone
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(stream.getTracks()[0]);

  // 3. create DataChannel for events
  const dc = pc.createDataChannel('oai-events');

  /** buffer for "typing…" style updates */
  let partial = '';

  dc.addEventListener('message', e => {
    try {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        // streaming user STT (partial updates as you speak)
        case 'conversation.item.input_audio_transcription.delta':
          partial += msg.delta
            .replace(/<\|.*?\|>/g, '') // remove <|...|> tokens
            .replace(/^@/, ''); // remove leading @ if any;
          onStreamingTranscript(partial);
          break;

        // final user STT (complete sentence after VAD detection)
        case 'conversation.item.input_audio_transcription.completed':
          partial = ''; // reset for next utterance
          onStreamingTranscript(''); // clear streaming transcript
          onFinalTranscript(msg.transcript); // full sentence
          break;
      }
    } catch {
      if (import.meta.env.DEV) console.warn('non-JSON message', e.data);
    }
  });

  // Configure the transcription session once the channel opens (GA Realtime API shape).
  dc.addEventListener('open', () =>
    dc.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              // gpt-realtime-whisper streams continuously — it rejects turn_detection/VAD.
              transcription: {
                model: 'gpt-realtime-whisper',
                language: 'el',
                delay: 'minimal', // controllable latency — as real-time as possible
              },
            },
          },
        },
      })
    )
  );

  // 4. SDP offer/answer
  await pc.setLocalDescription(await pc.createOffer());

  const resp = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: pc.localDescription!.sdp,
    headers: {
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/sdp',
    },
  });

  await pc.setRemoteDescription({
    type: 'answer',
    sdp: await resp.text(),
  });

  return pc;
};
