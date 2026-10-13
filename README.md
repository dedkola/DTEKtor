# DTEKtor

DTEK outage dashboard with a bundled Playwright collector. The web app displays
saved schedules and graph screenshots for the addresses in `config/addresses.json`.
The collector checks DTEK independently of visitors. The interface is Russian-only.

## Portable Docker deployment

Requirements: Docker Engine and Docker Compose.

1. Copy `.env.example` to `.env` and set `INGEST_SECRET` to a nonempty random secret.
2. Edit `config/addresses.json` if needed. Each entry needs `street`, `building`
   (strings) and a unique `slug` containing only lowercase letters, digits, `_` or `-`.
3. Run:

```bash
docker compose up --build -d
```

Open `http://localhost:3000` (or configure `APP_PORT`).

Compose starts two services:

- `dtektor`: Next.js dashboard and ingest API, with a persistent local libSQL database.
- `collector`: Playwright + Chromium worker. Waits for the web app to be healthy,
  checks each configured address sequentially, and POSTs schedules to the app.

The worker runs immediately, then waits `COLLECT_INTERVAL_SECONDS` (default 300)
**after each completed cycle**. It retries each address up to three times with
backoff. It never starts a second cycle while the current one is running. Keep
one collector replica. `DEADLINE_MS` defaults to 45000 per browser check; the
parent worker also kills a check that exceeds its deadline plus five seconds.

Collection failures and failed HTTP delivery do not replace saved schedules.
The dashboard shows a warning after failed cycles or when saved data is older
than 15 minutes. The API also records explicitly failed checks without modifying
schedules. Successful payloads must include today's and tomorrow's window arrays.
Screenshot capture is best effort; a failed capture preserves the previous image.

Persistent storage uses Docker-managed volumes (avoiding SQLite file identity
issues on Docker Desktop host bind mounts):

- `database` volume, `/app/data/dtektor.db`: schedules, raw checks and change history.
- `screenshots` volume, `/app/shots/<slug>.png`: latest graph screenshots.
- `screenshots` volume, `/app/shots/status.json`: last completed collector cycle status.

The web app mounts screenshots read-only; the collector writes them atomically.
Both services read the same address configuration. After editing it, restart both
services with `docker compose restart`.

```bash
docker compose logs --tail=50 collector
docker compose ps
docker compose down
```

Stopping/removing containers retains the volumes. Do not use `down -v` unless
intentionally deleting saved data. To back up or move the app, stop both services
and export their storage:

```bash
mkdir -p backup
docker compose stop
docker compose cp dtektor:/app/data ./backup/data
docker compose cp collector:/app/shots ./backup/shots
```

Copy the project, `.env`, configuration and `backup/` to the new host, then restore
into newly created containers before starting them:

```bash
docker compose build
docker compose create
docker compose cp ./backup/data/. dtektor:/app/data
docker compose cp ./backup/shots/. collector:/app/shots
docker compose up -d
```

Protect `.env` as a secret. Browser access to DTEK can vary by the destination
server's IP/network. Preserve the same Compose project name when reusing volumes
on the same host (`docker compose -p dtektor ...` can make this explicit).

## Migrating the existing systemd deployment

The current server stores the web app under `/home/ded/repos/DTEKtor` and the
collector under `/home/ded/projects/shutdown`. These paths are no longer required
by the packaged app.

Before switching that server:

1. Back up its app database, screenshots, configuration and existing service units.
2. Install Docker/Compose and prepare the new project and `.env`.
3. Disable/stop the old `dtektor-check.timer` and `dtektor-check.service`, then
   stop `dtektor.service` to release port 3000 and the database.
4. Build/create Compose containers without starting them. Use `docker compose cp`
   to copy the old database to `dtektor:/app/data/dtektor.db` and the old screenshot
   directory contents to `collector:/app/shots` (see the restore commands above).
5. Start Compose and verify logs, both addresses, screenshots and successful
   collection before disabling the old web service permanently.

For rollback, stop Compose and restore/start the previous systemd services and
saved files. Never run both collectors or both web deployments against the same
local database during the switch. This repository update does not change the
running server automatically.

## Local development without Docker

```bash
npm ci
cp .env.example .env.local
npm run dev
```

In another terminal, from the repository root:

```bash
npm ci --prefix collector
cd collector && npx playwright install chromium && cd ..
# Export the same INGEST_SECRET used in .env.local before starting the worker.
node collector/worker.mjs
# Or a single complete cycle:
node collector/worker.mjs --once
```

Node scripts do not load Next.js `.env.local` automatically. Export the settings
for the worker in your shell. Default database: `file:./data/dtektor.db`; default
screenshots: `./data/shots`. `ADDRESSES_FILE`, `SHOTS_DIR` and `DTEKTOR_URL` are
optional overrides. Run the worker from the repository root.

## Architecture and API

```text
DTEK website → Playwright collector → POST /api/ingest → libSQL database
                        ↓                                  ↓
                  shared screenshots ←──────────── Next.js dashboard
```

`GET /api/state` returns saved state for a cookie-linked address or the primary
address. `GET /api/screenshot/<slug>` serves the latest graph PNG. Refresh and
60-second browser auto-refresh reread saved data; they do not start scraping.

`POST /api/ingest` accepts `x-ingest-secret` and a JSON body:

```json
{
  "address": { "street": "Березняківська", "building": "12" },
  "checkedAt": "2026-10-13T12:00:00Z",
  "ok": true,
  "today": { "offWindows": ["16:00-19:30"] },
  "tomorrow": { "offWindows": [] }
}
```

Successful ingest stores a raw check, daily windows, half-hour slots and schedule
changes. Failed checks (`ok: false`) store audit records only. Dates use
`Europe/Kyiv`. Schema creation is automatic. `/api/settings` remains a legacy
address/cookie endpoint.

The web app also supports hosted Turso via `DATABASE_URL` and
`DATABASE_AUTH_TOKEN`. Serverless deployment requires separately hosted persistent
collection and shared screenshot storage; the complete Compose stack is intended
for a Docker host.

## Validation

```bash
npm test
npm run lint
npm run build
```

Tests cover authenticated delivery, retry/continuation behavior, rejecting
incomplete scrapes and preserving valid schedules after failed checks.

## License

No license has been chosen; all rights reserved until one is added.
