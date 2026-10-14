import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { sameOriginPushRequest } from "../lib/push-request";

test("push origin checks work behind HTTPS termination and on direct connections", () => {
  const proxied = (
    url: string,
    host: string,
    protocol: string,
    origin: string,
  ) =>
    new NextRequest(url, {
      method: "POST",
      headers: {
        host,
        "x-forwarded-proto": protocol,
        origin,
        "sec-fetch-site": "same-origin",
      },
    });
  for (const internalUrl of [
    "http://localhost:3000/api/push",
    "https://localhost:3000/api/push",
    "http://0.0.0.0:3000/api/push",
  ]) {
    assert.equal(
      sameOriginPushRequest(
        proxied(
          internalUrl,
          "detektor.tkweb.dev",
          "https",
          "https://detektor.tkweb.dev",
        ),
      ),
      true,
    );
  }
  assert.equal(
    sameOriginPushRequest(
      proxied(
        "http://localhost:3000/api/push",
        "example.com:8443",
        "https, http",
        "https://example.com:8443",
      ),
    ),
    true,
  );
  assert.equal(
    sameOriginPushRequest(
      proxied(
        "http://localhost:3000/api/push",
        "example.com:443",
        "https",
        "https://example.com",
      ),
    ),
    true,
  );
  assert.equal(
    sameOriginPushRequest(
      new NextRequest("https://example.com/api/push", {
        method: "POST",
        headers: { origin: "https://example.com" },
      }),
    ),
    true,
  );
  assert.equal(
    sameOriginPushRequest(
      new NextRequest("http://localhost:3140/api/push", {
        method: "DELETE",
        headers: { host: "localhost:3140", origin: "http://localhost:3140" },
      }),
    ),
    true,
  );
});

test("proxy-aware push checks still reject cross-site, malformed and spoofed origins", () => {
  const headers = {
    host: "detektor.tkweb.dev",
    "x-forwarded-proto": "https",
    origin: "https://detektor.tkweb.dev",
    "sec-fetch-site": "same-origin",
  };
  const check = (override: Record<string, string>) =>
    sameOriginPushRequest(
      new NextRequest("https://localhost:3000/api/push", {
        method: "POST",
        headers: { ...headers, ...override },
      }),
    );
  for (const origin of [
    "https://evil.test",
    "https://detektor.tkweb.dev.evil.test",
    "http://detektor.tkweb.dev",
    "https://detektor.tkweb.dev:8443",
    "https://localhost:3000",
    "https://detektor.tkweb.dev/path",
    "null",
    "",
  ])
    assert.equal(check({ origin }), false, origin);
  assert.equal(check({ "sec-fetch-site": "cross-site" }), false);
  assert.equal(
    check({ origin: "https://evil.test", "x-forwarded-host": "evil.test" }),
    false,
    "an untrusted forwarded host cannot authorize another site",
  );
  for (const host of [
    "evil.test",
    "detektor.tkweb.dev@evil.test",
    "detektor.tkweb.dev/path",
    "detektor.tkweb.dev, evil.test",
    "",
  ])
    assert.equal(check({ host }), false);
  for (const protocol of ["javascript", "https://", ""])
    assert.equal(check({ "x-forwarded-proto": protocol }), false);
});
