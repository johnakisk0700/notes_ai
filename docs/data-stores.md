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
| `wines`      | Editor autocomplete list (unique `name`). Seeded by `scripts/seed-wines-customers.ts`. | uuid |
| `customers`  | Editor autocomplete list (`name`, optional `title`). Seeded by the same script. | uuid |
| `ecb_conversion_rates` | USD→EUR rate cache from the ECB API; refreshed by the `server.ts` cron, mirrored into Redis. | (from,to) |
| `messages` / `threads` | Drizzle schema exists but is **unused** — chat history lives in Mongo (see below). | — |

> The Postgres source of truth is `shared/db/schema/` only. The pre-Drizzle
> `backend/model/postgresql/*.sql` files + custom migration runner have been removed.

## Qdrant (vectors)

Client: `backend/clients/qdrant_client.ts`. Collections created by
`backend/scripts/qdrant-init.ts` (1536-dim, cosine):

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
