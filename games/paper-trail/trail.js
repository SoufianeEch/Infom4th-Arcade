'use strict';
// Paper Trail client: free movement, a camera that follows you, smooth territory outlines, minimap.
// The server (server/territory.cjs) runs the whole simulation; this page draws it and sends steering.
(function () {
  const R = window.Room, FX = window.FX, $ = R.$, S = R.S;
  const PALETTE = ['#e63946', '#2d6bff', '#2a9d8f', '#f4a261', '#9b5de5', '#f15bb5', '#00a6d6', '#6aa000', '#ff7b00', '#7a4cb0', '#7d8aa0', '#06b58a'];
  const colorOf = e => PALETTE[e.color % PALETTE.length];
  const LAYER_PPU = 16;                                // resolution of the cached land layer (pixels per world unit)
  const canvas = $('tt-canvas'), ctx = canvas.getContext('2d'), mini = $('tt-mini'), mctx = mini.getContext('2d');
  const RENDER_DELAY = 90;                             // ms: draw slightly in the past so movement between server ticks is smooth

  let intro = null, Q = 16, QA = 100, CPU = 2, lastBuild = 0;
  let owners = null, landVer = 0, layerVer = -1, layer = null, lctx = null, miniLayer = null;
  let snaps = [], trails = new Map(), latest = null;
  let cam = { x: 0, y: 0, init: false }, ppu = 24, cssW = 0, cssH = 0, dpr = 1;
  let raf = 0, ended = false, theme = {}, lastFrame = 0;

  // ------------------------------------------------------------ bot options: quick play + lobby settings
  const LEVEL_KEY = 'infom4th.papertrail.level';
  let level = 'normal', quick = false;
  try { level = localStorage.getItem(LEVEL_KEY) || 'normal'; } catch {}
  if (!['easy', 'normal', 'hard'].includes(level)) level = 'normal';
  function paintLevel() { for (const l of ['easy', 'normal', 'hard']) { const b = $('lvl-' + l); b.classList.toggle('on', l === level); b.setAttribute('aria-checked', String(l === level)); } }
  for (const l of ['easy', 'normal', 'hard']) $('lvl-' + l).onclick = () => { level = l; try { localStorage.setItem(LEVEL_KEY, l); } catch {} paintLevel(); FX.SFX.click(); };
  paintLevel();
  $('quick').onclick = () => { quick = true; if (!R.createRoom({ bots: 'auto', level })) quick = false; };       // a private room that starts by itself
  $('set-bots').onchange = () => R.send({ t: 'settings', bots: $('set-bots').value === 'auto' ? 'auto' : Number($('set-bots').value) });
  $('set-level').onchange = () => R.send({ t: 'settings', level: $('set-level').value });
  function showSettings(room) {
    const st = room.settings || { bots: 'auto', level: 'normal' }, host = room.hostId === R.S.me;
    $('set-bots').value = String(st.bots) in { auto: 1, 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } ? String(st.bots) : 'auto';
    $('set-level').value = st.level;
    $('set-bots').disabled = $('set-level').disabled = !host;
    $('settings-note').textContent = host ? '' : 'Only the host can change these.';
  }
  R.on('room', room => {
    if (room.game !== 'territory') return;
    showSettings(room);
    if (quick && room.state === 'lobby' && room.hostId === R.S.me) { quick = false; R.send({ t: 'start' }); }          // quick play: straight into the countdown
  });
  R.on('left', () => { quick = false; });
  R.on('error', () => { quick = false; });

  // ------------------------------------------------------------ messages from the server
  R.on('gstart', m => {
    intro = m; Q = m.q || 16; QA = m.qa || 100; CPU = m.cpu || 1;
    owners = new Uint8Array(m.gw * m.gh); landVer++; snaps = []; trails = new Map(); latest = null; ended = false; cam.init = false;
    $('tt-results').hidden = true; $('tt-banner').hidden = true;
    document.body.classList.add('playing');
    R.show('game'); resize(); readTheme(); buildLayer();
    if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); }
  });
  R.on('g', m => {
    if (!intro) return;
    if (m.full) {
      owners = decodeRuns(m.o, intro.gw * intro.gh); landVer++; trails = new Map(); snaps = [];
      for (const [i, pts] of Object.entries(m.tr || {})) trails.set(Number(i), pts.map(v => v / Q));
    } else {
      if (m.d && m.d.length) { for (let k = 0; k < m.d.length; k += 3) owners.fill(m.d[k + 2], m.d[k], m.d[k] + m.d[k + 1]); landVer++; }
      for (const i of m.clr || []) trails.set(i, []);
      for (const [i, pts] of Object.entries(m.tr || {})) { const a = trails.get(Number(i)) || []; for (const v of pts) a.push(v / Q); trails.set(Number(i), a); }
    }
    const rows = new Map();
    for (const r of m.e) rows.set(r[0], { x: r[1] / Q, y: r[2] / Q, ang: r[3] / QA, alive: r[4], c: r[5], k: r[6], r: r[7] });
    latest = { t: performance.now(), rows, left: m.left };
    snaps.push(latest); if (snaps.length > 8) snaps.shift();
    for (const ev of m.ev || []) onEvent(ev);
    hud();
  });
  R.on('gend', m => { ended = true; results(m.results); });
  R.on('lobby', () => stop());
  R.on('left', () => stop());
  R.on('room', room => { if (room.state === 'lobby') stop(); });
  function stop() {
    intro = latest = null; snaps = []; trails = new Map(); ended = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    document.body.classList.remove('playing');
    $('tt-results').hidden = true;
  }
  function decodeRuns(o, n) { const out = new Uint8Array(n); let p = 0; for (let k = 0; k < o.length; k += 2) { out.fill(o[k], p, p + o[k + 1]); p += o[k + 1]; } return out; }
  function readTheme() {
    const st = getComputedStyle(document.body), v = (n, d) => st.getPropertyValue(n).trim() || d;
    theme = { card: v('--card', '#ffffff'), grid: v('--grid', '#d9e2f5'), ink: v('--ink', '#1d3b8f'), paper: v('--paper', '#fbfaf4'), red: v('--red', '#f25c54') };
  }

  // ------------------------------------------------------------ smooth territory outlines
  // Land is a fine grid. To avoid a blocky look the outline of each player's land is traced and rounded (corner cutting).
  function traceLoops(own, w, h) {
    const stride = w + 1, perOwner = new Map();
    const add = (o, x1, y1, x2, y2) => { let m = perOwner.get(o); if (!m) perOwner.set(o, m = new Map()); const k = y1 * stride + x1; let l = m.get(k); if (!l) m.set(k, l = []); l.push(x2, y2); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = own[y * w + x]; if (!o) continue;
      if (y === 0 || own[(y - 1) * w + x] !== o) add(o, x, y, x + 1, y);
      if (x === w - 1 || own[y * w + x + 1] !== o) add(o, x + 1, y, x + 1, y + 1);
      if (y === h - 1 || own[(y + 1) * w + x] !== o) add(o, x + 1, y + 1, x, y + 1);
      if (x === 0 || own[y * w + x - 1] !== o) add(o, x, y + 1, x, y);
    }
    const result = new Map();
    for (const [o, next] of perOwner) {
      const loops = [];
      for (const [k0, list0] of next) {
        while (list0.length) {
          const sx = k0 % stride, sy = (k0 / stride) | 0;
          let ny = list0.pop(), nx = list0.pop();
          const pts = [sx, sy]; let px = sx, py = sy, cx = nx, cy = ny, guard = 0;
          while (!(cx === sx && cy === sy) && guard++ < 200000) {
            pts.push(cx, cy);
            const lst = next.get(cy * stride + cx);
            if (!lst || !lst.length) break;
            const dx = cx - px, dy = cy - py;
            let pick = lst.length - 2;                              // saddle vertices: keep diagonal cells apart by preferring the right-hand turn
            if (lst.length > 2) for (const [tx, ty] of [[-dy, dx], [dx, dy], [dy, -dx]]) { let found = -1; for (let q = 0; q < lst.length; q += 2) if (lst[q] - cx === tx && lst[q + 1] - cy === ty) { found = q; break; } if (found >= 0) { pick = found; break; } }
            const ex = lst[pick], ey = lst[pick + 1]; lst.splice(pick, 2);
            px = cx; py = cy; cx = ex; cy = ey;
          }
          if (pts.length >= 8) loops.push(pts);
        }
      }
      result.set(o, loops);
    }
    return result;
  }
  /** Douglas-Peucker on a closed loop: flattens grid staircases into straight runs (never moves the outline by more than `eps`). */
  function simplify(pts, eps) {
    const n = pts.length / 2;
    if (n < 8) return pts;
    const dist = (i, a, b) => {                                    // distance from point i to segment a-b
      const px = pts[2 * i], py = pts[2 * i + 1], ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++) { const d = Math.hypot(pts[2 * i] - pts[0], pts[2 * i + 1] - pts[1]); if (d > fd) { fd = d; far = i; } }
    const keep = new Uint8Array(n); keep[0] = 1; keep[far] = 1;
    const stack = [[0, far], [far, n]];                            // the second half wraps back to point 0
    while (stack.length) {
      const [a, b] = stack.pop(); let worst = -1, wi = -1;
      for (let i = a + 1; i < b; i++) { const d = dist(i % n, a % n, b % n); if (d > worst) { worst = d; wi = i; } }
      if (worst > eps && wi >= 0) { keep[wi % n] = 1; stack.push([a, wi], [wi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out.length >= 6 ? out : pts;
  }
  function smooth(pts, rounds) {
    for (let r = 0; r < rounds; r++) {
      const n = pts.length / 2, out = new Array(pts.length * 2);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, x1 = pts[2 * i], y1 = pts[2 * i + 1], x2 = pts[2 * j], y2 = pts[2 * j + 1];
        out[4 * i] = 0.75 * x1 + 0.25 * x2; out[4 * i + 1] = 0.75 * y1 + 0.25 * y2; out[4 * i + 2] = 0.25 * x1 + 0.75 * x2; out[4 * i + 3] = 0.25 * y1 + 0.75 * y2;
      }
      pts = out;
    }
    return pts;
  }
  function buildLayer() {
    if (!intro) return;
    const { w, h, gw, gh } = intro;
    if (!layer) { layer = document.createElement('canvas'); layer.width = w * LAYER_PPU; layer.height = h * LAYER_PPU; lctx = layer.getContext('2d'); miniLayer = document.createElement('canvas'); miniLayer.width = gw; miniLayer.height = gh; }
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(LAYER_PPU, 0, 0, LAYER_PPU, 0, 0); lctx.lineJoin = 'round';
    for (const [o, loops] of traceLoops(owners, gw, gh)) {
      const col = colorOf(intro.ents[o - 1]);
      const path = new Path2D();
      for (const pts of loops) { const s = smooth(simplify(pts, 0.55), 3); path.moveTo(s[0] / CPU, s[1] / CPU); for (let k = 2; k < s.length; k += 2) path.lineTo(s[k] / CPU, s[k + 1] / CPU); path.closePath(); }       // grid cells -> world units
      lctx.globalAlpha = 0.4; lctx.fillStyle = col; lctx.fill(path, 'evenodd');
      lctx.globalAlpha = 1; lctx.strokeStyle = col; lctx.lineWidth = 0.18; lctx.stroke(path);
    }
    // minimap: one pixel per cell
    const img = new ImageData(gw, gh), rgb = intro.ents.map(e => { const c = colorOf(e); return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; });
    for (let c = 0; c < gw * gh; c++) { const o = owners[c]; if (o) { img.data[4 * c] = rgb[o - 1][0]; img.data[4 * c + 1] = rgb[o - 1][1]; img.data[4 * c + 2] = rgb[o - 1][2]; img.data[4 * c + 3] = 255; } }
    miniLayer.getContext('2d').putImageData(img, 0, 0);
    layerVer = landVer; lastBuild = performance.now();
  }

  // ------------------------------------------------------------ sizing / camera
  function resize() {
    const stage = $('tt-stage');
    dpr = window.devicePixelRatio || 1;
    cssW = Math.max(300, stage.clientWidth || innerWidth); cssH = Math.max(300, stage.clientHeight || innerHeight);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const viewUnits = cssW < 520 ? 22 : cssW < 900 ? 30 : 38;                    // how many world units fit across the screen
    ppu = Math.max(12, Math.min(cssW / viewUnits, cssH / 17, 44));
  }
  addEventListener('resize', () => { if (intro) resize(); });

  // ------------------------------------------------------------ interpolation: draw between two server ticks
  function stateAt(time) {
    if (!snaps.length) return null;
    let a = snaps[0], b = null;
    for (let k = 0; k < snaps.length; k++) { if (snaps[k].t <= time) a = snaps[k]; else { b = snaps[k]; break; } }
    const out = new Map();
    for (const [i, ra] of a.rows) {
      const rb = b && b.rows.get(i);
      if (rb && ra.alive && rb.alive && b.t > a.t && Math.hypot(rb.x - ra.x, rb.y - ra.y) < 3) {
        const k = Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t)));
        let da = rb.ang - ra.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
        out.set(i, { ...rb, x: ra.x + (rb.x - ra.x) * k, y: ra.y + (rb.y - ra.y) * k, ang: ra.ang + da * k });
      } else out.set(i, ra);
    }
    return out;
  }

  // ------------------------------------------------------------ drawing
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!intro || !latest) return;
    if (layerVer !== landVer && now - lastBuild > 140) buildLayer();                 // land changes in bursts: redraw the smooth layer at most ~7 times a second
    draw(now, dt);
  }
  function draw(now, dt) {
    const { w, h } = intro, c = ctx, rows = stateAt(now - RENDER_DELAY) || latest.rows, me = rows.get(intro.you);
    if (me) {
      if (!cam.init) { cam.x = me.x; cam.y = me.y; cam.init = true; }
      const k = 1 - Math.exp(-dt * 9); cam.x += (me.x - cam.x) * k; cam.y += (me.y - cam.y) * k;     // the camera glides after you
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = theme.grid; c.fillRect(0, 0, cssW, cssH);                                            // outside the map
    const ox = cssW / 2 - cam.x * ppu, oy = cssH / 2 - cam.y * ppu;                                    // world -> screen
    c.fillStyle = theme.card; c.fillRect(ox, oy, w * ppu, h * ppu);
    // graph paper (only what is on screen)
    const x0 = Math.max(0, Math.floor(-ox / ppu)), x1 = Math.min(w, Math.ceil((cssW - ox) / ppu)), y0 = Math.max(0, Math.floor(-oy / ppu)), y1 = Math.min(h, Math.ceil((cssH - oy) / ppu));
    c.strokeStyle = theme.grid; c.lineWidth = 1; c.beginPath();
    for (let x = x0; x <= x1; x++) { const sx = Math.round(ox + x * ppu) + .5; c.moveTo(sx, Math.max(0, oy)); c.lineTo(sx, Math.min(cssH, oy + h * ppu)); }
    for (let y = y0; y <= y1; y++) { const sy = Math.round(oy + y * ppu) + .5; c.moveTo(Math.max(0, ox), sy); c.lineTo(Math.min(cssW, ox + w * ppu), sy); }
    c.stroke();
    // land (cached smooth layer, only the visible part is drawn)
    if (layer) {
      const sx = Math.max(0, x0 - 1), sy = Math.max(0, y0 - 1), ex = Math.min(w, x1 + 1), ey = Math.min(h, y1 + 1);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(layer, sx * LAYER_PPU, sy * LAYER_PPU, (ex - sx) * LAYER_PPU, (ey - sy) * LAYER_PPU, ox + sx * ppu, oy + sy * ppu, (ex - sx) * ppu, (ey - sy) * ppu);
    }
    // trails
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [i, pts] of trails) {
      const e = rows.get(i); if (!pts.length || !e || !e.alive) continue;
      c.strokeStyle = colorOf(intro.ents[i]); c.lineWidth = ppu * 0.42; c.globalAlpha = 0.85; c.beginPath();
      c.moveTo(ox + pts[0] * ppu, oy + pts[1] * ppu);
      for (let k = 2; k < pts.length; k += 2) c.lineTo(ox + pts[k] * ppu, oy + pts[k + 1] * ppu);
      c.lineTo(ox + e.x * ppu, oy + e.y * ppu); c.stroke();
    }
    c.globalAlpha = 1;
    // map edge
    c.strokeStyle = theme.red; c.lineWidth = Math.max(3, ppu * .25); c.strokeRect(ox, oy, w * ppu, h * ppu);
    // players
    for (const [i, e] of rows) {
      if (!e.alive) continue;
      const ent = intro.ents[i], px = ox + e.x * ppu, py = oy + e.y * ppu, mine = i === intro.you, r = ppu * (mine ? 0.72 : 0.62);
      if (px < -60 || py < -60 || px > cssW + 60 || py > cssH + 60) continue;
      c.fillStyle = theme.card; c.strokeStyle = colorOf(ent); c.lineWidth = Math.max(3, ppu * (mine ? 0.22 : 0.16));
      c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = colorOf(ent); c.beginPath(); c.moveTo(px + Math.cos(e.ang) * (r + ppu * .3), py + Math.sin(e.ang) * (r + ppu * .3));        // a little arrow shows where you are heading
      c.lineTo(px + Math.cos(e.ang + 2.5) * (r + ppu * .05), py + Math.sin(e.ang + 2.5) * (r + ppu * .05)); c.lineTo(px + Math.cos(e.ang - 2.5) * (r + ppu * .05), py + Math.sin(e.ang - 2.5) * (r + ppu * .05)); c.fill();
      c.font = Math.round(r * 1.25) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(ent.avatar, px, py + r * .06);
      c.font = '700 ' + Math.max(12, Math.round(ppu * .62)) + 'px "Patrick Hand", sans-serif'; c.fillStyle = theme.ink; c.fillText(mine ? 'YOU' : ent.name, px, py - r - ppu * .5);
      if (mine) { c.strokeStyle = theme.ink; c.setLineDash([ppu * .3, ppu * .3]); c.lineWidth = 2; c.beginPath(); c.arc(px, py, r + ppu * (.45 + .08 * Math.sin(now / 160)), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
    }
    drawMini(rows);
  }
  function drawMini(rows) {
    const mw = mini.width, mh = mini.height, { w, h } = intro, k = Math.min(mw / w, mh / h), ox = (mw - w * k) / 2, oy = (mh - h * k) / 2;
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.fillStyle = theme.card; mctx.fillRect(0, 0, mw, mh);
    mctx.imageSmoothingEnabled = false; if (miniLayer) mctx.drawImage(miniLayer, ox, oy, w * k, h * k);
    mctx.strokeStyle = theme.ink; mctx.lineWidth = 1; mctx.strokeRect(ox + .5, oy + .5, w * k - 1, h * k - 1);
    mctx.strokeStyle = theme.ink; mctx.strokeRect(ox + (cam.x - cssW / ppu / 2) * k, oy + (cam.y - cssH / ppu / 2) * k, cssW / ppu * k, cssH / ppu * k);      // what the camera sees
    for (const [i, e] of rows) { if (!e.alive) continue; mctx.fillStyle = i === intro.you ? theme.ink : colorOf(intro.ents[i]); mctx.beginPath(); mctx.arc(ox + e.x * k, oy + e.y * k, i === intro.you ? 3 : 2, 0, Math.PI * 2); mctx.fill(); }
  }

  // ------------------------------------------------------------ HUD
  const fmt = sec => { sec = Math.max(0, sec); return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`; };
  function hud() {
    const total = intro.gw * intro.gh, me = latest.rows.get(intro.you);
    $('tt-time').textContent = fmt(latest.left / intro.tps);
    $('tt-me').textContent = me ? (Math.round(1000 * me.c / total) / 10) + '%' : '0%';
    $('tt-kills').textContent = me ? me.k : 0;
    const board = $('tt-board'); board.textContent = '';
    for (const [i, e] of [...latest.rows].sort((a, b) => b[1].c - a[1].c || a[0] - b[0])) {
      const ent = intro.ents[i], li = R.el('li', (i === intro.you ? 'me ' : '') + (e.alive ? '' : 'dead'));
      const sw = R.el('span', 'sw'); sw.style.background = colorOf(ent);
      li.append(sw, R.el('span', 'av-s', ent.avatar), R.el('span', 'nm', ent.name + (ent.bot ? ' 🤖' : '')), R.el('span', 'pc', (Math.round(1000 * e.c / total) / 10) + '%'));
      board.append(li);
    }
    const banner = $('tt-banner');
    if (me && !me.alive && !ended) { banner.hidden = false; banner.textContent = `You were cut! Back in ${Math.max(1, me.r)}…`; }
    else banner.hidden = true;
  }

  // ------------------------------------------------------------ events: kills, claims
  function screenPos(wx, wy) { const r = canvas.getBoundingClientRect(); return [r.left + cssW / 2 + (wx - cam.x) * ppu, r.top + cssH / 2 + (wy - cam.y) * ppu]; }
  function popText(text, wx, wy, color) {
    const [sx, sy] = screenPos(wx, wy), e = R.el('span', 'float-emoji', text);
    e.style.left = sx + 'px'; e.style.top = sy + 'px'; e.style.fontSize = '30px'; e.style.fontFamily = 'var(--title)'; e.style.fontWeight = '700'; e.style.color = color || '#1d3b8f'; e.style.setProperty('--dx', '0px');
    document.body.append(e); setTimeout(() => e.remove(), 1900);
  }
  function onEvent(ev) {
    if (!intro) return;
    const name = i => (intro.ents[i] ? intro.ents[i].name : '?');
    if (ev.k === 'kill') {
      const wx = ev.x / Q, wy = ev.y / Q, [sx, sy] = screenPos(wx, wy);
      if (sx > -80 && sx < innerWidth + 80 && sy > -80 && sy < innerHeight + 80) { FX.burst(sx, sy, ev.who === intro.you ? 60 : 28); popText('💥', wx, wy); }
      if (ev.who === intro.you) { R.flash('#ff3b4d'); R.shake(); FX.SFX.splat(); R.toast(ev.by >= 0 ? `${name(ev.by)} cut your trail!` : 'You crashed!', 'warn'); }
      else if (ev.by === intro.you) { FX.SFX.pow(); R.toast(`You cut ${name(ev.who)}! ✂️`); }
      else if (ev.by >= 0) R.toast(`${name(ev.by)} cut ${name(ev.who)}`);
      else R.toast(`${name(ev.who)} crashed`, 'warn');
    } else if (ev.k === 'claim' && ev.i === intro.you && ev.n >= 8) {
      const wx = ev.x / Q, wy = ev.y / Q, [sx, sy] = screenPos(wx, wy);
      FX.SFX.claim(ev.n > 60); FX.burst(sx, sy, Math.min(60, 10 + ev.n / 3), .7); popText('+' + ev.n, wx, wy, '#12936a');
    }
  }

  // ------------------------------------------------------------ results
  function results(list) {
    const meRes = list.find(r => r.i === intro.you), won = list[0] && list[0].i === intro.you;
    $('tt-winner').textContent = won ? '🏆 You win!' : `🏆 ${list[0].name} wins!`;
    const ol = $('tt-final'); ol.textContent = '';
    list.forEach((r, idx) => {
      const li = R.el('li', r.i === intro.you ? 'me' : '');
      const sw = R.el('span', 'sw'); sw.style.background = colorOf(r);
      li.append(R.el('span', 'rank', String(idx + 1)), sw, R.el('span', 'av-s', r.avatar), R.el('span', 'nm', r.name + (r.bot ? ' 🤖' : '')), R.el('span', 'pc', r.pct + '%'), R.el('span', 'kl', r.kills ? `✂${r.kills}` : ''));
      ol.append(li);
    });
    const host = R.S.room && R.S.room.hostId === R.S.me;
    $('tt-again').hidden = !host; $('tt-wait').hidden = host;
    $('tt-results').hidden = false; $('tt-banner').hidden = true;
    if (won) { FX.SFX.crown(); FX.rain(120); } else FX.SFX.go();
    if (meRes && meRes.cells > 0) {
      try { if (window.parent !== window) window.parent.postMessage({ type: 'arcade:score', value: (meRes.units || 0) + meRes.kills * 20, label: 'points' }, location.origin); } catch {}
    }
  }
  $('tt-again').onclick = () => { FX.SFX.click(); R.send({ t: 'again' }); };

  // ------------------------------------------------------------ steering: mouse, touch drag, keyboard
  let lastSteer = 0, lastAngle = null, turning = 0, keysDown = new Set(), touch = null;
  function steerTo(angle) {
    const now = performance.now();
    if (!intro || ended || (lastAngle !== null && Math.abs(Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle))) < 0.05) || now - lastSteer < 55) return;
    lastSteer = now; lastAngle = angle; R.send({ t: 'steer', a: Math.round(angle * 100) / 100 });
  }
  function setTurn(v) { if (v !== turning && intro && !ended) { turning = v; R.send({ t: 'turn', v }); if (!v) lastAngle = null; } }
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || !intro || turning) return;
    const r = canvas.getBoundingClientRect();
    steerTo(Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)));     // the camera keeps you in the middle, so "towards the pointer" is relative to the centre
  });
  canvas.addEventListener('touchstart', e => { const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY }; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (!touch) return; const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.hypot(dx, dy) > 14) steerTo(Math.atan2(dy, dx));
    if (Math.hypot(dx, dy) > 70) touch = { x: t.clientX - dx * 0.5, y: t.clientY - dy * 0.5 };          // the drag origin follows the finger so a long drag never gets stuck
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { touch = null; });
  document.addEventListener('keydown', e => {
    if (!intro || $('screen-game').hidden || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    const left = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A', right = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
    if (left || right) { e.preventDefault(); keysDown.add(left ? -1 : 1); setTurn(left ? -1 : 1); }
  });
  document.addEventListener('keyup', e => {
    const left = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A', right = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
    if (!left && !right) return;
    keysDown.delete(left ? -1 : 1);
    setTurn(keysDown.size ? [...keysDown][keysDown.size - 1] : 0);
  });
  window.PaperTrail = { traceLoops, smooth, simplify };                        // exposed for tests
  $('tt-sound').onclick = () => { FX.setMuted(!FX.isMuted()); $('tt-sound').textContent = FX.isMuted() ? '🔇' : '🔊'; };
})();
