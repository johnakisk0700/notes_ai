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
3. Inject the retrieved notes into a GPT system/user prompt and **stream** the
   answer back via `handleAiStream` (`services/ai/ai_chat.ts`).
4. Chat threads/messages persist in MongoDB.

Notes are embedded on write: `store-note` / `update-note` call
`createAndSaveNoteEmbedding` (`services/embeddings.ts`) which upserts into Qdrant.

## Deployment

Two paths:

- **Docker (whole stack)** — `docker-compose.yml` (base) merges with
  `docker-compose.override.yml` (dev) or `docker-compose.prod.yml` (prod):
  - `bun run dev` → `docker compose up --build`: backend hot-reloads (`bun --watch`,
    HTTP) with the source bind-mounted, frontend on the Vite dev server (HMR).
  - `bun run prod` → adds `docker-compose.prod.yml`: backend runs the bundle (HTTPS,
    certs mounted from `/etc/letsencrypt`), frontend is a static build served by nginx
    (`frontend/Dockerfile`, `frontend/nginx.conf`).
  - Both Dockerfiles are multi-stage with `dev` and `runtime` targets. The compose
    `environment` block overrides DB hostnames to the internal service names, so
    `backend/.env` only needs API keys + auth secrets.
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
