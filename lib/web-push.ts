import { ECDH, randomUUID } from "node:crypto";
import webpush, { type PushSubscription, type RequestOptions } from "web-push";
import { databaseWrite, db, ensureSchema } from "./db";
import { type PushMessage } from "./schedule-change";

export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  try {
    // Validate configuration before presenting an enabled notification control.
    webpush.getVapidHeaders(
      "https://fcm.googleapis.com",
      subject,
      publicKey,
      privateKey,
      "aes128gcm",
    );
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}

const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];

/** Endpoints are user input: never let this API become a server-side HTTP proxy. */
export function parsePushSubscription(input: unknown): PushSubscription | null {
  if (!input || typeof input !== "object") return null;
  const value = input as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 2048 ||
    typeof value.keys?.p256dh !== "string" ||
    typeof value.keys.auth !== "string"
  )
    return null;
  try {
    const endpoint = new URL(value.endpoint);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      !PUSH_HOSTS.includes(endpoint.hostname)
    )
      return null;
    const { p256dh, auth } = value.keys;
    if (!/^[\w-]+={0,2}$/.test(p256dh) || !/^[\w-]+={0,2}$/.test(auth))
      return null;
    const key = Buffer.from(p256dh, "base64url");
    if (
      key.length !== 65 ||
      key[0] !== 4 ||
      Buffer.from(auth, "base64url").length !== 16
    )
      return null;
    ECDH.convertKey(key, "prime256v1");
    return { endpoint: value.endpoint, keys: { p256dh, auth } };
  } catch {
    return null;
  }
}

export async function savePushSubscription(
  cookieId: string,
  subscription: PushSubscription,
  publicKey: string,
) {
  await ensureSchema();
  return databaseWrite(async () => {
    // Possession of the endpoint AND its encryption secrets lets a browser recover
    // its own subscription after cookies have been cleared.
    const tx = await db().transaction("write");
    try {
      const result = await tx.execute({
        sql: `INSERT INTO push_subscriptions
    (cookie_id, endpoint, p256dh, auth, vapid_public_key, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET cookie_id = excluded.cookie_id, vapid_public_key = excluded.vapid_public_key
    WHERE push_subscriptions.p256dh = excluded.p256dh AND push_subscriptions.auth = excluded.auth
    RETURNING id`,
        args: [
          cookieId,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          publicKey,
          new Date().toISOString(),
        ],
      });
      if (!result.rows.length) throw new Error("subscription_conflict");
      const id = Number(result.rows[0].id);
      // One subscription per browser. Renewing it also removes old queued deliveries.
      await tx.batch([
        {
          sql: `DELETE FROM push_deliveries WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE cookie_id = ? AND id != ?)`,
          args: [cookieId, id],
        },
        {
          sql: `DELETE FROM push_subscriptions WHERE cookie_id = ? AND id != ?`,
          args: [cookieId, id],
        },
      ]);
      await tx.commit();
    } finally {
      tx.close();
    }
  });
}

export async function removePushSubscriptions(cookieId: string) {
  await ensureSchema();
  await databaseWrite(() =>
    db().batch(
      [
        {
          sql: `DELETE FROM push_deliveries WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE cookie_id = ?)`,
          args: [cookieId],
        },
        {
          sql: `DELETE FROM push_subscriptions WHERE cookie_id = ?`,
          args: [cookieId],
        },
      ],
      "write",
    ),
  );
}

export async function pushSubscriptionForBrowser(cookieId: string) {
  await ensureSchema();
  const result = await db().execute({
    sql: `SELECT endpoint, vapid_public_key FROM push_subscriptions WHERE cookie_id = ? LIMIT 1`,
    args: [cookieId],
  });
  return result.rows[0] ?? null;
}

