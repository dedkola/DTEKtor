import test from "node:test";
import assert from "node:assert/strict";
import { createLiveStream } from "../lib/live-stream";

const decode = (value: Uint8Array | undefined) => new TextDecoder().decode(value);

test("stream sends initial revision, heartbeats, changes and reconnect baseline", async () => {
  let revision = "first";
  const abort = new AbortController();
  const readRevision = async () => revision;
  const reader = createLiveStream(abort.signal, readRevision, 5).getReader();
  assert.match(decode((await reader.read()).value), /retry: 3000/);
  assert.equal(decode((await reader.read()).value), "event: revision\ndata: first\n\n");
  assert.equal(decode((await reader.read()).value), "event: heartbeat\ndata: {}\n\n");
  revision = "second";
  assert.equal(decode((await reader.read()).value), "event: revision\ndata: second\n\n");
  abort.abort();
  assert.equal((await reader.read()).done, true);

  const reconnect = createLiveStream(new AbortController().signal, readRevision, 5).getReader();
  await reconnect.read();
  assert.match(decode((await reconnect.read()).value), /data: second/);
  await reconnect.cancel();
});

test("cancellation releases polling even with a read in progress", async () => {
  let calls = 0;
  let resolve!: (revision: string) => void;
  const stream = createLiveStream(new AbortController().signal, () => {
    calls++;
    return new Promise<string>(done => { resolve = done; });
  }, 5);
  const reader = stream.getReader();
  await reader.read();
  await new Promise(done => setTimeout(done, 20));
  assert.equal(calls, 1, "slow database reads must not overlap");
  await reader.cancel();
  resolve("late");
  await new Promise(done => setTimeout(done, 20));
  assert.equal(calls, 1, "no reads after disconnect");
});

test("read failures and already aborted requests close cleanly", async () => {
  const reader = createLiveStream(new AbortController().signal, async () => {
    throw new Error("database unavailable");
  }).getReader();
  await reader.read();
  assert.equal((await reader.read()).done, true);
  const abort = new AbortController();
  abort.abort();
  let calls = 0;
  const aborted = createLiveStream(abort.signal, async () => { calls++; return "unused"; }).getReader();
  assert.equal((await aborted.read()).done, true);
  assert.equal(calls, 0);
});
