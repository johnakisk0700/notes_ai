import { AsyncLocalStorage } from "async_hooks";
import Decimal from "decimal.js";

export interface CostEntry {
  model: string;
  inputCost: Decimal;
  outputCost: Decimal;
  totalCost: Decimal;
  timestamp: Date;
}

interface CostStore {
  requestId: string;
  totalCost: Decimal;
  costEntries: CostEntry[];
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      getCostEntries: () => CostEntry[];
      addCost: (data: {
        model?: string;
        inputCost?: number | Decimal | null;
        outputCost?: number | Decimal | null;
      }) => void;
      getTotalCost: () => Decimal;
      getCostSummary: () => {
        requestId: string | null;
        totalCost: Decimal;
        entries: CostEntry[];
        entryCount: number;
      };
      getRequestId: () => string | null;
    }
  }
}

const costStorage = new AsyncLocalStorage<CostStore>();

export const costTracker = {
  /**
   * Creates a new context for a request and runs the callback within it.
   * The total cost is initialized to zero.
   * @param store Data to initialize the context with.
   * @param callback The function to execute within the new context.
   */
  run: <T>(store: { requestId: string }, callback: () => T): T => {
    return costStorage.run(
      {
        requestId: store.requestId,
        totalCost: new Decimal(0),
        costEntries: [],
      },
      callback
    );
  },

  /**
   * Adds a cost to the current request's total.
   * @param data An object containing model, inputCost, and outputCost.
   */
  addCost: (data: {
    model?: string;
    inputCost?: number | Decimal | null;
    outputCost?: number | Decimal | null;
    totalCost?: number | Decimal | null;
  }): void => {
    const store = costStorage.getStore();
    if (!store) return;

    try {
      const inputCost = new Decimal(data.inputCost || 0);
      const outputCost = new Decimal(data.outputCost || 0);
      const finalTotalCost = data.totalCost ? new Decimal(data.totalCost) : inputCost.plus(outputCost);

      store.costEntries.push({
        model: data.model || "unknown",
        inputCost,
        outputCost,
        totalCost: finalTotalCost,
        timestamp: new Date(),
      });

      store.totalCost = store.totalCost.plus(finalTotalCost);
    } catch (error) {
      console.warn("Failed to add cost:", error);
    }
  },

  /**
   * Gets the total cost for the current request.
   * @returns The total cost as a Decimal. Returns Decimal(0) if not in a request context.
   */
  getTotalCost: (): Decimal => {
    return costStorage.getStore()?.totalCost ?? new Decimal(0);
  },

  /**
   * Gets the cost entries for the current request.
   * @returns An array of cost entries. Returns an empty array if not in a request context.
   */
  getCostEntries: (): CostEntry[] => {
    return costStorage.getStore()?.costEntries ?? [];
  },

  /**
   * Gets a summary of the costs for the current request.
   * @returns An object containing the request ID, total cost, and cost entries.
   */
  getCostSummary: () => {
    const store = costStorage.getStore();
    return {
      requestId: store?.requestId ?? null,
      totalCost: store?.totalCost ?? new Decimal(0),
      entries: store?.costEntries ?? [],
      entryCount: store?.costEntries?.length ?? 0,
    };
  },

  /**
   * Gets the ID of the current request.
   * @returns The request ID string, or null if not in a request context.
   */
  getRequestId: (): string | null => {
    return costStorage.getStore()?.requestId ?? null;
  },
};
