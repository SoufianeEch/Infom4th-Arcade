'use strict';
// InfoM4th Arcade hub: store-style browse page, game pages with click-to-run embeds,
// shared leaderboards, and a mandatory player name before any game runs.
(function () {
  const $ = id => document.getElementById(id);
  const NAME_KEY = 'infom4th.arcade.name';
  const NAME_RE = /^[A-Za-z0-9 _.\-]{1,12}$/;
  const RESERVED = ['anon', 'anonymous', 'guest', 'player', 'unknown'];   // no default names: players choose their own
  let games = [];
  let current = null;
  let name = '';
  const state = { q: '', sort: 'featured', filters: { genre: new Set(), madeWith: new Set(), touch: false } };

  // ------------------------------------------------------------ helpers
  function safeGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k.startsWith('--')) e.style.setProperty(k, v); else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  const isColor = c => /^#[0-9a-f]{3,8}$/i.test(c || '');
  function themeVars(g) {
    const t = g.theme || {}, out = {};
    for (const [k, v] of [['--g-bg', t.bg], ['--g-fg', t.fg], ['--g-accent', t.accent], ['--g-accent-fg', t.accentFg], ['--g-soft', t.soft]]) if (isColor(v)) out[k] = v;
    return out;
  }
  const short = g => g.short || g.title.replace(/^InfoM4th\s+/i, '').split(/\s+/)[0].toUpperCase();
  const glyph = g => g.glyph || short(g).charAt(0);
  const touchOk = g => !!(g.controls && g.controls.touch && !/not supported/i.test(g.controls.touch));
  function cleanName(v) { return String(v || '').trim().replace(/\s+/g, ' '); }
  function nameProblem(v) {
    v = cleanName(v);
    if (!v) return 'Type your name to play.';
    if (!NAME_RE.test(v)) return 'Use 1-12 letters, digits, space, _ . -';
    if (RESERVED.includes(v.toLowerCase())) return 'Please choose your own name.';
    return '';
  }
  async function json(url, opts) {
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'HTTP ' + r.status);
    return body;
  }
  const topScores = id => json('/api/scores/' + id).catch(() => []);

  // ------------------------------------------------------------ player name (required before any game runs)
  function showWho() {
    $('who').hidden = !name;
    $('who-name').textContent = name;
    $('avatar').textContent = name.charAt(0);
    $('play-name').textContent = name || '(nobody yet)';
  }
  /** Opens the name dialog. Resolves with the chosen name, or null if the player cancelled. */
  function askName(canCancel) {
    return new Promise(resolve => {
      const dlg = $('name-dialog'), input = $('name-input');
      input.value = name;
      $('name-error').textContent = '';
      $('name-cancel').hidden = !canCancel;
      let settled = false;
      const done = value => { if (settled) return; settled = true; cleanup(); if (dlg.open) dlg.close(); resolve(value); };
      const onSubmit = e => {
        e.preventDefault();
        const problem = nameProblem(input.value);
        if (problem) { $('name-error').textContent = problem; input.focus(); return; }
        name = cleanName(input.value);
        safeSet(NAME_KEY, name);
        showWho();
        done(name);
      };
      const onCancel = e => { e.preventDefault(); if (canCancel) done(null); else $('name-error').textContent = 'You need a name to play.'; };
      const onInput = () => { $('name-error').textContent = ''; };
      function cleanup() {
        $('name-form').removeEventListener('submit', onSubmit);
        $('name-cancel').removeEventListener('click', onCancel);
        dlg.removeEventListener('cancel', onCancel);
        input.removeEventListener('input', onInput);
      }
      $('name-form').addEventListener('submit', onSubmit);
      $('name-cancel').addEventListener('click', onCancel);
      dlg.addEventListener('cancel', onCancel);          // Esc key
      input.addEventListener('input', onInput);
      dlg.showModal();
      input.focus(); input.select();
    });
  }
  async function changeName() { const n = await askName(true); if (n && current) refreshBoard(); }

  // ------------------------------------------------------------ browse page
  function coverArt(g, big) {
    return el('span', { class: 'cover-art' + (big ? ' big' : '') }, el('span', { class: 'cover-glyph', 'aria-hidden': 'true' }, glyph(g)), el('span', { class: 'cover-title' }, short(g)));
  }
  function card(g) {
    const href = '#/play/' + g.id;
    const hi = el('span', { class: 'hiscore', 'data-game': g.id });
    return el('li', Object.assign({ class: 'card' }, themeVars(g)),
      el('a', { class: 'cover', href, 'aria-label': g.title }, coverArt(g), g.madeWith ? el('span', { class: 'badge' }, g.madeWith) : null),
      el('div', { class: 'card-body' },
        el('h2', { class: 'card-title' }, el('a', { href }, g.title)),
        el('p', { class: 'card-desc' }, g.tagline || ''),
        el('div', { class: 'card-meta' }, g.genre ? el('span', { class: 'tag' }, g.genre) : null, el('span', { class: 'tag' }, touchOk(g) ? 'Touch + keys' : 'Keyboard'))),
      el('div', { class: 'card-actions' }, el('a', { class: 'btn btn-play', href }, 'Play'), g.scoring && g.scoring.enabled ? hi : null));
  }
  function filtered() {
    const q = state.q.toLowerCase(), f = state.filters;
    let list = games.filter(g =>
      (!q || [g.title, g.tagline, g.genre, g.madeWith, ...(g.tags || [])].join(' ').toLowerCase().includes(q)) &&
      (!f.genre.size || f.genre.has(g.genre)) && (!f.madeWith.size || f.madeWith.has(g.madeWith)) && (!f.touch || touchOk(g)));
    if (state.sort === 'az') list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }
  function renderFilters() {
    const box = $('filters'); box.textContent = '';
    const group = (title, key) => {
      const values = [...new Set(games.map(g => g[key]).filter(Boolean))].sort();
      if (!values.length) return null;
      return el('section', { class: 'filter' }, el('h3', {}, title), el('ul', {}, values.map(v => el('li', {}, el('label', {},
        el('input', { type: 'checkbox', checked: state.filters[key].has(v), onchange: e => { e.target.checked ? state.filters[key].add(v) : state.filters[key].delete(v); renderGrid(); } }), v)))));
    };
    box.append(group('Genre', 'genre') || '', group('Made with', 'madeWith') || '',
      el('section', { class: 'filter' }, el('h3', {}, 'Plays on'), el('ul', {}, el('li', {}, el('label', {}, el('input', { type: 'checkbox', checked: state.filters.touch, onchange: e => { state.filters.touch = e.target.checked; renderGrid(); } }), 'Phones (touch)')))));
  }
  function renderSort() {
    const box = $('sort'); box.textContent = '';
    box.append(el('span', {}, 'Sort by'), ...[['featured', 'Featured'], ['az', 'A–Z']].map(([v, t]) =>
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.sort === v), onclick: () => { state.sort = v; renderSort(); renderGrid(); } }, t)));
  }
  function renderFeatured() {
    const g = games.find(x => x.featured) || games[0], box = $('featured');
    box.textContent = '';
    if (!g) { box.hidden = true; return; }
    Object.entries(themeVars(g)).forEach(([k, v]) => box.style.setProperty(k, v));
    box.append(
      el('a', { class: 'cover featured-cover', href: '#/play/' + g.id, 'aria-label': g.title }, coverArt(g, true)),
      el('div', { class: 'featured-body' }, el('p', { class: 'eyebrow' }, 'Featured game'), el('h2', {}, g.title), el('p', {}, g.description || g.tagline || ''),
        el('div', { class: 'featured-actions' }, el('a', { class: 'btn btn-play btn-big', href: '#/play/' + g.id }, 'Play now'), g.scoring && g.scoring.enabled ? el('a', { class: 'btn btn-ghost', href: '#/scores' }, 'Leaderboard') : null)));
    box.hidden = !!(state.q || state.filters.genre.size || state.filters.madeWith.size || state.filters.touch);
  }
  function renderGrid() {
    const list = filtered(), ul = $('games');
    ul.textContent = '';
    list.forEach(g => ul.append(card(g)));
    $('count').textContent = `${list.length} ${list.length === 1 ? 'game' : 'games'}`;
    $('menu-error').hidden = list.length > 0;
    $('menu-error').textContent = games.length ? 'No games match. Try another search or filter.' : 'No games found.';
    renderFeatured();
    loadHiScores();
  }
  function loadHiScores() {
    for (const hi of document.querySelectorAll('.hiscore[data-game]'))
      topScores(hi.dataset.game).then(rows => { hi.textContent = rows[0] ? `HI ${rows[0].score} · ${rows[0].name}` : 'no scores yet'; });
  }

  // ------------------------------------------------------------ game page
  async function refreshBoard() {
    const side = $('side'), ol = $('board');
    if (!current || !current.scoring || !current.scoring.enabled) { side.hidden = true; return; }
    side.hidden = false;
    const rows = await topScores(current.id);
    ol.textContent = '';
    if (!rows.length) { ol.append(el('li', { class: 'empty' }, 'No scores yet. Be the first!')); return; }
    for (const r of rows) ol.append(el('li', { class: name && r.name.toLowerCase() === name.toLowerCase() ? 'me' : null }, el('span', { class: 'n' }, r.name), el('span', { class: 's' }, r.score)));
  }
  let toastTimer;
  function toast(msg) { $('toast').textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000); }

  function sizeHead() { const h = document.querySelector('.site-head'); if (h) document.documentElement.style.setProperty('--head-h', Math.ceil(h.getBoundingClientRect().height) + 'px'); }
  window.addEventListener('resize', sizeHead);

  function showGame(g) {
    current = g;
    const [w, h] = String(g.aspect || '16/10').split('/').map(Number);
    const stage = $('stage');
    stage.style.setProperty('--ar', `${w} / ${h}`);
    stage.style.setProperty('--ar-n', String(w / h));
    for (const k of ['--g-bg', '--g-fg', '--g-accent', '--g-accent-fg', '--g-soft']) document.body.style.removeProperty(k);
    Object.entries(themeVars(g)).forEach(([k, v]) => document.body.style.setProperty(k, v));
    $('g-glyph').textContent = glyph(g); $('cover-glyph').textContent = glyph(g);
    $('now-playing').textContent = g.title; $('now-tagline').textContent = g.tagline || '';
    $('embed-name').textContent = g.title;
    $('embed-hint').textContent = g.sizeHint === 'large' ? 'Big download (about 30 MB). Loads when you press Run.' : 'Loads when you press Run.';
    $('g-desc').textContent = g.description || g.tagline || '';
    const c = g.controls || {};
    $('g-controls').replaceChildren(...[['Keyboard', c.keyboard], ['Touch', c.touch]].filter(r => r[1]).map(([k, v]) => el('tr', {}, el('td', {}, el('kbd', {}, k)), el('td', {}, v))));
    $('g-info').replaceChildren(...[['Genre', g.genre], ['Made with', g.madeWith], ['Plays on', touchOk(g) ? 'Computer, phone' : 'Computer (keyboard)'], ['Scores', g.scoring && g.scoring.enabled ? 'Shared leaderboard (' + (g.scoring.label || 'points') + ')' : 'No scores'], ['Tags', (g.tags || []).join(', ')]]
      .filter(r => r[1]).map(([k, v]) => el('tr', {}, el('th', {}, k), el('td', {}, v))));
    $('g-more').replaceChildren(...games.filter(x => x.id !== g.id).slice(0, 4).map(x => el('li', themeVars(x), el('a', { href: '#/play/' + x.id }, el('span', { class: 'mini-cover', 'aria-hidden': 'true' }, glyph(x)), el('span', {}, x.title)))));
    stopGame();
    document.title = g.title + ' · InfoM4th Arcade';
    $('toast').textContent = '';
    showWho();
    refreshBoard();
    sizeHead();
    window.scrollTo(0, 0);
  }
  /** Click-to-run: the game only loads after the player has a name. */
  async function runGame() {
    if (!current) return;
    if (nameProblem(name)) { const chosen = await askName(true); if (!chosen) return; }
    const g = current;
    $('embed-cover').hidden = true;
    $('stage').classList.add('running');
    const frame = $('frame');
    frame.hidden = false;
    frame.src = '/games/' + g.id + '/' + (g.entry || 'index.html');
    frame.addEventListener('load', () => { try { frame.contentWindow.focus(); } catch {} }, { once: true });
  }
  function stopGame() {
    document.body.classList.remove('fs-fallback');
    $('frame').src = 'about:blank';       // frees the game (Doom is heavy)
    $('frame').hidden = true;
    $('embed-cover').hidden = false;
    $('stage').classList.remove('running');
  }

  // ------------------------------------------------------------ leaderboards page
  async function renderBoards() {
    const box = $('boards'); box.textContent = '';
    for (const g of games.filter(x => x.scoring && x.scoring.enabled)) {
      const ol = el('ol');
      box.append(el('div', Object.assign({ class: 'panel scores' }, themeVars(g)), el('h3', {}, el('a', { href: '#/play/' + g.id }, glyph(g) + ' ' + g.title)), ol));
      topScores(g.id).then(rows => {
        if (!rows.length) ol.append(el('li', { class: 'empty' }, 'No scores yet.'));
        rows.forEach(r => ol.append(el('li', { class: name && r.name.toLowerCase() === name.toLowerCase() ? 'me' : null }, el('span', { class: 'n' }, r.name), el('span', { class: 's' }, r.score))));
      });
    }
  }

  // ------------------------------------------------------------ routing
  function view(which) {
    $('view-browse').hidden = which !== 'browse';
    $('view-game').hidden = which !== 'game';
    $('view-scores').hidden = which !== 'scores';
    $('nav-browse').classList.toggle('active', which === 'browse');
    $('nav-scores').classList.toggle('active', which === 'scores');
  }
  function route() {
    const m = location.hash.match(/^#\/play\/([a-z0-9-]+)$/);
    const g = m && games.find(x => x.id === m[1]);
    if (g) { view('game'); showGame(g); return; }
    current = null; stopGame();
    for (const k of ['--g-bg', '--g-fg', '--g-accent', '--g-accent-fg', '--g-soft']) document.body.style.removeProperty(k);
    if (location.hash === '#/scores') { view('scores'); document.title = 'Leaderboards · InfoM4th Arcade'; renderBoards(); return; }
    view('browse'); document.title = 'InfoM4th Arcade'; renderGrid();
  }

  // ------------------------------------------------------------ scores from the running game
  window.addEventListener('message', async e => {
    if (e.origin !== location.origin || e.source !== $('frame').contentWindow || !current) return;
    const d = e.data || {};
    if (d.type === 'arcade:exit') stopGame();
    else if (d.type === 'arcade:score' && current.scoring && current.scoring.enabled && Number.isSafeInteger(d.value) && d.value > 0 && !nameProblem(name)) {
      try {
        const r = await json('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: current.id, name, score: d.value }) });
        toast(r.improved ? `Saved ${d.value} for ${name}!` : `${d.value}: not your best`);
        refreshBoard();
      } catch (err) { toast('Score not saved: ' + err.message); }
    }
  });

  async function fullscreen() {
    if (!$('stage').classList.contains('running')) await runGame();
    if (!$('stage').classList.contains('running')) return;
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} return; }
    if (document.body.classList.contains('fs-fallback')) { document.body.classList.remove('fs-fallback'); return; }
    try { await $('stage').requestFullscreen(); } catch { document.body.classList.add('fs-fallback'); }   // e.g. iPhone Safari
    try { $('frame').contentWindow.focus(); } catch {}
  }

  $('run').addEventListener('click', runGame);
  $('play-btn').addEventListener('click', runGame);
  $('fs').addEventListener('click', fullscreen);
  $('back').addEventListener('click', () => { location.hash = '#/'; });
  $('change-name').addEventListener('click', changeName);
  $('change-name-2').addEventListener('click', changeName);
  $('search').addEventListener('input', e => { state.q = e.target.value.trim(); if (location.hash.startsWith('#/play') || location.hash === '#/scores') location.hash = '#/'; else renderGrid(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('fs-fallback')) document.body.classList.remove('fs-fallback'); });
  window.addEventListener('hashchange', route);

  const saved = cleanName(safeGet(NAME_KEY));
  name = nameProblem(saved) ? '' : saved;            // a stored name that breaks the rules (e.g. the retired default name) is dropped
  showWho();

  json('/api/games').then(list => { games = list; renderFilters(); renderSort(); route(); })
    .catch(e => { $('menu-error').hidden = false; $('menu-error').textContent = 'Could not load games: ' + e.message; });
})();
