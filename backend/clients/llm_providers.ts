// Provider registry for the AI SDK chat path. Everything is OpenAI-compatible, so
// each provider is just a base URL + key on the AI SDK provider packages.
//
// Default chat model resolution:
//   - Qwen3.6-Plus via OpenRouter when OPENROUTER_API_KEY is set (the intended default —
//     see docs/rag-execution-plan.md), else
//   - gpt-5-mini on the existing OPENAI_API_KEY, so chat keeps working with zero new env.
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { ModelNames } from "services/ai/ai_models";
import type { ChatModelId } from "@shared/ai/chatModels";

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
  // No OpenRouter key → always OpenAI fallback, regardless of `preferred`.
  if (!openrouterProvider || preferred === "gpt-5-mini") {
    return { model: openaiProvider("gpt-5-mini"), id: "gpt-5-mini" };
  }
  const id = preferred ?? "qwen/qwen3.6-plus";
  return { model: openrouterProvider(id), id };
}
