# Python Type Race (Python / pygame)

Source: `src/main.py` — the original `Prj-00/typing_race_mvp/main.py` plus a small web layer. It is still a normal pygame game.

## Edit and play on the desktop
```bash
.venv/bin/python games/type-race/src/main.py      # or: pip install pygame-ce && python main.py
```
Fonts and colours come from the shared Notebook Paper helper (`src/paper_style.py` + `src/fonts/`, copied from `shared/python/` by the build): Gaegu (headings), Patrick Hand (text), Courier Prime (code, true monospace). Snippets are the `SNIPPETS` list in `main.py`.

## Rebuild for the browser (the arcade serves `web/`)
```bash
npm run build:py            # all Python games   (or: bash scripts/build-python-games.sh type-race)
```
Then refresh the arcade. `web/` is generated: don't edit it, commit it.

## What differs from the original
Everything browser-specific goes through `src/arcade_web.py` (copied from `shared/python/arcade_web.py` by the build script;
edit the shared one) and is a no-op on the desktop.
- `run()` is `async` with `await asyncio.sleep(0)` each frame.
- Restyled to the arcade's Notebook Paper look (graph paper, pencil blue, hand-drawn boxes); dark/light follows the system (`ARCADE_THEME=light|dark` forces it on the desktop).
- Code area fixed: every character sits in a fixed-width cell of a real monospace font and is centred in it, so the highlight and the red caret line up exactly with the glyph (the old version assumed one glyph width and drifted with other fonts).
- Personal best persists in browser `localStorage` instead of `best.json`.
- Finishing a snippet reports the score to the hub (shared leaderboard). ESC returns to the arcade menu.
- Needs a physical keyboard; not playable on phones.

## Known limits
- The pygbag runtime is served by the arcade from `/pygbag/` (no internet needed). See `/PROGRESS.md`.
- Not yet verified in a real browser.
