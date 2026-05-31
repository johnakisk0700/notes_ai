// Streaming agentic RAG over the user's notes. The model is handed retrieval tools
// (see notes-tools.ts) and runs a multi-step loop (streamText + stopWhen): it rewrites
// the question, searches, reads results, optionally searches again, then answers with
// grounding. Streamed to the client as an AI SDK UI message stream (text + tool parts),
// with a transient `data-thread` part carrying a freshly-created thread id.
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  hasToolCall,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai";
import type { Request, Response } from "express";
import { resolveChatModel } from "clients/llm_providers";
import {
  clampEffortForModel,
  DEFAULT_REASONING_EFFORT,
  modelHasVision,
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
import { chatTrace } from "utils/chat-trace";
import { getEurPerUsd } from "utils/ecbConversionRates";
import { calculateCompletionCost, completionCostEur } from "./ai_utils.js";
import { AI_MODELS } from "./ai_models.js";
import { buildNoteTools } from "./notes-tools.js";
import { buildWebTools } from "./web-tools.js";

// Ceiling on LLM round-trips per turn — a runaway guard, not a target. The SDK default
// is a single step (no agentic continuation), so a cap > 1 is required for the loop to
// read tool results and answer; a normal turn uses 2–3 (search → [search] → answer) and
// rarely reaches 5 (a web turn can chain search_notes/web_search → fetch_page → answer, so the
// ceiling is a little higher). On the final step we drop tools (prepareStep) to force an answer.
const MAX_STEPS = 7;

// Turn watchdog. A fixed wall-clock deadline can't tell a WEDGED provider from a model that's
// legitimately still streaming (Qwen reasoning can run well past a minute) — it would guillotine
// the slow-but-working turn mid-thought, leaving the user nothing. So we watch for SILENCE instead:
//   • TURN_IDLE_MS — abort if the model stream produces no chunk (text, reasoning, or tool
//     progress — see onChunk) for this long. That's the real "wedged" signal. Reset on every chunk,
//     so an actively-streaming model is never killed for being slow. Sits above the longest gap a
//     healthy turn has with no model chunks: a single tool's execution (web/embed/qdrant clients are
//     all ≤12s) — onStepFinish resets it again at each step boundary.
//   • TURN_MAX_MS — absolute ceiling regardless of activity, a final runaway guard (e.g. a provider
//     that streams reasoning forever). Generous; a healthy turn finishes well under it.
// The heartbeat that the read-time staleness rule (chat-threads STALE_MS) keys off is bumped on
// every chunk too (onChunk), so a long reasoning turn stays "alive" to a polling client.
const TURN_IDLE_MS = 30_000;
const TURN_MAX_MS = 180_000;

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
    `Σήμερα είναι: ${now}. Αυτή η ημερομηνία είναι στην τοπική ώρα του χρήστη· όταν δίνεις εύρος στο filter_by_date, χρησιμοποίησε το ίδιο offset ζώνης ώρας ώστε τα όρια της ημέρας να ταιριάζουν με την τοπική του μέρα.`,
    "",
    "- Για ερωτήσεις πάνω στις σημειώσεις, ψάξε με τα εργαλεία πριν απαντήσεις· μη βασίζεσαι στη μνήμη σου. Μπορείς να ψάξεις και ξανά αν χρειαστεί.",
    "- Για ό,τι αφορά τις σημειώσεις, βασίσου ΜΟΝΟ σ' αυτές που επιστρέφουν τα εργαλεία. Αν δεν υπάρχει σχετική πληροφορία, πες το ευγενικά — μην επινοείς.",
    "- Ανάφερε τους τίτλους των σχετικών σημειώσεων όταν απαντάς.",
    "- Αν χρειάζεσαι όνομα κρασιού, πελάτη ή χρήστη (π.χ. για να ψάξεις σημειώσεις γι' αυτό), χρησιμοποίησε το lookup_names· δέχεται ακόμη κι ανορθόγραφο ή χωρίς τόνους όνομα και βρίσκει το πιο κοντινό.",
    "",
    "Μπορείς επίσης να φτιάχνεις και να επεξεργάζεσαι σημειώσεις για τον χρήστη — μόνο όταν το ζητάει ρητά:",
    "- create_note (ΝΕΑ σημείωση): mode «save» = αποθηκεύεται αμέσως (όταν σου ζητάει να κρατήσεις/αποθηκεύσεις). mode «draft» = δεν αποθηκεύει τίποτα, ανοίγει προσχέδιο στον editor του για να το συμπληρώσει και να το αποθηκεύσει ο ίδιος.",
    "Για ΥΠΑΡΧΟΥΣΑ σημείωση (βρες την πρώτα με αναζήτηση) έχεις ΔΥΟ ξεχωριστά εργαλεία — δώσε πάντα ΟΛΟΚΛΗΡΟ το νέο περιεχόμενο (όχι diff)· για προσθήκη, επανάλαβε το υπάρχον κείμενο μαζί με το νέο:",
    "- propose_edit (ΠΡΟΕΠΙΛΟΓΗ): δείχνει στον χρήστη κάρτα πριν→μετά που Εφαρμόζει ή ακυρώνει· ΔΕΝ γράφει — η Εφαρμογή του χρήστη το αποθηκεύει. Αφού το καλέσεις, ΤΕΛΕΙΩΣΕΣ: ΜΗΝ καλέσεις και save_edit για την ίδια σημείωση — αποφασίζει ο χρήστης από την κάρτα.",
    "- save_edit: γράφει την αλλαγή ΑΜΕΣΩΣ, χωρίς κάρτα. ΜΟΝΟ όταν ο χρήστης το θέλει ξεκάθαρα τώρα («διόρθωσέ το και αποθήκευσέ το», «απλά πρόσθεσέ το»). Αν έχεις αμφιβολία, χρησιμοποίησε propose_edit.",
    "- ΜΗΝ γράφεις το «πριν/μετά» μόνο σαν κείμενο στην απάντηση — κάλεσε propose_edit ώστε ο χρήστης να πάρει την κάρτα με το κουμπί Apply. Για την ΙΔΙΑ σημείωση, σε έναν γύρο κάνε ΜΙΑ ενέργεια (ή propose_edit ή save_edit), ΠΟΤΕ και τα δύο.",
    "- Το περιεχόμενο των σημειώσεων γράψ' το σε καθαρό Markdown, στη γλώσσα του χρήστη. Μετά την ενέργεια, πες με μία σύντομη πρόταση τι έκανες.",
    "- Αν μια ενέργεια αποτύχει (π.χ. το create_note επιστρέψει saved:false), δοκίμασε ΜΙΑ ακόμη φορά· αν αποτύχει ξανά, πες το ευγενικά στον χρήστη — μην το επαναλαμβάνεις ασταμάτητα.",
    "",
    "- Ο χρήστης μπορεί να επισυνάψει εικόνα. Η πιο πρόσφατη εικόνα είναι ήδη ορατή σε σένα. Παλιότερες εικόνες εμφανίζονται ως «[εικόνα <id> …]» — αν χρειαστεί να δεις ξανά μία τέτοια, κάλεσε το view_image με το id της.",
    "",
    "Έχεις και πρόσβαση στο διαδίκτυο:",
    "- web_search: ψάξε στο διαδίκτυο για πληροφορίες που ΔΕΝ υπάρχουν στις σημειώσεις (τρέχοντα γεγονότα, γενικές γνώσεις, τιμές κ.λπ.).",
    "- fetch_page: διάβασε ολόκληρη μια σελίδα από URL — ένα αποτέλεσμα του web_search ή ένα link που έδωσε ο χρήστης.",
    "- Όταν απαντάς με βάση το διαδίκτυο, ανάφερε τις πηγές (URLs).",
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
  // Only send an effort to models that advertise the reasoning capability; others
  // reject/ignore it. Clamp to the model's allowed range too (defense-in-depth — a stale
  // client could post an effort the model doesn't offer).
  if (!supportsReasoning(modelId)) return undefined;
  const safe = clampEffortForModel(modelId, effort) ?? effort;
  const provider = AI_MODELS[modelId].provider;
  if (provider === "gpt") return { openai: { reasoningEffort: safe } };
  if (provider === "openrouter") return { openrouter: { reasoning: { effort: openRouterEffort(safe) } } };
  return undefined;
}

