// Runs the Paper Trail client (shared room kit + trail.js) against a stub DOM and the REAL server engine's snapshots:
// catches runtime errors while drawing, handling events, showing results and steering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Territory, TICKS_PER_SECOND } = require('../server/territory.cjs');

function makeEl(tag = 'div') {
  const e = { nodeType: 1, tagName: tag.toUpperCase(), children: [], dataset: {}, style: { setProperty() {} }, attrs: {}, hidden: false, value: '', disabled: false, className: '', listeners: {}, _cls: new Set(), parentElement: null,
    classList: { add(...c) { c.forEach(x => e._cls.add(x)); }, remove(...c) { c.forEach(x => e._cls.delete(x)); }, toggle(c, on) { (on === undefined ? !e._cls.has(c) : on) ? e._cls.add(c) : e._cls.delete(c); }, contains: c => e._cls.has(c) },
    append(...k) { for (const c of k) c.parent = e; e.children.push(...k); }, remove() { if (e.parent) { const i = e.parent.children.indexOf(e); if (i >= 0) e.parent.children.splice(i, 1); } },
    setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(t, f) { (e.listeners[t] = e.listeners[t] || []).push(f); }, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 20, top: 20, width: 600, height: 400 }), focus() {}, select() {}, showModal() {}, close() {}, offsetWidth: 1, scrollIntoView() {}, clientWidth: 900, querySelectorAll: () => [], get firstChild() { return e.children[0]; } };
  Object.defineProperty(e, 'textContent', { get() { return e._t ?? e.children.map(c => c.textContent ?? '').join(''); }, set(v) { e._t = v; if (v === '') e.children.length = 0; }, configurable: true });
  return e;
}

