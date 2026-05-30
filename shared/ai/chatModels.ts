// Selectable chat models for the agentic notes chat — the single source of truth shared
// by the frontend model selector and the backend model resolver. Keep this dependency-free
// (it's imported into the browser bundle via `@shared/ai/chatModels`).
export type ChatModelId =
  | "qwen/qwen3.6-plus"
  | "qwen/qwen3.6-flash"
  | "qwen/qwen3.5-flash-02-23"
  | "qwen/qwen3-max"
  | "qwen/qwen3-next-80b-a3b-instruct"
  | "z-ai/glm-5.1"
  | "z-ai/glm-4.7-flash"
  | "gpt-5-mini"
  | "gpt-5.4-mini"
  | "gpt-5.4-nano";

/** Capabilities surfaced as icons in the selector. */
export type ModelCapability = "reasoning" | "vision" | "tools";

/** Model maker — drives which brand icon the selector shows. */
export type ModelBrand = "openai" | "qwen" | "glm";

export interface ChatModelOption {
  id: ChatModelId;
  label: string;
  brand: ModelBrand;
  /** Short access-provider hint shown next to the label. */
  hint: string;
  /** One-line muted description under the label. */
  description: string;
  capabilities: ModelCapability[];
}

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: "qwen/qwen3.6-plus",
    label: "Qwen3.6 Plus",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Multimodal flagship · 1M context",
    capabilities: ["reasoning", "vision", "tools"],
  },
  {
    id: "qwen/qwen3.6-flash",
    label: "Qwen3.6 Flash",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Fast & cheap · 1M context",
    capabilities: ["reasoning", "vision", "tools"],
  },
  {
    id: "qwen/qwen3.5-flash-02-23",
    label: "Qwen3.5 Flash",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Cheapest · 1M context · vision",
    capabilities: ["reasoning", "vision", "tools"],
  },
  {
    id: "qwen/qwen3-max",
    label: "Qwen3 Max",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Flagship for RAG & tools · 256K",
    capabilities: ["tools"],
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct",
    label: "Qwen3 Next 80B",
    brand: "qwen",
    hint: "OpenRouter",
    description: "Lowest input cost · agentic",
    capabilities: ["tools"],
  },
  {
    id: "z-ai/glm-5.1",
    label: "GLM-5.1",
    brand: "glm",
    hint: "OpenRouter",
    description: "Agentic reasoning & coding",
    capabilities: ["reasoning", "tools"],
  },
  {
    id: "z-ai/glm-4.7-flash",
    label: "GLM-4.7 Flash",
    brand: "glm",
    hint: "OpenRouter",
    description: "Cheapest GLM tool-caller",
    capabilities: ["reasoning", "tools"],
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    brand: "openai",
    hint: "OpenAI",
    description: "Fast, reliable fallback",
    capabilities: ["reasoning", "vision", "tools"],
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    brand: "openai",
    hint: "OpenAI",
    description: "Newer GPT mini · strong Greek",
    capabilities: ["reasoning", "tools"],
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    brand: "openai",
    hint: "OpenAI",
    description: "Cheapest OpenAI tool-caller",
    capabilities: ["reasoning", "tools"],
  },
];

export const DEFAULT_CHAT_MODEL: ChatModelId = "qwen/qwen3.6-plus";

export function isChatModelId(value: unknown): value is ChatModelId {
  return typeof value === "string" && CHAT_MODELS.some(m => m.id === value);
}

// Reasoning / thinking effort — supported by the reasoning-capable models above.
export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

export function supportsReasoning(id: ChatModelId): boolean {
  return CHAT_MODELS.find(m => m.id === id)?.capabilities.includes("reasoning") ?? false;
}
