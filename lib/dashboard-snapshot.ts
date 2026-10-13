import { createHash } from "node:crypto";
import { readDashboard, type DashboardColumn } from "./state";
import { shotSlug, shotVersion } from "./shots";
import { kyivDay } from "./time";

export type LiveDashboardColumn = DashboardColumn & { screenshotVersion: string | null };

/** Shared by the rendered page and stream, including file-only collector changes. */
export async function readDashboardSnapshot() {
  const columns: LiveDashboardColumn[] = await Promise.all(
    (await readDashboard()).map(async column => {
      const slug = shotSlug(column.street, column.building);
      return { ...column, screenshotVersion: slug ? await shotVersion(slug) : null };
    }),
  );
  const revision = createHash("sha256")
    .update(JSON.stringify({ day: kyivDay(), columns }))
    .digest("hex");
  return { columns, revision };
}
