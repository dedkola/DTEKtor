import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import webpush from "web-push";
import { NextRequest } from "next/server";
import {
  scheduleChange,
  scheduleContent,
  scheduleMessage,
} from "../lib/schedule-change";

test("change detection distinguishes publication, changes and harmless collector updates", () => {
  const missing = scheduleContent({
    offWindows: [],
    classes: [],
    available: false,
  });
  const clear = scheduleContent({
    offWindows: [],
    classes: Array(24).fill("cell-non-scheduled"),
  });
  assert.equal(
    scheduleChange(missing, clear),
    "added",
    "a published all-clear is a new graph",
  );
  assert.equal(
    scheduleChange(clear, missing),
    null,
    "absence cannot replace a published graph",
  );
  assert.equal(scheduleChange(clear, clear), null);
  assert.deepEqual(scheduleContent({ offWindows: ["23:00-24:00"] }).windows, ["23:00-24:00"], "a graph ending at midnight must not be announced as an all-clear");
  const initial = scheduleContent({
    offWindows: ["9:00–10:00", "09:00-10:00"],
    classes: ["scheduled current-hour", "non-scheduled"],
  });
  const repeated = scheduleContent({
    offWindows: ["09:00-10:00"],
    classes: ["scheduled", "non-scheduled current-hour"],
  });
  assert.equal(
    scheduleChange(initial, repeated),
    null,
    "clock/formatting changes are ignored",
  );
  assert.equal(
    scheduleChange(
      initial,
      scheduleContent({
        offWindows: ["09:00-10:00"],
        classes: ["first-half", "non-scheduled"],
      }),
    ),
    "changed",
  );
  assert.equal(
    scheduleChange(initial, clear),
    "changed",
    "removal of outages is a change",
  );
  const message = scheduleMessage(
    "Test 1",
    1,
    [{ day: "2026-10-15", kind: "added", windows: [] }],
    new Date("2026-10-13T21:15:00Z"),
  );
  assert.match(
    message.title,
    /завтра/,
    "calendar is Kyiv even near UTC midnight",
  );
  assert.match(message.body, /отключений нет/);
});

