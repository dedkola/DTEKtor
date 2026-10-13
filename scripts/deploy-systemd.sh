#!/usr/bin/env bash
# Install as /home/ded/deploy.sh for the existing user deployment timer.
set -euo pipefail
REPO=${DTEKTOR_REPO:-/home/ded/repos/DTEKtor}
STATE=${DTEKTOR_DEPLOY_STATE:-/home/ded/deploy.state}
LOG=${DTEKTOR_DEPLOY_LOG:-/home/ded/deploy.log}
log(){ echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }

# Manual deployments and the timer must not build concurrently.
exec 9>"$STATE.lock"
flock -n 9 || exit 0
cd "$REPO"
export GIT_SSH_COMMAND="ssh -i ${DTEKTOR_DEPLOY_KEY:-/home/ded/.ssh/dtektor_deploy} -o IdentitiesOnly=yes"

git fetch --quiet origin main
REMOTE=$(git rev-parse origin/main)
LAST=$(cat "$STATE" 2>/dev/null || true)

# An unchanged Git commit can still need repair after an unstamped/failed build.
if [ "$REMOTE" = "$LAST" ] && EXPECTED_SHA="$REMOTE" node --input-type=module -e '
  const response = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(10000) });
  const health = await response.json();
  process.exit(response.ok && health.ready && health.buildSha === process.env.EXPECTED_SHA ? 0 : 1);
' >/dev/null 2>&1; then exit 0; fi

log "deploying $REMOTE (last verified: ${LAST:-none})"
if [ "$REMOTE" = "$LAST" ]; then
  # The old marker claims success for a broken build; keep it only as a backup.
  mv "$STATE" "$STATE.unverified"
fi
if ! git merge --ff-only origin/main >>"$LOG" 2>&1; then
  log "ERROR: not a fast-forward; refusing (main diverged)"; exit 1
fi
if ! { npm ci --no-audit --no-fund && DTEKTOR_BUILD_SHA="$REMOTE" npm run build; } >>"$LOG" 2>&1; then
  log "ERROR: app build failed for $REMOTE; state unchanged"; exit 1
fi
sudo /bin/systemctl restart dtektor
log "app restarted with build stamp $REMOTE"

if [ -d "$REPO/collector" ]; then
  if ! (cd "$REPO/collector" && npm ci --no-audit --no-fund) >>"$LOG" 2>&1; then
    log "ERROR: collector dependencies failed; state unchanged"; exit 1
  fi
  systemctl --user restart dtektor-collector
  log "collector restarted"
fi

# Verify the local process, public proxy, collector and screenshots before success.
if ! EXPECTED_SHA="$REMOTE" DTEKTOR_URL=http://127.0.0.1:3000 \
  PUBLIC_URL="${DTEKTOR_PUBLIC_URL:-https://detektor.tkweb.dev}" \
  DEPLOY_WAIT_SECONDS=60 \
  node .github/scripts/verify-production.mjs >>"$LOG" 2>&1; then
  log "ERROR: release verification failed for $REMOTE; state unchanged"; exit 1
fi
printf '%s\n' "$REMOTE" > "$STATE.tmp"
mv "$STATE.tmp" "$STATE"
log "OK verified $REMOTE; app and collector healthy locally and publicly"
