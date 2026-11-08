#!/usr/bin/env bash
# One-command public demo: starts the arcade and opens a free Cloudflare "quick tunnel" to it.
#   npm run demo            (needs `cloudflared`: sudo pacman -S cloudflared)
# Cloudflare prints a random https://<words>.trycloudflare.com address. Share it; press Ctrl+C to stop everything.
# No account or domain needed. The address changes every run. The tunnel supports WebSockets (rooms, Paper Trail).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}"
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. On Arch:  sudo pacman -S cloudflared"
  echo "Other systems: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then echo "Node.js is required."; exit 1; fi
HOST=127.0.0.1 PORT="$PORT" node server/serve.cjs &            # only reachable through the tunnel, not on your Wi-Fi
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT INT TERM
sleep 1
kill -0 "$SERVER" 2>/dev/null || { echo "The arcade did not start (is port $PORT in use? try PORT=8090 npm run demo)."; exit 1; }
echo
echo "Starting the tunnel... look for the https://....trycloudflare.com line below, then share it."
echo "(Scores are saved in ./data/scores.json while you run; rooms live in memory.)"
echo
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate
