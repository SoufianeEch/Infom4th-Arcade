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

### 2026-11-08 — paper-style loading screen for the Python games
- pygbag's default loading page (green box with blue text, bare progress bar, light-blue background) is replaced by `shared/python-loader.css`, linked into every built game page by `scripts/fit_pygbag_page.py`: graph-paper background, a white card with a hand-drawn border and hard shadow, "Loading game…" in Gaegu with a pencil scribbling back and forth, the status text in Patrick Hand, a pencil-blue progress bar, and the "Ready to start! Click/touch the page" note as a yellow sticky label. Light/dark follows the system; reduced motion stops the pencil. The loading text "Loading, please wait ..." became "Loading…". New test checks every built page links it. All six Python games rebuilt. Not seen in a browser.

### 2026-11-08 — Paper Trail: free movement, follow camera, smooth land (rewrite of the engine and client)
- **Movement is no longer blocky.** Everyone moves continuously at a constant speed and turns at a limited rate (smooth arcs, no instant 90-degree corners). Steer with the **mouse** (head towards the pointer), **A/D or the arrow keys** (turn left/right), or **drag** on a touch screen.
- **No full-map view.** The map is 150x100 world units (about 6x bigger than before) and a **camera glides after you** showing roughly 38 units across (22 on phones). A **minimap** (corner) shows land, everyone's position and your view; the HUD (time, land %, cuts, scoreboard) floats over the canvas, and the page chrome disappears while you play.
- **Smooth land edges:** land is stored on a fine grid (2x2 cells per unit); the client traces each player's outline, flattens the steps (Douglas-Peucker, <= 0.55 cells), rounds the corners (Chaikin) and draws it to a cached layer, so territory looks organic instead of squared. Trails are smooth polylines, heads are interpolated between server ticks (~90 ms render delay).
- **Engine** (`server/territory.cjs`, rewritten; the old grid version was replaced): 20 ticks/s; head-vs-trail distance checks (0.5 units); cutting rules unchanged (touch a trail -> its owner is out, a loop around a trail cuts it, head-on crashes, own trail only after the newest 10 points, walls just stop you); capture rasterizes every cell along the trail then flood-fills the enclosed area. **Bots** now steer smoothly: they plan an out/sideways/home loop, check their real turning path for danger, route home with a BFS that avoids their own trail, run home when an enemy gets close (alert radius by level), and sometimes chase a cut. Levels: easy (small loops, no alertness, wobbly), normal, hard (big loops, alert, chases).
- **Network:** server is authoritative; clients send only a steering angle or a turn key. A full snapshot (run-length land + trails) goes to a new/returning player, then ~250 B per tick of deltas (changed land runs, new trail points, heads). Messages: `steer {a}`, `turn {v}` (replacing the old `dir`).
- **Tests:** 20 engine tests (continuity, turn rate, trail spacing, loop capture, cuts, head-on, enclosure kills, delta/snapshot round trip, traffic size, bots incl. smoothness and level ordering), 11 room tests, e2e over sockets, client smoke tests (draws real engine data, mouse/keyboard/touch steering, quick play), property tests that the traced outlines enclose exactly the land cells and that simplification stays within tolerance. The look was previewed by rendering real simulated frames with pygame (smooth outlines confirmed); **not yet seen in a browser**.
- Balance numbers (bot-only 6-player rounds): winner averages ~5-12% of the map; hard > normal > easy in land. Humans have not played it yet: speed (5.2 u/s), turn rate (3.6 rad/s), zoom and round length are the knobs to tune after the first play.

### 2026-11-08 — the whole game fits on one screen (fix of the fix)
- The previous change made the frame taller than the window, so the bottom of the canvas needed scrolling. Now the play page's first screen (`.play-area`) is exactly `100dvh - header` tall: slim title row, the game, and the button bar. The game is the biggest box of its shape that fits the space left (`container-type: size` + `min(100cqw, 100cqh * aspect)`), so there are no height guesses and nothing to scroll. The description, controls and the Scores / Info / More games panels come after it, below the fold. Header height is measured by `sizeHead()` (`--head-h`), each game page opens at the top, and the fullscreen fallback releases the size container.
- Not seen in a browser; if the game still looks small the limiting factor is its aspect ratio (manifest `aspect`) vs the window shape, not the page.

