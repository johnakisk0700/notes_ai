import type { TextBlock } from "@anthropic-ai/sdk/resources/index.mjs";
import type { ChatCompletionRequestMessage } from "@fireworksai/sdk";
import type Decimal from "decimal.js";
import type { ParsedResponseStreamEvent, ResponseTextDeltaEvent } from "openai/lib/responses/EventTypes.mjs";
import type { ResponseCompletedEvent, ResponseErrorEvent } from "openai/resources/responses/responses.mjs";
import { anthropic } from "../../clients/claude_client.js";
import { fireworksClient } from "../../clients/fireworks_client.js";
import { openai } from "../../clients/openai_client.js";
import { calculateCompletionCost } from "./ai_utils.js";
import type { ModelNames } from "./ai_models.js";
import { AI_MODELS } from "./ai_models.js";
import { logger } from "utils/logger";

interface Message {
  role: "system" | "assistant" | "user";
  content: string;
}

// Reasoning models (o-series, GPT-5 family) reject a custom `temperature` on the
// Responses API and instead accept a `reasoning.effort`. Detect them by id so we
// send the right params. "low" keeps titling/chat fast and cheap.
const isReasoningModel = (model: string) => /^(o\d|gpt-5)/.test(model);

interface AiChatParams {
  name?: "claude" | "gpt" | "deepseek" | "fireworks-ai";
  model: ModelNames;
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

// Define a unified response type
interface UnifiedAiResponse {
  content: string;
  rawResponse: any; // Original response for advanced use cases
  inputCost: Decimal;
  outputCost: Decimal;
  totalCost: Decimal;
}

export async function getAiChatResponse({
  model = "gpt-4.1",
  messages,
  systemPrompt,
  maxTokens = 8000,
}: AiChatParams): Promise<UnifiedAiResponse> {
  const name = AI_MODELS[model || "gpt-4.1"].provider;
  try {
    console.time("getAiChatResponse");
    // Apply systemPrompt if provided and not already in messages
    if (systemPrompt) {
      messages = [{ role: "system", content: systemPrompt }, ...messages];
    }

    switch (name) {
      case "claude": {
        const DEFAULT_CLAUDE_MODEL = "claude-3-5-haiku-latest";
        // Claude needs system messages converted to assistant
        const claudeMessages = messages.map(msg => (msg.role === "system" ? { ...msg, role: "assistant" } : msg));

        const response = await anthropic.messages.create({
          model: model || DEFAULT_CLAUDE_MODEL, // Use the provided model
          max_tokens: maxTokens,
          messages: claudeMessages as {
            role: "assistant" | "user";
            content: string;
          }[],
        });

        const { inputCost, outputCost, totalCost } = await calculateCompletionCost(
          response.usage?.input_tokens || 0,
          response.usage?.output_tokens || 0,
          model || DEFAULT_CLAUDE_MODEL
        );

        return {
          content: (response.content[0] as TextBlock).text || "No response.",
          rawResponse: response,
          inputCost: inputCost,
          outputCost: outputCost,
          totalCost: totalCost,
        };
      }

      case "gpt": {
        const DEFAULT_GPT_MODEL = "gpt-4.1-nano";

        const response = await openai.responses.create({
          model: model || DEFAULT_GPT_MODEL,
          instructions: systemPrompt ?? "",
          input: messages,
          max_output_tokens: maxTokens,
          ...(isReasoningModel(model) ? { reasoning: { effort: "low" as const } } : {}),
        });

        const { inputCost, outputCost, totalCost } = await calculateCompletionCost(
          response.usage?.input_tokens || 0,
          response.usage?.output_tokens || 0,
          model || DEFAULT_GPT_MODEL
        );

        return {
          content: response.output_text || "No response.",
          rawResponse: response,
          inputCost: inputCost,
          outputCost: outputCost,
          totalCost: totalCost,
        };
      }

      default:
        throw new Error(`Unsupported AI provider: ${name}`);
    }
  } catch (error) {
    console.error(`Error getting AI response from ${name}:`, error);
    throw error;
  } finally {
    console.timeEnd("getAiChatResponse");
  }
}

export async function* getAiStreamingChatResponse({
  model = "gpt-4.1",
  messages,
  systemPrompt,
  temperature = 0.65,
  maxTokens = 8000,
}: AiChatParams) {
  const cleanMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Fetch provider name
  const name = AI_MODELS[model || "gpt-4.1"].provider;

  /* ----- GPT via OpenAI Responses API ------------------------------------ */
  if (name === "gpt") {
    const stream = await openai.responses.create({
      model: model,
      instructions: systemPrompt ?? "",
      input: cleanMessages,
      max_output_tokens: maxTokens,
      stream: true,
      // Reasoning models reject custom temperature; give them a low effort instead.
      ...(isReasoningModel(model) ? { reasoning: { effort: "low" as const } } : { temperature }),
    });

    for await (const ev of stream as AsyncIterable<ParsedResponseStreamEvent>) {
      if (isTextDelta(ev)) {
        yield { type: "content", data: ev.delta };
      } else if (isCompleted(ev)) {
        // Try to access usage info here
        const usage = (ev as any).response.usage;
        if (usage) {
          yield { type: "usage", data: usage };
        }
        yield { type: "done" };
        return;
      } else if (isError(ev)) {
        yield { type: "error", data: ev.message ?? "Unknown error" };
        return;
      }
      /* ignore any of the ~30 other event kinds (audio, tool calls, etc.) */
    }
    return; // defensive
  }

  /* ----- Fireworks Llama 4 ------------------------------------------------ */
  if (name === "fireworks-ai") {
    // prepend systemPrompt as a true system role if one hasn’t been provided
    const fwMessages: ChatCompletionRequestMessage[] =
      systemPrompt && !cleanMessages.some(m => m.role === "system")
        ? [{ role: "system", content: systemPrompt }, ...cleanMessages]
        : cleanMessages;

    const stream = await fireworksClient.chat.completions.create({
      model: model || "accounts/fireworks/models/llama4-maverick-instruct-basic",
      messages: fwMessages,
      stream: true,
      maxTokens: maxTokens, // Fireworks uses snake_case
      temperature,
    });

    for await (const chunk of stream) {
      const delta = chunk?.data?.choices?.[0]?.delta;
      if (delta?.content) {
        // same pattern as OpenAI chat :contentReference[oaicite:5]{index=5}
        yield { type: "content", data: delta.content };
      }
      if (chunk.data.choices[0].finishReason) {
        yield { type: "done" };
        return;
      }
    }
  }
}

export async function handleAiStream(
  req,
  res,
  streamParams: AiChatParams,
  callbacks?: {
    onContent?: (data: string) => void;
    onDone?: (finalThreadPayload: any) => void;
    onError?: (errorData: any) => void;
  }
) {
  let ai_answer = "";
  try {
    for await (const chunk of getAiStreamingChatResponse(streamParams)) {
      switch (chunk.type) {
        case "content":
          ai_answer += chunk.data;
          const encodedData = chunk.data?.replace(/\n/g, "\\n");
          res.write(`data: ${encodedData}\n\n`);
          if (callbacks?.onContent) {
            callbacks.onContent(chunk.data || "");
          }
          break;
        case "usage":
          const usage = chunk.data;
          const { inputCost, outputCost, totalCost } = await calculateCompletionCost(
            usage.input_tokens || 0,
            usage.output_tokens || 0,
            streamParams.model
          );
          req.addCost({
            model: streamParams.model,
            inputCost,
            outputCost,
            totalCost,
          });
          // Optionally, send usage/cost info to client:
          res.write(`event: usage\ndata: ${JSON.stringify({ inputCost, outputCost, totalCost })}\n\n`);
          break;
        case "done":
          res.write(`event: done\ndata: )}\n\n`);
          res.end();
          if (callbacks?.onDone) {
            callbacks.onDone(ai_answer);
          }
          return; // Exit after handling 'done'
        case "error":
          logger.error("Streaming error from AI provider:", chunk.data);
          const errorDataString = typeof chunk.data === "string" ? chunk.data : JSON.stringify(chunk.data);
          res.write(`event: error\ndata: ${errorDataString}\n\n`);
          res.end();
          if (callbacks?.onError) {
            callbacks.onError(chunk.data);
          }
          return; // Exit after handling 'error'
      }
    }

    // Fallback if iterator finishes without 'done' or 'error'
    logger.info('AI stream iterator completed without an explicit "done" or "error" chunk.');

    if (ai_answer) {
      res.write(`event: done\ndata: )}\n\n`);
      res.end();
      if (callbacks?.onDone) {
        callbacks.onDone(ai_answer);
      }
    }
  } catch (error) {
    logger.error("Error in handleAiStream:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!res.writableEnded) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: errorMessage,
          type: "stream_handler_exception",
        })}\n\n`
      );
      res.end();
    }
    if (callbacks?.onError) {
      callbacks.onError(error);
    }
    // Re-throw the error if you want the caller to also handle it,
    // or handle it completely here. For now, just logging and sending to client.
  }
}

/** Utility: true only for text-delta events */
function isTextDelta(ev: ParsedResponseStreamEvent): ev is ResponseTextDeltaEvent {
  return ev.type === "response.output_text.delta";
}

/** Utility: true only for “done” events  */
function isCompleted(ev: ParsedResponseStreamEvent): ev is ResponseCompletedEvent {
  return ev.type === "response.completed";
}

/** Utility: true only for error events */
function isError(ev: ParsedResponseStreamEvent): ev is ResponseErrorEvent {
  return ev.type === "error";
}
