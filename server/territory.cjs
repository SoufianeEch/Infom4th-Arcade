'use strict';
/* Paper Trail: territory-capture engine with FREE movement (territorygames.io style). Pure logic: no sockets, no timers.
 *   const g = new Territory({ rng, entities: [{ id, name, avatar, color, bot, level }], duration });
 *   g.setSteer(id, angle)  // head towards an angle (mouse / touch)      g.setTurn(id, -1 | 0 | 1)   // keyboard: turn left / right
 *   const events = g.tick();   g.delta();   g.snapshot();
 * Everyone moves continuously at a constant speed and turns at a limited rate, so paths are smooth arcs. Land is stored on a
 * fine grid (2 x 2 cells per world unit). Step off your land and a trail follows you; come back onto your land and the trail plus
 * everything it encloses becomes yours. Touch someone's trail and THEY are knocked out; close a loop around a trail and it is cut.
 */
const W = 150, H = 100;                    // the map in world units
const CPU = 2;                              // land grid resolution: cells per world unit (finer land = smoother edges)
const GW = W * CPU, GH = H * CPU;
const TICKS_PER_SECOND = 20;
const DT = 1 / TICKS_PER_SECOND;
const SPEED = 5.2;                         // world units per second
const TURN_RATE = 3.6;                     // radians per second
const HIT_R = 0.5;                         // how close a head must get to a trail point to cut it
const SPAWN_R = 2.8;                       // radius of the starting patch of land
const TRAIL_STEP = 0.35;                   // spacing between trail points
const SELF_SKIP = 10;                      // newest own trail points that cannot hurt you
const RESPAWN_TICKS = 3 * TICKS_PER_SECOND;
const Q = 16;                              // positions travel as integers (units * 16)
const QA = 100;                            // angles travel as integers (radians * 100)

// Bot skill: loop sizes (trail length in units), how often they chase a cut, how often they wobble, how many seconds of their real turning path they check for danger,
// and `alert`: how close an enemy head may get to their trail before they run home (0 = never notices).
const LEVELS = {
  easy:   { legs: [6, 12],  chase: 0.03, slip: 0.012, look: 0.6, alert: 0 },
  normal: { legs: [10, 24], chase: 0.08, slip: 0.003, look: 0.9, alert: 5 },
  hard:   { legs: [14, 32], chase: 0.12, slip: 0,     look: 1.2, alert: 9 },
};

const TAU = Math.PI * 2;
const idxOf = (gx, gy) => gy * GW + gx;                                    // land cell index from grid coordinates
const cellOf = (x, y) => idxOf(Math.min(GW - 1, Math.max(0, Math.floor(x * CPU))), Math.min(GH - 1, Math.max(0, Math.floor(y * CPU))));   // ...from world coordinates
const norm = a => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const q = v => Math.round(v * Q);

class Territory {
  constructor({ rng = Math.random, entities, duration = 150 * TICKS_PER_SECOND }) {
    this.rng = rng;
    this.W = W; this.H = H; this.GW = GW; this.GH = GH;
    this.owner = new Uint8Array(GW * GH);                    // 0 = nobody, else entity index + 1
    this.counts = new Int32Array(entities.length + 1);
    this.changed = new Set();                                // cells whose owner changed since the last delta()
    this.tickNo = 0;
    this.duration = duration;
    this.finished = false;
    this.ents = entities.map((e, i) => ({
      i, id: e.id, name: e.name, avatar: e.avatar, color: e.color, bot: !!e.bot, auto: !!e.bot, level: LEVELS[e.level] ? e.level : 'normal',
      x: 0, y: 0, px: 0, py: 0, ang: 0, target: null, turn: 0, alive: false, out: false, trail: [], sent: 0, cleared: false, trailLen: 0,
      respawn: 0, kills: 0, deaths: 0, ai: { phase: 'home', a0: 0, l1: 8, l2: 6, side: 1, wobble: 0, chase: null, chaseUntil: 0, homeAt: 0, home: null },
    }));
    for (const e of this.ents) this.spawn(e);
  }

