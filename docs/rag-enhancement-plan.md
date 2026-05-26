# RAG + Agentic Chat — Enhancement Plan

A backlog/design doc for taking the notes chat from **naive single-shot RAG** to a
**reranked, hybrid, agentic tool-calling RAG** driven by cheap tool-capable models
(Qwen3.6, GLM-5.1), with a chat UI that shows tool calls and renders answers richly.

Compiled **2026-05-26**. Status tags per item: **[verified]** (observed in the code
today) · **[proposed]** (design recommendation) · **[decision]** (needs a human call —
see _Decision points_).

Each actionable item follows the repo's planning style: **what / why / where / how / verify**.

> This is a **plan**, not shipped reality. Nothing here is wired yet. Treat the
> "Current state" section as authoritative and everything under "Target" as backlog.
>
> **Companion:** `docs/rag-execution-plan.md` holds the **sourced, ROI-ranked decisions**
> (resolved models, embedding/reranker choices, the Vercel-AI-SDK "less code" path) and
> **supersedes the decision points in §6**. Read that for _which option won and why_.

---

## 0. TL;DR — the target

Today a chat turn does exactly one thing: embed the raw query with `ada-002`, pull the
top-100 notes by cosine, dump all of them into the prompt, and let `gpt-5-mini` answer.
There is **no query rewriting, no keyword/hybrid search, no reranking, no chunking, and
no agency** — the model never gets to look at results and decide to search again. A
tool-calling scaffold (`generateQdrantQueryUsingTools`) exists but is **commented out**,
and even it was only a one-shot _pre-retrieval planner_, not a loop.

The target, in one paragraph:

> A chat turn hands the LLM a small set of **retrieval tools** (`search_notes`,
> `filter_by_date`, `get_full_note`, `list_recent_notes`, …) and runs an **agentic loop**:
> the model rewrites the question, calls a tool, sees reranked hybrid-search results,
> decides whether it has enough, optionally searches again or fetches a full note, then
> answers **with citations** — all streamed to a UI that renders each tool call as a
> collapsible card and the answer as proper Markdown. Cheap MoE models (Qwen3.6-35B-A3B
> as the default, GLM-5.1 for hard multi-hop) make the extra round-trips affordable
> because they're excellent, fast tool-callers.

Three pillars:

1. **Retrieval quality** (Phase 1): upgrade the embedding model, add hybrid (dense +
   sparse/BM25) search with RRF fusion, add a reranker, and chunk long notes. This alone
   is the highest-ROI change (2026 consensus: _hybrid + reranker before anything fancier_).
2. **Agency** (Phase 2): a provider-agnostic, streaming, tool-calling loop on the OpenAI
   **Chat Completions** API (the common denominator across OpenAI / OpenRouter / DeepInfra
   / Z.ai), with new adapters for Qwen3.6 and GLM-5.1.
3. **UX** (Phase 3, parallelizable): a typed SSE event protocol + chat components that
   show tool calls, reasoning, citations, and richer Markdown.

---

## 1. Current state (audit) — how RAG works today  **[verified]**

Request path: `frontend StreamChatContext.sendQuery` → `POST /api/search-notes`
(`server.ts:114`) → `backend/apis/notes/search-relevant-notes.ts`.

```
searchRelevantNotes()                       backend/apis/notes/search-relevant-notes.ts
 ├─ create/append Mongo thread (best-effort) services/chat-threads.ts
 ├─ generateQdrantQueryClassic()             ← embeds raw query (ada-002), no rewrite
 │    └─ openai.embeddings.create("text-embedding-ada-002")
 ├─ qdrantClient.query("notes", …)           ← single dense search, filter user_id, limit 100
 ├─ slice(0,100).map(p => `<${p.payload.concatenated}>`)   ← stuff ALL into the prompt
 └─ handleAiStream({ model:"gpt-5-mini", messages })       services/ai/ai_chat.ts
      └─ openai.responses.create({ stream:true })          ← Responses API (OpenAI-only)
```

Embedding write path (on note save): `apis/notes/store-note.ts` →
`services/embeddings.ts:createAndSaveNoteEmbedding` — embeds the **whole note** as one
1536-dim vector (`ada-002`) and upserts one point into the `notes` collection. Payload:
`{ concatenated, user_id, content, created_at, updated_at }`.

### Weaknesses (what we're fixing)

