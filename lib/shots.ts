// Maps a tracked street to the screenshot file the collector writes.
// run-check.sh saves full-page captures under ./shots/<slug>.png; the web app
// serves them through /api/screenshot/<slug> so they can be shown and clicked.

export const SHOTS_DIR = "/home/ded/projects/shutdown/shots";

const SLUGS: Record<string, string> = {
  Березняківська: "berezniakivska",
  Урлівська: "urlivska",
};

/** Screenshot slug for a street, or null when we have no capture for it. */
export function shotSlug(street: string): string | null {
  return SLUGS[street.trim()] ?? null;
}
