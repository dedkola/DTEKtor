# DTEK collector

The packaged worker runs independently of Next.js, reads the same
`config/addresses.json` as the dashboard, checks each address sequentially and
submits successful schedules to `/api/ingest`. Docker Compose includes Chromium,
scheduling and shared persistent screenshot storage. See the root README for
setup, configuration, backup and migration instructions.

## Run without Docker

From the repository root, `npm run dev` starts the dashboard and this collector
together, installs missing collector dependencies/Chromium, loads the same
Next.js development environment files for both processes and stops both on Ctrl+C.

For a standalone worker after setup, use Node.js 20 or newer:

```sh
node --env-file=.env.local collector/worker.mjs
# Or one complete cycle:
node --env-file=.env.local collector/worker.mjs --once
```

The worker defaults to `http://127.0.0.1:3000`, `./data/shots`, a 45-second check
deadline and a five-minute pause after each completed cycle. It retries failed
checks/delivery up to three times and publishes cycle status for the UI.

## Low-level scraper

`check.mjs` performs a single browser check and prints only schedule JSON to
stdout; diagnostics go to stderr. The worker supplies `STREET`, `HOUSE`, `SHOT`
and `DEADLINE_MS`. To call the scraper directly:

```sh
STREET='Березняківська' HOUSE='12' SHOT=/tmp/dtek-graph.png node collector/check.mjs
```

The scraper dismisses DTEK modals during interactions and before capturing the
graph. It checks for another popup after capture and retries when necessary.
Successful screenshots replace the old file atomically. Failed capture leaves
the previous PNG intact. Incomplete or unrecognized schedule tables are rejected.

## Existing server

The systemd deployment at `192.168.0.120` remains independent of this repository
update. Its old wrapper lives at `/home/ded/projects/shutdown/run-check.sh`.
Follow the root README migration steps before switching that server to Compose;
keep only one collector active during migration.