### 2026-11-08 — bigger games
- The play page gave the game only about 950 px (a column next to a 330 px sidebar, height capped at 72vh). Now: one wide column (max 1900 px), frame height follows the viewport (`100dvh - 175px`, so it fills the screen under the slim banner), the banner is compact, and the Scores / Info / More games panels sit in a row under the game. Real fullscreen is also forced to fill the screen (`.embed-screen:fullscreen`).
- Doom: its canvas was shown at natural size; it now fills the frame (`object-fit: contain`), and the 48vh cap in short landscape frames is gone.
- Python games already re-fit to the frame on every resize (pygbag listens to `resize`, `gui_divider` 1), Flappy fills its frame; no change needed.
- Not seen in a browser: check on a big monitor and on a phone in landscape.

### 2026-11-08 — play against bots (Paper Trail)
- **Quick play:** a "Play vs bots" button on the Paper Trail join screen (with Easy / Normal / Hard, remembered) creates a private room that starts by itself: name, one click, countdown, game.
- **Lobby settings (host only, everyone sees them):** number of bots (Auto = fill to 6, None, 1-5; the server accepts 0-8, max 10 on the board, and never leaves a lone human on an empty board) and bot level. Locked once the game starts. Also accepted at room creation.
- **Bot levels** (`LEVELS` in `server/territory.cjs`): easy roams short loops, turns a lot, slips now and then and rarely goes for cuts; normal is the previous behaviour; hard roams far, rarely wanders and almost always grabs an easy cut. Test: over 8 seeds hard bots end with more land than easy ones.
- The Imposter has no bot option yet: bots would need to give clues and vote, which comes with the real game rounds.
- Tests: +3 engine, +3 room, +2 client smoke, e2e updated (1 human + 2 hard bots = 3 on the board). Not seen in a browser.

### 2026-11-08 — Paper Trail (online territory game) + shared room kit
- **Game** (`games/paper-trail/`, in the menu): paper.io-style territory battle for up to 6 players with bots filling empty seats (a lone human can play). Step off your land to draw a trail, loop back to claim the enclosed area; touching someone's trail (or a loop closing around it) knocks them out and they lose their land; walls just stop you; respawn after 3 s; 2.5 minute rounds, most land wins. Final score (land + 20 per cut) goes to the shared leaderboard through the hub.
- **Engine** (`server/territory.cjs`, pure and deterministic): 60x40 grid at 8 ticks/s; flood-fill capture; two queued turns per tick so U-turns work; bots (leave, wander, return by BFS, grab easy cuts, never walk into their own trail); autopilot takes over for a disconnected human and hands back on rejoin. Server is authoritative (inputs are just a direction), snapshots are run-length encoded (~1-2 KB).
- **Rooms** (`server/rooms.cjs`) now host several games (`GAME_DEFS`: imposter 3-12, territory 1-6 humans); `create` takes `game`; the tick loop, intro/snapshot/results messages, leave/rejoin/again are handled per room.
- **Client kit**: the lobby moved to `shared/room-kit/` (`lobby.js`, `lobby.css`, `fx.js`) and is game-agnostic (`Room.on(...)` hooks); The Imposter's reveal screen is now `games/imposter/imposter.js`. Paper Trail adds `trail.js`: canvas drawing with pencil outlines and interpolated movement, scoreboard, kill feed, death banner, claim/kill effects and sounds, results with confetti, arrow/WASD/swipe steering.
- **Tests**: territory engine (12), room integration (8), real-socket e2e (+1), client smoke tests against real engine snapshots. Not seen in a browser; balance (bot skill, speed, map size) is untested by humans.

