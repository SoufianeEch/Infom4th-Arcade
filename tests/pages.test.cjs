// Static check: every element id a page's scripts look up must exist in that page's HTML
// (guards against breaking a game when stripping its page down).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SHARED = fs.existsSync(path.join(root, 'shared')) ? 'shared' : 'server/shared';   // wherever the shared folder lives
const OPTIONAL_IDS = new Set(['mini-players']);       // the shared lobby code guards these: a game page may omit them
const pages = [
  { name: 'hub', html: 'hub/index.html', scripts: ['hub/arcade.js'] },
  { name: 'flappy', html: 'games/flappy/index.html', scripts: ['games/flappy/game.js'] },
  { name: 'doom', html: 'games/doom/index.html', scripts: ['games/doom/index.html'] },
  { name: 'imposter', html: 'games/imposter/index.html', scripts: [`${SHARED}/room-kit/lobby.js`, `${SHARED}/room-kit/fx.js`, 'games/imposter/imposter.js'] },
  { name: 'paper-trail', html: 'games/paper-trail/index.html', scripts: [`${SHARED}/room-kit/lobby.js`, 'games/paper-trail/trail.js'] },
];

for (const p of pages) {
  test(`${p.name}: every looked-up element id exists`, () => {
    const html = fs.readFileSync(path.join(root, p.html), 'utf8');
    const present = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    const wanted = new Set();
    for (const s of p.scripts) {
      const code = fs.readFileSync(path.join(root, s), 'utf8');
      for (const m of code.matchAll(/(?:getElementById|\$|setText)\(\s*'([\w-]+)'/g)) if (!m[1].endsWith('-') && !OPTIONAL_IDS.has(m[1])) wanted.add(m[1]);   // 'screen-' + name is built at run time
    }
    const missing = [...wanted].filter(id => !present.has(id));
    assert.deepEqual(missing, [], `${p.name}: missing ids ${missing.join(', ')}`);
  });
}

test('pages no longer carry the removed marketing/maintenance copy', () => {
  const flappy = fs.readFileSync(path.join(root, 'games/flappy/index.html'), 'utf8');
  const doom = fs.readFileSync(path.join(root, 'games/doom/index.html'), 'utf8');
  for (const junk of ['Maintenance', 'maintenance', 'little downtime', 'SMALL FLAPS', 'Find your rhythm', 'site-footer']) assert.ok(!flappy.includes(junk), 'flappy: ' + junk);
  for (const junk of ['MISSION 01', 'A CLUB PROJECT', 'WELCOME TO THE ARCADE', 'VIRTUAL CONTROLLER', 'NEED A BREAK']) assert.ok(!doom.includes(junk), 'doom: ' + junk);
});

test('style rules: no gradients anywhere in the page CSS/JS, Notebook Paper fonts are bundled', () => {
  const files = [`${SHARED}/theme.css`, `${SHARED}/fonts.css`, 'hub/arcade.css', 'hub/arcade.js', 'games/flappy/styles.css', 'games/flappy/embed.css', 'games/flappy/game.js', 'games/doom/index.html', `${SHARED}/python-loader.css`, `${SHARED}/room-kit/lobby.css`, `${SHARED}/room-kit/lobby.js`, `${SHARED}/room-kit/fx.js`, 'games/imposter/imposter.js', 'games/paper-trail/trail.js', 'games/paper-trail/trail.css'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');   // ignore comments
    assert.ok(!/gradient/i.test(code), `${f} still uses a gradient`);
  }
  for (const f of ['Gaegu-400-Latin.woff2', 'Gaegu-700-Latin.woff2', 'PatrickHand-400-Latin.woff2', 'Gaegu-OFL.txt', 'PatrickHand-OFL.txt']) assert.ok(fs.existsSync(path.join(root, SHARED, 'fonts', f)), f);
  for (const page of ['hub/index.html', 'games/flappy/index.html', 'games/doom/index.html', 'hub/arcade.css']) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert.ok(/shared\/(fonts|theme)\.css/.test(text), page + ' does not load the shared theme/fonts');
  }
});

test('theme: Notebook Paper tokens for light and dark, following the system setting', () => {
  const css = fs.readFileSync(path.join(root, SHARED, 'theme.css'), 'utf8');
  assert.ok(css.includes('prefers-color-scheme: dark'), 'dark mode rule');
  assert.ok(/color-scheme:\s*light dark/.test(css));
  assert.ok(css.includes('--blue:'));
  assert.ok(css.includes('Patrick Hand') && css.includes('Gaegu'));
  assert.ok(css.includes('--wob-1'), 'hand-drawn corners');
  for (const page of ['hub/index.html', 'games/flappy/index.html', 'games/doom/index.html'])
    assert.ok(fs.readFileSync(path.join(root, page), 'utf8').includes('name="color-scheme"'), page);
});

