const test = require('node:test');
const assert = require('node:assert/strict');
const { Territory, LEVELS, W, H, GW, GH, CPU, TICKS_PER_SECOND, RESPAWN_TICKS, SPEED, TURN_RATE, decodeOwners, applyRuns, Q, QA } = require('../server/territory.cjs');

const TPS = TICKS_PER_SECOND;
function seeded(seed = 1) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const ents = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'E' + i, avatar: '🦊', color: i, bot: false, ...extra }));
const at = (x, y) => Math.floor(y * CPU) * GW + Math.floor(x * CPU);          // land cell under a world position
/** Clean board: land patches (radius 3) with entities placed exactly at x, y heading `ang`. */
function place(specs, opts = {}) {
  const g = new Territory({ rng: seeded(5), entities: ents(specs.length, opts.bot ? { bot: true } : {}), ...opts.game });
  g.owner.fill(0); g.counts.fill(0); g.changed.clear();
  specs.forEach((s, i) => {
    const e = g.ents[i];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (Math.hypot((x + .5) / CPU - s.x, (y + .5) / CPU - s.y) <= 3) g.setOwner(y * GW + x, i + 1);
    Object.assign(e, { x: s.x, y: s.y, px: s.x, py: s.y, ang: s.ang ?? 0, target: null, turn: 0, alive: true, out: false, trail: [], trailLen: 0, respawn: 0 });
  });
  g.changed.clear();
  return g;
}
const run = (g, seconds, fn) => { for (let t = 0; t < seconds * TPS; t++) { g.tick(); if (fn) fn(t); } };
function invariants(g) {
  const counts = new Array(g.ents.length + 1).fill(0);
  for (const v of g.owner) { assert.ok(v <= g.ents.length); counts[v]++; }
  g.ents.forEach((e, i) => assert.equal(g.counts[i + 1], counts[i + 1], 'incremental land counters stay exact'));
  for (const e of g.ents) {
    assert.ok(e.x >= 0 && e.x <= W && e.y >= 0 && e.y <= H, 'inside the map');
    if (!e.alive) { assert.equal(e.trail.length, 0); assert.equal(g.counts[e.i + 1], 0, 'dead players own nothing'); }
    if (!e.out) assert.equal(e.trail.length, 0);
  }
}

test('everyone spawns alive on a round patch of land with room around it', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = new Territory({ rng: seeded(seed), entities: ents(6) });
    assert.ok(g.ents.every(e => e.alive && g.cellsOf(e) > 20 * CPU * CPU), 'seed ' + seed);
    for (const e of g.ents) assert.equal(g.owner[at(e.x, e.y)], e.i + 1, 'standing on own land');
    invariants(g);
  }
});

test('movement is continuous at constant speed, not cell by cell', () => {
  const g = place([{ x: 50, y: 50, ang: 0.3 }]);
  const e = g.ents[0];
  const xs = []; for (let t = 0; t < 20; t++) { g.tick(); xs.push(e.x); }
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(steps.every(d => d > 0 && d < 0.3), 'many small sub-cell steps');
  const dist = Math.hypot(e.x - 50, e.y - 50);
  assert.ok(Math.abs(dist - SPEED * 20 / TPS) < 0.05, `speed ${dist}`);
  assert.ok(Math.abs(Math.atan2(e.y - 50, e.x - 50) - 0.3) < 0.01, 'straight line along the heading');
});

test('turning is smooth: limited turn rate, shortest way round, keyboard turning', () => {
  const g = place([{ x: 50, y: 50, ang: 0 }]);
  const e = g.ents[0];
  g.setSteer('e0', Math.PI * 0.9);                          // almost a U-turn
  g.tick();
  assert.ok(Math.abs(e.ang - TURN_RATE / TPS) < 1e-9, 'one tick turns only a little');
  const angles = [e.ang]; for (let t = 0; t < 40; t++) { g.tick(); angles.push(e.ang); }
  assert.ok(angles.slice(1).every((a, i) => Math.abs(Math.abs(a - angles[i]) - TURN_RATE / TPS) < 1e-6 || Math.abs(a - Math.PI * 0.9) < 1e-6), 'constant turn rate until the target');
  assert.ok(Math.abs(e.ang - Math.PI * 0.9) < 1e-6, 'reaches the target heading');
  const h = place([{ x: 50, y: 50, ang: 3 }]);
  h.setSteer('e0', -3);                                     // -3 rad is 0.28 rad away through the +/-pi seam: it must go that short way
  h.tick(); assert.ok(h.ents[0].ang > 3 || h.ents[0].ang < -2.9, 'wraps through pi instead of unwinding');
  const k = place([{ x: 50, y: 50, ang: 0 }]);
  k.setTurn('e0', 1); run(k, 0.5);
  assert.ok(Math.abs(k.ents[0].ang - TURN_RATE * 0.5) < 0.2, 'holding a key keeps turning');
  k.setTurn('e0', 0); const a0 = k.ents[0].ang; run(k, 0.5);
  assert.ok(Math.abs(k.ents[0].ang - a0) < 1e-9, 'releasing stops turning');
  k.setTurn('e0', 7); k.setSteer('e0', NaN);               // junk is ignored
  assert.equal(k.ents[0].turn, 0);
});

