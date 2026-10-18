# plateop-check-mcp

A remote MCP server (Streamable HTTP, stateless) that gives AI agents the free facts about a used car from Plateop: register data, inspection due date, odometer verdict, insurance, inspection findings and recalls, each with source and as-of date. It is a thin layer over Plateop's public JSON channel (`GET /api/rapport/kenteken/{plate}`, `GET /open/model/<brand>/<model>.json`). It has no data layer, no cache, no database and no accounts.

Revenue model: every `vehicle_check` answer ends with a link for a person to the paid report (4.95 euro in the Netherlands) on the country host, `https://<host>.plateop.com/analyse/nieuw`, without the plate in the URL. An `Authorization` header sent by the agent is passed to the app unchanged, so a paid tier later needs no change here.

Deployment: `./server-setup.sh` once, then `./deploy.sh`. Published in the MCP Registry as `com.plateop/plateop-check` 0.1.0 (18 Oct 2026); a new version needs a version bump, `mcp-publisher login http` and `mcp-publisher publish` (see agent-commons docs/VINDBAARHEID.md).

## Tools

| Tool | What it does | Plateop call |
|---|---|---|
| `vehicle_check(plate, country, language?)` | Facts per heading as text, raw JSON as `structuredContent`, then the paid-report line | `/api/rapport/kenteken/{plate}?taal=` |
| `model_inspection_stats(brand, model, country, language?)` | Per source and age band the 3 most frequent inspection points (the app lists all 300; the answer links to the full JSON), with the citation line | `/open/model/<brand-slug>/<model-slug>.json` |

Countries: `nl` (host nederland), `gb` (uk), `il` (israel), `is` (island), `dk` (danmark). Each call sends `Host` and `X-Forwarded-Host: <host>.plateop.com` (the app reads `Host`; node:http is used because fetch cannot set it), `X-Real-IP` and `X-Forwarded-For` with the agent's IP, and the agent's `Authorization` header if there is one. Timeout 10 s. App errors (400, 404, 429 with Retry-After, 502, 503) become one plain sentence for the agent.

Routes: `POST /mcp`, `GET /` (text), `/llms.txt` (guide), `/health`, `/privacy`, `/icon.svg`, `/.well-known/mcp/server-card.json`. `server.json` is for the MCP Registry (`com.plateop/plateop-check`).

Left out on purpose: `compare_models`. The app's `/open/vergelijk/<pair>.json` only answers for a short frozen list of model pairs on nl, gb and cz, with no way to list them, so a tool would mostly return "not found". Add it when agents ask for it.

## Limits (per hashed IP, in memory)

`vehicle_check` 20 per 10 minutes and 100 per day (the same as the app's own limit); model tool 60 per minute; plain GET routes 600 per hour. No timers, no disk: stale windows are pruned on use and everything resets on restart.

## Environment variables

| Variable | Meaning |
|---|---|
| `PORT` | Listen port, default 3200 |
| `PLATEOP_BASE_URL` | The Plateop app, default and production value `http://127.0.0.1:3105` |
| `TRUST_PROXY` | `1` behind nginx: read the caller's IP from `X-Real-IP` / `X-Forwarded-For` |
| `IP_SALT` | Optional. Salt of the IP hash; unset means random per start (limits and the hash in the log reset on restart) |

There is no `DATA_DIR`: nothing is written to disk.

## Run

```bash
npm install
npm test        # vitest against a fake Plateop (test/fakePlateop.ts); no real calls
npm run build
PLATEOP_BASE_URL=http://127.0.0.1:3105 TRUST_PROXY=1 npm start
```

## Rollout (nothing of this has been done)

1. On the server: `useradd --system plateop-check`, `mkdir -p /srv/plateop-check /etc/plateop-check`, env file `/etc/plateop-check/plateop-check.env` (`root:plateop-check`, mode 640) with `PORT=3200`, `PLATEOP_BASE_URL=http://127.0.0.1:3105`, `TRUST_PROXY=1`.
2. systemd unit `plateop-check` (like `commons`): `ExecStart=/usr/bin/node /srv/plateop-check/current/dist/index.js`, `EnvironmentFile=`, `User=plateop-check`, `Restart=on-failure`.
3. nginx site `zz-plateop-check` for `check.plateop.com` behind Cloudflare, like `zz-commons`: `proxy_pass http://127.0.0.1:3200`, `proxy_set_header X-Real-IP $remote_addr` (or the Cloudflare IP module's value), `X-Forwarded-Proto`, `Host`. No DNS change: `*.plateop.com` already points at the server.
4. The privacy page promises that the journal keeps the call log for at most 30 days: set `MaxRetentionSec=30day` in `/etc/systemd/journald.conf` (or change the sentence in `src/privacy.ts`).
5. `./deploy.sh`, then `curl https://check.plateop.com/health`, then one `vehicle_check` with an MCP client.
6. Publish `server.json` to the MCP Registry under `com.plateop`.
7. After 30 days count calls per tool and per shortened hash: `journalctl -u plateop-check | grep tool=`.
