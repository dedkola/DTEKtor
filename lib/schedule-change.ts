import { addDays, kyivDay, normalizeWindows } from "./time";

export type ScheduleInput = {
  offWindows?: unknown;
  classes?: unknown;
  available?: unknown;
};
export type ScheduleContent = {
  available: boolean;
  windows: string[];
  states: string[] | null;
};
export type ScheduleChange = {
  day: string;
  kind: "added" | "changed";
  windows: string[];
};
export type PushMessage = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

/** Compare schedule cells, never screenshot pixels or the collector's clock. */
export function scheduleContent(day: ScheduleInput): ScheduleContent {
  const classes = Array.isArray(day.classes) ? day.classes : null;
  const available =
    day.available !== false && (classes === null || classes.length > 0);
  const states =
    classes?.map((value) => {
      const c = String(value);
      if (c.includes("non-scheduled")) return "on";
      if (c.includes("second-half")) return "off-2nd30";
      if (c.includes("first-half")) return "off-1st30";
      if (c.includes("scheduled")) return "off";
      return c.split(/\s+/).sort().join(" ");
    }) ?? null;
  return { available, windows: normalizeWindows(day.offWindows), states };
}

export function scheduleChange(
  before: ScheduleContent | null,
  after: ScheduleContent,
): ScheduleChange["kind"] | null {
  if (!after.available) return null;
  if (!before?.available) return "added";
  if (JSON.stringify(before.windows) !== JSON.stringify(after.windows))
    return "changed";
  if (
    before.states !== null &&
    after.states !== null &&
    JSON.stringify(before.states) !== JSON.stringify(after.states)
  )
    return "changed";
  return null;
}

export function scheduleMessage(
  address: string,
  addressId: number,
  changes: ScheduleChange[],
  now = new Date(),
  schedules: Pick<ScheduleChange, "day" | "windows">[] = changes,
): PushMessage {
  const today = kyivDay(now);
  const tomorrow = addDays(today, 1);
  const dayName = (day: string) =>
    day === today
      ? "сегодня"
      : day === tomorrow
        ? "завтра"
        : day.split("-").reverse().join(".");
  const title =
    changes.length === 1 && changes[0].kind === "added"
      ? `Опубликован график на ${dayName(changes[0].day)}`
      : "Обновлён график ДТЕК";
  const body = [
    address,
    ...schedules.map((change) => {
      const summary = change.windows.length
        ? change.windows.slice(0, 4).join(", ") +
          (change.windows.length > 4 ? "…" : "")
        : "отключений нет";
      return `${dayName(change.day)}: ${summary}`;
    }),
  ].join("\n");
  return { title, body, tag: `dtektor-schedule-${addressId}`, url: "/" };
}
