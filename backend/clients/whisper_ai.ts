import { openai } from "./openai_client.js";

/**
 *
 * @param {string} base64Audio
 * @param {string} _language
 * @param {string} _prompt
 * @returns
 */
export async function askWhisperAI(base64Audio, _language, _prompt) {
  // Convert base64 to Buffer
  const base64Data = base64Audio.split(";base64,").pop();
  const buffer = Buffer.from(base64Data, "base64");

  // Create a File object from the buffer
  const audioFile = new File([buffer], "audio.wav", { type: "audio/wav" });
  const config = {
    file: audioFile,
    model: "whisper-1",
    language: _language,
    // prompt: _prompt,
    temperature: 0.25, // Controls randomness
  };
  return (await openai.audio.transcriptions.create(config)).text;
}
