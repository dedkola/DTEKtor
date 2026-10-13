# DTEKtor

**Single-address DTEK outage tracker.** The collector feeds exactly one address;
every visitor opens the page and immediately sees **that address**: the outages
still remaining today, tomorrow's outages, DTEK's own schedule-update stamp, and
a 7-day history strip. There is **no setup step** — no address form, no login.

- No accounts and no per-visitor setup: the page shows the collector-fed address.
- Local file database *or* hosted Turso — one libSQL driver for both.
- Light theme only (never dark). Responsive.
- UI in **English and Russian** (toggle, remembered in a cookie).
- Data arrives from an external **collector** that POSTs to us.

---

## Features

- **Zero-setup dashboard** — opens straight to today's remaining outage windows,
  tomorrow's windows, or a green "no outages planned" state.
- **Freshness stamps** — when DTEK last updated its schedule, when the source
  graph was updated, and when our collector last checked.
- **7-day history** — planned off-hours per day, derived from half-hour slots.
- **EN / RU** switch with a remembered preference.
- **Manual refresh** — a button, plus a 60-second auto-refresh, re-reads the
  latest data in place.
- **Ingest API** — a collector worker pushes each check; we store raw checks,
  the resolved daily schedule, slot expansion and a change log.
- **Turso-ready** — the same code runs against a local file in dev and a hosted
  libSQL database in production.

---

## How it works (single address)

There are no accounts, no logins and no address form.

1. The **collector** posts each DTEK check to `POST /api/ingest`, which upserts
   the address and stores the schedule.
2. The home page (`readState`) returns the **primary address** — the most
   recently seen one — so any visitor sees it immediately, with no setup.
3. A legacy cookie path remains: if a `dtektor_id` cookie points at an address,
   that address wins; otherwise the primary address is shown. `POST
   /api/settings` still exists but is no longer linked from the UI.
4. The language preference lives in a separate `dtektor_lang` cookie.

Because the deployment tracks one address, there is nothing to configure per
visitor.

---

## Architecture

```
            +---------------------------+
            |        Browser            |
            |  cookie: dtektor_id       |
            |  cookie: dtektor_lang     |
            +------------+--------------+
                         |
              HTTP (GET /, /settings, /api/*)
                         |
                         v
            +---------------------------+         +----------------------+
            |  Next.js (App Router)     |  libSQL |                      |
            |  - server components      |<------->|  LibSQL / Turso DB   |
            |  - /api/settings,state    |  driver |  (file: or libsql://)|
            |  - /api/ingest,lang       |         |                      |
            |  Vercel  or  Docker       |         +----------+-----------+
            +-------------+-------------+                    ^
                          ^                                  |
                          |  POST /api/ingest                |
                          |  x-ingest-secret: <secret>       |
                          |                                  |
                  +-------+--------+              +----------+-----------+
                  |    Collector   |              |   (same DB, stored   |
                  |  worker (cron) |              |    per address_id)   |
                  +----------------+              +----------------------+
```

- The **web app** serves pages and the read/write API.
- The **collector worker** (separate; you provide it) checks DTEK's public
  schedule and pushes results to `POST /api/ingest`.
- The **database** is libSQL: a local file in development, Turso in production.
  Both are reached through the same `@libsql/client` driver.

---

## Repository layout

```
app/
  page.tsx              server component: dashboard (no setup step)
  layout.tsx            root layout (light theme, fonts)
  globals.css           Tailwind v4 + light-only base styles
  api/
    settings/route.ts   POST  set address, link cookie (legacy; not in UI)
    state/route.ts      GET   dashboard state for the visitor
    ingest/route.ts     POST  collector payload (secret-protected)
    lang/route.ts       GET   set language cookie, redirect to "/"
components/
  RefreshButton.tsx     client refresh button
  AutoRefresh.tsx       60s in-place re-fetch
  LangSwitch.tsx        EN / RU links
lib/
  db.ts                 libSQL client, schema, queries, ingest
  state.ts              shared read logic (page + /api/state)
  i18n.ts               EN/RU dictionary
  time.ts               Europe/Kyiv dates + window/slot helpers
Dockerfile              multi-stage production image
docker-compose.yml      one-command local run with a data volume
.env.example            environment template
```

