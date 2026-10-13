// Database layer — one libSQL driver for both a local file and Turso.
//
//   DATABASE_URL        default: file:./data/dtektor.db
//   DATABASE_AUTH_TOKEN optional (only needed for Turso / remote libSQL)
//
// `db()` returns a lazily created singleton client; `ensureSchema()` runs the
// idempotent DDL once per process (creates the data dir first for file DBs).

import { createClient, type Client, type InStatement } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

import {
  addDays,
  kyivDay,
  normalizeWindows,
  windowsToSlots,
} from "./time";

const DEFAULT_URL = "file:./data/dtektor.db";

let _client: Client | null = null;
let _schema: Promise<void> | null = null;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : DEFAULT_URL;
}

/** Create the parent directory for a `file:` URL so libSQL can open it. */
function ensureFileDir(url: string): void {
  if (!url.startsWith("file:")) return;
  let p = url.slice("file:".length);
  if (p.startsWith("//")) p = p.slice(2);
  if (!p) return;
  const abs = path.isAbsolute(p)
    ? p
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), p);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
  } catch {
    // best effort — libSQL will surface the real error if the path is unusable
  }
}

/** Singleton libSQL client. */
export function db(): Client {
  if (!_client) {
    const url = databaseUrl();
    ensureFileDir(url);
    const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
    _client = authToken ? createClient({ url, authToken }) : createClient({ url });
  }
  return _client;
}

/** Idempotent schema creation — safe to call on every request (memoised). */
export async function ensureSchema(): Promise<void> {
  if (!_schema) {
    _schema = (async () => {
      const c = db();
      for (const sql of SCHEMA) {
        await c.execute(sql);
      }
    })().catch((err) => {
      // let a later request retry if this one failed
      _schema = null;
      throw err;
    });
  }
  return _schema;
}

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS addresses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     street TEXT NOT NULL,
     building TEXT NOT NULL,
     label TEXT,
     created_at TEXT,
     UNIQUE(street, building)
   )`,
  `CREATE TABLE IF NOT EXISTS watches (
     address_id INTEGER,
     cookie_id TEXT,
     created_at TEXT,
     last_seen_at TEXT,
     PRIMARY KEY(address_id, cookie_id)
   )`,
  `CREATE TABLE IF NOT EXISTS checks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     address_id INTEGER,
     checked_at TEXT,
     dtek_updated TEXT,
     graph_updated TEXT,
     ok INTEGER,
     raw TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS day_schedule (
     address_id INTEGER,
     day TEXT,
     windows TEXT,
     updated_at TEXT,
     PRIMARY KEY(address_id, day)
   )`,
  `CREATE TABLE IF NOT EXISTS day_slots (
     address_id INTEGER,
     day TEXT,
     slot INTEGER,
     state TEXT,
     source TEXT,
     PRIMARY KEY(address_id, day, slot, source)
   )`,
  `CREATE TABLE IF NOT EXISTS schedule_changes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     address_id INTEGER,
     day TEXT,
     before TEXT,
     after TEXT,
     detected_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS actual_outages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     address_id INTEGER,
     start_at TEXT,
     end_at TEXT,
     reported_by TEXT,
     note TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_checks_address_time ON checks(address_id, checked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_day_slots_address_day ON day_slots(address_id, day)`,
  `CREATE INDEX IF NOT EXISTS idx_checks_address_id ON checks(address_id)`,
  `CREATE INDEX IF NOT EXISTS idx_day_schedule_address_id ON day_schedule(address_id)`,
  `CREATE INDEX IF NOT EXISTS idx_watches_cookie ON watches(cookie_id)`,
];

// ---------------------------------------------------------------------------
// Low-level query helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Args = (string | number | null)[];

function asString(v: unknown): string | null {
  return v == null ? null : String(v);
}

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function all(sql: string, args: Args = []): Promise<Row[]> {
  const rs = await db().execute({ sql, args });
  return rs.rows as unknown as Row[];
}

async function run(sql: string, args: Args = []): Promise<number> {
  const rs = await db().execute({ sql, args });
  return Number(rs.lastInsertRowid ?? 0);
}

/** Parse a stored JSON array of window strings. */
export function parseWindowsJson(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Addresses + watches
// ---------------------------------------------------------------------------

export type AddressInfo = {
  id: number;
  street: string;
  building: string;
  label: string | null;
  createdAt: string | null;
};

/** Insert or update an address by (street, building) and return its id. */
export async function upsertAddress(
  street: string,
  building: string,
  label?: string | null,
): Promise<number> {
  const rows = await all(
    `INSERT INTO addresses (street, building, label, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(street, building)
     DO UPDATE SET label = COALESCE(excluded.label, addresses.label)
     RETURNING id`,
    [street, building, label ?? null, new Date().toISOString()],
  );
  return asNumber(rows[0]?.id);
}

/** Link a browser cookie id to an address (upsert). */
export async function linkWatch(addressId: number, cookieId: string): Promise<void> {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO watches (address_id, cookie_id, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(address_id, cookie_id)
     DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    [addressId, cookieId, now, now],
  );
}

/** Most recently seen address for a cookie, or null. */
export async function findAddressByCookie(cookieId: string): Promise<AddressInfo | null> {
  const rows = await all(
    `SELECT a.id AS id, a.street AS street, a.building AS building,
            a.label AS label, a.created_at AS created_at
       FROM watches w
       JOIN addresses a ON a.id = w.address_id
      WHERE w.cookie_id = ?
      ORDER BY w.last_seen_at DESC
      LIMIT 1`,
    [cookieId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: asNumber(r.id),
    street: asString(r.street) ?? "",
    building: asString(r.building) ?? "",
    label: asString(r.label),
    createdAt: asString(r.created_at),
  };
}

/**
 * The most recently seen address overall, or null.
 * Used by the single-address deployment: the collector feeds exactly one
 * address, so every visitor should see it without any setup step.
 */
export async function getPrimaryAddress(): Promise<AddressInfo | null> {
  const rows = await all(
    `SELECT a.id AS id, a.street AS street, a.building AS building,
            a.label AS label, a.created_at AS created_at
       FROM addresses a
      ORDER BY COALESCE(
                 (SELECT MAX(w.last_seen_at) FROM watches w WHERE w.address_id = a.id),
                 a.created_at
               ) DESC
      LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: asNumber(r.id),
    street: asString(r.street) ?? "",
    building: asString(r.building) ?? "",
    label: asString(r.label),
    createdAt: asString(r.created_at),
  };
}

