# InfoM4th Arcade — project brief

> Status: **v0.1 working, unstyled** (Flappy + Doom + shared leaderboard + Docker files). See `PROGRESS.md` for what is done / verified / next.
> Read in this order: this file → `PROGRESS.md` → `PLAN.md` → `docs/ARCHITECTURE.md` →
> `docs/GAME_CONTRACT.md` → `docs/PORTING_PYTHON_GAMES.md` → `docs/DEPLOYMENT.md`.

## Goal

1. Group every InfoM4th game under **one arcade** with a **menu** where the player
   picks a game, keeping the existing InfoM4th look (dark navy, cyan/mint, mono labels).
2. Keep every game **editable and developable** on its own, long term.
3. **Run locally** on one machine, reachable by other people through the browser
   (same Wi-Fi/LAN first; public hosting later if wanted).

## What exists today (inventory of `Infom4th_Projects/`)

| Folder | What it is | Tech | Runs in browser? | Size |
|---|---|---|---|---|
| `infom4th-doom/` | **InfoM4th DOOM** — Chocolate Doom (WebAssembly) + Freedoom data, custom InfoM4th menu WAD, on-screen touch controller, fullscreen/exit buttons. Own git repo. | HTML + JS, prebuilt `.wasm`, Node `server.js`, Dockerfile + nginx, Railway-ready | **Yes** | ~48 MB (Freedoom WAD ~29 MB) |
| `infom4th-game/infom4th-runner/` | **InfoM4th Flappy** — Flappy-Bird style game starring the origami logo. Coins, gem coins, medals (bronze→platinum), crypto-fair coin-toss second chance, sound, pause, touch + keyboard. 15 Node tests. Folder name says "runner" but the game is Flappy. Own git repo. | Vanilla HTML/CSS/JS in `dist/`, zero dependencies, `scripts/serve.cjs`, Vercel config | **Yes** | ~0.4 MB |
| `Prj-00/game_v0.py` | **Flashcard Sniper** — answer Python flashcards by shooting the right answer (368 lines). | Python + pygame | No (desktop) | tiny |
| `Prj-00/game_v2.py` | **Code Snake** — complete the code, eat the right block, dodge bugs; phases, lives, deadly walls (695 lines). Scores in `highscores_snake.json`. | Python + pygame-ce | No (desktop) | tiny |
| `Prj-00/typing_race/` | **PyRacer** — Python typing race; the big one (~2,600 lines over 7 modules: `app, engine, theme, snippets, storage, snapshot, main`) with unit tests. | Python + pygame | No (desktop) | small |
| `Prj-00/typing_race_mvp/` | Earlier, deliberately minimal typing race with Geist Pixel fonts. Looks superseded by `typing_race/`. | Python + pygame-ce | No (desktop) | small |
| `Prj-00/` leftovers | `game_v1.py`, `game_v3.py`, `test.py`, `main.qml` are **empty/stub** files; `venv/` is a local virtualenv; `highscores.json` holds old scores (`SUFFN 1600`). | — | — | — |
| `Infom4th_Arcade/` | This folder (was empty). | — | — | — |

### Key observations

- **Two games are already web-native** (Doom, Flappy) and share one visual language
  (`--bg #0b111a`, `--cyan #62e2e5`, `--mint #b7f3d5`, mono micro-labels, logo header,
  "arcade" frame). That language becomes the shared arcade theme.
- **Three-four games are desktop pygame** and cannot be served as web pages as they
  are. They need a port (see `docs/PORTING_PYTHON_GAMES.md`). This is the main effort and risk.
- Both web games already contain their own server + deploy config, so they
  are independent today. The arcade must **not break that independence** (goal 2).
- Doom is GPL v2 (engine) + BSD (Freedoom). Licence files must travel with it.
- Doom's `server.js` uses a hard-coded whitelist of paths, so it cannot just serve the
  other games — the arcade needs one generic server.
- No Docker on this machine (`docker` not found); Node 26 and Python 3 are available.

## Chosen approach (summary — details in the docs)

- **One monorepo** `Infom4th_Arcade/` with a lightweight **hub** (menu) and a
  `games/<id>/` folder per game.
- Hub is **plain HTML/CSS/JS, no build step, no dependencies** — same philosophy as Flappy.
- Each game is **self-contained and loaded in an `<iframe>`**, described by a small
  `manifest.json`. Adding/removing a game = add/remove a folder; the menu discovers it.
- One **zero-dependency Node server** serves everything, binds to `0.0.0.0` on request
  so LAN players can join.
- Python games get ported to the browser one by one (pygbag first, JS rewrite as fallback).
- Original project folders stay **untouched** until you decide to retire them.

## Decisions

1. ~~Move vs copy~~ **Decided: copy**, originals stay untouched.
2. Python games: **pygbag** (keep Python) vs rewrite in JS (default: pygbag spike first).
3. Shared leaderboards across players (needs a backend) or per-device scores (default: **shared leaderboards**).
4. Scope of "other users": LAN only, or also public internet (default: **LAN first**; Docker makes either easy).

## Quick start

```bash
# Docker (primary; works on any device with Docker)
docker compose up --build          # http://localhost:8080 ; other devices: http://<this-machine-ip>:8080
docker compose down                # scores survive in the `arcade-data` volume

# Without Docker (development)
npm start                          # http://localhost:8080
npm run serve:lan                  # reachable from other devices
npm test && npm run check
```
