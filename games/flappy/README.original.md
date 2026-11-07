# InfoM4th Flappy

Standalone maintenance page with a Flappy Bird style game starring the InfoM4th
origami logo. The existing `infom4th-runner` folder name is kept so your local
path and deployment setup stay the same. It runs independently of the main
website and backend, with no packages or database required.

## Run locally

```powershell
cd C:\Users\elham\Documents\GitHub\infom4th\infom4th-runner
npm.cmd run dev
```

Open http://localhost:3000. No npm install or build is necessary. Refresh an
already open tab to load the new Flappy game. You can also open `dist/index.html`
directly; the optional server gives more consistent browser storage behavior.

For a different port: `npm.cmd run dev -- --port 3001`.
For a phone on the same Wi-Fi: `npm.cmd run dev -- --host 0.0.0.0`, then open
`http://YOUR_LAPTOP_WIFI_IP:3000`. The default server listens only on this laptop.

## Play

- Space / Arrow Up / W: start, flap, or try again.
- Tap or click the game, or use **Tap to flap**: the same action.
- Each press gives one upward flap. Time your taps to stay inside the gaps.
- P / Escape / pause button: pause or resume. The resume button continues the flight.
- Sound button: optional synthesized sound, off initially.
- Switching tabs, losing window focus, or resizing automatically pauses the game.

Pass a full gate to earn one point. Exiting near the centre counts as a perfect
gap; consecutive perfect gaps build a precision streak. Perfects and medals are
achievements and do not multiply the gate score.

The first gate gives you time to find the rhythm. As your score increases, gates
move faster and gaps narrow gradually. Gap height, speed, spacing, and vertical
changes are bounded so the course stays playable. The logo uses a forgiving
circular hitbox. Hitting the ceiling, ground, or a gate ends the flight.

Earn Bronze at 5 gates, Silver at 15, Gold at 30, and Platinum at 50. The result
screen shows gates passed, perfect gaps, and your medal. A short restart guard
prevents the crash tap from accidentally dismissing the result.

## Coins and the second-chance toss

Every gap holds a spinning coin, every third gate adds a trail of three coins
along the flight line, and every tenth gate holds a gem coin worth 5. Collected
coins fly into the COINS counter and are added to a wallet saved in the browser.

After a crash, **Flip for a second chance** spends coins (`flipCost` in
`config.js`, 5 by default) on a heads-or-tails coin toss (keyboard: H / T). The
result is a fair 50/50 from `crypto.getRandomValues`. If your call wins, the gate
ahead is cleared and the flight resumes after a 3-2-1 countdown with the same
score. You get one toss per flight, whether you win or lose.

Personal best, coin wallet and sound preference are saved only in the current browser/device
under `infom4th-flappy-v1`. Runner scores are separate. Play still works when
browser storage is unavailable. There are no accounts or online leaderboards.

## Deploy separately

Deploy the **contents of `dist/`**, with `index.html` at the web root. No build
command or production Node server is required.

- Static hosting/cPanel: upload the contents of `dist/` to the chosen web root.
- Cloudflare Pages/Netlify: no framework/build command; output directory `dist`
  relative to this standalone folder.
- Nginx/VPS: point the static document root to this folder's `dist` directory.
- A subfolder deployment works because assets use relative paths.

The page never calls the main website, Supabase, a database, a CDN, or a score
server. All assets, fonts (system fonts), and game code are local.

If serving this on the main domain during maintenance, configure your webserver
to return 503 for the maintenance HTML while keeping scripts, styles, and images
available with 200. Check asset resolution for deep app URLs, and restore normal
routing when maintenance ends. Deployment is configured on your hosting service.

## Vercel deployment

1. Commit and push this entire folder, including dist/, vercel.json, and the
   ignore files. Confirm infom4th-runner/dist/index.html is visible on GitHub
   in the exact branch selected for deployment. A local-only folder cannot be
   included in a Git-based deployment.
2. Import the repository as a separate Vercel project.
3. Set Root Directory to infom4th-runner and Framework Preset to Other.
4. The included vercel.json sets outputDirectory to dist and skips build/install.
   If entering settings manually: Output Directory is dist; Build Command and
   Install Command are overridden to empty values.
5. Deploy the new commit. Open that deployment's Visit link at the root URL.

If the page returns 404, check the deployed commit/branch, Root Directory, and
Output Directory first. The output must contain index.html at its root. Do not
set Root Directory to the repository root or Output Directory to the full path
infom4th-runner/dist when Root Directory is already infom4th-runner. The root
repository's Vercel ignore file has an exception for this game's authored dist;
the standalone folder also supplies its own CLI ignore file.

## Files and customization

- `dist/index.html`: headings and layout.
- `dist/styles.css`: the dark blue, cyan, and mint theme and responsive layout.
- `dist/config.js`: maintenance message and browser storage key.
- `dist/engine.js`: game rules, collisions, scoring, and course generation.
- `dist/game.js`: canvas drawing, controls, sound, overlays, medals, and best score.
- `dist/assets/infom4th-logo.png`: local copy of `public/email/infom4th-logo.png`.
- `scripts/serve.cjs`: optional zero-dependency preview server.
- `tests/flappy.test.cjs`: Node rule tests and simulated playability checks.
- `VALIDATION.md`: executed checks and remaining manual checks.

The folder's `.gitignore` deliberately unignores `dist/`: these are authored
source files. The page includes `noindex,nofollow` for maintenance use. There is
no live completion estimate or fake progress bar; edit the maintenance copy in
`config.js` when needed.

## Checks

```powershell
npm.cmd run check
npm.cmd test
```

Both commands use Node built-ins only. The 15 tests cover flight input, collisions,
scoring, perfect streaks, pause, restart timing, course bounds, resizing, frame
handling, and two-minute seeded flights at multiple widths and frame rates.
