// Locks in the model-input projection that keeps a thread from wedging after an interrupted
// turn: prior assistant turns are reduced to their text answer (their fragile tool/reasoning/
// step parts — which round-trip from Mongo with null provider fields / empty reasoning / dangling
// tool calls — would otherwise fail the strict ModelMessage schema and make streamText reject the
// whole prompt). User turns (incl. image file parts) are left intact.
import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";
import { historyForModel } from "./message-history.js";

const msg = (role: string, parts: unknown[]): UIMessage => ({ id: "x", role, parts }) as unknown as UIMessage;

describe("historyForModel", () => {
  it("reduces a prior assistant turn to its text parts, dropping tool/reasoning/step parts", () => {
    const out = historyForModel([
      msg("assistant", [
        { type: "step-start" },
        { type: "reasoning", text: "thinking" },
        {
          type: "tool-search_notes",
          toolCallId: "t",
          state: "output-available",
          input: {},
          output: {},
          providerExecuted: null,
        },
        { type: "text", text: "Here is the answer." },
      ]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].parts).toEqual([{ type: "text", text: "Here is the answer." }]);
  });

  it("adds deterministic note-action summaries to assistant model history", () => {
    const out = historyForModel([
      msg("assistant", [
        { type: "text", text: "I found the note." },
        {
          type: "tool-propose_note_edit",
          toolCallId: "edit-1",
          state: "output-available",
          output: {
            found: true,
            noteId: "n1",
            title: "Shopping",
            before: "milk",
            after: "milk, eggs",
          },
          transaction: { status: "applied", updatedAt: "2026-05-30T00:00:00.000Z" },
        },
      ]),
    ]);

    const text = (out[0].parts[0] as { text: string }).text;
    expect(text).toContain("I found the note.");
    expect(text).toContain("A note edit was proposed for \"Shopping\" (n1).");
    expect(text).toContain("Before: milk.");
    expect(text).toContain("After: milk, eggs.");
    expect(text).toContain("The user accepted/applied this edit.");
  });

  it("keeps tool-only note-action turns when they have durable summary value", () => {
    const out = historyForModel([
      msg("assistant", [
        {
          type: "tool-create_note",
          toolCallId: "create-1",
          state: "output-available",
          output: { saved: true, noteId: "n1", title: "Idea", content: "Ship it" },
        },
      ]),
    ]);

    expect(out).toHaveLength(1);
    expect((out[0].parts[0] as { text: string }).text).toContain("A note was created and saved");
  });

  it("leaves user turns untouched (image file part survives)", () => {
    const user = msg("user", [
      { type: "file", url: "/api/chat-image/abc", mediaType: "image/png" },
      { type: "text", text: "what is this?" },
    ]);
    const out = historyForModel([user]);
    expect(out[0].parts).toEqual(user.parts);
  });

  it("drops an interrupted/errored assistant turn that has no text (empty or tool-only)", () => {
    const out = historyForModel([
      msg("user", [{ type: "text", text: "q" }]),
      msg("assistant", []), // empty error placeholder
      msg("assistant", [{ type: "text", text: "   " }]), // whitespace-only
      msg("assistant", [{ type: "tool-search_notes", toolCallId: "t", state: "input-available", input: {} }]), // dangling tool, no text
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
  });

  it("keeps a partially-streamed interrupted answer that did produce text", () => {
    const out = historyForModel([
      msg("assistant", [
        { type: "text", text: "Let me che" },
        { type: "reasoning", text: "r" },
      ]),
    ]);
    expect(out[0].parts).toEqual([{ type: "text", text: "Let me che" }]);
  });
});
