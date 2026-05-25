import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite-preview-02-05",
  systemInstruction:
    `You will receive transcription texts in greek that has alcoholic beverages, wines and company names written phonetically in greek (originally French or English). 
    For each entity, find the name in its original language (French or English) and replace it in the text given (e.g. μοετ -> Moët, μπαρ ονο -> Barono). 
    Do not include any extra commentary; it very important you only output the fixed sentences.`
      .replace(/\s*\r?\n\s*/g, " ")
      .trim(),
});

const generationConfig = {
  temperature: 0.5,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 4096,
  responseMimeType: "text/plain",
};

export const flash2liteTranscriptionFix = model.startChat({
  generationConfig,
  history: [],
});