---

## Database schema

All tables are created lazily and idempotently by `ensureSchema()` in
`lib/db.ts` (`CREATE TABLE IF NOT EXISTS …`), which also creates the local
`data/` directory before opening a `file:` database.

### `addresses`

The canonical address list. De-duplicated by street + building.

| Column       | Type    | Meaning                                              |
|--------------|---------|------------------------------------------------------|
| `id`         | INTEGER | PK, autoincrement.                                   |
| `street`     | TEXT    | Street name (NOT NULL).                              |
| `building`   | TEXT    | Building/house number (NOT NULL).                    |
| `label`      | TEXT    | Optional human label ("Home").                       |
| `created_at` | TEXT    | ISO timestamp of first insert.                       |
| —            | —       | `UNIQUE(street, building)`.                          |

### `watches`

Links browser cookies to addresses (the multi-user identity map).

| Column         | Type    | Meaning                                        |
|----------------|---------|------------------------------------------------|
| `address_id`   | INTEGER | → `addresses.id`.                              |
| `cookie_id`    | TEXT    | The `dtektor_id` UUID.                          |
| `created_at`   | TEXT    | When this cookie first linked the address.     |
| `last_seen_at` | TEXT    | Updated on every state read.                   |
| —              | —       | `PRIMARY KEY(address_id, cookie_id)`.          |

### `checks`

One row per collector run, per address. A raw audit log.

| Column          | Type    | Meaning                                             |
|-----------------|---------|-----------------------------------------------------|
| `id`            | INTEGER | PK, autoincrement.                                  |
| `address_id`    | INTEGER | → `addresses.id`.                                   |
| `checked_at`    | TEXT    | ISO time the collector checked.                     |
| `dtek_updated`  | TEXT    | DTEK's own schedule-update stamp.                   |
| `graph_updated` | TEXT    | When the source graph was updated.                  |
| `ok`            | INTEGER | 1 = check succeeded, 0 = failed.                    |
| `raw`           | TEXT    | The raw ingest payload (truncated to 20 000 chars). |

### `day_schedule`

The resolved schedule for one address + day.

| Column       | Type    | Meaning                                                  |
|--------------|---------|----------------------------------------------------------|
| `address_id` | INTEGER | → `addresses.id`.                                        |
| `day`        | TEXT    | `YYYY-MM-DD` in **Europe/Kyiv**.                         |
| `windows`    | TEXT    | JSON array of off-windows, e.g. `["08:00-11:00"]`.       |
| `updated_at` | TEXT    | ISO time this day's schedule was last written.           |
| —            | —       | `PRIMARY KEY(address_id, day)`.                           |

### `day_slots`

Half-hour power state per day — the source for history/charts.

| Column       | Type    | Meaning                                                          |
|--------------|---------|------------------------------------------------------------------|
| `address_id` | INTEGER | → `addresses.id`.                                                |
| `day`        | TEXT    | `YYYY-MM-DD` (Europe/Kyiv).                                      |
| `slot`       | INTEGER | 0–47; `hour*2 + half` (`:00–:30` = 0, `:30–:00` = 1).            |
| `state`      | TEXT    | `on` \| `off` \| `off_1st30` \| `off_2nd30` \| `unknown`.        |
| `source`     | TEXT    | `planned` (from DTEK email/schedule) or `actual` (observed).     |
| —            | —       | `PRIMARY KEY(address_id, day, slot, source)`.                    |

### `schedule_changes`

Append-only log written whenever a day's `windows` JSON changes.

| Column        | Type    | Meaning                                    |
|---------------|---------|--------------------------------------------|
| `id`          | INTEGER | PK, autoincrement.                         |
| `address_id`  | INTEGER | → `addresses.id`.                          |
| `day`         | TEXT    | The day whose schedule changed.            |
| `before`      | TEXT    | Previous `windows` JSON.                   |
| `after`       | TEXT    | New `windows` JSON.                        |
| `detected_at` | TEXT    | ISO time the change was detected.          |

### `actual_outages`

