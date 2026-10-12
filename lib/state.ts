// Read logic shared by app/page.tsx (server component) and GET /api/state.
// No HTTP self-calls: both import this module directly.

import {
  ensureSchema,
  findAddressByCookie,
  getDaySchedule,
  getLatestCheck,
  getPlannedSlotCounts,
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

export type HistoryEntry = {
  day: string;
  /** Planned hours without power for that day (half-hour slots / 2). */
  offHours: number;
};

export type DashboardState = {
  address: AddressInfo;
  today: DayInfo;
  tomorrow: DayInfo;
  /** DTEK's own schedule update stamp (from the latest check). */
  updated: string | null;
  /** When the graph behind DTEK's schedule was updated. */
  graphUpdated: string | null;
  /** When our collector last checked. */
  checkedAt: string | null;
  history: HistoryEntry[];
};

export type StateResponse = { address: null } | DashboardState;

const HISTORY_DAYS = 7;

/**
 * Resolve the state for a browser cookie id.
 * Returns { address: null } when there is no cookie or no linked address.
 */
export async function readState(cookieId?: string | null): Promise<StateResponse> {
  await ensureSchema();

  if (!cookieId) return { address: null };

  const address = await findAddressByCookie(cookieId);
  if (!address) return { address: null };

  await touchWatch(address.id, cookieId);

  const today = kyivDay();
  const tomorrow = addDays(today, 1);
  const nowMinutes = kyivMinutes();
  const historyFrom = addDays(today, -(HISTORY_DAYS - 1));

  const [todaySchedule, tomorrowSchedule, latest, slotCounts] = await Promise.all([
    getDaySchedule(address.id, today),
    getDaySchedule(address.id, tomorrow),
    getLatestCheck(address.id),
    getPlannedSlotCounts(address.id, historyFrom),
  ]);

  const todayWindows = todaySchedule?.windows ?? [];
  const tomorrowWindows = tomorrowSchedule?.windows ?? [];

  const history: HistoryEntry[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    history.push({ day, offHours: (slotCounts[day] ?? 0) / 2 });
  }

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
    history,
  };
}