| # | Weakness | Where | Impact |
|---|----------|-------|--------|
| W1 | **`text-embedding-ada-002`** (2022) is the embedding model | `services/embeddings.ts:21`, `search-relevant-notes.ts:167` | Weak retrieval, esp. for **Greek**; replace with **Qwen3-Embedding** (#1 multilingual, 10× cheaper) — _not_ OpenAI, which lags on European languages (exec plan §3.2) |
| W2 | **No query rewriting / conversation-awareness** — the raw user string is embedded | `generateQdrantQueryClassic` | Follow-ups ("και για τον Γιώργο;") lose context; verbose questions embed poorly |
| W3 | **Dense-only search**, no keyword/hybrid | `qdrantClient.query` | Misses exact terms, names, numbers, dates that semantic vectors blur |
| W4 | **No reranking** — top-100 by cosine, unfiltered | `.slice(0, PAGE_SIZE)` | Low precision; relevant note may rank #40; "lost in the middle" |
| W5 | **Dumps up to 100 whole notes** into one prompt | `filteredNotes.join("")` | Expensive, slow, dilutes the signal; breaks on long Markdown notes |
| W6 | **One vector per note** (no chunking) | `createAndSaveNoteEmbedding` | A long rich-text note → one diluted vector; sub-topics unfindable |
| W7 | **No agency** — single retrieve→answer, no re-search, no multi-hop | whole flow | Can't answer "compare my notes on X and Y" or refine a bad first search |
| W8 | The **tool path is dead code** and was only a pre-retrieval planner | `generateQdrantQueryUsingTools` (commented at `:50-56`) | The good idea exists but unused and not a true loop |
| W9 | **No grounding / citations / "I don't know"** | `gptPromptGenerator.ts` | Answers can't point at the source note; hard to trust |
| W10 | **Streaming is OpenAI-Responses-API-only**; tool calls aren't streamed | `ai_chat.ts:139-168` | Can't drop in Qwen/GLM here; no tool-call events for the UI |
| W11 | **Ad-hoc, fragile SSE framing** (`manual:`, bare `data:` with `\n`→`\\n` hand-escaping, `event: done\ndata: )}`) | `ai_chat.ts:216-261`, `handleStreamProcessing.ts` | No room for structured tool-call events; the `)}` is a copy-paste artifact |
| W12 | **No payload indexes / limited metadata** in Qdrant (no `title`, `reminder`, `note_id`) | `embeddings.ts:29-35` | Can't filter by reminder/title efficiently; chunking needs `note_id` |
| W13 | **No eval, no per-turn retrieval observability** | — | Changes can't be measured; can't tell if a tweak helped |

---

## 2. Models & providers  **[proposed / decision]**

> **Resolved in `rag-execution-plan.md`:** chat default = **Qwen3.6-Plus** (full flagship,
> 1M ctx, $0.325/$1.95), GLM-5.1 as escalation, both via OpenRouter. The Qwen3.6-**35B-A3B**
> discussion below is retained as the _cheaper open-weight fallback_ rationale.

### 2.1 What actually exists (as of 2026-05)

- **Qwen3.6** — _shipping, open-weight._ `Qwen3.6-35B-A3B` (35B MoE, **~3B active** →
  very cheap + fast, strong tool calling) released 2026-04-16; `Qwen3.6-27B` 2026-04-22;
  plus `Qwen3.6-Plus`. **This is the right "cheap default."**
  Note: the user said "Qwen 3.6–3.7" — **Qwen3.7-Max** was _announced_ 2026-05-20 but is
  **proprietary, no open weights**, a 1M-context flagship agent model (demoed 35h / 1000+
  tool calls). Treat 3.7-Max as an optional premium tier, not the workhorse.
- **GLM-5.1** — released 2026-04-07, OpenAI-compatible, ~203K context, strong agentic
  SWE/tool benchmarks (open-source SOTA, ~Claude Opus 4.5 class on SWE-bench). Use it as
  the **escalation tier** for hard multi-hop questions. (`GLM-5` shipped 2026-02-11;
  `GLM-5.1` is the one to target.)

### 2.2 Access strategy — Chat Completions everywhere  **[proposed]**

**Key architectural decision:** build the agentic loop on the **OpenAI Chat Completions
API** (`/v1/chat/completions`), *not* the Responses API. Chat Completions is the universal
contract that OpenAI, OpenRouter, DeepInfra, Z.ai, and Fireworks all implement
identically, including **streamed tool calls** (deltas carry `tool_calls[].index / id /
function.name / function.arguments`; accumulate by `index` until
`finish_reason === "tool_calls"`; reply with one assistant tool-call message + one `role:
"tool"` message per result; loop). The current GPT path uses the Responses API
(`ai_chat.ts:140`) which is OpenAI-only — keep it for the legacy non-tool path if you
like, but the new loop must be Chat Completions so every provider is a drop-in.

This means **adapters are mostly just base URLs**: instantiate the `openai` SDK
(`openai@^4.104.0`, already a dep) once per provider with a different `baseURL` + key. No
per-provider SDKs needed (we can retire `@fireworksai/sdk`).

| provider (new `ModelInfo.provider`) | `baseURL` | example model id | env key |
|---|---|---|---|
| `openrouter` **(start here)** | `https://openrouter.ai/api/v1` | `qwen/qwen3.6-35b-a3b`, `z-ai/glm-5.1` | `OPENROUTER_API_KEY` |
| `deepinfra` | `https://api.deepinfra.com/v1/openai` | `Qwen/Qwen3.6-35B-A3B` | `DEEPINFRA_API_KEY` |
| `zai` | `https://api.z.ai/api/paas/v4` | `glm-5.1` | `ZAI_API_KEY` |
| `openai` (existing) | default | `gpt-5-mini` | `OPENAI_API_KEY` |

**Recommendation:** ship Phase 2 on **OpenRouter** — one key reaches *both* Qwen3.6 and
GLM-5.1, with built-in fallback/routing. Once stable, point the hot path at **DeepInfra
(Qwen)** + **Z.ai (GLM)** direct to cut ~30–40% cost. The adapter layer makes this a
one-line model-map change.

### 2.3 Adaptive model routing  **[proposed]**

Match model to query complexity (2026 best practice — don't pay for the big model on easy
questions):

- **Qwen3.6-Plus** = default (full flagship; great tool-caller, 1M ctx). Cheap open-weight
  fallback if cost spikes: **Qwen3.6-35B-A3B** ($0.15/$1.00).
- **GLM-5.1** = escalation for multi-hop / comparison / "reason across many notes," or
  when Qwen's first answer is low-confidence.
- **gpt-5-mini** = quality fallback / A-B control (already wired).
- Route via a cheap heuristic first (query length, conjunctions, # tool rounds used);
  add a learned/LLM router later only if the heuristic underperforms.

### 2.4 Cost table to add to `AI_MODELS`  **[proposed]**

`backend/services/ai/ai_models.ts` — costs are **$ per token** (existing convention:
`gpt-5-mini` input `0.00000025` = $0.25/1M). Extend `ModelInfo.provider` union, then add:

```ts
// Qwen3.6-35B-A3B via OpenRouter — $0.15 in / $1.00 out per 1M
"qwen/qwen3.6-35b-a3b": { provider: "openrouter",
  inputCost: new Decimal(0.00000015), outputCost: new Decimal(0.000001) },
// …or DeepInfra: $0.20 in / $1.00 out  → 0.0000002 / 0.000001

// GLM-5.1 via OpenRouter — $0.98 in / $3.08 out per 1M
"z-ai/glm-5.1": { provider: "openrouter",
  inputCost: new Decimal(0.00000098), outputCost: new Decimal(0.00000308) },
// …or Z.ai direct: $1.40 in / $4.40 out → 0.0000014 / 0.0000044
```

Embeddings (for `calculateCompletionCost` / awareness): `ada-002` $0.10/1M (current) →
**`text-embedding-3-small` $0.02/1M** (cheaper *and* better). Reranker (Jina v3) ≈
$0.02/1M tokens. Even with 2–4 tool rounds, a turn on Qwen3.6 + 3-small + Jina costs a
fraction of today's single `gpt-5-mini` turn.

---

## 3. Backend plan (phased)

### Phase 0 — Foundations (unblocks everything)

#### 0.1 Provider-agnostic Chat Completions client registry  **[proposed]**
- **What:** a `backend/clients/llm_clients.ts` exporting a `getClient(provider)` that
  returns an `openai` SDK instance configured with the provider's `baseURL` + key (table
  in §2.2). Memoize one client per provider.
- **Why:** one code path for OpenAI/OpenRouter/DeepInfra/Z.ai; adapters become config.
- **How:** `new OpenAI({ baseURL, apiKey, defaultHeaders })`. For OpenRouter add
  `HTTP-Referer`/`X-Title` headers (their attribution convention).
- **Verify:** a smoke script hits each configured provider with a 1-token completion.

#### 0.2 SSE protocol v2 (typed JSON events)  **[proposed]**
- **What:** replace the ad-hoc framing with named events whose `data:` is always JSON.
- **Why:** the current scheme (W11) can't carry tool-call structure; the `\n`→`\\n`
  hand-escaping and `event: done\ndata: )}` are fragile. JSON framing fixes both.
- **Where:** emit in the new loop / `handleAiStream`; parse in
  `frontend/src/utils/handleStreamProcessing.ts`.
- **Protocol:**

  | event | `data` (JSON) | meaning |
  |---|---|---|
  | `status` | `{ "text": "Ψάχνω στις σημειώσεις σου…" }` | ephemeral status (replaces `manual:`) |
  | `thread` | `{ "id": "65f…" }` | new thread id (JSON-ify the existing one) |
  | `tool_call` | `{ "id":"call_1","name":"search_notes","args":{…},"round":1 }` | agent invoked a tool |
  | `tool_result` | `{ "id":"call_1","name":"search_notes","count":7,"items":[{ "noteId","title","date","score","snippet" }] }` | tool finished (send a *summary*, not raw blobs) |
  | `thinking` | `{ "delta":"…" }` | optional reasoning tokens (collapsible) |
  | `token` | `{ "delta":"…" }` | final-answer content (replaces bare `data:`) |
  | `usage` | `{ "model","inputCost","outputCost","totalCost","rounds","toolCalls" }` | cost/telemetry |
  | `done` | `{}` | end |
  | `error` | `{ "message","type" }` | failure |

- **How:** small `sse.write(res, event, dataObj)` helper. Keep one release where the
  client tolerates both old + new framing if you want a zero-downtime cutover.
- **Verify:** network tab shows clean `event:`/`data:` JSON; no `\\n` soup; `done` carries `{}`.

### Phase 1 — Retrieval quality (biggest quality win; do before agency)

#### 1.1 Upgrade the embedding model  **[proposed] [decision → resolved]**
- **What:** move off `ada-002`. **Resolved (execution plan §3.2): use `Qwen3-Embedding` via
  DeepInfra** — #1 MTEB **multilingual** (Greek!), open, **$0.01/1M** (10× cheaper than
  ada-002), 1024-dim default (MRL-configurable). **Do _not_ default to OpenAI here** —
  `text-embedding-3-large` is documented to **lag on European languages**
  (`text-embedding-3-small` is only a fallback if you must stay single-vendor).
