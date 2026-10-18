#!/usr/bin/env bash
# DRAFT, not run yet. Deploys plateop-check to the Hetzner server (ssh host "plateop"), same layout as agent-commons.
# Before the first run, make on the server (see README, "Rollout"): user "plateop-check", /srv/plateop-check,
# /etc/plateop-check/plateop-check.env (root:plateop-check), systemd unit "plateop-check" (PORT=3200) and an nginx
# site for check.plateop.com that sets X-Real-IP. Run from the project folder: ./deploy.sh
set -euo pipefail
HOST=${HOST:-plateop}
cd "$(dirname "$0")"
npm test 2>&1 | tail -4
npm run build 2>&1 | tail -2
rsync -az --delete \
  --exclude node_modules --exclude .git \
  ./ "$HOST:/srv/plateop-check/next/"
ssh "$HOST" 'set -e
  cd /srv/plateop-check/next && npm ci --omit=dev 2>&1 | tail -2
  chown -R plateop-check:plateop-check /srv/plateop-check/next
  rm -rf /srv/plateop-check/previous
  [ -d /srv/plateop-check/current ] && mv /srv/plateop-check/current /srv/plateop-check/previous
  mv /srv/plateop-check/next /srv/plateop-check/current
  systemctl enable --now plateop-check >/dev/null 2>&1 || true
  systemctl restart plateop-check
  sleep 1.5
  systemctl is-active plateop-check
  curl -fsS http://127.0.0.1:3200/health; echo'
echo "deployed: https://check.plateop.com"
