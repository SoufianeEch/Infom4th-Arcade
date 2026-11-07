# Code Snake (Python / pygame)

Source: `src/main.py` — the original `Prj-00/game_v2.py` plus a small web layer. It is still a normal pygame game.

## Edit and play on the desktop
```bash
.venv/bin/python games/code-snake/src/main.py      # or: pip install pygame-ce && python main.py
```
Add questions by editing the `EASY` / `MEDIUM` / `HARD` lists at the top of `main.py`.

## Rebuild for the browser (the arcade serves `web/`)
```bash
npm run build:py            # all Python games   (or: bash scripts/build-python-games.sh code-snake)
```
Then refresh the arcade. `web/` is generated: don't edit it, commit it.

## What differs from `Prj-00/game_v2.py`
All guarded by `WEB = sys.platform == "emscripten"`; desktop behaviour is unchanged.
- `run()` is `async` with `await asyncio.sleep(0)` each frame (required by browsers).
- Scores use browser `localStorage` instead of `highscores_snake.json`.
- Code font falls back to pygame's bundled font (no system fonts in the browser).
- Game over reports the score to the arcade hub (`postMessage`), which saves it to the shared leaderboard under the hub's player name; the in-game name prompt is skipped. ESC at the menu returns to the arcade.
- Mouse/touch: tap = start/restart, swipe = steer.

## Known limits
- The pygbag runtime (Python-in-WebAssembly, ~22 MB) is served by the arcade itself from `/pygbag/` (`vendor/pygbag/`), so no internet is needed.
- Not yet verified in a real browser; see `/PROGRESS.md`.
