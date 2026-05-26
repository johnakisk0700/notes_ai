# RAG Execution Plan — sourced decisions, ROI-ranked

Companion to **`docs/rag-enhancement-plan.md`** (the _what & why_). This doc is the
_which option won, why (with sources), how to build it with the least new code, and in
what order_ — researched **2026-05-26**.

Reading guide: every step has **Winner** · **Why it wins (sourced)** · **Cleanest impl
(least code)** · **ROI** · **Effort**. Decisions resolved here supersede §6 of the
enhancement plan.

> **Status (2026-05-26 — landed this session):** the **Vercel AI SDK stack is adopted**.
> Backend: `streamText` agentic loop + `search_notes`/`list_recent_notes` tools
> (`services/ai/agentic-rag.ts`, `notes-tools.ts`, `clients/llm_providers.ts`); endpoint
> rewritten to the UI message stream. Frontend: `useChat` + tool-call cards
> (`StreamChatContext.tsx`, `Chat/ToolCallCard.tsx`). Default model Qwen3.6-Plus (OpenRouter)
> with gpt-5-mini fallback. §3.7 markdown was already covered by the existing `CustomMarkdown`
> (charts/mermaid/sanitize) so Streamdown was **not** added. **Reranker (§3.1) also shipped**
> (Jina v3 — `services/ai/rerank.ts`; `search_notes` now fetches a 30-candidate pool → reranks
> → returns the relevance-gated top 6). **Still pending:** Qwen3-Embedding (§3.2), hybrid BM25
> (§3.3), chunking (§3.4) — retrieval embeddings are still dense `ada-002`.

> **Headline:** the biggest "clean, no extra code" lever is to **adopt the Vercel AI SDK
> stack** (AI SDK core + AI Elements + Streamdown). It *deletes* most of our hand-rolled
> chat plumbing (custom SSE protocol, `handleStreamProcessing`, the `ai_chat` provider
> switch, a hand-rolled tool loop, `CustomMarkdown`) **and** gives tool-call rendering for
> free. The biggest *quality* lever is a **reranker** (highest ROI in all 2026 sources).
> The biggest *correction* vs the first draft: **don't use OpenAI embeddings for Greek** —
> Qwen3-Embedding is #1 multilingual, open, and 10× cheaper than today's `ada-002`.

---

## 1. Models — resolved

### Chat: **Qwen3.6-Plus** (default) + **GLM-5.1** (escalation/alt)  **[decision: resolved]**

You meant the full flagship, not the small MoE — confirmed and adopted.

| Model | Ctx | Tool calling | Price (OpenRouter, /1M) | Notes |
|---|---|---|---|---|
| **Qwen3.6-Plus** (rel. 2026-03-31) | **1M** | yes, native | **$0.325 in / $1.95 out** | Always-on CoT reasoning, hybrid linear-attn + sparse-MoE, **multimodal** (text+image), 78.8 SWE-bench. Workhorse default. |
| **GLM-5.1** (rel. 2026-04-07) | 203K | yes, strong | $0.98 in / $3.08 out | Top agentic/coding open model; escalation tier for hard multi-hop, or A/B alternative. |
| gpt-5-mini (current) | — | yes | $0.25 in / $2.00 out | Keep as control/fallback. |

