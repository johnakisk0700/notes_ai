// Locks in the poll-first read-time staleness rule: a "streaming" assistant placeholder that
// the generating worker abandoned (crash / deadline) must be served as "error" so the client
// stops polling, while a live-but-slow turn (fresh heartbeat) keeps streaming. The threshold is
// compared to the `updatedAt` HEARTBEAT (bumped on every partial write), not the create time.
import { describe, expect, it } from "bun:test";
import { effectiveStatus, STALE_MS } from "./chat-threads.js";

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
