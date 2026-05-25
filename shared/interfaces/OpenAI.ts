export interface OpenAIEphemeralTokenResponse {
  session_id: string;
  token: string;
  expires_at: string;
}

export interface OpenAITranscriptionSessionRequest {
  input_audio_format: "pcm16";
  input_audio_transcription: {
    model: "gpt-4o-transcribe";
  };
  turn_detection: {
    type: "server_vad";
  };
}

export interface OpenAITranscriptionSessionResponse {
  id: string;
  client_secret: {
    value: string;
    expires_at: string;
  };
}
