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
import { DEFAULT_REASONING_EFFORT, type ChatModelId, type ReasoningEffort } from "@shared/ai/chatModels";
import { appendMessage } from "services/chat-threads";
import { logger } from "utils/logger";
import { calculateCompletionCost } from "./ai_utils.js";
import { AI_MODELS } from "./ai_models.js";
import { buildNoteTools } from "./notes-tools.js";

const MAX_STEPS = 5;

interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
}

function lexiSystemPrompt(now: string): string {
  return [
    "Είσαι η Λέξι, μια έμπειρη γραμματέας που βοηθάει τον χρήστη να βρίσκει πληροφορίες μέσα στις σημειώσεις του.",
    `Σήμερα είναι: ${now}.`,
    "",
    "ΕΡΓΑΛΕΙΑ:",
    "- Για ΟΠΟΙΑΔΗΠΟΤΕ ερώτηση που αφορά το περιεχόμενο των σημειώσεων, ΠΡΕΠΕΙ πρώτα να καλέσεις το εργαλείο `search_notes`.",
    "- Μπορείς να ψάξεις πολλές φορές με διαφορετικές διατυπώσεις για να βρεις ό,τι χρειάζεσαι ή να συγκρίνεις θέματα.",
    "- Διατύπωσε καθαρά το `query` (μην αντιγράφεις αυτούσια την ερώτηση).",
    "",
    "ΑΠΑΝΤΗΣΗ:",
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
  model?: ChatModelId;
  effort?: ReasoningEffort;
}): void {
  const { req, res, messages, userIds, userId, now, threadId, newThreadId, model: selectedModel, effort } = opts;
  const { model, id: modelId } = resolveChatModel(selectedModel);
  const tools = buildNoteTools({ userIds });

  const stream = createUIMessageStream({
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
        providerOptions: reasoningProviderOptions(modelId, effort ?? DEFAULT_REASONING_EFFORT),
        onFinish: async event => {
          const u: UsageLike =
            (event as unknown as { totalUsage?: UsageLike }).totalUsage ??
            (event as unknown as { usage?: UsageLike }).usage ??
            {};
          const text = (event as unknown as { text?: string }).text ?? "";
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
          // Persist the assistant's final answer (tool-call steps aren't persisted yet —
          // see docs/rag-enhancement-plan.md §4.5). Best-effort.
          if (threadId && text) {
            appendMessage(threadId, userId, { role: "assistant", content: text }).catch(err =>
              logger.error("Thread persistence (assistant message) failed:", err)
            );
          }
        },
      });

      writer.merge(result.toUIMessageStream());
    },
    onError: err => {
      logger.error("Agentic chat stream error:", err);
      return err instanceof Error ? err.message : String(err);
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream });
}
