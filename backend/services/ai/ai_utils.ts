import { usdToEur } from "utils/ecbConversionRates";
import { AI_MODELS } from "./ai_models.js";

// input/output in x$/1 million tokens
export const calculateCompletionCost = async (inputTokens: number, outputTokens: number, modelName: string) => {
  const { inputCost, outputCost } = AI_MODELS[modelName];

  // Calculate the actual cost based on the number of tokens
  // inputCost and outputCost are in X$/1 million tokens
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
