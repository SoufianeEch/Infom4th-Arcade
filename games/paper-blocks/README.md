# Paper Blocks (Python / pygame)

The classic falling-block puzzle on graph paper. Original code for this arcade (the name is not "Tetris", which is a trademark).

## Play
Arrows move (down = soft drop: a tap is one row, hold for about 11 rows a second), Up or X rotate right, Z rotate left, Space hard-drops, C or Shift holds, P pauses, Esc leaves.
On touch screens, on-screen buttons appear. Rules: 10x20 board, 7-bag randomizer, SRS rotation with wall kicks, ghost piece, hold,
4-piece next queue, lock delay (0.5 s, up to 15 resets), gravity by level, +1/+2 per soft/hard-dropped row, line clears 100/300/500/800 x level,
back-to-back four-line clears x1.5, combo bonus, a level every 10 lines.

## Edit and play on the desktop
```bash
.venv/bin/python games/paper-blocks/src/main.py      # or: pip install pygame-ce && python main.py
```
Tune the game in the constants at the top of `main.py` (`LOCK_DELAY`, `DAS`/`ARR`, `LINE_POINTS`, `fall_interval()`).

## Rebuild for the browser (the arcade serves `web/`)
```bash
npm run build:py            # all Python games   (or: bash scripts/build-python-games.sh paper-blocks)
```
Then refresh the arcade. `web/` is generated: don't edit it, commit it.

## How it is organised
- `src/main.py`: an `Engine` class with all the rules (no drawing, easy to test) and a `Game` class that draws and handles input (key repeat, touch buttons, effects).
- `src/paper_style.py`, `src/arcade_web.py`, `src/fonts/`: copied from `shared/python/` by the build (edit the shared versions). Dark/light follows the system (`ARCADE_THEME=light|dark` forces it on the desktop).
- Browser extras are no-ops on the desktop: best score in browser storage, finished runs go to the shared leaderboard under the player's name, Esc returns to the arcade menu, touch buttons only show on touch screens (`arcade_web.is_touch()`).
- Tests: `tests/test_logic.py` (`npm run test:py`).
