# Memory Match (Python / pygame)

Pair a piece of Python with what it means. Original game for this arcade.

## Edit and play on the desktop
```bash
.venv/bin/python games/memory-match/src/main.py      # or: pip install pygame-ce && python main.py
```
Cards: the `PAIRS` list at the top of `main.py` (keep meanings short and unique; the tests check this).

## Rebuild for the browser (the arcade serves `web/`)
```bash
npm run build:py            # all Python games   (or: bash scripts/build-python-games.sh memory-match)
```
Then refresh the arcade. `web/` is generated: don't edit it, commit it.

## How it is organised
- `src/main.py`: an `Engine` class with all the rules (no drawing, easy to test) and a `Game` class that draws and handles input.
- `src/paper_style.py`, `src/arcade_web.py`, `src/fonts/`: copied from `shared/python/` by the build (edit the shared versions). The look is the arcade's Notebook Paper style; dark/light follows the system (`ARCADE_THEME=light|dark` forces it on the desktop).
- Browser extras are no-ops on the desktop: the best score is saved in the browser, a finished run is sent to the shared leaderboard under the player's name, and Esc returns to the arcade menu.
- Tests: `tests/test_logic.py` (`npm run test:py`).