test("push subscriptions, ingestion and durable delivery use the existing database", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dtektor-push-"));
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  process.env.ADDRESSES_FILE = path.join(directory, "addresses.json");
  await writeFile(
    process.env.ADDRESSES_FILE,
    JSON.stringify([{ street: "Test", building: "1", slug: "test" }]),
  );
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = "https://example.com";
  const { db, ingest, ensureSchema, getDaySchedule } =
    await import("../lib/db");
  const {
    parsePushSubscription,
    savePushSubscription,
    removePushSubscriptions,
    enqueuePushTest,
    flushPushQueue,
    pushConfiguration,
  } = await import("../lib/web-push");
  const routes = await import("../app/api/push/route");
  const subscription = (id: string) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    keys: {
      p256dh: webpush.generateVAPIDKeys().publicKey,
      auth: Buffer.alloc(16, 2).toString("base64url"),
    },
  });
  const first = subscription("first");
  const second = subscription("second");
  const cookie = randomUUID();
  const otherCookie = randomUUID();
  const count = async (table: string) =>
    Number(
      (await db().execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,
    );
  const payload = {
    address: { street: "Test", building: "1" },
    ok: true,
    checkedAt: "2026-10-14T10:00:00Z",
    today: { offWindows: ["09:00-10:00"], classes: ["scheduled"] },
    tomorrow: { available: false, offWindows: [], classes: [] as string[] },
  };
  try {
    await ensureSchema();
    await t.test(
      "configuration and endpoints reject invalid keys and local/arbitrary URLs",
      () => {
        assert.ok(pushConfiguration());
        assert.deepEqual(parsePushSubscription(first), first);
        for (const endpoint of [
          "http://fcm.googleapis.com/a",
          "https://127.0.0.1/a",
          "https://example.com/a",
          "https://fcm.googleapis.com.evil.test/a",
          "https://user@fcm.googleapis.com/a",
          "https://fcm.googleapis.com:8443/a",
        ])
          assert.equal(parsePushSubscription({ ...first, endpoint }), null);
        assert.equal(
          parsePushSubscription({
            ...first,
            keys: { ...first.keys, auth: "bad" },
          }),
          null,
        );
        assert.equal(
          parsePushSubscription({
            ...first,
            keys: {
              ...first.keys,
              p256dh: Buffer.alloc(65).toString("base64url"),
            },
          }),
          null,
        );
        const request = webpush.generateRequestDetails(
          first,
          "encrypted test",
          { vapidDetails: pushConfiguration()! },
        );
        assert.ok(
          request.body && request.headers.Authorization,
          "real VAPID signing and encryption work",
        );
      },
    );
    await t.test(
      "API guards browser ownership, CSRF and unconfigured servers",
      async () => {
        const get = await routes.GET(
          new NextRequest("https://example.com/api/push"),
        );
        const body = await get.json();
        assert.equal(body.publicKey, keys.publicKey);
        assert.equal(JSON.stringify(body).includes(keys.privateKey), false);
        assert.match(get.headers.get("set-cookie")!, /HttpOnly/i);
        const request = (
          origin: string,
          id: string = cookie,
          value: unknown = first,
        ) =>
          new NextRequest("https://example.com/api/push", {
            method: "POST",
            headers: {
              origin,
              cookie: `dtektor_push_id=${id}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(value),
          });
        assert.equal(
          (await routes.POST(request("https://evil.test"))).status,
          403,
        );
        assert.equal(
          (await routes.POST(request("https://example.com", "invalid"))).status,
          401,
        );
        assert.equal(
          (
            await routes.POST(
              request("https://example.com", cookie, {
                ...first,
                endpoint: "https://localhost/",
              }),
            )
          ).status,
          400,
        );
        assert.equal(
          (await routes.POST(request("https://example.com"))).status,
          200,
        );
        assert.equal(
          (await routes.POST(request("https://example.com"))).status,
          200,
        );
        assert.equal(await count("push_subscriptions"), 1);
        const deleted = await routes.DELETE(
          new NextRequest("https://example.com/api/push", {
            method: "DELETE",
            headers: {
              origin: "https://example.com",
              cookie: `dtektor_push_id=${otherCookie}`,
            },
          }),
        );
        assert.equal(deleted.status, 200);
        assert.equal(
          await count("push_subscriptions"),
          1,
          "another browser cannot unsubscribe this browser",
        );
        delete process.env.VAPID_PRIVATE_KEY;
        assert.equal(
          (await routes.POST(request("https://example.com"))).status,
          503,
        );
        process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      },
    );
    await t.test(
      "publication, tomorrow availability, repeats, failures and midnight",
      async () => {
        await ingest(payload);
        assert.equal(await count("push_deliveries"), 1);
        assert.equal(await getDaySchedule(1, "2026-10-15"), null);
        await ingest({
          ...payload,
          checkedAt: "2026-10-14T10:01:00Z",
          updated: "new timestamp",
          graphUpdated: "new timestamp",
        });
        assert.equal(await count("push_deliveries"), 1);
        const tomorrow = {
          available: true,
          offWindows: [],
          classes: Array(24).fill("non-scheduled"),
        };
        await ingest({
          ...payload,
          checkedAt: "2026-10-14T10:02:00Z",
          tomorrow,
        });
        assert.equal(await count("push_deliveries"), 1, "new publication supersedes an unsent older graph");
        assert.deepEqual((await getDaySchedule(1, "2026-10-15"))?.windows, []);
        const jobs = await db().execute(
          "SELECT payload FROM push_deliveries ORDER BY id DESC LIMIT 1",
        );
        assert.match(String(jobs.rows[0].payload), /Опубликован график/);
        await ingest({
          ...payload,
          checkedAt: "2026-10-14T10:03:00Z",
          ok: false,
        });
        await assert.rejects(
          ingest({ ...payload, today: undefined }),
          /incomplete_schedule/,
        );
        await ingest({ ...payload, checkedAt: "2026-10-14T10:04:00Z" });
        assert.deepEqual(
          (await getDaySchedule(1, "2026-10-15"))?.windows,
          [],
          "temporary absence preserves all-clear",
        );
        assert.equal(await count("push_deliveries"), 1);
        const changed = {
          ...payload,
          checkedAt: "2026-10-14T10:05:00Z",
          today: { offWindows: ["10:00-12:00"], classes: ["scheduled"] },
          tomorrow,
        };
        await Promise.all([ingest(changed), ingest(changed)]);
        assert.equal(
          await count("push_deliveries"),
          1,
          "parallel/repeated ingests enqueue once",
        );
        const latest = await db().execute("SELECT payload FROM push_deliveries");
        assert.match(String(latest.rows[0].payload), /10:00-12:00/);
        assert.match(String(latest.rows[0].payload), /отключений нет/, "latest message includes the published tomorrow graph");
        await ingest(payload);
        assert.deepEqual(
          (await getDaySchedule(1, "2026-10-14"))?.windows,
          ["10:00-12:00"],
          "old payload cannot undo a revision",
        );
        await ingest({
          ...payload,
          checkedAt: "2026-10-14T21:05:00Z",
          today: tomorrow,
        });
        assert.equal(
          await count("push_deliveries"),
          1,
          "tomorrow becoming today is not a change",
        );
        await ingest({
          ...payload,
          address: { street: "Unconfigured", building: "3" },
        });
        assert.equal(
          await count("push_deliveries"),
          1,
          "only configured addresses notify",
        );
      },
    );
    await t.test(
      "new revisions wait for in-flight delivery without blocking ingestion",
      async () => {
        let started!: () => void;
        let finish!: () => void;
        const sending = new Promise<void>(resolve => { started = resolve; });
        const resume = new Promise<void>(resolve => { finish = resolve; });
        const firstDelivery = flushPushQueue(async () => { started(); await resume; });
        await sending;
        try {
          await ingest({ ...payload, checkedAt: "2026-10-15T11:00:00Z", today: { offWindows: ["14:00-16:00"], classes: ["scheduled"] } });
          assert.equal(await count("push_deliveries"), 2, "in-flight job keeps its lease; latest revision is queued");
          let concurrentSends = 0;
          await flushPushQueue(async () => { concurrentSends++; });
          assert.equal(concurrentSends, 0, "an older notification cannot overtake the newer one");
        } finally { finish(); await firstDelivery; }
        assert.equal(await count("push_deliveries"), 1, "new revision remains ready for delivery");
      },
    );
    await t.test(
      "successful sends, leases, transient retry and expired subscriptions",
      async () => {
        const sent: string[] = [];
        const sender = async (_sub: unknown, body: string) => {
          sent.push(body);
        };
        await Promise.all([flushPushQueue(sender), flushPushQueue(sender)]);
        assert.equal(sent.length, 1);
        assert.equal(await count("push_deliveries"), 0);
        assert.equal(await enqueuePushTest(cookie), "queued");
        assert.equal(await enqueuePushTest(cookie), "rate_limited");
        const now = Date.now();
        await flushPushQueue(async () => {
          throw { statusCode: 503 };
        }, now);
        assert.equal(await count("push_deliveries"), 1);
        await flushPushQueue(sender, now + 1000);
        assert.equal(sent.length, 1, "backoff prevents immediate retries");
        await flushPushQueue(sender, now + 61000);
        assert.equal(sent.length, 2);
        await db().execute("UPDATE push_subscriptions SET last_test_at = 0");
        assert.equal(await enqueuePushTest(cookie), "queued");
        await flushPushQueue(async () => {
          throw { statusCode: 410 };
        });
        assert.equal(await count("push_subscriptions"), 0);
        assert.equal(await count("push_deliveries"), 0);
        await savePushSubscription(cookie, first, keys.publicKey);
        await enqueuePushTest(cookie);
        await flushPushQueue(async () => {
          throw { statusCode: 404 };
        });
        assert.equal(await count("push_subscriptions"), 0);
        await savePushSubscription(cookie, first, keys.publicKey);
        await enqueuePushTest(cookie);
        await flushPushQueue(sender, Date.now() + 86400001);
        assert.equal(
          await count("push_deliveries"),
          0,
          "stale messages expire",
        );
        assert.equal(sent.length, 2);
        await enqueuePushTest(otherCookie);
        assert.equal(
          await count("push_deliveries"),
          0,
          "unsubscribed browser gets no test",
        );
      },
    );
    await t.test(
      "renewal and unsubscribe remove only the browser's jobs",
      async () => {
        await savePushSubscription(otherCookie, second, keys.publicKey);
        await db().execute("UPDATE push_subscriptions SET last_test_at = 0");
        await enqueuePushTest(cookie);
        await enqueuePushTest(otherCookie);
        await savePushSubscription(
          cookie,
          subscription("renewed"),
          keys.publicKey,
        );
        assert.equal(await count("push_subscriptions"), 2);
        assert.equal(await count("push_deliveries"), 1);
        await removePushSubscriptions(cookie);
        assert.equal(await count("push_subscriptions"), 1);
        assert.equal(await count("push_deliveries"), 1);
        await removePushSubscriptions(otherCookie);
        assert.equal(await count("push_deliveries"), 0);
      },
    );
    await t.test(
      "key generator preserves settings and refuses key replacement",
      async () => {
        const { generateVapidFile } =
          await import("../scripts/generate-vapid.mjs");
        const file = path.join(directory, ".env");
        await writeFile(
          file,
          "INGEST_SECRET=existing\nVAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_SUBJECT=\n",
        );
        await generateVapidFile(file);
        const saved = await readFile(file, "utf8");
        assert.match(saved, /INGEST_SECRET=existing/);
        assert.match(saved, /^VAPID_PUBLIC_KEY=\S+/m);
        assert.equal((saved.match(/^VAPID_SUBJECT=/gm) ?? []).length, 1);
        await assert.rejects(generateVapidFile(file), /already exist/);
        assert.equal(await readFile(file, "utf8"), saved);
      },
    );
  } finally {
    db().close();
    await rm(directory, { recursive: true, force: true });
  }
});
