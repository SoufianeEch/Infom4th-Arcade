// Static check: every element id a page's scripts look up must exist in that page's HTML
// (guards against breaking a game when stripping its page down).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = [
  { name: 'hub', html: 'hub/index.html', scripts: ['hub/arcade.js'] },
  { name: 'flappy', html: 'games/flappy/index.html', scripts: ['games/flappy/game.js'] },
  { name: 'doom', html: 'games/doom/index.html', scripts: ['games/doom/index.html'] },
];

for (const p of pages) {
  test(`${p.name}: every looked-up element id exists`, () => {
    const html = fs.readFileSync(path.join(root, p.html), 'utf8');
    const present = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    const wanted = new Set();
    for (const s of p.scripts) {
      const code = fs.readFileSync(path.join(root, s), 'utf8');
      for (const m of code.matchAll(/(?:getElementById|\$|setText)\(\s*'([\w-]+)'/g)) wanted.add(m[1]);
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
  const files = ['shared/theme.css', 'shared/fonts.css', 'hub/arcade.css', 'hub/arcade.js', 'games/flappy/styles.css', 'games/flappy/embed.css', 'games/flappy/game.js', 'games/doom/index.html'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');   // ignore comments
    assert.ok(!/gradient/i.test(code), `${f} still uses a gradient`);
  }
  for (const f of ['Gaegu-400-Latin.woff2', 'Gaegu-700-Latin.woff2', 'PatrickHand-400-Latin.woff2', 'Gaegu-OFL.txt', 'PatrickHand-OFL.txt']) assert.ok(fs.existsSync(path.join(root, 'shared/fonts', f)), f);
  for (const page of ['hub/index.html', 'games/flappy/index.html', 'games/doom/index.html', 'hub/arcade.css']) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert.ok(/shared\/(fonts|theme)\.css/.test(text), page + ' does not load the shared theme/fonts');
  }
});

test('theme: Notebook Paper tokens for light and dark, following the system setting', () => {
  const css = fs.readFileSync(path.join(root, 'shared/theme.css'), 'utf8');
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
  for (const f of ['hub/arcade.js', 'games/flappy/game.js', 'games/flappy/engine.js', 'games/flappy/config.js'])
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }), f);
  const doom = fs.readFileSync(path.join(root, 'games/doom/index.html'), 'utf8');
  for (const [, code] of doom.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(code), 'doom inline script');
});
