// Derive the durable terminal status of a finished assistant turn.
//
// A clean turn always emits a `finish` chunk (so the AI SDK sets `finishReason`) plus finish
// metadata. A plain stream error (provider 5xx, a throw in `execute`, a mid-stream drop) emits
// only an `error` chunk — NO `finish` — so the SDK leaves `finishReason` undefined and
// `isAborted` false; only the deadline/abort path sets `isAborted`. So a missing/error
// `finishReason` (or an abort) is the *only* reliable signal that a turn FAILED. Treating it as
// failure is what stops a crashed or errored (often empty) generation from being persisted —
// and shown — as a successful answer.
export function resolveTurnStatus(opts: { isAborted: boolean; finishReason?: string }): "complete" | "error" {
  const { isAborted, finishReason } = opts;
  return !isAborted && finishReason != null && finishReason !== "error" ? "complete" : "error";
}
