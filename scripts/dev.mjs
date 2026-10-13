import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

export function developmentOptions(args, env) {
  let port = env.PORT || env.APP_PORT || '3000';
  const nextArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' || args[i] === '--port') {
      if (!args[i + 1]) throw new Error('Missing port value');
      port = args[++i];
    } else if (args[i].startsWith('--port=')) port = args[i].slice(7);
    else nextArgs.push(args[i]);
  }
  if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid development port');
  const hostIndex = nextArgs.findIndex(a => a === '-H' || a === '--hostname');
  const host = hostIndex >= 0 ? nextArgs[hostIndex + 1] : nextArgs.find(a => a.startsWith('--hostname='))?.slice(11);
  const localHost = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const webUrl = `http://${localHost.includes(':') ? `[${localHost}]` : localHost}:${port}`;
  return { nextArgs: ['dev', ...nextArgs, '--port', String(port)], webUrl, collectorUrl: env.DTEKTOR_URL || webUrl };
}

export async function assertPortAvailable(url) {
  const endpoint = new URL(url);
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(new Error(`Development port ${endpoint.port} is unavailable (${error.code})`)));
    probe.listen({ host: endpoint.hostname.replace(/^\[|\]$/g, ''), port: Number(endpoint.port), exclusive: true }, () => probe.close(resolve));
  });
}

export async function waitUntilReady(url, { signal, fetchImpl = fetch, timeoutMs = 90000, pause = delay } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetchImpl(new URL('/api/state', url), { signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(2000)]) });
      if (response.ok) { await response.json(); return; }
    } catch { signal?.throwIfAborted(); }
    await pause(250, undefined, { signal });
  }
  throw new Error('Dashboard did not become ready within 90 seconds');
}

export function stopProcessTree(child, force = false) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {});
  } else {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); }
    catch (error) {
      if (error.code === 'ESRCH') return;
      // Some macOS execution environments reject process-group signals. Fall
      // back to the exact descendant tree, using process IDs only (no arguments).
      const signal = force ? 'SIGKILL' : 'SIGTERM';
      let rows = [];
      try { rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number)); } catch { /* Signal the direct child below. */ }
      const descendants = [];
      function visit(parent) {
        for (const [pid, ppid] of rows) if (ppid === parent) { visit(pid); descendants.push(pid); }
      }
      visit(child.pid);
      const group = rows.filter(([, , pgid]) => pgid === child.pid).map(([pid]) => pid);
      for (const pid of new Set([...descendants, ...group, child.pid])) {
        try { process.kill(pid, signal); } catch { /* Already exited or inaccessible. */ }
      }
    }
  }
}

async function main() {
  process.chdir(root);
  process.env.NODE_ENV = 'development';
  nextEnv.loadEnvConfig(root, true);
  const options = developmentOptions(process.argv.slice(2), process.env);
  const controller = new AbortController();
  const processes = new Set();
  const services = new Set();
  const stop = () => { controller.abort(); for (const child of new Set([...processes, ...services])) stopProcessTree(child); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  function start(args, { env = process.env, watchReady = false, service = false } = {}) {
    const child = spawn(process.execPath, args, { cwd: root, env, detached: process.platform !== 'win32',
      stdio: watchReady ? ['inherit', 'pipe', 'inherit'] : 'inherit' });
    processes.add(child);
    if (service) services.add(child);
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    if (watchReady) {
      let output = '';
      child.stdout.on('data', chunk => {
        process.stdout.write(chunk);
        output = (output + chunk).slice(-2000);
        if (output.includes('Ready in')) readyResolve();
      });
    }
    const done = new Promise(resolve => {
      child.once('error', error => { processes.delete(child); resolve({ code: 1, error }); });
      child.once('close', (code, signal) => { processes.delete(child); resolve({ code, signal }); });
    });
    return { child, done, ready };
  }
  async function setup(args) {
    const result = await start(args, { env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_GC: '1' } }).done;
    controller.signal.throwIfAborted();
    if (result.code !== 0) throw new Error('Collector setup failed; see the command output above');
  }
  try {
    await assertPortAvailable(options.webUrl);
    controller.signal.throwIfAborted();
    const expected = JSON.parse(readFileSync(path.join(root, 'collector/package.json'), 'utf8')).dependencies.playwright;
    let installed;
    try { installed = JSON.parse(readFileSync(path.join(root, 'collector/node_modules/playwright/package.json'), 'utf8')).version; } catch { /* First run. */ }
    if (installed !== expected) {
      console.log('[dev] Installing collector dependencies…');
      if (!process.env.npm_execpath) throw new Error('Start development with npm run dev');
      await setup([process.env.npm_execpath, 'ci', '--prefix', 'collector']);
    }
    console.log('[dev] Ensuring Chromium is installed (downloads only missing browsers)…');
    await setup([path.join(root, 'collector/node_modules/playwright/cli.js'), 'install', 'chromium']);
    controller.signal.throwIfAborted();
    const web = start([require.resolve('next/dist/bin/next'), ...options.nextArgs], { watchReady: true, service: true });
    const earlyExit = web.done.then(result => { throw new Error(`Dashboard exited (${result.code ?? result.signal})`); });
    // Only poll after this Next process reports ready; a different listener must
    // never cause collection to start if our requested port is occupied.
    await Promise.race([web.ready, earlyExit]);
    await Promise.race([waitUntilReady(options.webUrl, { signal: controller.signal }), earlyExit]);
    console.log(`[dev] Dashboard ready. Starting collector for ${options.collectorUrl}`);
    const collector = start([path.join(root, 'collector/worker.mjs')], { env: { ...process.env, DTEKTOR_URL: options.collectorUrl }, service: true });
    const result = await Promise.race([web.done, collector.done]);
    if (!controller.signal.aborted) throw new Error(`Development process exited (${result.code ?? result.signal}); stopping both processes`);
  } catch (error) {
    if (!controller.signal.aborted) { console.error(`[dev] ${error.message}`); process.exitCode = 1; }
  } finally {
    const remaining = [...processes];
    stop();
    const force = setTimeout(() => [...new Set([...processes, ...services])].forEach(child => stopProcessTree(child, true)), 5000);
    force.unref();
    await Promise.all(remaining.map(child => new Promise(resolve => child.once('close', resolve))));
    clearTimeout(force);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