/**
 * Look up one address by its exact (street, building), or null.
 * Used by the predefined two-address dashboard.
 */
export async function getAddressByStreetBuilding(
  street: string,
  building: string,
): Promise<AddressInfo | null> {
  const rows = await all(
    `SELECT id, street, building, label, created_at
       FROM addresses
      WHERE street = ? AND building = ?
      LIMIT 1`,
    [street, building],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: asNumber(r.id),
    street: asString(r.street) ?? "",
    building: asString(r.building) ?? "",
    label: asString(r.label),
    createdAt: asString(r.created_at),
  };
}

export async function touchWatch(addressId: number, cookieId: string): Promise<void> {
  await run(`UPDATE watches SET last_seen_at = ? WHERE address_id = ? AND cookie_id = ?`, [
    new Date().toISOString(),
    addressId,
    cookieId,
  ]);
}

// ---------------------------------------------------------------------------
// Reads used by lib/state.ts
// ---------------------------------------------------------------------------

export type DaySchedule = { windows: string[]; updatedAt: string | null };

export async function getDaySchedule(
  addressId: number,
  day: string,
): Promise<DaySchedule | null> {
  const rows = await all(`SELECT windows, updated_at FROM day_schedule WHERE address_id = ? AND day = ?`, [
    addressId,
    day,
  ]);
  const r = rows[0];
  if (!r) return null;
  return { windows: parseWindowsJson(r.windows), updatedAt: asString(r.updated_at) };
}

export type LatestCheck = {
  checkedAt: string | null;
  dtekUpdated: string | null;
  graphUpdated: string | null;
  ok: boolean;
};

