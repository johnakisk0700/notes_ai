// Streaming agentic RAG over the user's notes. The model is handed retrieval tools
// (see notes-tools.ts) and runs a multi-step loop (streamText + stopWhen): it rewrites
// the question, searches, reads results, optionally searches again, then answers with
// grounding. Streamed to the client as an AI SDK UI message stream (text + tool parts),
// with a transient `data-thread` part carrying a freshly-created thread id.
import {
  convertToModelMessages,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import type { Request, Response } from "express";
import { resolveChatModel } from "clients/llm_providers";
import { DEFAULT_REASONING_EFFORT, supportsReasoning, type ChatModelId, type ReasoningEffort } from "@shared/ai/chatModels";
import { appendMessage } from "services/chat-threads";
import { logger } from "utils/logger";
import { getEurPerUsd } from "utils/ecbConversionRates";
import { calculateCompletionCost, completionCostEur } from "./ai_utils.js";
import { AI_MODELS } from "./ai_models.js";
import { buildNoteTools } from "./notes-tools.js";

// Ceiling on LLM round-trips per turn — a runaway guard, not a target. The SDK default
// is a single step (no agentic continuation), so a cap > 1 is required for the loop to
// read tool results and answer; a normal turn uses 2–3 (search → [search] → answer) and
// rarely reaches 5. On the final step we drop tools (prepareStep) to force an answer.
const MAX_STEPS = 5;

interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
}

/** Plain-text projection of an assistant turn (ignores tool-call parts). */
function textFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
    .map(p => p.text)
    .join("");
}

// The tools' names, descriptions and parameter schemas are sent to the model by the
// SDK (from notes-tools.ts), so the prompt does NOT re-describe them — it carries only
// persona + the answer policy that isn't expressible in a tool schema.
function lexiSystemPrompt(now: string): string {
  return [
    "Είσαι η Λέξι, μια έμπειρη γραμματέας που βοηθάει τον χρήστη να βρίσκει πληροφορίες μέσα στις σημειώσεις του.",
    `Σήμερα είναι: ${now}.`,
    "",
    "- Για ερωτήσεις πάνω στις σημειώσεις, ψάξε με τα εργαλεία πριν απαντήσεις· μη βασίζεσαι στη μνήμη σου. Μπορείς να ψάξεις και ξανά αν χρειαστεί.",
    "- Βασίσου ΜΟΝΟ στις σημειώσεις που επιστρέφουν τα εργαλεία. Αν δεν υπάρχει σχετική πληροφορία, πες το ευγενικά — μην επινοείς.",
    "- Ανάφερε τους τίτλους των σχετικών σημειώσεων όταν απαντάς.",
    "- Απάντησε στη γλώσσα του χρήστη (κυρίως Ελληνικά), με σύντομο και καθαρό markdown και μέτρια emoji.",
  ].join("\n");
}

// Map the chosen reasoning effort to the right provider-option shape per provider
// (OpenAI: `reasoningEffort`; OpenRouter unified: `reasoning.effort`). Return type is
// borrowed from streamText so the literals are checked against the SDK's own shape.
function reasoningProviderOptions(
  modelId: ChatModelId,
  effort: ReasoningEffort
): Parameters<typeof streamText>[0]["providerOptions"] {
  // Non-reasoning models (e.g. Qwen3-Max, Qwen3-Next) reject/ignore a reasoning
  // effort — only send it to models that advertise the capability.
  if (!supportsReasoning(modelId)) return undefined;
  const provider = AI_MODELS[modelId].provider;
  if (provider === "gpt") return { openai: { reasoningEffort: effort } };
  if (provider === "openrouter") return { openrouter: { reasoning: { effort } } };
  return undefined;
}

