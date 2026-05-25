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
