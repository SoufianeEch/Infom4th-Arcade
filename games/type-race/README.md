# Python Type Race (Python / pygame)

Source: `src/main.py` — the original `Prj-00/typing_race_mvp/main.py` plus a small web layer. It is still a normal pygame game.

## Edit and play on the desktop
```bash
.venv/bin/python games/type-race/src/main.py      # or: pip install pygame-ce && python main.py
```
Fonts come from `src/settings.json` / `src/fonts/`: Geist (UI) and Geist Mono (code), SIL OFL, licence in `src/fonts/Geist-OFL.txt`. The Geist Pixel variants are still bundled as alternatives.
Snippets are the `SNIPPETS` list in `main.py`.

## Rebuild for the browser (the arcade serves `web/`)
```bash
npm run build:py            # all Python games   (or: bash scripts/build-python-games.sh type-race)
```
Then refresh the arcade. `web/` is generated: don't edit it, commit it.

## What differs from the original
Everything browser-specific goes through `src/arcade_web.py` (copied from `shared/python/arcade_web.py` by the build script;
edit the shared one) and is a no-op on the desktop.
- `run()` is `async` with `await asyncio.sleep(0)` each frame.
- Geist / Geist Mono are bundled in `src/fonts/` (the original used Geist Pixel + a Source Code Pro installed on the desktop, which the browser does not have).
- Personal best persists in browser `localStorage` instead of `best.json`.
- Finishing a snippet reports the score to the hub (shared leaderboard). ESC returns to the arcade menu.
- Needs a physical keyboard; not playable on phones.

## Known limits
- The pygbag runtime is served by the arcade from `/pygbag/` (no internet needed). See `/PROGRESS.md`.
- Not yet verified in a real browser.
