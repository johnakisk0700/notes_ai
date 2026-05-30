# CLAUDE.md

AI notes assistant: users write notes (voice or text), notes are embedded and
stored, and a chat answers questions over them via semantic search. Greek/English UI.

## Monorepo (Bun workspaces)

| Workspace   | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `backend/`  | Express API on Bun. Auth, notes CRUD, AI chat, transcription.     |
| `frontend/` | React 19 SPA: Vite, Tailwind v4, shadcn/ui. See `docs/frontend.md`. |
| `shared/`   | Drizzle schema + shared TS types/DTOs, imported as `@shared`.     |

Any `*_old` / `*_prototype` / `*_experimental` files are dead code — ignore.

## Commands

```bash
# Whole stack via Docker — from repo root (these wrap docker compose):
bun run dev          # DEV:  hot-reload backend + Vite (HTTP). Source is bind-mounted,
                     #       so code edits need NO rebuild — just save. Runs foreground.
bun run dev:rebuild  # DEV:  rebuild images + renew anon volumes. Use this (not `dev`)
                     #       after changing deps (package.json/bun.lock) or a Dockerfile.
bun run prod         # PROD (local): bundled backend on HTTP (detached). The frontend
                     #       container is behind the `frontend-container` profile — add
                     #       `--profile frontend-container` for a full local prod test.
bun run dev:down     # stop the dev stack          (prod:down for prod)
bun run logs         # tail all service logs

# Deploy to the VM (mneme.narusec.io) — from repo root. Builds the SPA, rsyncs to the
# VM, brings up the Docker backend + DBs (migrations auto-run). Native nginx serves the
# SPA + proxies /api. Full runbook + VM prerequisites in docs/deployment.md.
bun deploy.ts eu     # full deploy   (bun deploy.ts backend = backend-only, no SPA rebuild)

# Hot reload uses POLLING by default (WATCH_POLLING=true) because the repo lives on
# a Windows drive bind-mounted into Linux — native file events (inotify) don't cross
# that boundary, so bun --watch/Vite would miss edits. Backend polls via nodemon
# (bun --watch has no polling mode); Vite polls via server.watch.usePolling. Set
# WATCH_POLLING=false in .env if you run from the WSL2/Linux filesystem.

# Tests — from repo root, runs both workspaces (backend: `bun test`; frontend: Vitest):
bun run test

# Backend (from backend/)
bun --watch run server.ts      # dev, hot reload
bun run build                  # bundle to dist/server.js
bun run test                   # bun:test (Jest-compatible, native tsconfig-path + .js resolution)

# Frontend (from frontend/)
bun run dev                    # Vite dev server (http://localhost:5173)
bun run build                  # production build
bun run test                   # Vitest (config in vitest.config.ts, node env)
bun run lint                   # ESLint (flat config)
bun run lint:fix               # ESLint --fix: auto-removes dead imports, fixes `import type`
bun run format                 # Prettier write (.prettierrc)

# DB migrations (from shared/, needs POSTGRES_URI)
bun run db:generate            # generate migration from schema changes (drizzle-kit)
bun run db:migrate             # apply pending migrations (runs migrate.ts — Drizzle's
                               #   programmatic migrator, not `drizzle-kit migrate`).
                               #   Also runs AUTOMATICALLY on `docker compose up` via the
                               #   one-shot `migrate` service the backend waits on, so a
                               #   fresh Postgres volume is migrated before the API serves.
bun run db:push                # push schema directly (no migration file)

# One-off scripts (from backend/)
bun scripts/qdrant-ensure.ts          # ensure Qdrant collections exist (idempotent, non-destructive).
                                      #   Runs AUTOMATICALLY on `docker compose up` via the one-shot
                                      #   `qdrant-init` service the backend waits on.
bun scripts/qdrant-init.ts            # DESTRUCTIVE reset: drops `polites` then ensures collections
                                      #   (the reseed `migrate*` calls are currently commented out).
                                      #   Run by hand only (guarded by import.meta.main).
bun scripts/seed-wines-customers.ts   # seed Postgres wines/customers (autocomplete) from data/*.json
```

