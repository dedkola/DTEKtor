import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/deploy-systemd.sh', import.meta.url));
const sha = 'a'.repeat(40);

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'dtektor-deploy-test-'));
  const bin = path.join(directory, 'bin');
  const repo = path.join(directory, 'repo');
  await mkdir(bin);
  await mkdir(path.join(repo, 'collector'), { recursive: true });
  const commands = {
    git: 'if [ "$1" = rev-parse ]; then echo "$TEST_SHA"; fi',
    // Lock behavior is exercised by flock on the production host, not this stub.
    flock: 'exit 0',
    npm: 'if [ "$1" = run ]; then echo "$DTEKTOR_BUILD_SHA" > "$TEST_DIRECTORY/build-sha"; exit "${TEST_BUILD_FAIL:-0}"; fi',
    sudo: 'echo restart >> "$TEST_DIRECTORY/restarts"',
    systemctl: 'exit 0',
    node: 'if [ "$1" = --input-type=module ]; then exit "${TEST_HEALTH_FAIL:-1}"; fi; echo "$EXPECTED_SHA" > "$TEST_DIRECTORY/verified-sha"; exit "${TEST_VERIFY_FAIL:-0}"',
  };
  for (const [name, body] of Object.entries(commands)) {
    await writeFile(path.join(bin, name), `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 });
  }
  const state = path.join(directory, 'state');
  const env = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_DIRECTORY: directory, TEST_SHA: sha,
    DTEKTOR_REPO: repo, DTEKTOR_DEPLOY_STATE: state, DTEKTOR_DEPLOY_LOG: path.join(directory, 'log'),
  };
  return {
    directory, state,
    run: overrides => execFileSync('bash', [script], { env: { ...env, ...overrides } }),
    read: name => readFile(path.join(directory, name), 'utf8'),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test('unchanged but unstamped release is rebuilt, stamped and verified before success', async () => {
  const f = await fixture();
  try {
    await writeFile(f.state, `${sha}\n`);
    f.run();
    assert.equal((await f.read('build-sha')).trim(), sha);
    assert.equal((await f.read('verified-sha')).trim(), sha);
    assert.equal((await f.read('state')).trim(), sha);
    assert.equal((await f.read('state.unverified')).trim(), sha);
    f.run({ TEST_HEALTH_FAIL: '0' });
    assert.equal((await f.read('restarts')).trim(), 'restart', 'healthy unchanged release must not restart');
  } finally { await f.cleanup(); }
});

test('failed build or verification cannot advance deployment state', async () => {
  for (const failure of [{ TEST_BUILD_FAIL: '1' }, { TEST_VERIFY_FAIL: '1' }]) {
    const f = await fixture();
    try {
      await writeFile(f.state, 'previous-release\n');
      assert.throws(() => f.run(failure));
      assert.equal(await f.read('state'), 'previous-release\n');
    } finally { await f.cleanup(); }
  }
});

test('failed repair removes a misleading marker so the next timer run retries', async () => {
  const f = await fixture();
  try {
    await writeFile(f.state, `${sha}\n`);
    assert.throws(() => f.run({ TEST_VERIFY_FAIL: '1' }));
    await assert.rejects(f.read('state'), { code: 'ENOENT' });
    f.run({ TEST_HEALTH_FAIL: '0' });
    assert.equal((await f.read('state')).trim(), sha);
    assert.equal((await f.read('restarts')).trim().split('\n').length, 2);
  } finally { await f.cleanup(); }
});
