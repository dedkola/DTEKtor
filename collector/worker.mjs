import { spawn } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAddresses } from '../config/addresses.mjs';

const script = fileURLToPath(new URL('./check.mjs', import.meta.url));
export function checkAddress(address, shotsDir, deadlineMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, STREET: address.street, HOUSE: address.building,
        SHOT: path.join(shotsDir, `${address.slug}.png`), DEADLINE_MS: String(deadlineMs) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), deadlineMs + 5000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error('Collector process failed or timed out');
        const result = JSON.parse(stdout);
        if (!result.ok) throw new Error(result.error || 'DTEK check failed');
        resolve(result);
      } catch (error) { reject(error); }
    });
  });
}

export async function deliver(result, address, { url, secret, fetchImpl = fetch }) {
  if (result.ok !== true || !Array.isArray(result.today?.offWindows) || !Array.isArray(result.tomorrow?.offWindows)) {
    throw new Error('Incomplete or failed schedule; not submitted');
  }
  const response = await fetchImpl(new URL('/api/ingest', url), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': secret },
    body: JSON.stringify({ ...result, address: { street: address.street, building: address.building } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || (await response.json()).ok !== true) throw new Error('Schedule delivery failed');
}

export async function collectCycle({ addresses, shotsDir, deadlineMs, url, secret,
  check = checkAddress, send = deliver, attempts = 3, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  const statuses = [];
  for (const address of addresses) {
    let error;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const result = await check(address, shotsDir, deadlineMs);
        await send(result, address, { url, secret });
        error = null;
        break;
      } catch (e) {
        error = e;
        if (attempt + 1 < attempts) await pause(2000 * 2 ** attempt);
      }
    }
    statuses.push({ slug: address.slug, ok: !error, checkedAt: new Date().toISOString() });
    console.log(`${new Date().toISOString()} ${address.slug}: ${error ? 'check or delivery failed' : 'collected'}`);
  }
  return statuses;
}

async function main() {
  const addresses = readAddresses();
  const shotsDir = process.env.SHOTS_DIR || path.resolve('data/shots');
  const url = process.env.DTEKTOR_URL || 'http://127.0.0.1:3000';
  const secret = process.env.INGEST_SECRET || '';
  const intervalMs = Number(process.env.COLLECT_INTERVAL_SECONDS || 300) * 1000;
  const deadlineMs = Number(process.env.DEADLINE_MS || 45000);
  if (!Number.isFinite(intervalMs) || intervalMs < 10000 || !Number.isFinite(deadlineMs) || deadlineMs < 5000) throw new Error('Invalid collection interval or deadline');
  await mkdir(shotsDir, { recursive: true });
  do {
    const statuses = await collectCycle({ addresses, shotsDir, deadlineMs, url, secret });
    const temporary = path.join(shotsDir, 'status.json.tmp');
    await writeFile(temporary, JSON.stringify({ completedAt: new Date().toISOString(), intervalMs, addresses: statuses }));
    await rename(temporary, path.join(shotsDir, 'status.json'));
    if (process.argv.includes('--once')) {
      if (statuses.some(s => !s.ok)) process.exitCode = 1;
      return;
    }
    // Await the whole cycle before sleeping: runs cannot overlap in this worker.
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  } while (true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Collector stopped: check configuration and storage permissions'); process.exitCode = 1; });
}
