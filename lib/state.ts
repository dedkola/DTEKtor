import { readFile } from "node:fs/promises";
import path from "node:path";
import { SHOTS_DIR, shotSlug } from "./shots";
import { readAddresses } from "../config/addresses.mjs";
// Read logic shared by app/page.tsx (server component) and GET /api/state.
// No HTTP self-calls: both import this module directly.

import {
  ensureSchema,
  findAddressByCookie,
  getAddressByStreetBuilding,
  getDaySchedule,
  getLatestCheck,
  getPrimaryAddress,
  touchWatch,
  type AddressInfo,
} from "./db";
import { addDays, kyivDay, kyivMinutes, upcomingWindows } from "./time";

export type { AddressInfo };

export type DayInfo = {
  /** All planned off-windows for the day, e.g. ["08:00-11:00"]. */
  windows: string[];
  /** Windows that are still ahead of "now" (for today: the remainder). */
  upcoming: string[];
};

export type AddressState = {
  address: AddressInfo;
  today: DayInfo;
  tomorrow: DayInfo;
  /** DTEK's own schedule update stamp (from the latest check). */
  updated: string | null;
  /** When the graph behind DTEK's schedule was updated. */
  graphUpdated: string | null;
  /** When our collector last checked. */
  checkedAt: string | null;
  collectionProblem: boolean;
};

export type DashboardState = AddressState;
export type StateResponse = { address: null } | DashboardState;

/** Build the dashboard state for an already-resolved address. */
export async function readAddressState(address: AddressInfo): Promise<AddressState> {
  const today = kyivDay();
  const tomorrow = addDays(today, 1);
  const nowMinutes = kyivMinutes();

  const [todaySchedule, tomorrowSchedule, latest] = await Promise.all([
    getDaySchedule(address.id, today),
    getDaySchedule(address.id, tomorrow),
    getLatestCheck(address.id),
  ]);

  const todayWindows = todaySchedule?.windows ?? [];
  const tomorrowWindows = tomorrowSchedule?.windows ?? [];

  let collectorFailed = false;
  try {
    const status = JSON.parse(await readFile(path.join(SHOTS_DIR, "status.json"), "utf8"));
    const slug = shotSlug(address.street, address.building);
    collectorFailed = status.addresses?.some((a: { slug: string; ok: boolean }) => a.slug === slug && !a.ok) ||
      Date.now() - Date.parse(status.completedAt) > Math.max(15 * 60000, status.intervalMs * 3);
  } catch { /* Existing deployments may not yet publish worker status. */ }

  return {
    address,
    today: {
      windows: todayWindows,
      upcoming: upcomingWindows(todayWindows, nowMinutes),
    },
    tomorrow: {
      windows: tomorrowWindows,
      // Everything tomorrow is still ahead of us.
      upcoming: tomorrowWindows,
    },
    updated: latest?.dtekUpdated ?? null,
    graphUpdated: latest?.graphUpdated ?? null,
    checkedAt: latest?.checkedAt ?? null,
    collectionProblem: collectorFailed || latest?.ok === false || !latest?.checkedAt || Date.now() - Date.parse(latest.checkedAt) > 15 * 60000,
  };
}

/**
 * Resolve the state for a visitor (used by GET /api/state).
 * Prefers the primary (collector-fed) address; a cookie-linked one still wins.
 * Returns { address: null } only while nothing has been recorded yet.
 */
export async function readState(cookieId?: string | null): Promise<StateResponse> {
  await ensureSchema();

  let address = cookieId ? await findAddressByCookie(cookieId) : null;
  if (!address) address = await getPrimaryAddress();
  if (!address) return { address: null };

  if (cookieId) await touchWatch(address.id, cookieId);
  return readAddressState(address);
}

export type DashboardColumn = {
  street: string;
  building: string;
  /** null until the collector has recorded this address. */
  state: AddressState | null;
};

/**
 * State for the predefined multi-address dashboard.
 * Missing addresses come back with `state: null` (a "waiting" column).
 */
export async function readDashboard(): Promise<DashboardColumn[]> {
  await ensureSchema();
  return Promise.all(
    readAddresses().map(async (a) => {
      const address = await getAddressByStreetBuilding(a.street, a.building);
      const state = address ? await readAddressState(address) : null;
      return { street: a.street, building: a.building, state };
    }),
  );
}
