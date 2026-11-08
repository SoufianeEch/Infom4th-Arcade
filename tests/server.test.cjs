const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/serve.cjs');

async function boot(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-test-'));
  const server = createApp({ dataDir, pygbagUpstream: null, ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(base + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { server, base, dataDir, post, close: () => new Promise(r => { server.close(r); server.closeAllConnections(); }) };
}

test('lists games and serves hub + game files', async () => {
  const a = await boot();
  const games = await (await fetch(a.base + '/api/games')).json();
  assert.deepEqual(games.map(g => g.id), ['flappy', 'doom', 'code-snake', 'flashcard-sniper', 'type-race', 'binary-blocks', 'variable-shooter', 'memory-match', 'imposter', 'paper-trail']);
  assert.equal((await fetch(a.base + '/')).status, 200);
  assert.equal((await fetch(a.base + '/games/flappy/index.html')).status, 200);
  const wasm = await fetch(a.base + '/games/doom/runtime/websockets-doom.wasm', { method: 'HEAD' });
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  const redirect = await fetch(a.base + '/games/flappy', { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  await a.close();
});

test('blocks path traversal and non-public folders', async () => {
  const a = await boot();
  for (const p of ['/games/../server/serve.cjs', '/%2e%2e/package.json', '/games/%2e%2e/server/serve.cjs', '/server/serve.cjs', '/data/scores.json']) {
    const r = await fetch(a.base + p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!(await r.text()).includes('createApp'), p);
  }
  await a.close();
});

test('redirects hostname localhost to 127.0.0.1 (pygbag dev-mode workaround)', async () => {
  const a = await boot();
  const port = a.server.address().port;
  const http = require('node:http');
  const got = await new Promise(r => http.get({ host: '127.0.0.1', port, path: '/x?y=1', headers: { Host: `localhost:${port}` } }, resp => { resp.resume(); r(resp); }));
  assert.equal(got.statusCode, 302);
  assert.equal(got.headers.location, `http://127.0.0.1:${port}/x?y=1`);
  const ok = await new Promise(r => http.get({ host: '127.0.0.1', port, path: '/api/games', headers: { Host: `127.0.0.1:${port}` } }, resp => { resp.resume(); r(resp); }));
  assert.equal(ok.statusCode, 200);
  await a.close();
});

test('etag gives 304 for unchanged files', async () => {
  const a = await boot();
  const first = await fetch(a.base + '/games/flappy/config.js');
  const second = await fetch(a.base + '/games/flappy/config.js', { headers: { 'If-None-Match': first.headers.get('etag') } });
  assert.equal(second.status, 304);
  await a.close();
});

test('leaderboard keeps each name best score, sorted, persisted', async () => {
  const a = await boot();
  assert.equal((await a.post({ game: 'flappy', name: 'Ada', score: 10 })).status, 200);
  assert.equal((await a.post({ game: 'flappy', name: 'Bob', score: 20 })).status, 200);
  const lower = await (await a.post({ game: 'flappy', name: 'ada', score: 5 })).json();
  assert.equal(lower.improved, false);
  const higher = await (await a.post({ game: 'flappy', name: 'ADA', score: 30 })).json();
  assert.equal(higher.improved, true);
  const top = await (await fetch(a.base + '/api/scores/flappy')).json();
  assert.deepEqual(top.map(r => [r.name, r.score]), [['Ada', 30], ['Bob', 20]]);
  // survives a restart with the same data dir
  await a.close();
  const server2 = createApp({ dataDir: a.dataDir });
  await new Promise(r => server2.listen(0, '127.0.0.1', r));
  const again = await (await fetch(`http://127.0.0.1:${server2.address().port}/api/scores/flappy`)).json();
  assert.equal(again.length, 2);
  await new Promise(r => { server2.close(r); server2.closeAllConnections(); });
});

test('rejects bad submissions', async () => {
  const a = await boot({ rateLimit: 1000 });
  const bad = [
    { game: 'nope', name: 'A', score: 1 },
    { game: 'doom', name: 'A', score: 1 },                 // scoring disabled
    { game: 'flappy', name: '', score: 1 },
    { game: 'flappy', name: 'ANON', score: 1 },               // the old default name is not allowed
    { game: 'flappy', name: 'guest', score: 1 },
    { game: 'flappy', name: '<script>', score: 1 },
    { game: 'flappy', name: 'A'.repeat(13), score: 1 },
    { game: 'flappy', name: 'A', score: 0 },
    { game: 'flappy', name: 'A', score: -4 },
    { game: 'flappy', name: 'A', score: 1.5 },
    { game: 'flappy', name: 'A', score: '9' },
    { game: 'flappy', name: 'A', score: 999999 },          // above manifest max
  ];
  for (const b of bad) assert.equal((await a.post(b)).status, 400, JSON.stringify(b));
  assert.equal((await a.post('{not json')).status, 400);
  assert.equal((await a.post(JSON.stringify({ pad: 'x'.repeat(5000) }))).status, 413);
  assert.deepEqual(await (await fetch(a.base + '/api/scores/flappy')).json(), []);
  await a.close();
});

test('rate limits score submissions per client', async () => {
  const a = await boot();
  let last;
  for (let i = 0; i < 12; i++) last = await a.post({ game: 'flappy', name: 'Spam', score: i + 1 });
  assert.equal(last.status, 429);
  await a.close();
});

test('self-hosted pygbag runtime: every file the browser requests is served locally (no internet)', async () => {
  const a = await boot();
  const { FILES } = require('../server/pygbag.cjs');
  for (const rel of FILES) {
    const r = await fetch(`${a.base}/pygbag/${rel}`);
    assert.equal(r.status, 200, rel);
    await r.arrayBuffer();
  }
  const wasm = await fetch(`${a.base}/pygbag/cdn/0.9.3/cpython312/main.wasm`, { method: 'HEAD' });
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  const index = await (await fetch(`${a.base}/pygbag/cdn/index-0.9.3-cp312.json`)).json();
  assert.equal(index['-CDN-'], '/pygbag/cdn/');                       // packages come from our server, not the public CDN
  await a.close();
});

test('built Python games reference the local runtime, never the public CDN', () => {
  const games = path.join(__dirname, '../games');
  for (const id of fs.readdirSync(games)) {
    const page = path.join(games, id, 'web/index.html');
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(!html.includes('pygame-web.github.io'), id);
    assert.ok(html.includes('/pygbag/cdn/0.9.3/pythons.js'), id);
  }
});

test('pygbag route rejects traversal and unknown paths; downloads a missing file once when allowed', async () => {
  const a = await boot();
  for (const p of ['/pygbag/../server/serve.cjs', '/pygbag/cdn/../../server/serve.cjs', '/pygbag/%2e%2e/package.json', '/pygbag/etc/passwd', '/pygbag/cdn/nope.js']) {
    const r = await fetch(a.base + p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
  }
  await a.close();

  const http = require('node:http');
  let hits = 0;
  const up = http.createServer((req, res) => { hits++; res.end('fake-' + req.url); });
  await new Promise(r => up.listen(0, '127.0.0.1', r));
  const b = await boot({ pygbagUpstream: `http://127.0.0.1:${up.address().port}` });
  assert.equal(await (await fetch(b.base + '/pygbag/cdn/extra/thing.js')).text(), 'fake-/cdn/extra/thing.js');
  assert.equal(await (await fetch(b.base + '/pygbag/cdn/extra/thing.js')).text(), 'fake-/cdn/extra/thing.js');
  assert.equal(hits, 1, 'second request is served from the cache');
  assert.equal((await fetch(b.base + '/pygbag/other/thing.js')).status, 404);   // only /cdn and /archives are proxied
  assert.equal(hits, 1);
  await b.close();
  await new Promise(r => { up.close(r); up.closeAllConnections(); });
});
