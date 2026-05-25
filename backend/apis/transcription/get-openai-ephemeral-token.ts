export const getOpenAIEphemeralToken = async (req, res) => {
  const r = await fetch(
    "https://api.openai.com/v1/realtime/transcription_sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        input_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-transcribe" },
        turn_detection: { type: "server_vad" },
      }),
    }
  );

  if (!r.ok) return res.status(r.status).send(await r.text());

  const s = await r.json();
  // send the short-lived token & session id to the browser
  res.json({
    session_id: s.id,
    token: s.client_secret.value,
    expires_at: s.client_secret.expires_at,
  });
};
