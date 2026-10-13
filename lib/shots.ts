import { stat } from "node:fs/promises";
import path from "node:path";
import { readAddresses } from "../config/addresses.mjs";

export const SHOTS_DIR = process.env.SHOTS_DIR || path.resolve("data/shots");

export function shotSlug(street: string, building: string): string | null {
  return readAddresses().find(a => a.street === street.trim() && a.building === building.trim())?.slug ?? null;
}

export async function hasShot(slug: string): Promise<boolean> {
  return (await shotVersion(slug)) !== null;
}

/** Changes the image URL whenever the collector replaces a screenshot. */
export async function shotVersion(slug: string): Promise<string | null> {
  try {
    const file = await stat(path.join(SHOTS_DIR, `${slug}.png`));
    return `${file.mtimeMs}-${file.size}`;
  } catch { return null; }
}
