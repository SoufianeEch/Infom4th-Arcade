# Implementation plan

Status lives in `PROGRESS.md`. Tick boxes here as work proceeds; v0.1 (Phase 1 minus styling, plus leaderboard and Docker files) is built. Each phase leaves the
arcade in a working, demo-able state.

## Target layout

```
Infom4th_Arcade/
├── README.md                  project brief + inventory
├── PLAN.md                    this file
├── package.json               scripts: start, dev, test, check, new-game, build-registry
├── .gitignore  .dockerignore
├── server/
│   └── serve.cjs              generic static server (MIME, wasm, --host/--port, path-safe)
├── hub/                       the arcade menu (the thing at "/")
│   ├── index.html
│   ├── arcade.css             shared theme tokens + menu styles
│   ├── arcade.js              loads games.json, renders cards, launches games
│   ├── player.js              iframe player: fullscreen, exit, keyboard focus
│   └── assets/                logo, card art, fonts
├── shared/                    OPTIONAL helpers games may use (never required)
│   ├── theme.css              colour tokens only
│   ├── storage.js             namespaced localStorage wrapper (safe if blocked)
│   └── arcade-bridge.js       postMessage helpers: ready / exit / score
├── games/
│   ├── flappy/                from infom4th-game/infom4th-runner/dist (+ its tests)
│   ├── doom/                  from infom4th-doom (index.html + runtime/ + theme/)
│   ├── code-snake/            port of Prj-00/game_v2.py
│   ├── flashcard-sniper/      port of Prj-00/game_v0.py
│   └── py-racer/              port of Prj-00/typing_race/
│       └── each has: manifest.json, index.html, README.md, (src/, tests/)
├── scripts/
│   ├── new-game.cjs           scaffolds games/<id>/ from a template
│   └── check.cjs              validates manifests, missing files, id clashes
├── templates/game/            starter game folder used by new-game
├── docs/                      ARCHITECTURE, GAME_CONTRACT, PORTING_PYTHON_GAMES, DEPLOYMENT
├── Dockerfile  compose.yaml   PRIMARY way to run/deploy (volume /data holds scores)
├── data/                      local scores.json when running without Docker (git-ignored)
└── archive/                   (optional) frozen legacy: typing_race_mvp, stubs
```

## Phase 0 — Decisions & safety (before any code)

- [ ] Confirm the four open decisions in `README.md`.
- [ ] `git init` in `Infom4th_Arcade/`; first commit = these planning docs only.
- [ ] **Copy** (not move) sources; originals remain the fallback.
- [ ] Decide `typing_race_mvp` → archive or drop; ignore empty `game_v1/v3`, `test.py`, `main.qml`, `venv/`.

## Phase 1 — Arcade shell + the two web games

Fastest visible result; no porting risk.

- [ ] `server/serve.cjs`: generalise Flappy's `scripts/serve.cjs` (keep realpath
      traversal guard, `nosniff`, GET/HEAD only); add `.wasm`, `.wad`, `.json`, `.css`, `.png`, `.svg`,
      `.ttf`, `.woff2`, `.cfg`, `.txt` MIME types; `--host`, `--port`, `PORT` env; print the LAN URL(s).
- [ ] `hub/`: header with logo, game-card grid, keyboard/gamepad-friendly selection
      (arrows + Enter, click/tap), arcade-style "INSERT COIN / SELECT GAME" feel, in the existing palette.
- [ ] `hub/player.js`: opens a game in an iframe, **← Menu** button, fullscreen toggle, Esc to leave.
- [ ] Copy Flappy (`dist/*` → `games/flappy/`) and Doom (`index.html`, `runtime/`, `theme/` → `games/doom/`).
      Fix any absolute asset paths so they work from `/games/<id>/` (Flappy already uses relative paths).
- [ ] Write `manifest.json` for both; run `build-registry`.
- [ ] Verify both play inside the iframe on desktop and phone (touch controls, audio unlock, focus).

## Phase 2 — Editability tooling

- [x] `scripts/check.cjs` (fail on bad manifest/missing entry file). No registry build: the server reads manifests live.
- [ ] `scripts/new-game.cjs` + `templates/game/` (one-command scaffold).
- [ ] Hub dev mode: refresh picks up new games without a restart; `npm run dev` watches `games/`.
- [ ] Move Flappy's 15 tests into `games/flappy/tests`; root `npm test` runs every game's tests.
- [ ] `docs/GAME_CONTRACT.md` verified against the two real games.

## Phase 3 — Port the Python games (one at a time)

Order = easiest/highest value first. See `docs/PORTING_PYTHON_GAMES.md`.

- [x] **Decision: games stay in Python**, built with pygbag. Build verified; browser check still pending.
- [x] Code Snake → `games/code-snake/` (stays Python, pygbag build; browser-untested)
- [ ] Flashcard Sniper → `games/flashcard-sniper/`
- [ ] PyRacer → `games/py-racer/` (largest; keep modules, add tests that still run on CPython)
- [ ] Replace JSON-file scores with browser storage in each port.
- [ ] Add touch controls where the game needs a keyboard.

## Phase 4 — Polish & hosting for other users

- [ ] Menu extras: per-game best score badge, "last played", tags, search/filter if >8 games.
- [ ] Preload/lazy-load: Doom (~30 MB) must load only when picked.
- [ ] `docs/DEPLOYMENT.md` steps tested: LAN (`--host 0.0.0.0`), firewall, optional systemd unit
      (this machine is Arch Linux), optional Docker/nginx, optional tunnel for public sharing.
- [ ] Caching headers: long cache for hashed/large assets (wasm, wad), `no-cache` for HTML + `games.json`.
- [ ] Full smoke test on desktop Chrome/Firefox and one phone.

## Phase 5 — Optional later

- [x] Shared leaderboard — **pulled forward into v0.1** (Node + JSON file; swap to SQLite if it outgrows that).
- [ ] PWA/offline install, controller (Gamepad API) support, sound mute that spans games.
- [ ] Retire the old folders once the arcade covers them.

## Definition of done (v1)

- `npm start` serves the arcade at `http://localhost:8080`; menu lists all games.
- Each listed game launches, plays, and returns to the menu.
- Another device on the same network can open `http://<LAN-IP>:8080` and play.
- Editing a file under `games/<id>/` and refreshing shows the change; no build step needed
  for web games (Python ports have a documented rebuild command).
- Adding a game = `npm run new-game <id>` + edit its folder; it shows up in the menu.
- `npm test` and `npm run check` pass.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| pygbag needs async loop refactor and loads its runtime from a CDN by default | Python ports slower; LAN play needs internet | Self-host the runtime (TODO). Decision: games stay Python, no JS rewrites |
| pygame `font.SysFont` / file writes / threads don't work in WASM | Ports break at runtime | Bundle fonts (Geist Pixel already exists), use localStorage, avoid blocking calls |
| Doom is heavy and uses SharedArrayBuffer-style features in some builds | Slow first load / needs headers | It currently works under a plain server; keep it lazy-loaded and test through the hub |
| iframe focus: keyboard input goes to the hub, not the game | Game seems unresponsive | `player.js` focuses the iframe on load and on click |
| Audio autoplay rules | No sound until gesture | Games start from a click already (Start button) |
| GPL (Doom engine) | Redistribution duties | Keep `COPYING`, credits and the source link in `games/doom/` |