  byId(id) { return this.ents.find(e => e.id === id); }
  rnd(n) { return Math.floor(this.rng() * n); }
  between(a, b) { return a + this.rng() * (b - a); }
  setOwner(c, v) {
    const old = this.owner[c];
    if (old === v) return;
    this.counts[old]--; this.counts[v]++;
    this.owner[c] = v; this.changed.add(c);
  }
  cellsOf(e) { return this.counts[e.i + 1]; }

  // ------------------------------------------------------------------ spawning
  spawn(e) {
    let best = null;
    for (let tries = 0; tries < 300; tries++) {
      const cx = 6 + this.rng() * (W - 12), cy = 6 + this.rng() * (H - 12);
      let free = true;
      for (let y = Math.floor(cy * CPU) - 5 * CPU; y <= Math.floor(cy * CPU) + 5 * CPU && free; y++) for (let x = Math.floor(cx * CPU) - 5 * CPU; x <= Math.floor(cx * CPU) + 5 * CPU; x++) {
        if (x >= 0 && y >= 0 && x < GW && y < GH && this.owner[idxOf(x, y)]) { free = false; break; }
      }
      if (free && !this.ents.some(o => o !== e && o.alive && Math.hypot(o.x - cx, o.y - cy) < 14)) { best = [cx, cy]; break; }
      if (!best) best = [cx, cy];
    }
    const [cx, cy] = best;
    for (let y = Math.floor((cy - SPAWN_R) * CPU); y <= Math.ceil((cy + SPAWN_R) * CPU); y++) for (let x = Math.floor((cx - SPAWN_R) * CPU); x <= Math.ceil((cx + SPAWN_R) * CPU); x++) {
      if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      if (Math.hypot((x + 0.5) / CPU - cx, (y + 0.5) / CPU - cy) <= SPAWN_R) this.setOwner(idxOf(x, y), e.i + 1);
    }
    Object.assign(e, { x: cx, y: cy, px: cx, py: cy, ang: this.between(-Math.PI, Math.PI), target: null, turn: 0, alive: true, out: false, respawn: 0 });
    this.clearTrail(e);
    e.ai.phase = 'home'; e.ai.chase = null;
    return e;
  }

  clearTrail(e) { e.trail = []; e.trailLen = 0; e.out = false; e.cleared = true; e.sent = 0; }

  // ------------------------------------------------------------------ input
  setSteer(id, a) { const e = this.byId(id); if (e && e.alive && Number.isFinite(a)) { e.target = norm(a); e.turn = 0; } }
  setTurn(id, v) { const e = this.byId(id); if (e && e.alive && (v === -1 || v === 0 || v === 1)) { e.turn = v; if (v) e.target = null; } }
  setAuto(id, on) { const e = this.byId(id); if (e && !e.bot) { e.auto = !!on; if (on) { e.turn = 0; e.target = null; } } }

