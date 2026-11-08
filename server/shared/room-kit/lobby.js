'use strict';
// Room kit: generic lobby client (join, lobby, countdown, reactions, reconnect) for the arcade's multiplayer games.
// Talks to the room system over WebSocket (/ws). A game page adds its own screens/logic with Room.on('role' | 'started' | 'room' | 'g' | ...).
(function () {
  const $ = id => document.getElementById(id);
  const FX = window.FX;
  const NAME_KEY = 'infom4th.arcade.name';
  const AVATAR_KEY = 'infom4th.imposter.avatar';
  const SESSION_KEY = 'infom4th.imposter.session';
  const NAME_RE = /^[A-Za-z0-9 _.\-]{1,12}$/;
  const RESERVED = ['anon', 'anonymous', 'guest', 'player', 'unknown'];
  const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐧', '🦖', '🐝', '🦋', '🐳', '🐢', '🦀', '🐰', '🦁'];
  const REACTIONS = ['👍', '😂', '🔥', '👀', '😱', '🎉', '❤️', '🤔'];
  const STICKERS = ['#ffd6d6', '#ffe8b3', '#fff3a8', '#d7f5c1', '#bdf0e0', '#bfe6ff', '#cfd6ff', '#e5cfff', '#ffd0f0', '#ffccb3', '#d9e2e8', '#c9f0ff'];

  const GAME = document.body.dataset.game || 'imposter';        // which game this room hosts (server/rooms.cjs GAME_DEFS)
  const listeners = {};
  const emit = (type, m) => (listeners[type] || []).forEach(fn => { try { fn(m); } catch (e) { console.error(e); } });
  const S = { ws: null, me: null, code: null, token: null, room: null, wantOpen: false, tries: 0, avatar: AVATARS[0], seen: new Set(), role: null, revealed: false };

  // ------------------------------------------------------------ helpers
  const safe = { get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    sget(k) { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }, sset(k, v) { try { sessionStorage.setItem(k, v); } catch {} }, sdel(k) { try { sessionStorage.removeItem(k); } catch {} } };
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const cleanName = v => String(v || '').trim().replace(/\s+/g, ' ');
  function nameProblem(v) {
    v = cleanName(v);
    if (!v) return 'Type your name to play.';
    if (!NAME_RE.test(v)) return 'Use 1-12 letters, digits, space, _ . -';
    if (RESERVED.includes(v.toLowerCase())) return 'Please choose your own name.';
    return '';
  }
  const SCREENS = ['join', 'lobby', 'reveal', 'game'];
  function show(which) {
    for (const id of SCREENS) { const e = $('screen-' + id); if (e) e.hidden = id !== which; }
    window.scrollTo(0, 0);
  }
  function toast(text, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), text);
    $('toasts').append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  function flash(color) { const f = $('flash'); f.style.setProperty('--flash', color); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function shake() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); }
  const sticker = p => STICKERS[p.color % STICKERS.length];

  // ------------------------------------------------------------ connection
  function connect() {
    if (S.ws && (S.ws.readyState === WebSocket.OPEN || S.ws.readyState === WebSocket.CONNECTING)) return;
    $('conn-status').textContent = '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    S.ws = ws;
    ws.onopen = () => {
      S.tries = 0;
      const saved = S.token && S.code ? { code: S.code, token: S.token } : null;
      if (saved && S.wantOpen) send({ t: 'rejoin', ...saved });
      else if (S.pending) { send(S.pending); S.pending = null; }
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      S.ws = null;
      if (S.token && S.code && S.tries < 25) {                         // lost connection while in a room: try to get our seat back
        S.tries++;
        $('lobby-hint').textContent = 'Connection lost. Reconnecting…';
        setTimeout(connect, Math.min(4000, 400 * S.tries));
      } else if (S.pending) { $('join-error').textContent = 'Could not reach the server. Try again.'; S.pending = null; setBusy(false); }
    };
  }
  function send(m) { if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(m)); }
  function request(m) { S.pending = m; setBusy(true); if (S.ws && S.ws.readyState === WebSocket.OPEN) { send(m); S.pending = null; } else connect(); }
  function setBusy(b) { $('create').disabled = b; $('join').disabled = b; }

  // ------------------------------------------------------------ incoming messages
  function onMessage(m) {
    switch (m.t) {
      case 'welcome':
        S.me = m.id; S.code = m.code; S.token = m.token; S.wantOpen = true;
        safe.sset(SESSION_KEY, JSON.stringify({ code: m.code, token: m.token }));
        setBusy(false);
        if (!m.rejoined) { FX.SFX.pop(); }
        break;
      case 'room': onRoom(m); break;
      case 'event': onEvent(m); break;
      case 'react': {
        const card = document.querySelector(`[data-id="${m.id}"]`);
        FX.floatEmoji(m.emoji, card); FX.SFX.react();
        if (card) { card.classList.remove('wiggle'); void card.offsetWidth; card.classList.add('wiggle'); }
        break;
      }
      case 'countdown': {
        $('countdown').hidden = false;
        const n = $('count-num'); n.textContent = m.n; n.classList.remove('boom'); void n.offsetWidth; n.classList.add('boom');
        FX.SFX.tick(m.n);
        break;
      }
      case 'cancelled': $('countdown').hidden = true; toast(m.reason || 'Start cancelled.', 'warn'); FX.SFX.bye(); break;
      case 'started': $('countdown').hidden = true; FX.SFX.go(); FX.rain(60); emit('started', m); break;
      case 'lobby': $('countdown').hidden = true; show('lobby'); toast('Back in the lobby.'); emit('lobby', m); break;
      case 'kicked': toast('You were removed from the room.', 'warn'); leaveLocal(); break;
      case 'error': onError(m); break;
      default: emit(m.t, m); break;                                      // role, gstart, g, gend ... belong to the game page
    }
  }

  function onError(m) {
    setBusy(false);
    emit('error', m);
    if (m.code === 'no_room' && S.token) { leaveLocal(); $('join-error').textContent = 'That room is gone.'; return; }
    if (m.code === 'replaced') { leaveLocal(); $('join-error').textContent = 'You joined from another tab.'; return; }
    if (S.room && !$('screen-lobby').hidden) { $('lobby-hint').textContent = m.message; toast(m.message, 'warn'); FX.SFX.bye(); shake(); }
    else $('join-error').textContent = m.message;
  }

  function onEvent(m) {
    const you = m.id === S.me;
    if (m.kind === 'join' && !you) { toast(`${m.name} joined 🎉`); FX.SFX.pop(); burstAt(m.id, 40); }
    else if (m.kind === 'created' && you) burstAt(m.id, 60);
    else if (m.kind === 'ready') { FX.SFX.ding(); burstAt(m.id, 22, .7); const c = document.querySelector(`[data-id="${m.id}"]`); if (c) c.classList.add('stamped'); }
    else if (m.kind === 'unready') FX.SFX.click();
    else if (m.kind === 'leave') { if (!you) { toast(`${m.name} left`, 'warn'); FX.SFX.bye(); } }
    else if (m.kind === 'kick') { if (!you) { toast(`${m.name} was removed`, 'warn'); FX.SFX.bye(); } }
    else if (m.kind === 'host') { toast(you ? 'You are the host now 👑' : `${m.name} is the host now 👑`); FX.SFX.crown(); burstAt(m.id, 30); }
    else if (m.kind === 'offline') { if (!you) toast(`${m.name} lost connection`, 'warn'); }
    else if (m.kind === 'back') { if (!you) toast(`${m.name} is back`); }
  }
  function burstAt(id, n, power) {
    requestAnimationFrame(() => {
      const c = document.querySelector(`[data-id="${id}"]`);
      const r = c ? c.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, n, power || 1);
    });
  }

  // ------------------------------------------------------------ lobby rendering
  function onRoom(room) {
    const first = !S.room;
    S.room = room;
    renderCode(room.code);
    renderPlayers(room, $('players'));
    if ($('mini-players')) renderPlayers(room, $('mini-players'));
    renderControls(room);
    if (room.state === 'lobby' && $('screen-lobby').hidden) show('lobby');
    emit('room', room);
    if (first) { safe.sset('infom4th.imposter.inroom', '1'); }
    $('lobby-hint').textContent = hintFor(room);
  }
  function renderCode(code) {
    const box = $('code-tiles');
    if (box.dataset.code === code) return;
    box.dataset.code = code; box.textContent = '';
    [...code].forEach((ch, i) => { const t = el('span', 'tile', ch); t.style.animationDelay = (i * 90) + 'ms'; box.append(t); });
  }
  function renderPlayers(room, ul) {
    const existing = new Map([...ul.children].map(li => [li.dataset.id, li]));
    const iAmHost = room.hostId === S.me;
    for (const p of room.players) {
      let li = existing.get(p.id);
      const isNew = !li;
      if (isNew) { li = el('li', 'player pop-in'); li.dataset.id = p.id; ul.append(li); }
      existing.delete(p.id);
      li.classList.toggle('offline', !p.connected);
      li.classList.toggle('me', p.id === S.me);
      li.classList.toggle('ready', p.ready && !p.host);
      li.textContent = '';
      const bubble = el('span', 'bubble', p.avatar); bubble.style.background = sticker(p);
      li.append(bubble);
      if (p.host) li.append(el('span', 'crown', '👑'));
      li.append(el('span', 'pname', p.name + (p.id === S.me ? ' (you)' : '')));
      if (p.ready && !p.host && ul.id === 'players') li.append(el('span', 'stamp', 'READY'));
      if (!p.connected) li.append(el('span', 'away', 'reconnecting…'));
      if (iAmHost && p.id !== S.me && ul.id === 'players' && room.state === 'lobby') {
        const k = el('button', 'kick', '✕'); k.type = 'button'; k.title = `Remove ${p.name}`; k.setAttribute('aria-label', `Remove ${p.name}`);
        k.onclick = () => { FX.SFX.click(); send({ t: 'kick', id: p.id }); };
        li.append(k);
      }
    }
    for (const li of existing.values()) { li.classList.add('pop-out'); setTimeout(() => li.remove(), 260); }
  }
  function hintFor(room) {
    const here = room.players.filter(p => p.connected);
    if (room.hostId === S.me) {
      if (here.length < room.min) return `Share the code! You need ${room.min - here.length} more player${room.min - here.length > 1 ? 's' : ''}.`;
      const waiting = here.filter(p => !p.ready);
      return waiting.length ? `Waiting for ${waiting.map(p => p.name).join(', ')}…` : 'Everyone is ready. Start when you are!';
    }
    const me = room.players.find(p => p.id === S.me);
    return me && me.ready ? 'You are ready. Waiting for the host to start…' : 'Press "I\'m ready" when you are.';
  }
  function renderControls(room) {
    const iAmHost = room.hostId === S.me;
    const here = room.players.filter(p => p.connected);
    const me = room.players.find(p => p.id === S.me);
    $('count').textContent = `${room.players.length} / ${room.max} players · you need at least ${room.min}`;
    $('ready').hidden = iAmHost;
    $('ready').textContent = me && me.ready ? 'Not ready' : "I'm ready!";
    $('ready').classList.toggle('btn-play', !(me && me.ready));
    $('start').hidden = !iAmHost;
    $('start').disabled = !(iAmHost && here.length >= room.min && here.every(p => p.ready) && room.state === 'lobby');
  }

  // ------------------------------------------------------------ leaving
  function leaveLocal() {
    S.token = null; S.code = null; S.room = null; S.me = null; S.role = null; S.wantOpen = false;
    emit('left', {});
    safe.sdel(SESSION_KEY);
    $('players').textContent = ''; if ($('mini-players')) $('mini-players').textContent = ''; $('code-tiles').dataset.code = '';
    $('countdown').hidden = true;
    setBusy(false);
    show('join');
    if (S.ws) { const w = S.ws; S.ws = null; try { w.close(); } catch {} }
  }
  function leave() { send({ t: 'leave' }); FX.SFX.bye(); leaveLocal(); }

  // ------------------------------------------------------------ join screen
  function buildAvatarPicker() {
    const box = $('avatar-pick');
    AVATARS.forEach((a, i) => {
      const b = el('button', 'av', a); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', 'Avatar ' + (i + 1));
      b.style.background = STICKERS[i % STICKERS.length];
      b.onclick = () => selectAvatar(a, true);
      box.append(b);
    });
    selectAvatar(safe.get(AVATAR_KEY) || AVATARS[(Math.random() * AVATARS.length) | 0], false);
  }
  function selectAvatar(a, sound) {
    S.avatar = a; safe.set(AVATAR_KEY, a);
    [...$('avatar-pick').children].forEach(b => { const on = b.textContent === a; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    if (sound) FX.SFX.click();
  }
  function validName() {
    const problem = nameProblem($('name').value);
    $('join-error').textContent = problem;
    if (problem) { $('name').focus(); FX.SFX.bye(); shake(); return null; }
    const name = cleanName($('name').value); safe.set(NAME_KEY, name);
    return name;
  }
  function doCreate(extra) { const name = validName(); if (name) { FX.SFX.click(); request({ t: 'create', name, avatar: S.avatar, game: GAME, ...(extra || {}) }); return true; } return false; }
  function doJoin() {
    const name = validName(); if (!name) return;
    const code = $('code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { $('join-error').textContent = 'Room codes have 4 letters.'; $('code').focus(); FX.SFX.bye(); return; }
    FX.SFX.click(); request({ t: 'join', code, name, avatar: S.avatar });
  }

  // ------------------------------------------------------------ doodle background
  function doodles() {
    const box = $('doodles'), marks = ['{ }', '</>', ';', '()', '[ ]', '#', 'def', 'if', '==', '++', '…', '✦', '?', '>>>'];
    for (let i = 0; i < 18; i++) {
      const s = el('span', 'doodle', marks[i % marks.length]);
      s.style.left = (Math.random() * 100) + '%'; s.style.top = (Math.random() * 100) + '%';
      s.style.fontSize = (22 + Math.random() * 34) + 'px'; s.style.animationDuration = (14 + Math.random() * 16) + 's'; s.style.animationDelay = (-Math.random() * 20) + 's';
      s.style.setProperty('--rot', ((Math.random() - .5) * 50) + 'deg');
      box.append(s);
    }
  }

  // ------------------------------------------------------------ wiring
  function init() {
    doodles();
    buildAvatarPicker();
    const saved = cleanName(safe.get(NAME_KEY));
    $('name').value = nameProblem(saved) ? '' : saved;
    const room = new URLSearchParams(location.search).get('room');
    if (room) { $('code').value = room.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); $('name').focus(); }
    REACTIONS.forEach(r => { const b = el('button', 'react', r); b.type = 'button'; b.setAttribute('aria-label', 'React ' + r); b.onclick = () => send({ t: 'react', emoji: r }); $('reactions').append(b); });
    $('create').onclick = () => doCreate();
    $('join').onclick = doJoin;
    $('code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); $('join-error').textContent = ''; });
    $('name').addEventListener('input', () => { $('join-error').textContent = ''; });
    for (const id of ['name', 'code']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') ($('code').value.length === 4 ? doJoin : () => doCreate())(); });
    $('ready').onclick = () => { const me = S.room && S.room.players.find(p => p.id === S.me); send({ t: 'ready', value: !(me && me.ready) }); };
    $('start').onclick = () => { FX.SFX.click(); send({ t: 'start' }); };
    $('leave').onclick = leave;
    $('copy').onclick = async () => {
      const url = `${location.origin}${location.pathname}?room=${S.code}`;
      try { await navigator.clipboard.writeText(url); $('copy').textContent = 'Copied! ✓'; } catch { $('copy').textContent = url; }
      FX.SFX.ding(); const r = $('copy').getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top, 24);
      setTimeout(() => { $('copy').textContent = 'Copy invite link'; }, 2200);
    };
    const mute = $('mute');
    const paintMute = () => { mute.textContent = FX.isMuted() ? '🔇' : '🔊'; mute.setAttribute('aria-label', FX.isMuted() ? 'Sound off' : 'Sound on'); };
    mute.onclick = () => { FX.setMuted(!FX.isMuted()); paintMute(); FX.SFX.click(); };
    paintMute();
    $('exit').onclick = () => {
      if (S.token) send({ t: 'leave' });
      try { if (window.parent !== window) { window.parent.postMessage({ type: 'arcade:exit' }, location.origin); return; } } catch {}
      location.href = '/';
    };
    // back to the same room after a page refresh
    try {
      const saved = JSON.parse(safe.sget(SESSION_KEY) || 'null');
      if (saved && saved.code && saved.token) { S.code = saved.code; S.token = saved.token; S.wantOpen = true; $('conn-status').textContent = 'Getting your seat back…'; connect(); }
    } catch {}
    show('join');
  }
  window.Room = { S, $, el, send, createRoom: extra => doCreate(extra), show, toast, flash, shake, burstAt, on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, GAME };
  init();
})();
