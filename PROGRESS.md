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
- **Python games** (all built with pygbag, source stays Python, desktop still runs): **Code Snake**, **Flashcard Sniper** (`Prj-00/game_v0.py`), **Python Type Race** (`Prj-00/typing_race_mvp`, Source Code Pro + Geist Pixel fonts bundled). Shared browser helper: `shared/python/arcade_web.py` (copied into each `src/` by the build; Code Snake still has its own inline copy of the same helpers, to migrate later). Tests: `npm run test:py` = 16 headless tests (6+5+5).
- **Code Snake stays Python** (`games/code-snake/src/main.py`, from `Prj-00/game_v2.py`), compiled for the browser with **pygbag** (`npm run build:py` -> `games/code-snake/web/`, committed). Same file still runs on the desktop. 6 Python tests (`npm run test:py`) + the build succeeds + the server serves the build. See `games/code-snake/README.md`.
- `npm test`: 25 pass (server + Flappy engine); `npm run test:py`: 16 pass. `npm run check` validates manifests.
- Live smoke test with curl: games list, score post/read, 28 MB WAD served.

**Written but NOT verified:**
- Docker image / compose (`Dockerfile`, `compose.yaml`): Docker is not installed on this machine. Syntax follows the
  standard pattern but it has never been built. First thing to do on a machine with Docker: `docker compose up --build`.
- **Python games in a browser** (all three): the pygbag build compiles and is served, but nobody has loaded it yet (iframe sizing, keyboard focus, audio, postMessage score). The runtime is now served from `/pygbag/` (see Known limits).
- Hub in a real browser (menu → iframe → postMessage → leaderboard refresh). Code is written, not click-tested.
- Doom inside the hub iframe (it works standalone upstream; the iframe path is untested).
- Phone/LAN access.

**Not done yet:**
- All three Python games are in. Not planned: the larger multi-module `typing_race/` (PyRacer) is no longer in `Prj-00`; if it comes back it follows the same recipe.
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

