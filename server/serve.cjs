'use strict';
/* InfoM4th Arcade server. Zero dependencies.
 *  - static files: hub/ at "/", games/ at "/games/", shared/ at "/shared/"
 *  - GET  /api/games            list of games (from games/<id>/manifest.json, read on every request)
 *  - GET  /api/scores/:id       top scores for a game
 *  - POST /api/scores           {game, name, score} -> keeps each name's best score
 * Scores persist in DATA_DIR/scores.json (mount a volume there in Docker).
 */
const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const pygbag = require('./pygbag.cjs');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.cfg': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.wad': 'application/octet-stream', '.data': 'application/octet-stream', '.whl': 'application/zip', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
const TOP_N = 10;          // rows returned
const KEEP_N = 100;        // rows stored per game
const RATE_LIMIT = 10;     // default: score posts per IP per minute
const NAME_RE = /^[A-Za-z0-9 _.\-]{1,12}$/;
const RESERVED_NAMES = new Set(['anon', 'anonymous', 'guest', 'player', 'unknown']);   // the old default and placeholders are not allowed

function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(ROOT, 'data'));
  const gamesDir = path.resolve(options.gamesDir || path.join(ROOT, 'games'));
  const hubDir = path.join(ROOT, 'hub');
  const sharedDir = path.join(ROOT, 'shared');
  const pygbagDir = path.resolve(options.pygbagDir || path.join(ROOT, 'vendor', 'pygbag'));
  const pygbagCache = path.join(dataDir, 'pygbag-cache');      // files fetched on demand (writable, survives restarts in Docker)
  const upstream = options.pygbagUpstream === undefined ? (process.env.PYGBAG_PROXY === '0' ? null : pygbag.UPSTREAM) : options.pygbagUpstream;
  const scoresFile = path.join(dataDir, 'scores.json');
  const rateLimit = options.rateLimit || RATE_LIMIT;
  const hits = new Map();
  let scores = null;      // { [gameId]: [{name, score, at}] }
  let writeChain = Promise.resolve();

  async function loadScores() {
    if (scores) return scores;
    try { scores = JSON.parse(await fsp.readFile(scoresFile, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT') console.error('scores.json unreadable, starting empty:', e.message);
      scores = {};
    }
    return scores;
  }
  function saveScores() {
    writeChain = writeChain.then(async () => {
      await fsp.mkdir(dataDir, { recursive: true });
      const tmp = scoresFile + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(scores, null, 1));
      await fsp.rename(tmp, scoresFile);
    }).catch(e => console.error('could not save scores:', e.message));
    return writeChain;
  }

  async function listGames() {
    let dirs = [];
    try { dirs = await fsp.readdir(gamesDir, { withFileTypes: true }); } catch { return []; }
    const games = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const m = JSON.parse(await fsp.readFile(path.join(gamesDir, d.name, 'manifest.json'), 'utf8'));
        if (m.id !== d.name || m.hidden) continue;       // id must equal folder name
        games.push({ entry: 'index.html', order: 100, scoring: { enabled: false }, ...m });
      } catch { /* folder without a valid manifest is ignored */ }
    }
    return games.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  function send(res, status, body, headers = {}) {
    const isObj = typeof body === 'object' && body !== null && !Buffer.isBuffer(body);
    res.writeHead(status, {
      'Content-Type': isObj ? MIME['.json'] : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status >= 400 ? { Connection: 'close' } : {}), ...headers,
    });
    res.end(isObj ? JSON.stringify(body) : body);
  }

  function readJson(req, limit = 1024) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      let tooBig = false;
      req.on('data', c => { size += c.length; if (size > limit) { if (!tooBig) { tooBig = true; reject(Object.assign(new Error('too large'), { status: 413 })); } } else chunks.push(c); });
      req.on('end', () => { if (tooBig) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
      req.on('error', reject);
    });
  }

  function limited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
    recent.push(now); hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 60000)) hits.delete(k);
    return recent.length > rateLimit;
  }

  async function api(req, res, pathname) {
    if (pathname === '/api/games' && req.method === 'GET') return send(res, 200, await listGames());
    const m = pathname.match(/^\/api\/scores\/([a-z0-9-]+)$/);
    if (m && req.method === 'GET') {
      const all = await loadScores();
      return send(res, 200, (all[m[1]] || []).slice(0, TOP_N));
    }
    if (pathname === '/api/scores' && req.method === 'POST') {
      if (limited(req.socket.remoteAddress || '?')) return send(res, 429, { error: 'too many submissions, slow down' });
      const body = await readJson(req);
      const game = (await listGames()).find(g => g.id === body.game);
      if (!game || !game.scoring?.enabled) return send(res, 400, { error: 'unknown game or scoring disabled' });
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'name must be 1-12 letters, digits, space, _ . -' });
      if (RESERVED_NAMES.has(name.toLowerCase())) return send(res, 400, { error: 'please choose your own name' });
      const max = Number.isSafeInteger(game.scoring.max) ? game.scoring.max : 1000000;
      if (!Number.isSafeInteger(body.score) || body.score < 1 || body.score > max) return send(res, 400, { error: 'score out of range' });
      const all = await loadScores();
      const rows = all[game.id] || (all[game.id] = []);
      const existing = rows.find(r => r.name.toLowerCase() === name.toLowerCase());
      let improved = true;
      if (existing) { improved = body.score > existing.score; if (improved) { existing.score = body.score; existing.at = new Date().toISOString(); } }
      else rows.push({ name, score: body.score, at: new Date().toISOString() });
      rows.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
      all[game.id] = rows.slice(0, KEEP_N);
      await saveScores();
      return send(res, 200, { ok: true, improved, top: all[game.id].slice(0, TOP_N) });
    }
    return send(res, 404, { error: 'not found' });
  }

  /** Resolve /pygbag/<rel>: bundled mirror first, then on-demand cache, then (if allowed) download once from upstream. */
  async function pygbagFile(rel) {
    if (!/^(cdn|archives)\/[A-Za-z0-9_.+\-\/]+$/.test(rel) || rel.split('/').includes('..') || rel.includes('//')) return null;
    for (const dir of [pygbagDir, pygbagCache]) {
      const f = path.join(dir, rel);
      if (f.startsWith(dir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return { base: dir, file: f };
    }
    if (!upstream) return null;
    try {
      const r = await fetch(`${upstream}/${rel}`, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!r.ok) return null;
      let body = Buffer.from(await r.arrayBuffer());
      if (/^cdn\/index-.*\.json$/.test(rel)) body = Buffer.from(pygbag.rewriteIndex(body.toString('utf8')));
      const dest = path.join(pygbagCache, rel);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest + '.part', body);
      await fsp.rename(dest + '.part', dest);
      return { base: pygbagCache, file: dest };
    } catch { return null; }
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    let base = hubDir, rel = pathname;
    if (pathname.startsWith('/pygbag/')) {
      const hit = await pygbagFile(pathname.slice(8));
      if (!hit) return send(res, 404, 'Not found');
      base = hit.base; rel = path.relative(hit.base, hit.file);
    } else if (pathname.startsWith('/games/')) { base = gamesDir; rel = pathname.slice(7); }
    else if (pathname.startsWith('/shared/')) { base = sharedDir; rel = pathname.slice(8); }
    let file = path.resolve(base, '.' + path.sep + rel);
    if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');
    let stat;
    try { stat = await fsp.stat(file); } catch { return send(res, 404, 'Not found'); }
    if (stat.isDirectory()) {
      if (!pathname.endsWith('/')) return send(res, 301, '', { Location: pathname + '/' });   // keeps relative URLs working
      file = path.join(file, 'index.html');
      try { stat = await fsp.stat(file); } catch { return send(res, 404, 'Not found'); }
    }
    const real = await fsp.realpath(file);
    if (!real.startsWith(await fsp.realpath(base) + path.sep)) return send(res, 403, 'Forbidden');
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); return res.end(); }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(real).on('error', () => res.destroy()).pipe(res);
  }

  return http.createServer(async (req, res) => {
    try {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
      catch { return send(res, 400, 'Bad request'); }
      if (pathname.includes('\0')) return send(res, 400, 'Bad request');
      // pygbag's runtime treats the hostname "localhost" as its own dev server and looks for packages at
      // localhost:<port>/cdn/ (which does not exist here). 127.0.0.1 behaves like production, so redirect.
      const hostHeader = String(req.headers.host || '');
      if ((req.method === 'GET' || req.method === 'HEAD') && /^localhost(:\d+)?$/i.test(hostHeader)) {
        return send(res, 302, '', { Location: 'http://' + hostHeader.replace(/^localhost/i, '127.0.0.1') + req.url });
      }
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      return await serveStatic(req, res, pathname);
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'server error' });
      else res.destroy();
      if (!e.status) console.error(e);
    }
  });
}

function arg(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; }

if (require.main === module) {
  const host = arg('--host') || process.env.HOST || '127.0.0.1';
  const port = Number(arg('--port') || process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.');
  const server = createApp();
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Use --port.` : e.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`InfoM4th Arcade: http://localhost:${port}`);
    if (host === '0.0.0.0' || host === '::') {
      for (const list of Object.values(os.networkInterfaces()))
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  on your network: http://${a.address}:${port}`);
    }
  });
}

module.exports = { createApp };
