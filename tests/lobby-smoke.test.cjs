// Runs games/imposter/lobby.js + fx.js against a stub DOM and a scripted fake server: catches runtime errors in every screen path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeEl(tag = 'div') {
  const e = {
    tagName: tag.toUpperCase(), children: [], dataset: {}, style: { setProperty() {}, cssText: '' }, attrs: {}, hidden: false, textContent: '', value: '', disabled: false,
    className: '', listeners: {}, _cls: new Set(),
    classList: { add(...c) { c.forEach(x => e._cls.add(x)); }, remove(...c) { c.forEach(x => e._cls.delete(x)); }, toggle(c, on) { (on === undefined ? !e._cls.has(c) : on) ? e._cls.add(c) : e._cls.delete(c); }, contains: c => e._cls.has(c) },
    append(...k) { for (const c of k) { c.parent = e; } e.children.push(...k); }, remove() { if (e.parent) { const i = e.parent.children.indexOf(e); if (i >= 0) e.parent.children.splice(i, 1); } }, setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(t, f) { (e.listeners[t] = e.listeners[t] || []).push(f); },
    removeEventListener() {}, getBoundingClientRect: () => ({ left: 10, top: 10, width: 50, height: 50 }), focus() {}, select() {}, showModal() {}, close() {}, offsetWidth: 1,
    querySelectorAll: () => [], get firstChild() { return e.children[0]; },
  };
  Object.defineProperty(e, 'textContent', { get() { return e._t ?? e.children.map(c => c.textContent ?? '').join(''); }, set(v) { e._t = v; if (v === '') e.children.length = 0; }, configurable: true });
  return e;
}

test('lobby client survives create -> lobby -> events -> countdown -> role reveal -> back to lobby', () => {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); };
  const sent = [];
  let socket;
  class FakeWS { constructor() { socket = this; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); } send(d) { sent.push(JSON.parse(d)); } close() { this.readyState = 3; } static get OPEN() { return 1; } static get CONNECTING() { return 0; } }
  const ctx = {
    console, Math, JSON, URLSearchParams, setTimeout: f => { try { f(); } catch {} return 1; }, clearTimeout() {}, requestAnimationFrame: f => { try { f(0); } catch {} return 1; },
    innerWidth: 1000, innerHeight: 700, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false }), WebSocket: FakeWS,
    location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/games/imposter/', search: '', href: '' },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText: async () => {} } }, AudioContext: undefined,
    document: { getElementById: get, createElement: makeEl, body: makeEl('body'), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
  };
  ctx.document.getElementById('fx').getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const SHARED = fs.existsSync(path.join(__dirname, '../shared')) ? '../shared' : '../server/shared';
  for (const f of [`${SHARED}/room-kit/fx.js`, `${SHARED}/room-kit/lobby.js`, '../games/imposter/imposter.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });

  // join screen: empty name is refused, no default name is used
  get('create').onclick();
  assert.equal(sent.length, 0);
  assert.match(get('join-error').textContent, /name/i);
  get('name').value = 'ANON'; get('create').onclick();
  assert.equal(sent.length, 0);
  get('name').value = 'Ada'; get('create').onclick();
  return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
    assert.equal(sent[0].t, 'create'); assert.equal(sent[0].name, 'Ada');
    const msg = m => socket.onmessage({ data: JSON.stringify(m) });
    const players = [{ id: 'p1', name: 'Ada', avatar: '🦊', color: 0, ready: true, connected: true, host: true }, { id: 'p2', name: 'Linus', avatar: '🐼', color: 1, ready: false, connected: true, host: false }, { id: 'p3', name: 'Grace', avatar: '🐸', color: 2, ready: true, connected: false, host: false }];
    msg({ t: 'welcome', id: 'p1', token: 'tok', code: 'ABCD' });
    msg({ t: 'room', code: 'ABCD', state: 'lobby', hostId: 'p1', you: 'p1', round: 0, min: 3, max: 12, players });
    assert.equal(get('screen-lobby').hidden, false);
    assert.equal(get('screen-join').hidden, true);
    assert.equal(get('code-tiles').children.length, 4);
    assert.equal(get('players').children.length, 3);
    assert.equal(get('start').disabled, true, 'not everyone is ready');
    for (const ev of [{ kind: 'join', id: 'p2', name: 'Linus' }, { kind: 'ready', id: 'p3', name: 'Grace' }, { kind: 'unready', id: 'p3', name: 'Grace' }, { kind: 'leave', id: 'p9', name: 'X' }, { kind: 'host', id: 'p1', name: 'Ada' }, { kind: 'offline', id: 'p3', name: 'Grace' }, { kind: 'back', id: 'p3', name: 'Grace' }]) msg({ t: 'event', ...ev });
    msg({ t: 'react', id: 'p2', emoji: '🎉' });
    players[1].ready = true; players[2].connected = true;
    msg({ t: 'room', code: 'ABCD', state: 'lobby', hostId: 'p1', you: 'p1', round: 0, min: 3, max: 12, players });
    assert.equal(get('start').disabled, false, 'everyone ready and enough players');
    get('start').onclick();
    assert.deepEqual(sent.at(-1), { t: 'start' });
    for (const n of [3, 2, 1]) msg({ t: 'countdown', n });
    assert.equal(get('countdown').hidden, false);
    msg({ t: 'role', role: 'imposter', word: null, hint: 'The word is a Python term.', round: 1 });
    msg({ t: 'started', round: 1 });
    msg({ t: 'room', code: 'ABCD', state: 'playing', hostId: 'p1', you: 'p1', round: 1, min: 3, max: 12, players });
    assert.equal(get('screen-reveal').hidden, false);
    assert.equal(get('countdown').hidden, true);
    get('flip').onclick();
    assert.equal(get('role-kind').textContent, 'YOU ARE THE IMPOSTER');
    get('flip').onclick();                                                  // hides again
    msg({ t: 'role', role: 'crew', word: 'loop', hint: null, round: 2 });
    msg({ t: 'started', round: 2 });
    get('flip').onclick();
    assert.equal(get('role-word').textContent, 'loop');
    get('again').onclick();
    assert.deepEqual(sent.at(-1), { t: 'again' });
    msg({ t: 'lobby' });
    assert.equal(get('screen-lobby').hidden, false);
    msg({ t: 'cancelled', reason: 'The host cancelled the start.' });
    msg({ t: 'error', code: 'not_ready', message: 'Waiting for Linus.' });
    msg({ t: 'kicked' });
    assert.equal(get('screen-join').hidden, false, 'kicked players go back to the join screen');
  });
});
