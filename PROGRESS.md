# Progress log

Single place that tracks what is done, what is verified, and what is next.
Newest entries on top. Update this file with every change.

## Current state — v0.2 (unstyled): Flappy, Doom, Code Snake (Python) + shared leaderboard

**Works and verified (automated):**
- Node server (`server/serve.cjs`, zero deps): static hosting, MIME incl. `.wasm`, ETag/304, path-traversal guard.
- `GET /api/games` — built from `games/*/manifest.json` on every request (no registry build step).
- Shared leaderboard: `GET /api/scores/:id`, `POST /api/scores` (best score per name, top 10 returned,
  100 stored per game, persisted to `DATA_DIR/scores.json`, atomic write).
- Validation: name `1-12 [A-Za-z0-9 _.-]`, integer score `1..manifest.scoring.max`, body ≤ 1 KB, 10 posts/min per IP.
- Games: **Flappy** and **Code Snake** (both report final score to the hub) and **Doom** (no score).
- **Code Snake stays Python** (`games/code-snake/src/main.py`, from `Prj-00/game_v2.py`), compiled for the browser with **pygbag** (`npm run build:py` -> `games/code-snake/web/`, committed). Same file still runs on the desktop. 6 Python tests (`npm run test:py`) + the build succeeds + the server serves the build. See `games/code-snake/README.md`.
- `npm test`: 24 tests pass (server + Flappy engine); `npm run test:py`: 6 pass. `npm run check` validates manifests.
- Live smoke test with curl: games list, score post/read, 28 MB WAD served.

**Written but NOT verified:**
- Docker image / compose (`Dockerfile`, `compose.yaml`): Docker is not installed on this machine. Syntax follows the
  standard pattern but it has never been built. First thing to do on a machine with Docker: `docker compose up --build`.
- **Code Snake in a browser**: the pygbag build compiles and is served, but nobody has loaded it yet (iframe sizing, keyboard focus, audio, postMessage score). Needs internet on first load: the pygbag runtime comes from pygame-web.github.io (self-hosting it is a TODO).
- Hub in a real browser (menu → iframe → postMessage → leaderboard refresh). Code is written, not click-tested.
- Doom inside the hub iframe (it works standalone upstream; the iframe path is untested).
- Phone/LAN access.

**Not done yet:**
- Remaining Python games: Flashcard Sniper (`Prj-00/game_v0.py`) and the typing race (`Prj-00/typing_race_mvp/`; the bigger `typing_race/` folder is no longer in `Prj-00`). Same pygbag recipe.
- Any styling (deliberately skipped for v0).
- Anti-cheat: scores come from the browser, so anyone can post a fake score up to `scoring.max`. Fine for a club arcade; see "Known limits".

## Decisions (changed from the first plan)

| Date | Decision |
|---|---|
| 2026-11-07 | Scores are a **shared leaderboard** (server-side), not per-device. |
| 2026-11-07 | **Docker** is the primary way to run/deploy; plain `npm start` stays for development. |
| 2026-11-07 | v0 is **unstyled**; style later. |
| 2026-11-07 | Game list is read from manifests at request time; no `games.json` build step. |
| 2026-11-07 | Originals are **copied**, not moved: `../infom4th-doom`, `../infom4th-game`, `../Prj-00` are untouched. |

## Change log

### 2026-11-07 — v0.2
- Fix from first real-browser log: Code Snake stuck loading because of the `localhost` dev-mode quirk above; added redirect + test (7 server tests).
- Briefly built Code Snake as a JavaScript rewrite; **reverted** because the goal is to keep games in Python (itch.io style). The JS version was deleted (never committed).
- Added `games/code-snake/` = Python source + pygbag web build. Edits to `main.py` (all behind `WEB = sys.platform == "emscripten"`): async main loop, localStorage scores, bundled-font fallback, score report + exit via `postMessage`, tap/swipe input; in-game name prompt skipped on the web (hub name is used).
- Added `scripts/build-python-games.sh` (+ `requirements-dev.txt`, `.venv/` git-ignored), `npm run build:py`, `npm run test:py`.
- Server test now expects three games.

### 2026-11-07 — v0.1
- Copied Flappy `dist/` → `games/flappy/` (tests moved to `games/flappy/tests/`, require path fixed to `../engine.js`).
- Copied Doom `index.html`, `runtime/`, `theme/` → `games/doom/` (35 MB). Not copied: `server.js`, `Dockerfile`, `nginx/`, `prototype.html`, `setup-game.js` (superseded by the arcade server).
- **Only edit made inside a game:** `games/flappy/game.js` — added `reportScore()` (postMessage to the parent) called from `finishFlight()`. No-op outside the hub.
- Added `server/`, `hub/`, `scripts/check.cjs`, `tests/server.test.cjs`, `package.json`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `.gitignore`.
- Fixed while building: oversized POST bodies now answer 413 instead of dropping the connection; rate limit is configurable for tests.
- Original READMEs kept as `games/*/README.original.md` (they describe the old standalone setup).

## Known limits / things to remember

- **pygbag + hostname `localhost`:** the pygbag runtime thinks `localhost` is its own dev server and fetches packages from `localhost:<port>/cdn/` (404/refused, game never starts — seen in a real browser log). The server now 302-redirects `localhost` to `127.0.0.1`; LAN IPs and real domains were never affected. Side effect: browser storage for `localhost` and `127.0.0.1` is separate.

- Scores are client-reported: not cheat-proof. Mitigations in place: range cap, rate limit, name rules. Real fix would need server-side game simulation, not planned.
- Rate limit uses the socket address; behind a reverse proxy every user looks like one IP (then add `X-Forwarded-For` handling).
- One name = one leaderboard row per game (case-insensitive); anyone can type any name (no accounts).
- `no-cache` + ETag everywhere: files revalidate on each load (cheap 304s); no long-term caching yet.
- Flappy can report twice in one run (after a second-chance toss); the server keeps the higher one.
- Flappy's coin wallet / personal best still live in browser localStorage (per device) — only the leaderboard is shared.

## Next steps (in order)

1. On a machine with Docker: `docker compose up --build`, open `http://localhost:8080`, verify, record the result here.
2. Click-test the hub in a browser: menu → Flappy → play → crash → leaderboard updates; then Doom; test on a phone over LAN.
3. Commit the first version.
4. Click-test Code Snake in the hub; then add Flashcard Sniper and the typing race the same way (copy to `games/<id>/src/main.py`, guard web differences, `npm run build:py`).
5. Self-host the pygbag runtime so LAN play works offline.
6. Styling pass (reuse tokens in `docs/ARCHITECTURE.md`).
7. `scripts/new-game.cjs` scaffold + `templates/game/`.
