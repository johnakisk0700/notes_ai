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
  type ModelMessage,
  type UIMessage,
} from "ai";
import type { Request, Response } from "express";
import { resolveChatModel } from "clients/llm_providers";
import { DEFAULT_REASONING_EFFORT, supportsReasoning, type ChatModelId, type ReasoningEffort } from "@shared/ai/chatModels";
import { appendMessage } from "services/chat-threads";
import { chatImageIdFromUrl, loadChatImage } from "services/chat-images";
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

// Hard ceiling on a single turn's wall-clock. A backstop: even if the model provider or a
// tool wedges past the per-client timeouts, the turn still aborts, the stream ends, and
// onFinish (persistence) runs — the client is never left hanging on an open response.
const TURN_DEADLINE_MS = 60_000;

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
    "",
    "Μπορείς επίσης να φτιάχνεις σημειώσεις για τον χρήστη — μόνο όταν το ζητάει ρητά:",
    "- create_note: όταν σου ζητάει να κρατήσεις/αποθηκεύσεις μια ΝΕΑ σημείωση — αποθηκεύεται αμέσως.",
    "- propose_note_edit: όταν θέλει να διορθώσεις/προσθέσεις/αλλάξεις μια ΥΠΑΡΧΟΥΣΑ σημείωση — βρες την πρώτα με αναζήτηση, μετά πρότεινε την αλλαγή (ο χρήστης την εφαρμόζει ή την ακυρώνει).",
    "- draft_note: όταν θέλει να γράψει ο ΙΔΙΟΣ τη σημείωση — ετοιμάζεις προσχέδιο και ανοίγει στον editor του για να το συμπληρώσει και να το αποθηκεύσει.",
    "- Το περιεχόμενο των σημειώσεων γράψ' το σε καθαρό Markdown, στη γλώσσα του χρήστη. Μετά την ενέργεια, πες με μία σύντομη πρόταση τι έκανες.",
    "- Αν μια ενέργεια αποτύχει (π.χ. το create_note επιστρέψει saved:false), δοκίμασε ΜΙΑ ακόμη φορά· αν αποτύχει ξανά, πες το ευγενικά στον χρήστη — μην το επαναλαμβάνεις ασταμάτητα.",
    "",
    "- Ο χρήστης μπορεί να επισυνάψει εικόνα. Η πιο πρόσφατη εικόνα είναι ήδη ορατή σε σένα. Παλιότερες εικόνες εμφανίζονται ως «[εικόνα <id> …]» — αν χρειαστεί να δεις ξανά μία τέτοια, κάλεσε το view_image με το id της.",
    "",
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

// A model-message content part (loosely typed — the SDK's union varies by role).
type ContentPart = { type: string; data?: unknown; image?: unknown; text?: string; mediaType?: string };

// Resolve attached chat images for the model. convertToModelMessages turns a UI file part
// into a `file` part whose `data` is our `/api/chat-image/<id>` url — but a provider can't
// fetch that bearer-gated url. So we inline the MOST-RECENT image's bytes (the one under
// active discussion) and turn OLDER images into id placeholders the model can re-request
// via view_image (see prepareStep below). Returns a shallow copy; never mutates the input.
async function inlineChatImages(messages: ModelMessage[], userId: string): Promise<ModelMessage[]> {
  const refs: Array<{ mi: number; pi: number; id: string }> = [];
  messages.forEach((m, mi) => {
    if (!Array.isArray(m.content)) return;
    (m.content as ContentPart[]).forEach((p, pi) => {
      // convertToModelMessages maps a UI file part to a `file` part with `data: <url>`; match
      // an `image` part too in case a version inlines the url there — either way, never let a
      // chat-image url reach the provider (it can't fetch our bearer-gated route).
      const ref = typeof p.data === "string" ? p.data : typeof p.image === "string" ? p.image : undefined;
      if ((p?.type === "file" || p?.type === "image") && ref) {
        const id = chatImageIdFromUrl(ref);
        if (id) refs.push({ mi, pi, id });
      }
    });
  });
  if (refs.length === 0) return messages;

  const out = messages.map(m => (Array.isArray(m.content) ? { ...m, content: [...(m.content as ContentPart[])] } : m));
  const activeIdx = refs.length - 1; // most-recent reference = the active image
  for (let i = 0; i < refs.length; i++) {
    const { mi, pi, id } = refs[i];
    const content = (out[mi] as { content: ContentPart[] }).content;
    if (i === activeIdx) {
      const img = await loadChatImage(userId, id);
      content[pi] = img
        ? { type: "image", image: img.base64, mediaType: img.mediaType }
        : { type: "text", text: "[εικόνα μη διαθέσιμη]" };
    } else {
      content[pi] = { type: "text", text: `[εικόνα ${id} — κάλεσε view_image με αυτό το id για να τη δεις]` };
    }
  }
  return out as ModelMessage[];
}

