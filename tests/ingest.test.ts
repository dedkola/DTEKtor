import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("failed and incomplete checks preserve the last valid schedule", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dtektor-test-"));
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  const { ensureSchema, ingest, getDaySchedule } = await import("../lib/db");
  try {
    await ensureSchema();
    const body = { address: { street: "Test", building: "1" }, checkedAt: "2026-10-13T12:00:00Z", ok: true,
      today: { offWindows: ["16:00-19:30"] }, tomorrow: { offWindows: [] } };
    const { address_id } = await ingest(body);
    await ingest({ address: body.address, checkedAt: body.checkedAt, ok: false });
    assert.deepEqual((await getDaySchedule(address_id, "2026-10-13"))?.windows, ["16:00-19:30"]);
    await assert.rejects(ingest({ ...body, today: undefined }), /incomplete_schedule/);
    assert.deepEqual((await getDaySchedule(address_id, "2026-10-13"))?.windows, ["16:00-19:30"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
