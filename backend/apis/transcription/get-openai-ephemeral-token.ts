// Mints a short-lived OpenAI Realtime *client secret* the browser uses to open a
// WebRTC transcription session directly — the real OPENAI_API_KEY never leaves the
// server. GA Realtime API: POST /v1/realtime/client_secrets (the old beta
// /realtime/transcription_sessions endpoint was removed and now 404s).
export const getOpenAIEphemeralToken = async (req, res) => {
  const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "transcription",
        audio: {
          input: {
            // Newest low-latency streaming STT. It streams continuously and does NOT
            // support turn_detection; the browser sets language + latency via session.update.
            transcription: { model: "gpt-realtime-whisper" },
          },
        },
      },
    }),
  });

  if (!r.ok) return res.status(r.status).send(await r.text());

  const s = await r.json();
  // GA response shape: { value: "ek_…", expires_at, session: { id, … } }
  res.json({
    session_id: s.session?.id ?? "",
    token: s.value,
    expires_at: s.expires_at,
  });
};
