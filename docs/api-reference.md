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
| POST   | `/api/delete-note`       | `deleteNote`         | `{ noteId }`; deletes note+reminder (tx) and Qdrant point. Owner only. |
| POST   | `/api/get-note-title`    | `getNoteTitle`       | `{ content }` → GPT-generated title. |
| POST   | `/api/search-notes`      | `searchRelevantNotes`| `{ messages, threadId?, selectedUsers?, now? }` (AI SDK UI message stream) → **streamed** agentic answer (text + `tool-*` parts). Model: Qwen3.6-Plus via OpenRouter, else gpt-5-mini. |
| GET 📄 | `/api/get-all-users-notes` | `getAllUsersNotes` | All users' notes (admin). |
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
| POST   | `/api/update-user`         | `updateUser`        | Associates Qdrant customer points with a user. |
| POST   | `/api/delete-user`         | `deleteUser`        | `{ userId }` (**admin**). Purges the user's reminders/notes/profile (tx) + Qdrant note vectors, then deletes the Clerk identity. |
| POST   | `/api/create-profile`      | `createProfile`     | `{ id, first_name, last_name, email }`. **No auth** — called right after signup. |

> When adding admin-only endpoints, check `req.user.isAdmin` (set by `verifyJWT`).

## Editor autocomplete (wines / customers)

Backed by the Postgres `wines` / `customers` tables (seeded by
`scripts/seed-wines-customers.ts`); the frontend caches the results in localStorage.

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
