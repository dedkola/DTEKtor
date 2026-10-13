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
synthetic schedules. It does not contact DTEK. The manual production workflow
checks systemd status, running build SHA, readiness and collection freshness.
These workflows do not deploy the application.

Production verification requires an unprivileged self-hosted runner on the
deployment server with labels `self-hosted`, `linux`, `x64`, and
`dtektor-verification` (runner 2.327.1+). Keep its workspace separate from the
application checkout. Stamp the deployed build with
`DTEKTOR_BUILD_SHA="$(git rev-parse HEAD)" npm run build`; Docker builds accept
the same SHA through `--build-arg DTEKTOR_BUILD_SHA=...`.

Run [Verify production](https://github.com/dedkola/DTEKtor/actions/workflows/verify-production.yml)
on `main` with the full deployed SHA. The default expects the selected `main`
revision. Optional repository variables `DTEKTOR_VERIFY_URL` and
`DTEKTOR_PUBLIC_URL` override the local URL and enable an additional public
HTTPS check. `/api/health` reports readiness and collection separately.

## Documentation

- [Collector](collector/README.md)

## License

No license has been chosen. All rights reserved.
