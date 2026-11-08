const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager, LIMITS, AVATARS, WORDS } = require('../server/rooms.cjs');

function fakeScheduler() {
  const jobs = new Set();
  return {
    after(ms, fn) { const job = { ms, fn }; jobs.add(job); return () => jobs.delete(job); },
    run(ms) { for (const j of [...jobs]) if (j.ms <= ms && jobs.has(j)) { jobs.delete(j); j.fn(); } },
    pending: () => jobs.size,
  };
}
function seeded(seed = 1) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function setup() {
  const scheduler = fakeScheduler();
  let clock = 1000;
  const mgr = new RoomManager({ rng: seeded(3), scheduler, now: () => (clock += 1000) });
  const make = name => {
    const inbox = [];
    const client = mgr.connect(m => inbox.push(m));
    return { client, inbox, name, send: m => mgr.handle(client, m), last: t => [...inbox].reverse().find(m => m.t === t), all: t => inbox.filter(m => m.t === t) };
  };
  return { mgr, scheduler, make };
}
function lobby(n = 4) {
  const env = setup();
  const host = env.make('Ada');
  host.send({ t: 'create', name: 'Ada' });
  const code = host.last('welcome').code;
  const others = [];
  for (const name of ['Linus', 'Grace', 'Alan', 'Guido', 'Dennis'].slice(0, n - 1)) {
    const p = env.make(name); p.send({ t: 'join', code, name }); others.push(p);
  }
  return { ...env, host, others, code };
}
const countdown = env => { env.scheduler.run(1000); env.scheduler.run(1000); env.scheduler.run(1000); };

test('creating a room gives a 4-letter code without confusing letters, a token and host status', () => {
  const { mgr, make } = setup();
  const a = make('Ada');
  a.send({ t: 'create', name: 'Ada' });
  const w = a.last('welcome');
  assert.match(w.code, /^[A-HJ-NP-Z]{4}$/);
  assert.ok(w.token.length >= 20);
  const room = a.last('room');
  assert.equal(room.hostId, w.id);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].host, true);
  assert.equal(room.state, 'lobby');
  assert.ok(AVATARS.includes(room.players[0].avatar));
  assert.equal(JSON.stringify(room).includes(w.token), false, 'tokens never leave the owner');
  assert.equal(mgr.rooms.size, 1);
});

test('names are required, no default names, valid characters, and unique per room', () => {
  const { make } = setup();
  const a = make('x');
  for (const name of ['', '   ', 'ANON', 'Guest', 'player', 'a'.repeat(13), '<b>', undefined, null, 42]) {
    a.send({ t: 'create', name });
    assert.equal(a.last('error')?.code, 'bad_name', String(name));
    a.inbox.length = 0;
  }
  a.send({ t: 'create', name: 'Ada' });
  const code = a.last('welcome').code;
  const b = make('b');
  b.send({ t: 'join', code, name: 'ada' });
  assert.equal(b.last('error').code, 'name_taken');
  b.send({ t: 'join', code, name: 'Linus' });
  assert.ok(b.last('welcome'));
});

test('joining: wrong code, lower-case/dirty code accepted, full room, started room', () => {
  const env = lobby(3);
  const x = env.make('x');
  x.send({ t: 'join', code: 'ZZZZ', name: 'Newbie' });
  assert.equal(x.last('error').code, 'no_room');
  x.send({ t: 'join', code: ` ${env.code.toLowerCase()}-`, name: 'Newbie' });
  assert.ok(x.last('welcome'));
  for (let i = 0; i < 20; i++) { const p = env.make('p' + i); p.send({ t: 'join', code: env.code, name: 'P' + i }); }
  const late = env.make('late');
  late.send({ t: 'join', code: env.code, name: 'Late' });
  assert.equal(late.last('error').code, 'full');
  assert.equal(env.host.last('room').players.length, LIMITS.MAX_PLAYERS);
});

