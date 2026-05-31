// Selectable chat models for the agentic notes chat — the single source of truth shared
// by the frontend model selector and the backend model resolver. Keep this dependency-free
// (it's imported into the browser bundle via `@shared/ai/chatModels`).
//
// Policy (2026-05): the SELECTOR (CHAT_MODELS) is deliberately small — Qwen3.7-Max (default,
// deepest reasoning, text-only), Qwen3.6-Plus (multimodal — the vision pick), GLM-5.1, and
// GPT-5.4-mini (the OpenAI cross-provider option, also vision-capable). The ChatModelId TYPE
// below stays broader than the selector on purpose: it also covers the server's OpenAI fallback
// and the legacy note-titling path (services/ai/ai_chat.ts), which aren't user-selectable.
export type ChatModelId =
  | "qwen/qwen3.6-plus"
  | "qwen/qwen3.6-max"
  | "qwen/qwen3.7-max"
  | "z-ai/glm-5.1"
  | "gpt-5-mini"
  | "gpt-5.4-mini"
  | "gpt-5.4-nano";

/** Capabilities surfaced as icons in the selector. */
export type ModelCapability = "reasoning" | "vision" | "tools";

/** Model maker — drives which brand icon the selector shows. */
export type ModelBrand = "openai" | "qwen" | "glm";

// Reasoning / thinking effort, ordered low→high. "minimal" is the floor for limiting a
// model's thinking (real on OpenAI's gpt-5 family); each model exposes its own subset via
// `efforts` below, so a cheap model can be capped and a flagship offered the full range.
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

export interface ChatModelOption {
  id: ChatModelId;
  label: string;
  brand: ModelBrand;
  /** Short access-provider hint shown next to the label. */
  hint: string;
  /** One-line muted description under the label. */
  description: string;
  capabilities: ModelCapability[];
  /**
   * Reasoning-effort levels this model accepts, low→high. The effort picker shows exactly
   * these for the selected model, so a budget model can be capped (limit its thinking) and a
   * flagship offered the full range (push it higher). Every entry must be a REASONING_EFFORTS
   * member; omit only for non-reasoning models (no effort picker). OpenRouter's reasoning API
   * has no level below "low", so OpenRouter models start at "low"; "minimal" is OpenAI-only.
   */
  efforts?: ReasoningEffort[];
}

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: "qwen/qwen3.7-max",
    label: "Qwen3.7 Max",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Top Max tier · deepest reasoning",
    capabilities: ["reasoning", "tools"],
    efforts: ["low", "medium", "high"],
  },
  {
    id: "qwen/qwen3.6-plus",
    label: "Qwen3.6 Plus",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Multimodal flagship · pick for images",
    capabilities: ["reasoning", "vision", "tools"],
    efforts: ["low", "medium", "high"],
  },
  {
    id: "z-ai/glm-5.1",
    label: "GLM-5.1",
    brand: "glm",
    hint: "OpenRouter",
    description: "Agentic reasoning & coding",
    capabilities: ["reasoning", "tools"],
    efforts: ["low", "medium", "high"],
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    brand: "openai",
    hint: "OpenAI",
    description: "OpenAI option · vision + strong Greek",
    capabilities: ["reasoning", "vision", "tools"],
    efforts: ["minimal", "low", "medium", "high"],
  },
];

// Qwen3.7-Max is the default: in testing it reliably emits its answer in the content channel,
// whereas Qwen3.6-Plus intermittently leaves the answer stuck in the reasoning channel (empty
// visible content — caught by the empty-answer guard in agentic-rag.ts). 3.7-Max is text-only,
// so the composer steers users to a vision model (3.6-Plus / GPT-5.4-mini) when they attach an image.
export const DEFAULT_CHAT_MODEL: ChatModelId = "qwen/qwen3.7-max";

export function isChatModelId(value: unknown): value is ChatModelId {
  return typeof value === "string" && CHAT_MODELS.some(m => m.id === value);
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

export function supportsReasoning(id: ChatModelId): boolean {
  return CHAT_MODELS.find(m => m.id === id)?.capabilities.includes("reasoning") ?? false;
}

/** Effort levels the given model accepts (low→high). Empty for non-reasoning models. */
export function effortsForModel(id: ChatModelId): ReasoningEffort[] {
  const model = CHAT_MODELS.find(m => m.id === id);
  if (!model || !model.capabilities.includes("reasoning")) return [];
  return model.efforts ?? [...REASONING_EFFORTS];
}

/**
 * Clamp a requested effort to what the model actually offers, picking the nearest allowed
 * level (by position in REASONING_EFFORTS) when it's out of range — so switching models can
 * never leave an effort the model would reject. Returns undefined for non-reasoning models.
 */
export function clampEffortForModel(id: ChatModelId, effort: ReasoningEffort): ReasoningEffort | undefined {
  const allowed = effortsForModel(id);
  if (allowed.length === 0) return undefined;
  if (allowed.includes(effort)) return effort;
  const order = REASONING_EFFORTS as readonly ReasoningEffort[];
  const want = order.indexOf(effort);
  let best = allowed[0];
  let bestDist = Infinity;
  for (const e of allowed) {
    const dist = Math.abs(order.indexOf(e) - want);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

/** Whether the model can see image input — gates chat image upload in the composer. */
export function modelHasVision(id: ChatModelId): boolean {
  return CHAT_MODELS.find(m => m.id === id)?.capabilities.includes("vision") ?? false;
}
