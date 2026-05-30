import Decimal from "decimal.js";
import { usdToEur } from "utils/ecbConversionRates";
import { AI_MODELS, type ModelNames } from "./ai_models.js";

// inputCost/outputCost are USD per single token (e.g. $0.25/1M == 0.00000025 per token)
export const calculateCompletionCost = async (inputTokens: number, outputTokens: number, modelName: ModelNames) => {
  const { inputCost, outputCost } = AI_MODELS[modelName];

  // Calculate the actual cost based on the number of tokens
  // inputCost and outputCost are USD per single token (e.g. $0.25/1M == 0.00000025 per token)
  const actualInputCost = inputCost.times(inputTokens).toDecimalPlaces(10);
  const actualOutputCost = outputCost.times(outputTokens).toDecimalPlaces(10);

  // turn it to euro:
  const actualInputCostEur = await usdToEur(actualInputCost);
  const actualOutputCostEur = await usdToEur(actualOutputCost);

  // total cost in EUR
  const totalCost = actualOutputCostEur.add(actualInputCostEur);

  return {
    inputCost: actualInputCostEur,
    outputCost: actualOutputCostEur,
    totalCost,
  };
};

// Total completion cost in EUR, computed synchronously from a pre-fetched rate
// (`getEurPerUsd`) — for callers that can't await, like the AI SDK message-metadata
// callback. Same pricing as calculateCompletionCost; prices are per-token.
export function completionCostEur(
  inputTokens: number,
  outputTokens: number,
  modelName: ModelNames,
  eurPerUsd: Decimal
): Decimal {
  const { inputCost, outputCost } = AI_MODELS[modelName];
  const usd = inputCost.times(inputTokens).plus(outputCost.times(outputTokens));
  return usd.times(eurPerUsd).toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
}
