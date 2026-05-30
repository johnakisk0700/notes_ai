# Architecture

## Pieces

- **frontend** — React 19 SPA (Vite, Tailwind v4, shadcn/ui, react-router 7).
  Talks to the backend over HTTP with an axios instance (`src/integrations/api.ts`)
  that injects the Clerk Bearer token on every request.
- **backend** — Express 4 running on Bun. Single entry point `server.ts` registers
  every route. No router files — routes are flat in `server.ts`.
- **shared** — Drizzle schema (`db/schema/`), migrations (`drizzle/`), and shared
  TS interfaces/DTOs. Imported by both backend and frontend via `@shared` (barrel)
  or `@shared/*` (deep paths).

## Request lifecycle (backend)

1. `cluster` primary forks one worker per 2 CPUs; each worker runs the Express app.
2. Global middleware: CORS → `timeLogger` → `costMiddleware` → `clerkMiddleware()`.
3. Per-route: `verifyJWT` reads the user's admin role from `profile` (and fetches
   Clerk identity only for first-request lazy provisioning), then `queryMiddleware`
   on list endpoints (pagination/sorting), then the handler wrapped in `asyncHandler`.
4. Errors bubble to `errorHandler` (last middleware). Handlers throw `AppError` for
   controlled failures.

Dev runs plain HTTP. In production the **native host nginx** terminates TLS for
`mneme.narusec.io` and proxies `/api/` to the backend, which serves plain HTTP
(`MODE=production`, `BACKEND_TLS=off`). The backend can also serve HTTPS directly
(`BACKEND_TLS=on`, certs from `TLS_KEY_PATH`/`TLS_CERT_PATH`). See `docs/deployment.md`.

## AI chat flow

`POST /api/search-notes` (`apis/notes/search-relevant-notes.ts`) runs **agentic RAG on the
Vercel AI SDK** — it records the user turn and delegates to `streamNotesChat`
(`services/ai/agentic-rag.ts`):

1. Run a streaming multi-step tool loop (`streamText` + `stopWhen: stepCountIs(MAX_STEPS)`).
   The model is handed note-retrieval tools (`search_notes`, `filter_by_date`,
   `list_recent_notes` — `services/ai/notes-tools.ts`, which read through
   `repositories/notes.ts`), calls them, reads the results, and answers grounded in them. On
   the final allowed step `prepareStep` drops the tools to force an answer.
2. `search_notes` embeds the query with `google/gemini-embedding-001` (via OpenRouter —
   `clients/embedding_client.ts`), ranks candidate ids in the `notes` Qdrant collection
   (scoped to the requesting user, plus any selected users for admins), then reads the **live
   rows from Postgres** (the read-time source of truth) and reranks them with Jina.
3. The answer **streams** to the client as an AI SDK UI message stream (text + `tool-*` +
   `reasoning` parts). The chat model is **user-selectable** (`shared/ai/chatModels.ts`):
   default **Qwen3.6-Plus via OpenRouter** when `OPENROUTER_API_KEY` is set (other Qwen/GLM
   on OpenRouter + GPT on OpenAI are offered), else `gpt-5-mini` (`clients/llm_providers.ts`).
   Reasoning-effort is sent only to reasoning-capable models. Per-turn cost is computed from
   usage and recorded. (Note-title generation is separate: `get-note-title` → `getAiChatResponse`
   in `services/ai/ai_chat.ts`, always on `gpt-5-mini`.)
4. The turn is persisted to a Mongo thread (`services/chat-threads.ts`, over the
   `UserThread`/`Message` models) **off the response path**: the thread id is
   generated locally (a new chat's id streams back immediately as a transient
   `data-thread` part, so the client routes to `/thread/:id`) and the user-message
   write runs in the background. The assistant turn is appended on stream finish,
   after that write lands. Tool outputs observed during `onStepFinish` are used to
   hydrate finalized `tool-*` parts before persistence, so reloaded note-action cards
   have their output snapshots. Persistence is **best-effort** — it never blocks or fails
   the streamed answer, and while Mongo is down it no-ops instantly (no buffering stall).

