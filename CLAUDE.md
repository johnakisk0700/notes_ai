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
bun run prod         # PROD: bundled backend (HTTPS) + nginx-served frontend (detached)
bun run dev:down     # stop the dev stack          (prod:down for prod)
bun run logs         # tail all service logs

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
bun scripts/qdrant-init.ts            # DESTRUCTIVE reset: drops + reseeds `polites`, then ensures
                                      #   collections. Run by hand only (guarded by import.meta.main).
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
                                       ├─► OpenAI (embeddings) + GPT/Claude/Fireworks (streamed chat)
                                       ├─► Qdrant (vector search over note embeddings)
                                       └─► MongoDB (chat threads/messages)
```

- Server forks a worker per 2 CPUs (`cluster`). Dev = plain HTTP, prod = HTTPS
  with Let's Encrypt certs. Entry: `backend/server.ts` (all routes registered here).
- Chat flow: `POST /api/search-notes` embeds the query, vector-searches the user's
  notes in Qdrant, then streams the answer (GPT by default; Claude/Fireworks also
  wired in `services/ai/ai_models.ts`). The turn is persisted to a Mongo thread
  (created on the first message; its id is streamed back via an `event: thread`
  frame so the client can route to `/thread/:id`). `GET /api/get-threads` /
  `GET /api/get-thread` / `POST /api/delete-thread` back the sidebar + history.
  See `backend/apis/notes/search-relevant-notes.ts`, `backend/services/chat-threads.ts`,
  and `backend/services/ai/ai_chat.ts`.

## Data stores (who owns what)

- **Postgres** (Drizzle, schema in `shared/db/schema/`) — source of truth for
  `notes`, `reminders`, `profile`, `tefteri` (cost ledger), `kataskopos` (per-request
  AI cost), `wines`/`customers` (editor autocomplete lists), and
  `ecb_conversion_rates` (USD→EUR rate cache). Migrations in `shared/drizzle/`.
- **Qdrant** — note embeddings (`notes` collection, 1536-dim). Domain collections
  (`beverages`, `polites`, `customers`, `sales`) are provisioned by
  `backend/scripts/qdrant-init.ts` but currently **dormant** — only `notes` is
  queried (the wine/customer RAG path is commented out; autocomplete reads Postgres).
- **MongoDB** — AI chat threads/messages (`backend/model/mongo-db/`), connected at
  worker startup and written by the chat flow (see below). Best-effort: if Mongo is
  down the API still serves, persistence just no-ops.
- **Redis** — runtime cache (includes the live ECB conversion rate).

The Postgres source of truth is `shared/db/schema/` only (the old pre-Drizzle
`backend/model/postgresql/*.sql` and custom migration runner have been removed).

## Auth — Clerk (only)

- Frontend: `ClerkProvider` in `frontend/src/main.tsx`. Requests attach the Clerk
  session token as `Authorization: Bearer` (see `frontend/src/integrations/api.ts`).
- Backend: `clerkMiddleware()` + `verifyJWT` (`backend/authentication/verifyJWT.ts`)
  resolves the Clerk user and loads `role` (admin/user) from the `profile` table.
- The `profile` table PK **is** the Clerk user ID (`text`).

There is **no Supabase**. If you see `@supabase/*` imports, they are leftover — do
not add new ones. See `docs/auth.md`.

## Conventions / gotchas

- **Imports use `.js` extensions** on relative paths (`./foo.js`) even though files
  are `.ts` — Bun resolves them. Keep this style.
- **Path aliases** (one shared alias, no duplicates):
  - everywhere: `@shared` → `shared/index.ts` barrel, `@shared/*` → `shared/*`
    (e.g. `import { Note } from "@shared"` or `"@shared/db/schema/notes"`).
  - backend (baseUrl): `clients/*`, `apis/*`, `services/*`, `utils/*`,
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
- `docs/data-stores.md` — every Postgres table, Qdrant collection, Mongo model.
- `docs/api-reference.md` — all backend endpoints.
- `docs/auth.md` — Clerk flow front-to-back + profile provisioning.
- `docs/frontend.md` — frontend structure, routing, provider tree, shadcn, API layer, TipTap.
- `docs/improvement-plan.md` — frontend backlog (correctness/perf/quality).
- `docs/smoke-tests.md` — manual QA checklist.
