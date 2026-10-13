import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { readAddresses } from '../config/addresses.mjs';
import { collectCycle, deliver } from './worker.mjs';

const url = process.env.DTEKTOR_URL;
const secret = process.env.INGEST_SECRET;
const shotsDir = process.env.SHOTS_DIR;
assert.ok(url && secret && shotsDir && process.env.EXPECTED_SHA, 'CI environment is required');
const addresses = readAddresses();
const windows = ['16:00-19:30'];
const checkedAt = new Date().toISOString();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const request = (pathname, options = {}) => fetch(new URL(pathname, url), {
  ...options, signal: AbortSignal.timeout(10000),
});
const ingest = (body, authenticated = true) => request('/api/ingest', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(authenticated ? { 'x-ingest-secret': secret } : {}) },
  body: JSON.stringify(body),
});

try {
  // This worker must never scrape DTEK; exercise the packaged browser locally.
  await page.setContent('<main><h1>CI schedule</h1><p>16:00-19:30</p></main>');
  assert.equal(await page.locator('h1').textContent(), 'CI schedule');
  await mkdir(shotsDir, { recursive: true });
  const payload = { ok: true, checkedAt, address: addresses[0], today: { offWindows: windows }, tomorrow: { offWindows: [] } };
  assert.equal((await ingest(payload, false)).status, 401);
  assert.equal((await ingest({ ...payload, tomorrow: undefined })).status, 400);
  assert.equal((await request('/api/state')).status, 200);

  const statuses = await collectCycle({
    addresses, shotsDir, deadlineMs: 5000, url, secret,
    check: async address => {
      await page.screenshot({ path: path.join(shotsDir, `${address.slug}.png`) });
      return { ...payload, today: { offWindows: [await page.locator('p').textContent()] } };
    },
  });
  assert.ok(statuses.every(status => status.ok), 'real HTTP delivery must succeed for every address');
  await writeFile(path.join(shotsDir, 'status.json'), JSON.stringify({ completedAt: new Date().toISOString(), intervalMs: 300000, addresses: statuses }));

  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const health = await response.json();
  assert.equal(health.buildSha, process.env.EXPECTED_SHA);
  assert.equal(health.ready, true);
  assert.equal(health.collection.ok, true);
  assert.deepEqual(health.collection.addresses.map(address => address.slug).sort(), addresses.map(address => address.slug).sort());

  const state = await (await request('/api/state')).json();
  assert.deepEqual(state.today.windows, windows);
  assert.deepEqual(state.tomorrow.windows, []);
  assert.equal(state.collectionProblem, false);
  const activeAddress = { street: state.address.street, building: state.address.building };
  assert.equal((await ingest({ address: activeAddress, checkedAt: new Date(Date.now() + 1000).toISOString(), ok: false })).status, 200);
  const failed = await (await request('/api/state')).json();
  assert.deepEqual(failed.today.windows, windows, 'failed ingest must preserve saved schedules');
  assert.equal(failed.collectionProblem, true);
  const failedHealth = await (await request('/api/health')).json();
  assert.equal(failedHealth.ready, true, 'collection failure must not hide database readiness');
  assert.equal(failedHealth.collection.ok, false);
  await deliver({ ...payload, checkedAt: new Date(Date.now() + 2000).toISOString() }, activeAddress, { url, secret });

  for (const address of addresses) {
    const shot = await request(`/api/screenshot/${address.slug}`);
    assert.equal(shot.status, 200);
    assert.equal(shot.headers.get('content-type'), 'image/png');
    const bytes = new Uint8Array(await shot.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const dashboard = await request('/');
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  for (const address of addresses) assert.ok(html.includes(address.street), 'dashboard must render each configured address');
  console.log('Container smoke passed: Chromium, authentication, ingest, preservation, health, screenshots and dashboard.');
} finally {
  await browser.close();
}