function loadTrail() {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); };
  const sent = [], frames = [], posted = [];
  const proxyCtx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  let socket;
  class FakeWS { constructor() { socket = this; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); } send(d) { sent.push(JSON.parse(d)); } close() {} static get OPEN() { return 1; } static get CONNECTING() { return 0; } }
  const mkEl = tag => { const e = makeEl(tag); if (tag === 'canvas') e.getContext = () => proxyCtx; return e; };
  let clock = 1000;
  const doc = { getElementById: get, createElement: mkEl, body: makeEl('body'), addEventListener(t, f) { (doc.l[t] = doc.l[t] || []).push(f); }, l: {}, querySelector: () => null, querySelectorAll: () => [] };
  doc.body.dataset.game = 'territory';
  const ctx = { console, Math, JSON, URLSearchParams, Uint8Array, performance: { now: () => (clock += 100) }, ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(4 * w * h); this.width = w; this.height = h; } }, Path2D: class { moveTo() {} lineTo() {} closePath() {} }, setTimeout: f => 0, clearTimeout() {}, requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
    innerWidth: 1200, innerHeight: 800, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false }), WebSocket: FakeWS, devicePixelRatio: 1, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/games/paper-trail/', search: '', href: '' },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, AudioContext: undefined, document: doc,
    parent: { postMessage: (m) => posted.push(m) } };
  ctx.window = ctx; ctx.self = ctx;
  ctx.window.parent = ctx.parent;
  get('fx').getContext = () => proxyCtx; get('tt-canvas').getContext = () => proxyCtx; get('tt-mini').getContext = () => proxyCtx; get('tt-mini').width = 150; get('tt-mini').height = 100; get('tt-stage').clientWidth = 1100; get('tt-stage').clientHeight = 700;
  vm.createContext(ctx);
  const SHARED = fs.existsSync(path.join(__dirname, '../shared')) ? '../shared' : '../server/shared';
  for (const f of [`${SHARED}/room-kit/fx.js`, `${SHARED}/room-kit/lobby.js`, '../games/paper-trail/trail.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });

  return { get, sent, frames, posted, doc, ctx, socketRef: () => socket };
}

test('Paper Trail client draws real engine snapshots, reacts to events and shows results without errors', async () => {
  const { get, sent, frames, posted, doc, socketRef } = loadTrail();
  get('name').value = 'Ada'; get('create').onclick();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual([sent[0].t, sent[0].game], ['create', 'territory'], 'the room is created for the territory game');
  const msg = m => socketRef().onmessage({ data: JSON.stringify(m) });
  msg({ t: 'welcome', id: 'p1', token: 'tok', code: 'WXYZ' });
  const players = [{ id: 'p1', name: 'Ada', avatar: '🦊', color: 0, ready: true, connected: true, host: true }];
  msg({ t: 'room', code: 'WXYZ', game: 'territory', state: 'lobby', hostId: 'p1', you: 'p1', round: 0, min: 1, max: 6, players });
  assert.equal(get('screen-lobby').hidden, false);
  assert.equal(get('start').disabled, false, 'a single human can start (bots fill in)');

  // drive the real engine and feed its messages to the client
  let seed = 3; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const ents = [{ id: 'p1', name: 'Ada', avatar: '🦊', color: 0, bot: false }, ...[1, 2, 3, 4, 5].map(n => ({ id: 'bot' + n, name: 'Bot' + n, avatar: '✏️', color: n, bot: true }))];
  const game = new Territory({ rng, entities: ents, duration: 60 * TICKS_PER_SECOND });
  msg({ t: 'gstart', ...game.intro(), you: 0 });
  assert.equal(get('screen-game').hidden, false);
  assert.ok(doc.body._cls.has('playing'), 'the page switches to the immersive game view');
  msg({ t: 'g', ...game.snapshot(), ev: [] });
  let kills = 0, claims = 0;
  for (let i = 0; i < 700 && !game.finished; i++) {
    const ev = game.tick();
    kills += ev.filter(e => e.k === 'kill').length; claims += ev.filter(e => e.k === 'claim').length;
    msg({ t: 'g', ...game.delta(), ev });
    if (i % 20 === 0) frames.splice(0).forEach(f => f(1000 + i * 50));
  }
  assert.ok(claims > 0, 'land was claimed and drawn (the smooth outline code ran)');
  assert.match(get('tt-time').textContent, /^\d+:\d\d$/);
  assert.match(get('tt-me').textContent, /%$/);
  assert.equal(get('tt-board').children.length, 6, 'scoreboard lists everyone');

  // steering: mouse, keyboard, touch
  const canvas = get('tt-canvas');
  canvas.listeners.pointermove.forEach(f => f({ pointerType: 'mouse', clientX: 620, clientY: 220 }));         // right of the centre
  assert.deepEqual(sent.at(-1), { t: 'steer', a: 0 });
  canvas.listeners.pointermove.forEach(f => f({ pointerType: 'mouse', clientX: 320, clientY: 20 }));          // straight up
  assert.equal(sent.at(-1).t, 'steer'); assert.ok(Math.abs(sent.at(-1).a + Math.PI / 2) < 0.02);
  doc.l.keydown.forEach(f => f({ key: 'ArrowLeft', target: { tagName: 'BODY' }, preventDefault() {} }));
  assert.deepEqual(sent.at(-1), { t: 'turn', v: -1 });
  doc.l.keyup.forEach(f => f({ key: 'ArrowLeft' }));
  assert.deepEqual(sent.at(-1), { t: 'turn', v: 0 });
  doc.l.keydown.forEach(f => f({ key: 'd', target: { tagName: 'BODY' }, preventDefault() {} }));
  assert.deepEqual(sent.at(-1), { t: 'turn', v: 1 });
  doc.l.keyup.forEach(f => f({ key: 'd' }));
  canvas.listeners.touchstart.forEach(f => f({ changedTouches: [{ clientX: 100, clientY: 100 }], preventDefault() {} }));
  canvas.listeners.touchmove.forEach(f => f({ changedTouches: [{ clientX: 100, clientY: 160 }], preventDefault() {} }));
  assert.equal(sent.at(-1).t, 'steer'); assert.ok(Math.abs(sent.at(-1).a - Math.PI / 2) < 0.02, 'drag down steers down');

  // a death banner and the results screen
  const rows = game.delta().e.map(r => (r[0] === 0 ? [0, r[1], r[2], r[3], 0, r[5], r[6], 2] : r));
  msg({ t: 'g', n: game.tickNo, left: 100, d: [], e: rows, tr: {}, clr: [], ev: [{ k: 'kill', by: 2, who: 0, x: 160, y: 160 }, { k: 'claim', i: 0, n: 30, x: 80, y: 80 }] });
  assert.match(get('tt-banner').textContent, /cut/i);
  msg({ t: 'gend', results: game.ranking() });
  assert.equal(get('tt-results').hidden, false);
  assert.equal(get('tt-final').children.length, 6);
  assert.ok(posted.length <= 1);
  msg({ t: 'lobby' });
  assert.equal(get('screen-lobby').hidden, false);
  assert.equal(get('tt-results').hidden, true);
  assert.ok(!doc.body._cls.has('playing'), 'the normal page chrome comes back in the lobby');
});

test('quick play against bots: one button creates a private room and starts it by itself; settings are host-only', async () => {
  const { get, sent, socketRef } = loadTrail();
  get('name').value = 'Ada';
  get('lvl-hard').onclick();
  get('quick').onclick();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual([sent[0].t, sent[0].game, sent[0].bots, sent[0].level], ['create', 'territory', 'auto', 'hard']);
  const msg = m => socketRef().onmessage({ data: JSON.stringify(m) });
  const players = [{ id: 'p1', name: 'Ada', avatar: '🦊', color: 0, ready: true, connected: true, host: true }];
  msg({ t: 'welcome', id: 'p1', token: 't', code: 'QUIK' });
  msg({ t: 'room', code: 'QUIK', game: 'territory', settings: { bots: 'auto', level: 'hard' }, state: 'lobby', hostId: 'p1', you: 'p1', round: 0, min: 1, max: 6, players });
  assert.deepEqual(sent.at(-1), { t: 'start' }, 'the host of a quick-play room starts right away');
  msg({ t: 'room', code: 'QUIK', game: 'territory', settings: { bots: 'auto', level: 'hard' }, state: 'lobby', hostId: 'p1', you: 'p1', round: 0, min: 1, max: 6, players });
  assert.equal(sent.filter(m => m.t === 'start').length, 1, 'only once');
  assert.equal(get('set-level').value, 'hard');
  get('set-level').value = 'easy'; get('set-level').onchange();
  assert.deepEqual(sent.at(-1), { t: 'settings', level: 'easy' });
  get('set-bots').value = '3'; get('set-bots').onchange();
  assert.deepEqual(sent.at(-1), { t: 'settings', bots: 3 });
  // a guest sees the settings but cannot change them
  msg({ t: 'room', code: 'QUIK', game: 'territory', settings: { bots: 2, level: 'normal' }, state: 'lobby', hostId: 'p9', you: 'p1', round: 0, min: 1, max: 6, players: [{ ...players[0], host: false }, { id: 'p9', name: 'Zed', avatar: '🐼', color: 1, ready: true, connected: true, host: true }] });
  assert.equal(get('set-bots').disabled, true);
  assert.equal(get('set-bots').value, '2');
  assert.match(get('settings-note').textContent, /host/i);
});

test('a failed quick play does not leave the page ready to start the next room by itself', async () => {
  const { get, sent, socketRef } = loadTrail();
  get('name').value = 'Ada';
  get('quick').onclick();
  await new Promise(r => setTimeout(r, 10));
  const msg = m => socketRef().onmessage({ data: JSON.stringify(m) });
  msg({ t: 'error', code: 'busy', message: 'The server is full right now.' });
  msg({ t: 'welcome', id: 'p1', token: 't', code: 'ABCD' });
  msg({ t: 'room', code: 'ABCD', game: 'territory', settings: { bots: 'auto', level: 'normal' }, state: 'lobby', hostId: 'p1', you: 'p1', round: 0, min: 1, max: 6, players: [{ id: 'p1', name: 'Ada', avatar: '🦊', color: 0, ready: true, connected: true, host: true }] });
  assert.equal(sent.filter(m => m.t === 'start').length, 0);
});

test('smooth outlines: traced loops enclose exactly the land cells (squares, holes, diagonals, random blobs)', () => {
  const loaded = loadTrail();
  const { traceLoops, smooth, simplify } = loaded.ctx.PaperTrail;
  const area = pts => { let a = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return a / 2; };
  const grid = (w, h, cells, o = 1) => { const g = new Uint8Array(w * h); for (const [x, y] of cells) g[y * w + x] = o; return g; };
  const total = (g, w, h, o = 1) => (traceLoops(g, w, h).get(o) || []).reduce((n, l) => n + area(l), 0);
  const block = []; for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) block.push([x, y]);
  assert.equal(traceLoops(grid(6, 6, block), 6, 6).get(1).length, 1, 'one outline for a square');
  assert.equal(Math.abs(total(grid(6, 6, block), 6, 6)), 9);
  const ring = block.filter(([x, y]) => !(x === 2 && y === 2));
  assert.equal(traceLoops(grid(6, 6, ring), 6, 6).get(1).length, 2, 'a ring has an outer and an inner outline');
  assert.equal(Math.abs(total(grid(6, 6, ring), 6, 6)), 8, 'the hole is subtracted');
  assert.equal(traceLoops(grid(6, 6, [[1, 1], [2, 2]]), 6, 6).get(1).length, 2, 'cells touching only at a corner stay separate');
  const two = grid(8, 4, [[1, 1], [2, 1], [5, 1], [6, 1]]);
  assert.equal(traceLoops(two, 8, 4).get(1).length, 2);
  const both = grid(8, 4, [[1, 1], [2, 1]]); both[1 * 8 + 5] = 2; both[1 * 8 + 6] = 2;
  assert.deepEqual([...traceLoops(both, 8, 4).keys()].sort(), [1, 2], 'each owner gets its own outlines');
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 40; n++) {
    const w = 12, h = 9, g = new Uint8Array(w * h); let count = 0;
    for (let c = 0; c < w * h; c++) if (rnd() < 0.55) { g[c] = 1; count++; }
    assert.ok(Math.abs(Math.abs(total(g, w, h)) - count) < 1e-9, `outline area equals the cell count (${count}) for random blob ${n}`);
  }
  const loop = traceLoops(grid(6, 6, block), 6, 6).get(1)[0];
  const sm = smooth(loop, 2);
  assert.equal(sm.length, loop.length * 4, 'two rounds of corner cutting');
  for (let i = 0; i < sm.length; i += 2) assert.ok(sm[i] >= 1 && sm[i] <= 4 && sm[i + 1] >= 1 && sm[i + 1] <= 4, 'smoothing never leaves the original outline box');
  assert.ok(Math.abs(Math.abs(area(sm)) - 9) < 1.2 && Math.abs(area(sm)) < 9, 'rounded corners shave a little area');
});

