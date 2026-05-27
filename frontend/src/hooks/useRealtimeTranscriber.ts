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

  // Tell OpenAI HOW we want the session to behave
  dc.addEventListener('open', () =>
    dc.send(
      JSON.stringify({
        type: 'transcription_session.update',
        session: {
          input_audio_transcription: {
            model: 'gpt-4o-transcribe',
            prompt: '',
            language: 'el',
          },
          turn_detection: {
            type: 'server_vad',
            prefix_padding_ms: 400,
            silence_duration_ms: 650,
          },
          input_audio_noise_reduction: {
            type: 'near_field',
          },
          // uncomment for more metadata
          // include: ['item.input_audio_transcription.logprobs'],
        },
      })
    )
  );

  // 4. SDP offer/answer
  await pc.setLocalDescription(await pc.createOffer());

  const resp = await fetch('https://api.openai.com/v1/realtime?intent=transcription', {
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
