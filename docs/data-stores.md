# Data stores

Four stores, each with a clear role. **Postgres via Drizzle is the source of truth**
for relational app data; Qdrant holds vectors; Mongo holds chat history; Redis caches.

## Postgres (Drizzle)

Schema: `shared/db/schema/`. Client: `backend/clients/drizzle_postgres_client.ts`
(`drizzlePg`). Migrations: `shared/drizzle/` (generate/apply with `drizzle-kit`).

| Table        | Purpose                                                      | PK |
| ------------ | ------------------------------------------------------------ | -- |
| `profile`    | User profile + `role` (user/admin) + settings. **PK = Clerk user ID** (`text`). | id |
| `notes`      | User notes (title, content). `user_id` = Clerk ID.           | uuid |
| `reminders`  | One reminder per note (`note_id` unique).                    | uuid |
| `tefteri`    | Per-user cost ledger (totalCost) joined to profile.          | — |
| `kataskopos` | Per-request AI cost tracking (model, in/out cost).           | uuid |
| `messages` / `threads` | Drizzle schema exists; chat history currently lives in Mongo (see below). | — |

> Legacy: `backend/model/postgresql/*.sql` + `*.d.ts` are pre-Drizzle and unused.
> Don't edit them; change `shared/db/schema/` instead.

## Qdrant (vectors)

Client: `backend/clients/qdrant_client.ts`. Collections created by
`backend/model/qdrant_migrations.ts` (1536-dim, cosine):

- `notes` — note embeddings; payload has `user_id`, `content`, `created_at`,
  `concatenated` (the text that was embedded). Searched per-user in chat.
- `beverages`, `polites`, `customers`, `sales` — domain data (wines/customers)
  seeded from JSON files for autocomplete/RAG context.

Embedding model: OpenAI `text-embedding-ada-002`.

## MongoDB

Models: `backend/model/mongo-db/`. Client: `backend/clients/mongoose_client.ts`.
Holds AI chat `Message` / `UserThreads` and `ECBConversionRate` (USD→EUR rate cache,
refreshed by the cron job in `server.ts`).

## Redis

Client: `backend/clients/redis_client.ts` (Bun's `RedisClient`). Runtime cache.
