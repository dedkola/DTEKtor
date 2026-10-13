import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentOptions, waitUntilReady, assertPortAvailable } from './dev.mjs';

test('CLI port overrides environment and collector follows the web port', () => {
  const options = developmentOptions(['--port', '3109', '--hostname', '0.0.0.0'], { PORT: '3010', APP_PORT: '3011' });
  assert.equal(options.collectorUrl, 'http://127.0.0.1:3109');
  assert.deepEqual(options.nextArgs, ['dev', '--hostname', '0.0.0.0', '--port', '3109']);
  assert.equal(developmentOptions([], { APP_PORT: '3011' }).collectorUrl, 'http://127.0.0.1:3011');
  assert.throws(() => developmentOptions(['-p'], {}), /Missing port/);
  assert.throws(() => developmentOptions(['-p', '0'], {}), /Invalid/);
});
test('collector waits through unsuccessful responses until the database API is ready', async () => {
  let calls = 0;
  await waitUntilReady('http://localhost:3109', { pause: async () => {}, fetchImpl: async url => {
    assert.equal(url.href, 'http://localhost:3109/api/state');
    calls++;
    return { ok: calls === 3, json: async () => ({ address: null }) };
  } });
  assert.equal(calls, 3);
});
test('shutdown cancels readiness waiting instead of starting the collector', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(waitUntilReady('http://localhost', { signal: controller.signal, fetchImpl: async () => { called = true; } }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('development environment files share expanded settings and respect shell overrides', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const path = await import('node:path');
  const directory = await mkdtemp(path.join(tmpdir(), 'dtektor-env-test-'));
  try {
    await writeFile(path.join(directory, '.env'), 'INGEST_SECRET=base\nAPP_PORT=3000\n');
    await writeFile(path.join(directory, '.env.local'), 'INGEST_SECRET=local\nAPP_PORT=3110\nSHOTS_DIR=$PWD/data/test-shots\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import nextEnv from '@next/env';
      nextEnv.loadEnvConfig(process.argv[1], true);
      console.log(JSON.stringify({ secret: process.env.INGEST_SECRET, port: process.env.APP_PORT, shots: process.env.SHOTS_DIR }));
    `, directory], { cwd: process.cwd(), encoding: 'utf8', env: { PATH: process.env.PATH, PWD: directory, NODE_ENV: 'development', APP_PORT: '3111' } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), { secret: 'local', port: '3111', shots: `${directory}/data/test-shots` });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an existing listener blocks startup instead of receiving collector data', async () => {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(assertPortAvailable(`http://127.0.0.1:${server.address().port}`), /unavailable.*EADDRINUSE/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('shutdown removes descendants even when their supervisor has already exited', { skip: process.platform === 'win32' }, async () => {
  const { spawn } = await import('node:child_process');
  const { setTimeout: pause } = await import('node:timers/promises');
  const { stopProcessTree } = await import('./dev.mjs');
  const child = spawn(process.execPath, ['-e', `
    const {spawn}=require('node:child_process');
    const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    grandchild.unref();
    console.log(grandchild.pid);
  `], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  await new Promise(resolve => child.once('close', resolve));
  const pid = Number(output.trim());
  assert.ok(pid > 0);
  try {
    stopProcessTree(child);
    for (let attempt = 0; attempt < 30; attempt++) {
      try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
      await pause(100);
    }
    assert.fail('Descendant process survived shutdown');
  } finally { try { process.kill(pid, 'SIGKILL'); } catch { /* Already stopped. */ } }
});
