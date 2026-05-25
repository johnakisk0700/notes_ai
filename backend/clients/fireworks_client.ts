import { FireworksAI } from "@fireworksai/sdk";

export const fireworksClient = new FireworksAI({
  apiKey: process.env.FIREWORKS_API_KEY,
});