// OpenRouter's unified reasoning API only accepts low|medium|high; our "minimal" floor is
// OpenAI-only (and isn't offered on OpenRouter models), so map it down to "low" defensively
// rather than risk the provider rejecting an unknown effort and erroring the whole turn.
function openRouterEffort(effort: ReasoningEffort): "low" | "medium" | "high" {
  return effort === "minimal" ? "low" : effort;
}

// A model-message content part (loosely typed — the SDK's union varies by role).
type ContentPart = { type: string; data?: unknown; image?: unknown; text?: string; mediaType?: string };

// Redacted, readable summary of the messages we actually hand the model — image bytes collapse to
// a length so we can SEE whether an image was inlined (type "image", large bytes), turned into an
// id placeholder (type "text"), or dropped for a non-vision model, without dumping base64. Trace only.
function traceMessages(messages: ModelMessage[]): unknown {
  return messages.map(m => {
    const content = m.content;
    if (typeof content === "string") return { role: m.role, text: content };
    if (!Array.isArray(content)) return { role: m.role, content: typeof content };
    return {
      role: m.role,
      parts: (content as ContentPart[]).map(p => {
        const ref = typeof p.image === "string" ? p.image : typeof p.data === "string" ? p.data : undefined;
        if (p.type === "image" || p.type === "file") {
          return { type: p.type, mediaType: p.mediaType, bytes: ref ? ref.length : 0 };
        }
        return { type: p.type, text: typeof p.text === "string" ? p.text : undefined };
      }),
    };
  });
}

