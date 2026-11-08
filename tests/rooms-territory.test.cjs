const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager, GAME_DEFS } = require('../server/rooms.cjs');
const { TICKS_PER_SECOND, GW, GH, decodeOwners } = require('../server/territory.cjs');

function fakeScheduler() {
  const jobs = new Set();
  return { after(ms, fn) { const j = { ms, fn }; jobs.add(j); return () => jobs.delete(j); }, step() { const j = [...jobs][0]; if (j) { jobs.delete(j); j.fn(); return true; } return false; }, pending: () => jobs.size,
    runAll(ms) { for (const j of [...jobs]) if (j.ms <= ms && jobs.has(j)) { jobs.delete(j); j.fn(); } } };
}
function seeded(seed = 1) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function setup(humans = 1) {
  const scheduler = fakeScheduler();
  const mgr = new RoomManager({ rng: seeded(9), scheduler });
  const mk = () => { const inbox = []; const client = mgr.connect(m => inbox.push(m)); return { client, inbox, send: m => mgr.handle(client, m), last: t => [...inbox].reverse().find(m => m.t === t), all: t => inbox.filter(m => m.t === t) }; };
  const host = mk();
  host.send({ t: 'create', name: 'Ada', game: 'territory' });
  const code = host.last('welcome').code;
  const others = [];
  for (const n of ['Linus', 'Grace', 'Alan', 'Guido', 'Dennis'].slice(0, humans - 1)) { const p = mk(); p.send({ t: 'join', code, name: n }); others.push(p); }
  return { mgr, scheduler, host, others, code, mk };
}
const startGame = env => { env.others.forEach(p => p.send({ t: 'ready', value: true })); env.host.send({ t: 'start' }); for (let i = 0; i < 3; i++) env.scheduler.runAll(1000); };
const ticks = (env, n) => { for (let i = 0; i < n; i++) env.scheduler.runAll(125); };

test('a territory room can start with a single human: bots fill the other slots', () => {
  const env = setup(1);
  assert.equal(env.host.last('room').game, 'territory');
  assert.equal(env.host.last('room').min, 1);
  startGame(env);
  const intro = env.host.last('gstart');
  assert.equal(intro.gw, GW); assert.equal(intro.gh, GH);
  assert.equal(intro.ents.length, GAME_DEFS.territory.entities);
  assert.equal(intro.ents.filter(e => e.bot).length, 5);
  assert.equal(intro.ents[intro.you].name, 'Ada');
  assert.equal(new Set(intro.ents.map(e => e.color)).size, 6, 'colours are unique');
  assert.ok(env.host.last('g'), 'first snapshot is sent with the intro');
  assert.equal(env.host.last('room').state, 'playing');
});

test('humans share the board with fewer bots and each gets their own entity', () => {
  const env = setup(3);
  startGame(env);
  const intros = [env.host, ...env.others].map(c => c.last('gstart'));
  assert.deepEqual(intros.map(i => i.you), [0, 1, 2]);
  assert.equal(intros[0].ents.filter(e => e.bot).length, 3);
});

test('the server ticks the game: a full snapshot first, then small deltas; steering messages move the player', () => {
  const env = setup(1);
  startGame(env);
  const first = env.host.all('g')[0];
  assert.equal(first.full, 1);
  assert.equal(decodeOwners(first.o).length, GW * GH);
  const before = env.host.all('g').length;
  ticks(env, 5);
  const gs = env.host.all('g');
  assert.equal(gs.length, before + 5);
  const deltas = gs.slice(-5);
  assert.deepEqual(deltas.map(g => g.n), [1, 2, 3, 4, 5].map(n => n + gs[gs.length - 6].n));
  assert.ok(deltas.every(g => !g.full && Array.isArray(g.d) && g.e.length === 6));
  assert.ok(JSON.stringify(deltas.at(-1)).length < 2500, 'deltas are small');
  const me = env.host.last('gstart').you;
  const row = () => env.host.last('g').e.find(r => r[0] === me);
  env.host.send({ t: 'steer', a: 1.2 });
  ticks(env, 30);
  assert.ok(Math.abs(row()[3] / 100 - 1.2) < 0.05, `heading ${row()[3] / 100} turned smoothly towards the requested angle`);
  const x0 = row()[1];
  env.host.send({ t: 'turn', v: 1 });
  ticks(env, 10);
  assert.notEqual(row()[3], Math.round(1.2 * 100), 'keyboard turning changes the heading');
  env.host.send({ t: 'turn', v: 0 });
  for (const junk of [{ t: 'steer', a: 'x' }, { t: 'steer', a: null }, { t: 'steer' }, { t: 'turn', v: 5 }, { t: 'turn', v: 'left' }, { t: 'dir', d: 1 }]) env.host.send(junk);
  assert.doesNotThrow(() => ticks(env, 3));
});