// Flatten the tool calls across all completed steps (to detect view_image re-looks).
function stepToolCalls(steps: unknown): Array<{ toolName: string; input?: unknown; args?: unknown }> {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap(s => {
    const calls = (s as { toolCalls?: unknown }).toolCalls;
    return Array.isArray(calls) ? (calls as Array<{ toolName: string; input?: unknown; args?: unknown }>) : [];
  });
}

function imageIdOfCall(call: { input?: unknown; args?: unknown }): string | null {
  const src = (call.input ?? call.args) as { imageId?: unknown } | undefined;
  return typeof src?.imageId === "string" ? src.imageId : null;
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
  const tools = buildNoteTools({ userIds, userId });

  // Per-turn deadline (see TURN_DEADLINE_MS). Aborts streamText if the turn overruns; the
  // timer is cleared the moment the UI stream settles (onFinish/onError), below.
  const turnAbort = new AbortController();
  const turnTimer = setTimeout(() => turnAbort.abort(), TURN_DEADLINE_MS);

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // Hand a freshly-created thread id to the client so it can route to /thread/:id.
      if (newThreadId) {
        writer.write({ type: "data-thread", data: { id: newThreadId }, transient: true });
      }

      const modelMessages = await convertToModelMessages(messages);
      // Inline the active image's bytes (the provider can't fetch our authed url) and turn
      // older images into id placeholders the model can re-request via view_image.
      const preparedMessages = await inlineChatImages(modelMessages, userId);
      // Images the model re-requested via view_image — loaded once and re-injected as USER
      // messages each step (images aren't honored on tool messages over this provider).
      const viewedImages = new Map<string, { base64: string; mediaType: string }>();
      const result = streamText({
        model,
        abortSignal: turnAbort.signal,
        system: lexiSystemPrompt(now),
        messages: preparedMessages,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        // Before each step: (1) re-inject any image the model asked to see again as a user
        // message; (2) on the final allowed step, drop tools so it must produce an answer.
        prepareStep: async ({ stepNumber, steps, messages: stepMessages }) => {
          for (const call of stepToolCalls(steps)) {
            if (call.toolName !== "view_image") continue;
            const id = imageIdOfCall(call);
            if (id && !viewedImages.has(id)) {
              const img = await loadChatImage(userId, id);
              if (img) viewedImages.set(id, img);
            }
          }
          const injected: ModelMessage[] = [...viewedImages.entries()].map(([id, img]) => ({
            role: "user",
            content: [
              { type: "image", image: img.base64, mediaType: img.mediaType },
              { type: "text", text: `(η εικόνα ${id} που ζήτησες)` },
            ],
          }));
          const step: { messages?: ModelMessage[]; toolChoice?: "none" } = {};
          if (injected.length) step.messages = [...(stepMessages as ModelMessage[]), ...injected];
          if (stepNumber >= MAX_STEPS - 1) step.toolChoice = "none";
          return step;
        },
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
      clearTimeout(turnTimer); // turn settled — cancel the deadline
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
      clearTimeout(turnTimer);
      logger.error("Agentic chat stream error:", err);
      return err instanceof Error ? err.message : String(err);
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream });
}
