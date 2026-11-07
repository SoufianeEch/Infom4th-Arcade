# Architecture

## Principles

1. **Games are independent.** A game folder must run without the hub (open its
   `index.html` through any static server). The hub only *links* to it.
2. **No build step for the shell.** Plain HTML/CSS/ES modules. Anyone can edit with a text editor.
3. **Zero runtime dependencies** for the server and hub (matches Flappy and Doom today).
4. **Convention over configuration.** Folder + `manifest.json` = a game in the menu.
5. **Same look.** One token set (colours, fonts) reused by hub and by new games.

## Runtime picture

```
Browser (any device on the network)
   │  http://<host>:8080/
   ▼
server/serve.cjs  ── static files only ──►  hub/            (menu at "/")
                                            games/<id>/     (each at /games/<id>/)
                                            shared/         (optional helpers)

Menu click ─► hub/player.js ─► <iframe src="/games/<id>/"> ◄─ postMessage ─► hub
```

### Why iframes

- Isolation: Doom's globals/WASM, pygbag's runtime and Flappy's canvas cannot collide.
- Each game keeps its own `index.html`, CSS and scripts untouched.
- Crash/cleanup is trivial: removing the iframe frees the game (important for Doom's memory).
- A game can also be opened directly at `/games/<id>/` (deep link, bookmarkable, testable alone).

Trade-offs accepted: fullscreen and keyboard focus need explicit handling in `player.js`;
storage is shared per origin, so games **namespace their keys** (`infom4th.<id>.*`).

## Components

### Server (`server/serve.cjs`)
- Based on Flappy's `scripts/serve.cjs` (already path-traversal safe) plus Doom's MIME needs.
- Serves only inside the repo roots `hub/`, `games/`, `shared/` (never `server/`, `scripts/`, `.git`).
- `/` → `hub/index.html`; `/games.json` → generated registry.
- Flags: `--host 0.0.0.0` for LAN, `--port`, env `HOST`/`PORT`.
- Prints local + LAN URLs at startup.
- Headers: `X-Content-Type-Options: nosniff`; `Cache-Control: no-cache` on HTML/JSON;
  long cache on large static assets (wasm/wad) once versioned.
- Optional gzip/brotli for `.wasm`/`.wad` (Node `zlib`) — only if first-load time on LAN is a problem.

### Registry (superseded: now `GET /api/games`)
_v0.1 reads manifests live on each request; the generated `games.json` described below is not used._

#### Original idea
`scripts/build-registry.cjs` reads every `games/*/manifest.json`, validates it, sorts by
`order`, and writes `hub/games.json`. The server can also build it on the fly in dev mode so
no manual step is needed while editing.

### Hub (`hub/`)
- Fetches `games.json`, renders one card per game: title, tagline, thumbnail, tags, controls
  icons (keyboard/touch), best score if the game reports one.
- Input: mouse/touch, arrow keys + Enter, optional Gamepad API later.
- Launching: sets `location.hash` to `#/play/<id>` (so back button and reload work) and mounts
  the iframe full-size with a slim top bar (`← Menu`, title, fullscreen).
- Returning: Esc, the Menu button, browser back, or a `postMessage({type:'arcade:exit'})` from the game.

### Optional bridge (`shared/arcade-bridge.js`)
Tiny, opt-in messages between game and hub; games work fine without it.

| Message (game → hub) | Purpose |
|---|---|
| `{type:'arcade:ready'}` | game loaded; hub hides the spinner, focuses iframe |
| `{type:'arcade:exit'}` | game's own "Exit" button returns to menu |
| `{type:'arcade:score', value, label}` | hub can show a best-score badge |
| `{type:'arcade:fullscreen'}` | request fullscreen of the player |

Hub validates `event.origin === location.origin` and ignores unknown types.

### Storage
- Per game, per device, `localStorage` under `infom4th.<id>.<key>`; wrapped in try/catch
  (private windows / blocked storage must not crash a game — Flappy already does this).
- Python ports use `platform.window.localStorage` (pygbag) instead of JSON files.
- **Shared leaderboard (server-side):** hub receives `arcade:score` from the iframe and POSTs it to `/api/scores`;
  server keeps each name's best score per game in `DATA_DIR/scores.json` (Docker volume `/data`). Games with
  `scoring.enabled` in their manifest must set `scoring.max`. No accounts; scores are client-reported (see PROGRESS.md).

## Theme

Source of truth is Flappy's tokens, which Doom already approximates:

```css
:root{
  --bg:#0b111a; --panel:#0e1824; --border:#23303d;
  --text:#eef3f4; --muted:#8b9aa8;
  --cyan:#62e2e5; --mint:#b7f3d5;
  --mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
  --sans:Inter,"Segoe UI",Arial,sans-serif;
}
```

Hub UI = arcade "cabinet" frame (`.arcade`, `.arcade-bar`, `.primary-button`, `kbd` hints),
reusing Flappy's component styles. Python ports that want Geist Pixel can reuse the fonts from
`typing_race_mvp/fonts` (OFL licence file must be copied along).

## Editing workflow (the "I can change things later" part)

| I want to… | Do this |
|---|---|
| Tweak a web game | Edit files in `games/<id>/`, refresh the browser |
| Change the menu look | Edit `hub/arcade.css` / `arcade.js` |
| Change a game's card (title, art, order) | Edit `games/<id>/manifest.json` (+ `npm run build-registry`) |
| Add a game | `npm run new-game <id>`, build it, done |
| Remove a game | Delete its folder (or set `"hidden": true` in its manifest) |
| Change a Python game | Edit `games/<id>/src/*.py`, run its documented build command, refresh |
| Develop a game on its own | `npm run dev -- --only <id>` or open `/games/<id>/` directly |

Git: one repo for everything, one commit history per game via path-scoped commits
(`games/flappy/...`). Nothing needs submodules. The two existing repos' history
(`infom4th-doom`, `infom4th-game`) can be kept by `git subtree add` if you want it; default is a clean copy.