test('leaving your land draws a trail of closely spaced points; walls stop you but never kill you', () => {
  const g = place([{ x: 20, y: 50, ang: 0 }]);
  const e = g.ents[0];
  run(g, 2);
  assert.equal(e.out, true);
  assert.ok(e.trail.length / 2 > 10, 'a real trail');
  for (let k = 2; k < e.trail.length; k += 2) assert.ok(Math.hypot(e.trail[k] - e.trail[k - 2], e.trail[k + 1] - e.trail[k - 1]) < 0.7, 'no gaps in the trail');
  const w = place([{ x: 3, y: 3, ang: Math.PI }]);
  run(w, 3);
  assert.ok(w.ents[0].alive && w.ents[0].x >= 0.5 && w.ents[0].x < 1, 'pressed against the wall, still alive');
  invariants(g); invariants(w);
});

test('coming home closes the loop: the trail and everything it encloses become land', () => {
  const g = place([{ x: 30, y: 50, ang: 0 }]);
  const e = g.ents[0];
  const before = g.cellsOf(e);
  // out east, then north, then west, then back south onto the land: a rounded rectangle
  const legs = [[0, 3.0], [-Math.PI / 2, 2.2], [Math.PI, 3.0], [Math.PI / 2, 2.4]];
  const events = [];
  for (const [a, secs] of legs) { g.setSteer('e0', a); run(g, secs, () => {}); }
  for (let t = 0; t < 40 && e.out; t++) events.push(...g.tick());
  assert.equal(e.out, false, 'loop closed');
  assert.ok(g.cellsOf(e) > before + 60 * CPU * CPU, `claimed land, ${before} -> ${g.cellsOf(e)}`);
  const claim = events.find(x => x.k === 'claim');
  assert.ok(g.cellsOf(e) - before >= 1);
  assert.equal(g.owner[at(40, 45)], 1, 'inside the loop is mine');
  assert.equal(g.owner[at(100, 20)], 0);
  invariants(g);
});

test('touching someone else\'s trail cuts THEM: they lose their land, respawn later; the cutter gets the credit', () => {
  const g = place([{ x: 30, y: 50, ang: 0 }, { x: 60, y: 10, ang: Math.PI / 2 }]);
  const [a, b] = g.ents;
  run(g, 2);                                                // a leaves a trail eastwards along y=50
  b.x = b.px = 45; b.y = b.py = 44; b.ang = Math.PI / 2; b.target = null;    // b heads south straight across it
  const events = []; run(g, 3, () => {});
  assert.equal(a.alive, false, 'trail owner is knocked out');
  assert.equal(b.kills, 1);
  assert.equal(g.cellsOf(a), 0);
  assert.equal(a.trail.length, 0);
  assert.ok(b.alive);
  run(g, RESPAWN_TICKS / TPS + 0.2);
  assert.equal(a.alive, true, 'respawned');
  assert.ok(g.cellsOf(a) > 20 * CPU * CPU);
  invariants(g);
});

test('your own trail cuts you (a tight circle far from home), but only its older part', () => {
  const g = place([{ x: 20, y: 50, ang: 0 }]);
  const e = g.ents[0];
  Object.assign(e, { x: 80, y: 50, px: 80, py: 50, out: true, trail: [80, 50], trailLen: 0 });      // already out in the open, far from the land
  g.setTurn('e0', 1);                                       // keep turning: a circle that runs into its own tail
  let died = false, landAtDeath = -1; run(g, 8, () => { if (!e.alive && !died) { died = true; landAtDeath = g.cellsOf(e); } });
  assert.ok(died, 'a circle of the trail eventually hits itself');
  assert.equal(e.kills, 0, 'a self-inflicted death gives nobody a kill');
  assert.equal(landAtDeath, 0, 'and costs all the land');
  const slow = place([{ x: 20, y: 50, ang: 0 }]);
  run(slow, 1.5);
  assert.ok(slow.ents[0].alive, 'the newest own points never hurt you');
});

