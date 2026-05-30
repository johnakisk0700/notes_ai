# Chat answer durability — poll/async-first + TanStack Query (Model A)

**Status:** implemented (2026-05-30) + two adversarial review rounds applied. This is the
canonical design doc — referenced from `CLAUDE.md`, `docs/data-stores.md`, `docs/frontend.md`.
Remaining: real-device QA on a flaky connection + the one deferred cosmetic remount (#7).

## Why

Primary users are on **mobile with flaky internet**: the streaming connection breaks
*mid-answer* (WiFi↔cellular, signal dips, carrier-proxy idle timeouts) and mobile
browsers **freeze JS / kill connections on backgrounding** (screen lock, app switch).
Today the server already finishes + persists the answer on client disconnect
(`result.consumeStream()` + `createUIMessageStream` `onFinish` → `appendMessage`), but
the **client never re-attaches or catches up** after a drop — the hydrate is a one-shot
`fetchThread` (`StreamChatContext.tsx:151-191`), so a returning user sees a frozen,
half-written answer until a manual reload.

## Decision

**Poll/async-first:** the persisted Mongo thread is the **source of truth**; the live SSE
stream (Vercel AI SDK `useChat`) is a **best-effort accelerator** the client never depends
on. Catch-up is via polling the persisted thread.

**TanStack Query (React Query v5), Model A** on the client: `useQuery(['thread', id])` is
the source of truth; `useChat` is a live overlay. RQ's built-ins map almost 1:1 to the
poll-first triggers (`refetchInterval` = poll-while-generating, `refetchOnReconnect` =
network-return, `refetchOnWindowFocus`/`visibilitychange` = mobile-foreground, retry+backoff
= flaky links). Scope now: `['thread', id]` + `['threads']`; migrate the rest of the app's
fetching later.

Rejected: AI SDK **resumable streams** (live token re-attach via Redis) — more infra than
the robustness goal needs; poll-first reuses the existing durable persistence.

## Server design

A generation now writes an **assistant placeholder** that carries status + grows:

1. **Placeholder at start** — after the user-turn write (`persisted`) lands, `$push` an
   assistant message `{ role:'assistant', generationId, content:'', parts:[], status:'streaming', timestamp }`.
2. **Incremental partial text** — throttled `updateOne(..., { $set: { 'messages.$[m].content': partialText } }, { arrayFilters:[{ 'm.generationId': genId }] })` as text streams. *(hook + chunk shape: pending AI-SDK spike — likely `streamText({ onChunk })`.)*
3. **Finalize** — in `createUIMessageStream` `onFinish`: `$set` final `content` + full `parts`
   + `metadata` + `status:'complete'` on the same placeholder (by `generationId`).
4. **Error/abort** — set `status:'error'` (keep partial text) so the client shows a terminal
   failed state instead of polling forever.
5. **Read-time staleness** — `getThread` treats a `status:'streaming'` placeholder whose
   `timestamp` is older than `STALE_MS` (~90s, > `TURN_DEADLINE_MS` 60s) as `error`/stale.
   Deterministic: the 60s turn deadline guarantees `onFinish`/`onError` ran if the worker was
   alive, so >90s streaming ⇒ the worker died.

**Client-generated thread id:** for a *new* chat the client mints a 24-hex
(ObjectId-compatible) id and sends it in the POST body, so it can poll even if the first
response byte (today's `data-thread` part, `agentic-rag.ts:177`) never arrives. Server uses
it instead of minting one (`recordUserTurn`); create stays **idempotent** (upsert / insert
only if absent) so a POST retry can't double-create a thread or a second placeholder.

## Client design (Model A)

- `QueryClientProvider` high in `main.tsx` (wrapping the tree so both `App`/StreamChat and
  `Layout`/Threads are inside). Tuned `QueryClient` defaults for flaky mobile *(exact config:
  pending RQ verify)*.
- `useQuery(['thread', id])` in StreamChat: `enabled: !!id`,
  `refetchInterval: q => latestAssistantStatus(q.state.data) === 'streaming' ? 2000 : false`,
  rely on `refetchOnReconnect` + `refetchOnWindowFocus` defaults.
- **Render rule:** while `useChat.status` is `submitted`/`streaming` → render `useChat.messages`
  (the live overlay; it holds the full convo because we seed it for context on send);
  otherwise render the RQ thread.
- **Anti-flicker on finish (premortem a):** on stream finish, `queryClient.setQueryData(['thread', id], …)`
  to inject the finished turn into the RQ cache *immediately* (so the flip to RQ already has
  it), then `invalidateQueries(['thread', id])` to reconcile with server truth in the
  background. Avoids the answer vanishing-then-reappearing as RQ refetches.
- `['threads']` query replaces `ThreadsContext`'s manual `refresh()`/`setThreads`; invalidate
  it when a new thread is created (the `data-thread` handler) and on delete.
- Reconcile by id: useChat ids vs Mongo `_id` differ; brief remount on flip is acceptable
  (note in premortem b).

## File-by-file

### shared
- `shared/dto/ThreadDTO.ts` — add `status?: 'streaming' | 'complete' | 'error'` and
  (internal) carry `generationId` if needed to `ThreadMessageDTO`.

### backend
- `model/mongo-db/Message.ts` — add `status` + `generationId` to schema + `Message` type.
- `services/chat-threads.ts` — new `startAssistantPlaceholder()` / `updateAssistantPartial()`
  / `finalizeAssistant()` / `failAssistant()` (or fold into `appendMessage`); `getThread`
  maps `status` + applies the staleness rule; `recordUserTurn` accepts a client id + idempotent create.
- `services/ai/agentic-rag.ts` — push placeholder at start; throttled partial-text updates
  via the AI-SDK hook; finalize/fail in `onFinish`/`onError`. Keep `consumeStream()`.
- `apis/notes/search-relevant-notes.ts` — accept + validate the client-supplied new-thread id.

### frontend
- `package.json` — add `@tanstack/react-query`.
- `main.tsx` — add `QueryClientProvider` + a configured `QueryClient`.
- `integrations/threads.ts` — keep `fetchThread`/`fetchThreads` (become queryFns); add a
  client ObjectId generator (or in StreamChat).
- `context/StreamChatContext.tsx` — replace one-shot hydrate with the `['thread', id]` query +
  Model A render rule + setQueryData/invalidate on finish; mint + send client thread id.
- `context/ThreadsContext.tsx` — back `threads` with `['threads']` query (or thin wrapper).
- `components/Chat/ChatMessage.tsx` — surface a per-message `status` affordance (streaming
  spinner when polling-but-not-live; a terminal "interrupted" state on `error`/stale).

### tests
- backend (`bun:test`): staleness rule, idempotent create, placeholder lifecycle
  (start→partial→finalize / →fail) — pure unit over the service with Mongo mocked.
- frontend (Vitest): `latestAssistantStatus` / refetch-decider + reconcile selector.

### docs
- `CLAUDE.md`, `docs/architecture.md`, `docs/data-stores.md` (Message `status`),
  `docs/api-reference.md` (client-supplied threadId), `docs/frontend.md` (RQ provider).

## Resolved decisions (from the understand workflow — spike + RQ verify + premortem)

**AI-SDK v6 (verified vs installed `ai@6.0.191` .d.ts, high confidence)**
- Partial text: `streamText({ onChunk })`, `if (chunk.type === 'text-delta') acc += chunk.text`.
  `onChunk` pauses the stream until its promise resolves → **never `await` the DB write**;
  accumulate a string + throttle a fire-and-forget `$set`. Do **not** read `textStream`/`fullStream`.
- Abort: `streamText.onFinish` does **not** fire on abort; `streamText.onAbort({ steps })` does.
  `createUIMessageStream({ onFinish })` gets `{ isAborted, finishReason, responseMessage }` —
  **but only fires on abort if `pipeUIMessageStreamToResponse` is passed `consumeSseStream: consumeStream`**
  (the `consumeStream` export). Currently omitted → add it. Mark `status:'error'` in BOTH
  `onAbort` (fast path for `turnAbort`/disconnect) and the `onFinish` `isAborted||finishReason==='error'` branch.
- Read-time staleness stays the authoritative backstop (a crashed worker runs no callback).

**TanStack Query v5 (high confidence)**
- `refetchInterval: (query) => latestAssistantStatus(query.state.data) === 'streaming' ? 2000 : false`
  (reads `query.state.data`, return `false` to stop). v5 is **object-form only**.
- Defaults `refetchOnWindowFocus`/`refetchOnReconnect` = true but **gated by staleTime**; focusManager
  keys off `visibilitychange` (✓ mobile), onlineManager off `online`/`offline`. To guarantee mobile
  catch-up with a non-zero `staleTime`, set these to `'always'` on the thread query.
- `refetchIntervalInBackground` default false → set **true on the thread query only** so a backgrounded
  phone still catches the streaming→complete flip (self-limits: the interval only exists while streaming).
- `setQueryData(['thread',id], updater)` (return `undefined` to bail) then `invalidateQueries`.
  One module-level `QueryClient`. `networkMode:'online'` (default) pauses queries offline, resumes on reconnect.

**Design locks from the premortem**
- **Identity:** client mints `threadId` (new chats) + a `generationId` per assistant turn, both sent in
  the POST body. Server stores `generationId` on the assistant message; `getThread` returns it as that
  message's `id`. Optimistic + refetched assistant correlate by it (no dup/flicker; assistant identity
  stable; user message may remount once on swap — acceptable, draft auto-open already gated to the live turn).
- **Idempotency + ordering:** new thread = one `create({ _id: threadId, messages: [user, placeholder] })`
  (or `upsert`+`$setOnInsert`); existing thread = single `updateOne $push {$each:[user?, placeholder]}`.
  `persisted` resolves even on failure, so guard placeholder/partials with `matchedCount` + idempotent
  upsert; reject a 2nd concurrent non-terminal placeholder on the same thread.
- **Staleness:** `STALE_MS = 2 × TURN_DEADLINE_MS` (120s), compared to `updatedAt` (bumped on placeholder
  start + every partial write), applied **purely** in `getThread` (return effective `status:'error'`,
  never write on read).
- **arrayFilters:** `$set 'messages.$[m].content'/'.updatedAt'` with `arrayFilters:[{ 'm.generationId': genId }]`;
  set cumulative text (not deltas), text-only during streaming, full `parts`+`metadata` only at finalize.
  Partials are fire-and-forget `.catch(log)`; the **finalize write must be reliable** (the durable answer).
- **Mongo-down (j):** Model A = *"render RQ when it has the turn, else the live/optimistic answer."* On
  `useChat` finish, `setQueryData` the in-memory turn into the cache (keyed by `generationId`) **before**
  invalidate; `getThread` 404/empty maps to a retriable error so RQ keeps prior data (never renders empty
  over a good answer). `latestAssistantStatus`/render gate strictly on `useChat.status`.
- **Badge:** metadata only at finalize; render the badge only when `status==='complete'` + metadata present.
- **Stop button:** unchanged from today (local `useChat.stop()`; server keeps generating via `consumeStream`
  and finalizes — the answer still lands on the next poll). Documented as a known limitation, not a regression.
- **Cluster (k):** poll GET / stream POST can hit different workers → Mongo is the only shared truth; no
  in-memory cross-worker assumptions. A real server-side abort would need a durable flag — out of scope.

## Progress
- [x] Read streaming + image + persistence + thread layers
- [x] Architecture decided (poll-first, RQ Model A)
- [x] Understand workflow results folded in (spike + RQ verify + premortem)
- [x] shared: `ThreadMessageDTO.status`
- [x] backend: Message schema (status/generationId/updatedAt), chat-threads service (placeholder lifecycle via `upsertUserTurn` + `updateAssistantPartial` + `finalizeAssistant` + `failAssistant` + `effectiveStatus` staleness), agentic-rag (onChunk throttle/onAbort/finalize on UI-stream onFinish/`consumeSseStream`), endpoint (client threadId + generationId)
- [x] frontend: RQ dep + `QueryClientProvider` + `useQuery(['thread',id])` poll driver + Model A render + optimistic finalize + `['threads']` list + status UI + id minting
- [x] Tests (backend bun:test staleness; frontend vitest reconcile/mapping/poll-decider)
- [x] Typecheck + lint + test green (backend tsc clean; frontend tsc clean bar pre-existing NoteEditor; backend 18 / frontend 18 tests pass; 0 lint errors)
- [x] Adversarial review workflow + fixes (2 high + 4 medium + 1 low confirmed; high/medium fixed)
- [x] Docs updated (CLAUDE.md + docs/*)

## Review findings — addressed
A multi-agent adversarial review found 7 real bugs; the 2 high + 4 medium were fixed:
1. **(high) edit/retry truncation was client-only** → the server now durably truncates: edit/retry send
   `truncateToCount`; `upsertUserTurn` keeps the first N messages and appends the turn in one pipeline
   `$concatArrays/$slice` update (so the discarded tail can't resurface from the source of truth).
2. **(high) errored turns persisted as "complete"** (the SDK never sets `finishReason` on a plain stream
   error, only abort sets `isAborted`) → new `services/ai/turn-status.ts` `resolveTurnStatus`: complete
   only when `!isAborted && finishReason != null && finishReason !== "error"`; otherwise `error`.
3. **(med) duplicate/replayed POST appended a 2nd turn** → the normal upsert filter now carries
   `messages.generationId: {$ne}` (idempotent; the duplicate collides on `_id` → E11000, swallowed).
4. **(med) empty placeholder finalized "complete" when `execute` threw before streaming** → covered by #2,
   plus `getEurPerUsd()` is wrapped (fallback rate) so a Redis hiccup can't reject `execute` and drop a
   generated answer.
5. **(med) switching threads mid-stream misrouted the optimistic write** → `onFinish`/reconcile read a
   `streamingTurnRef` captured at send (not the route-mutable `threadIdRef`); a `streamingThreadId` state
   gates the live overlay to the streaming thread.
6. **(med) reconcile refetch flickered the answer back to "thinking"** → `needsReconcileRef` skips the
   detail refetch on a clean success (optimistic write is authoritative); disconnect stays `streaming` to poll.
7. **(low, deferred) one-time remount** of the just-finished turn at the overlay→RQ swap (live useChat ids
   ≠ persisted `generationId`/`_id`) — a single markdown re-parse of that message; cosmetic.
8. **(med, found by a second fix-verification review) in-flight poll regressed the optimistic answer** —
   fix #6 stopped the *invalidate*-triggered refetch, but an already-running `refetchInterval` poll could
   resolve after `onFinish` and overwrite `complete` with a stale `streaming` read (≤2s flicker back to the
   spinner, most common on the new-thread first turn). → `mergeThreadNoRegress` in the thread `queryFn`
   refuses to downgrade an already-terminal latest turn (same `generationId`) back to `streaming`.
9. **(high, found in device QA — thread `6a1aadd4`) re-sending persisted rich parts wedged the thread** —
   sending a thread's history back to the model failed `streamText`'s prompt validation (*"messages do not
   match the ModelMessage[] schema"* → start → error → DONE; retry yielded nothing, the thread couldn't
   recover). Root cause, pinned by replaying the **actual Mongo doc** through `convertToModelMessages` +
   `modelMessageSchema`: a prior assistant turn's persisted **tool-call / reasoning parts** round-trip from
   Mongo (stored Mixed) with schema-invalid fields (e.g. `providerExecuted: null`), plus a resultless tool
   call from an interrupted turn. Broader than the durability work — any tool-using turn could trip it on
   continue. → `services/ai/message-history.ts` `historyForModel` reduces prior assistant turns to their
   **text** answer before conversion (+ `ignoreIncompleteToolCalls` as belt-and-suspenders); the UI still
   renders the full persisted parts, only the model input is reduced. Verified the real thread now converts
   clean. (My first guess — dangling tool call alone — was wrong; the persisted-doc replay corrected it.)

## Known limitations (v1, deliberate)
- **Stop button** stays local (`useChat.stop()`): the server keeps generating (`consumeStream`) and
  finalizes, so a "stopped" answer still lands on the next poll. Unchanged from before; a real abort
  needs a durable cross-worker flag (cluster) — out of scope.
- **One-time remount** (#7 above) of the just-finished turn on the overlay→RQ swap — cosmetic; fixable by
  normalizing the live assistant id to `generationId` in the render layer.
- **Mongo down**: the live/optimistic answer stays on screen, but nothing persists (best-effort, as before).
- **Runtime/device QA still pending**: this is a live mobile-network behavior; unit tests cover the pure
  logic (staleness, status derivation, reconcile/mapping), but the drop/reconnect/background paths need
  manual QA on a real flaky connection.
