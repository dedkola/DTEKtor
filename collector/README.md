# DTEK collector

This directory tracks the Playwright collector previously maintained only at
`/home/ded/projects/shutdown/check.mjs` on the collector server. It runs separately
from the Next.js app. The server's existing `run-check.sh` selects each address,
sets `SHOT`, and submits the JSON output to `/api/ingest`.

The collector closes DTEK's modal close controls on load, during Playwright
interactions, and immediately before capturing the graph. It checks again after
capture and retries if another popup appeared. If a popup cannot be dismissed,
it logs the screenshot failure to stderr and leaves the previous PNG intact.
Successful screenshots replace the old file atomically. Schedule JSON remains
the only stdout output.

## Run independently

Use Node.js 20 or newer (the deployed collector uses Node.js 24).

```sh
cd collector
npm ci
npx playwright install chromium
STREET='Березняківська' HOUSE='12' SHOT=/tmp/dtek-graph.png npm run --silent check
```

`STREET` and `HOUSE` default to `Березняківська` and `12`. `DEADLINE_MS` defaults
to 45000. Set `SHOT` explicitly when running outside the deployed collector:
its existing default is `/home/ded/projects/shutdown/shot.png`.

## Update the existing server

The fix is already installed on the collector at `192.168.0.120`. For subsequent
updates, copy `check.mjs` into `/home/ded/projects/shutdown/`; the existing wrapper
and Playwright installation continue to work without a Next.js redeployment.
The original script is backed up there as `check.before-popup-fix-20261013.mjs`.

Validation for this fix covered stacked modals, a modal appearing before a field
interaction, a modal appearing before capture, and an undismissible modal.
Live checks succeeded for both tracked addresses, and the deployed screenshot
endpoints served exactly the collector's refreshed PNGs.
