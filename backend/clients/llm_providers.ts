// Provider registry for the AI SDK chat path. Everything is OpenAI-compatible, so
// each provider is just a base URL + key on the AI SDK provider packages.
//
// Default chat model resolution:
//   - DEFAULT_CHAT_MODEL (Qwen3.7-Max) via OpenRouter when OPENROUTER_API_KEY is set, else
//   - gpt-5.4-mini on the existing OPENAI_API_KEY, so chat keeps working (with vision) on zero new env.
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { ModelNames } from "services/ai/ai_models";
import { AI_MODELS } from "services/ai/ai_models";
import { DEFAULT_CHAT_MODEL, type ChatModelId } from "@shared/ai/chatModels";

const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Only instantiate OpenRouter when configured; absence flips the default to OpenAI.
const openrouterProvider = process.env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : null;

export interface ResolvedChatModel {
  model: LanguageModel;
  // Narrowed to ModelNames so calculateCompletionCost can index AI_MODELS.
  id: Extract<ModelNames, ChatModelId>;
}

export function resolveChatModel(preferred?: ChatModelId): ResolvedChatModel {
  // OpenAI-direct models (provider "gpt") always go through the OpenAI provider.
  if (preferred && AI_MODELS[preferred].provider === "gpt") {
    return { model: openaiProvider(preferred), id: preferred };
  }
  // No OpenRouter key → OpenAI fallback so chat keeps working with zero new env. gpt-5.4-mini
  // is the kept OpenAI selector model (vision-capable), so the fallback keeps image support too.
  if (!openrouterProvider) {
    return { model: openaiProvider("gpt-5.4-mini"), id: "gpt-5.4-mini" };
  }
  const id = preferred ?? DEFAULT_CHAT_MODEL;
  return { model: openrouterProvider(id), id };
}
