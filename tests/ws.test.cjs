// End-to-end: real HTTP server + real WebSocket clients (Node's built-in WebSocket) talking to the room system.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { createApp } = require('../server/serve.cjs');

async function boot(opts = {}) {
  const server = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-ws-')), pygbagUpstream: null, ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { server, port, url: `ws://127.0.0.1:${port}/ws`, close: () => new Promise(r => { server.close(r); server.closeAllConnections(); }) };
}
function client(url) {
  const ws = new WebSocket(url);
  const inbox = [], waiters = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); inbox.push(m); waiters.splice(0).forEach(w => w()); };
  const api = {
    ws, inbox,
    ready: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }),
    send: m => ws.send(JSON.stringify(m)),
    last: t => [...inbox].reverse().find(m => m.t === t),
    async until(pred, label = 'message') {
      const t0 = Date.now();
      while (Date.now() - t0 < 6500) { const hit = [...inbox].reverse().find(pred); if (hit) return hit; await new Promise(r => { waiters.push(r); setTimeout(r, 50); }); }
      throw new Error('timed out waiting for ' + label);
    },
  };
  return api;
}

test('full flow over real sockets: create, join, ready, start, countdown, private roles', async () => {
  const a = await boot();
  const host = client(a.url), p2 = client(a.url), p3 = client(a.url);
  await Promise.all([host.ready, p2.ready, p3.ready]);
  host.send({ t: 'create', name: 'Ada' });
  const { code } = await host.until(m => m.t === 'welcome', 'welcome');
  p2.send({ t: 'join', code, name: 'Linus' });
  p3.send({ t: 'join', code: code.toLowerCase(), name: 'Grace' });
  await host.until(m => m.t === 'room' && m.players.length === 3, 'three players');
  p2.send({ t: 'ready', value: true }); p3.send({ t: 'ready', value: true });
  await host.until(m => m.t === 'room' && m.players.every(p => p.ready), 'all ready');
  host.send({ t: 'start' });
  await host.until(m => m.t === 'countdown' && m.n === 3, 'countdown');
  const roles = await Promise.all([host, p2, p3].map(c => c.until(m => m.t === 'role', 'role')));
  assert.equal(roles.filter(r => r.role === 'imposter').length, 1);
  assert.equal(roles.filter(r => r.role === 'crew').length, 2);
  for (const c of [host, p2, p3]) c.ws.close();
  await a.close();
});

test('rejoin works across a dropped socket', async () => {
  const a = await boot();
  const host = client(a.url); await host.ready;
  host.send({ t: 'create', name: 'Ada' });
  const { code, token } = await host.until(m => m.t === 'welcome');
  const friend = client(a.url); await friend.ready;
  friend.send({ t: 'join', code, name: 'Linus' });
  await host.until(m => m.t === 'room' && m.players.length === 2);
  friend.ws.close();
  await host.until(m => m.t === 'room' && m.players.some(p => !p.connected), 'offline marker');
  const again = client(a.url); await again.ready;
  again.send({ t: 'rejoin', code, token });
  assert.equal((await again.until(m => m.t === 'welcome')).rejoined, true);
  host.ws.close(); again.ws.close();
  await a.close();
});

test('ws endpoint: wrong path, foreign origin and plain HTTP are refused; garbage and floods are survivable', async () => {
  const a = await boot();
  const bad = path => new Promise(r => { const ws = new WebSocket(`ws://127.0.0.1:${a.port}${path}`); ws.onerror = () => r('refused'); ws.onopen = () => { ws.close(); r('open'); }; });
  assert.equal(await bad('/nope'), 'refused');
  // foreign origin (raw handshake, since the WebSocket client never sends a custom Origin)
  const status = await new Promise(res => {
    const s = net.connect(a.port, '127.0.0.1', () => { s.write('GET /ws HTTP/1.1\r\nHost: 127.0.0.1:' + a.port + '\r\nOrigin: https://evil.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'); });
    let buf = ''; s.on('data', d => { buf += d; res(buf.split('\r\n')[0]); s.destroy(); });
  });
  assert.match(status, /403/);
  const http = await fetch(`http://127.0.0.1:${a.port}/ws`);
  assert.equal(http.status, 404);
  const c = client(a.url); await c.ready;
  c.ws.send('not json');
  assert.equal((await c.until(m => m.t === 'error')).code, 'bad_message');
  for (let i = 0; i < 60; i++) c.send({ t: 'ping' });
  await new Promise(r => { c.ws.onclose = r; setTimeout(r, 1500); });
  assert.notEqual(c.ws.readyState, WebSocket.OPEN, 'a flooding client is disconnected');
  const ok = client(a.url); await ok.ready;
  ok.send({ t: 'ping' });
  await ok.until(m => m.t === 'pong');
  ok.ws.close();
  await a.close();
});

test('the lobby page is served from the arcade (games/imposter)', async () => {
  const a = await boot();
  const r = await fetch(`http://127.0.0.1:${a.port}/games/imposter/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Imposter/);
  await a.close();
});

test('Paper Trail over real sockets: solo human + bots, live snapshots, steering, and the page is served', async () => {
  const a = await boot();
  const c = client(a.url); await c.ready;
  c.send({ t: 'create', name: 'Ada', game: 'territory', bots: 2, level: 'hard' });
  const lobby = await c.until(m => m.t === 'room' && m.game === 'territory', 'territory room');
  assert.deepEqual(lobby.settings, { bots: 2, level: 'hard' });
  c.send({ t: 'start' });
  const intro = await c.until(m => m.t === 'gstart', 'game start');
  assert.equal(intro.ents.length, 3, '1 human + 2 chosen bots');
  const full = await c.until(m => m.t === 'g' && m.full, 'full snapshot');
  assert.ok(full.o.length > 2 && full.e.length === 3);
  const first = await c.until(m => m.t === 'g' && !m.full && m.n >= 2, 'ticks');
  assert.ok(Array.isArray(first.d) && first.e.length === 3);
  c.send({ t: 'steer', a: 0.5 });
  c.send({ t: 'turn', v: 1 });
  const later = await c.until(m => m.t === 'g' && m.n >= first.n + 3, 'more ticks');
  assert.ok(later.n > first.n);
  const page = await fetch(`http://127.0.0.1:${a.port}/games/paper-trail/`);
  assert.equal(page.status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${a.port}/shared/room-kit/lobby.js`)).status, 200);
  c.ws.close();
  await a.close();
});
