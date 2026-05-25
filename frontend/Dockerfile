# syntax=docker/dockerfile:1
# Build context MUST be the repo root (see docker-compose.yml): the frontend
# imports from the `shared` workspace via the `@shared` alias.
#
# Targets:
#   dev     — Vite dev server (HMR); source is bind-mounted by compose.
#   runtime — production: static build served by nginx (this is the default).

# ---- Install workspace dependencies ----
FROM oven/bun:1.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN bun install

# ---- Dev: Vite dev server (source bind-mounted by docker-compose.override.yml) ----
FROM deps AS dev
WORKDIR /app/frontend
EXPOSE 5173
CMD ["bun", "run", "dev", "--host", "0.0.0.0", "--port", "5173"]

# ---- Build the static SPA ----
FROM deps AS build
WORKDIR /app
# Root tsconfig is needed because frontend/tsconfig.json extends "../tsconfig.json"
COPY tsconfig.json ./tsconfig.json
COPY shared ./shared
COPY frontend ./frontend
# Vite inlines VITE_* vars at build time. A production build reads *_PROD_URL,
# so point it at the local backend by default (override via build args for prod).
ARG VITE_API_PROD_URL=http://localhost:5100/api/
ARG VITE_CLERK_PUBLISHABLE_KEY=
ENV VITE_API_PROD_URL=$VITE_API_PROD_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
WORKDIR /app/frontend
RUN bun run build

# ---- Serve the built assets via nginx ----
FROM nginx:alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