Docker host ports: frontend dev (Vite) `5173`, frontend prod (nginx) `8081`,
backend `5100`, qdrant `6971`, redis `6380`, postgres `5433`, mongo `27018`.
See the `docker-compose.yml` header. Compose files: `docker-compose.yml` (base) +
`docker-compose.override.yml` (dev, auto-applied) + `docker-compose.prod.yml` (prod).

## Architecture at a glance

```
frontend (axios, Bearer token) ─► backend /api/* ─► Postgres (notes/reminders/profiles)
                                       │
                                       ├─► OpenRouter (gemini-embedding-001 embeddings + selectable Qwen/GLM/GPT agentic chat) + Jina (rerank)
                                       ├─► Qdrant (vector search over note embeddings)
                                       └─► MongoDB (chat threads/messages)
```

- Server forks a worker per 2 CPUs (`cluster`). Dev = plain HTTP; in prod the backend
  serves HTTP behind the native host nginx (which terminates TLS for mneme.narusec.io —
  see `docs/deployment.md`). Entry: `backend/server.ts` (all routes registered here).
- Chat flow (agentic RAG on the Vercel AI SDK): `POST /api/search-notes` runs a streaming
  multi-step tool loop (`streamText` + `stopWhen`) where the model calls note-retrieval
  tools (`search_notes`, `filter_by_date`, `list_recent_notes` — `services/ai/notes-tools.ts`), reads the
  results, and answers grounded in them. The same loop can also **act on notes** (all hard-scoped to the
  logged-in `userId`, never an id from the model): `create_note` saves immediately via the shared
  `services/notes-write.ts` save+embed transaction (the same path `/store-note` uses); `propose_note_edit`
  returns a before→after that the user Applies (→ `/update-note`, forwarding the existing `remindAt` so a
  content edit can't wipe a reminder) or discards — it does **not** write; `draft_note` persists nothing and
  just hands a draft to the client, which auto-opens it pre-filled in the note editor. Failure
  handling is **structural, not model-trusted**: a note tool's `execute` never throws — it returns a
  typed `{saved:false}`/`{found:false}` the card renders as a terminal *failed* state with a
  deterministic **Retry** (re-hits `/store-note`; safe because a failed create rolls back); external
  calls are time-bounded (`embedding_client` 12s / `qdrant_client` 10s — the OpenAI SDK default is 10
  MINUTES) and the whole turn has a 60s `AbortController` backstop (`TURN_DEADLINE_MS`), so a wedged
  embed/Qdrant/provider can't leave the card spinning or the response open. The loop is capped at `MAX_STEPS` (runaway guard —
  the SDK default is a single step; the last step drops tools via `prepareStep` to force an
  answer), and `result.consumeStream()` keeps the turn persisting even if the client
  disconnects. The system prompt carries only persona + answer policy — the SDK injects each
  tool's name/description/schema, so the prompt does **not** re-describe them. Default model
  **Qwen3.6-Plus via OpenRouter** when `OPENROUTER_API_KEY` is set, else **gpt-5-mini** on
  `OPENAI_API_KEY` (`clients/llm_providers.ts`) — one of several user-selectable models
  (`shared/ai/chatModels.ts`: Qwen/GLM via OpenRouter + GPT via OpenAI). Streamed as an AI SDK UI message stream
  (text + `tool-*` + `reasoning` parts); the client consumes it with `useChat`
  (`experimental_throttle` coalesces token re-renders; `CustomMarkdown` is memoized so only
  the streaming message re-parses) and renders tool calls + reasoning (`ToolCallCard`/`ReasoningCard`;
  the three note-action tools render as a richer `NotePreviewCard` instead — saved note / before→after
  with Apply·Discard / draft. Tool outputs are hydrated into the finalized parts before Mongo
  persistence, and Apply/Discard/manual-retry decisions are written back via
  `POST /api/update-tool-transaction` as a tiny `transaction` marker/log keyed by `toolCallId`, so a
  refresh re-renders the same terminal card state even if the click happened mid-stream. A live `draft_note` result auto-opens the editor via `NoteEditorContext`,
  gated to the streaming turn so reopening a thread doesn't re-pop it),
  plus a `ThinkingIndicator` while no answer text is streaming yet (`context/StreamChatContext.tsx`,
  `components/Chat/`).
  The **client mints the thread id** (and a per-turn `generationId`) and sends them in the request,
  so it can poll for the answer even if the stream never delivers a byte (flaky mobile). The assistant
  turn is persisted as a **placeholder** (`status:"streaming"`, folded into the user-turn write — one
  idempotent upsert), grown by throttled fire-and-forget **partial-text** writes (`onChunk`) as it
  streams, then **finalized** (`status:"complete"`, full UIMessage `parts` + `metadata`
  `{ model, costEur, totalTokens }` → muted per-answer badge) in `createUIMessageStream`'s `onFinish`
  (`pipeUIMessageStreamToResponse({ consumeSseStream: consumeStream })` makes that fire even on
  abort/disconnect); on error/abort it's marked `status:"error"`, and `getThread` serves a `streaming`
  placeholder stuck past `STALE_MS` (120s, heartbeat = `updatedAt`) as `error`. **Poll-first durability
  (built for flaky mobile):** the persisted Mongo thread is the source of truth — the client reads it via
  **TanStack Query** `useQuery(['thread', id])`, polling while the latest turn is `streaming` and catching
  up on reconnect/foreground (`refetchOnReconnect`/`refetchOnWindowFocus` `'always'`); the live `useChat`
  stream is a best-effort **overlay** (rendered only while a turn streams on this client), reconciled by
  writing the finished turn into the RQ cache (`setQueryData`, keyed by `generationId`) then invalidating
  — so a Mongo-down or empty refetch can't wipe a streamed answer. `result.consumeStream()` keeps the
  server generating through a client disconnect. `GET /api/get-threads` / `GET /api/get-thread` /
  `POST /api/delete-thread` back the sidebar + history (`['threads']` query). See
  `docs/chat-durability-plan.md`, `backend/apis/notes/search-relevant-notes.ts`,
  `backend/services/ai/agentic-rag.ts`, `backend/services/chat-threads.ts`, and
  `frontend/src/context/StreamChatContext.tsx`. (Legacy `services/ai/ai_chat.ts` still powers note
  titling via `get-note-title`.) Retrieval: a dense **`gemini-embedding-001`** candidate pool (3072-dim, via OpenRouter —
  `clients/embedding_client.ts`, shared by indexing + query) is reranked by **Jina
  `v2-base-multilingual`** and gated to the top few (`services/ai/rerank.ts`; set `JINA_API_KEY`
  to enable, else vector order). **Postgres is the read-time source of truth** — the tools return
  note text from Postgres and `search_notes` only ranks candidate ids in Qdrant, so a Qdrant↔Postgres
  desync can't surface a deleted/stale note. Note reads + the retrieval tools' user-scoped
  queries go through `backend/repositories/notes.ts` (one home for the `userId` tenancy filter).
  Create/update embed **inside the save transaction**
  (sync-or-fail — a failed embed rolls back the save, so the stores stay in lockstep; the client's
  localStorage draft means nothing is lost); `scripts/reembed-notes.ts`
  reconciles). Hybrid BM25 + chunking remain planned in `docs/rag-execution-plan.md`.
