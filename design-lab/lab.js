/* Design lab: static style mockups. Nothing here works: it only renders placeholder content
 * into hub.html / game.html with the stylesheet chosen by ?style=<id>. */
'use strict';

const STYLES = [
  { id: 'classic', swatch: ['#f4f5f7','#222','#1f5cff','#ffffff'], face: "Inter", name: 'Store Classic', blurb: 'Clean indie-store look: light page, dense grid, small type, one blue accent.', fonts: 'family=Inter:wght@400;600;800' },
  { id: 'cabinet', swatch: ['#071030','#ffffff','#2d6bff','#ffd43b'], face: "Bungee", name: 'Arcade Cabinet', blurb: 'Chunky 3D keycaps, blue cabinet around the game, pixel headings.', fonts: 'family=Bungee&family=DotGothic16' },
  { id: 'neon', swatch: ['#07060f','#e9f6ff','#00f0ff','#ff2bd6'], face: "Orbitron", name: 'Neon Night', blurb: 'Dark, glowing outlines, cyan + magenta, futuristic type.', fonts: 'family=Orbitron:wght@500;800&family=Rajdhani:wght@500;700' },
  { id: 'pixel', swatch: ['#1d2b53','#fff1e8','#29adff','#ff004d'], face: "'Press Start 2P'", name: '8-Bit Console', blurb: 'NES-era: four-colour palette, hard pixel borders, Press Start type.', fonts: 'family=Press+Start+2P' },
  { id: 'crt', swatch: ['#020a02','#33ff66','#1a7a2e','#b6ffc8'], face: "VT323", name: 'CRT Terminal', blurb: 'Green phosphor on black, scanlines, everything monospace.', fonts: 'family=VT323' },
  { id: 'brutal', swatch: ['#ffffff','#000000','#0038ff','#ffe600'], face: "'Archivo Black'", name: 'Brutalist Blue', blurb: 'Huge type, thick black borders, offset shadows, raw grid.', fonts: 'family=Archivo+Black&family=Space+Grotesk:wght@400;700' },
  { id: 'swiss', swatch: ['#ffffff','#111111','#0047ff','#eeeeee'], face: "'Inter Tight'", name: 'Swiss Minimal', blurb: 'Whitespace, strict grid, hairlines, one strong blue.', fonts: 'family=Inter+Tight:wght@400;600;800' },
  { id: 'clay', swatch: ['#e9eefc','#24305e','#5b7cfa','#ffc857'], face: "Nunito", name: 'Soft Clay 3D', blurb: 'Puffy rounded 3D blocks, soft shadows, friendly type.', fonts: 'family=Nunito:wght@600;800;900' },
  { id: 'comic', swatch: ['#fff7d6','#111111','#2d6bff','#ff4f6d'], face: "Bangers", name: 'Sticker Comic', blurb: 'Bold outlines, sticker cards, tilted badges, playful colours.', fonts: 'family=Bangers&family=Patrick+Hand' },
  { id: 'paper', swatch: ['#fbfaf4','#1d3b8f','#2d6bff','#f25c54'], face: "Gaegu", name: 'Notebook Paper', blurb: 'Graph paper, hand-drawn boxes, pencil blue, school-club vibe.', fonts: 'family=Gaegu:wght@400;700&family=Patrick+Hand' },
];

