import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("revision tracks all addresses, screenshots and collector failures", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dtektor-live-"));
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  process.env.ADDRESSES_FILE = path.join(directory, "addresses.json");
  process.env.SHOTS_DIR = directory;
  const addresses = [
    { street: "Test", building: "1", slug: "first" },
    { street: "Test", building: "2", slug: "second" },
  ];
  await writeFile(process.env.ADDRESSES_FILE, JSON.stringify(addresses));
  const { ingest, db } = await import("../lib/db");
  const { readDashboardSnapshot } = await import("../lib/dashboard-snapshot");
  try {
    const empty = await readDashboardSnapshot();
    assert.equal(empty.columns.length, 2);
    assert.equal(empty.columns[0].state, null);
    assert.equal((await readDashboardSnapshot()).revision, empty.revision);
    await ingest({ address: addresses[1], checkedAt: new Date().toISOString(), today: { offWindows: ["08:00-10:00"] }, tomorrow: { offWindows: [] } });
    const collected = await readDashboardSnapshot();
    assert.notEqual(collected.revision, empty.revision);
    assert.deepEqual(collected.columns[1].state?.today.windows, ["08:00-10:00"]);
    await writeFile(path.join(directory, "second.png"), "first screenshot");
    const screenshot = await readDashboardSnapshot();
    assert.notEqual(screenshot.revision, collected.revision);
    assert.ok(screenshot.columns[1].screenshotVersion);
    await utimes(path.join(directory, "second.png"), new Date(), new Date(Date.now() + 1000));
    const replaced = await readDashboardSnapshot();
    assert.notEqual(replaced.columns[1].screenshotVersion, screenshot.columns[1].screenshotVersion);
    assert.notEqual(replaced.revision, screenshot.revision);
    await writeFile(path.join(directory, "status.json"), JSON.stringify({ completedAt: new Date().toISOString(), intervalMs: 300000, addresses: [{ slug: "second", ok: false }] }));
    const failed = await readDashboardSnapshot();
    assert.notEqual(failed.revision, replaced.revision);
    assert.equal(failed.columns[1].state?.collectionProblem, true);
    assert.deepEqual(failed.columns[1].state?.today.windows, ["08:00-10:00"]);
  } finally {
    db().close();
    await rm(directory, { recursive: true, force: true });
  }
});