test('everyone sees joins, ready toggles and avatars are unique', () => {
  const env = lobby(4);
  const room = env.host.last('room');
  assert.equal(room.players.length, 4);
  assert.equal(new Set(room.players.map(p => p.avatar)).size, 4);
  assert.equal(new Set(room.players.map(p => p.color)).size, 4);
  env.others[0].send({ t: 'ready', value: true });
  assert.equal(env.host.last('room').players.find(p => p.name === 'Linus').ready, true);
  assert.equal(env.host.last('event').kind, 'ready');
  env.host.send({ t: 'ready', value: false });                            // the host is always ready
  assert.equal(env.host.last('room').players[0].ready, true);
  const taken = env.others[1].last('room').players[0].avatar;
  env.others[1].send({ t: 'avatar', avatar: taken });                      // cannot steal an avatar
  assert.notEqual(env.others[1].last('room').players.find(p => p.name === 'Grace').avatar, undefined);
  assert.equal(env.host.last('room').players.filter(p => p.avatar === taken).length, 1);
});

test('reactions are limited to the allowed set and rate limited', () => {
  const env = lobby(3);
  const [b] = env.others;
  b.send({ t: 'react', emoji: '💣' });
  assert.equal(env.host.all('react').length, 0);
  b.send({ t: 'react', emoji: '🎉' });
  assert.equal(env.host.all('react').length, 1);
  assert.equal(env.host.all('react')[0].emoji, '🎉');
});

test('only the host can start; needs 3 players and everyone ready', () => {
  const env = lobby(3);
  env.others[0].send({ t: 'start' });
  assert.equal(env.others[0].last('error').code, 'not_host');
  env.host.send({ t: 'start' });
  assert.equal(env.host.last('error').code, 'not_ready');
  assert.match(env.host.last('error').message, /Linus/);
  const small = lobby(2);
  small.host.send({ t: 'start' });
  assert.equal(small.host.last('error').code, 'few_players');
});

test('start: 3-2-1 countdown, then secret roles: one imposter without the word, crew with it', () => {
  const env = lobby(4);
  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  env.host.send({ t: 'start' });
  assert.equal(env.host.last('room').state, 'starting');
  assert.deepEqual(env.host.all('countdown').map(m => m.n), [3]);
  countdown(env);
  assert.deepEqual(env.host.all('countdown').map(m => m.n), [3, 2, 1]);
  const everyone = [env.host, ...env.others];
  const roles = everyone.map(p => p.last('role'));
  assert.ok(roles.every(Boolean));
  assert.equal(roles.filter(r => r.role === 'imposter').length, 1);
  const imposter = roles.find(r => r.role === 'imposter');
  assert.equal(imposter.word, null);
  const crew = roles.filter(r => r.role === 'crew');
  assert.equal(crew.length, 3);
  assert.ok(crew.every(r => r.word === crew[0].word && WORDS.includes(r.word)));
  assert.equal(env.host.last('room').state, 'playing');
  for (const p of everyone) assert.equal(JSON.stringify(p.all('room')).includes(crew[0].word), false, 'public room data never contains the word');
  assert.ok(everyone.every(p => p.last('started')));
});

test('countdown is cancelled when someone leaves or disconnects, or the host cancels', () => {
  let env = lobby(4);
  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  env.host.send({ t: 'start' });
  env.others[0].send({ t: 'leave' });
  assert.equal(env.host.last('room').state, 'lobby');
  assert.ok(env.host.last('cancelled'));
  assert.equal(env.scheduler.pending(), 0);

  env = lobby(4);
  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  env.host.send({ t: 'start' });
  env.mgr.disconnect(env.others[1].client);
  assert.equal(env.host.last('room').state, 'lobby');

  env = lobby(4);
  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  env.host.send({ t: 'start' });
  env.host.send({ t: 'cancel' });
  assert.equal(env.host.last('room').state, 'lobby');
  countdown(env);
  assert.equal(env.host.all('role').length, 0, 'no roles after a cancelled start');
});

