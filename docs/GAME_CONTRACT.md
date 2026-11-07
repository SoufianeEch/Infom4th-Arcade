# Game contract — what a folder must contain to appear in the arcade

```
games/<id>/
├── manifest.json     REQUIRED  metadata for the menu
├── index.html        REQUIRED  entry point (the manifest's "entry" can rename it)
├── README.md         recommended: how to play, how to edit, how to test
├── thumb.png|.svg    recommended: 16:9 card art (falls back to a generated tile)
├── tests/            optional: `npm test` runs every game's tests
└── …                 anything else the game needs; use RELATIVE paths only
```

## `manifest.json`

```json
{
  "id": "flappy",
  "title": "InfoM4th Flappy",
  "tagline": "Guide the origami logo through the gates.",
  "entry": "index.html",
  "order": 10,
  "tags": ["arcade", "one-button"],
  "controls": { "keyboard": "Space / ↑ / W", "touch": "Tap" },
  "orientation": "any",
  "aspect": "fluid",
  "sizeHint": "small",
  "tech": "html-canvas",
  "source": "games/flappy",
  "credits": "InfoM4th",
  "license": "proprietary",
  "hidden": false
}
```

| Field | Rules |
|---|---|
| `id` | required, `[a-z0-9-]+`, equals the folder name, unique |
| `title`, `tagline` | required; tagline ≤ 80 chars |
| `entry` | file inside the folder, default `index.html` |
| `order` | number, lower first; default 100 |
| `tags` | free strings, used for filtering later |
| `controls` | shown on the card; `keyboard` and/or `touch` |
| `orientation` | `any` \| `landscape` \| `portrait` (hub can hint to rotate) |
| `aspect` | `fluid` or e.g. `4/3` (hub letterboxes accordingly) |
| `sizeHint` | `small` \| `medium` \| `large` — large games (Doom) show a loading notice |
| `tech` | `html-canvas` \| `wasm` \| `pygbag` \| `other` (informational) |
| `hidden` | true = built but not listed |

`scripts/check.cjs` fails the build if: `id` ≠ folder name, entry file missing, duplicate ids,
unknown required fields, or the thumbnail path is broken.

## Rules for game code

1. **Relative URLs only** (`./game.js`, not `/game.js`) — the game is served under `/games/<id>/`.
2. **No external CDN requirements** for core play (LAN players may be offline). Exception
   candidates are listed in `docs/PORTING_PYTHON_GAMES.md`; self-host them.
3. **Namespace storage**: `infom4th.<id>.<key>`; wrap in try/catch; game must work if storage is blocked.
4. **Don't touch `window.top`/parent** except through the optional bridge.
5. **Own the whole iframe**: size to `100vw × 100vh`, handle resize, pause on `visibilitychange`/blur.
6. **Touch + keyboard**: if the game needs a keyboard, provide on-screen controls or set
   `controls.touch` to `"not supported"` so the menu can warn mobile users.
7. **Audio only after a user gesture** (Start button), with a mute control.
8. **Licences**: keep third-party licence files inside the game folder (Doom: `COPYING`, Freedoom files).
9. Keep it runnable standalone: `node server/serve.cjs` then open `/games/<id>/`.

## Optional bridge usage

```html
<script type="module">
  import { ready, exit, reportScore } from '../../shared/arcade-bridge.js';
  ready();
  document.querySelector('#exit').onclick = exit;
  // when a run ends:
  reportScore(1234, 'gates');
</script>
```

The bridge is a no-op when the game is opened outside the hub.

## Starter template (`templates/game/`)

`npm run new-game my-game "My Game"` copies the template, fills the manifest, and runs
`build-registry`. The template is a minimal canvas loop with pause, resize, storage helper,
bridge calls, and the arcade theme — essentially a trimmed Flappy shell.
