// Guards the web tools' contract: web_search wraps the client's results with a count, and
// fetch_page passes the client's typed result (page or { ok:false }) straight through. The
// underlying clients are mocked so the tool graph imports without touching the network.
import { beforeEach, describe, expect, it, mock } from "bun:test";

const webSearch = mock();
const fetchPage = mock();

mock.module("clients/web_search_client", () => ({ webSearch }));
mock.module("clients/web_fetch", () => ({ fetchPage }));

const { buildWebTools } = await import("./web-tools.js");

const tools = () => buildWebTools();

// The SDK calls tool.execute as (input, ToolCallOptions); call it directly with a throwaway
// options object (no abortSignal — it's optional).
function invoke(toolDef: { execute?: (...args: never[]) => unknown }, input: unknown): unknown {
  return toolDef.execute!(input as never, { toolCallId: "test", messages: [] } as never);
}

describe("web_search", () => {
  beforeEach(() => {
    webSearch.mockClear();
    webSearch.mockReset();
  });

  it("wraps the client results with a count", async () => {
    webSearch.mockImplementation(async () => [{ title: "t", url: "https://u", snippet: "s" }]);
    const result = await invoke(tools().web_search, { query: "x" });
    expect(result).toEqual({ count: 1, results: [{ title: "t", url: "https://u", snippet: "s" }] });
  });

  it("returns an empty result set when the client finds nothing", async () => {
    webSearch.mockImplementation(async () => []);
    const result = await invoke(tools().web_search, { query: "x" });
    expect(result).toEqual({ count: 0, results: [] });
  });
});

describe("fetch_page", () => {
  beforeEach(() => {
    fetchPage.mockClear();
    fetchPage.mockReset();
  });

  it("passes a fetched page straight through", async () => {
    fetchPage.mockImplementation(async () => ({ ok: true, url: "https://u", title: "T", text: "hi" }));
    const result = await invoke(tools().fetch_page, { url: "https://example.com" });
    expect(result).toMatchObject({ ok: true, url: "https://u", text: "hi" });
  });

  it("passes a typed fetch error straight through (no throw)", async () => {
    fetchPage.mockImplementation(async () => ({ ok: false, url: "https://u", error: "boom" }));
    const result = await invoke(tools().fetch_page, { url: "https://u" });
    expect(result).toMatchObject({ ok: false, error: "boom" });
  });
});
