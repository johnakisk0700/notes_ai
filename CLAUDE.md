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

# Backend (from backend/)
bun --watch run server.ts      # dev, hot reload
bun run build                  # bundle to dist/server.js

# Frontend (from frontend/)
bun run dev                    # Vite dev server (http://localhost:5173)
bun run build                  # production build
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
  results, and answers grounded in them. The loop is capped at `MAX_STEPS` (runaway guard —
  the SDK default is a single step; the last step drops tools via `prepareStep` to force an
  answer), and `result.consumeStream()` keeps the turn persisting even if the client
  disconnects. The system prompt carries only persona + answer policy — the SDK injects each
  tool's name/description/schema, so the prompt does **not** re-describe them. Default model
  **Qwen3.6-Plus via OpenRouter** when `OPENROUTER_API_KEY` is set, else **gpt-5-mini** on
  `OPENAI_API_KEY` (`clients/llm_providers.ts`) — one of several user-selectable models
  (`shared/ai/chatModels.ts`: Qwen/GLM via OpenRouter + GPT via OpenAI). Streamed as an AI SDK UI message stream
  (text + `tool-*` + `reasoning` parts); the client consumes it with `useChat`
  (`experimental_throttle` coalesces token re-renders; `CustomMarkdown` is memoized so only
  the streaming message re-parses) and renders tool calls + reasoning (`ToolCallCard`/`ReasoningCard`),
  plus a `ThinkingIndicator` while no answer text is streaming yet (`context/StreamChatContext.tsx`,
  `components/Chat/`).
  A new thread's id comes back as a transient `data-thread` part so the client routes to
  `/thread/:id`. The assistant turn is persisted to a Mongo thread with its **full UIMessage
  `parts`** (text + tool calls) plus `metadata` (`{ model, costEur, totalTokens }`, set via
  `messageMetadata` → shown as a muted per-answer badge), assembled via `createUIMessageStream`'s
  `onFinish` (`responseMessage`), so reopening a thread re-renders the tool cards + badge. `GET /api/get-threads` / `GET /api/get-thread` /
  `POST /api/delete-thread` back the sidebar + history. See
  `backend/apis/notes/search-relevant-notes.ts`, `backend/services/ai/agentic-rag.ts`, and
  `backend/services/chat-threads.ts`. (Legacy `services/ai/ai_chat.ts` still powers note
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
  worker startup and written by the chat flow (see below). Best-effort: if Mongo is
  down the API still serves, persistence just no-ops.
- **Redis** — runtime cache (includes the live ECB conversion rate).

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
