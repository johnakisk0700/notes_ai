export const textToVoice = async (req, res) => {
  const data = req.body;

  const voice = {
    languageCode: data.language === "el" ? "el-GR" : "en-US",
    name: data.language === "el" ? "el-GR-Wavenet-A" : "en-US-Neural2-F",
  };

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_VOICE_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: data.message },
        voice: voice,
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          pitch: 0,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Cloud API error:", {
      status: response.status,
      statusText: response.statusText,
      errorText,
    });
    throw new Error(`Failed to generate speech: ${errorText}`);
  }

  const { audioContent } = await response.json();
  if (!audioContent) {
    throw new Error("No audio content received from Google Cloud");
  }

  return res.status(200).json({
    audio: audioContent,
  });
};
