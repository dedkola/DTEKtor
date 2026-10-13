import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("health reads every configured address and separates database readiness from collection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dtektor-health-"));
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  process.env.ADDRESSES_FILE = path.join(directory, "addresses.json");
  process.env.SHOTS_DIR = directory;
  process.env.DTEKTOR_BUILD_SHA = "a".repeat(40);
  const addresses = [
    { street: "Test", building: "1", slug: "first" },
    { street: "Test", building: "2", slug: "second" },
  ];
  await writeFile(process.env.ADDRESSES_FILE, JSON.stringify(addresses));
  const { ensureSchema, ingest, db } = await import("../lib/db");
  const { readHealth } = await import("../lib/health");
  try {
    // Readiness must not create schema as a side effect.
    await assert.rejects(readHealth());
    await ensureSchema();
    let health = await readHealth();
    assert.equal(health.ready, true);
    assert.equal(health.collection.ok, false);
    assert.equal(health.collection.addresses.length, 2);
    const payload = { ok: true, checkedAt: new Date().toISOString(), today: { offWindows: [] }, tomorrow: { offWindows: [] } };
    await ingest({ ...payload, address: addresses[0] });
    assert.equal((await readHealth()).collection.ok, false, "one good address is insufficient");
    await ingest({ ...payload, address: addresses[1] });
    health = await readHealth();
    assert.equal(health.buildSha, "a".repeat(40));
    assert.equal(health.collection.ok, true);
    await writeFile(path.join(directory, "status.json"), JSON.stringify({
      completedAt: new Date().toISOString(), intervalMs: 300000,
      addresses: [{ slug: "first", ok: true }, { slug: "second", ok: false }],
    }));
    health = await readHealth();
    assert.equal(health.ready, true);
    assert.equal(health.collection.ok, false);
    assert.equal(health.collection.addresses[1].collectionProblem, true);
    assert.equal((await db().execute("SELECT COUNT(*) AS count FROM checks")).rows[0].count, 2, "health must not write audit records");
  } finally {
    db().close();
    await rm(directory, { recursive: true, force: true });
  }
});