// Each game has its own page theme (like a creator-customised game page).
const GAMES = [
  { id: 'flappy', title: 'InfoM4th Flappy', short: 'FLAPPY', glyph: '🐦', tagline: 'Guide the origami logo through the gates.', tech: 'HTML5', genre: 'Arcade', controls: 'Keyboard · Touch', plays: '3.4k', rating: 4.6,
    theme: { bg: '#0f2a6b', fg: '#ffffff', accent: '#ffd43b', accentFg: '#2b2000', soft: '#1b3f96' } },
  { id: 'doom', title: 'InfoM4th DOOM', short: 'DOOM', glyph: '💀', tagline: 'Classic first-person action, InfoM4th edition.', tech: 'WebAssembly', genre: 'Shooter', controls: 'Keyboard · Touch pad', plays: '2.1k', rating: 4.8,
    theme: { bg: '#140606', fg: '#ffe9e2', accent: '#ff3b2f', accentFg: '#ffffff', soft: '#2a0d0b' } },
  { id: 'code-snake', title: 'Code Snake', short: 'SNAKE', glyph: '🐍', tagline: 'Fill the blank, eat the right code, dodge the bugs.', tech: 'Python', genre: 'Puzzle', controls: 'Keyboard · Swipe', plays: '1.8k', rating: 4.4,
    theme: { bg: '#062016', fg: '#e8fff3', accent: '#3ddc97', accentFg: '#03281a', soft: '#0b3323' } },
  { id: 'flashcard-sniper', title: 'Flashcard Sniper', short: 'SNIPER', glyph: '🎯', tagline: 'Aim the scope and shoot the right answer.', tech: 'Python', genre: 'Quiz', controls: 'Mouse · Touch', plays: '1.1k', rating: 4.2,
    theme: { bg: '#141a3a', fg: '#fff8e6', accent: '#ffb02e', accentFg: '#2b1a00', soft: '#222a55' } },
  { id: 'type-race', title: 'Python Type Race', short: 'TYPE', glyph: '⌨️', tagline: 'Type the snippet exactly. One clock, one best.', tech: 'Python', genre: 'Typing', controls: 'Keyboard', plays: '960', rating: 4.5,
    theme: { bg: '#eef3ff', fg: '#0a1a52', accent: '#1f5cff', accentFg: '#ffffff', soft: '#dbe6ff' } },
  { id: 'soon-1', title: 'Bug Hunt', short: 'SOON', glyph: '🪲', tagline: 'Coming soon: squash bugs in real code.', tech: 'Python', genre: 'Action', controls: '—', plays: '—', rating: 0, soon: true,
    theme: { bg: '#2a1240', fg: '#f6eaff', accent: '#c06bff', accentFg: '#ffffff', soft: '#3a1c57' } },
  { id: 'soon-2', title: 'Regex Racer', short: 'SOON', glyph: '🏁', tagline: 'Coming soon: match the pattern before the timer.', tech: 'HTML5', genre: 'Racing', controls: '—', plays: '—', rating: 0, soon: true,
    theme: { bg: '#3a2a00', fg: '#fff6d6', accent: '#ffd43b', accentFg: '#2b2000', soft: '#4d3a08' } },
  { id: 'soon-3', title: 'Binary Blocks', short: 'SOON', glyph: '🧱', tagline: 'Coming soon: stack bits, clear bytes.', tech: 'Python', genre: 'Puzzle', controls: '—', plays: '—', rating: 0, soon: true,
    theme: { bg: '#00333a', fg: '#e6fdff', accent: '#2fe0f0', accentFg: '#002a30', soft: '#07474f' } },
];

const SCORES = ['ADA', 'LINUS', 'GRACE', 'ALAN', 'SUFFN', 'KATHERINE', 'GUIDO', 'MARGARET', 'DENNIS', 'BARBARA'];

const params = new URLSearchParams(location.search);
const style = STYLES.find(s => s.id === params.get('style')) || STYLES[0];
const game = GAMES.find(g => g.id === params.get('game')) || GAMES[0];
const page = document.body.dataset.page;

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else if (k.startsWith('--')) e.style.setProperty(k, v); else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const link = (p, extra = {}) => `${p}?${new URLSearchParams({ style: style.id, ...extra })}`;
const themeVars = g => ({ '--g-bg': g.theme.bg, '--g-fg': g.theme.fg, '--g-accent': g.theme.accent, '--g-accent-fg': g.theme.accentFg, '--g-soft': g.theme.soft });
const stars = r => r ? '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r)) : 'not rated';

