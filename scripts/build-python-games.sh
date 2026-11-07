#!/usr/bin/env bash
# Builds every Python game for the browser with pygbag.
#   games/<id>/src/main.py   <- the game (edit this; it also runs on the desktop: python main.py)
#   games/<id>/web/          <- generated build that the arcade serves (commit it so Docker needs no pygbag)
# Usage: scripts/build-python-games.sh [game-id ...]     (default: all games that have src/main.py)
set -euo pipefail
cd "$(dirname "$0")/.."
PYGBAG=".venv/bin/pygbag"
if [ ! -x "$PYGBAG" ]; then
  echo "Creating .venv and installing pygbag + pygame-ce (needs internet)..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements-dev.txt
fi
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  for d in games/*/; do [ -f "${d}src/main.py" ] && ids+=("$(basename "$d")"); done
fi
for id in "${ids[@]}"; do
  echo "== building $id"
  rm -rf "games/$id/src/build" "games/$id/web"
  "$PYGBAG" --build "games/$id/src" > "games/$id/src/.build.log" 2>&1 || { tail -20 "games/$id/src/.build.log"; exit 1; }
  mkdir -p "games/$id/web"
  cp "games/$id/src/build/web/"* "games/$id/web/"
  rm -rf "games/$id/src/build" "games/$id/src/.build.log"
  echo "   -> games/$id/web/ ($(du -sh "games/$id/web" | cut -f1))"
done
