import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCycle, deliver } from './worker.mjs';

const address = { street: 'Test', building: '1', slug: 'test' };
const result = { ok: true, today: { offWindows: [] }, tomorrow: { offWindows: [] } };

test('failed or incomplete scrape is never sent to ingest', async () => {
  let sent = false;
  for (const bad of [{ ok: false }, { ok: true, today: { offWindows: [] } }]) {
    await assert.rejects(deliver(bad, address, { url: 'http://localhost', secret: 'test', fetchImpl: () => { sent = true; } }));
  }
  assert.equal(sent, false);
});
test('delivery authenticates and replaces string address with API address object', async () => {
  await deliver(result, address, { url: 'http://dtektor:3000', secret: 'test', fetchImpl: async (url, options) => {
    assert.equal(url.href, 'http://dtektor:3000/api/ingest');
    assert.equal(options.headers['x-ingest-secret'], 'test');
    assert.deepEqual(JSON.parse(options.body).address, { street: 'Test', building: '1' });
    return { ok: true, json: async () => ({ ok: true }) };
  } });
});
test('retry exhausted delivery reports failure and continues with next address sequentially', async () => {
  const calls = [];
  let active = 0;
  const statuses = await collectCycle({ addresses: [address, { ...address, slug: 'second' }], attempts: 2, pause: async () => {},
    check: async a => { active++; assert.equal(active, 1); calls.push(a.slug); active--; return result; },
    send: async (_, a) => { if (a.slug === 'test') throw new Error('offline'); },
  });
  assert.deepEqual(calls, ['test', 'test', 'second']);
  assert.deepEqual(statuses.map(s => s.ok), [false, true]);
});
