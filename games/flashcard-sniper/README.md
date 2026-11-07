# Flashcard Sniper (Python / pygame)

Source: `src/main.py` — the original `Prj-00/game_v0.py` plus a small web layer. It is still a normal pygame game.

## Edit and play on the desktop
```bash
.venv/bin/python games/flashcard-sniper/src/main.py      # or: pip install pygame-ce && python main.py
```
Add questions by adding a dict to the `CARDS` list in `main.py`.

## Rebuild for the browser (the arcade serves `web/`)
```bash
npm run build:py            # all Python games   (or: bash scripts/build-python-games.sh flashcard-sniper)
```
Then refresh the arcade. `web/` is generated: don't edit it, commit it.

## What differs from the original
Everything browser-specific goes through `src/arcade_web.py` (copied from `shared/python/arcade_web.py` by the build script;
edit the shared one) and is a no-op on the desktop.
- `run()` is `async` with `await asyncio.sleep(0)` each frame.
- Best score persists in browser `localStorage` (the original kept it in memory only).
- Game over reports the score to the hub (shared leaderboard). ESC returns to the arcade menu.

## Known limits
- The pygbag runtime is served by the arcade from `/pygbag/` (no internet needed). See `/PROGRESS.md`.
- Not yet verified in a real browser.
