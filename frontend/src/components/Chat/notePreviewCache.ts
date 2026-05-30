// Session-lived caches that keep a note-action card stable across re-renders.
//
// Once a tool part has produced output, we remember it by toolCallId. A later re-render
// (or a remount when earlier parts grow/shift during streaming) that momentarily lacks
// output then can't drop the card back to a spinner — it keeps showing what it already
// had. This is the guard against the edit card "flashing once then sticking on loading".
// Kept out of the component so it's a pure, unit-testable seam.

const outputCache = new Map<string, unknown>();

// Apply/Discard decision per proposed edit, so the choice survives a remount.
export const editStatusCache = new Map<string, 'applied' | 'discarded'>();

export interface CachedToolPart {
  toolCallId?: string;
  output?: unknown;
}

/** The part's live output, falling back to the last value seen for this toolCallId. */
export function resolveOutput<T>(part: CachedToolPart): T | undefined {
  const id = part.toolCallId;
  const live = part.output as T | undefined;
  if (id && live !== undefined) outputCache.set(id, live);
  if (live !== undefined) return live;
  return id ? (outputCache.get(id) as T | undefined) : undefined;
}

/** Test seam: drop the session caches between cases. */
export function __resetNoteCardCaches(): void {
  outputCache.clear();
  editStatusCache.clear();
}
