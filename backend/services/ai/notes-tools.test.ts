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
const updateNote = mock();
const searchNames = mock();

mock.module("repositories/notes", () => ({ notesRepo: { findForUser } }));
mock.module("repositories/lookups", () => ({ lookupsRepo: { searchNames } }));
mock.module("services/notes-write", () => ({ createNote, updateNote }));
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

describe("propose_edit", () => {
  beforeEach(() => {
    findForUser.mockClear();
    findForUser.mockReset();
    updateNote.mockClear();
    updateNote.mockReset();
  });

  it("returns found:false for a non-uuid id WITHOUT querying the DB", async () => {
    const result = await invoke(tools().propose_edit, { noteId: "not-a-uuid", newContent: "x" });
    expect(result).toEqual({ found: false, noteId: "not-a-uuid" });
    expect(findForUser).not.toHaveBeenCalled();
  });

  it("returns found:false when the note doesn't exist", async () => {
    findForUser.mockImplementation(async () => undefined);
    const result = await invoke(tools().propose_edit, { noteId: UUID, newContent: "x" });
    expect(result).toMatchObject({ found: false, noteId: UUID });
  });

  it("does NOT throw when the DB read throws — returns found:false", async () => {
    findForUser.mockImplementation(async () => {
      throw new Error("invalid input syntax for type uuid");
    });
    const result = await invoke(tools().propose_edit, { noteId: UUID, newContent: "x" });
    expect(result).toEqual({ found: false, noteId: UUID });
  });

  it("returns a before/after and writes NOTHING", async () => {
    findForUser.mockImplementation(async () => ({ title: "Λίστα", content: "γάλα" }));
    const result = await invoke(tools().propose_edit, { noteId: UUID, newContent: "γάλα, αυγά" });
    expect(result).toMatchObject({ found: true, noteId: UUID, before: "γάλα", after: "γάλα, αυγά" });
    expect(updateNote).not.toHaveBeenCalled();
  });
});

describe("save_edit", () => {
  beforeEach(() => {
    findForUser.mockClear();
    findForUser.mockReset();
    updateNote.mockClear();
    updateNote.mockReset();
  });

  it("returns found:false for a non-uuid id WITHOUT querying the DB", async () => {
    const result = await invoke(tools().save_edit, { noteId: "not-a-uuid", newContent: "x" });
    expect(result).toEqual({ found: false, noteId: "not-a-uuid" });
    expect(findForUser).not.toHaveBeenCalled();
  });

  it("writes the change immediately", async () => {
    findForUser.mockImplementation(async () => ({ title: "Λίστα", content: "γάλα" }));
    updateNote.mockImplementation(async () => ({
      id: UUID,
      title: "Λίστα",
      content: "γάλα, αυγά",
      created_at: new Date("2026-05-30T00:00:00.000Z"),
    }));
    const result = await invoke(tools().save_edit, { noteId: UUID, newContent: "γάλα, αυγά" });
    expect(result).toMatchObject({ found: true, saved: true, noteId: UUID, content: "γάλα, αυγά" });
    expect(updateNote).toHaveBeenCalledTimes(1);
  });

  it("returns saved:false (NOT found:false) when the write fails", async () => {
    findForUser.mockImplementation(async () => ({ title: "Λίστα", content: "γάλα" }));
    updateNote.mockImplementation(async () => {
      throw new Error("embed failed");
    });
    const result = await invoke(tools().save_edit, { noteId: UUID, newContent: "x" });
    expect(result).toMatchObject({ found: true, saved: false });
    expect((result as { error: string }).error).toContain("embed failed");
  });
});

// The structural backstop for the model calling propose_edit AND save_edit on the same note in one
// turn: the first edit wins, the second (same note) is skipped — so a propose+save can't double-write.
describe("one edit per note per turn", () => {
  beforeEach(() => {
    findForUser.mockClear();
    findForUser.mockReset();
    updateNote.mockClear();
    updateNote.mockReset();
  });

  it("skips a save_edit for a note already proposed THIS turn (no write)", async () => {
    findForUser.mockImplementation(async () => ({ title: "Λίστα", content: "γάλα" }));
    const turn = tools(); // one tool set = one turn (shared per-turn guard)
    const proposed = await invoke(turn.propose_edit, { noteId: UUID, newContent: "γάλα, αυγά" });
    expect(proposed).toMatchObject({ found: true, before: "γάλα", after: "γάλα, αυγά" });
    const saved = await invoke(turn.save_edit, { noteId: UUID, newContent: "γάλα, αυγά" });
    expect(saved).toMatchObject({ found: true, skipped: true, noteId: UUID });
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("allows editing a DIFFERENT note in the same turn", async () => {
    const UUID2 = "22222222-2222-4222-8222-222222222222";
    findForUser.mockImplementation(async () => ({ title: "Λίστα", content: "γάλα" }));
    updateNote.mockImplementation(async () => ({ id: UUID2, title: "Λίστα", content: "y", created_at: new Date("2026-05-30T00:00:00.000Z") }));
    const turn = tools();
    await invoke(turn.propose_edit, { noteId: UUID, newContent: "a" });
    const saved = await invoke(turn.save_edit, { noteId: UUID2, newContent: "y" });
    expect(saved).toMatchObject({ found: true, saved: true, noteId: UUID2 });
    expect(updateNote).toHaveBeenCalledTimes(1);
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

describe("create_note (draft mode)", () => {
  beforeEach(() => createNote.mockClear());

  it("echoes the draft without persisting when mode is 'draft'", async () => {
    const result = await invoke(tools().create_note, { title: "T", content: "C", mode: "draft" });
    expect(result).toEqual({ mode: "draft", openedInEditor: true, title: "T", content: "C" });
    expect(createNote).not.toHaveBeenCalled();
  });
});

describe("lookup_names", () => {
  beforeEach(() => {
    searchNames.mockClear();
    searchNames.mockReset();
  });

  it("returns the matched names with a count", async () => {
    searchNames.mockImplementation(async () => ["Παπαδόπουλος", "Παπαδάκης"]);
    const result = await invoke(tools().lookup_names, { kind: "customers", query: "παπαδ" });
    expect(result).toEqual({ kind: "customers", count: 2, names: ["Παπαδόπουλος", "Παπαδάκης"] });
  });

  it("never throws — returns an empty list when the lookup fails", async () => {
    searchNames.mockImplementation(async () => {
      throw new Error("db down");
    });
    const result = await invoke(tools().lookup_names, { kind: "wines" });
    expect(result).toEqual({ kind: "wines", count: 0, names: [] });
  });
});
