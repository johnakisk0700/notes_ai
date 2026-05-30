// Locks in the Mongo write paths behind the chat's poll-first durability — none of which had
// coverage before (only the pure `effectiveStatus`/`applyToolTransactions` did). The model is
// mocked so each branch (idempotent upsert, edit/retry truncate + its not-yet-persisted
// fall-through, finalize's placeholder-gone append, fail's streaming-only guard, the atomic
// tool-transaction $push) is driven deterministically without a real Mongo. The orphan-image
// sweep is covered here too because its data-loss safety (never delete a referenced/fresh file)
// is the whole point of the feature.
import { beforeEach, describe, expect, it, mock } from "bun:test";

// A 24-hex ObjectId check + generator, so we don't import the (heavy, event-loop-holding) real
// mongoose package into the test — chat-threads only ever uses isValidObjectId + Types.ObjectId.
const isHex24 = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
let oidSeq = 0;
class FakeObjectId {
  private readonly hex = (Date.now().toString(16) + (oidSeq++).toString(16).padStart(6, "0")).padStart(24, "0").slice(-24);
  toString() {
    return this.hex;
  }
}

const updateOne = mock();
const find = mock();
const deleteChatImage = mock();
const imageIdsFromMessages = mock();
const listImageOwners = mock();
const listUserImages = mock();
const loggerError = mock();

const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
// Mutable so a test can flip Mongo "down"; real isValidObjectId/Types so id validation behaves.
const fakeConnection = { readyState: 1 };

mock.module("model/mongo-db/UserThreads", () => ({
  UserThread: { updateOne, find, findOne: mock(), deleteOne: mock(), countDocuments: mock() },
}));
mock.module("services/chat-images", () => ({
  deleteChatImage,
  imageIdsFromMessages,
  listImageOwners,
  listUserImages,
  ORPHAN_IMAGE_MIN_AGE_MS: ORPHAN_MIN_AGE_MS,
  // Defensive: other modules in the suite import these from chat-images; keep them defined in
  // case this module mock leaks across files in the shared bun:test process.
  chatImageExists: mock(async () => true),
  chatImageIdFromUrl: mock(() => null),
  chatImageUrl: mock((id: string) => `/api/chat-image/${id}`),
  loadChatImage: mock(async () => null),
}));
mock.module("mongoose", () => ({
  default: { isValidObjectId: isHex24, Types: { ObjectId: FakeObjectId }, connection: fakeConnection },
}));
mock.module("utils/logger", () => ({ logger: { error: loggerError, info: mock(), warn: mock(), debug: mock() } }));

const { recordUserTurn, finalizeAssistant, failAssistant, updateThreadToolTransaction, pruneOrphanChatImages } =
  await import("./chat-threads.js");

const TID = "507f1f77bcf86cd799439011"; // a valid 24-hex ObjectId
const GEN = "aaaaaaaaaaaaaaaaaaaaaaaa"; // client-minted generationId (also 24-hex)

function leanResult(docs: unknown[]) {
  return { select: () => ({ lean: async () => docs }) };
}

beforeEach(() => {
  for (const m of [updateOne, find, deleteChatImage, imageIdsFromMessages, listImageOwners, listUserImages, loggerError])
    m.mockReset();
  fakeConnection.readyState = 1;
  updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  find.mockReturnValue(leanResult([]));
  deleteChatImage.mockResolvedValue(undefined);
  imageIdsFromMessages.mockReturnValue([]);
  listImageOwners.mockResolvedValue([]);
  listUserImages.mockResolvedValue([]);
});

