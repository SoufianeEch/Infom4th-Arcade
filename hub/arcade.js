'use strict';
// Arcade hub v0: game list, iframe player, shared leaderboard. No styling on purpose.
(function () {
  const $ = id => document.getElementById(id);
  let games = [];
  let current = null;

  function safeGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function playerName() { return ($('player').value.trim() || 'ANON').slice(0, 12); }

  async function json(url, opts) {
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'HTTP ' + r.status);
    return body;
  }

  function renderMenu() {
    const ul = $('games');
    ul.textContent = '';
    if (!games.length) { ul.innerHTML = '<li>No games found.</li>'; return; }
    for (const g of games) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#/play/' + g.id;
      a.textContent = g.title;
      li.append(a, ' — ' + (g.tagline || ''));
      const c = g.controls || {};
      if (c.keyboard || c.touch) li.append(document.createElement('br'), 'Controls: ' + [c.keyboard && 'keyboard ' + c.keyboard, c.touch && 'touch ' + c.touch].filter(Boolean).join(' | '));
      ul.append(li);
    }
  }

  async function refreshBoard() {
    const ol = $('board');
    if (!current || !current.scoring?.enabled) { ol.textContent = ''; ol.hidden = true; $('board').previousElementSibling.hidden = true; return; }
    ol.hidden = false; $('board').previousElementSibling.hidden = false;
    try {
      const rows = await json('/api/scores/' + current.id);
      ol.textContent = '';
      if (!rows.length) ol.innerHTML = '<li>No scores yet — be the first.</li>';
      for (const r of rows) { const li = document.createElement('li'); li.textContent = `${r.name} — ${r.score} ${current.scoring.label || ''}`; ol.append(li); }
    } catch (e) { ol.textContent = 'Could not load scores: ' + e.message; }
  }

  function toast(msg) { $('toast').textContent = msg; setTimeout(() => { if ($('toast').textContent === msg) $('toast').textContent = ''; }, 4000); }

  function show(id) {
    const g = games.find(x => x.id === id);
    if (!g) { location.hash = '#/'; return; }
    current = g;
    $('menu').hidden = true; $('player-view').hidden = false;
    $('now-playing').textContent = g.title;
    $('frame').src = '/games/' + g.id + '/' + (g.entry || 'index.html');
    refreshBoard();
    $('frame').addEventListener('load', () => { try { $('frame').contentWindow.focus(); } catch {} }, { once: true });
  }

  function hide() {
    current = null;
    $('frame').src = 'about:blank';       // frees the game (Doom is heavy)
    $('player-view').hidden = true; $('menu').hidden = false;
  }

  function route() {
    const m = location.hash.match(/^#\/play\/([a-z0-9-]+)$/);
    if (m && games.length) show(m[1]); else hide();
  }

  window.addEventListener('message', async e => {
    if (e.origin !== location.origin || e.source !== $('frame').contentWindow || !current) return;
    const d = e.data || {};
    if (d.type === 'arcade:exit') location.hash = '#/';
    else if (d.type === 'arcade:score' && current.scoring?.enabled && Number.isSafeInteger(d.value) && d.value > 0) {
      try {
        const r = await json('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: current.id, name: playerName(), score: d.value }) });
        toast(r.improved ? `Saved ${d.value} as ${playerName()}` : `${d.value} — not your best`);
        refreshBoard();
      } catch (err) { toast('Score not saved: ' + err.message); }
    }
  });

  $('player').value = safeGet('infom4th.arcade.name');
  $('player').addEventListener('change', () => safeSet('infom4th.arcade.name', $('player').value.trim()));
  $('back').addEventListener('click', () => { location.hash = '#/'; });
  $('fs').addEventListener('click', () => { $('frame').requestFullscreen?.().catch(() => {}); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && current && document.activeElement === document.body) location.hash = '#/'; });
  window.addEventListener('hashchange', route);

  json('/api/games').then(list => { games = list; renderMenu(); route(); })
    .catch(e => { $('games').textContent = ''; $('menu-error').hidden = false; $('menu-error').textContent = 'Could not load games: ' + e.message; });
})();
