# CLAUDE.md

AI notes assistant: users write notes (voice or text), notes are embedded and
stored, and a chat answers questions over them via semantic search. Greek/English UI.

## Monorepo (Bun workspaces)

| Workspace  | What it is                                                        |
| ---------- | ----------------------------------------------------------------- |
| `backend/` | Express API on Bun. Auth, notes CRUD, AI chat, transcription.     |
| `gui_v2/`  | React 19 + Vite + Tailwind v4 + shadcn/ui SPA.                    |
| `shared/`  | Drizzle schema + shared TS types/DTOs, imported as `@shared/*`.   |

`backend/apokrasopoihsh_bin/` and any `*_old`/`_prototype` files are dead code — ignore.

## Commands

Run from the workspace dir (no root scripts exist):

```bash
# Backend (from backend/)
bun --watch run server.ts      # dev, hot reload
bun run build                  # bundle to dist/

# Frontend (from gui_v2/)
bun run dev                    # Vite dev server (http://localhost:5173)
bun run build                  # production build
bun run lint

# DB migrations (from shared/, needs POSTGRES_URI)
bunx drizzle-kit generate      # generate migration from schema changes
bunx drizzle-kit migrate       # apply migrations

# Whole stack (data services + backend + gui) — from repo root
docker compose up --build
```

Docker host ports: gui `8081`, backend `5100`, qdrant `6971`, redis `6380`,
postgres `5433`, mongo `27018`. See `docker-compose.yml` header.

## Architecture at a glance

```
gui_v2 (axios, Bearer token) ──► backend /api/* ──► Postgres (notes/reminders/profiles)
                                       │
                                       ├─► OpenAI (embeddings + GPT chat, streamed)
                                       ├─► Qdrant (vector search over note embeddings)
                                       └─► MongoDB (chat threads/messages)
```

- Server forks a worker per 2 CPUs (`cluster`). Dev = plain HTTP, prod = HTTPS
  with Let's Encrypt certs. Entry: `backend/server.ts` (all routes registered here).
- Chat flow: `POST /api/search-notes` embeds the query, vector-searches the user's
  notes in Qdrant, then streams a GPT answer. See `backend/apis/notes/search-relevant-notes.ts`.

## Data stores (who owns what)

- **Postgres** (Drizzle, schema in `shared/db/schema/`) — source of truth for
  `notes`, `reminders`, `profile`, `tefteri` (cost ledger), `kataskopos`. Migrations in `shared/drizzle/`.
- **Qdrant** — note embeddings (`notes` collection, 1536-dim) + domain collections (`beverages`, `polites`).
- **MongoDB** — AI chat threads/messages (`backend/model/mongo-db/`).
- **Redis** — runtime cache.

Note: legacy `backend/model/postgresql/*.sql` and some mongo models predate the
Drizzle migration and are **not** the source of truth. Use `shared/db/schema/` for Postgres.

## Auth — Clerk (only)

- Frontend: `ClerkProvider` in `gui_v2/src/main.tsx`. Requests attach the Clerk
  session token as `Authorization: Bearer` (see `gui_v2/src/integrations/api.ts`).
- Backend: `clerkMiddleware()` + `verifyJWT` (`backend/authentication/verifyJWT.ts`)
  resolves the Clerk user and loads `role` (admin/user) from the `profile` table.
- The `profile` table PK **is** the Clerk user ID (`text`).

There is **no Supabase**. If you see `@supabase/*` imports, they are leftover and
being removed — do not add new ones. See `docs/auth.md`.

## Conventions / gotchas

- **Imports use `.js` extensions** on relative paths (`./foo.js`) even though files
  are `.ts` — Bun resolves them. Keep this style.
- Path aliases: backend `clients/*`, `apis/*`, `utils/*`, … (baseUrl) and `@shared/*`;
  frontend `@/*` → `src`, `@shared` → `shared`. See `tsconfig.json` / `vite.config.ts`.
- All `/api/*` routes (except `create-profile`) go through `verifyJWT`; `req.user.id`
  is the Clerk user ID. List pages use `queryMiddleware` (pagination/sort).
- Errors: throw `AppError` / let `asyncHandler` forward to `errorHandler`.
- `console.*` is monkey-patched to the pino `logger` in `server.ts`.

## Deeper docs

- `docs/architecture.md` — services, request lifecycle, clustering, deployment.
- `docs/data-stores.md` — every Postgres table, Qdrant collection, Mongo model.
- `docs/api-reference.md` — all backend endpoints.
- `docs/auth.md` — Clerk flow front-to-back + profile provisioning.