export function streamNotesChat(opts: {
  req: Request;
  res: Response;
  messages: UIMessage[];
  userIds: string[];
  userId: string;
  now: string;
  threadId?: string;
  newThreadId?: string;
  // The in-flight user-turn write (thread create / user-message append). The assistant
  // turn awaits it before persisting, so its push always targets an existing doc.
  persisted?: Promise<void>;
  model?: ChatModelId;
  effort?: ReasoningEffort;
}): void {
  const { req, res, messages, userIds, userId, now, threadId, newThreadId, persisted, model: selectedModel, effort } =
    opts;
  const { model, id: modelId } = resolveChatModel(selectedModel);
  const tools = buildNoteTools({ userIds });

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // Hand a freshly-created thread id to the client so it can route to /thread/:id.
      if (newThreadId) {
        writer.write({ type: "data-thread", data: { id: newThreadId }, transient: true });
      }

      const modelMessages = await convertToModelMessages(messages);
      const result = streamText({
        model,
        system: lexiSystemPrompt(now),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        // On the final allowed step, drop tools so the model must produce an answer
        // instead of ending the turn on another tool call. ({} = no override.)
        prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" } : {}),
        providerOptions: reasoningProviderOptions(modelId, effort ?? DEFAULT_REASONING_EFFORT),
        // Per-step observability: log each tool result and how many notes it returned.
        onStepFinish: step => {
          for (const r of step.toolResults ?? []) {
            const count = (r.output as { count?: number } | undefined)?.count;
            logger.info(`RAG · ${r.toolName}${typeof count === "number" ? ` → ${count} notes` : ""}`);
          }
        },
        // Usage lives here, so cost is computed here. Persistence happens in the
        // UI-stream onFinish below, where the assembled assistant message is available.
        onFinish: async event => {
          const u: UsageLike =
            (event as unknown as { totalUsage?: UsageLike }).totalUsage ??
            (event as unknown as { usage?: UsageLike }).usage ??
            {};
          try {
            // totalCost is derived as inputCost + outputCost by addCost.
            const { inputCost, outputCost } = await calculateCompletionCost(
              u.inputTokens ?? 0,
              u.outputTokens ?? 0,
              modelId
            );
            req.addCost({ model: modelId, inputCost, outputCost });
          } catch (err) {
            logger.error("Chat cost calculation failed:", err);
          }
        },
      });

      // Keep draining the model stream even if the client disconnects, so onFinish
      // (cost + persistence) still runs to completion.
      result.consumeStream();

      // Pre-fetch the rate once so cost can be derived synchronously in the (sync)
      // message-metadata callback below.
      const eurPerUsd = await getEurPerUsd();
      writer.merge(
        result.toUIMessageStream({
          // Forward the model's reasoning parts to the UI (when the provider returns them).
          sendReasoning: true,
          // Tag the finished message with model + cost. This both streams live and rides
          // on responseMessage.metadata, so it's persisted with the turn (below).
          messageMetadata: ({ part }) => {
            if (part.type !== "finish") return undefined;
            const usage = part.totalUsage;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;
            return {
              model: modelId,
              totalTokens: usage?.totalTokens ?? inputTokens + outputTokens,
              costEur: completionCostEur(inputTokens, outputTokens, modelId, eurPerUsd).toNumber(),
            };
          },
        })
      );
    },
    // Persist the whole assistant turn — text + tool-call parts — so the thread
    // re-renders tool steps after a reload. Best-effort (never fails the answer).
    onFinish: async ({ responseMessage }) => {
      if (!threadId || !responseMessage) return;
      // Wait for the user-turn write (thread create / user-message append) to land first,
      // so this push targets an existing doc. `persisted` never rejects (best-effort).
      if (persisted) await persisted;
      appendMessage(threadId, userId, {
        role: "assistant",
        content: textFromParts(responseMessage.parts),
        parts: responseMessage.parts,
        // model + cost, attached via messageMetadata above — persisted so the badge survives reload.
        metadata: responseMessage.metadata,
      }).catch(err => logger.error("Thread persistence (assistant message) failed:", err));
    },
    onError: err => {
      logger.error("Agentic chat stream error:", err);
      return err instanceof Error ? err.message : String(err);
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream });
}
