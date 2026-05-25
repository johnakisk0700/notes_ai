# syntax=docker/dockerfile:1
# Build context MUST be the repo root (see docker-compose.yml): the backend
# imports from the `shared` workspace, so the whole monorepo is needed to build.

# ---- Install workspace dependencies (layer cached on manifest changes) ----
FROM oven/bun:1.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY backend/package.json ./backend/package.json
COPY gui_v2/package.json ./gui_v2/package.json
COPY shared/package.json ./shared/package.json
RUN bun install

# ---- Build the backend bundle (dist/server.js) ----
FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./tsconfig.json
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN bun run build

# ---- Runtime ----
FROM oven/bun:1.2-slim AS runtime
# fluent-ffmpeg shells out to the `ffmpeg` binary at runtime (transcription/audio)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production
ENV MODE=dev
ENV APP_PORT=5100
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./package.json
EXPOSE 5100
CMD ["bun", "run", "dist/server.js"]
