# Running locally and sharing with other users

v0.1: the Node server and Docker files exist (Docker build **not yet verified**, see `PROGRESS.md`). Docker is the primary path:

```bash
docker compose up --build -d     # http://<this-machine-ip>:8080
docker compose logs -f
docker compose down              # keeps scores; `down -v` deletes them
```

Back up scores: `docker run --rm -v infom4th-arcade_arcade-data:/d -v $PWD:/b alpine cp /d/scores.json /b/` (volume name is `<folder>_arcade-data`).
Change host port: `PORT=3000 docker compose up -d`.

## 1. This machine only

```bash
cd Infom4th_Arcade
npm start                 # → http://localhost:8080
npm start -- --port 3000  # custom port (or PORT=3000 npm start)
```

Requires Node ≥ 20 (Node 26 is installed here). No `npm install` is needed — no dependencies.

## 2. Other people on the same network (LAN / Wi-Fi) — the main goal

```bash
npm run serve:lan         # same as: node server/serve.cjs --host 0.0.0.0 --port 8080
```

The server prints the URLs, e.g. `http://192.168.1.23:8080`. Others open that in a browser.

Checklist:
- Find the address: `ip -4 addr show` (look for the Wi-Fi/ethernet `inet`).
- Firewall (Arch): allow the port, e.g. `sudo ufw allow 8080/tcp` or
  `sudo firewall-cmd --add-port=8080/tcp` — whichever is active (`systemctl status ufw firewalld`).
- Same subnet/VLAN; some guest Wi-Fi networks block device-to-device traffic ("client isolation").
- Use a stable address: DHCP reservation in the router, or hostname via mDNS (`avahi`) → `http://<hostname>.local:8080`.
- Binding to `0.0.0.0` exposes *only* the arcade's static files (the server serves nothing else),
  but anyone on the network can reach it — fine for a trusted LAN.

## 3. Keep it running (optional, Linux)

`systemd` user service, e.g. `~/.config/systemd/user/infom4th-arcade.service`:

```ini
[Unit]
Description=InfoM4th Arcade
After=network-online.target

[Service]
WorkingDirectory=%h/Documents/Projects/Infom4th_Projects/Infom4th_Arcade
ExecStart=/usr/bin/env node server/serve.cjs --host 0.0.0.0 --port 8080
Restart=on-failure

[Install]
WantedBy=default.target
```

Then `systemctl --user enable --now infom4th-arcade`. (Node is installed through Volta here, so
use the absolute path from `which node` in `ExecStart` if `env` cannot find it.)

## 4. Container (primary)

`Dockerfile` (node:22-alpine, runs `server/serve.cjs`, non-root, healthcheck on `/api/games`) copies `server/`,
`hub/`, `shared/`, `games/`; `compose.yaml` maps `${PORT:-8080}:8080` and mounts volume `arcade-data` at `/data`.
No nginx is needed: the leaderboard API lives in the same Node process. Docker is not installed on the dev machine,
so this is untested until someone builds it.

## 5. Public internet (optional, later)

| Method | When |
|---|---|
| Tunnel (`cloudflared tunnel`, `ngrok`, Tailscale Funnel) | Temporary sharing from this machine without opening router ports |
| Railway / Fly / any container host | Doom already ships a Railway recipe — reuse the Dockerfile |
| Static hosts (Vercel/Netlify/Cloudflare Pages) | Works because the arcade is static; point at the repo root with output dir = built static bundle. Flappy's `vercel.json` shows the pattern |

Before going public: add rate limiting/CDN if needed, keep GPL/Freedoom notices visible,
and decide on a shared-leaderboard backend only if you really want one (it is the first thing
that needs a real server, storage and abuse protection).

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Others cannot connect | server bound to 127.0.0.1; firewall; client isolation |
| Doom stays on loading screen | `.wasm` served with wrong MIME; blocked by a proxy |
| Game ignores keys | iframe not focused; click the game once |
| No sound | autoplay policy — needs a click/tap first |
| Python port stuck loading | pygbag runtime CDN unreachable (offline LAN) |
| Scores "disappeared" | different origin/port/hostname = different localStorage |
| Menu shows stale list | `hub/games.json` not rebuilt: `npm run build-registry` |