test('head-on collisions: both outside their land -> both die; one inside its own land -> only the outside one dies', () => {
  const g = place([{ x: 20, y: 50, ang: 0 }, { x: 60, y: 50, ang: Math.PI }]);
  run(g, 6);
  assert.ok(g.ents.every(e => e.deaths > 0), 'both died');
  assert.ok(g.ents.every(e => e.kills === 0));
  const h = place([{ x: 30, y: 50, ang: Math.PI / 2 }, { x: 30, y: 60, ang: 0 }]);
  const [home, intruder] = h.ents;
  intruder.x = intruder.px = 30; intruder.y = intruder.py = 52.2; intruder.ang = -Math.PI / 2; intruder.target = null;   // flies into the owner's land
  home.target = null; home.ang = Math.PI / 2;
  run(h, 0.3);
  assert.ok(home.alive, 'the one standing on its own land survives');
});

test('closing a loop around someone else\'s trail cuts them and takes the land', () => {
  const g = place([{ x: 30, y: 50, ang: 0 }, { x: 120, y: 10, ang: 0 }]);
  const [a, b] = g.ents;
  b.out = true; b.trail = [42, 46, 42.4, 46.2, 42.8, 46.4, 43.2, 46.6]; b.trailLen = 1; b.x = 43.2; b.y = 46.6;   // an enemy trail inside the area `a` is about to enclose
  b.auto = false;
  const pin = () => { b.x = 43.2; b.y = 46.6; };
  const legs = [[0, 3.0], [-Math.PI / 2, 2.2], [Math.PI, 3.0], [Math.PI / 2, 2.4]];
  for (const [ang, secs] of legs) { a.target = ang; for (let t = 0; t < secs * TPS && b.alive; t++) { g.tick(); pin(); } }
  for (let t = 0; t < 40 && a.out && b.alive; t++) { g.tick(); pin(); }
  assert.equal(b.alive, false, 'trapped trail is cut');
  assert.equal(a.kills, 1);
  assert.equal(g.owner[at(43, 46)], 1);
  invariants(g);
});

test('deltas rebuild the exact world: land runs, new trail points, cleared trails; snapshots decode too', () => {
  const g = new Territory({ rng: seeded(4), entities: ents(4).map(e => ({ ...e, bot: true })) });
  g.delta();                                                // spawn changes
  const mirror = decodeOwners(g.snapshot().o);
  const trails = new Map();
  for (let t = 0; t < 600; t++) {
    g.tick();
    const d = g.delta();
    applyRuns(mirror, d.d);
    for (const i of d.clr) trails.set(i, []);
    for (const [i, pts] of Object.entries(d.tr)) trails.set(Number(i), (trails.get(Number(i)) || []).concat(pts));
  }
  assert.deepEqual([...mirror], [...g.owner], 'client map equals server map');
  for (const e of g.ents) assert.deepEqual(trails.get(e.i) || [], e.out ? e.trail.map(v => Math.round(v * Q)) : [], 'trail of ' + e.name);
  const snap = g.snapshot();
  assert.deepEqual([...decodeOwners(snap.o)], [...g.owner]);
  assert.equal(snap.e.length, 4);
  assert.equal(g.intro().ents.length, 4);
});

test('network traffic stays small (a few hundred bytes per tick) even with six players', () => {
  const g = new Territory({ rng: seeded(2), entities: ents(6).map(e => ({ ...e, bot: true })) });
  let total = 0, max = 0;
  for (let t = 0; t < 20 * TPS; t++) { g.tick(); const n = JSON.stringify(g.delta()).length; total += n; max = Math.max(max, n); }
  assert.ok(total / (20 * TPS) < 700, `average ${total / (20 * TPS)} bytes/tick`);
  assert.ok(max < 6000, `max ${max}`);
  assert.ok(JSON.stringify(g.snapshot()).length < 30000, 'a full snapshot for a late joiner is small too');
});

test('the round ends after the duration and ranks by land, then kills', () => {
  const g = place([{ x: 20, y: 20, ang: 0 }, { x: 100, y: 70, ang: 0 }], { game: { duration: 10 } });
  g.ents[1].kills = 2;
  const events = [];
  for (let i = 0; i < 20; i++) events.push(...g.tick());
  assert.equal(g.finished, true);
  assert.equal(events.filter(e => e.k === 'end').length, 1);
  const r = g.ranking();
  assert.equal(r.length, 2);
  assert.equal(r[0].i, 1, 'equal land, more kills wins');
  assert.equal(g.tick().length, 0);
});