// Resolve attached chat images for the model. convertToModelMessages turns a UI file part
// into a `file` part whose `data` is our `/api/chat-image/<id>` url — but a provider can't
// fetch that bearer-gated url. So we inline the bytes of the image(s) on the CURRENT (last) user
// turn — the ones being asked about right now — and turn images from EARLIER turns into id
// placeholders the model can re-request via view_image (see prepareStep). Scoping to the current
// turn (not "the most-recent image in the whole thread") matters: otherwise a single attached image
// would be re-sent IN FULL on every later text-only turn. Returns a shallow copy; never mutates input.
async function inlineChatImages(messages: ModelMessage[], userId: string, hasVision: boolean): Promise<ModelMessage[]> {
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
  // The current turn = the last user message; only its image(s) are inlined as bytes. Images on
  // earlier turns become view_image placeholders, so a past attachment isn't re-sent every turn.
  const lastUserIdx = messages.reduce((idx, m, i) => (m.role === "user" ? i : idx), -1);
  for (let i = 0; i < refs.length; i++) {
    const { mi, pi, id } = refs[i];
    const content = (out[mi] as { content: ContentPart[] }).content;
    // Vision gating is authoritative HERE, not just in the composer: a thread can already hold an
    // image when the user switches to a non-vision model, and history keeps user image parts. Never
    // inline bytes for a model that can't see them (the provider would reject the part and error the
    // turn) — leave a text placeholder so the conversation still flows.
    if (!hasVision) {
      content[pi] = { type: "text", text: `[εικόνα ${id} — το επιλεγμένο μοντέλο δεν υποστηρίζει εικόνες]` };
    } else if (mi === lastUserIdx) {
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
  const hasVision = modelHasVision(modelId);
  const tools = { ...buildNoteTools({ userIds, userId }), ...buildWebTools() };

  chatTrace(generationId, "stream:init", {
    modelId,
    hasVision,
    hasThread: Boolean(threadId),
    newThread: Boolean(newThreadId),
    toolNames: Object.keys(tools),
    now,
  });

  // Turn watchdog (see TURN_IDLE_MS / TURN_MAX_MS). The idle timer aborts on silence and is
  // reset on every stream chunk + step boundary; the max timer is an absolute backstop. Both are
  // cleared the moment the UI stream settles (onFinish/onError), below.
  const turnAbort = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => turnAbort.abort(), TURN_IDLE_MS);
  };
  resetIdle(); // arm it now — covers the wait for the very first chunk
  const maxTimer = setTimeout(() => turnAbort.abort(), TURN_MAX_MS);
  const clearTurnTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    clearTimeout(maxTimer);
  };

  // The throttled partial-text writer for this turn's placeholder. Created in `execute`
  // once we know there's a thread; the UI-stream onFinish/onError cancel it so a late
  // partial can't land after the finalize. Hoisted so both can reach it.
  let partial: ReturnType<typeof makePartialWriter> | null = null;
  const toolOutputs = new Map<string, unknown>();
  // First-seen stream chunk types, traced once each — confirms reasoning-delta flows through onChunk
  // (which is what lets the idle watchdog + heartbeat survive a long, text-less reasoning phase).
  const seenChunkTypes = new Set<string>();

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
      const reducedHistory = historyForModel(messages);
      chatTrace(generationId, "history-reduction", {
        original: messages.map(m => ({ role: m.role, partTypes: m.parts.map(p => p.type) })),
        reduced: reducedHistory.map(m => ({ role: m.role, partTypes: m.parts.map(p => p.type) })),
      });
      const modelMessages = await convertToModelMessages(reducedHistory, {
        ignoreIncompleteToolCalls: true,
      });
      // Inline the active image's bytes (the provider can't fetch our authed url) and turn
      // older images into id placeholders the model can re-request via view_image.
      const preparedMessages = await inlineChatImages(modelMessages, userId, hasVision);
      chatTrace(generationId, "prepared-messages", { hasVision, messages: traceMessages(preparedMessages) });

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
        // Stop the agentic loop at the step cap OR the moment the model PROPOSES an edit: a
        // propose_edit hands the decision to the user (the Apply/Discard card), so the turn must end
        // there and wait for their input — the model can't take any further action (no save, no
        // ramble) after proposing. Structural backstop on top of the per-turn edit guard.
        stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("propose_edit")],
        // Any chunk — text-delta, reasoning-delta, tool progress — proves the turn is alive, so
        // reset the idle watchdog and bump the placeholder heartbeat on EVERY chunk. The answer text
        // only grows on 'text-delta' (text on `.text`, verified vs the installed ai@6 type defs);
        // the partial write during a text-less reasoning phase just refreshes `updatedAt` (content
        // is still ""), which is what keeps a long reasoning turn from going read-time stale. NEVER
        // await inside onChunk — it backpressures token streaming.
        onChunk: ({ chunk }) => {
          resetIdle();
          if (!seenChunkTypes.has(chunk.type)) {
            seenChunkTypes.add(chunk.type);
            chatTrace(generationId, "chunk-type", { type: chunk.type });
          }
          if (chunk.type === "text-delta") answerText += chunk.text;
          partial?.push(answerText);
        },
        // streamText.onFinish does NOT fire on abort (the idle/max watchdog); just stop the partial
        // writer here. The UI-stream onFinish below does the error finalize (it has isAborted + the
        // partial responseMessage); read-time staleness is the ultimate backstop if neither runs
        // (worker crash).
        onAbort: () => partial?.cancel(),
        // Before each step: (1) re-inject any image the model asked to see again as a user
        // message; (2) on the final allowed step, drop tools so it must produce an answer.
        prepareStep: async ({ stepNumber, steps, messages: stepMessages }) => {
          const step: { messages?: ModelMessage[]; toolChoice?: "none" } = {};
          // Re-inject any image the model asked to see again as a user message — but only for a
          // vision model (a non-vision model can't see images, and the provider rejects image parts).
          if (hasVision) {
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
            if (injected.length) step.messages = [...(stepMessages as ModelMessage[]), ...injected];
          }
          // On the final allowed step, drop tools so the model must produce an answer.
          if (stepNumber >= MAX_STEPS - 1) step.toolChoice = "none";
          chatTrace(generationId, "prepare-step", {
            stepNumber,
            hasVision,
            viewedImageIds: [...viewedImages.keys()],
            injectedImages: step.messages ? viewedImages.size : 0,
            dropTools: step.toolChoice === "none",
          });
          return step;
        },
        providerOptions: reasoningProviderOptions(modelId, effort ?? DEFAULT_REASONING_EFFORT),
        // Per-step observability: log each tool result and how many notes it returned.
        onStepFinish: step => {
          resetIdle(); // a completed step is progress — don't let the next think-time trip the watchdog
          const results: Array<{ tool: string; callId?: string; count?: number; outputKeys?: string[] }> = [];
          for (const r of step.toolResults ?? []) {
            const count = (r.output as { count?: number } | undefined)?.count;
            const toolCallId = (r as { toolCallId?: string }).toolCallId;
            if (toolCallId) toolOutputs.set(toolCallId, r.output);
            logger.info(`RAG · ${r.toolName}${typeof count === "number" ? ` → ${count} notes` : ""}`);
            results.push({
              tool: r.toolName,
              callId: toolCallId,
              count,
              outputKeys: r.output && typeof r.output === "object" ? Object.keys(r.output) : undefined,
            });
          }
          chatTrace(generationId, "step-finish", {
            toolCalls: (step.toolCalls ?? []).map(c => c.toolName),
            results,
            textLen: typeof step.text === "string" ? step.text.length : 0,
          });
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
      clearTurnTimers(); // turn settled — cancel idle + max watchdogs
      partial?.cancel();
      chatTrace(generationId, "ui-finish", {
        isAborted,
        finishReason,
        hasThread: Boolean(threadId),
        hasResponseMessage: Boolean(responseMessage),
      });
      if (!threadId || !responseMessage) return;
      // Wait for the user-turn + placeholder write to land first, so the finalize targets an
      // existing placeholder. `persisted` never rejects (best-effort).
      if (persisted) await persisted;
      const status = resolveTurnStatus({ isAborted, finishReason });
      const parts = hydrateToolOutputs(responseMessage.parts, toolOutputs);
      const answer = textFromParts(parts);
      // Empty-answer guard: a reasoning model (seen with Qwen3.6 over OpenRouter, intermittently) can
      // end a turn with the whole answer left in the REASONING channel and empty visible text. Don't
      // persist that as a normal "complete" — a blank bubble — downgrade it to "error" so the client
      // offers its existing Retry (the reasoning part is still kept, so the stuck answer is visible if
      // expanded). A turn that performed a note action (create/edit card) is a real visible outcome,
      // so it's exempt even with no prose.
      const didNoteAction = parts.some(
        p =>
          p.type === "tool-create_note" ||
          p.type === "tool-propose_edit" ||
          p.type === "tool-save_edit" ||
          p.type === "tool-edit_note" // legacy
      );
      const finalStatus = status === "complete" && answer.trim().length === 0 && !didNoteAction ? "error" : status;
      chatTrace(generationId, "finalize-input", {
        status,
        finalStatus,
        emptyAnswerGuard: finalStatus !== status,
        partTypes: parts.map(p => p.type),
        textLen: answer.length,
        toolOutputsHydrated: toolOutputs.size,
        metadata: responseMessage.metadata,
      });
      finalizeAssistant(threadId, userId, generationId, {
        content: answer,
        parts,
        // model + cost, attached via messageMetadata above — persisted so the badge survives reload.
        metadata: responseMessage.metadata,
        status: finalStatus,
      }).catch(err => logger.error("Thread persistence (assistant finalize) failed:", err));
    },
    onError: err => {
      clearTurnTimers();
      partial?.cancel();
      chatTrace(generationId, "ui-error", { message: err instanceof Error ? err.message : String(err) });
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
