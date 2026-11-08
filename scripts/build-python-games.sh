#!/usr/bin/env bash
# Builds every Python game for the browser with pygbag.
#   games/<id>/src/main.py   <- the game (edit this; it also runs on the desktop: python main.py)
#   games/<id>/web/          <- generated build that the arcade serves (commit it so Docker needs no pygbag)
# Usage: scripts/build-python-games.sh [game-id ...]     (default: all games that have src/main.py)
set -euo pipefail
cd "$(dirname "$0")/.."
SHARED=shared; [ -d shared ] || SHARED=server/shared      # the shared folder may live at the root or inside server/
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
  if [ -f "games/$id/src/arcade_web.py" ]; then
    cp "$SHARED/python/arcade_web.py" "games/$id/src/arcade_web.py"
    if [ -f "games/$id/src/paper_style.py" ]; then       # Notebook Paper helper + its fonts
      cp "$SHARED/python/paper_style.py" "games/$id/src/paper_style.py"
      mkdir -p "games/$id/src/fonts"
      cp "$SHARED/python/fonts/"* "games/$id/src/fonts/"
    fi
  fi
  rm -rf "games/$id/src/build" "games/$id/web"
  "$PYGBAG" --build "games/$id/src" > "games/$id/src/.build.log" 2>&1 || { tail -20 "games/$id/src/.build.log"; exit 1; }
  mkdir -p "games/$id/web"
  cp "games/$id/src/build/web/"* "games/$id/web/"
  # load the runtime from our own server (/pygbag/, see scripts/mirror-pygbag.cjs) instead of the public CDN
  sed -i 's#https://pygame-web.github.io/#/pygbag/#g' "games/$id/web/index.html"
  # match the arcade look: dark page background, real title instead of "src"
  title="$(python3 -c "import json,sys;print(json.load(open('games/$id/manifest.json')).get('title','$id'))")"
  sed -i "s#<title>src</title>#<title>${title}</title>#; s#</head>#<style>html,body{margin:0;background:\#fbfaf4}</style></head>#" "games/$id/web/index.html"
  python3 scripts/fit_pygbag_page.py "games/$id"      # real canvas size + full width (stock pygbag shows a 1x1 canvas, half width, 16:9)
  ! grep -q "pygame-web.github.io" "games/$id/web/index.html" || { echo "CDN reference left in games/$id/web/index.html"; exit 1; }
  rm -rf "games/$id/src/build" "games/$id/src/.build.log"
  echo "   -> games/$id/web/ ($(du -sh "games/$id/web" | cut -f1))"
done
