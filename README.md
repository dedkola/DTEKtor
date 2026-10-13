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
