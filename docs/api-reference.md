# API reference

All routes are registered flat in `backend/server.ts` under `/api/` and handled in
`backend/apis/`. Every route except `create-profile` runs `verifyJWT`, so it needs a
valid Clerk `Authorization: Bearer <token>`. `req.user.id` is the Clerk user ID.

List endpoints (marked 📄) also run `queryMiddleware` → accept `page`, `limit`,
`orderBy`, `orderDirection`, `fetchAll`, and return a `{ data, pagination }` envelope.

## Notes

| Method | Path                     | Handler              | Notes |
| ------ | ------------------------ | -------------------- | ----- |
| GET 📄 | `/api/get-notes`         | `getNotes`           | Current user's notes. |
| GET    | `/api/get-note`          | `getNote`            | `?noteId=` — owner only. |
| GET    | `/api/get-note-admin`    | `getNoteAdmin`       | Any note (admin). |
| POST   | `/api/store-note`        | `storeNote`          | `{ noteText, title?, remindAt? }`; writes note + reminder + embedding in a tx. |
| POST   | `/api/update-note`       | `updateNote`         | `{ noteId, content, title, remindAt? }`; upserts/clears reminder, re-embeds. |
| POST   | `/api/delete-note`       | `deleteNote`         | `{ noteId }`; deletes note+reminder (tx) and Qdrant point. Owner, or any note for admins. |
| POST   | `/api/get-note-title`    | `getNoteTitle`       | `{ content }` → GPT-generated title. |
| POST   | `/api/search-notes`      | `searchRelevantNotes`| `{ messages, threadId?, generationId?, truncateToCount?, selectedUsers?, model?, effort?, now? }` (AI SDK UI message stream) → **streamed** agentic answer (text + `tool-*` parts). `threadId` is **client-minted** (24-hex) for a new chat so the answer is pollable before the first byte; `generationId` (24-hex) is the per-turn id correlating the live stream to the persisted placeholder; `truncateToCount` (edit/retry only) durably drops the discarded message tail before appending the turn. All validated server-side (a fallback id is minted if missing/invalid). Model selectable (default Qwen3.6-Plus via OpenRouter, else gpt-5-mini). |
| POST   | `/api/chat-image`        | `uploadChatImage`    | `{ image: { content: <base64> }, mediaType }` → `{ id, mediaType, url }`. Stores a chat-image attachment on disk (raster only, magic-byte validated, ≤8MB). |
| GET    | `/api/chat-image/:id`    | `getChatImage`       | Streams the owner's stored image (inline, `nosniff`); 404 if missing/not owned. Backs the composer preview + message thumbnails (fetched with the bearer via `useAuthedImageUrl`). |
| GET    | `/api/get-all-users-notes` | `getAllUsersNotes` | All users' notes (admin). Returns a bare `{ notes }` (no pagination envelope). |
| GET 📄 | `/api/get-reminders`     | `getReminders`       | Current user's reminders. |

## Transcription / voice

| Method | Path                              | Handler                  | Notes |
| ------ | --------------------------------- | ------------------------ | ----- |
| POST   | `/api/get-transcription`          | `getTranscription`       | Audio → text. |
| GET    | `/api/get-openai-ephemeral-token` | `getOpenAIEphemeralToken`| Mints OpenAI Realtime ephemeral key for the browser. |
| POST   | `/api/text-to-voice`              | `textToVoice`            | Text → speech (Google). |

## Profiles / users

| Method | Path                       | Handler             | Notes |
| ------ | -------------------------- | ------------------- | ----- |
| GET 📄 | `/api/get-profiles`        | `getProfiles`       | Profiles + tefteri cost, ordered by spend (admin). |
| GET    | `/api/get-profile`         | `getProfile`        | `?userId=`. |
| POST   | `/api/update-profile-role` | `updateProfileRole` | `{ profileId, role }` (admin). |
| POST   | `/api/update-profile-name` | `updateProfileName` | `{ first_name, last_name }` for the signed-in user (keyed by `req.user.id`). Backs the onboarding step. |
| POST   | `/api/delete-user`         | `deleteUser`        | `{ userId }` (**admin**). Purges the user's reminders/notes/profile (tx), deletes the Clerk identity, then best-effort removes their Qdrant note vectors. |
| POST   | `/api/create-profile`      | `createProfile`     | `{ id, first_name, last_name, email }`. **No auth** — called right after signup. |

> When adding admin-only endpoints, check `req.user.isAdmin` (set by `verifyJWT`).

## Editor autocomplete (wines / customers)

Backed by the Postgres `wines` / `customers` tables (seeded by
`scripts/seed-wines-customers.ts`); the frontend caches the results in localStorage and
merges them (with the user list) into the editor's `@`-mention menu.

| Method | Path                 | Handler       | Notes |
| ------ | -------------------- | ------------- | ----- |
| GET    | `/api/get-wines`     | `getWines`    | `{ names: string[] }`. |
| GET    | `/api/get-customers` | `getCustomers`| `{ names: string[] }`. |

## Chat threads

AI chat history, persisted in Mongo (`UserThread`). Written as a side effect of
`/api/search-notes`; these read/manage them.

| Method | Path                  | Handler        | Notes |
| ------ | --------------------- | -------------- | ----- |
| GET 📄 | `/api/get-threads`    | `getThreads`   | Current user's threads (`{ id, title, inserted_at }`), newest first — sidebar list. |
| GET    | `/api/get-thread`     | `getThread`    | `?threadId=` — one thread with its `messages` (owner only). |
| POST   | `/api/delete-thread`  | `deleteThread` | `{ threadId }` — owner only. |
| POST   | `/api/update-tool-transaction` | `updateToolTransaction` | `{ threadId, messageId, toolCallId, status, output? }` — owner-scoped persistence for note-action tool card outcomes (`applied`, `discarded`, `retry_saved`). Stores a message-level transaction log and overlays it on the assistant tool part so refresh shows the same card state and later model turns get a deterministic text summary instead of raw tool JSON. |