test('disconnected players keep their seat and can rejoin with their token (even mid-game, getting their role back)', () => {
  const env = lobby(4);
  const b = env.others[0];
  const { token, id } = b.last('welcome');
  env.mgr.disconnect(b.client);
  const view = env.host.last('room');
  assert.equal(view.players.find(p => p.id === id).connected, false);
  const b2 = env.make('Linus');
  b2.send({ t: 'rejoin', code: env.code, token });
  assert.equal(b2.last('welcome').rejoined, true);
  assert.equal(env.host.last('room').players.find(p => p.id === id).connected, true);

  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  b2.send({ t: 'ready', value: true });
  env.host.send({ t: 'start' });
  countdown(env);
  const before = b2.last('role');
  env.mgr.disconnect(b2.client);
  const b3 = env.make('Linus');
  b3.send({ t: 'rejoin', code: env.code, token });
  assert.deepEqual(b3.last('role'), before);
  const stranger = env.make('x');
  stranger.send({ t: 'rejoin', code: env.code, token: 'wrong' });
  assert.equal(stranger.last('error').code, 'no_room');
});

test('players who never come back are removed after the grace period; empty rooms disappear', () => {
  const env = lobby(3);
  env.mgr.disconnect(env.others[0].client);
  assert.equal(env.host.last('room').players.length, 3);
  env.scheduler.run(LIMITS.LOBBY_GRACE_MS);
  assert.equal(env.host.last('room').players.length, 2);
  env.mgr.disconnect(env.host.client);
  env.mgr.disconnect(env.others[1].client);
  env.scheduler.run(LIMITS.GAME_GRACE_MS);
  assert.equal(env.mgr.rooms.size, 0);
});

test('host leaving passes the crown to the longest-waiting connected player', () => {
  const env = lobby(4);
  env.host.send({ t: 'leave' });
  const view = env.others[0].last('room');
  assert.equal(view.hostId, view.players.find(p => p.name === 'Linus').id);
  assert.ok(env.others[0].all('event').some(e => e.kind === 'host'));
  assert.equal(view.players.find(p => p.name === 'Linus').ready, true);
});

test('host can kick; others cannot; kicked player is told', () => {
  const env = lobby(4);
  const victim = env.others[0];
  const vid = victim.last('welcome').id;
  env.others[1].send({ t: 'kick', id: vid });
  assert.equal(env.host.last('room').players.length, 4);
  env.host.send({ t: 'kick', id: vid });
  assert.ok(victim.last('kicked'));
  assert.equal(env.host.last('room').players.length, 3);
  victim.send({ t: 'ready', value: true });
  assert.equal(victim.last('error').code, 'no_room');
});

test('play again returns everyone to the lobby with ready reset', () => {
  const env = lobby(3);
  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  env.host.send({ t: 'start' });
  countdown(env);
  env.others[0].send({ t: 'again' });
  assert.equal(env.host.last('room').state, 'playing');                    // only the host can
  env.host.send({ t: 'again' });
  const view = env.host.last('room');
  assert.equal(view.state, 'lobby');
  assert.deepEqual(view.players.map(p => p.ready), [true, false, false]);
  assert.ok(env.others[1].last('lobby'));
});

test('games already started cannot be joined; bad messages never crash', () => {
  const env = lobby(3);
  env.others.forEach(p => p.send({ t: 'ready', value: true }));
  env.host.send({ t: 'start' });
  const late = env.make('late');
  late.send({ t: 'join', code: env.code, name: 'Late' });
  assert.equal(late.last('error').code, 'started');
  for (const junk of [null, 5, 'x', {}, { t: 5 }, { t: 'nope' }, { t: 'join' }, { t: 'rejoin' }, { t: 'kick', id: {} }, { t: 'react', emoji: {} }]) {
    assert.doesNotThrow(() => late.send(junk), JSON.stringify(junk));
  }
});

test('room limit protects the server', () => {
  const { mgr, make } = setup();
  for (let i = 0; i < LIMITS.MAX_ROOMS; i++) make('c' + i).send({ t: 'create', name: 'N' + i });
  const extra = make('extra');
  extra.send({ t: 'create', name: 'Extra' });
  assert.equal(extra.last('error').code, 'busy');
  assert.equal(mgr.rooms.size, LIMITS.MAX_ROOMS);
});