### 2026-11-08 — multiplayer room system + The Imposter lobby (first slice)
- **Server** (no new dependency): `server/ws.cjs` is a small RFC 6455 WebSocket server (text frames, ping/pong, fragmentation, 4 KB message cap, masked frames required, same-origin check); `server/rooms.cjs` is the room manager (pure logic, injectable scheduler/rng); `server/serve.cjs` exposes it at `/ws` with per-IP socket limit and a flood guard.
- **Rooms:** 4-letter codes (no I/O), 3-12 players, names required (same rules as the hub; ANON/guest/player rejected), unique names and avatars/colours per room, host with ready-gated start, reactions (allow-listed, rate-limited), kick, 3-2-1 countdown that cancels if someone leaves, secret role dealing (one imposter without the word, crew with it; the word is never in public room data), reconnect by token with a grace period (30 s lobby / 2 min in game), host hand-over, play-again, room cap of 300.
- **Client** (`games/imposter/`, in the arcade menu): Notebook Paper look plus effects: confetti bursts on joins/ready/host/copy, rubber-stamp READY, tilting code tiles that drop in, pop-in/out player cards with sticker avatars, a crown that bobs, floating emoji reactions, drifting code doodles in the background, a huge 3-2-1 with sounds, flip-card role reveal (red flash + shake + low sting for the imposter, chime + confetti for crew), toasts, WebAudio sounds with a mute switch, invite-link copy, reconnect after a page refresh. Respects reduced motion.
- **Not built yet:** the actual game rounds (clues, discussion, voting, scoring). The reveal screen is the end of this slice.
- **Tests:** 15 room-logic tests, 4 real-WebSocket end-to-end tests, a stub-DOM smoke test of the lobby client; 58 node tests total, all pass. Not seen in a browser.
- **Found while working:** `shared/` had been moved to `server/shared/` (uncommitted, not by me). The server, `scripts/build-python-games.sh` and the tests now find it in either place, and the Dockerfile now does `COPY . .` (the `.dockerignore` keeps the image small), so nothing breaks whichever you keep.

### 2026-11-08 — Python games now fit their frame
- Cause of "renders small/square first": stock pygbag pages start with a 1x1 canvas, assume 16:9 (`fb_ar` 1.77, 1280x720) and use only half the width (`gui_divider 2`). Found by reading `pythons.js` (`window_canvas_adjust`).
- Fix: `scripts/fit_pygbag_page.py` (run by the build) sets the real size from each manifest's `aspect`, the initial canvas size, `fb_ar`, `gui_divider 1`, and `html,body{height:100%}`; it fails the build if pygbag's template changes. New node test checks all built pages. All six Python games rebuilt.
- Not verified in a real browser (the fix is from reading the runtime's sizing code).

### 2026-11-08 — three new games
- **Binary Blocks** (`games/binary-blocks/`): decimal blocks fall; flip 8 bit switches (128..1) and LOCK to blow up the matching block; combos, levels (numbers grow to 255), 3 lives. Mouse/touch/keyboard.
- **Variable Shooter** (`games/variable-shooter/`): ZType-style. Python words fall; first letter locks the lowest matching word, finish it to blast it; wrong key breaks the combo; waves unlock longer words (keywords -> built-ins -> snippets). Keyboard only; Enter pauses (letters/space are word characters).
- **Memory Match** (`games/memory-match/`): flip a code card + a meaning card (35 pairs, unique meanings enforced by a test); 6/8/10/12 pairs per level, timer, streak + time + move bonuses; mouse/touch/keyboard.
- All three: Python + pygbag, Notebook Paper style, `Engine` (rules, tested) + `Game` (drawing) split, shared leaderboard, best score in browser storage. Screens checked by headless rendering (light). 47 new Python tests (14 + 19 + 14); total 68 Python tests, 36 node tests, all pass. Built into `web/`; manifests give each its own page colours.
- Tests found two real issues before release: ambiguous duplicate meaning cards in Memory Match, and long code cards that overflowed the smallest cards (they now shrink/wrap).
- Not yet seen in a browser; not committed.

### 2026-11-08 — pygame games restyled to Notebook Paper + Type Race fix
- New shared helper `shared/python/paper_style.py` (+ `shared/python/fonts/`: Gaegu, Patrick Hand, Courier Prime, OFL licences): palette (light/dark via `arcade_web.prefers_dark()`), graph-paper background, hand-drawn wobbly outlines, hard-shadow cards, pencil pills, monospace helpers. `scripts/build-python-games.sh` copies it and the fonts into each game's `src/`.
- Code Snake, Flashcard Sniper and Python Type Race redrawn in that style (checked by rendering every screen headless to PNG, light and dark). DotGothic16 is gone from the pygame games too.
- **Type Race fix:** the caret and highlight were placed from a single "M" width and drifted with other fonts. Now each character is centred in a fixed-width cell of a real monospace font (Courier Prime) using the font's integer advance, and the highlight/caret are derived from the glyph height. Removed the old settings.json/FontBook font plumbing.
- Tests: 21 headless Python tests (new: fonts bundled, monospace advance identical for all glyphs, every screen draws); 36 node tests unchanged.

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
