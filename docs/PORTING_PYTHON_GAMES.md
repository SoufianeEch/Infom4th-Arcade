# Porting the Python/pygame games to the browser

The three/four pygame games cannot be served as web pages. A browser needs HTML + JS or WASM.
Options, in order of preference.

## Option A — pygbag (keep the Python) — recommended first

[pygbag](https://github.com/pygame-web/pygbag) compiles a pygame/pygame-ce project to
WebAssembly (CPython-WASM) and produces a folder with `index.html` that can sit in
`games/<id>/`.

**Pros:** keeps your Python code, fast iteration, tests still run on normal CPython.
**Cons:** async loop refactor, first load downloads the Python runtime (several MB), the default
runtime comes from a CDN, no real threads/blocking calls, mobile needs touch UI.

Required code changes per game:

| Desktop pattern | Browser replacement |
|---|---|
| `while running: … clock.tick(60)` | `async def main(): while running: … await asyncio.sleep(0)` + `asyncio.run(main())` |
| `pygame.font.SysFont("…")` | `pygame.font.Font("fonts/x.ttf", size)` with bundled TTF (Geist Pixel is already in the repo) |
| read/write `highscores*.json` with `pathlib` | `platform.window.localStorage` (guarded by `sys.platform == "emscripten"`), file fallback on desktop |
| `sys.exit()` / `pygame.quit()` | return to menu via bridge `exit()` |
| `pygame.mixer` synthesized with `array` | keep, but start after first click; test sizes/rates |
| `__file__`-relative paths | relative to the game folder, assets listed in the pygbag build |
| Window-size assumptions | scale to canvas size; support touch (`pygame.FINGERDOWN`, mouse events) |

Project layout per port:

```
games/code-snake/
├── manifest.json
├── src/              main.py (async entry), game modules, assets/, fonts/
├── build/web/        pygbag output (index.html, *.apk, favicon) — what the hub loads
├── build.cjs|.sh     `pygbag --build src` then copy to games/<id>/ (documented in README)
└── tests/            pytest for pure-logic modules (engine.py etc.)
```

`manifest.entry` points at the built `index.html`. Commit the built output only if you want other
users to run it without installing pygbag (recommended: commit it — hosts then need only Node).

**CDN note:** a stock pygbag page fetches its runtime from `pygame-web.github.io`. For offline
LAN play, self-host it: pygbag supports `--template` and a local runtime path; verify in the spike.
If self-hosting is impractical, accept "needs internet on first load" for these games.

## Option B — rewrite in JavaScript/Canvas

**Pros:** tiny, instant load, same stack as Flappy, perfect mobile/offline, trivial to edit.
**Cons:** full rewrite; the logic must be re-implemented and re-tested.

Best fit: **Code Snake** and **Flashcard Sniper** (small, simple rules, ~370–700 lines). Keep the
question banks as `questions.json` so non-programmers can add cards without touching code.
`typing_race/engine.py` (pure logic, tested) maps cleanly to a JS module with the same tests ported.

## Option C — keep desktop-only, link to a download

Zero effort but breaks the "other users via the web" goal. Only for games we decide not to port.

## Recommended path

1. **Spike** Code Snake with pygbag (it is self-contained: one file, pygame-ce, JSON highscores).
2. If it plays well and load time is acceptable → port Sniper and PyRacer with pygbag.
3. If load time / CDN / mobile is a problem → rewrite Snake and Sniper in JS (Option B);
   PyRacer last, possibly staying on pygbag because it is large (≈1.9k-line `app.py`).

## Per-game notes

| Game | Source | Notes |
|---|---|---|
| Code Snake | `Prj-00/game_v2.py` (695 lines) | question dicts `EASY/MEDIUM/HARD` → move to `questions.json`; scores in `highscores_snake.json` → localStorage; WASD/arrows → add on-screen D-pad |
| Flashcard Sniper | `Prj-00/game_v0.py` (368 lines) | uses plain `pygame`; `highscores.json` (likely this game's) → localStorage; aiming uses mouse → map to touch |
| PyRacer | `Prj-00/typing_race/` | multi-module; `app.py` 1936 lines, `engine.py` unit-tested; `snapshot.py` appears to render screenshots (dev tool, exclude from the web build); needs a physical keyboard — mark `touch: not supported` |
| typing_race_mvp | `Prj-00/typing_race_mvp/` | superseded by PyRacer; archive, but reuse its Geist Pixel fonts + OFL licence |

## Spike acceptance checklist

- [ ] Build produces a folder that works from `/games/<id>/` behind `server/serve.cjs`
- [ ] Keyboard input works inside the iframe after click
- [ ] Score persists across reloads (localStorage)
- [ ] First load size and time on LAN recorded (target: playable in < 5 s on Wi-Fi)
- [ ] Works with the internet disconnected (or the CDN limitation is documented)
- [ ] Desktop version still runs with `python main.py` (one codebase)