- **Image attachments (pay-per-look):** the composer uploads an image — click the picker, **paste**
  a screenshot, or **drag-drop** a file (all share `uploadImageFile` in `MainTextarea.tsx`) — to
  `POST /api/chat-image`
  (base64-in-JSON; stored on disk under `data/chat-images/<userId>/<id>`, magic-byte validated,
  served back owner-scoped by `GET /api/chat-image/:id`), and the user message carries only a
  `/api/chat-image/<id>` file-part **reference** (persisted in Mongo, rendered via the authed
  `useAuthedImageUrl` blob fetch since an `<img>` can't send the bearer). A provider can't fetch that
  bearer-gated url, so `agentic-rag.ts` inlines the **most-recent** image's bytes as a model
  `ImagePart` before the call and turns older images into `[εικόνα <id>]` placeholders; the model
  re-examines one via the **`view_image`** tool, which makes the server re-inject those bytes as a
  **user** message in `prepareStep` (images aren't honored on `role:"tool"` messages over OpenRouter's
  OpenAI-compatible transport). Upload is gated on `modelHasVision` (`shared/ai/chatModels.ts`); image
  files are unlinked when their thread is deleted. See `backend/services/chat-images.ts`.
- **Model prompt prep:** prior assistant turns are fed to the model as **text only**
  (`historyForModel`, `services/ai/message-history.ts`) — their persisted tool-call/reasoning parts
  round-trip from Mongo (Mixed) with schema-invalid fields (e.g. `providerExecuted: null`) and would make
  `streamText` reject the whole prompt (*"messages do not match the ModelMessage[] schema"*), wedging a
  thread. Durable note-action state is projected into deterministic text summaries (e.g. proposed
  edit before→after + user applied/discarded, saved note, manual retry saved); the UI still renders
  the full persisted parts, only the model input is reduced.
  `convertToModelMessages` also passes `ignoreIncompleteToolCalls`.

## Data stores (who owns what)

- **Postgres** (Drizzle, schema in `shared/db/schema/`) — source of truth for
  `notes`, `reminders`, `profile`, `tefteri` (cost ledger), `kataskopos` (per-request
  AI cost), `wines`/`customers` (editor autocomplete lists), and
  `ecb_conversion_rates` (USD→EUR rate cache). Migrations in `shared/drizzle/`.
- **Qdrant** — note embeddings (`notes` collection, **3072-dim**, `gemini-embedding-001`). Domain collections
  (`beverages`, `polites`, `customers`, `sales` — all 1536-dim ada-002) are provisioned by
  `backend/scripts/qdrant-init.ts` but currently **dormant** — only `notes` is
  queried (the wine/customer RAG path is commented out; autocomplete reads Postgres).
- **MongoDB** — AI chat threads/messages (`backend/model/mongo-db/`), connected at
  worker startup and written by the chat flow (see below). Each message carries the
  poll-first lifecycle fields `status` (`streaming`/`complete`/`error`), `generationId`
  (client-minted; correlates the live stream ↔ persisted turn, and is the assistant's
  DTO id), and `updatedAt` (heartbeat for the read-time staleness rule). Best-effort: if
  Mongo is down the API still serves, persistence just no-ops (and the client keeps the
  live/optimistic answer on screen).
- **Redis** — runtime cache (includes the live ECB conversion rate).
- **Disk** (`data/chat-images/<userId>/<id>`) — chat image attachment bytes, referenced by a
  `/api/chat-image/<id>` file part on the user's Mongo message. One file per image (crypto-random id,
  magic-byte–validated raster). Mounted into the backend container in `docker-compose.yml` (base) so it
  rides the `./data` backing; unlinked on thread delete. See `backend/services/chat-images.ts`.

