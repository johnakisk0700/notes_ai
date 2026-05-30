// Locks in the poll-first read-time staleness rule: a "streaming" assistant placeholder that
// the generating worker abandoned (crash / deadline) must be served as "error" so the client
// stops polling, while a live-but-slow turn (fresh heartbeat) keeps streaming. The threshold is
// compared to the `updatedAt` HEARTBEAT (bumped on every partial write), not the create time.
import { describe, expect, it } from "bun:test";
import { applyToolTransactions, effectiveStatus, STALE_MS } from "./chat-threads.js";

const NOW = 1_700_000_000_000;

describe("effectiveStatus", () => {
  it("passes non-streaming statuses through unchanged", () => {
    expect(effectiveStatus({ status: "complete" }, NOW)).toBe("complete");
    expect(effectiveStatus({ status: "error" }, NOW)).toBe("error");
    expect(effectiveStatus({}, NOW)).toBeUndefined();
  });

  it("keeps a freshly-heartbeat streaming placeholder streaming", () => {
    expect(effectiveStatus({ status: "streaming", updatedAt: NOW - 5_000 }, NOW)).toBe("streaming");
  });

  it("ages an abandoned streaming placeholder to error past STALE_MS", () => {
    expect(effectiveStatus({ status: "streaming", updatedAt: NOW - STALE_MS - 1 }, NOW)).toBe("error");
  });

  it("uses the heartbeat (updatedAt), not create time, so a live-but-slow turn survives", () => {
    const m = { status: "streaming" as const, updatedAt: NOW - 1_000, timestamp: new Date(NOW - STALE_MS - 5_000) };
    expect(effectiveStatus(m, NOW)).toBe("streaming");
  });

  it("falls back to timestamp before the first heartbeat lands", () => {
    expect(effectiveStatus({ status: "streaming", timestamp: new Date(NOW - STALE_MS - 1) }, NOW)).toBe("error");
    expect(effectiveStatus({ status: "streaming", timestamp: new Date(NOW - 1_000) }, NOW)).toBe("streaming");
  });

  it("keeps STALE_MS comfortably above the 60s turn deadline", () => {
    expect(STALE_MS).toBeGreaterThan(60_000);
  });
});

// The read-time overlay of tool-action decisions onto the persisted parts. Its last-wins dedup is
// what makes the write path's single atomic $push safe (a rapid re-click can append a second entry
// for the same toolCallId; the most recent must win here).
describe("applyToolTransactions", () => {
  const tx = { status: "applied", updatedAt: "2026-05-30T00:00:00.000Z" } as const;

  it("returns undefined when there are no parts to overlay onto", () => {
    expect(applyToolTransactions(undefined, [{ toolCallId: "a", transaction: tx }])).toBeUndefined();
    expect(applyToolTransactions([], [{ toolCallId: "a", transaction: tx }])).toBeUndefined();
  });

  it("returns the parts unchanged when there are no patches", () => {
    const parts = [{ type: "tool-create_note", toolCallId: "a" }];
    expect(applyToolTransactions(parts, undefined)).toBe(parts);
    expect(applyToolTransactions(parts, [])).toBe(parts);
  });

  it("overlays the transaction onto the matching tool part and leaves others untouched", () => {
    const parts = [
      { type: "tool-propose_note_edit", toolCallId: "a" },
      { type: "text", text: "hi" },
    ];
    const out = applyToolTransactions(parts, [{ toolCallId: "a", transaction: tx }])!;
    expect(out[0]).toMatchObject({ toolCallId: "a", transaction: tx });
    expect(out[1]).toEqual({ type: "text", text: "hi" });
  });

  it("attaches output + an output-available state when the patch carries output", () => {
    const parts = [{ type: "tool-create_note", toolCallId: "a" }];
    const out = applyToolTransactions(parts, [{ toolCallId: "a", transaction: tx, output: { saved: true } }])!;
    expect(out[0]).toMatchObject({ transaction: tx, output: { saved: true }, state: "output-available" });
  });

  it("keeps the LAST patch when a toolCallId is duplicated (chronological last-wins)", () => {
    const parts = [{ type: "tool-propose_note_edit", toolCallId: "a" }];
    const applied = { status: "applied", updatedAt: "t1" };
    const discarded = { status: "discarded", updatedAt: "t2" };
    const out = applyToolTransactions(parts, [
      { toolCallId: "a", transaction: applied },
      { toolCallId: "a", transaction: discarded },
    ])!;
    expect((out[0] as { transaction: unknown }).transaction).toEqual(discarded);
  });

  it("ignores patches that carry no transaction", () => {
    const parts = [{ type: "tool-create_note", toolCallId: "a" }];
    expect(applyToolTransactions(parts, [{ toolCallId: "a" }])).toBe(parts);
  });
});