- **Why:** W1; embeddings gate everything downstream. Greek-heavy corpus benefits most.
- **Where:** `services/embeddings.ts:21` (write) **and** `search-relevant-notes.ts:167`
  (query) must use the **same** model — today they already share `ada-002`; keep them in
  one constant (`EMBEDDING_MODEL`) so they never drift.
- **Migration:** changing the model invalidates existing vectors (not comparable). Write a
  one-off `backend/scripts/reembed-notes.ts` that re-embeds all `notes` rows (read from
  Postgres source of truth) and re-upserts. For a dimension change, create a new collection
  (`notes_v2`) and cut over. Gate behind a maintenance window; notes count is small.
- **Verify:** eval set (§3 Phase 3) shows context-recall ≥ current on a Greek+English Q/A set.

#### 1.2 Hybrid search (dense + sparse) with RRF fusion  **[proposed]**
- **What:** add a **sparse** representation (BM25 / SPLADE-style) alongside the dense
  vector and combine with Qdrant's **Query API** `prefetch` + **RRF** fusion.
- **Why:** W3 — semantic vectors blur exact names/numbers/dates; BM25 nails them; RRF
  ("safe default", `score = Σ 1/(k+rank)`) merges both ranked lists without trusting raw
  score magnitudes.
- **Where:** recreate the `notes` collection with **named vectors** — a dense vector +
  a `sparse` vector. Update `qdrant-init.ts:init_collections` (the create call at `:14`)
  and `embeddings.ts` (compute + upsert both). Query via `qdrantClient.query("notes", {
  prefetch: [{ query: denseVec, using: "dense", limit: 50 }, { query: sparseVec, using:
  "sparse", limit: 50 }], query: { fusion: "rrf" }, filter: {…user_id…}, limit: 50 })`.
