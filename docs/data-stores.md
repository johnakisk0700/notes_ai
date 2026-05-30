# Data stores

Four stores, each with a clear role. **Postgres via Drizzle is the source of truth**
for relational app data; Qdrant holds vectors; Mongo holds chat history; Redis caches.

> **Storage backing.** In dev these run in named Docker volumes
> (`notes_ai_{postgres,mongo,qdrant}_data`, declared in `docker-compose.override.yml`) —
> the repo sits on a Windows/macOS drive bind-mounted into the Linux VM, and DB fsync
> over that 9p/virtiofs boundary is slow. In prod they use `./data` bind mounts on the
> Linux VM (the base-compose default — no boundary there, and host-visible for the
> snapshot backups in `docs/deployment.md`).

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
| `profile`    | User profile + `role` (user/admin) + `settings` (jsonb, reserved for future per-user prefs — theme, model). **PK = Clerk user ID** (`text`). | id |
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

Client: `backend/clients/qdrant_client.ts`. Collections (cosine; `notes` is 3072-dim, the legacy domain collections 1536-dim) are
**auto-ensured on startup**: `docker compose up` runs a one-shot `qdrant-init`
service (`backend/scripts/qdrant-ensure.ts`, which waits for Qdrant then calls
`init_collections()`) that the backend waits on (`service_completed_successfully`),
so `store-note` doesn't 500 on a fresh Qdrant volume. It's idempotent (create-on-404).

> `backend/scripts/qdrant-init.ts`'s own `main()` is a **destructive reset** — it
> drops `polites` and re-creates it empty (the reseed `migrate*` calls are currently
> commented out) — so it's guarded by `import.meta.main` and only runs when executed
> directly (`bun scripts/qdrant-init.ts`), never on startup.

- `notes` — note embeddings (3072-dim, `gemini-embedding-001`); payload has `title`,
  `content`, `user_id`, `created_at`, `updated_at`. The embedded text is the note's
  title + content only — metadata stays in the payload, never in the vector. The
  **only collection queried at runtime** (per-user, in chat).
- `beverages`, `polites`, `customers`, `sales` — domain collections (1536-dim ada-002; wine/customer
  RAG). Provisioned by `qdrant-init.ts` but currently **dormant**: the seeding `migrate*`
  calls in that script are commented out and the old wine/customer RAG query was removed,
  so wine/customer autocomplete is served from Postgres (`wines`/`customers`) instead.

Embedding model (notes): `google/gemini-embedding-001` — 3072-dim, served via OpenRouter
(`backend/clients/embedding_client.ts`), shared by the index (write) and query paths so they
never drift. The dormant domain collections still hold legacy ada-002 (1536-dim) vectors.

**Postgres ↔ Qdrant consistency:** there's no cross-store transaction, so we keep the two in
lockstep at write time and make reads authoritative. `store-note`/`update-note` embed **inside
the save transaction** (sync-or-fail): if the embed/upsert throws, the whole save rolls back —
no half-saved note, no duplicate on retry — and the client keeps its localStorage draft to
retry, so nothing is lost and the stores never drift. `delete-note` removes the point
best-effort after commit (a leftover vector is harmless). At read time `search_notes` ranks
candidate ids in Qdrant but fetches the live rows from Postgres (dropping ids missing there),
so even a rare orphaned vector can't surface a deleted note or stale text. `scripts/reembed-notes.ts`
drops + rebuilds the `notes` collection from Postgres if a full re-sync is ever needed.

## MongoDB

Models: `backend/model/mongo-db/`. Client: `backend/clients/mongoose_client.ts`,
connected in the background at worker startup with retry/backoff (best-effort — the
API serves whether or not Mongo is up; once connected, the driver auto-reconnects on
drops). Buffering is off (`bufferCommands: false`), so while Mongo is unreachable
writes no-op and reads return empty **instantly** instead of stalling ~10s then
erroring. Holds AI chat history: `UserThread` (one per conversation, embeds a
`Message[]`), written by
the chat flow (`services/chat-threads.ts`) and read by `get-threads` / `get-thread`.
Threads are indexed by `user_id` plus descending `inserted_at` for the sidebar list;
single-thread loads use Mongo's `_id` index and enforce `user_id` ownership in the filter.
Each `Message` stores `{ role, content?, parts?, metadata?, timestamp }`: `content` is the
plain-text projection (user text / Lexi's answer); `parts` holds the full AI SDK UIMessage parts
(text + tool-call parts, Mixed) for assistant turns, so reloaded threads re-render the tool
cards; `metadata` (Mixed) carries the answer's `{ model, costEur, totalTokens }` for the per-answer
badge. User turns store `content` only; the client falls back to it when `parts` is absent.

> Mongo holds **only** chat threads now — the unused `User` and `ECBConversionRate`
> models were removed. USD→EUR rates live in the Postgres `ecb_conversion_rates`
> table + Redis, not Mongo.

## Redis

Client: `backend/clients/redis_client.ts` (Bun's `RedisClient`). Runtime cache —
includes the live ECB USD→EUR rate (`conversion_rate`), used by AI cost conversion.
