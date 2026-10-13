import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateReadiness(health, expectedSha) {
  assert.equal(health.ready, true, 'database/configuration is not ready');
  assert.equal(health.buildSha, expectedSha, 'running build does not match expected commit');
}

export function validateCollection(health, now = Date.now()) {
  const collection = health.collection;
  assert.equal(collection?.ok, true, 'collector reports a failed or stale check');
  assert.ok(Array.isArray(collection.addresses) && collection.addresses.length > 0, 'no configured addresses reported');
  const slugs = new Set();
  for (const address of collection.addresses) {
    assert.ok(typeof address.slug === 'string' && address.slug && !slugs.has(address.slug), 'invalid or duplicate address status');
    slugs.add(address.slug);
    assert.equal(address.collectionProblem, false, `collection problem: ${address.slug}`);
    const checked = Date.parse(address.checkedAt);
    assert.ok(Number.isFinite(checked) && now - checked <= 15 * 60000 && checked - now <= 60000, `invalid or stale collection timestamp: ${address.slug}`);
  }
}

export async function poll(check, timeoutMs, { pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    try { return await check(); }
    catch (error) {
      if (now() >= deadline) throw error;
      await pause(Math.min(5000, Math.max(0, deadline - now())));
    }
  }
}

async function main() {
  const expectedSha = process.env.EXPECTED_SHA;
  assert.match(expectedSha || '', /^[a-f0-9]{40}$/, 'EXPECTED_SHA must be a full commit SHA');
  const base = new URL(process.env.DTEKTOR_URL || 'http://127.0.0.1:3000');
  assert.ok(['http:', 'https:'].includes(base.protocol));
  const report = async message => {
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
  };
  const readHealth = async () => {
    const response = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    assert.equal(response.status, 200, 'health endpoint did not return HTTP 200');
    const health = await response.json();
    validateReadiness(health, expectedSha);
    return health;
  };
  try {
    if (process.env.SYSTEMD_SERVICE) {
      execFileSync('systemctl', ['is-active', '--quiet', process.env.SYSTEMD_SERVICE], { timeout: 10000 });
      await report('Systemd service: active.');
    }
    await poll(readHealth, 60000);
    const dashboard = await fetch(new URL('/', base), { signal: AbortSignal.timeout(10000) });
    assert.equal(dashboard.status, 200, 'dashboard did not return HTTP 200');
    await report(`Application readiness: passed. Running build: ${expectedSha}.`);
    if (process.env.PUBLIC_URL) {
      const publicUrl = new URL('/api/health', process.env.PUBLIC_URL);
      assert.equal(publicUrl.protocol, 'https:', 'PUBLIC_URL must use HTTPS');
      const response = await fetch(publicUrl, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      assert.equal(response.status, 200, 'public health endpoint did not return HTTP 200');
      validateReadiness(await response.json(), expectedSha);
      await report('Public HTTPS/proxy readiness: passed.');
    }
    const health = await poll(async () => {
      const health = await readHealth();
      validateCollection(health);
      return health;
    }, 360000);
    await report(`Collection: passed for all ${health.collection.addresses.length} configured addresses.`);
  } catch (error) {
    await report(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