describe("recordUserTurn", () => {
  it("appends the user turn + assistant placeholder as one idempotent upsert", async () => {
    const turn = recordUserTurn({ threadId: TID, userId: "u1", text: "hi", generationId: GEN });
    expect(turn.threadId).toBe(TID);
    expect(turn.serverMinted).toBe(false);
    await turn.persisted;

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = updateOne.mock.calls[0] as [any, any, any];
    expect(filter).toMatchObject({ _id: TID, user_id: "u1", "messages.generationId": { $ne: GEN } });
    expect(update.$push.messages.$each).toHaveLength(2); // user message + streaming placeholder
    expect(update.$push.messages.$each[0]).toMatchObject({ role: "user", content: "hi" });
    expect(update.$push.messages.$each[1]).toMatchObject({ role: "assistant", status: "streaming", generationId: GEN });
    expect(opts).toMatchObject({ upsert: true });
  });

  it("mints a server thread id when none/an invalid one is supplied", async () => {
    const turn = recordUserTurn({ threadId: "not-an-id", userId: "u1", text: "hi", generationId: GEN });
    expect(turn.serverMinted).toBe(true);
    expect(isHex24(turn.threadId)).toBe(true);
    await turn.persisted;
  });

  it("swallows a duplicate-key (E11000) replay without logging it as an error", async () => {
    updateOne.mockRejectedValueOnce({ code: 11000 });
    const turn = recordUserTurn({ threadId: TID, userId: "u1", text: "hi", generationId: GEN });
    await expect(turn.persisted).resolves.toBeUndefined();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("logs (best-effort) but never rejects on a non-duplicate write failure", async () => {
    updateOne.mockRejectedValueOnce(new Error("mongo down"));
    const turn = recordUserTurn({ threadId: TID, userId: "u1", text: "hi", generationId: GEN });
    await expect(turn.persisted).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  describe("edit/retry truncate", () => {
    it("truncates an existing thread with a single pipeline update", async () => {
      updateOne.mockResolvedValueOnce({ matchedCount: 1 }); // pipeline matched the existing doc
      const turn = recordUserTurn({ threadId: TID, userId: "u1", text: "edited", generationId: GEN, truncateToCount: 2 });
      await turn.persisted;
      expect(updateOne).toHaveBeenCalledTimes(1);
      expect(Array.isArray(updateOne.mock.calls[0][1])).toBe(true); // aggregation-pipeline update
    });

    it("falls through to a create when the thread isn't persisted yet (matchedCount 0)", async () => {
      updateOne.mockResolvedValueOnce({ matchedCount: 0 }); // pipeline matched nothing — thread not created yet
      updateOne.mockResolvedValueOnce({ matchedCount: 1, upsertedCount: 1 }); // fallback create-or-append
      const turn = recordUserTurn({ threadId: TID, userId: "u1", text: "edited", generationId: GEN, truncateToCount: 2 });
      await turn.persisted;
      expect(updateOne).toHaveBeenCalledTimes(2);
      expect(Array.isArray(updateOne.mock.calls[0][1])).toBe(true); // first: pipeline
      expect(updateOne.mock.calls[1][2]).toMatchObject({ upsert: true }); // second: idempotent upsert
      expect(updateOne.mock.calls[1][1].$push.messages.$each).toHaveLength(2);
    });
  });
});

describe("finalizeAssistant", () => {
  const message = { content: "answer", parts: [], metadata: { model: "m" }, status: "complete" as const };

  it("updates the placeholder in place and does NOT append when it exists", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await finalizeAssistant(TID, "u1", GEN, message);
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it("does nothing further when the thread doesn't exist (best-effort lost)", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    await finalizeAssistant(TID, "u1", GEN, message);
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it("appends the finished turn when the thread exists but its placeholder is gone", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 0 }); // placeholder missing
    updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }); // the append
    await finalizeAssistant(TID, "u1", GEN, message);
    expect(updateOne).toHaveBeenCalledTimes(2);
    const appended = updateOne.mock.calls[1][1] as any;
    expect(appended.$push.messages).toMatchObject({ role: "assistant", status: "complete", generationId: GEN });
  });

  it("returns early on an invalid thread id without touching Mongo", async () => {
    await finalizeAssistant("nope", "u1", GEN, message);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("failAssistant", () => {
  it("marks only a still-streaming placeholder as error (can't override a finalized turn)", async () => {
    await failAssistant(TID, "u1", GEN);
    const [, update, opts] = updateOne.mock.calls[0] as [any, any, any];
    expect(update.$set["messages.$[m].status"]).toBe("error");
    expect(opts.arrayFilters[0]).toMatchObject({ "m.generationId": GEN, "m.status": "streaming" });
  });
});

describe("updateThreadToolTransaction", () => {
  const transaction = { status: "applied" as const, updatedAt: "2026-05-30T00:00:00.000Z" };
  const base = { threadId: TID, userId: "u1", assistantMessageId: GEN, toolCallId: "tc1", transaction };

  it("appends the decision with a single atomic $push and returns true", async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    const ok = await updateThreadToolTransaction({ ...base, output: { saved: true } });
    expect(ok).toBe(true);
    const [, update, opts] = updateOne.mock.calls[0] as [any, any, any];
    expect(update.$push["messages.$[m].toolTransactions"]).toMatchObject({ toolCallId: "tc1", transaction, output: { saved: true } });
    expect(opts.arrayFilters).toEqual([{ "m.generationId": GEN }]);
  });

  it("returns false (and stops) when the assistant message isn't found", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const ok = await updateThreadToolTransaction(base);
    expect(ok).toBe(false);
    expect(updateOne).toHaveBeenCalledTimes(1); // no parts denormalization after a miss
  });

  it("omits `output` from the logged entry when it isn't provided", async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    await updateThreadToolTransaction(base);
    expect(updateOne.mock.calls[0][1].$push["messages.$[m].toolTransactions"]).not.toHaveProperty("output");
  });
});

describe("pruneOrphanChatImages", () => {
  const NOW = 1_700_000_000_000;
  const OLD = NOW - ORPHAN_MIN_AGE_MS - 60_000; // older than the min age
  const FRESH = NOW - 60_000; // well within the min age

  it("deletes only files that are BOTH old AND unreferenced", async () => {
    listImageOwners.mockResolvedValueOnce(["u1"]);
    listUserImages.mockResolvedValueOnce([
      { id: "old-unref", mtimeMs: OLD },
      { id: "old-ref", mtimeMs: OLD },
      { id: "fresh-unref", mtimeMs: FRESH },
    ]);
    find.mockReturnValueOnce(leanResult([{ messages: [] }]));
    imageIdsFromMessages.mockReturnValueOnce(["old-ref"]); // the referenced set for this user

    const res = await pruneOrphanChatImages(NOW);

    expect(deleteChatImage).toHaveBeenCalledTimes(1);
    expect(deleteChatImage).toHaveBeenCalledWith("u1", "old-unref"); // old-ref protected, fresh-unref protected
    expect(res).toMatchObject({ deleted: 1, scanned: 3 });
  });

  it("never queries Mongo or deletes when no file is old enough", async () => {
    listImageOwners.mockResolvedValueOnce(["u1"]);
    listUserImages.mockResolvedValueOnce([{ id: "fresh", mtimeMs: FRESH }]);
    const res = await pruneOrphanChatImages(NOW);
    expect(find).not.toHaveBeenCalled();
    expect(deleteChatImage).not.toHaveBeenCalled();
    expect(res).toMatchObject({ deleted: 0 });
  });

  it("skips a user WITHOUT deleting anything when the reference lookup fails (fail-safe)", async () => {
    listImageOwners.mockResolvedValueOnce(["u1"]);
    listUserImages.mockResolvedValueOnce([{ id: "old-unref", mtimeMs: OLD }]);
    find.mockImplementationOnce(() => {
      throw new Error("mongo down");
    });
    const res = await pruneOrphanChatImages(NOW);
    expect(deleteChatImage).not.toHaveBeenCalled();
    expect(res).toMatchObject({ deleted: 0 });
    expect(loggerError).toHaveBeenCalled();
  });

  it("no-ops when Mongo isn't connected", async () => {
    fakeConnection.readyState = 0;
    const res = await pruneOrphanChatImages(NOW);
    expect(res).toEqual({ scanned: 0, deleted: 0 });
    expect(listImageOwners).not.toHaveBeenCalled();
  });
});