// ---- stylesheet + fonts for the chosen style
if (page !== 'gallery') document.head.append(
  h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${style.fonts}&display=swap` }),
  h('link', { rel: 'stylesheet', href: 'styles/_base.css' }),
  h('link', { rel: 'stylesheet', href: `styles/${style.id}.css` }),
  h('link', { rel: 'stylesheet', href: 'lab.css' }),
);
document.body.classList.add('style-' + style.id);
document.title = `${style.name} · ${page === 'game' ? game.title : 'Browse'} · Design lab`;

// ---- shared header / footer
function header() {
  return h('header', { class: 'site-head' },
    h('a', { class: 'logo', href: link('hub.html') }, h('span', { class: 'logo-mark' }, '4'), h('span', { class: 'logo-text' }, 'InfoM4th ', h('b', {}, 'Arcade'))),
    h('nav', { class: 'nav' }, ['Browse', 'New', 'Top rated', 'Leaderboards', 'About'].map((t, i) => h('a', { href: '#', class: i === 0 ? 'active' : '' }, t))),
    h('label', { class: 'search' }, h('span', { class: 'search-icon' }, '⌕'), h('input', { placeholder: 'Search games', 'aria-label': 'Search games' })),
    h('div', { class: 'user' }, h('span', { class: 'avatar' }, 'P1'), h('span', { class: 'user-name' }, 'PLAYER ONE'), h('span', { class: 'btn btn-ghost btn-small' }, 'Change')),
  );
}
function footer() {
  return h('footer', { class: 'site-foot' },
    h('p', {}, 'InfoM4th Arcade · made by the club · ', h('a', { href: '#' }, 'About'), ' · ', h('a', { href: '#' }, 'Licences')),
    h('p', { class: 'foot-note' }, 'Design lab mockup: style “' + style.name + '”. Nothing on this page works.'));
}

function cover(g, big) {
  return h('span', { class: 'cover-art' + (big ? ' big' : '') },
    h('span', { class: 'cover-glyph', 'aria-hidden': 'true' }, g.glyph),
    h('span', { class: 'cover-title' }, g.short),
    g.soon ? h('span', { class: 'ribbon' }, 'Soon') : null);
}

function card(g) {
  return h('li', Object.assign({ class: 'card' + (g.soon ? ' is-soon' : '') }, themeVars(g)),
    h('a', { class: 'cover', href: link('game.html', { game: g.id }) }, cover(g), h('span', { class: 'badge' }, g.tech)),
    h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, h('a', { href: link('game.html', { game: g.id }) }, g.title)),
      h('p', { class: 'card-author' }, 'by InfoM4th Club'),
      h('p', { class: 'card-desc' }, g.tagline),
      h('div', { class: 'card-meta' }, h('span', { class: 'tag' }, g.genre), h('span', { class: 'tag' }, g.controls.split(' · ')[0]), h('span', { class: 'plays' }, g.soon ? 'coming soon' : `${g.plays} plays`))),
    h('div', { class: 'card-actions' }, h('a', { class: 'btn btn-play', href: link('game.html', { game: g.id }) }, g.soon ? 'Notify me' : 'Play'), h('span', { class: 'hiscore' }, g.soon ? '' : 'HI 12,480 · ADA')));
}

function renderHub() {
  const featured = GAMES[0];
  const filters = [['Genre', ['Arcade', 'Puzzle', 'Quiz', 'Shooter', 'Typing']], ['Controls', ['Keyboard', 'Mouse', 'Touch']], ['Made with', ['HTML5', 'Python', 'WebAssembly']]];
  document.body.append(
    header(),
    h('div', { class: 'layout' },
      h('aside', { class: 'filters' }, filters.map(([title, items]) => h('section', { class: 'filter' }, h('h3', {}, title), h('ul', {}, items.map((t, i) => h('li', {}, h('label', {}, h('input', { type: 'checkbox', ...(i === 0 && title === 'Genre' ? { checked: '' } : {}) }), ' ', t))))))),
      h('main', { class: 'browse' },
        h('section', Object.assign({ class: 'featured' }, themeVars(featured)),
          h('a', { class: 'cover featured-cover', href: link('game.html', { game: featured.id }) }, cover(featured, true)),
          h('div', { class: 'featured-body' }, h('p', { class: 'eyebrow' }, 'Featured game'), h('h2', {}, featured.title), h('p', {}, featured.tagline + ' Coins, medals and a coin-toss second chance.'),
            h('div', { class: 'featured-actions' }, h('a', { class: 'btn btn-play btn-big', href: link('game.html', { game: featured.id }) }, 'Play now'), h('span', { class: 'btn btn-ghost' }, 'Leaderboard')))),
        h('div', { class: 'browse-head' }, h('h1', {}, 'Browse games'), h('p', { class: 'count' }, `${GAMES.length} results`),
          h('div', { class: 'sort' }, h('span', {}, 'Sort by'), ['Popular', 'New', 'Top rated'].map((t, i) => h('span', { class: 'chip' + (i === 0 ? ' active' : '') }, t)))),
        h('ul', { class: 'grid' }, GAMES.map(card)))),
    footer(),
  );
}

function renderGame() {
  const g = game;
  Object.entries(themeVars(g)).forEach(([k, v]) => document.body.style.setProperty(k, v));
  document.body.classList.add('game-' + g.id);
  const info = [['Status', g.soon ? 'In development' : 'Released'], ['Platforms', 'Browser'], ['Author', 'InfoM4th Club'], ['Genre', g.genre], ['Made with', g.tech], ['Controls', g.controls], ['Rating', stars(g.rating)]];
  document.body.append(
    header(),
    h('section', { class: 'game-banner' }, h('div', { class: 'banner-inner' }, h('span', { class: 'banner-glyph', 'aria-hidden': 'true' }, g.glyph), h('div', {}, h('h1', { class: 'game-title' }, g.title), h('p', { class: 'game-tagline' }, g.tagline)))),
    h('div', { class: 'game-layout' },
      h('main', { class: 'game-main' },
        h('div', { class: 'embed' },
          h('div', { class: 'embed-screen' }, h('span', { class: 'embed-glyph', 'aria-hidden': 'true' }, g.glyph), h('span', { class: 'btn btn-run' }, '▶  Run game'), h('p', { class: 'embed-hint' }, 'Placeholder · the game would load here')),
          h('div', { class: 'embed-bar' }, h('span', { class: 'embed-name' }, g.title), h('span', { class: 'embed-tools' }, h('span', { class: 'btn btn-ghost btn-small' }, '⛶ Fullscreen'), h('span', { class: 'btn btn-ghost btn-small' }, '♪ Sound')))),
        h('section', { class: 'desc' }, h('h2', {}, 'About this game'),
          h('p', {}, g.tagline + ' Built by the InfoM4th club to make practising Python a little more fun.'),
          h('p', {}, 'Lorem ipsum placeholder text: every round gets a bit harder, every run ends on the shared leaderboard under your name. Beat your friends, then beat yourself.')),
        h('section', { class: 'shots' }, h('h2', {}, 'Screenshots'), h('div', { class: 'shot-row' }, [1, 2, 3].map(i => h('div', { class: 'shot' }, h('span', {}, `Screenshot ${i}`))))),
        h('section', { class: 'controls-sec' }, h('h2', {}, 'Controls'),
          h('table', { class: 'controls' }, h('tbody', {}, [['Space / ↑', 'Main action'], ['P', 'Pause'], ['Esc', 'Back to menu'], ['Tap', 'Main action on phones']].map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))))),
        h('section', { class: 'comments' }, h('h2', {}, 'Comments'),
          [['GRACE', 'Got 31 gates, gold wings!'], ['LINUS', 'The second-chance coin flip is evil. Love it.']].map(([n, t]) => h('div', { class: 'comment' }, h('span', { class: 'avatar' }, n[0]), h('div', {}, h('b', {}, n), h('p', {}, t)))))),
      h('aside', { class: 'game-side' },
        h('div', { class: 'panel play-panel' }, h('span', { class: 'btn btn-play btn-big' }, g.soon ? 'Coming soon' : 'Play now'), h('p', { class: 'player-line' }, 'Playing as ', h('b', {}, 'PLAYER ONE')), h('span', { class: 'btn btn-ghost btn-small' }, 'Change name')),
        h('div', { class: 'panel scores' }, h('h3', {}, 'High scores'), h('ol', {}, SCORES.map((n, i) => h('li', { class: n === 'SUFFN' ? 'me' : '' }, h('span', { class: 'rank' }, i + 1), h('span', { class: 'n' }, n), h('span', { class: 's' }, String(12480 - i * 1137)))))),
        h('div', { class: 'panel info' }, h('h3', {}, 'More information'), h('table', {}, h('tbody', {}, info.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))))),
        h('div', { class: 'panel more' }, h('h3', {}, 'More games'), h('ul', {}, GAMES.filter(x => x.id !== g.id).slice(0, 4).map(x => h('li', themeVars(x), h('a', { href: link('game.html', { game: x.id }) }, h('span', { class: 'mini-cover' }, x.glyph), h('span', {}, x.title)))))))),
    footer(),
  );
}

// ---- lab switcher bar (not part of any style)
function labBar() {
  const sel = (label, options, value, onChange) => h('label', {}, label, ' ',
    (() => { const s = h('select', {}, options.map(([v, t]) => { const o = h('option', { value: v }, t); if (v === value) o.selected = true; return o; })); s.onchange = () => onChange(s.value); return s; })());
  const go = (p, extra) => { location.href = `${p}?${new URLSearchParams({ style: style.id, game: game.id, ...extra })}`; };
  const idx = STYLES.indexOf(style);
  const step = d => go(page === 'game' ? 'game.html' : 'hub.html', { style: STYLES[(idx + d + STYLES.length) % STYLES.length].id });
  const bar = h('div', { id: 'lab-bar' },
    h('a', { href: 'index.html', class: 'lab-home' }, '◧ All styles'),
    h('button', { type: 'button', title: 'Previous style' }, '◀'),
    sel('Style', STYLES.map((s, i) => [s.id, `${i + 1}. ${s.name}`]), style.id, v => go(page === 'game' ? 'game.html' : 'hub.html', { style: v })),
    h('button', { type: 'button', title: 'Next style' }, '▶'),
    sel('Page', [['hub', 'Browse page'], ['game', 'Game page']], page, v => go(v === 'game' ? 'game.html' : 'hub.html')),
    page === 'game' ? sel('Game', GAMES.map(g => [g.id, g.title]), game.id, v => go('game.html', { game: v })) : null,
    h('span', { class: 'lab-tip' }, '← → keys switch style'));
  const [prev, next] = bar.querySelectorAll('button');
  prev.onclick = () => step(-1); next.onclick = () => step(1);
  document.addEventListener('keydown', e => { if (e.target.closest('input, select')) return; if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });
  document.body.append(bar);
}

function renderGallery() {
  document.head.append(h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${STYLES.map(s => s.fonts).join('&')}&display=swap` }));
  const list = document.getElementById('styles');
  STYLES.forEach((s, i) => {
    const [bg, fg, a1, a2] = s.swatch;
    list.append(h('li', { class: 'style-card' },
      h('div', { class: 'preview', style: `background:${bg};color:${fg}` },
        h('span', { class: 'p-title', style: `font-family:${s.face}` }, 'InfoM4th Arcade'),
        h('span', { class: 'p-row' }, h('span', { class: 'p-btn', style: `background:${a1};color:${bg}` }, 'Play'), h('span', { class: 'p-btn', style: `background:${a2};color:${fg === '#ffffff' ? '#111' : fg}` }, 'Scores')),
        h('span', { class: 'p-swatches' }, s.swatch.map(c => h('i', { style: `background:${c}` })))),
      h('div', { class: 'meta' }, h('h2', {}, `${i + 1}. ${s.name}`), h('p', {}, s.blurb),
        h('p', { class: 'links' }, h('a', { href: `hub.html?style=${s.id}` }, 'Browse page →'), h('a', { href: `game.html?style=${s.id}&game=flappy` }, 'Game page →')))));
  });
}

if (page === 'hub') renderHub(); else if (page === 'game') renderGame(); else if (page === 'gallery') renderGallery();
if (page !== 'gallery') labBar();
// placeholders: links inside the mockup that would "do something" go nowhere
document.addEventListener('click', e => { const a = e.target.closest('a[href="#"]'); if (a) e.preventDefault(); });