test('bots play whole rounds: consistent, deterministic, and they really expand', () => {
  const play = seed => {
    const g = new Territory({ rng: seeded(seed), entities: ents(6, { bot: true, level: 'normal' }) });
    for (let t = 0; t < 150 * TPS && !g.finished; t++) { g.tick(); if (t % 200 === 0) invariants(g); }
    invariants(g);
    return g;
  };
  const g = play(11);
  assert.equal(g.finished, true);
  assert.ok(g.ents.some(e => e.kills > 0) && g.ents.some(e => e.deaths > 0), 'bots interact');
  assert.deepEqual(play(11).ranking(), g.ranking(), 'same seed, same game');
  assert.notDeepEqual(play(12).ranking(), g.ranking());
  const winners = [1, 2, 3, 4, 5, 6].map(seed => play(seed).ranking()[0].pct);
  const avg = winners.reduce((a, b) => a + b, 0) / winners.length;
  assert.ok(avg > 5, `the winner of a bot-only round averages real land (${avg.toFixed(1)}% over ${winners.join(', ')})`);
});

test('bot movement is smooth: headings change gradually, never snapping by more than the turn rate', () => {
  const g = new Territory({ rng: seeded(21), entities: ents(5, { bot: true }) });
  const last = g.ents.map(e => e.ang), wasAlive = g.ents.map(() => true);
  let worst = 0;
  for (let t = 0; t < 40 * TPS; t++) {
    g.tick();
    g.ents.forEach((e, i) => { if (e.alive && wasAlive[i]) { worst = Math.max(worst, Math.abs(((e.ang - last[i] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)); } last[i] = e.ang; wasAlive[i] = e.alive; });   // a respawn picks a new heading: skip it
  }
  assert.ok(worst <= TURN_RATE / TPS + 1e-6 || worst < 0.4, `largest heading change in one tick: ${worst}`);
});

test('a lone bot loops and grows and almost never kills itself, including near walls', () => {
  let deaths = 0, land = 0;
  for (const seed of [3, 4, 6, 7, 8, 9]) {
    const g = new Territory({ rng: seeded(seed), entities: [{ id: 'b', name: 'B', avatar: '✏️', color: 0, bot: true, level: 'normal' }] });
    for (let t = 0; t < 60 * TPS; t++) g.tick();
    deaths += g.ents[0].deaths; land += g.ranking()[0].units;
    assert.equal(g.ents[0].kills, 0);
  }
  assert.ok(deaths <= 1, `${deaths} self-inflicted deaths in 6 minute-long runs`);
  assert.ok(land / 6 > 400, `average land after a minute: ${Math.round(land / 6)} units`);
});

test('bot levels: hard bots end with more land than easy bots in the same games (mixed table)', () => {
  assert.deepEqual(Object.keys(LEVELS), ['easy', 'normal', 'hard']);
  let easy = 0, hard = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const es = ents(6, { bot: true }).map((e, i) => ({ ...e, level: i < 3 ? 'easy' : 'hard' }));
    const g = new Territory({ rng: seeded(seed), entities: es });
    for (let t = 0; t < 150 * TPS; t++) g.tick();
    g.ents.forEach((e, i) => { if (i < 3) easy += g.cellsOf(e); else hard += g.cellsOf(e); });
  }
  assert.ok(hard > easy, `hard land ${hard} vs easy ${easy}`);
});

test('unknown bot levels fall back to normal; autopilot takes over for a human and hands control back', () => {
  const g = new Territory({ rng: seeded(1), entities: [{ id: 'a', name: 'A', avatar: 'x', color: 0, bot: true, level: 'godlike' }, { id: 'h', name: 'H', avatar: 'x', color: 1, bot: false }] });
  assert.equal(g.ents[0].level, 'normal');
  g.setAuto('h', true);
  const x = g.ents[1].x, y = g.ents[1].y;
  run(g, 5);
  assert.ok(Math.hypot(g.ents[1].x - x, g.ents[1].y - y) > 3, 'autopilot moves the player');
  invariants(g);
  g.setAuto('h', false);
  g.setSteer('h', 1.0);
  assert.equal(g.ents[1].target, 1.0);
});

test('wire format: positions/angles are small integers', () => {
  const g = place([{ x: 50.25, y: 40.5, ang: 1 }]);
  const row = g.snapshot().e[0];
  assert.deepEqual(row.slice(0, 5), [0, Math.round(50.25 * Q), Math.round(40.5 * Q), Math.round(1 * QA), 1]);
  assert.ok(row.every(Number.isInteger));
});

test('land is stored on a fine grid (2x2 cells per world unit) and results report world units', () => {
  assert.equal(CPU, 2);
  const g = new Territory({ rng: seeded(1), entities: ents(2) });
  assert.equal(g.owner.length, GW * GH);
  assert.equal(GW, W * CPU);
  const r = g.ranking()[0];
  assert.equal(r.units, Math.round(r.cells / (CPU * CPU)));
  assert.ok(r.units > 15 && r.units < 30, 'a spawn patch is about pi * 2.8^2 = 25 units');
  const intro = g.intro();
  assert.deepEqual([intro.gw, intro.gh, intro.cpu], [GW, GH, CPU]);
});