test('hub requires a player name before any game and has no default name', () => {
  const html = fs.readFileSync(path.join(root, 'hub/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'hub/arcade.js'), 'utf8');
  assert.ok(html.includes('id="name-dialog"') && html.includes('id="name-input"'));
  assert.ok(!/ANON/i.test(js.replace(/RESERVED[^\n]*/, '')) , 'no ANON default outside the reserved list');
  assert.ok(/async function runGame\(\)[\s\S]*?nameProblem\(name\)[\s\S]*?askName\(true\)[\s\S]*?frame\.src/.test(js), 'runGame() asks for a name before the game loads');
  assert.ok(js.includes('!nameProblem(name)'), 'scores only submitted with a valid name');
});

test('browser scripts parse (catches broken quotes after style edits)', () => {
  const vm = require('node:vm');
  for (const f of ['hub/arcade.js', 'games/flappy/game.js', 'games/flappy/engine.js', 'games/flappy/config.js', `${SHARED}/room-kit/lobby.js`, `${SHARED}/room-kit/fx.js`, 'games/imposter/imposter.js', 'games/paper-trail/trail.js'])
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }), f);
  const doom = fs.readFileSync(path.join(root, 'games/doom/index.html'), 'utf8');
  for (const [, code] of doom.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(code), 'doom inline script');
});

test('built Python game pages are fitted to their frame (real canvas size, full width, correct aspect)', () => {
  const games = path.join(root, 'games');
  let checked = 0;
  for (const id of fs.readdirSync(games)) {
    const page = path.join(games, id, 'web/index.html');
    if (!fs.existsSync(page)) continue;
    const m = JSON.parse(fs.readFileSync(path.join(games, id, 'manifest.json'), 'utf8'));
    const [w, h] = String(m.aspect).split('/').map(Number);
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(/gui_divider\s*:\s*1\b/.test(html), `${id}: canvas would use only half the width`);
    assert.ok(html.includes(`fb_width : "${w}"`) && html.includes(`fb_height : "${h}"`), `${id}: fb size is not ${w}x${h}`);
    assert.ok(new RegExp(`id="canvas"\\s*width="${w}px"\\s*height="${h}px"`).test(html), `${id}: canvas does not start at ${w}x${h}`);
    assert.ok(Math.abs(Number(/fb_ar\s*:\s*([\d.]+)/.exec(html)[1]) - w / h) < 0.001, `${id}: fb_ar`);
    checked++;
  }
  assert.ok(checked >= 6, 'expected every Python game to be checked');
});

test('hub play page: the game is sized to the space left on ONE screen (no scrolling to see the whole canvas)', () => {
  const css = fs.readFileSync(path.join(root, 'hub/arcade.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'hub/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'hub/arcade.js'), 'utf8');
  assert.match(css, /\.play-area\s*\{[^}]*height:\s*calc\(100dvh - var\(--head-h\)\)/, 'play area is exactly the window height under the header');
  assert.match(css, /\.embed-box\s*\{[^}]*container-type:\s*size/, 'the game is fitted to the space that is left');
  assert.match(css, /\.embed-screen\s*\{[^}]*width:\s*min\(100cqw,\s*calc\(100cqh \* var\(--ar-n/, 'largest box of the game shape that fits');
  assert.ok(!/72vh|100vh - 175px|--max-h/.test(css), 'no fixed height guesses left');
  assert.match(css, /\.embed-screen:fullscreen\s*\{[^}]*width:\s*100%/, 'real fullscreen fills the screen');
  assert.match(css, /body\.fs-fallback \.embed-box\s*\{\s*container-type:\s*normal/, 'fallback fullscreen is not trapped by the size container');
  assert.match(css, /\.game-side\s*\{[^}]*auto-fit/, 'panels sit under the game');
  // the title row, the game and its buttons all live inside the one-screen play area; the description and panels come after it
  const play = html.slice(html.indexOf('class="play-area"'), html.indexOf('class="game-layout"'));
  for (const id of ['now-playing', 'stage', 'frame', 'fs', 'back']) assert.ok(play.includes(`id="${id}"`), id + ' is inside the play area');
  assert.ok(!play.includes('id="g-desc"') && !play.includes('id="board"'), 'long content is below the fold');
  assert.ok(js.includes("'--head-h'") && js.includes('window.scrollTo(0, 0)'), 'header height is measured and each game page starts at the top');
});

test('doom canvas fills its frame (no natural-size canvas, no 48vh cap)', () => {
  const html = fs.readFileSync(path.join(root, 'games/doom/index.html'), 'utf8');
  assert.match(html, /\.screen canvas\{[^}]*width:100%;height:100%;object-fit:contain/);
  assert.ok(!html.includes('.toolbar{padding:4px 8px}.screen{max-height:48vh}'), 'the short-frame cap on the embedded screen is gone');
});

test('Python games show a paper-style loading screen (shared/python-loader.css), not pygbag\'s default green box', () => {
  const css = fs.readFileSync(path.join(root, SHARED, 'python-loader.css'), 'utf8');
  for (const needle of ['#transfer', '#infobox', '#progress', 'prefers-color-scheme: dark', 'Gaegu', '--wob']) assert.ok(css.includes(needle), needle);
  const games = path.join(root, 'games');
  let checked = 0;
  for (const id of fs.readdirSync(games)) {
    const page = path.join(games, id, 'web/index.html');
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(html.includes('href="/shared/python-loader.css"'), `${id}: loading screen stylesheet is linked`);
    assert.ok(html.includes('>Loading…<'), `${id}: friendlier loading text`);
    checked++;
  }
  assert.ok(checked >= 6);
});