test('outline simplification flattens staircases but never moves the outline more than the tolerance', () => {
  const { traceLoops, simplify } = loadTrail().ctx.PaperTrail;
  // a big diagonal blob: its raw outline is a staircase with many vertices
  const w = 60, h = 60, g = new Uint8Array(w * h);
  for (let y = 5; y < 55; y++) for (let x = 5; x < 55; x++) if (Math.hypot(x - 30, y - 30) < 24) g[y * w + x] = 1;
  const loop = traceLoops(g, w, h).get(1)[0];
  const eps = 0.55, simple = simplify(loop, eps);
  assert.ok(simple.length < loop.length / 1.8, `staircases collapse (${loop.length / 2} -> ${simple.length / 2} vertices)`);
  const n = simple.length / 2;
  const segDist = (px, py) => { let best = Infinity; for (let i = 0; i < n; i++) { const j = (i + 1) % n, ax = simple[2 * i], ay = simple[2 * i + 1], bx = simple[2 * j], by = simple[2 * j + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0; best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy)); } return best; };
  let worst = 0; for (let i = 0; i < loop.length; i += 2) worst = Math.max(worst, segDist(loop[i], loop[i + 1]));
  assert.ok(worst <= eps + 1e-9, `no original vertex is further than ${eps} from the simplified outline (worst ${worst.toFixed(3)})`);
  const tiny = [0, 0, 1, 0, 1, 1, 0, 1];
  assert.deepEqual(simplify(tiny, 0.5), tiny, 'small shapes are left alone');
});
