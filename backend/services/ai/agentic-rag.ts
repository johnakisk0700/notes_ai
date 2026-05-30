// Streaming agentic RAG over the user's notes. The model is handed retrieval tools
// (see notes-tools.ts) and runs a multi-step loop (streamText + stopWhen): it rewrites
// the question, searches, reads results, optionally searches again, then answers with
// grounding. Streamed to the client as an AI SDK UI message stream (text + tool parts),
// with a transient `data-thread` part carrying a freshly-created thread id.
import {
  consumeStream,
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
import {
  DEFAULT_REASONING_EFFORT,
  supportsReasoning,
  type ChatModelId,
  type ReasoningEffort,
} from "@shared/ai/chatModels";
import Decimal from "decimal.js";
import { failAssistant, finalizeAssistant, updateAssistantPartial } from "services/chat-threads";
import { resolveTurnStatus } from "./turn-status.js";
import { historyForModel } from "./message-history.js";
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

type ToolOutputPart = UIMessage["parts"][number] & { toolCallId?: string; output?: unknown; state?: string };

function hydrateToolOutputs(parts: UIMessage["parts"], outputs: Map<string, unknown>): UIMessage["parts"] {
  if (outputs.size === 0) return parts;
  return parts.map(part => {
    const p = part as ToolOutputPart;
    if (!p.type.startsWith("tool-") || !p.toolCallId || p.output !== undefined || !outputs.has(p.toolCallId)) {
      return part;
    }
    return { ...p, state: "output-available", output: outputs.get(p.toolCallId) } as UIMessage["parts"][number];
  });
}

// Approximate EUR/USD used only for the cost badge when the live rate can't be fetched — so a
// Redis hiccup never aborts the turn and drops the answer (see the merge below).
const FALLBACK_EUR_PER_USD = new Decimal("0.92");

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

// Min gap between partial-text writes to the streaming placeholder. Coalesces token-rate
// updates into ~1 Mongo write/1.5s so a fast stream doesn't rewrite the embedded message
// on every token (write amplification), while keeping poll-first catch-up reasonably live.
const PARTIAL_THROTTLE_MS = 1500;

// A throttled, fire-and-forget writer for the streaming answer's cumulative text. onChunk
// must not await Mongo (it backpressures token streaming), so we keep the latest text and
// flush at most once per PARTIAL_THROTTLE_MS. Waits on `persisted` (the placeholder's
// create) so the first write can't race ahead of the doc. `cancel()` stops a pending flush
// once the turn settles, so a late partial can't land after the finalize.
function makePartialWriter(threadId: string, userId: string, generationId: string, persisted?: Promise<void>) {
  let latest = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWrite = 0;
  const flush = () => {
    timer = null;
    lastWrite = Date.now();
    const text = latest;
    (persisted ?? Promise.resolve())
      .then(() => updateAssistantPartial(threadId, userId, generationId, text))
      .catch(err => logger.error("RAG partial persist failed:", err));
  };
  return {
    push(text: string): void {
      latest = text;
      if (timer) return;
      timer = setTimeout(flush, Math.max(0, PARTIAL_THROTTLE_MS - (Date.now() - lastWrite)));
    },
    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
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
  // Client-minted id for this assistant turn. Correlates the live stream to the persisted
  // placeholder (created by recordUserTurn) for the throttled partial writes + the finalize.
  generationId: string;
  // The in-flight user-turn + placeholder write. The finalize awaits it so it targets an
  // existing placeholder.
  persisted?: Promise<void>;
  model?: ChatModelId;
  effort?: ReasoningEffort;
}): void {
  const {
    req,
    res,
    messages,
    userIds,
    userId,
    now,
    threadId,
    newThreadId,
    generationId,
    persisted,
    model: selectedModel,
    effort,
  } = opts;
  const { model, id: modelId } = resolveChatModel(selectedModel);
  const tools = buildNoteTools({ userIds, userId });

  // Per-turn deadline (see TURN_DEADLINE_MS). Aborts streamText if the turn overruns; the
  // timer is cleared the moment the UI stream settles (onFinish/onError), below.
  const turnAbort = new AbortController();
  const turnTimer = setTimeout(() => turnAbort.abort(), TURN_DEADLINE_MS);

  // The throttled partial-text writer for this turn's placeholder. Created in `execute`
  // once we know there's a thread; the UI-stream onFinish/onError cancel it so a late
  // partial can't land after the finalize. Hoisted so both can reach it.
  let partial: ReturnType<typeof makePartialWriter> | null = null;
  const toolOutputs = new Map<string, unknown>();

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // Hand a freshly-created thread id to the client so it can route to /thread/:id.
      if (newThreadId) {
        writer.write({ type: "data-thread", data: { id: newThreadId }, transient: true });
      }

      // historyForModel reduces prior assistant turns to their text answer — their persisted
      // tool/reasoning/step parts are fragile to round-trip and make streamText reject the whole
      // prompt ("messages do not match the ModelMessage[] schema"), which is what wedged a thread
      // after an interrupted turn. `ignoreIncompleteToolCalls` is a belt-and-suspenders. See
      // message-history.ts.
      const modelMessages = await convertToModelMessages(historyForModel(messages), {
        ignoreIncompleteToolCalls: true,
      });
      // Inline the active image's bytes (the provider can't fetch our authed url) and turn
      // older images into id placeholders the model can re-request via view_image.
      const preparedMessages = await inlineChatImages(modelMessages, userId);

      // Persist the streaming answer text to its placeholder, throttled (poll-first live
      // catch-up). Only when there's a thread to target. `answerText` is the cumulative text
      // onChunk accumulates and the writer flushes.
      partial = threadId ? makePartialWriter(threadId, userId, generationId, persisted) : null;
      let answerText = "";

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
        // Accumulate the answer text and throttle a fire-and-forget partial write. The delta
        // chunk is 'text-delta' with the text on `.text` (verified vs the installed ai@6 type
        // defs). NEVER await inside onChunk — it backpressures token streaming.
        onChunk: ({ chunk }) => {
          if (chunk.type === "text-delta") {
            answerText += chunk.text;
            partial?.push(answerText);
          }
        },
        // streamText.onFinish does NOT fire on abort (the TURN_DEADLINE_MS deadline); just
        // stop the partial writer here. The UI-stream onFinish below does the error finalize
        // (it has isAborted + the partial responseMessage); read-time staleness is the
        // ultimate backstop if neither runs (worker crash).
        onAbort: () => partial?.cancel(),
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
            const toolCallId = (r as { toolCallId?: string }).toolCallId;
            if (toolCallId) toolOutputs.set(toolCallId, r.output);
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

      // Pre-fetch the rate so cost can be derived synchronously in the (sync) message-metadata
      // callback below. A rate-fetch failure (Redis down / malformed cache) must NEVER abort the
      // turn — that would reject `execute` before `writer.merge` and drop a generated answer — so
      // fall back to an approximate rate; only the cost badge is slightly off.
      let eurPerUsd: Decimal;
      try {
        eurPerUsd = await getEurPerUsd();
      } catch (err) {
        logger.error("ECB rate fetch failed; using fallback for the cost badge:", err);
        eurPerUsd = FALLBACK_EUR_PER_USD;
      }
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
    // Finalize the assistant placeholder — full text + tool-call parts + cost metadata, or an
    // error status on abort/error — so the thread re-renders after a reload and the poll-first
    // client stops polling. Best-effort (never fails the answer).
    onFinish: async ({ responseMessage, isAborted, finishReason }) => {
      clearTimeout(turnTimer); // turn settled — cancel the deadline
      partial?.cancel();
      if (!threadId || !responseMessage) return;
      // Wait for the user-turn + placeholder write to land first, so the finalize targets an
      // existing placeholder. `persisted` never rejects (best-effort).
      if (persisted) await persisted;
      const status = resolveTurnStatus({ isAborted, finishReason });
      const parts = hydrateToolOutputs(responseMessage.parts, toolOutputs);
      finalizeAssistant(threadId, userId, generationId, {
        content: textFromParts(parts),
        parts,
        // model + cost, attached via messageMetadata above — persisted so the badge survives reload.
        metadata: responseMessage.metadata,
        status,
      }).catch(err => logger.error("Thread persistence (assistant finalize) failed:", err));
    },
    onError: err => {
      clearTimeout(turnTimer);
      partial?.cancel();
      logger.error("Agentic chat stream error:", err);
      // Mark the placeholder errored (status-only, keeps any partial text) so the client stops
      // polling and shows an interrupted state instead of spinning to the staleness cutoff.
      if (threadId) {
        failAssistant(threadId, userId, generationId).catch(e =>
          logger.error("Thread persistence (assistant error) failed:", e)
        );
      }
      return err instanceof Error ? err.message : String(err);
    },
  });

  // Pass consumeSseStream so the UI-stream onFinish fires (with isAborted) even when the turn
  // aborts / the client disconnects — without it that callback is skipped on abort.
  pipeUIMessageStreamToResponse({ response: res, stream, consumeSseStream: consumeStream });
}
