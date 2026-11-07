# Design lab (mockups only)

Ten complete style directions for the InfoM4th Arcade, as static placeholder pages. **Nothing works on purpose**:
no real games, scores or names. The layout follows the indie-game-store pattern (browse grid -> game page with
the embed, description, screenshots, sidebar, high scores). Every game also gets its own page colours, like a
creator-customised game page.

Open `design-lab/index.html` in a browser (double-click is fine), pick a style, then use the bar at the bottom of
each mockup (or the ← → keys) to flip between styles, pages and games.

Fonts come from Google Fonts, so the mockups need internet for the right typefaces.

| # | Style | File |
|---|---|---|
| 1 | Store Classic | `styles/classic.css` |
| 2 | Arcade Cabinet | `styles/cabinet.css` |
| 3 | Neon Night | `styles/neon.css` |
| 4 | 8-Bit Console | `styles/pixel.css` |
| 5 | CRT Terminal | `styles/crt.css` |
| 6 | Brutalist Blue | `styles/brutal.css` |
| 7 | Swiss Minimal | `styles/swiss.css` |
| 8 | Soft Clay 3D | `styles/clay.css` |
| 9 | Sticker Comic | `styles/comic.css` |
| 10 | Notebook Paper | `styles/paper.css` |

Shared pieces: `lab.js` (placeholder data, per-game themes, rendering, the switcher bar), `styles/_base.css`
(layout only), `lab.css` (the switcher bar). To try a new direction, copy a style file, add it to `STYLES` in `lab.js`.
Once a style is chosen it gets ported to the real `hub/` and game pages; this folder is not served by the arcade.
