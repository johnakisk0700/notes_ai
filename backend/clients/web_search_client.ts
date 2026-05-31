// Web search for the chat's web_search tool. The default backend is a self-hosted SearXNG instance
// (SEARXNG_URL, JSON API) — free, no key, robust in production. If SEARXNG_URL is unset OR SearXNG
// errors, it falls back to scraping DuckDuckGo (duck-duck-scrape — also free, no key) so search
// works with zero config in local dev. Never throws: returns [] on failure so a tool call degrades
// to "no results" rather than erroring the turn. To swap in a paid API (Brave/Tavily) later, only
// this file changes — callers are unaffected.
import { search as ddgSearch, SafeSearchType } from "duck-duck-scrape";
import { logger } from "utils/logger";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 6;

interface SearxResult {
  title?: string;
  url?: string;
  content?: string;
}
interface SearxResponse {
  results?: SearxResult[];
}

export async function webSearch(
  query: string,
  opts: { maxResults?: number; signal?: AbortSignal } = {}
): Promise<WebResult[]> {
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
  const q = query.trim();
  if (!q) return [];

  const searxngUrl = process.env.SEARXNG_URL;
  if (searxngUrl) {
    try {
      return await searxngSearch(searxngUrl, q, maxResults, opts.signal);
    } catch (err) {
      logger.error("SearXNG search failed; falling back to DuckDuckGo:", err);
    }
  }
  return ddgFallback(q, maxResults);
}

async function searxngSearch(
  baseUrl: string,
  query: string,
  maxResults: number,
  signal?: AbortSignal
): Promise<WebResult[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1`;
  const res = await fetchWithTimeout(url, signal);
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const data = (await res.json()) as SearxResponse;
  return (data.results ?? [])
    .filter((r): r is SearxResult & { url: string } => Boolean(r.url))
    .slice(0, maxResults)
    .map(r => ({ title: r.title ?? "", url: r.url, snippet: r.content ?? "" }));
}

async function ddgFallback(query: string, maxResults: number): Promise<WebResult[]> {
  try {
    const res = await ddgSearch(query, { safeSearch: SafeSearchType.MODERATE });
    if (res.noResults) return [];
    return res.results.slice(0, maxResults).map(r => ({
      title: r.title ?? "",
      url: r.url,
      // duck-duck-scrape descriptions carry <b> highlight tags; strip them for the model.
      snippet: (r.description ?? "").replace(/<[^>]+>/g, ""),
    }));
  } catch (err) {
    logger.error("DuckDuckGo search failed:", err);
    return [];
  }
}

// fetch bounded by our own timeout, also honoring the turn's AbortSignal (whichever fires first).
async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
