// Regression guard for the note-action tools. The bug that prompted these: propose_note_edit
// hit Postgres with a non-uuid id, the query threw, the tool stream aborted, and the UI card
// hung on a spinner forever. The invariant we lock in here: a write/action tool NEVER throws —
// it always resolves to a typed result the card can render (found:false / saved:false / data).
//
// The heavy clients are mocked so the tool graph imports without touching Postgres/Qdrant and
// each case can drive notesRepo/createNote deterministically.
import { beforeEach, describe, expect, it, mock } from "bun:test";

const findForUser = mock();
const createNote = mock();

mock.module("repositories/notes", () => ({ notesRepo: { findForUser } }));
mock.module("services/notes-write", () => ({ createNote }));
mock.module("clients/embedding_client", () => ({ embedText: async () => [], EMBEDDING_DIM: 3072 }));
mock.module("clients/qdrant_client", () => ({ qdrantClient: { query: async () => ({ points: [] }) } }));

const { buildNoteTools } = await import("./notes-tools.js");

const tools = () => buildNoteTools({ userIds: ["u1"], userId: "u1" });
const UUID = "11111111-1111-4111-8111-111111111111";

// The SDK types tool.execute as optional and 2-arg (input, ToolCallOptions), returning the
// output (or an async-iterable/promise). In a unit test we call it directly, so wrap that
// shape once and feed a throwaway options object; callers await the unknown result.
function invoke(toolDef: { execute?: (...args: never[]) => unknown }, input: unknown): unknown {
  return toolDef.execute!(input as never, { toolCallId: "test", messages: [] } as never);
}

describe("propose_note_edit", () => {
  beforeEach(() => {
    findForUser.mockClear();
    findForUser.mockReset();
  });

  it("returns found:false for a non-uuid id WITHOUT querying the DB", async () => {
    const result = await invoke(tools().propose_note_edit, { noteId: "not-a-uuid", newContent: "x" });
    expect(result).toEqual({ found: false, noteId: "not-a-uuid" });
    expect(findForUser).not.toHaveBeenCalled();
  });

  it("returns found:false when the note doesn't exist", async () => {
    findForUser.mockImplementation(async () => undefined);
    const result = await invoke(tools().propose_note_edit, { noteId: UUID, newContent: "x" });
    expect(result).toMatchObject({ found: false, noteId: UUID });
  });

  it("does NOT throw when the DB read throws — returns found:false", async () => {
    findForUser.mockImplementation(async () => {
      throw new Error("invalid input syntax for type uuid");
    });
    const result = await invoke(tools().propose_note_edit, { noteId: UUID, newContent: "x" });
    expect(result).toEqual({ found: false, noteId: UUID });
  });

  it("returns before/after and preserves the existing reminder", async () => {
    findForUser.mockImplementation(async () => ({
      title: "Λίστα",
      content: "γάλα",
      reminder: { remindAt: new Date("2026-06-01T10:00:00.000Z") },
    }));
    const result = await invoke(tools().propose_note_edit, { noteId: UUID, newContent: "γάλα, αυγά" });
    expect(result).toMatchObject({ found: true, noteId: UUID, before: "γάλα", after: "γάλα, αυγά" });
    expect((result as { remindAt: string }).remindAt).toBe("2026-06-01T10:00:00.000Z");
  });

  it("returns an empty remindAt when the note has no reminder", async () => {
    findForUser.mockImplementation(async () => ({ title: "T", content: "c", reminder: null }));
    const result = await invoke(tools().propose_note_edit, { noteId: UUID, newContent: "c2" });
    expect((result as { remindAt: string }).remindAt).toBe("");
  });
});

describe("create_note", () => {
  beforeEach(() => {
    createNote.mockClear();
    createNote.mockReset();
  });

  it("returns saved:true with the persisted note", async () => {
    createNote.mockImplementation(async () => ({
      id: "id1",
      title: "T",
      content: "C",
      created_at: new Date("2026-05-30T00:00:00.000Z"),
      remindAt: null,
    }));
    const result = await invoke(tools().create_note, { title: "T", content: "C" });
    expect(result).toMatchObject({ saved: true, noteId: "id1", title: "T", content: "C" });
  });

  it("returns saved:false instead of throwing when the save fails", async () => {
    createNote.mockImplementation(async () => {
      throw new Error("embed failed");
    });
    const result = await invoke(tools().create_note, { title: "T", content: "C" });
    expect(result).toMatchObject({ saved: false });
    expect((result as { error: string }).error).toContain("embed failed");
  });
});

describe("draft_note", () => {
  it("echoes the draft without persisting (no DB calls)", async () => {
    const result = await invoke(tools().draft_note, { title: "T", content: "C" });
    expect(result).toEqual({ openedInEditor: true, title: "T", content: "C" });
  });
});
