# syntax=docker/dockerfile:1
# Build context MUST be the repo root (see docker-compose.yml): the backend
# imports from the `shared` workspace, so the whole monorepo is needed to build.
#
# Targets:
#   dev     — hot-reload server (bun --watch); source is bind-mounted by compose.
#   runtime — production: runs the bundled dist/server.js (this is the default).

# ---- Install workspace dependencies (layer cached on manifest changes) ----
FROM oven/bun:1.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN bun install

# ---- Migrate: one-shot — applies shared/drizzle migrations, then exits ----
# Backed by the compose `migrate` service the backend waits on
# (condition: service_completed_successfully). The migration files are baked in;
# in dev the override bind-mounts ./shared so new migrations apply without a
# rebuild. POSTGRES_URI comes from the compose env (shared/.env is .dockerignored).
FROM deps AS migrate
WORKDIR /app/shared
COPY shared ./
CMD ["bun", "run", "db:migrate"]

# ---- Qdrant init: one-shot — ensures Qdrant collections exist, then exits ----
# Backed by the compose `qdrant-init` service the backend waits on. Idempotent
# (create-on-404). Source is baked in; the dev override bind-mounts ./backend so
# changes apply without a rebuild. QDRANT_HOST/PORT come from the compose env.
FROM deps AS qdrant-init
WORKDIR /app/backend
COPY backend ./
CMD ["bun", "run", "scripts/qdrant-ensure.ts"]

# ---- Dev: hot-reload (source bind-mounted by docker-compose.override.yml) ----
FROM deps AS dev
# fluent-ffmpeg shells out to the `ffmpeg` binary at runtime (transcription/audio)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=development MODE=dev APP_PORT=5100
EXPOSE 5100
CMD ["bun", "--watch", "run", "server.ts"]

# ---- Build the backend bundle (dist/server.js) ----
FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./tsconfig.json
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN bun run build

# ---- Runtime (production) ----
FROM oven/bun:1.2-slim AS runtime
# fluent-ffmpeg shells out to the `ffmpeg` binary at runtime (transcription/audio)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production MODE=production APP_PORT=5100
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./package.json
EXPOSE 5100
CMD ["bun", "run", "dist/server.js"]
