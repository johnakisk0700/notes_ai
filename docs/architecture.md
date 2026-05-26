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
3. Per-route: `verifyJWT` (resolves Clerk user + admin role from `profile`), then
   `queryMiddleware` on list endpoints (pagination/sorting), then the handler wrapped
   in `asyncHandler`.
4. Errors bubble to `errorHandler` (last middleware). Handlers throw `AppError` for
   controlled failures.

Dev runs plain HTTP; production runs HTTPS reading Let's Encrypt certs from
`/etc/letsencrypt/live/www.mysert.com/`. Controlled by `MODE` (`dev` vs anything else).

## AI chat flow

`POST /api/search-notes` (`apis/notes/search-relevant-notes.ts`):

1. Embed the user query with OpenAI `text-embedding-ada-002`.
2. Vector search the `notes` Qdrant collection, filtered to the requesting user
   (and any selected users for admins).
3. Inject the retrieved notes into a system/user prompt and **stream** the answer
   back via `handleAiStream` (`services/ai/ai_chat.ts`). Chat answers and note-title
   generation use `gpt-5-mini` (a reasoning model — `ai_chat.ts` omits `temperature`
   and sets `reasoning.effort: "low"` for `o*`/`gpt-5*` ids); `ai_models.ts` +
   `ai_chat.ts` also support Claude (Anthropic) and Fireworks (Llama/Qwen) providers.
4. The turn is persisted to a Mongo thread (`services/chat-threads.ts`, over the
   `UserThread`/`Message` models). If the request carries no `threadId`, the server
   creates a thread, persists the user message, and streams the new id back as an
   `event: thread` frame so the client can route to `/thread/:id`. The assistant
   answer is appended in the stream's `onDone`. Persistence is **best-effort** — a
   Mongo failure is logged and never blocks the streamed answer.

Threads are read back via `GET /api/get-threads` (sidebar list) +
`GET /api/get-thread?threadId=` (history); `POST /api/delete-thread` removes one.
The worker opens the Mongo connection at startup (`connectToDatabase`, also
best-effort).

Notes are embedded on write: `store-note` / `update-note` call
`createAndSaveNoteEmbedding` (`services/embeddings.ts`) which upserts into Qdrant.

## Deployment

Two paths:

- **Docker (whole stack)** — `docker-compose.yml` (base) merges with
  `docker-compose.override.yml` (dev) or `docker-compose.prod.yml` (prod):
  - `bun run dev` → `docker compose up`: backend + frontend hot-reload (HTTP) with the
    source bind-mounted, so code edits need no rebuild. Hot reload polls for changes by
    default (`WATCH_POLLING=true`) since the repo sits on a Windows drive bind-mounted
    into Linux, where native file events don't fire — backend via `nodemon`, Vite via
    `server.watch.usePolling`. Use `bun run dev:rebuild` (adds `--build
    --renew-anon-volumes`) after dependency or Dockerfile changes.
  - `bun run prod` → adds `docker-compose.prod.yml`: backend runs the bundle (HTTPS,
    certs mounted from `/etc/letsencrypt`), frontend is a static build served by nginx
    (`frontend/Dockerfile`, `frontend/nginx.conf`).
  - Two one-shot init services run before the API serves, each waited on via
    `service_completed_successfully`: `migrate` (Dockerfile `migrate` target →
    `shared/migrate.ts`, applies DB migrations once Postgres is healthy) and
    `qdrant-init` (Dockerfile `qdrant-init` target → `backend/scripts/qdrant-ensure.ts`,
    ensures the Qdrant collections exist). Both are idempotent. See `docs/data-stores.md`.
  - The backend Dockerfile is multi-stage (`dev`, `migrate`, `qdrant-init`, `build`,
    `runtime`); the frontend Dockerfile has `dev` + `runtime`. The compose `environment` block
    overrides DB hostnames to the internal service names, so `backend/.env` only needs
    API keys + auth secrets.
- **`deploy.ts`** (legacy VM deploy) — rsyncs `frontend` build + `backend` + `shared`
  to a remote host and restarts via `pm2`. Run `bun deploy.ts eu`.

## Environment variables

Backend (`backend/.env`, see `.env.example`): `MODE`, `APP_PORT`, `OPENAI_API_KEY`,
`POSTGRES_URI`, `MONGODB_URI`, `REDIS_URL`, `QDRANT_HOST`/`QDRANT_PORT`, Clerk keys
(`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`), plus optional Azure/Google voice keys.

Frontend (`frontend/.env`): `VITE_API_DEV_URL`, `VITE_API_PROD_URL`,
`VITE_CLERK_PUBLISHABLE_KEY`.

Root (`.env`, read by docker compose — see `.env.example`): `VITE_CLERK_PUBLISHABLE_KEY`,
`VITE_API_DEV_URL`, `VITE_API_URL`, `BACKEND_MODE`.
