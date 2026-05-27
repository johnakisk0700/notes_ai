# Deployment (production)

How `mneme.narusec.io` is deployed and what must be true on the VM. The deploy
mechanism is `deploy.ts` (run from your machine); this doc is the runbook around it.

## Topology

```
Internet ──https://mneme.narusec.io──▶ native nginx (host, :443, Let's Encrypt TLS)
                                          ├── /        → static SPA  (/home/notes-assistant/gui)
                                          └── /api/    → proxy_pass http://127.0.0.1:5100
                                                                  │ (plain HTTP)
Docker compose (on the VM, prod):                                 ▼
   backend (bun, dist/server.js, HTTP)  ── 127.0.0.1:5100 ────────┘
   postgres · mongo · qdrant · redis
   migrate (one-shot) ─▶ backend waits on it ◀─ qdrant-init (one-shot)
```

- **Frontend + nginx are native** on the VM. nginx holds the TLS cert, serves the
  built SPA from disk, and reverse-proxies `/api/` to the backend — so prod is
  same-origin (no CORS / mixed-content) and there's no extra container hop.
- **Backend + data stores are Docker** (`docker-compose.yml` + `docker-compose.prod.yml`).
  The backend serves plain HTTP (`MODE=production`, `BACKEND_TLS=off`).
- The `frontend` compose service is parked behind the `frontend-container` profile,
  so the prod stack does **not** start it.

## One-time VM prerequisites

1. **Docker + Docker Compose v2** (`docker compose version`).
2. **Native nginx** installed and running.
3. **DNS**: an `A` record for `mneme.narusec.io` → the VM IP.
4. **TLS cert** via certbot:
   `sudo certbot certonly --nginx -d mneme.narusec.io`
   → `/etc/letsencrypt/live/mneme.narusec.io/{fullchain,privkey}.pem`.
5. **nginx site**: `deploy/nginx/mneme.narusec.io.conf` lands on the VM via rsync at
   `/home/notes-assistant/deploy/nginx/`. Install + enable it:
   ```bash
   sudo cp /home/notes-assistant/deploy/nginx/mneme.narusec.io.conf /etc/nginx/sites-available/
   sudo ln -sf /etc/nginx/sites-available/mneme.narusec.io.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. **Project dir**: `/home/notes-assistant` (created on the first rsync).
7. **`backend/.env` on the VM** with the production secrets (never rsynced — see
   `.rsyncignore`). At minimum: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (Clerk
   **production** instance), `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`), optional
   `JINA_API_KEY`, plus any voice keys. DB URIs are set by compose — leave them out.
8. **Clerk production instance**: set its allowed origin / domain to
   `https://mneme.narusec.io` and use that instance's keys (publishable for the SPA
   build, secret for `backend/.env`). Dev and prod Clerk instances have different keys.
9. **Firewall**: open 80 + 443. The Docker ports (5100, 5433, …) stay bound to
   `127.0.0.1` — do not expose them publicly.

## ⚠️ Existing production data — decide before first cutover

The compose stack runs Postgres / Mongo / Qdrant / Redis. In **production** their data
lives in bind-mounts under `/home/notes-assistant/` (`data/postgres_data`,
`data/mongo_data`, `qdrant_data`) — host-visible files, so the folder-snapshot backups
below work and a Linux host pays no bind-mount penalty. (**Dev** instead uses named
Docker volumes: `docker-compose.override.yml` overrides these base bind mounts only in
dev, because DB fsync over a Windows/macOS bind mount is slow. Prod runs base +
`docker-compose.prod.yml`, which never loads that override, so it keeps the bind mounts.)
**If the VM already holds production data** in a pre-existing (native or separately-run)
Postgres / Mongo / Qdrant, you must either:

- dump it and restore into these compose volumes **before** the first deploy, or
- point the backend at the existing databases (set the DB URIs in `backend/.env` and
  drop those services from the compose) instead of running them in compose.

Skipping this means the app starts against **empty** databases.

## Deploy

From your machine — needs `rsync` + `ssh` on PATH (on Windows: Git for Windows or WSL):

```bash
# Clerk production publishable key for the SPA build (public by design):
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx bun deploy.ts eu
```

`bun deploy.ts eu` builds the SPA (with `VITE_API_PROD_URL=https://mneme.narusec.io/api/`),
rsyncs the repo to the VM, rsyncs the build to the nginx root, then runs
`docker compose … up -d --build` — which runs the one-shot `migrate` before the backend
starts. Static files are served immediately; no nginx reload is needed unless the server
block changed.

- **Backend-only** (skip the SPA rebuild): `bun deploy.ts backend`.
- Build defaults live at the top of `deploy.ts`; override via env
  (`VITE_API_PROD_URL`, `VITE_CLERK_PUBLISHABLE_KEY`).

## Verify

```bash
curl -I https://mneme.narusec.io               # 200 — the SPA is served
curl https://mneme.narusec.io/api/get-notes    # 401 (auth required) — backend reachable
ssh root@168.231.104.96 'cd /home/notes-assistant && \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps'
```

Then in the browser: sign in (Clerk), create a note, open a chat thread and confirm the
answer **streams** token-by-token (proves nginx isn't buffering `/api/`).

## Rollback / ops

- Logs: `ssh … 'cd /home/notes-assistant && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend'`
- Re-run `bun deploy.ts eu` (idempotent) to roll forward; the previous image lingers until pruned.
- DB backups: snapshot `/home/notes-assistant/data/` + `/home/notes-assistant/qdrant_data/`.