The Postgres source of truth is `shared/db/schema/` only (the old pre-Drizzle
`backend/model/postgresql/*.sql` and custom migration runner have been removed).

**Storage backing:** in dev the stores persist in named Docker volumes
(`notes_ai_{postgres,mongo,qdrant}_data`, set in `docker-compose.override.yml`) — fast on
Windows/macOS hosts, where a `./data` bind mount is slow over the VM's 9p/virtiofs
boundary. Prod keeps the `./data` bind mounts (base-compose default, Linux VM). See
`docs/data-stores.md`.

## Auth — Clerk (only)

- Frontend: `ClerkProvider` in `frontend/src/main.tsx`. Requests attach the Clerk
  session token as `Authorization: Bearer` (see `frontend/src/integrations/api.ts`).
- Backend: `clerkMiddleware()` + `verifyJWT` (`backend/authentication/verifyJWT.ts`)
  loads `role` (admin/user) from the `profile` table and fetches the Clerk user
  only when lazily provisioning a missing profile.
- The `profile` table PK **is** the Clerk user ID (`text`).

There is **no Supabase**. If you see `@supabase/*` imports, they are leftover — do
not add new ones. See `docs/auth.md`.

**Dev auth bypass (off by default):** set `DEV_AUTH_BYPASS=true` in the **root `.env`**
to open the app without signing in — the backend authenticates every request as a fixed
local admin (`dev-user`) and the frontend skips the Clerk gate. Single switch, wired to
both containers via `docker-compose.override.yml`; double-guarded (`MODE=dev` /
`import.meta.env.DEV`) so it can never reach prod. Enabling/disabling needs the app
containers recreated: `docker compose up -d --no-deps --force-recreate backend frontend`.
**If you turn it on, turn it back OFF when you're done** (the backend logs a loud warning
at startup while it's on). Details in `docs/auth.md` → "Dev auth bypass".

