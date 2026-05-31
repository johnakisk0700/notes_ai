// The chat model's web tools: web_search (find pages) and fetch_page (read one). Kept separate from
// the note tools (notes-tools.ts) because they carry NO user/tenancy — the search backend and the
// page fetch are global. Both honor the same never-throw contract: the underlying clients return a
// typed result (empty results / { ok:false }) instead of throwing, so a web fault degrades the card
// rather than erroring the turn. They also honor the SDK-provided abortSignal so the turn watchdog
// (the idle/max abort in agentic-rag.ts) can cut a wedged request.
import { tool } from "ai";
import { z } from "zod";
import { webSearch } from "clients/web_search_client";
import { fetchPage } from "clients/web_fetch";

export function buildWebTools() {
  return {
    web_search: tool({
      description:
        "Search the public web for information that is NOT in the user's notes — current events, " +
        "facts, definitions, prices, anything external. Returns a list of results (title, url, short " +
        "snippet). To read a result in full, call fetch_page with its url. Prefer the note tools for " +
        "anything about the user or their own notes.",
      inputSchema: z.object({
        query: z.string().describe("A focused web search query, in the user's language."),
        max_results: z.number().int().min(1).max(10).optional().describe("Max results to return (default 6)."),
      }),
      execute: async ({ query, max_results }, { abortSignal }) => {
        const results = await webSearch(query, { maxResults: max_results, signal: abortSignal });
        return { count: results.length, results };
      },
    }),

    fetch_page: tool({
      description:
        "Fetch a web page by URL and return its readable text, so you can read a search result in " +
        "full or a link the user gave you. Use a url from a web_search result. Private/internal " +
        "addresses are refused.",
      inputSchema: z.object({
        url: z.string().describe("The full http(s) URL to fetch."),
      }),
      execute: ({ url }, { abortSignal }) => fetchPage(url, { signal: abortSignal }),
    }),
  };
}