- **How (sparse):** Qdrant can host sparse vectors; generate them with a BM25/SPLADE
  encoder. Cheapest: Qdrant/FastEmbed BM25, or a managed SPLADE. (qdrant-js `^1.14.1`
  supports the Query API + sparse vectors.)
- **Verify:** a query with a rare exact token (a name, an invoice number) that dense-only
  missed now surfaces the right note in the top results.

#### 1.3 Reranker (top-50 → top-8)  **[proposed] [decision]**
- **What:** after hybrid retrieval of ~50 candidates, **rerank** with a cross-encoder and
  keep the top ~8 for the prompt/tool result.
- **Why:** W4/W5 — the single highest-ROI precision lever; 2026 guidance: _"retrieve top-50
  hybrid → rerank to top-5 → pass to LLM"_, +15–30% on answer-quality metrics.
- **Options (multilingual matters — Greek):**
  - **Jina reranker v3** — managed, cheap, multilingual, small/fast (**recommended default**).
  - **Cohere Rerank 4** — best 100+-language coverage, managed (premium alt).
  - **Qwen3-Reranker 4B/8B** — Apache-2.0, self-host or via DeepInfra; keeps everything in
    the Qwen ecosystem (good if you want no extra vendor).
- **Where:** new `services/ai/rerank.ts`; call it inside the `search_notes` tool (Phase 2)
  before returning results.
