// Pure visual-state decision for a tool chip (ToolCallCard) — kept out of the component so the
// "a chip is never stuck on a spinner once the answer is in" rule is unit-testable.
//
// A tool call shows as:
//   • 'running' — ONLY while its turn is still live AND no result has arrived yet
//   • 'error'   — a hard tool error (state "output-error") OR a self-reported failure: the
//                 never-throw web tools return { ok:false } instead of throwing
//   • 'done'    — otherwise (a result is in hand, or the turn has settled)
//
// Keying 'running' off the turn's SETTLED state — not just part.state — is the fix for the chip
// that "returned a result but stayed spinning": the AI SDK live overlay can leave a tool part at
// input-available, and the poll/reconcile race can persist that, so part.state alone is unreliable.
// Once the turn is settled (status complete/error) no tool on it can still be running.

export type ToolCallVisualState = 'running' | 'error' | 'done';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toolCallVisualState(opts: {
  state?: string;
  output: unknown; // the resolved (cache-backed) tool output, or undefined if none yet
  settled: boolean; // the turn this call belongs to has finished (status complete/error)
}): ToolCallVisualState {
  const selfReportedFailure = isRecord(opts.output) && opts.output.ok === false;
  if (opts.state === 'output-error' || selfReportedFailure) return 'error';
  if (opts.output !== undefined || opts.settled) return 'done';
  return 'running';
}
