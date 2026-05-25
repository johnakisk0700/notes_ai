import fs from "fs";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { AppError } from "middleware/common/AppError";
import { openai } from "clients/openai_client";

export const getTranscription = async (req, res, next) => {
  const base64Audio = req.body.audio?.content;

  if (!base64Audio) {
    return next(
      new AppError({ message: "No audio data provided", statusCode: 400 })
    );
  }

  const audioBuffer = Buffer.from(base64Audio, "base64");
  const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);
  fs.writeFileSync(tempFilePath, audioBuffer);

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(tempFilePath),
    model: "gpt-4o-mini-transcribe",
    language: "el",
    prompt:
      "Το κείμενο μπορεί να περιέχει Αγγλικές λέξεις όπως brand names (π.χ. Coca-Cola, Margot, iPhone).",
  });

  fs.unlinkSync(tempFilePath); // καθαρισμός

  res.status(200).json({ transcript: transcription.text });
};