Reported/observed real outages (reserved for the roadmap's "my power is out"
button and sensor heartbeat).

| Column        | Type    | Meaning                                              |
|---------------|---------|------------------------------------------------------|
| `id`          | INTEGER | PK, autoincrement.                                   |
| `address_id`  | INTEGER | → `addresses.id`.                                    |
| `start_at`    | TEXT    | ISO when the outage began.                           |
| `end_at`      | TEXT    | ISO when power returned (NULL while ongoing).        |
| `reported_by` | TEXT    | Reporter id (cookie / user / sensor).                |
| `note`        | TEXT    | Free text.                                           |

**Indexes:** `checks(address_id, checked_at)`, `day_slots(address_id, day)`,
plus `checks(address_id)`, `day_schedule(address_id)`, `watches(cookie_id)`.

---

## API contract

### `POST /api/settings`

> **Legacy.** The UI no longer calls this endpoint; the page shows the
> collector-fed primary address automatically. Retained for direct use/testing.

Create/select an address and link the visitor cookie.

Request:

```json
{ "street": "Хрещатик", "building": "12", "label": "Home" }
```

`label` is optional. Both `street` and `building` are required.

Response `200`:

```json
{ "ok": true, "address_id": 3 }
```

Sets `dtektor_id` (uuid, `httpOnly`, `sameSite=lax`, 1-year) on success.
Errors: `400 { "ok": false, "error": "street_and_building_required" }`.

### `GET /api/state`

Returns the dashboard state for the caller's `dtektor_id` cookie.

With no cookie / no linked address:

```json
{ "address": null }
```

With an address:

```json
{
  "address": { "id": 3, "street": "Хрещатик", "building": "12", "label": "Home", "createdAt": "2026-10-01T09:00:00.000Z" },
  "today":    { "windows": ["08:00-11:00"], "upcoming": ["08:00-11:00"] },
  "tomorrow": { "windows": [],             "upcoming": [] },
  "updated": "2026-10-13T06:05:00.000Z",
  "graphUpdated": "2026-10-13T06:00:00.000Z",
  "checkedAt": "2026-10-13T06:12:00.000Z",
  "history": [
    { "day": "2026-10-07", "offHours": 2 },
    { "day": "2026-10-08", "offHours": 4 }
  ]
}
```

- `today.upcoming` = today's windows whose end time is still in the future
  (Europe/Kyiv). `tomorrow.upcoming` = all of tomorrow's windows.
- `history` is the last 7 days (oldest → today), `offHours = planned slots / 2`.
- Response is sent with `cache-control: no-store`.

### `POST /api/ingest`

Collector → server. If `INGEST_SECRET` is set, the request **must** carry
`x-ingest-secret: <INGEST_SECRET>` (otherwise `401`). Leave `INGEST_SECRET`
unset only for local development.

Header:

```
x-ingest-secret: <INGEST_SECRET>
content-type: application/json
```

Body:

```json
{
  "address": { "street": "Хрещатик", "building": "12", "label": null },
  "checkedAt": "2026-10-13T06:12:00.000Z",
  "updated": "2026-10-13T06:05:00.000Z",
  "graphUpdated": "2026-10-13T06:00:00.000Z",
  "ok": true,
  "today": {
    "offWindows": ["08:00-11:00"],
    "upcoming": ["08:00-11:00"],
    "classes": []
  },
  "tomorrow": {
    "offWindows": [],
    "upcoming": [],
    "classes": []
  }
}
```

`offWindows` items may be strings (`"08:00-11:00"`, also accepting `–`/`—`/`..`/
`to`) or objects (`{ "start": "08:00", "end": "11:00" }`).

What the server does:

1. Derives the calendar day (`YYYY-MM-DD`) in **Europe/Kyiv** from `checkedAt`.
2. Upserts the address (`addresses`).
3. Inserts a `checks` row (raw payload, stamps, `ok`).
4. Upserts `day_schedule` for **today** and **tomorrow**; if the windows JSON
   changed, appends a `schedule_changes` row.
5. Rebuilds that day's `day_slots` with `source='planned'`: two half-hour slots
   per hour — a fully-off hour → both halves `off`; a single covered half →
   `off_1st30` / `off_2nd30` (merged DTEK windows are hour-aligned, so in
   practice you get `off`).

