# syntax=docker/dockerfile:1
# Build context MUST be the repo root (see docker-compose.yml): the frontend
# imports from the `shared` workspace via the `@shared` alias.

# ---- Build the static SPA ----
FROM oven/bun:1.2-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY backend/package.json ./backend/package.json
COPY gui_v2/package.json ./gui_v2/package.json
COPY shared/package.json ./shared/package.json
RUN bun install
# Root tsconfig is needed because gui_v2/tsconfig.json extends "../tsconfig.json"
COPY tsconfig.json ./tsconfig.json
COPY shared ./shared
COPY gui_v2 ./gui_v2
# Vite inlines VITE_* vars at build time. A production build reads *_PROD_URL,
# so point it at the local backend by default (override via build args for prod).
ARG VITE_API_PROD_URL=http://localhost:5100/api/
ARG VITE_CLERK_PUBLISHABLE_KEY=
ENV VITE_API_PROD_URL=$VITE_API_PROD_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
WORKDIR /app/gui_v2
RUN bun run build

# ---- Serve the built assets via nginx ----
FROM nginx:alpine AS runtime
COPY gui_v2/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/gui_v2/dist /usr/share/nginx/html
EXPOSE 80