## Code quality — check before writing

Before writing or editing any code, pause and ask:

1. **Is it readable?** Names should be self-explanatory. If a reader needs a comment to understand what something does, rename it or split it up instead.
2. **Is it simple?** Prefer the straightforward solution. If a function is doing two things, split it. If a variable needs a comment to explain its shape, type it properly.
3. **Are abstractions at the right level?** Extract shared logic into a well-named helper when it genuinely reduces duplication or clarifies intent — not just to DRY things up mechanically. Premature abstraction is worse than repetition.
4. **Is the data flow obvious?** Avoid implicit state mutation, side effects hidden inside getters, or functions that do surprising things. Each unit should do exactly what its name says.
5. **Does it fit the surrounding code?** Match the style, patterns, and naming conventions of the file you're editing. Inconsistency is its own kind of mess.

Sloppy code (unclear names, overlong functions, logic that needs a mental map to follow) is a bug. Refactor it, don't ship it.

## Conventions / gotchas

- **Imports use `.js` extensions** on relative paths (`./foo.js`) even though files
  are `.ts` — Bun resolves them. Keep this style.
- **Path aliases** (one shared alias, no duplicates):
  - everywhere: `@shared` → `shared/index.ts` barrel, `@shared/*` → `shared/*`
    (e.g. `import { Note } from "@shared"` or `"@shared/db/schema/notes"`).
  - backend (baseUrl): `clients/*`, `apis/*`, `repositories/*`, `services/*`, `utils/*`,
    `middleware/*`, `authentication/*`, `model/*`.
  - frontend: `@/*` → `src`.
  - See each workspace's `tsconfig.json` and `frontend/vite.config.ts`.
- All `/api/*` routes (except `create-profile`) go through `verifyJWT`; `req.user.id`
  is the Clerk user ID. List pages use `queryMiddleware` (pagination/sort).
- Errors: throw `AppError` / let `asyncHandler` forward to `errorHandler`.
- `console.*` is monkey-patched to the pino `logger` in `server.ts`.
- **Keep the docs current.** After any code change that touches structure, deps,
  routes, data stores, auth, or conventions, update `CLAUDE.md` and the relevant
  `docs/*` file in the same change — treat stale docs as a bug.

## Deeper docs

- `docs/architecture.md` — services, request lifecycle, clustering, Docker dev/prod.
- `docs/deployment.md` — production deploy runbook (native nginx + Dockerized backend on the VM, mneme.narusec.io).
- `docs/data-stores.md` — every Postgres table, Qdrant collection, Mongo model.
- `docs/api-reference.md` — all backend endpoints.
- `docs/auth.md` — Clerk flow front-to-back + profile provisioning.
- `docs/frontend.md` — frontend structure, routing, provider tree, shadcn, API layer, TipTap.
- `docs/improvement-plan.md` — frontend backlog (correctness/perf/quality).
- `docs/rag-enhancement-plan.md` — backend RAG → agentic tool-calling upgrade backlog (Qwen3.6/GLM-5.1, hybrid+reranker, chat UI).
- `docs/rag-execution-plan.md` — sourced, ROI-ranked execution decisions for the above (Qwen3.6-Plus, Qwen3-Embedding, reranker, Vercel AI SDK stack).
- `docs/smoke-tests.md` — manual QA checklist.
