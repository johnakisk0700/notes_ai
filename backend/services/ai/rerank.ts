// Cross-encoder reranking of candidate notes by relevance to the query — the
// highest-ROI retrieval-quality lever (see docs/rag-execution-plan.md §3.1).
//
// Provider: Jina reranker v3 (managed, multilingual, fast). If JINA_API_KEY is unset,
// rerank() is a safe no-op (returns the first `topN` candidates unchanged) so chat keeps
// working without the extra env. To swap to Qwen3-Reranker (DeepInfra) later, only this
// fetch body/URL changes — callers are unaffected.
import { logger } from "utils/logger";

const JINA_RERANK_URL = "https://api.jina.ai/v1/rerank";
const JINA_MODEL = "jina-reranker-v3";

export interface Rerankable {
  /** The text the reranker scores against the query. */
  text: string;
}

export interface RerankOptions {
  /** Keep at most this many results (applied after the score filter). */
  topN?: number;
  /**
   * Drop candidates scoring below this. Reranker scores are calibrated 0–1 (unlike raw
   * cosine), so this is the real "only relevant notes get through" knob.
   */
  minScore?: number;
}

interface JinaRerankResponse {
  results?: { index: number; relevance_score: number }[];
}

/**
 * Rerank `items` by relevance of their `.text` to `query`, most relevant first.
 * Falls back to the original (vector) order — capped to `topN` — on any error or when
 * no API key is configured, so retrieval degrades gracefully rather than failing.
 */
export async function rerank<T extends Rerankable>(query: string, items: T[], opts: RerankOptions = {}): Promise<T[]> {
  const { topN, minScore } = opts;
  const passthrough = () => (topN != null ? items.slice(0, topN) : items);

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey || items.length === 0) return passthrough();

  try {
    const res = await fetch(JINA_RERANK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: JINA_MODEL,
        query,
        documents: items.map(i => i.text),
        top_n: topN ?? items.length,
        return_documents: false,
      }),
    });
    if (!res.ok) throw new Error(`Jina rerank HTTP ${res.status}`);

    const data = (await res.json()) as JinaRerankResponse;
    let ranked = (data.results ?? [])
      .filter(r => minScore == null || r.relevance_score >= minScore)
      .map(r => items[r.index])
      .filter((x): x is T => x != null);
    if (topN != null) ranked = ranked.slice(0, topN);
    return ranked;
  } catch (err) {
    logger.error("Rerank failed; falling back to vector order:", err);
    return passthrough();
  }
}