test('the round ends with results, then the host can start over', () => {
  const env = setup(1);
  startGame(env);
  let guard = 0;
  while (!env.host.last('gend') && guard++ < 9000) env.scheduler.step();
  const end = env.host.last('gend');
  assert.ok(end, 'game ended');
  assert.equal(end.results.length, 6);
  assert.ok(end.results[0].cells >= end.results[5].cells);
  assert.equal(env.scheduler.pending(), 0, 'no timers left running after the end');
  env.host.send({ t: 'again' });
  assert.equal(env.host.last('room').state, 'lobby');
});

test('a disconnected human is played by the autopilot and gets the game back on rejoin', () => {
  const env = setup(2);
  startGame(env);
  const guest = env.others[0];
  const { token } = guest.last('welcome');
  env.mgr.disconnect(guest.client);
  ticks(env, 30);
  assert.ok(env.host.last('g'));
  const back = env.mk();
  back.send({ t: 'rejoin', code: env.code, token });
  assert.ok(back.last('gstart'));
  assert.equal(back.last('gstart').you, 1);
  assert.ok(back.last('g'));
  back.send({ t: 'steer', a: 2 });
  assert.doesNotThrow(() => ticks(env, 2));
});

test('leaving mid-game never crashes the loop; an empty room stops its timers', () => {
  const env = setup(2);
  startGame(env);
  env.others[0].send({ t: 'leave' });
  assert.doesNotThrow(() => ticks(env, 10));
  env.host.send({ t: 'leave' });
  assert.equal(env.mgr.rooms.size, 0);
  assert.equal(env.scheduler.pending(), 0);
});

test('capacity is 6 humans for territory and 12 for the imposter; unknown games are refused', () => {
  const env = setup(1);
  for (let i = 0; i < 5; i++) { const p = env.mk(); p.send({ t: 'join', code: env.code, name: 'P' + i }); assert.ok(p.last('welcome'), 'player ' + i); }
  const extra = env.mk();
  extra.send({ t: 'join', code: env.code, name: 'Extra' });
  assert.equal(extra.last('error').code, 'full');
  const bad = env.mk();
  bad.send({ t: 'create', name: 'Zed', game: 'chess' });
  assert.equal(bad.last('error').code, 'bad_game');
  const imp = env.mk();
  imp.send({ t: 'create', name: 'Ivy' });
  assert.equal(imp.last('room').game, 'imposter');
  assert.equal(imp.last('room').min, 3);
});

test('players can keep reacting in a territory lobby and the countdown still cancels if someone leaves', () => {
  const env = setup(2);
  env.others[0].send({ t: 'ready', value: true });
  env.host.send({ t: 'start' });
  env.others[0].send({ t: 'leave' });
  assert.equal(env.host.last('room').state, 'lobby');
  assert.equal(env.host.all('gstart').length, 0);
});

test('the host can choose the number of bots and their level; everyone sees it; others cannot change it', () => {
  const env = setup(2);
  assert.deepEqual(env.host.last('room').settings, { bots: 'auto', level: 'normal' });
  env.others[0].send({ t: 'settings', bots: 1 });
  assert.equal(env.others[0].last('error').code, 'not_host');
  env.host.send({ t: 'settings', bots: 1, level: 'hard' });
  assert.deepEqual(env.others[0].last('room').settings, { bots: 1, level: 'hard' });
  env.host.send({ t: 'settings', bots: 99, level: 'godlike' });                // junk keeps the last good values
  assert.deepEqual(env.host.last('room').settings, { bots: 1, level: 'hard' });
  env.host.send({ t: 'settings', bots: 'auto' });
  assert.equal(env.host.last('room').settings.bots, 'auto');
  startGame(env);
  env.host.send({ t: 'settings', bots: 3 });
  assert.equal(env.host.last('room').settings.bots, 'auto', 'settings are locked once the game has started');
});

test('bot counts: auto fills to 6, an explicit number is honoured, and a lone human always gets at least one bot', () => {
  const run = (humans, settings) => { const env = setup(humans); env.host.send({ t: 'settings', ...settings }); startGame(env); return env.host.last('gstart'); };
  assert.equal(run(1, { bots: 'auto' }).ents.length, 6);
  assert.equal(run(3, { bots: 'auto' }).ents.length, 6);
  const two = run(1, { bots: 2 });
  assert.equal(two.ents.length, 3);
  assert.equal(two.ents.filter(e => e.bot).length, 2);
  assert.equal(run(1, { bots: 0 }).ents.length, 2, 'never a lone player on an empty board');
  assert.equal(run(2, { bots: 0 }).ents.filter(e => e.bot).length, 0, 'friends only is fine with two humans');
  assert.equal(run(1, { bots: 8 }).ents.length, 9);
});

test('a room can be created with the bot options already chosen (quick play)', () => {
  const { mgr, mk } = setup(1);
  const q = mk();
  q.send({ t: 'create', name: 'Solo', game: 'territory', bots: 4, level: 'easy' });
  assert.deepEqual(q.last('room').settings, { bots: 4, level: 'easy' });
  const imp = mk();
  imp.send({ t: 'create', name: 'Ivy' });
  assert.equal(imp.last('room').settings, null, 'the imposter has no bot settings');
  imp.send({ t: 'settings', bots: 3 });
  assert.equal(imp.last('room').settings, null);
});