export async function getLatestCheck(addressId: number): Promise<LatestCheck | null> {
  const rows = await all(
    `SELECT checked_at, dtek_updated, graph_updated, ok
       FROM checks
      WHERE address_id = ?
      ORDER BY checked_at DESC
      LIMIT 1`,
    [addressId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    checkedAt: asString(r.checked_at),
    dtekUpdated: asString(r.dtek_updated),
    graphUpdated: asString(r.graph_updated),
    ok: asNumber(r.ok) === 1,
  };
}

/** Planned off-slot count per day (every slot = a half hour). */
export async function getPlannedSlotCounts(
  addressId: number,
  fromDay: string,
): Promise<Record<string, number>> {
  const rows = await all(
    `SELECT day, COUNT(*) AS n
       FROM day_slots
      WHERE address_id = ? AND source = 'planned' AND day >= ?
      GROUP BY day`,
    [addressId, fromDay],
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[asString(r.day) ?? ""] = asNumber(r.n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ingest (collector -> us)
// ---------------------------------------------------------------------------

export type IngestDay = {
  offWindows?: unknown;
  upcoming?: unknown;
  classes?: unknown;
};

export type IngestBody = {
  address?: { street?: unknown; building?: unknown; label?: unknown } | null;
  checkedAt?: unknown;
  updated?: unknown;
  graphUpdated?: unknown;
  ok?: unknown;
  today?: IngestDay | null;
  tomorrow?: IngestDay | null;
};

export type IngestResult = { address_id: number; changed: string[] };

function validDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Persist one collector payload. Derives the Kyiv calendar day, upserts the
 * address/checks/schedule, records schedule changes, and expands off-windows
 * into planned day_slots.
 */
export async function ingest(body: IngestBody): Promise<IngestResult> {
  const street = String(body?.address?.street ?? "").trim();
  const building = String(body?.address?.building ?? "").trim();
  if (!street || !building) throw new Error("address_required");
  if (body.ok !== false && (!Array.isArray(body.today?.offWindows) || !Array.isArray(body.tomorrow?.offWindows))) throw new Error("incomplete_schedule");
  const label = body?.address?.label != null ? String(body.address.label) : null;

  const checkedDate = validDate(body?.checkedAt) ?? new Date();
  const checkedAtIso = checkedDate.toISOString();

  const addressId = await upsertAddress(street, building, label);

  const raw = JSON.stringify(body).slice(0, 20000);

  await run(
    `INSERT INTO checks (address_id, checked_at, dtek_updated, graph_updated, ok, raw)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      addressId,
      checkedAtIso,
      asString(body?.updated),
      asString(body?.graphUpdated),
      body?.ok === false ? 0 : 1,
      raw,
    ],
  );

  // Failed checks are audit records, never replacements for a valid schedule.
  if (body.ok === false) return { address_id: addressId, changed: [] };

  const baseDay = kyivDay(checkedDate);
  const days: Array<[string, IngestDay | null | undefined]> = [
    [baseDay, body?.today],
    [addDays(baseDay, 1), body?.tomorrow],
  ];

  const changed: string[] = [];
  const now = new Date().toISOString();

  for (const [day, payload] of days) {
    const windows = normalizeWindows(payload?.offWindows);
    const afterJson = JSON.stringify(windows);

    const existing = await all(
      `SELECT windows FROM day_schedule WHERE address_id = ? AND day = ?`,
      [addressId, day],
    );
    const beforeJson = existing.length > 0 ? String(existing[0].windows ?? "") : null;

    await run(
      `INSERT INTO day_schedule (address_id, day, windows, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(address_id, day)
       DO UPDATE SET windows = excluded.windows, updated_at = excluded.updated_at`,
      [addressId, day, afterJson, now],
    );

    if (beforeJson !== null && beforeJson !== afterJson) {
      await run(
        `INSERT INTO schedule_changes (address_id, day, before, after, detected_at)
         VALUES (?, ?, ?, ?, ?)`,
        [addressId, day, beforeJson, afterJson, now],
      );
      changed.push(day);
    }

    // Rebuild the planned slots for this day atomically.
    const slots = windowsToSlots(windows);
    const stmts: InStatement[] = [
      {
        sql: `DELETE FROM day_slots WHERE address_id = ? AND day = ? AND source = 'planned'`,
        args: [addressId, day],
      },
      ...slots.map((s) => ({
        sql: `INSERT OR REPLACE INTO day_slots (address_id, day, slot, state, source)
              VALUES (?, ?, ?, ?, 'planned')`,
        args: [addressId, day, s.slot, s.state] as Args,
      })),
    ];
    await db().batch(stmts, "write");
  }

  return { address_id: addressId, changed };
}