- **Verify:** eval context-precision jumps; the note a human would pick is in the top 3.

#### 1.4 Chunk long notes  **[proposed]**
- **What:** split notes into ~300–500-token chunks on Markdown heading/paragraph
  boundaries; embed **each chunk**; one Qdrant point per chunk with payload `note_id`,
  `chunk_index`, `title`, `content` (chunk text), `created_at`, `reminder_at`, `user_id`.
- **Why:** W6 — now that notes are rich Markdown they can be long; one vector per note
  dilutes sub-topics. Chunk-level retrieval + grouping by `note_id` is standard.
- **Where:** `services/embeddings.ts` (chunk on write); retrieval groups hits by `note_id`
  and can fetch neighbors / the full note via the `get_full_note` tool.
- **Migration:** same re-embed pass as 1.1 (do them together — both rewrite the collection).
- **Verify:** a question about a buried paragraph in a long note retrieves that note.

#### 1.5 Qdrant payload indexes + richer metadata  **[proposed]**
- **What:** add payload indexes on `user_id` (keyword) and `created_at` (datetime), plus
  `reminder_at` / `has_reminder` / `title` to support fast metadata filtering.
- **Why:** W12 — agentic date/reminder filters need indexed fields to stay fast as notes grow.
- **Where:** `qdrant-init.ts` (create indexes after collection create); `embeddings.ts` (write fields).
- **Verify:** `filter_by_date` queries stay fast; Qdrant reports indexed fields.

### Phase 2 — Agentic tool-calling loop (the headline feature)

#### 2.1 The tool set  **[proposed]**
Define OpenAI-style function tools (evolve the dead `tools` array at
`search-relevant-notes.ts:118`). Start with these; they cover the real questions:

```jsonc
// 1) Primary retrieval — hybrid + reranked. The agent rewrites the user's question into `query`.
{ "name": "search_notes",
  "description": "Search the user's notes by meaning AND keywords. Use for any question about note content. Returns relevant notes with id, title, date, snippet.",
  "parameters": { "type":"object","required":["query"], "properties": {
    "query": { "type":"string", "description":"Focused search query in the user's language (Greek/English). Rewrite the question; don't paste it verbatim." },
    "top_k": { "type":"integer", "description":"Default 8, max 20." } } } }

// 2) Time-scoped retrieval (Qdrant datetime filter + optional semantic query)
{ "name": "filter_by_date",
  "description": "Find notes created within a date range (optionally also matching a query). Use for 'last week', 'in March', etc.",
  "parameters": { "type":"object","required":["date_from","date_to"], "properties": {
    "date_from": {"type":"string","description":"ISO date"}, "date_to": {"type":"string"},
    "query": {"type":"string","description":"Optional semantic filter within the range."} } } }

// 3) Zoom in — fetch a full note when a snippet is a hit but the agent needs the whole thing
{ "name": "get_full_note",
  "description": "Fetch the complete content of one note by id (from a previous search result).",
  "parameters": { "type":"object","required":["note_id"], "properties": { "note_id": {"type":"string"} } } }

// 4) Temporal, no query — 'what did I write recently?'
{ "name": "list_recent_notes",
  "description": "List the user's most recent notes (title + date), newest first.",
  "parameters": { "type":"object","properties": { "limit": {"type":"integer","description":"Default 10."} } } }

// (optional later) get_reminders(date_from?, date_to?), count_notes(query?)
```

- **Scoping:** every tool is **server-side hard-scoped to `req.user.id`** (+ admin
  `selectedUsers`). The model never supplies `user_id`. This preserves today's tenancy
  guarantee (`search-relevant-notes.ts:28`).

