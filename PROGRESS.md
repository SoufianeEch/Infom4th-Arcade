# Progress log

Single place that tracks what is done, what is verified, and what is next.
Newest entries on top. Update this file with every change.

## Current state — v0.1 (first working version, unstyled)

**Works and verified (automated):**
- Node server (`server/serve.cjs`, zero deps): static hosting, MIME incl. `.wasm`, ETag/304, path-traversal guard.
- `GET /api/games` — built from `games/*/manifest.json` on every request (no registry build step).
- Shared leaderboard: `GET /api/scores/:id`, `POST /api/scores` (best score per name, top 10 returned,
  100 stored per game, persisted to `DATA_DIR/scores.json`, atomic write).
- Validation: name `1-12 [A-Za-z0-9 _.-]`, integer score `1..manifest.scoring.max`, body ≤ 1 KB, 10 posts/min per IP.
- Games: **Flappy** (reports final score to the hub) and **Doom** (no score).
- `npm test`: 24 tests pass (6 server + 15 Flappy engine + subtests). `npm run check` validates manifests.
- Live smoke test with curl: games list, score post/read, 28 MB WAD served.

**Written but NOT verified:**
- Docker image / compose (`Dockerfile`, `compose.yaml`): Docker is not installed on this machine. Syntax follows the
  standard pattern but it has never been built. First thing to do on a machine with Docker: `docker compose up --build`.
- Hub in a real browser (menu → iframe → postMessage → leaderboard refresh). Code is written, not click-tested.
- Doom inside the hub iframe (it works standalone upstream; the iframe path is untested).
- Phone/LAN access.

**Not done yet:**
- Python games (Code Snake, Flashcard Sniper, PyRacer) — need porting, see `docs/PORTING_PYTHON_GAMES.md`.
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

### 2026-11-07 — v0.1
- Copied Flappy `dist/` → `games/flappy/` (tests moved to `games/flappy/tests/`, require path fixed to `../engine.js`).
- Copied Doom `index.html`, `runtime/`, `theme/` → `games/doom/` (35 MB). Not copied: `server.js`, `Dockerfile`, `nginx/`, `prototype.html`, `setup-game.js` (superseded by the arcade server).
- **Only edit made inside a game:** `games/flappy/game.js` — added `reportScore()` (postMessage to the parent) called from `finishFlight()`. No-op outside the hub.
- Added `server/`, `hub/`, `scripts/check.cjs`, `tests/server.test.cjs`, `package.json`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `.gitignore`.
- Fixed while building: oversized POST bodies now answer 413 instead of dropping the connection; rate limit is configurable for tests.
- Original READMEs kept as `games/*/README.original.md` (they describe the old standalone setup).

## Known limits / things to remember

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
4. Python games: pygbag spike with Code Snake, then decide pygbag vs JS rewrite (`docs/PORTING_PYTHON_GAMES.md`).
5. Styling pass (reuse tokens in `docs/ARCHITECTURE.md`).
6. `scripts/new-game.cjs` scaffold + `templates/game/`.
