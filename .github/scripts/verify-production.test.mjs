import test from 'node:test';
import assert from 'node:assert/strict';
import { poll, validateReadiness, validateCollection } from './verify-production.mjs';

const sha = 'a'.repeat(40);
const now = Date.now();
const healthy = () => ({ ready: true, buildSha: sha, collection: { ok: true, addresses: [
  { slug: 'first', checkedAt: new Date(now).toISOString(), collectionProblem: false },
  { slug: 'second', checkedAt: new Date(now).toISOString(), collectionProblem: false },
] } });

test('a reachable old build cannot pass release verification', () => {
  validateReadiness(healthy(), sha);
  assert.throws(() => validateReadiness({ ...healthy(), buildSha: 'unknown' }, sha));
  assert.throws(() => validateReadiness({ ...healthy(), ready: false }, sha));
});

test('collection checks every address and rejects missing, stale and future data', () => {
  validateCollection(healthy(), now);
  for (const change of [
    address => { address.collectionProblem = true; },
    address => { address.checkedAt = null; },
    address => { address.checkedAt = 'invalid'; },
    address => { address.checkedAt = new Date(now - 16 * 60000).toISOString(); },
    address => { address.checkedAt = new Date(now + 2 * 60000).toISOString(); },
    address => { address.slug = 'first'; },
  ]) {
    const health = healthy();
    change(health.collection.addresses[1]);
    assert.throws(() => validateCollection(health, now));
  }
  assert.throws(() => validateCollection({ collection: { ok: true, addresses: [] } }, now));
  assert.throws(() => validateCollection({ collection: { ok: false, addresses: healthy().collection.addresses } }, now));
});

test('bounded polling retries transient failures and fails at deadline', async () => {
  let time = 0;
  let attempts = 0;
  const clock = { now: () => time, pause: async ms => { time += ms; } };
  assert.equal(await poll(async () => {
    if (++attempts < 3) throw new Error('starting');
    return 'ready';
  }, 10000, clock), 'ready');
  time = 0;
  await assert.rejects(poll(async () => { throw new Error('offline'); }, 10000, clock), /offline/);
  assert.equal(time, 10000);
});
