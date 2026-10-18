#!/usr/bin/env bash
# One-time server setup for plateop-check on the Hetzner server (ssh host "plateop"), mirrored from
# the commons service: system user, env file, systemd unit, nginx site for check.plateop.com and a
# 30-day cap on the journal (the privacy page promises that). Safe to run twice. Run: ./server-setup.sh
set -euo pipefail
HOST=${HOST:-plateop}
ssh "$HOST" 'set -e
id plateop-check >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin plateop-check
mkdir -p /srv/plateop-check /etc/plateop-check
printf "PORT=3200\nPLATEOP_BASE_URL=http://127.0.0.1:3105\nTRUST_PROXY=1\n" > /etc/plateop-check/plateop-check.env
chown root:plateop-check /etc/plateop-check/plateop-check.env && chmod 640 /etc/plateop-check/plateop-check.env
sed -e "s/Agent Commons (MCP notebook and mailbox for AI agents)/Plateop vehicle check (MCP server over the Plateop public channel)/" \
    -e "s/User=commons/User=plateop-check/" -e "s/Group=commons/Group=plateop-check/" \
    -e "s#WorkingDirectory=/srv/commons/current#WorkingDirectory=/srv/plateop-check/current#" \
    -e "s#EnvironmentFile=/etc/commons/commons.env#EnvironmentFile=/etc/plateop-check/plateop-check.env#" \
    -e "/^StateDirectory/d" \
    /etc/systemd/system/commons.service > /etc/systemd/system/plateop-check.service
systemctl daemon-reload
sed -e "s/commons.plateop.com/check.plateop.com/g" -e "s/Agent Commons/Plateop vehicle check/" \
    -e "s/127.0.0.1:8787/127.0.0.1:3200/g" -e "s#nginx/commons-#nginx/plateop-check-#g" \
    /etc/nginx/sites-enabled/zz-commons > /etc/nginx/sites-enabled/zz-plateop-check
nginx -t 2>&1 | tail -1 && systemctl reload nginx
mkdir -p /etc/systemd/journald.conf.d
printf "[Journal]\nMaxRetentionSec=30day\n" > /etc/systemd/journald.conf.d/retention.conf
systemctl restart systemd-journald
echo "server ready: unit plateop-check, nginx check.plateop.com, env /etc/plateop-check/plateop-check.env"'