Threads are read back via `GET /api/get-threads` (sidebar list) +
`GET /api/get-thread?threadId=` (history); `POST /api/delete-thread` removes one.
`POST /api/update-tool-transaction` records owner-scoped Apply/Discard/manual-retry
state in a message-level log keyed by `toolCallId` and overlays it onto the note-action
tool part on read. Future LLM calls still receive assistant history as
plain text: `message-history.ts` drops raw tool/reasoning blobs and adds deterministic
summaries like "a note edit was proposed from X to Y; the user applied it."
The worker opens the Mongo connection in the background at startup
(`connectToDatabase`, retry/backoff) and relies on the driver to auto-reconnect on
drops — also best-effort.

Notes are embedded on write: `store-note` / `update-note` call
`createAndSaveNoteEmbedding` (`services/embeddings.ts`) which upserts into Qdrant.

## Deployment

**Production (VM) — `docs/deployment.md` is the full runbook.** The frontend + nginx
run **natively** on the VM; the backend + data stores run in Docker. The native nginx
terminates TLS for `mneme.narusec.io`, serves the static SPA from disk, and
reverse-proxies `/api/` to the Dockerized backend on `127.0.0.1:5100` (plain HTTP) — so
prod is same-origin and there's no extra container hop. `bun deploy.ts eu` builds the SPA,
rsyncs the repo + build to the VM, and runs `docker compose -f docker-compose.yml -f
docker-compose.prod.yml up -d --build`, which brings up the backend +
Postgres/Mongo/Qdrant/Redis + the one-shot migrate/qdrant-init in order, so migrations
apply before the API serves. The host nginx server block lives in `deploy/nginx/`;
secrets stay in `backend/.env` on the VM (never rsynced — see `.rsyncignore`).

Docker (the compose stack) backs both dev and the prod backend:

- `docker-compose.yml` (base) merges with `docker-compose.override.yml` (dev) or
  `docker-compose.prod.yml` (prod).
- `bun run dev` → `docker compose up`: backend + frontend hot-reload (HTTP), source
  bind-mounted so edits need no rebuild. Hot reload polls (`WATCH_POLLING=true`) since the
  repo sits on a Windows drive bind-mounted into Linux, where native file events don't
  fire — backend via `nodemon`, Vite via `server.watch.usePolling`. Use `bun run
  dev:rebuild` (adds `--build --renew-anon-volumes`) after dependency or Dockerfile changes.
- `bun run prod` → adds `docker-compose.prod.yml`: backend runs the bundle on plain HTTP
  (`BACKEND_TLS=off`); the `frontend` container is parked behind the `frontend-container`
  profile (prod serves the SPA via native nginx), so add `--profile frontend-container`
  for a local full-stack prod test.
- Two one-shot init services run before the API serves, each waited on via
  `service_completed_successfully`: `migrate` (Dockerfile `migrate` target →
  `shared/migrate.ts`, applies DB migrations once Postgres is healthy) and `qdrant-init`
  (Dockerfile `qdrant-init` target → `backend/scripts/qdrant-ensure.ts`, ensures the
  Qdrant collections exist). Both are idempotent. See `docs/data-stores.md`.
- The backend Dockerfile is multi-stage (`dev`, `migrate`, `qdrant-init`, `build`,
  `runtime`); the frontend Dockerfile has `dev` + `runtime`. The compose `environment`
  block overrides DB hostnames to the internal service names, so `backend/.env` only
  needs API keys + auth secrets.

## Environment variables

Backend (`backend/.env`, see `.env.example`): `MODE`, `APP_PORT`, `OPENAI_API_KEY`,
`POSTGRES_URI`, `MONGODB_URI`, `REDIS_URL`, `QDRANT_HOST`/`QDRANT_PORT`, Clerk keys
(`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`), plus optional Azure/Google voice keys.

Frontend build (Vite-inlined, read from the **root** `.env` — there is no
`frontend/.env`): `VITE_API_DEV_URL`, `VITE_API_PROD_URL`, `VITE_CLERK_PUBLISHABLE_KEY`.

Root (`.env`, read by docker compose + `deploy.ts` — see `.env.example`):
`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_DEV_URL`, `VITE_API_PROD_URL`, `BACKEND_TLS`.