#### 2.2 The loop  **[done 2026-05-26 — via the AI SDK]**
> Built on `streamText` + `stopWhen: stepCountIs(MAX_STEPS)` (the Vercel AI SDK loop, not a
> raw Chat Completions loop). The final step drops tools via `prepareStep` (`toolChoice:'none'`)
> to force an answer; `result.consumeStream()` keeps the turn persisting even if the client
> disconnects. See `services/ai/agentic-rag.ts`. (The dedupe / context-budget guardrails below
> remain open.)
- **What:** `backend/services/ai/agentic_rag.ts` — a streaming Chat Completions loop:
  1. Seed messages: system prompt (persona "Λέξι" + grounding/citation/Greek rules + today's
     date), conversation history, the user turn. Pass `tools` + `tool_choice: "auto"`.
  2. Stream the response. If it streams **content** → forward as `token` events. If it emits
     **tool_calls** → emit `tool_call` events, execute each tool server-side, emit
     `tool_result` (summary), append the assistant tool-call msg + `role:"tool"` results,
     and **loop**.
  3. Stop when the model answers with no tool calls, or at `MAX_ROUNDS` (e.g. 5). On the
     last allowed round, drop `tools` to force a final answer.
- **Guardrails:** `MAX_ROUNDS`, max output tokens, **dedupe** retrieved `note_id`s across
  rounds, a **context-token budget** (cap how many reranked snippets enter the prompt), and
  a wall-clock timeout. Always end the SSE with `done` or `error`, even on abort
  (preserve the current best-effort Mongo persistence on `onDone`).
- **Where:** `search-relevant-notes.ts` calls this instead of the classic block (`:58-114`).
  Keep `generateQdrantQueryClassic` behind a feature flag as the fallback / A-B control.
- **Verify:** ask "σύγκρινε τις σημειώσεις μου για τον πελάτη Χ και τον πελάτη Ψ" → trace
  shows 2 `search_notes` rounds then a grounded answer citing both.

#### 2.3 Grounding & citations  **[proposed]**
- **What:** `search_notes` returns stable `noteId`s; the system prompt instructs the model
  to cite sources inline as e.g. `[[note:<id>|<title>]]` and to **say when notes don't
  contain the answer** instead of inventing.
- **Why:** W9 — trust + a clickable path back to the source note in the UI.
- **Verify:** answers contain citation tokens that map to real note ids; "I don't have a
  note about that" appears when appropriate.

#### 2.4 Query rewriting / conversation-awareness  **[proposed]**
- **What:** the agent rewrites follow-ups into standalone `query` args (mostly implicit
  with a capable tool-caller). Reinforce in the system prompt; optionally add an explicit
  cheap rewrite pre-step if Qwen3.6 underuses context.
- **Why:** W2.
- **Verify:** "και πέρσι;" after a dated question retrieves the right prior-year notes.

### Phase 3 — Eval & observability (do alongside Phase 1–2)

#### 3.1 Retrieval/answer eval harness  **[proposed]**
- **What:** a fixed Greek+English note corpus + ~30–50 Q/A pairs; score
  context-precision/recall + faithfulness (RAGAS-style) for each config (embedding model,
  hybrid on/off, reranker choice, model). A `backend/scripts/eval-rag.ts`.
- **Why:** W13 — every Phase-1/2 knob (which embedder, which reranker, Qwen vs GLM) is a
  guess without numbers.
- **Verify:** a table comparing configs; decisions (1.1/1.3/2.3 model routing) are made from it.

#### 3.2 Per-turn observability  **[partially done 2026-05-26]**
> `onStepFinish` now logs each tool result + note count per step (pino), and cost still flows
> to `kataskopos` (`services/ai/agentic-rag.ts`). Structured per-turn metrics (rounds,
> latency, scores in a table/dashboard) remain open.
- **What:** extend the existing cost tracking (`req.addCost` → `kataskopos` table) with
  `rounds`, `toolCalls`, retrieval latency, and model used. Log each tool call + top result
  scores (pino).
- **Where:** the loop + `ai_chat`/`ai_utils`. (`kataskopos` already stores per-request model
  + in/out cost — see `docs/data-stores.md`.)
- **Verify:** a dashboard/log shows cost & rounds per turn; regressions are visible.

---

## 4. Frontend plan (`frontend/`) — show tool calls + render better

Current chat UI: `StreamChatContext` (state) → `StreamChat` / `ChatMessage` (render) →
`CustomMarkdown` (minimal). A streaming message is just a growing string; status comes via
the `manual:` frame and a fade (`StreamChat.tsx:52-58`). Markdown support is bare
(`CustomMarkdown.tsx`: gfm + breaks, no highlighting/sanitize, minimal element styling).

#### 4.1 Consume SSE protocol v2 → structured messages  **[proposed]**
- **What:** rework `handleStreamProcessing.ts` to parse the named JSON events (§0.2) and
  change the `Message` model from `{ content }` to `{ content, steps: Step[] }`, where a
  `Step` is a `tool_call` (+ its `tool_result`) or a `thinking` block, kept in arrival
  order interleaved with text.
- **Where:** `frontend/src/utils/handleStreamProcessing.ts`,
  `frontend/src/context/StreamChatContext.tsx` (`sendQuery` callbacks at `:139-183`).