Response `200`: `{ "ok": true, "address_id": 3 }`.

### `GET /api/lang?set=en|ru`

Sets the `dtektor_lang` cookie and redirects to `/`.

---

## Local development

```bash
npm install
cp .env.example .env.local        # optional; sensible defaults are built in
npm run dev                       # http://localhost:3000
```

By default the app uses `file:./data/dtektor.db` and creates `./data`
automatically. No `INGEST_SECRET` means the ingest endpoint is open — fine on
localhost, never in production.

Smoke-test the ingest endpoint locally:

```bash
curl -s localhost:3000/api/ingest \
  -H 'content-type: application/json' \
  -d '{
    "address":{"street":"Хрещатик","building":"12"},
    "checkedAt":"2026-10-13T06:12:00.000Z",
    "updated":"2026-10-13T06:05:00.000Z",
    "graphUpdated":"2026-10-13T06:00:00.000Z",
    "ok":true,
    "today":{"offWindows":["08:00-11:00"],"upcoming":["08:00-11:00"]},
    "tomorrow":{"offWindows":[]}
  }'
```

Production build check:

```bash
npm run build
npx tsc --noEmit
```

---

## Docker

A multi-stage `Dockerfile` and a `docker-compose.yml` are included. The compose
setup keeps the SQLite file in a host-mounted `./data` volume.

```bash
# with a compose secret
INGEST_SECRET=super-secret docker compose up --build

# or plain Docker
docker build -t dtektor .
docker run -p 3000:3000 -v "$PWD/data:/app/data" \
  -e INGEST_SECRET=super-secret dtektor
```

---

## Deploying to Vercel (with Turso)

Vercel's functions are serverless: their local filesystem is ephemeral and
**not shared between instances**. A `file:` database would be lost on the next
cold start and invisible to other regions. Use **Turso** (hosted libSQL)
instead — same driver, same SQL, durable and shared.

1. Create a database:

   ```bash
   turso db create dtektor
   turso db show dtektor --url          # -> libsql://...
   turso db tokens create dtektor       # -> auth token
   ```

2. Set the Vercel project's environment variables:

   | Variable               | Value                                  |
   |------------------------|----------------------------------------|
   | `DATABASE_URL`         | `libsql://your-db-your-org.turso.io`   |
   | `DATABASE_AUTH_TOKEN`  | the token from `turso db tokens create`|
   | `INGEST_SECRET`        | a long random string                    |

3. Deploy. The schema is created lazily on first request — no migration step.

**Why Turso/libSQL and not a local file?** Serverless instances don't share a
disk, and their `/tmp` is ephemeral. A hosted libSQL database gives every
instance one durable, shared database while keeping the identical
`@libsql/client` code path you use locally with `file:./data/dtektor.db`.

---

## History & charts

Charts are derived entirely from `day_slots`:

- Each half hour = one slot; `offHours = (number of planned off slots) / 2`.
- The dashboard's 7-day strip plots planned off-hours per day (bar height is
  proportional to `offHours` out of 24).
- Because only off-slots are stored, "hours with power" is simply
  `24 − offHours` — no need to write 48 rows per day for every on-slot.

This makes history cheap to compute (`COUNT(*) GROUP BY day`) and keeps the
table compact while still supporting finer future states (`off_1st30`,
`off_2nd30`, `unknown`, and `actual` sources).

---

## Roadmap

- **Accounts** — optional login so a user can carry their address across
  devices without relying on a cookie.
- **"My power is out" button** — a one-tap report written to `actual_outages`,
  cross-checked against the planned schedule.
- **Sensor heartbeat** — a tiny always-on device reporting real power state,
  turning `actual` slots and `actual_outages` into ground truth.
- **Change notifications** — alert users when `schedule_changes` records a new
  window for their address.
- **Collector hardening** — retries, backoff and per-address check scheduling.

---

## License

Not yet chosen. Until a license file is added, all rights are reserved by the
author. A common choice for a project like this is MIT — add a `LICENSE` file
before distributing.