### 2026-11-07 — v0.6 Notebook Paper (chosen from the design lab)
- Ported `design-lab/styles/paper.css` to the real arcade. Fonts: Gaegu (headings) + Patrick Hand (text), self-hosted Latin subsets in `shared/fonts/` (OFL). DotGothic16 removed from the web pages (the pygame games keep their bundled copy).
- `shared/theme.css` = paper tokens (graph-paper SVG background, pencil-blue ink, red margin lines, hand-drawn `--wob-*` corner radii, pencil `.btn`). Light by default; with a dark system setting the same notebook turns "night" (dark paper, light ink) to keep the earlier light/dark requirement.
- Hub rebuilt in the store layout from the mockup, but working: search, Genre / Made-with / Phones filters, Featured / A–Z sort, featured game, cards with live hi-scores; game pages with per-game banner colours, click-to-run embed (game loads only after Run, so Doom no longer downloads until asked), fullscreen, controls table, info panel, more games, live high scores; a Leaderboards page (`#/scores`). The required name dialog now appears when you press Run/Play.
- Mockup items with no real data were left out (plays, ratings, comments, screenshots).
- New manifest fields: `short`, `glyph`, `genre`, `madeWith`, `description`, `featured`, `theme` {bg, fg, accent, accentFg, soft}.
- Flappy and Doom page chrome restyled to paper (bars, pencil buttons, fonts); their game screens stay dark. Python game pages get the paper background.
- Tests: 36 node tests (new: browser scripts parse, which caught a broken quote in Flappy's canvas font after the font swap).
- Not seen in a browser yet.

### 2026-11-07 — design lab
- Added `design-lab/`: 10 static style directions (placeholders, nothing works) for choosing the final look: Store Classic, Arcade Cabinet, Neon Night, 8-Bit Console, CRT Terminal, Brutalist Blue, Swiss Minimal, Soft Clay 3D, Sticker Comic, Notebook Paper. Each has a store-style browse page and game page; each game has its own page colours. Open `design-lab/index.html`. Not served by the arcade, excluded from Docker. Rendering smoke-tested in Node (all pages x styles); not seen in a browser.

### 2026-11-07 — v0.5 (full restyle: arcade theme, DotGothic16, mandatory names, light/dark)
- **Look:** blue is the main colour, white the second, yellow/pink/green as arcade accents. Flat fills only. Chunkier 3D: keycap buttons with a lit top edge, shaded lower edge and 6px hard drop that sinks on press; cards and the high-score panel have the same hard shadow; the game sits in a blue "cabinet" with a marquee title, a dark bezel and a control deck. Base text is 18px, buttons are 48px+ tall, cards are bigger.
- **Font:** DotGothic16 everywhere (Latin subset woff2 in `shared/fonts/`, OFL licence; Geist removed). Pygame games use a Latin-subset TTF in their `src/fonts/` (sizes snapped to multiples of 8 so the pixel font stays crisp; code font is monospaced, so Type Race alignment is intact).
- **Names:** the hub asks for a name (dialog) before any game loads and again whenever the stored name is missing/invalid; no default. The retired default `ANON` (and `anonymous`, `guest`, `player`, `unknown`) is rejected by the hub *and* the server (400 "please choose your own name"). "Change" button in the header. The name is stored in localStorage after the player types it once.
- **Light/dark:** follows the system (`prefers-color-scheme`) via tokens in `shared/theme.css`; the hub, Flappy chrome (bars, buttons), Doom chrome (toolbar, touch pad, legal line) and the Type Race pygame UI (palette picked at start via `arcade_web.prefers_dark()`; `ARCADE_THEME=light` forces light on the desktop) switch. Game canvases (Flappy sky, Doom, Code Snake, Flashcard Sniper) stay dark on purpose.
- **Hi-scores:** each card shows the current hi-score and holder.
- **Checked by eye:** only the pygame screens (rendered headless to PNG: Code Snake, Type Race dark+light looked right). The hub, Flappy and Doom pages are still unseen in a browser (none on the dev machine).

### 2026-11-07 — v0.4 (Geist, flat, 3D keys)
- **Fonts:** Geist (sans) + Geist Mono, self-hosted in `shared/fonts/` (variable woff2 + OFL licence; `shared/fonts.css`). Used by the hub, Flappy (CSS and canvas text) and Doom. Pygame games bundle static TTFs in their `src/fonts/`: Type Race uses Geist + Geist Mono (replacing Geist Pixel / Source Code Pro); Code Snake and Flashcard Sniper use Geist Medium (sized x0.78 to match the old built-in font) and Geist Mono for code.
- **No gradients:** every CSS/canvas gradient removed (hub, `shared/theme.css`, Flappy CSS + sky/pipe/coin canvas fills, Doom CSS, pygame backgrounds are flat fills). Enforced by a test that scans the page CSS/JS.
- **3D buttons:** flat face + 1px lit top edge + hard offset shadow, sinking 3px on press (`.key` in `shared/theme.css`; same recipe applied to hub buttons/cards, Flappy buttons, Doom toolbar + touch pad). No blur, no gradients.
- Still unseen in a real browser, including how the Geist sizes sit inside the three pygame games (sizes are estimates).

### 2026-11-07 — v0.3 (styling pass)
- **Hub** restyled (minimal, InfoM4th palette from `shared/theme.css`): slim top bar (logo + player name), card grid with accent-colour tiles, and an itch.io-style play page: game frame first (aspect from the manifest), title + `← All games` / `Fullscreen` under it, top-scores panel beside it. New manifest fields: `accent`, `aspect`, `tags`, optional `thumb` (image path inside the game folder).
- **Flappy**: removed header, "maintenance" intro/copy, footer, slogans and the long overlay texts; the page is now only the game filling the frame (`embed.css`). Dynamic texts shortened in `game.js`; the maintenance-message/year code removed. Gameplay untouched.
- **Doom**: removed header, hero, "club project" badges, welcome copy, page-level exit, controller captions and help text; the page is the game screen with a one-line toolbar. Kept one small line of engine/Freedoom licence links (GPL/BSD attribution). "Exit" now returns to the arcade menu when embedded.
- **Python games**: built pages get the dark background and a real `<title>`; the pygame canvas itself is unchanged (the look is in the Python code).
- New `tests/pages.test.cjs`: every element id the scripts look up exists in the stripped pages; junk copy stays gone. 32 node tests total.
- **Not seen with eyes**: all CSS/layout is unverified in a browser (no browser on the dev machine). Expect small layout fixes after the first look.

### 2026-11-07 — v0.2
- Self-hosted the pygbag runtime: `scripts/mirror-pygbag.cjs`, `server/pygbag.cjs`, `/pygbag/` route (mirror -> cache -> one-time upstream download), build script rewrites CDN URLs, Dockerfile copies `vendor/`. 10 server tests (was 7): all runtime files served locally, package index points at `/pygbag/cdn/`, built pages have no CDN reference, traversal rejected, upstream fallback cached once.
- Added `games/flashcard-sniper/` and `games/type-race/` (Python + pygbag, same pattern); `shared/python/arcade_web.py`; `scripts/test-python.sh`; build script syncs the helper. Type Race: scores/best in localStorage, ESC returns to menu, keyboard only. Sniper: best persisted in browser, mouse/touch aim.
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

- **pygbag runtime is self-hosted** (`vendor/pygbag/`, 22 MB, committed, served at `/pygbag/`). Refresh with `node scripts/mirror-pygbag.cjs --force`; it must match the pygbag version that builds the games (0.9.3 now; constants in `server/pygbag.cjs`). The built pages are rewritten from `https://pygame-web.github.io/` to `/pygbag/` by `scripts/build-python-games.sh` (it fails if a CDN reference is left). If the browser ever asks for a file that is not in the mirror, the server downloads it once from the public CDN into `DATA_DIR/pygbag-cache/` (only `/cdn/` and `/archives/` paths; disable with `PYGBAG_PROXY=0`). Offline play therefore works as long as the mirror is complete — **verified by tests that fetch every known file locally, not yet by a real offline browser run**; any file the proxy has to fetch shows up in `data/pygbag-cache/`, which tells us what the mirror is missing.

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
4. Click-test the three Python games in the hub (loading, focus, sound, score handoff, Esc to menu).
5. ~~Self-host the pygbag runtime~~ done (see Known limits); verify offline in a real browser (disconnect internet, hard-reload a Python game, check `data/pygbag-cache/` stays empty).
6. Styling pass (reuse tokens in `docs/ARCHITECTURE.md`).
7. `scripts/new-game.cjs` scaffold + `templates/game/`.
