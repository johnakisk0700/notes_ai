import type Decimal from "decimal.js";
import { openai } from "../../clients/openai_client.js";
import { calculateCompletionCost } from "./ai_utils.js";
import type { ModelNames } from "./ai_models.js";
import { AI_MODELS } from "./ai_models.js";

interface Message {
  role: "system" | "assistant" | "user";
  content: string;
}

// Reasoning models (o-series, GPT-5 family) reject a custom `temperature` on the
// Responses API and instead accept a `reasoning.effort`. Detect them by id so we
// send the right params. "low" keeps titling fast and cheap.
const isReasoningModel = (model: string) => /^(o\d|gpt-5)/.test(model);

interface AiChatParams {
  model: ModelNames;
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
}

interface UnifiedAiResponse {
  content: string;
  rawResponse: unknown;
  inputCost: Decimal;
  outputCost: Decimal;
  totalCost: Decimal;
}

// Single-shot (non-streaming) OpenAI completion. The agentic chat path lives in
// services/ai/agentic-rag.ts on the Vercel AI SDK; this only backs note titling
// (apis/notes/get-note-title.ts), which always selects an OpenAI model.
export async function getAiChatResponse({
  model = "gpt-5-mini",
  messages,
  systemPrompt,
  maxTokens = 8000,
}: AiChatParams): Promise<UnifiedAiResponse> {
  const provider = AI_MODELS[model].provider;
  if (provider !== "gpt") {
    throw new Error(`getAiChatResponse only supports OpenAI models; got provider "${provider}" for "${model}".`);
  }

  const response = await openai.responses.create({
    model,
    instructions: systemPrompt ?? "",
    input: messages,
    max_output_tokens: maxTokens,
    ...(isReasoningModel(model) ? { reasoning: { effort: "low" as const } } : {}),
  });

  const { inputCost, outputCost, totalCost } = await calculateCompletionCost(
    response.usage?.input_tokens || 0,
    response.usage?.output_tokens || 0,
    model
  );

  return {
    content: response.output_text || "No response.",
    rawResponse: response,
    inputCost,
    outputCost,
    totalCost,
  };
}
