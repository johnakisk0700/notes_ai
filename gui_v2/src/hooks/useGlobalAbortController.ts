// Global abort controller instance
let globalAbortController: AbortController | null = null;

export const useGlobalAbortController = () => {
  const getController = () => {
    if (!globalAbortController || globalAbortController.signal.aborted) {
      globalAbortController = new AbortController();
    }
    return globalAbortController;
  };

  const getSignal = () => getController().signal;

  const cancelAll = () => {
    if (globalAbortController) {
      globalAbortController.abort();
      globalAbortController = null;
    }
  };

  return { getSignal, cancelAll };
};
