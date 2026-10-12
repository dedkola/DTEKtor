// Time + schedule helpers shared across the app.
// Calendar days are always derived in Europe/Kyiv (the DTEK timezone).

export const KYIV_TZ = "Europe/Kyiv";

const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: KYIV_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const MIN_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: KYIV_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Current calendar day (YYYY-MM-DD) in Europe/Kyiv. */
export function kyivDay(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return DAY_FMT.format(date);
}

/** Minutes since midnight (0..1439) for the given instant, in Europe/Kyiv. */
export function kyivMinutes(date: Date = new Date()): number {
  const parts = MIN_FMT.format(date).split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Add N days to a YYYY-MM-DD string (UTC-safe, no DST surprises). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "HH:MM" -> minutes since midnight, or null if invalid. */
export function hhmmToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function minutesToHHMM(min: number): string {
  return `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;
}

export type ParsedWindow = { start: number; end: number; text: string };

const WINDOW_RE = /^(\d{1,2}:\d{2})\s*(?:-|–|—|\.\.|to)\s*(\d{1,2}:\d{2})$/i;

/** Parse a window string like "08:00-12:00" (accepts -, –, —, .., "to"). */
export function parseWindow(value: string): ParsedWindow | null {
  const s = String(value).trim();
  const m = WINDOW_RE.exec(s);
  if (!m) return null;
  const start = hhmmToMinutes(m[1]);
  const end = hhmmToMinutes(m[2]);
  if (start == null || end == null || end <= start) return null;
  return { start, end, text: `${minutesToHHMM(start)}-${minutesToHHMM(end)}` };
}

function windowFromObject(obj: Record<string, unknown>): ParsedWindow | null {
  const rawStart = obj.start ?? obj.from ?? obj.begin;
  const rawEnd = obj.end ?? obj.to ?? obj.until ?? obj.finish;
  if (rawStart == null || rawEnd == null) return null;
  return parseWindow(`${String(rawStart)}-${String(rawEnd)}`);
}

/** Canonicalise an ingest window (string or {start,end}) into "HH:MM-HH:MM". */
export function windowToString(item: unknown): string | null {
  if (typeof item === "string") {
    const p = parseWindow(item);
    return p ? p.text : null;
  }
  if (item && typeof item === "object") {
    const p = windowFromObject(item as Record<string, unknown>);
    return p ? p.text : null;
  }
  return null;
}

/** Normalise raw ingest windows into a sorted, de-duplicated canonical list. */
export function normalizeWindows(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const w = windowToString(item);
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export type SlotRow = { slot: number; state: string };

/**
 * Expand off-windows into half-hour slots (2 slots per hour).
 * slot = hour*2 + half, half 0 = :00–:30, half 1 = :30–:00.
 * Both halves covered -> "off"; only one half -> "off_1st30" / "off_2nd30".
 */
export function windowsToSlots(windows: string[]): SlotRow[] {
  const covered = new Set<number>();
  for (const w of windows) {
    const p = parseWindow(w);
    if (!p) continue;
    for (let min = p.start; min < p.end; min += 30) {
      const slot = Math.floor(min / 30);
      if (slot >= 0 && slot < 48) covered.add(slot);
    }
  }
  const rows: SlotRow[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const first = covered.has(hour * 2);
    const second = covered.has(hour * 2 + 1);
    if (first && second) {
      rows.push({ slot: hour * 2, state: "off" });
      rows.push({ slot: hour * 2 + 1, state: "off" });
    } else if (first) {
      rows.push({ slot: hour * 2, state: "off_1st30" });
    } else if (second) {
      rows.push({ slot: hour * 2 + 1, state: "off_2nd30" });
    }
  }
  return rows;
}

/** Windows whose end time is still in the future for a given "now" (minutes since midnight). */
export function upcomingWindows(windows: string[], nowMinutes: number): string[] {
  return windows.filter((w) => {
    const p = parseWindow(w);
    return p ? p.end > nowMinutes : false;
  });
}
