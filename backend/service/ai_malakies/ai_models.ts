import Decimal from "decimal.js";
import { usdToEur } from "utils/ecbConversionRates";

// This is a list of AI models supported by the system.
export type ModelNames =
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano"
  | "o3"
  | "o3-azure"
  | "o3-mini"
  | "o4-mini"
  | "gpt-4o-transcribe"
  | "gpt-4o-mini-transcribe"
  | "claude-sonnet-4-latest"
  | "claude-opus-4-latest"
  | "claude-3-7-sonnet-latest"
  | "claude-3-5-haiku-latest"
  | "accounts/fireworks/models/llama4-maverick-instruct-basic"
  | "accounts/fireworks/models/qwen3-235b-a22b";

export interface ModelInfo {
  provider: "gpt" | "claude" | "fireworks-ai" | "deepseek" | "azure-openai";
  inputCost: Decimal;
  outputCost: Decimal;
}

export type ModelsMap = Record<ModelNames, ModelInfo>;

export const AI_MODELS: ModelsMap = {
  o3: {
    provider: "gpt",
    inputCost: new Decimal(0),
    outputCost: new Decimal(0),
  },
  // o3 from different provider example
  "o3-azure": {
    provider: "azure-openai",
    inputCost: new Decimal(0.000002),
    outputCost: new Decimal(0.000008),
  },
  "o4-mini": {
    provider: "gpt",
    inputCost: new Decimal(0),
    outputCost: new Decimal(0),
  },
  "o3-mini": {
    provider: "gpt",
    inputCost: new Decimal(0.000005),
    outputCost: new Decimal(0.00002),
  },
  "gpt-4.1": {
    provider: "gpt",
    inputCost: new Decimal(0.000002),
    outputCost: new Decimal(0.000008),
  },
  "gpt-4.1-mini": {
    provider: "gpt",
    inputCost: new Decimal(0.0000004),
    outputCost: new Decimal(0.0000016),
  },
  "gpt-4.1-nano": {
    provider: "gpt",
    inputCost: new Decimal(0.0000001),
    outputCost: new Decimal(0.0000004),
  },
  "gpt-4o-transcribe": {
    provider: "gpt",
    inputCost: new Decimal(0.0000025),
    outputCost: new Decimal(0.00001),
  },
  "gpt-4o-mini-transcribe": {
    provider: "gpt",
    inputCost: new Decimal(0.00000125),
    outputCost: new Decimal(0.000005),
  },
  "claude-sonnet-4-latest": {
    provider: "claude",
    inputCost: new Decimal(0),
    outputCost: new Decimal(0),
  },
  "claude-opus-4-latest": {
    provider: "claude",
    inputCost: new Decimal(0),
    outputCost: new Decimal(0),
  },
  "claude-3-7-sonnet-latest": {
    provider: "claude",
    inputCost: new Decimal(0.000003),
    outputCost: new Decimal(0.000015),
  },
  "claude-3-5-haiku-latest": {
    provider: "claude",
    inputCost: new Decimal(0.0000008),
    outputCost: new Decimal(0.000004),
  },

  "accounts/fireworks/models/llama4-maverick-instruct-basic": {
    provider: "fireworks-ai",
    inputCost: new Decimal(0),
    outputCost: new Decimal(0),
  },
  "accounts/fireworks/models/qwen3-235b-a22b": {
    provider: "fireworks-ai",
    inputCost: new Decimal(0),
    outputCost: new Decimal(0),
  },
};