- **Access:** **OpenRouter** (one key → both models + 300+ others, OpenAI-compatible).
  Switch hot paths to Alibaba DashScope / Z.ai direct later for cost. Sources:
  [Qwen3.6-Plus on OpenRouter](https://openrouter.ai/qwen/qwen3.6-plus) ·
  [llm-stats specs](https://llm-stats.com/models/qwen3.6-plus) ·
  [GLM-5.1 on OpenRouter](https://openrouter.ai/z-ai/glm-5.1).
- **Note:** Qwen3.6-Plus is Alibaba-proprietary → it's on OpenRouter/DashScope, **not** on
  DeepInfra (DeepInfra hosts the open-weight Qwen — 35B-A3B, embeddings, rerankers). So:
  **chat = OpenRouter; embeddings + reranker = DeepInfra.** Both OpenAI-compatible → both
  are just `baseURL` swaps on the existing `openai` SDK. (Cheaper-and-still-great fallback
  for chat if cost spikes: open-weight `qwen3.6-35b-a3b`, $0.15/$1.00.)

---

## 2. The big lever — adopt the Vercel AI SDK stack  **[decision: needs your sign-off, strongly recommended]**

Your two asks — "show tool calls + render the LLM response better" and "implement cleanly,
don't add extra code" — point at the same answer. The AI SDK is now the de-facto standard
and is **Express/Bun-compatible** (core works in any Node runtime), with **stable v5 and
v6** out.

**What it replaces (net code DELETED, not added):**

| Today (hand-rolled) | Replaced by | 
|---|---|
| Custom SSE framing (`ai_chat.ts:216-261`, the `manual:`/`)}` artifacts) | AI SDK UI message stream (typed, versioned) |
| `frontend/.../handleStreamProcessing.ts` (manual parser) | `useChat` consumes the stream; nothing to parse |
| Provider `switch` in `ai_chat.ts` (Responses API + Fireworks SDK) | one `streamText({ model })` + provider packages |
| A hand-rolled tool-calling loop (Phase 2 of the design doc) | `streamText({ tools, stopWhen: stepCountIs(n) })` — loop is built-in |
| `CustomMarkdown.tsx` (+ the sanitize TODO) | **Streamdown** (Shiki + KaTeX + `rehype-harden` sanitize, streaming-safe) |
| Bespoke tool-call UI we'd otherwise build | **AI Elements** (shadcn-based Conversation/Message/**Tool**/**Reasoning**/Actions) |

**Backend shape (Express/Bun):**

```ts
import { streamText, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
const or = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const result = streamText({
  model: or("qwen/qwen3.6-plus"),
  system: lexiSystemPrompt(now),
  messages,                 // conversation history
  tools: { search_notes, filter_by_date, get_full_note, list_recent_notes },
  stopWhen: stepCountIs(5), // the agentic loop — no manual orchestration
  onStepFinish: ({ usage, toolCalls }) => req.addCost(/* per-step → kataskopos */),
  onFinish: ({ usage, steps }) => persistToMongo(steps), // cost + thread history
});
result.pipeUIMessageStreamToResponse(res);   // non-Next streaming helper*
```

\* The docs lead with Next's `toUIMessageStreamResponse()`; for plain Express use
`pipeUIMessageStreamToResponse(res)` / `toUIMessageStream()` — **verify the exact helper
name for the installed version** before committing (one thing to spike first).

**Frontend shape:** `useChat()` exposes `messages[].parts[]` with typed `tool-<NAME>`
parts carrying states `input-available → output-available | output-error` — render each as
an AI Elements `<Tool>` card; render text parts through Streamdown. **This is the tool-call
UI you asked for, with no custom stream code.**

- **Cost/persistence hooks survive:** `onStepFinish`/`onFinish` expose `usage`, `toolCalls`,
  `toolResults`, `steps` → wire straight into the existing `req.addCost` → `kataskopos`
  ledger and `chat-threads.appendMessage` (persist `parts` so reloaded threads keep their
  tool cards — see enhancement-plan §4.5).
- **Tradeoff (be honest):** it's a new dependency + a chat-layer migration, and re-homing
  cost/persistence into the callbacks. But it's a **net deletion** of fragile code and the
  fastest route to the UI you want. Recommended.
- **Fallback if you'd rather not adopt it:** keep the custom SSE but implement "SSE protocol
  v2" + a hand-rolled Chat Completions tool loop (enhancement-plan §0.2/§2.2). More code,
  more maintenance, same outcome.

Sources: [AI SDK 5](https://vercel.com/blog/ai-sdk-5) ·
[AI SDK 6](https://vercel.com/blog/ai-sdk-6) ·
[tools & multi-step](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) ·
[OpenRouter AI-SDK provider](https://github.com/OpenRouterTeam/ai-sdk-provider) ·
[AI Elements](https://github.com/vercel/ai-elements) ·
[Streamdown](https://github.com/vercel/streamdown).

---

## 3. Per-step research → decisions

### 3.1 Reranker — **✅ Shipped: Jina reranker v3**  **[done]**
- **Shipped:** `backend/services/ai/rerank.ts` + `search_notes` (30-candidate pool → rerank →
  relevance-gated top 6; knobs `NOTES_CANDIDATE_K` / `NOTES_FINAL_K` / `NOTES_RERANK_MIN_SCORE`,
  plus optional coarse `NOTES_MIN_COSINE`). Set `JINA_API_KEY` to enable; without it, falls back
  to vector order. Qwen3-Reranker (DeepInfra) is a drop-in alternative once embeddings move there.
- **Why it wins (sourced):** Reranking is **the highest-ROI RAG improvement** — +10-30%
  precision / +15-30% RAGAS for **50-100 ms** latency
  ([RAG production guide 2026](https://lushbinary.com/blog/rag-retrieval-augmented-generation-production-guide/),
  [advanced RAG 2026](https://myengineeringpath.dev/genai-engineer/advanced-rag/)). For a
  **Greek** corpus, multilingual matters: Qwen3-Reranker (Apache-2.0, multilingual) and
  Cohere (100+ langs) lead; Jina v3 is the latency king (<200 ms)
  ([rerankers compared](https://futureagi.com/blog/best-rerankers-for-rag-2026),
  [reranker benchmark](https://aimultiple.com/rerankers)).
- **Choice:** **Qwen3-Reranker-0.6B on DeepInfra** → keeps embeddings+reranker on **one
  vendor**, multilingual, dirt cheap. If p95 latency hurts (Qwen rerankers are
  autoregressive → slower), switch to **Jina v3** (managed, <200 ms). **Cohere Rerank 4
  Pro** if you later need max accuracy ($2/1M, #2 ELO).
- **Cleanest impl:** one HTTP call wrapping the *existing* dense results — **no re-embed, no
  schema change, no new infra**. New `services/ai/rerank.ts`, called inside `search_notes`.
- **ROI: ⭐⭐⭐⭐⭐ · Effort: XS.** This is the single best move; ship it before anything else.

### 3.2 Embedding model — **Winner: Qwen3-Embedding (DeepInfra)**, not OpenAI  **[corrects the first draft]**
- **The "is it updated?" answer: yes, and the right pick changed.** 2026 benchmarks:
  **Qwen3-Embedding-8B is #1 MTEB multilingual (70.6), beating OpenAI (64.6) and Google
  (68.3)**, and **"OpenAI text-embedding-3-large lags on European languages"** — i.e. on
  **Greek**, OpenAI is a poor choice. ("text-embedding-4" shows up in some price lists but
  isn't substantiated as a multilingual leader; don't bet the Greek corpus on it.)
  Sources: [embedding models 2026](https://app.ailog.fr/en/blog/news/embedding-models-2026) ·
  [MTEB leaderboard Apr-2026](https://awesomeagents.ai/leaderboards/embedding-model-leaderboard-mteb-april-2026/) ·
  [open-source embeddings guide](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models).
- **Choice:** **`Qwen/Qwen3-Embedding-0.6B` via DeepInfra** — **$0.010/1M** (10× cheaper than
  `ada-002`'s $0.10, 2× cheaper than `3-small`), **1024-dim** default, MRL-configurable
  32-2560, OpenAI-compatible API. Bump to **4B/8B** only if the eval shows Greek recall
  needs it. ([Qwen3-Embedding-0.6B / DeepInfra](https://deepinfra.com/Qwen/Qwen3-Embedding-0.6B),
  [model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)).
- **Cleanest impl:** same `openai` SDK, `baseURL` → DeepInfra, `model` → Qwen3-Embedding.
  Keep one shared `EMBEDDING_MODEL` constant for the write (`services/embeddings.ts`) and
  query paths so they never drift. **Requires a one-off re-embed** (new 1024-dim collection
  `notes_v2`) — but a model change forces a re-embed regardless, so the dimension change is
  free. Script: `backend/scripts/reembed-notes.ts` (read Postgres → embed → upsert).
- **ROI: ⭐⭐⭐⭐⭐ · Effort: S** (S+migration). Cheaper *and* much better for Greek.

### 3.3 Hybrid search — **Winner: Qdrant server-side BM25 + RRF**  **[now genuinely low-code]**
- **Why it wins (sourced):** dense-only misses exact names/numbers/dates; hybrid
  (dense + BM25) with RRF is the production default after reranking
  ([RAG techniques compared](https://blog.starmorph.com/blog/rag-techniques-compared-best-practices-guide)).
- **The clean-impl unlock:** **since Qdrant 1.15.2, BM25 sparse vectors are generated
  server-side** — even **self-hosted/Docker**, not just Cloud. The TS client just sends a
  `Document` (`{ text, model: "Qdrant/bm25" }`); Qdrant builds the sparse vector. **No
  Python, no FastEmbed, no sparse-encoder service.** Query API fuses dense+sparse with RRF
  server-side. (miniCOIL is better but needs FastEmbed/Python → skip for cleanliness.)
  Sources: [Qdrant inference (self-host BM25)](https://qdrant.tech/documentation/inference/) ·
  [hybrid queries / RRF](https://qdrant.tech/documentation/search/hybrid-queries/) ·
  [hybrid + reranking tutorial](https://qdrant.tech/documentation/tutorials-search-engineering/reranking-hybrid-search/).
- **Cleanest impl:** recreate `notes` with named vectors (`dense` + `bm25` sparse,
  `Modifier.IDF`); `embeddings.ts` upserts dense vec + the bm25 `Document`; query via
  `qdrantClient.query("notes", { prefetch: [dense, sparse], query: { fusion: "rrf" }, filter, limit })`.
  **Prerequisite: bump the Qdrant image to ≥ 1.15.2** in `docker-compose.yml` (verify current pin).
- **ROI: ⭐⭐⭐⭐ · Effort: M** (rides the same re-embed window as 3.2).

### 3.4 Chunking long notes — **Winner: heading/paragraph chunks, group by note**
- **Why:** notes are now rich Markdown (post the editor work) → one-vector-per-note dilutes
  long notes; chunking is standard for retrieval quality
  ([production RAG: chunking](https://blog.premai.io/building-production-rag-architecture-chunking-evaluation-monitoring-2026-guide/)).
- **Cleanest impl:** split on Markdown headings/paragraphs (~300-500 tokens) in
  `embeddings.ts`; one Qdrant point per chunk with `note_id`/`chunk_index`/`title`; group
  hits by `note_id` at retrieval; `get_full_note` tool fetches the whole note when needed.
  **Rides the same re-embed pass as 3.2/3.3** (do all three migrations once).
- **ROI: ⭐⭐⭐ · Effort: M.**

### 3.5 Agentic tool loop — **Winner: `streamText({ tools, stopWhen })`** (see §2)
- **Why:** highest *quality ceiling* — recovers from bad first retrieval, does multi-hop —
  but more expensive, so gate it ("only when simpler techniques don't suffice")
  ([RAG techniques compared](https://blog.starmorph.com/blog/rag-techniques-compared-best-practices-guide)).
  Qwen3.6-Plus/GLM-5.1 are excellent tool-callers → the extra rounds are cheap + reliable.
- **Cleanest impl:** the AI SDK runs the loop for you (§2). Tools are server-side,
  hard-scoped to `req.user.id`. Tool set + grounding/citations as in enhancement-plan §2.1/§2.3.
- **ROI: ⭐⭐⭐⭐ · Effort: M** (small once on the AI SDK; L if hand-rolled).

### 3.6 Query rewriting — **Winner: let the agent do it** (implicit)
- **Why:** valuable but a *secondary* lever after hybrid + reranking
  ([query rewriting + reranking](https://medium.com/@vasanthancomrads/ai-learning-series-part-5-query-rewriting-reranking-advanced-retrieval-for-rag-47b5e9900feb)).
- **Cleanest impl:** a capable tool-caller rewrites the question into the `query` arg
  itself — **zero extra code**; just instruct it in the system prompt. Add an explicit
  rewrite step only if eval shows it underuses conversation context.
- **ROI: ⭐⭐ · Effort: XS.**

### 3.7 Markdown rendering — **Winner: Streamdown** (see §2)
- **Why:** purpose-built for **streaming** LLM markdown (handles incomplete tokens), Shiki
  highlighting, KaTeX, Mermaid, and **`rehype-harden` sanitization** (critical — answers
  echo user-note markdown). Drop-in `react-markdown` replacement.
  ([Streamdown](https://github.com/vercel/streamdown), [v2.5](https://vercel.com/changelog/streamdown-2-5)).
- **Cleanest impl:** replace `CustomMarkdown.tsx` with `<Streamdown>` — fewer lines, covers
  highlighting + sanitize that we'd otherwise hand-add.
- **ROI: ⭐⭐⭐ · Effort: XS.**

### 3.8 Tool-call / reasoning UI — **Winner: AI Elements** (see §2)
- **Why:** shadcn-based (the repo already uses shadcn), prebuilt Conversation / Message /
  **Tool** / **Reasoning** / Actions components driven by `useChat` parts — exactly the
  "show tool calls + render reasoning" ask, maintained upstream.
  ([AI Elements](https://github.com/vercel/ai-elements), [intro](https://vercel.com/changelog/introducing-ai-elements)).
- **ROI: ⭐⭐⭐⭐ (user-facing) · Effort: S.**

### 3.9 Eval & observability — **Winner: small RAGAS-style harness**
- **Why:** every choice above (0.6B vs 4B embed, Qwen vs Jina rerank, Qwen vs GLM chat,
  hybrid on/off) is a guess without numbers; "measure on your own corpus" is the universal
  2026 caveat ([prod RAG: evaluation](https://blog.premai.io/building-production-rag-architecture-chunking-evaluation-monitoring-2026-guide/)).
- **Cleanest impl:** `backend/scripts/eval-rag.ts` + a fixed Greek/English Q-set; score
  context-precision/recall + faithfulness per config. Extend the existing `kataskopos`
  cost row with `rounds`/`toolCalls`.
- **ROI: ⭐⭐⭐ (de-risks all the above) · Effort: S.**

---

## 4. ROI-ranked execution order

Two parallel tracks. **Reranker first** (best ROI, trivial); the rest splits into a backend
"retrieval" track and a frontend/agency "AI-SDK" track.

| # | Step | ROI | Effort | Track | Re-embed? |
|---|------|-----|--------|-------|-----------|
| 1 | **Reranker** (Qwen3-Reranker-0.6B / Jina v3) on existing dense search | ⭐⭐⭐⭐⭐ | XS | A | no |
| 2 | **Embedding → Qwen3-Embedding** (+ shared `EMBEDDING_MODEL`, re-embed script) | ⭐⭐⭐⭐⭐ | S | A | **yes** |
| 3 | **Streamdown** swap (`CustomMarkdown` → `<Streamdown>`) | ⭐⭐⭐ | XS | B | no |
| 4 | **AI SDK spike**: `streamText` + OpenRouter, confirm Express streaming helper, port one endpoint | ⭐⭐⭐⭐ | M | B | no |
| 5 | **Agentic tool loop** + tools + grounding/citations (`stopWhen`) | ⭐⭐⭐⭐ | M | B | no |
| 6 | **AI Elements** UI (`useChat` parts → Tool/Reasoning cards) + persist `parts` | ⭐⭐⭐⭐ | S | B | no |
| 7 | **Hybrid (server-side BM25 + RRF)** + payload indexes (bump Qdrant ≥1.15.2) | ⭐⭐⭐⭐ | M | A | rides #2 |
| 8 | **Chunk long notes** | ⭐⭐⭐ | M | A | rides #2 |
| 9 | **Eval harness + observability** (build early; drives 1/2/5 choices) | ⭐⭐⭐ | S | — | no |

**Do-this-week quick wins:** #1 reranker, #3 Streamdown, #9 start the eval set. They're
independent, low-effort, and immediately better. Then commit to the #4 AI-SDK spike (it
gates 5/6) while #2 (re-embed) lands on Track A. **Batch #2 + #7 + #8 into one re-embed pass.**

---

## 5. Concrete deltas (deps / env / config)

- **deps (frontend):** `ai`, `@ai-sdk/react` (useChat), `@openrouter/ai-sdk-provider`,
  `streamdown`; add **AI Elements** via its shadcn registry (`npx ai-elements@latest …` —
  use **bunx** per repo convention). **deps (backend):** `ai`,
  `@openrouter/ai-sdk-provider`. **Removable later:** `@fireworksai/sdk`, `react-markdown`
  + `remark-*` (Streamdown covers them).
- **env:** add `OPENROUTER_API_KEY` (chat) + `DEEPINFRA_API_KEY` (embeddings + reranker).
  Update `.env`/compose.
- **`ai_models.ts`:** extend `provider` union (`openrouter`/`deepinfra`); add
  `qwen/qwen3.6-plus` ($0.325/$1.95 → `0.000000325`/`0.00000195`) and `z-ai/glm-5.1`
  ($0.98/$3.08). (If you adopt the AI SDK, usage/cost flows through `onStepFinish` — keep
  this map as the price source for `calculateCompletionCost`.)
- **Qdrant:** bump image to **≥ 1.15.2** (verify the pin in `docker-compose.yml`); recreate
  `notes` with named `dense` + `bm25` sparse vectors (`Modifier.IDF`) + payload indexes on
  `user_id`/`created_at`; new collection if dims change (they do: 1024 ≠ 1536).
- **Mongo `Message`:** add optional `parts`/`steps[]` (persist tool calls so reloaded
  threads keep their cards).
- **Docs to update on landing:** `CLAUDE.md`, `docs/data-stores.md` (embedding model +
  hybrid + collection dims), `docs/architecture.md` (AI SDK chat flow), and mark items here
  done.

---

## 6. Decision points (status)

1. **Adopt the AI SDK stack?** — _strongly recommended_ (net code deletion + the tool UI you
   want). The only real fork left; everything in Track B assumes "yes." ← **your call.**
2. Chat provider: **OpenRouter** now (one key, both models). ✅ resolved.
3. Embedding: **Qwen3-Embedding-0.6B @1024 via DeepInfra**; bump to 4B if eval demands. ✅ resolved (eval-tunable).
4. Reranker: **Qwen3-Reranker-0.6B (DeepInfra)**, fall back to **Jina v3** if latency hurts. ✅ resolved (eval-tunable).
5. Hybrid: **server-side BM25 + RRF** (needs Qdrant ≥1.15.2). ✅ resolved.
6. Embedding size 0.6B vs 4B/8B, and rerank vendor — **defer to the eval harness (#9)**; they're swaps, not rewrites.

---

## Sources

- Qwen3.6-Plus: https://openrouter.ai/qwen/qwen3.6-plus · https://llm-stats.com/models/qwen3.6-plus · https://artificialanalysis.ai/models/qwen3-6-plus
- GLM-5.1: https://openrouter.ai/z-ai/glm-5.1 · https://www.buildfastwithai.com/blogs/glm-5-1-open-source-review-2026
- Embeddings (multilingual / MTEB 2026): https://app.ailog.fr/en/blog/news/embedding-models-2026 · https://awesomeagents.ai/leaderboards/embedding-model-leaderboard-mteb-april-2026/ · https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models
- Qwen3-Embedding: https://deepinfra.com/Qwen/Qwen3-Embedding-0.6B · https://huggingface.co/Qwen/Qwen3-Embedding-0.6B · https://github.com/QwenLM/Qwen3-Embedding
- Rerankers: https://futureagi.com/blog/best-rerankers-for-rag-2026 · https://aimultiple.com/rerankers · https://jina.ai/models/jina-reranker-v3/ · https://deepinfra.com/Qwen/Qwen3-Reranker-0.6B · https://cohere.com/rerank
- RAG ROI / order (reranker highest, then hybrid, then rewrite): https://lushbinary.com/blog/rag-retrieval-augmented-generation-production-guide/ · https://blog.starmorph.com/blog/rag-techniques-compared-best-practices-guide · https://myengineeringpath.dev/genai-engineer/advanced-rag/ · https://blog.premai.io/building-production-rag-architecture-chunking-evaluation-monitoring-2026-guide/
- Qdrant hybrid / server-side BM25 (self-host): https://qdrant.tech/documentation/inference/ · https://qdrant.tech/documentation/search/hybrid-queries/ · https://qdrant.tech/documentation/tutorials-search-engineering/reranking-hybrid-search/
- Vercel AI SDK: https://vercel.com/blog/ai-sdk-5 · https://vercel.com/blog/ai-sdk-6 · https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling · https://github.com/OpenRouterTeam/ai-sdk-provider
- AI Elements: https://github.com/vercel/ai-elements · https://vercel.com/changelog/introducing-ai-elements
- Streamdown: https://github.com/vercel/streamdown · https://vercel.com/changelog/streamdown-2-5
