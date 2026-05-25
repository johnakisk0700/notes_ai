# Architecture

## Pieces

- **gui_v2** — React 19 SPA (Vite, Tailwind v4, shadcn/ui, react-router 7).
  Talks to the backend over HTTP with an axios instance (`src/integrations/api.ts`)
  that injects the Clerk Bearer token on every request.
- **backend** — Express 4 running on Bun. Single entry point `server.ts` registers
  every route. No router files — routes are flat in `server.ts`.
- **shared** — Drizzle schema (`db/schema/`), migrations (`drizzle/`), and shared
  TS interfaces/DTOs. Imported by both backend (`@shared/*`) and frontend (`@shared`).

## Request lifecycle (backend)

1. `clusterprimary` forks one worker per 2 CPUs; each worker runs the Express app.
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
   answer back via `handleAiStream` (`service/ai_malakies/ai_chat.ts`).
4. Chat threads/messages persist in MongoDB.

Notes are embedded on write: `store-note` / `update-note` call
`createAndSaveNoteEmbedding` (`service/embeddings.ts`) which upserts into Qdrant.

## Deployment

`docker-compose.yml` builds `backend/Dockerfile` and `gui_v2/Dockerfile` (nginx,
config in `gui_v2/nginx.conf`) and starts qdrant/redis/postgres/mongo. The compose
`environment` block overrides DB hostnames to the internal service names, so
`backend/.env` only needs API keys + auth secrets. `deploy.ts` at the repo root is
the deploy helper script.

## Environment variables

Backend (`backend/.env`, see `.env.example`): `MODE`, `APP_PORT`, `OPENAI_API_KEY`,
`POSTGRES_URI`, `MONGODB_URI`, `REDIS_URL`, `QDRANT_HOST`/`QDRANT_PORT`, Clerk keys
(`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`), plus optional Azure/Google voice keys.

Frontend (`gui_v2/.env`): `VITE_API_DEV_URL`, `VITE_API_PROD_URL`,
`VITE_CLERK_PUBLISHABLE_KEY`.
