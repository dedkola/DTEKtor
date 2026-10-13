# DTEKtor

[![CI](https://github.com/dedkola/DTEKtor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dedkola/DTEKtor/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

DTEK outage dashboard with an independent Playwright collector. Shows saved
schedules and graph screenshots for configured addresses, with warnings when
collection fails or data becomes stale. The interface is Russian-only; dates
use `Europe/Kyiv`.

Open browser windows update automatically through `/api/events` (Server-Sent
Events). The server checks saved schedules, collector health and screenshot files
every five seconds per connected window, sending a revision only when data changes.
Updates preserve scroll position and address order. Connections retry automatically;
if streaming is unavailable, the page refreshes every 60 seconds and catches up
when a tab becomes visible or the browser comes back online. The collector still
runs on its configured interval. Reverse proxies must pass event streams without
buffering; the endpoint sends `X-Accel-Buffering: no` and heartbeat events.

## Local development

Requires Node.js 22+ and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm run dev` starts the dashboard
and collector together, installing collector dependencies and Chromium on first
run. Set `INGEST_SECRET` in `.env.local` and edit `config/addresses.json` as needed.
Use `npm run dev -- --port 3100` for another port, or `npm run dev:web` for the
dashboard alone. Ctrl+C stops both processes.

## Docker

Requires Docker Engine and Docker Compose.

```bash
cp .env.example .env
# Set a nonempty random INGEST_SECRET in .env before starting.
export DTEKTOR_BUILD_SHA="$(git rev-parse HEAD)"
docker compose up --build -d
```

Open [localhost:3000](http://localhost:3000). Compose runs the dashboard and
Chromium collector separately, with persistent database and screenshot volumes.
The collector waits five minutes after each completed cycle by default. Failed
checks preserve saved schedules.

```bash
docker compose ps
docker compose logs --tail=50 collector
docker compose down
```

`down` keeps saved data; `down -v` deletes it. Keep one collector replica.
Before migrating an existing systemd deployment, back up its database and
screenshots and stop the old web service and collector. Preserve the Compose
project name when reusing existing volumes.

Export `DTEKTOR_BUILD_SHA` from the checked-out source revision before every
Compose build or management session. Compose requires it instead of silently
producing an unidentified build.

## Configuration

| Setting | Default / purpose |
| --- | --- |
| `INGEST_SECRET` | Shared API secret; required for Docker |
| `APP_PORT` | `3000` |
| `COLLECT_INTERVAL_SECONDS` | `300`, after each collector cycle |
| `DEADLINE_MS` | `45000`, per browser check |
| `config/addresses.json` | Streets, buildings and unique screenshot slugs |

See [.env.example](.env.example) for database and storage overrides. Local data
lives in `data/`; Docker uses named volumes.

## Web Push notifications

Web Push uses the existing dashboard server, collector and libSQL/SQLite database.
Subscriptions and pending deliveries persist across restarts. No additional host,
database, cron job or notification service account is needed.

Generate a VAPID key pair **once on the dashboard host**:

```bash
# Next.js / the existing systemd deployment (.env.local):
npm run push:keys

# Docker Compose (.env), instead:
npm run push:keys -- --file .env
docker compose up -d
```

For systemd, restart the dashboard after generating credentials. The command saves
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` to the selected environment
file without printing secrets. It preserves other settings and refuses to replace
an existing key pair. Use an HTTPS site URL or a `mailto:` contact as the subject.
For remote hosting, provide these same three values as runtime environment variables;
the browser gets only the public key from `/api/push`. Keep the environment file out
of Git and backups of the private key secure. Keep the same keys between deployments.

Open the dashboard over HTTPS (localhost also works), click **Включить** under
**Уведомления**, and grant permission. **Проверить уведомление** queues a test for
that browser; tests are limited to one per minute. **Отключить** removes that browser's
subscription and pending deliveries. Permission is requested only after clicking.
On iPhone/iPad, open the site in Safari and use **Share → Add to Home Screen** first,
then enable notifications from the installed app. A manifest and app icons are included.
The service worker handles push and notification clicks without caching schedules.

All configured dashboard addresses are monitored. A successful collector submission
queues a notification when a schedule is first published or its outage windows/graph
cells change, including tomorrow's first publication with no planned outages.
An unpublished tomorrow graph is kept separate from a published all-clear. Missing
graphs and failed checks preserve the last published schedule; clock ticks, update
timestamps, screenshots captured again, midnight rollover of an unchanged schedule,
and repeated submissions do not generate alerts. Dates use `Europe/Kyiv`.

Schedules and notification jobs commit in one transaction. The server sends after
the ingest response, so push delivery does not delay the collector. Transient failures
retry on later submissions (including unchanged schedules), with backoff and up to
five attempts; jobs older than 24 hours are discarded. Expired subscriptions (404/410)
are removed automatically. Delivery claims prevent parallel workers from sending the
same queued job; like other network delivery systems, a process crash after a push
service accepts a message can cause a retry. A stable notification tag replaces the
previous notification for that address and alerts again for changes. New revisions
replace older unsent/retrying messages for the same address, keeping offline delivery
current. Browser/OS settings may delay or block display.
Current endpoint validation supports Chromium/Edge (FCM), Firefox and Safari push
services. Outbound HTTPS to those services must be available from the dashboard host.

## Checks

```bash
npm test
node --test .github/scripts/*.test.mjs
npm run lint
npm run build
```

GitHub CI runs tests, lint, both Docker builds and a container smoke test using
synthetic schedules. On pushes to `main`, successful CI is followed by
**Verify production deployment**, recorded in GitHub's `production` environment
with a link to the live app. Pull requests do not run production checks.

The production job uses a GitHub-hosted runner and public HTTPS. It waits up to
ten minutes for the exact commit SHA to appear at `/api/health`, then checks the
dashboard, database/configuration readiness, the release's complete address list,
fresh successful collection for every configured address, and every graph screenshot. Unavailable screenshots, stale
collection, an older build or a failed deployment produce a failed job. No
self-hosted runner, SSH access or deployment secrets are required for verification.

The server's existing systemd timer still deploys `main` independently; these
workflows verify the result and do not install releases or gate that timer.
Ensure its build command stamps the source revision:
`DTEKTOR_BUILD_SHA="$REMOTE" npm run build`. After restart, run the verifier with
`EXPECTED_SHA="$REMOTE" DTEKTOR_URL=http://127.0.0.1:3000` before marking a release
successful. Docker builds accept the SHA via `--build-arg DTEKTOR_BUILD_SHA=...`.

The maintained systemd deployment script is `scripts/deploy-systemd.sh`. Install
it as `/home/ded/deploy.sh` for the existing user timer. It serializes builds,
repairs unstamped builds even when the recorded Git revision is unchanged, stamps
the source SHA at build time, and verifies the local service, public HTTPS,
collection and screenshots before atomically recording deployment success.
The default paths match the current server; `DTEKTOR_REPO`, `DTEKTOR_DEPLOY_STATE`,
`DTEKTOR_DEPLOY_LOG`, `DTEKTOR_DEPLOY_KEY` and `DTEKTOR_PUBLIC_URL` override them.
Install `scripts/systemd/dtektor.service.d/stop-timeout.conf` under
`/etc/systemd/system/dtektor.service.d/` and run `sudo systemctl daemon-reload`
to bound shutdown at 15 seconds when live event streams keep requests open.

Main-branch CI runs use separate concurrency groups for each commit, so rerunning
an older release cannot cancel verification for a newer one. A release preflight
skips production verification when that commit has already been superseded on
`main`.

The default public URL is `https://detektor.tkweb.dev`. Repository variable
`DTEKTOR_PUBLIC_URL` can override it. The manual
[Verify production](https://github.com/dedkola/DTEKtor/actions/workflows/verify-production.yml)
workflow uses the same hosted checks on `main`, with an optional full expected
commit SHA. It does not create a deployment record for a manually selected older
revision. `/api/health` reports the running build and collection freshness without
modifying schedules. These checks confirm current freshness, not a new scrape
since the release was deployed.

## Documentation

- [Collector](collector/README.md)

## License

No license has been chosen. All rights reserved.
