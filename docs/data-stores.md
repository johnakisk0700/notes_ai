# Data stores

Four stores, each with a clear role. **Postgres via Drizzle is the source of truth**
for relational app data; Qdrant holds vectors; Mongo holds chat history; Redis caches.

## Postgres (Drizzle)

Schema: `shared/db/schema/`. Client: `backend/clients/drizzle_postgres_client.ts`
(`drizzlePg`, registers the full schema barrel so the relational query API works
for every table). Migrations live in `shared/drizzle/`:

- **Generate** a migration from schema changes: `cd shared && bun run db:generate` (drizzle-kit).
- **Apply** pending migrations: `cd shared && bun run db:migrate`. This runs
  `shared/migrate.ts` — Drizzle's *programmatic* migrator (not `drizzle-kit migrate`),
  so it needs no esbuild bundling and runs identically on the host and inside Bun.
- **Auto-applied on startup**: `docker compose up` runs a one-shot `migrate` service
  (waits for Postgres healthy, applies pending migrations, exits) that the backend
  waits on via `service_completed_successfully` — so a fresh volume always has its
  tables before the API serves. Prod-on-VM still migrates via `deploy.ts`.

| Table        | Purpose                                                      | PK |
| ------------ | ------------------------------------------------------------ | -- |
| `profile`    | User profile + `role` (user/admin) + settings. **PK = Clerk user ID** (`text`). | id |
| `notes`      | User notes (title, **Markdown** content). `user_id` = Clerk ID. | uuid |
| `reminders`  | One reminder per note (`note_id` unique).                    | uuid |
| `tefteri`    | Per-user cost ledger (totalCost) joined to profile.          | — |
| `kataskopos` | Per-request AI cost tracking (model, in/out cost).           | uuid |
| `wines`      | Editor autocomplete list (unique `name`). Seeded by `scripts/seed-wines-customers.ts`. | uuid |
| `customers`  | Editor autocomplete list (`name`, optional `title`). Seeded by the same script. | uuid |
| `ecb_conversion_rates` | USD→EUR rate cache from the ECB API; refreshed by the `server.ts` cron, mirrored into Redis. | (from,to) |

> The Postgres source of truth is `shared/db/schema/` only. The pre-Drizzle
> `backend/model/postgresql/*.sql` files + custom migration runner have been removed.

## Qdrant (vectors)

Client: `backend/clients/qdrant_client.ts`. Collections (1536-dim, cosine) are
**auto-ensured on startup**: `docker compose up` runs a one-shot `qdrant-init`
service (`backend/scripts/qdrant-ensure.ts`, which waits for Qdrant then calls
`init_collections()`) that the backend waits on (`service_completed_successfully`),
so `store-note` doesn't 500 on a fresh Qdrant volume. It's idempotent (create-on-404).

> `backend/scripts/qdrant-init.ts`'s own `main()` is a **destructive reset** — it
> drops + reseeds `polites` — so it's guarded by `import.meta.main` and only runs
> when executed directly (`bun scripts/qdrant-init.ts`), never on startup.

- `notes` — note embeddings; payload has `user_id`, `content`, `created_at`,
  `concatenated` (the text that was embedded). The **only collection queried at
  runtime** (per-user, in chat).
- `beverages`, `polites`, `customers`, `sales` — domain collections (wine/customer
  RAG). Provisioned by `qdrant-init.ts` but currently **dormant**: the seeding calls
  in that script and the RAG query in `search-relevant-notes.ts` are commented out,
  and wine/customer autocomplete is served from Postgres (`wines`/`customers`).

Embedding model: OpenAI `text-embedding-ada-002`.

## MongoDB

Models: `backend/model/mongo-db/`. Client: `backend/clients/mongoose_client.ts`,
connected at worker startup (best-effort — failure is logged, not fatal). Holds AI
chat history: `UserThread` (one per conversation, embeds a `Message[]`), written by
the chat flow (`services/chat-threads.ts`) and read by `get-threads` / `get-thread`.

> `ECBConversionRate` (a Mongo model) is **dead code** — USD→EUR rates moved to the
> Postgres `ecb_conversion_rates` table + Redis. The model file lingers but nothing
> reads or writes it.

## Redis

Client: `backend/clients/redis_client.ts` (Bun's `RedisClient`). Runtime cache —
includes the live ECB USD→EUR rate (`conversion_rate`), used by AI cost conversion.
