// Guards the durable-status derivation that decides whether a finished turn is persisted as
// "complete" or "error". The bug this locks out: the AI SDK does NOT set `finishReason` on a
// plain stream error (only the deadline abort sets `isAborted`), so the old `finishReason ===
// "error"` test let errored/empty turns be saved — and shown — as successful answers.
import { describe, expect, it } from "bun:test";
import { resolveTurnStatus } from "./turn-status.js";

describe("resolveTurnStatus", () => {
  it("is complete only for a clean finish (finishReason set, not error, not aborted)", () => {
    expect(resolveTurnStatus({ isAborted: false, finishReason: "stop" })).toBe("complete");
    expect(resolveTurnStatus({ isAborted: false, finishReason: "tool-calls" })).toBe("complete");
  });

  it("is error when the SDK leaves finishReason undefined (a plain stream error / execute throw)", () => {
    expect(resolveTurnStatus({ isAborted: false, finishReason: undefined })).toBe("error");
  });

  it("is error on an explicit error finishReason", () => {
    expect(resolveTurnStatus({ isAborted: false, finishReason: "error" })).toBe("error");
  });

  it("is error on abort (deadline / client disconnect)", () => {
    expect(resolveTurnStatus({ isAborted: true, finishReason: "stop" })).toBe("error");
    expect(resolveTurnStatus({ isAborted: true, finishReason: undefined })).toBe("error");
  });
});