export async function enqueuePushTest(
  cookieId: string,
): Promise<"queued" | "rate_limited" | "missing"> {
  await ensureSchema();
  return databaseWrite(async () => {
    const tx = await db().transaction("write");
    try {
      const now = Date.now();
      const result = await tx.execute({
        sql: `UPDATE push_subscriptions SET last_test_at = ? WHERE cookie_id = ? AND last_test_at <= ? RETURNING id`,
        args: [now, cookieId, now - 60000],
      });
      if (!result.rows.length) {
        const exists = await tx.execute({
          sql: `SELECT id FROM push_subscriptions WHERE cookie_id = ?`,
          args: [cookieId],
        });
        return exists.rows.length ? "rate_limited" : "missing";
      }
      const message: PushMessage = {
        title: "Уведомления DTEKtor включены",
        body: "Вы получите уведомление, когда график изменится или появится новый график на завтра.",
        tag: "dtektor-test",
        url: "/",
      };
      await tx.execute({
        sql: `INSERT INTO push_deliveries (subscription_id, payload, created_at) VALUES (?, ?, ?)`,
        args: [Number(result.rows[0].id), JSON.stringify(message), now],
      });
      await tx.commit();
      return "queued";
    } finally {
      tx.close();
    }
  });
}

type Sender = (
  subscription: PushSubscription,
  payload: string,
  options: RequestOptions,
) => Promise<unknown>;

/** Durable queue: retries run on subsequent collector submissions, even unchanged ones. */
export async function flushPushQueue(
  send: Sender = webpush.sendNotification.bind(webpush),
  now = Date.now(),
) {
  const configuration = pushConfiguration();
  if (!configuration) return;
  await ensureSchema();
  await databaseWrite(() =>
    db().execute({
      sql: `DELETE FROM push_deliveries WHERE created_at < ? OR attempts >= 5 OR subscription_id NOT IN (SELECT id FROM push_subscriptions WHERE vapid_public_key = ?)`,
      args: [now - 86400000, configuration.publicKey],
    }),
  );
  const lease = randomUUID();
  // The atomic claim prevents concurrent requests/processes sending the same job.
  const claimed = await databaseWrite(() =>
    db().execute({
      sql: `UPDATE push_deliveries SET lease_token = ?, locked_until = ?
    WHERE id IN (SELECT d.id FROM push_deliveries d WHERE d.next_attempt_at <= ? AND d.locked_until <= ?
      AND NOT EXISTS (SELECT 1 FROM push_deliveries active WHERE active.subscription_id = d.subscription_id
        AND json_extract(active.payload, '$.tag') = json_extract(d.payload, '$.tag') AND active.locked_until > ?)
      ORDER BY d.id LIMIT 20)
    RETURNING id, subscription_id, payload, attempts`,
      args: [lease, now + 120000, now, now, now],
    }),
  );
  const jobs = [...claimed.rows];
  // Bound network concurrency and runtime; keep collector responses fast via after().
  await Promise.all(
    Array.from({ length: Math.min(5, jobs.length) }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const jobId = Number(job.id);
        const subscriptionId = Number(job.subscription_id);
        const stored = await db().execute({
          sql: `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE id = ?`,
          args: [subscriptionId],
        });
        const row = stored.rows[0];
        const subscription = row
          ? parsePushSubscription({
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            })
          : null;
        try {
          if (subscription)
            await send(subscription, String(job.payload), {
              vapidDetails: configuration,
              TTL: 3600,
              urgency: "normal",
              timeout: 5000,
            });
          await databaseWrite(() =>
            db().execute({
              sql: `DELETE FROM push_deliveries WHERE id = ? AND lease_token = ?`,
              args: [jobId, lease],
            }),
          );
        } catch (error) {
          const status =
            Number((error as { statusCode?: number })?.statusCode) || 0;
          if (status === 404 || status === 410) {
            await databaseWrite(() =>
              db().batch(
                [
                  {
                    sql: `DELETE FROM push_deliveries WHERE subscription_id = ?`,
                    args: [subscriptionId],
                  },
                  {
                    sql: `DELETE FROM push_subscriptions WHERE id = ?`,
                    args: [subscriptionId],
                  },
                ],
                "write",
              ),
            );
          } else {
            const attempts = Number(job.attempts) + 1;
            await databaseWrite(() =>
              db().execute({
                sql: `UPDATE push_deliveries SET attempts = ?, next_attempt_at = ?, locked_until = 0, lease_token = NULL WHERE id = ? AND lease_token = ?`,
                args: [
                  attempts,
                  now + 60000 * 2 ** (attempts - 1),
                  jobId,
                  lease,
                ],
              }),
            );
            // Do not log capability URLs, encryption keys, payloads or private keys.
            console.warn(
              `Web Push delivery deferred (status ${status || "network"}, attempt ${attempts})`,
            );
          }
        }
      }
    }),
  );
}