  // ------------------------------------------------------------------ one tick
  tick() {
    if (this.finished) return [];
    this.tickNo++;
    const events = [];

    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.auto) this.think(e);
      // turn (limited rate: smooth arcs, no instant 90 degree corners)
      if (e.turn) e.ang = norm(e.ang + e.turn * TURN_RATE * DT);
      else if (e.target != null) { const d = norm(e.target - e.ang), step = TURN_RATE * DT; e.ang = norm(e.ang + Math.max(-step, Math.min(step, d))); }
      // move
      e.px = e.x; e.py = e.y;
      e.x = Math.min(W - 0.5, Math.max(0.5, e.x + Math.cos(e.ang) * SPEED * DT));
      e.y = Math.min(H - 0.5, Math.max(0.5, e.y + Math.sin(e.ang) * SPEED * DT));
      const onOwn = this.owner[cellOf(e.x, e.y)] === e.i + 1;
      if (!onOwn) {
        if (!e.out) { e.out = true; e.trail = [e.px, e.py]; e.trailLen = 0; e.cleared = true; e.sent = 0; }
        const n = e.trail.length, lx = e.trail[n - 2], ly = e.trail[n - 1], d = Math.hypot(e.x - lx, e.y - ly);
        if (d >= TRAIL_STEP) { e.trail.push(e.x, e.y); e.trailLen += d; }
      }
    }

    // who is cut this tick (trail state after everyone moved)
    const dying = new Map();
    const kill = (victim, killer) => { if (victim.alive && !dying.has(victim)) dying.set(victim, killer); };
    for (const e of this.ents) {
      if (!e.alive) continue;
      for (const o of this.ents) {
        if (!o.alive || !o.out || o.trail.length < 4) continue;
        const n = o.trail.length / 2, limit = o === e ? n - SELF_SKIP : n;
        for (let k = 0; k < limit; k++) {
          const dx = o.trail[2 * k] - e.x, dy = o.trail[2 * k + 1] - e.y;
          if (dx * dx + dy * dy < HIT_R * HIT_R) { kill(o, o === e ? null : e); break; }
        }
      }
    }
    for (let a = 0; a < this.ents.length; a++) for (let b = a + 1; b < this.ents.length; b++) {   // heads colliding
      const p = this.ents[a], r = this.ents[b];
      if (!p.alive || !r.alive || Math.hypot(p.x - r.x, p.y - r.y) > 0.9) continue;
      const pOut = this.owner[cellOf(p.x, p.y)] !== p.i + 1, rOut = this.owner[cellOf(r.x, r.y)] !== r.i + 1;
      if (pOut && rOut) { kill(p, null); kill(r, null); } else if (pOut) kill(p, r); else if (rOut) kill(r, p);
    }

    // coming home closes the loop
    for (const e of this.ents) {
      if (!e.alive || dying.has(e) || !e.out) continue;
      if (this.owner[cellOf(e.x, e.y)] === e.i + 1) this.capture(e, events, kill);
    }
    for (const [victim, killer] of dying) this.die(victim, killer, events);

    for (const e of this.ents) {
      if (e.alive || e.respawn <= 0) continue;
      if (--e.respawn === 0) { this.spawn(e); events.push({ k: 'spawn', i: e.i }); }
    }
    if (this.tickNo >= this.duration) { this.finished = true; events.push({ k: 'end' }); }
    return events;
  }

  die(e, killer, events) {
    if (!e.alive) return;
    for (let c = 0; c < this.owner.length; c++) if (this.owner[c] === e.i + 1) this.setOwner(c, 0);
    this.clearTrail(e);
    e.alive = false; e.deaths++; e.respawn = RESPAWN_TICKS;
    if (killer && killer !== e) killer.kills++;
    events.push({ k: 'kill', by: killer ? killer.i : -1, who: e.i, x: q(e.x), y: q(e.y) });
  }

  capture(e, events, kill) {
    const me = e.i + 1, gained = new Uint8Array(GW * GH);
    let added = 0;
    const take = c => { if (this.owner[c] !== me) { this.setOwner(c, me); gained[c] = 1; added++; } };
    for (let k = 0; k < e.trail.length; k += 2) {                                                  // the trail itself becomes land (every cell along each segment, so the barrier has no gaps)
      const x0 = e.trail[k], y0 = e.trail[k + 1], x1 = k + 2 < e.trail.length ? e.trail[k + 2] : x0, y1 = k + 2 < e.trail.length ? e.trail[k + 3] : y0;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * CPU * 2));
      for (let n = 0; n <= steps; n++) take(cellOf(x0 + (x1 - x0) * n / steps, y0 + (y1 - y0) * n / steps));
    }
    // flood fill from the border over cells that are not mine: whatever it cannot reach is enclosed
    const outside = new Uint8Array(GW * GH), stack = new Int32Array(GW * GH);
    let sp = 0;
    const push = c => { if (!outside[c] && this.owner[c] !== me) { outside[c] = 1; stack[sp++] = c; } };
    for (let x = 0; x < GW; x++) { push(idxOf(x, 0)); push(idxOf(x, GH - 1)); }
    for (let y = 0; y < GH; y++) { push(idxOf(0, y)); push(idxOf(GW - 1, y)); }
    while (sp) {
      const c = stack[--sp], x = c % GW, y = (c / GW) | 0;
      if (x > 0) push(c - 1); if (x < GW - 1) push(c + 1); if (y > 0) push(c - GW); if (y < GH - 1) push(c + GW);
    }
    for (let c = 0; c < outside.length; c++) if (!outside[c] && this.owner[c] !== me) take(c);
    for (const o of this.ents) {                              // closing a loop around someone's trail cuts it
      if (o === e || !o.alive || !o.out) continue;
      for (let k = 0; k < o.trail.length; k += 2) if (gained[cellOf(o.trail[k], o.trail[k + 1])]) { kill(o, e); break; }
    }
    this.clearTrail(e);
    events.push({ k: 'claim', i: e.i, n: Math.round(added / (CPU * CPU)), x: q(e.x), y: q(e.y) });           // n in world units squared
  }

  // ------------------------------------------------------------------ bots / autopilot (smooth steering, no grid)
  /** Where is something dangerous in front of us? 'wall' | 'own' | 'enemy' | null */
  hazard(e, x, y) {
    if (x < 0.8 || y < 0.8 || x > W - 0.8 || y > H - 0.8) return 'wall';
    for (const o of this.ents) {
      if (!o.alive || !o.out) continue;
      const n = o.trail.length / 2, limit = o === e ? n - 2 * SELF_SKIP : n;
      for (let k = 0; k < limit; k++) {
        const dx = o.trail[2 * k] - x, dy = o.trail[2 * k + 1] - y;
        if (dx * dx + dy * dy < 0.85 * 0.85) return o === e ? 'own' : 'enemy';
      }
    }
    return null;
  }

  /** Would steering towards `a` (turning at the real turn rate) stay clear of walls, my own trail and (unless attacking) enemy trails? */
  pathSafe(e, a, attacking, seconds) {
    let x = e.x, y = e.y, ang = e.ang;
    const dt = 0.1, steps = Math.round(seconds / dt);
    for (let k = 0; k < steps; k++) {
      const d = norm(a - ang), step = TURN_RATE * dt;
      ang = norm(ang + Math.max(-step, Math.min(step, d)));
      x += Math.cos(ang) * SPEED * dt; y += Math.sin(ang) * SPEED * dt;
      const h = this.hazard(e, x, y);
      if (h === 'wall' || h === 'own' || (h === 'enemy' && !attacking)) return false;
    }
    return true;
  }

  safeAngle(e, desired, attacking) {
    const seconds = LEVELS[e.level].look;
    for (const off of [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, Math.PI]) {
      const a = desired + off;
      if (this.pathSafe(e, a, attacking, seconds)) return a;
    }
    return desired;
  }

  /** A waypoint on the shortest way back to my land that does not cross my own trail (BFS on a coarse 1-unit grid). */
  homePath(e) {
    const me = e.i + 1, gw = W, gh = H, blocked = new Uint8Array(gw * gh);
    const keep = Math.max(0, e.trail.length - 2 * 4);                       // my newest points are right behind me: they do not block
    for (let k = 0; k < keep; k += 2) {
      const cx = Math.floor(e.trail[k]), cy = Math.floor(e.trail[k + 1]);
      for (let dy = -0; dy <= 0; dy++) for (let dx = -0; dx <= 0; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < gw && y < gh) blocked[y * gw + x] = 1; }
    }
    const start = Math.min(gh - 1, Math.max(0, Math.floor(e.y))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(e.x)));
    const prev = new Int32Array(gw * gh).fill(-1), queue = [start];
    prev[start] = start;
    let goal = -1;
    for (let qi = 0; qi < queue.length && goal < 0; qi++) {
      const c = queue[qi], x = c % gw, y = (c / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
        const n = ny * gw + nx;
        if (prev[n] !== -1 || blocked[n]) continue;
        prev[n] = c; queue.push(n);
        if (this.owner[cellOf(nx + 0.5, ny + 0.5)] === me) { goal = n; break; }
      }
    }
    if (goal < 0) return null;
    const path = [];
    for (let c = goal; c !== start; c = prev[c]) path.push(c);
    path.reverse();
    const target = path[Math.min(path.length - 1, 3)];                       // aim a few cells ahead along the path
    return [(target % gw) + 0.5, ((target / gw) | 0) + 0.5];
  }

  /** Is an enemy head within `r` units of my trail (or my head)? */
  threatened(e, r) {
    const r2 = r * r;
    for (const o of this.ents) {
      if (o === e || !o.alive) continue;
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < r2) return true;
      for (let k = 0; k < e.trail.length; k += 4) if ((o.x - e.trail[k]) ** 2 + (o.y - e.trail[k + 1]) ** 2 < r2) return true;
    }
    return false;
  }

  think(e) {
    const L = LEVELS[e.level], ai = e.ai, me = e.i + 1;
    const onOwn = this.owner[cellOf(e.x, e.y)] === me;
    if (!e.out) {
      if (ai.phase !== 'leg1') {                              // at home: plan a loop (out, sideways, home)
        const cx = W / 2 - e.x, cy = H / 2 - e.y;
        ai.a0 = Math.atan2(cy, cx) + this.between(-1.6, 1.6);
        ai.l1 = this.between(L.legs[0], L.legs[1]); ai.l2 = this.between(L.legs[0], L.legs[1]) * 0.8;
        ai.side = this.rng() < 0.5 ? 1 : -1; ai.phase = 'leg1';
      }
    }
    let desired = ai.a0;
    if (e.out && L.alert && ai.phase !== 'back' && this.threatened(e, L.alert)) ai.phase = 'back';          // someone is closing in on my trail: go home
    if (e.out) {
      if (ai.phase === 'leg1' && e.trailLen >= ai.l1) ai.phase = 'leg2';
      if (ai.phase === 'leg2' && e.trailLen >= ai.l1 + ai.l2) ai.phase = 'back';
      if (ai.phase === 'leg2') desired = ai.a0 + ai.side * Math.PI / 2;
      else if (ai.phase === 'back' || ai.phase === 'home') {
        if (this.tickNo >= ai.homeAt || !ai.home) { ai.home = this.homePath(e); ai.homeAt = this.tickNo + 4; }
        desired = ai.home ? Math.atan2(ai.home[1] - e.y, ai.home[0] - e.x) : e.ang;
      }
    } else if (!onOwn) ai.phase = 'home';
    // a chance to chase an enemy trail that is close
    let attacking = false;
    if (this.tickNo >= ai.chaseUntil) ai.chase = null;
    if (!ai.chase && this.rng() < L.chase * DT * 6) {
      let best = null, bd = 49;
      for (const o of this.ents) {
        if (o === e || !o.alive || !o.out) continue;
        for (let k = 0; k < o.trail.length; k += 2) { const d = (o.trail[k] - e.x) ** 2 + (o.trail[k + 1] - e.y) ** 2; if (d < bd) { bd = d; best = [o.trail[k], o.trail[k + 1]]; } }
      }
      if (best) { ai.chase = best; ai.chaseUntil = this.tickNo + Math.round(1.6 * TICKS_PER_SECOND); }
    }
    if (ai.chase) { desired = Math.atan2(ai.chase[1] - e.y, ai.chase[0] - e.x); attacking = true; }
    if (L.slip && this.rng() < L.slip) ai.wobble = this.tickNo + 12;
    if (this.tickNo < ai.wobble) desired += Math.sin(this.tickNo) * 1.2;
    e.turn = 0;
    e.target = norm(this.safeAngle(e, desired, attacking));
  }

  // ------------------------------------------------------------------ views
  ranking() {
    const total = GW * GH;
    return this.ents.slice().map(e => ({ e, cells: this.cellsOf(e) })).sort((a, b) => b.cells - a.cells || b.e.kills - a.e.kills || a.e.i - b.e.i)
      .map(({ e, cells }) => ({ i: e.i, id: e.id, name: e.name, avatar: e.avatar, color: e.color, bot: e.bot, cells, units: Math.round(cells / (CPU * CPU)), pct: Math.round(1000 * cells / total) / 10, kills: e.kills, deaths: e.deaths }));
  }

  entRow(e) { return [e.i, q(e.x), q(e.y), Math.round(e.ang * QA), e.alive ? 1 : 0, this.cellsOf(e), e.kills, e.alive ? 0 : Math.ceil(e.respawn / TICKS_PER_SECOND)]; }
  static rle(owner) {
    const o = []; let cur = owner[0], n = 0;
    for (let c = 0; c < owner.length; c++) { if (owner[c] === cur) n++; else { o.push(cur, n); cur = owner[c]; n = 1; } }
    o.push(cur, n);
    return o;
  }
  /** Everything needed to draw from scratch (new or returning player). */
  snapshot() {
    const tr = {};
    for (const e of this.ents) if (e.out) tr[e.i] = e.trail.map(q);
    return { n: this.tickNo, left: Math.max(0, this.duration - this.tickNo), full: 1, o: Territory.rle(this.owner), e: this.ents.map(e => this.entRow(e)), tr };
  }
  /** What changed since the last delta(): owner runs [start, length, owner, ...], new trail points, cleared trails. */
  delta() {
    const idx = [...this.changed].sort((a, b) => a - b), d = [];
    for (let k = 0; k < idx.length;) {
      const start = idx[k], v = this.owner[start]; let len = 1;
      while (k + len < idx.length && idx[k + len] === start + len && this.owner[idx[k + len]] === v) len++;
      d.push(start, len, v); k += len;
    }
    this.changed.clear();
    const tr = {}, clr = [];
    for (const e of this.ents) {
      if (e.cleared) { clr.push(e.i); e.cleared = false; e.sent = 0; }
      if (e.out && e.trail.length > e.sent) { tr[e.i] = e.trail.slice(e.sent).map(q); e.sent = e.trail.length; }
    }
    return { n: this.tickNo, left: Math.max(0, this.duration - this.tickNo), d, e: this.ents.map(e => this.entRow(e)), tr, clr };
  }
  intro() { return { w: W, h: H, gw: GW, gh: GH, cpu: CPU, tps: TICKS_PER_SECOND, duration: this.duration, q: Q, qa: QA, speed: SPEED, ents: this.ents.map(e => ({ i: e.i, id: e.id, name: e.name, avatar: e.avatar, color: e.color, bot: e.bot })) }; }
}

function decodeOwners(o) { const out = new Uint8Array(GW * GH); let p = 0; for (let k = 0; k < o.length; k += 2) { out.fill(o[k], p, p + o[k + 1]); p += o[k + 1]; } return out; }
function applyRuns(owner, d) { for (let k = 0; k < d.length; k += 3) owner.fill(d[k + 2], d[k], d[k] + d[k + 1]); return owner; }

module.exports = { Territory, LEVELS, W, H, GW, GH, CPU, TICKS_PER_SECOND, RESPAWN_TICKS, SPEED, TURN_RATE, HIT_R, Q, QA, decodeOwners, applyRuns };