- **Verify:** during a turn, tool calls and tokens update independently and in order.

#### 4.2 Tool-call & reasoning components  **[done 2026-05-26]**
> Live: `components/Chat/ToolCallCard.tsx` (collapsible tool call: label + query + running/done
> + note count) and `components/Chat/ReasoningCard.tsx` (the `ThinkingBlock` — collapsed
> reasoning, fed by the server's `sendReasoning`). Both render inline in `ChatMessage` from the
> AI SDK message `parts`, and persist across reloads (§4.5). Separately, a `ThinkingIndicator`
> shows rotating "working" phrases while no answer text is streaming yet.
- **What:** `ToolCallCard` (collapsible: tool name + a friendly label e.g. "🔎 Searching:
  '…'", a spinner while running, then a compact result summary — "7 notes" with the top
  titles/dates); `ThinkingBlock` (collapsible reasoning, collapsed by default);
  render the `steps[]` inline above/around the answer in `ChatMessage` / `StreamChat`.
- **Why:** the user's explicit ask — surface what the agent is doing. Reuse shadcn
  `collapsible` (already vendored: `components/ui/collapsible.tsx`).
- **Verify:** each tool call shows as a card; clicking expands args/results; reasoning is hidden until expanded.

#### 4.3 Richer Markdown answer rendering  **[proposed]**
- **What:** upgrade `CustomMarkdown`: syntax highlighting (`rehype-highlight` or Shiki),
  proper table/list/blockquote/heading styles (the `prose` classes already wrap it), a
  **copy button** on code blocks, and **`rehype-sanitize`** (answers can echo user note
  Markdown — sanitize to prevent injection).
- **Verify:** code blocks are highlighted + copyable; tables render; no raw HTML injection.

#### 4.4 Clickable citations  **[proposed]**
- **What:** render `[[note:<id>|title]]` tokens as chips/links that open the note
  (NoteEditor) or scroll to it. A small remark/rehype plugin or a post-render pass.
- **Verify:** clicking a citation opens the cited note.

#### 4.5 Persist steps so reloaded threads still show tool calls  **[done 2026-05-26]**
- **What (as built):** the Mongo `Message` schema (`backend/model/mongo-db/Message.ts`) gained
  an optional `parts` (Mixed array) holding the full AI SDK UIMessage parts — rather than a
  separate `steps`/`toolCalls` shape. Persisted in `chat-threads.appendMessage` from the
  `responseMessage` that `createUIMessageStream`'s `onFinish` assembles (`agentic-rag.ts`),
  returned by `getThread`, and hydrated on the client (`StreamChatContext` hydrate effect),
  which falls back to a single text part from `content` for legacy/user messages.
- **Why:** previously only `{ role, content, timestamp }` was stored — reopening a thread
  lost the tool-call history.
- **Verify:** reload `/thread/:id` → the tool cards from that turn are still there.

> Note: `docs/improvement-plan.md` item #1 (sidebar showed fake threads) overlaps the chat
> area — coordinate with that backlog; the threads wiring may already be in flight on this branch.

---

## 5. Data-model & config changes (summary)

- **Qdrant `notes` collection** → named vectors (`dense` + `sparse`), chunk-level points,
  richer payload (`note_id`, `chunk_index`, `title`, `reminder_at`, `has_reminder`),
  payload indexes on `user_id` + `created_at`. Recreate via `qdrant-init.ts` +
  `reembed-notes.ts`. **Re-embed required** (combine 1.1 + 1.4). Bump to `notes_v2` if dims change.
- **`AI_MODELS`** (`ai_models.ts`) → extend `provider` union (`openrouter`/`deepinfra`/`zai`),
  add Qwen3.6 + GLM-5.1 with real costs (§2.4).
- **Mongo `Message`** → optional `parts` (Mixed) holding the full UIMessage parts (text +
  tool calls). **[done — §4.5]**
- **Env** → add `OPENROUTER_API_KEY` (and later `DEEPINFRA_API_KEY` / `ZAI_API_KEY`).
  Update `.env`/compose + `docs/architecture.md`/`docs/data-stores.md`/this plan.
- **Embedding model constant** shared by write + query paths so they never drift.

---

## 6. Decision points (need a human call)

1. **Provider routing** — OpenRouter-first (one key, simplest) vs DeepInfra+Z.ai direct
   (cheaper, two more clients/keys). _Recommendation: OpenRouter now, direct later._
2. **Embedding model** — `text-embedding-3-small` (drop-in 1536, low-risk) vs a multilingual
   model better at Greek (dimension change, new collection). _Recommendation: 3-small first,
   re-evaluate with the eval set; escalate to multilingual only if Greek recall lags._
3. **Reranker** — Jina v3 (cheap managed, recommended) vs Cohere Rerank 4 (best multilingual,
   premium) vs Qwen3-Reranker (Apache, self-host, no new vendor).
4. **Default chat model** — Qwen3.6-35B-A3B default + GLM-5.1 escalation (recommended) vs
   keeping gpt-5-mini as default. Confirm budget/latency targets.
5. **Re-embed window** — the migration rewrites the whole `notes` collection; pick a
   maintenance moment (note volume is small, so likely minutes).

---

## 7. Suggested sequencing

**Quick wins (week 1, mostly independent):**
- 0.2 SSE protocol v2 + 4.1/4.3 frontend (renders better immediately, unblocks tool UI).
- 1.1 embedding upgrade to `text-embedding-3-small` (drop-in dims, cheaper + better) + re-embed.
- 1.3 reranker on top of the *existing* dense search (precision jump before hybrid/chunking).

**Then (weeks 2–3):**
- 0.1 client registry + §2 adapters (Qwen3.6/GLM-5.1 via OpenRouter).
- 2.1–2.4 the agentic loop behind a feature flag; 4.2/4.4/4.5 tool-call UI + citations.
- 1.2 hybrid search + 1.4 chunking + 1.5 indexes (one re-embed pass with 1.1).

**Continuous:** 3.1 eval harness (build early — it drives decisions #2/#3/#4) + 3.2 observability.

**Order rationale:** retrieval quality (Phase 1) lifts *every* answer regardless of agency,
and 2026 consensus is to exhaust hybrid+reranker before adding orchestration. Agency
(Phase 2) then turns a good retriever into a system that can do multi-hop and self-correct.
UX (Phase 3/§4) can land in parallel since the SSE protocol is the only hard dependency.

---

## Sources (research, 2026-05)

- Qwen on Fireworks (CoT + tool calling, OpenAI-compat): https://fireworks.ai/blog/qwen-3
- Fireworks tool-calling / streaming shape (Chat-Completions-compatible): https://docs.fireworks.ai/guides/function-calling
- Qwen function calling (Hermes-style): https://qwen.readthedocs.io/en/latest/framework/function_call.html
- Qwen3.6 vs 3.7 — what actually exists: https://www.yottalabs.ai/post/qwen-3-7-vs-qwen-3-6-what-actually-exists-and-what-to-use-in-production · https://codersera.com/blog/qwen-3-7-vs-qwen-3-6-2026/
- Qwen3.7-Max (proprietary, 1M ctx, 1000+ tool calls): https://www.marktechpost.com/2026/05/21/qwen-introduces-qwen3-7-max-a-reasoning-agent-model-with-a-1m-token-context-window/
- Qwen3.6-35B-A3B pricing/providers: https://openrouter.ai/qwen/qwen3.6-35b-a3b · https://artificialanalysis.ai/models/qwen3-6-35b-a3b/providers · https://deepinfra.com/blog/qwen-api-pricing-2026-guide
- GLM-5.1 (release/pricing): https://openrouter.ai/z-ai/glm-5.1 · https://pricepertoken.com/pricing-page/model/z-ai-glm-5.1 · https://www.buildfastwithai.com/blogs/glm-5-1-open-source-review-2026
- GLM-5 launch / agentic: https://llm-stats.com/blog/research/glm-5-launch · https://z.ai/blog/glm-4.6
- Agentic RAG (LangGraph, 2026): https://medium.com/@vinodkrane/next-generation-agentic-rag-with-langgraph-2026-edition-d1c4c068d2b8
- RAG techniques compared / production guide 2026: https://blog.starmorph.com/blog/rag-techniques-compared-best-practices-guide · https://lushbinary.com/blog/rag-retrieval-augmented-generation-production-guide/
- Tool RAG (scaling tool selection): https://next.redhat.com/2025/11/26/tool-rag-the-next-breakthrough-in-scalable-ai-agents/
- Query rewriting + reranking for RAG: https://medium.com/@vasanthancomrads/ai-learning-series-part-5-query-rewriting-reranking-advanced-retrieval-for-rag-47b5e9900feb
- Rerankers compared 2026 (Jina/Cohere/Qwen3): https://futureagi.com/blog/best-rerankers-for-rag-2026 · https://jina.ai/models/jina-reranker-v3/
- Qwen3-Embedding & Reranker (paper): https://arxiv.org/html/2506.05176v1
- Qdrant hybrid queries (Query API, RRF/DBSF, sparse vectors): https://qdrant.tech/documentation/concepts/hybrid-queries/
