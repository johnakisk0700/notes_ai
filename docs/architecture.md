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

`POST /api/search-notes` (`apis/notes/search-relevant-notes.ts`):

1. Embed the user query with `google/gemini-embedding-001` (via OpenRouter — `clients/embedding_client.ts`).
2. Vector search the `notes` Qdrant collection, filtered to the requesting user
   (and any selected users for admins).
3. Inject the retrieved notes into a system/user prompt and **stream** the answer
   back via `handleAiStream` (`services/ai/ai_chat.ts`). Chat answers and note-title
   generation use `gpt-5-mini` (a reasoning model — `ai_chat.ts` omits `temperature`
   and sets `reasoning.effort: "low"` for `o*`/`gpt-5*` ids); `ai_models.ts` +
   `ai_chat.ts` also support Claude (Anthropic) and Fireworks (Llama/Qwen) providers.
4. The turn is persisted to a Mongo thread (`services/chat-threads.ts`, over the
   `UserThread`/`Message` models) **off the response path**: the thread id is
   generated locally (a new chat's id streams back immediately as a transient
   `data-thread` part, so the client routes to `/thread/:id`) and the user-message
   write runs in the background. The assistant turn is appended on stream finish,
   after that write lands. Persistence is **best-effort** — it never blocks or fails
   the streamed answer, and while Mongo is down it no-ops instantly (no buffering stall).

Threads are read back via `GET /api/get-threads` (sidebar list) +
`GET /api/get-thread?threadId=` (history); `POST /api/delete-thread` removes one.
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

Frontend (`frontend/.env`): `VITE_API_DEV_URL`, `VITE_API_PROD_URL`,
`VITE_CLERK_PUBLISHABLE_KEY`.

Root (`.env`, read by docker compose + `deploy.ts` — see `.env.example`):
`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_DEV_URL`, `VITE_API_PROD_URL`, `BACKEND_TLS`.
