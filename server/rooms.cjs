'use strict';
/* Room system for multiplayer games (first user: "The Imposter"). Pure logic: no sockets, no timers of its own.
 *   const mgr = new RoomManager({ rng, scheduler });
 *   const client = mgr.connect(obj => socket.send(JSON.stringify(obj)));
 *   mgr.handle(client, message);   mgr.disconnect(client);
 * Rooms have a 4-letter code, a host, a lobby (names, avatars, ready toggles, reactions), a 3-2-1 countdown and a
 * start that deals secret roles. Players who lose their connection keep their seat for a grace period and can rejoin.
 */
const crypto = require('node:crypto');
const { Territory, LEVELS, TICKS_PER_SECOND } = require('./territory.cjs');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';          // no I or O (look like 1 and 0)
const NAME_RE = /^[A-Za-z0-9 _.\-]{1,12}$/;
const RESERVED_NAMES = new Set(['anon', 'anonymous', 'guest', 'player', 'unknown']);
const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐧', '🦖', '🐝', '🦋', '🐳', '🐢', '🦀', '🐰', '🦁'];
const REACTIONS = ['👍', '😂', '🔥', '👀', '😱', '🎉', '❤️', '🤔'];
const WORDS = ['variable', 'loop', 'function', 'list', 'string', 'dictionary', 'class', 'import', 'integer', 'boolean', 'tuple', 'module',
  'bug', 'compiler', 'recursion', 'array', 'syntax', 'comment', 'lambda', 'exception', 'algorithm', 'operator', 'parameter', 'iterator'];
// Which games a room can host, and how many humans they take.
const GAME_DEFS = { imposter: { min: 3, max: 12 }, territory: { min: 1, max: 6, entities: 6, maxEntities: 10, seconds: 150 } };
const BOT_NAMES = ['Pencil', 'Eraser', 'Ruler', 'Compass', 'Marker', 'Sharpener'];
const BOT_AVATARS = ['✏️', '🧽', '📏', '🧭', '🖍️', '📎'];
const LIMITS = { MIN_PLAYERS: 3, MAX_PLAYERS: 12, MAX_ROOMS: 300, COUNTDOWN: 3, REACT_COOLDOWN_MS: 400, LOBBY_GRACE_MS: 30000, GAME_GRACE_MS: 120000 };

const defaultScheduler = { after: (ms, fn) => { const t = setTimeout(fn, ms); t.unref?.(); return () => clearTimeout(t); } };

/** Territory options: bots = 'auto' (fill to 6) or 0-8, level = easy | normal | hard. Anything else falls back to the default. */
function cleanSettings(raw, base = { bots: 'auto', level: 'normal' }) {
  const out = { ...base };
  if (raw && typeof raw === 'object') {
    if (raw.bots === 'auto' || (Number.isInteger(raw.bots) && raw.bots >= 0 && raw.bots <= 8)) out.bots = raw.bots;
    if (typeof raw.level === 'string' && LEVELS[raw.level]) out.level = raw.level;
  }
  return out;
}

function cleanName(v) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' '); }
function nameProblem(v) {
  if (typeof v !== 'string') return 'Type your name to play.';     // numbers/objects are never names
  v = cleanName(v);
  if (!v) return 'Type your name to play.';
  if (!NAME_RE.test(v)) return 'Use 1-12 letters, digits, space, _ . -';
  if (RESERVED_NAMES.has(v.toLowerCase())) return 'Please choose your own name.';
  return '';
}

class RoomManager {
  constructor({ rng = Math.random, scheduler = defaultScheduler, now = Date.now } = {}) {
    this.rng = rng;
    this.scheduler = scheduler;
    this.now = now;
    this.rooms = new Map();
    this.clients = new Set();
    this.nextId = 1;
  }

  // ------------------------------------------------------------------ connections
  connect(send) {
    const client = { cid: this.nextId++, send, room: null, player: null, closed: false };
    this.clients.add(client);
    return client;
  }

  disconnect(client) {
    if (client.closed) return;
    client.closed = true;
    this.clients.delete(client);
    const { room, player } = client;
    if (!room || !player || player.client !== client) return;
    player.client = null;
    player.connected = false;
    if (room.engine) room.engine.setAuto(player.id, true);
    this._broadcast(room, { t: 'event', kind: 'offline', id: player.id, name: player.name });
    this._sync(room);
    const grace = room.state === 'lobby' ? LIMITS.LOBBY_GRACE_MS : LIMITS.GAME_GRACE_MS;
    player.cancelGrace = this.scheduler.after(grace, () => this._remove(room, player, 'timeout'));
    if (room.state === 'starting') this._cancelCountdown(room, 'A player disconnected.');
  }

  // ------------------------------------------------------------------ message handling
  handle(client, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return this._error(client, 'bad_message', 'Unknown message.');
    switch (msg.t) {
      case 'create': return this._create(client, msg);
      case 'join': return this._join(client, msg);
      case 'rejoin': return this._rejoin(client, msg);
      case 'ping': return client.send({ t: 'pong' });
      default: break;
    }
    const room = client.room, player = client.player;
    if (!room || !player) return this._error(client, 'no_room', 'Join a room first.');
    switch (msg.t) {
      case 'ready': return this._ready(room, player, !!msg.value);
      case 'react': return this._react(room, player, msg.emoji);
      case 'avatar': return this._avatar(room, player, msg.avatar);
      case 'start': return this._start(room, player);
      case 'cancel': return this._cancelByHost(room, player);
      case 'again': return this._again(room, player);
      case 'settings': return this._settings(room, player, msg);
      case 'steer': if (room.engine && typeof msg.a === 'number' && Number.isFinite(msg.a)) room.engine.setSteer(player.id, msg.a); return;     // head towards an angle (mouse / touch)
      case 'turn': if (room.engine && (msg.v === -1 || msg.v === 0 || msg.v === 1)) room.engine.setTurn(player.id, msg.v); return;                // keyboard: turn left / right
      case 'kick': return this._kick(room, player, msg.id);
      case 'leave': return this._remove(room, player, 'left');
      default: return this._error(client, 'bad_message', 'Unknown message.');
    }
  }

  _error(client, code, message) { client.send({ t: 'error', code, message }); return false; }

  // ------------------------------------------------------------------ create / join
  _code() {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }

  _makePlayer(room, client, name, avatar) {
    const takenAvatars = new Set([...room.players.values()].map(p => p.avatar));
    let av = AVATARS.includes(avatar) && !takenAvatars.has(avatar) ? avatar : null;
    if (!av) { const free = AVATARS.filter(a => !takenAvatars.has(a)); av = free[Math.floor(this.rng() * free.length)] || AVATARS[0]; }
    const usedColors = new Set([...room.players.values()].map(p => p.color));
    let color = 0; while (usedColors.has(color)) color++;
    const player = { id: 'p' + (room.nextPlayer++), token: crypto.randomBytes(12).toString('hex'), name, avatar: av, color,
      ready: false, connected: true, client, joinedAt: this.now(), lastReact: 0, cancelGrace: null };
    room.players.set(player.id, player);
    client.room = room; client.player = player;
    return player;
  }

  _leaveCurrent(client) { if (client.room && client.player) this._remove(client.room, client.player, 'left'); }

  _create(client, msg) {
    const problem = nameProblem(msg.name);
    if (problem) return this._error(client, 'bad_name', problem);
    if (this.rooms.size >= LIMITS.MAX_ROOMS) return this._error(client, 'busy', 'The server is full right now. Try again in a minute.');
    this._leaveCurrent(client);
    const code = this._code();
    if (!code) return this._error(client, 'busy', 'Could not make a room code. Try again.');
    const game = msg.game === undefined ? 'imposter' : msg.game;
    if (!GAME_DEFS[game]) return this._error(client, 'bad_game', 'Unknown game.');
    const room = { code, game, hostId: null, players: new Map(), state: 'lobby', nextPlayer: 1, round: 0, secret: null, engine: null, tickCancel: null, settings: game === 'territory' ? cleanSettings(msg) : null, createdAt: this.now(), countdown: 0, cancelCountdown: null };
    this.rooms.set(code, room);
    const player = this._makePlayer(room, client, cleanName(msg.name), msg.avatar);
    room.hostId = player.id;
    player.ready = true;
    client.send({ t: 'welcome', id: player.id, token: player.token, code });
    this._broadcast(room, { t: 'event', kind: 'created', id: player.id, name: player.name });
    this._sync(room);
    return true;
  }

  _join(client, msg) {
    const problem = nameProblem(msg.name);
    if (problem) return this._error(client, 'bad_name', problem);
    const code = String(msg.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const room = this.rooms.get(code);
    if (!room) return this._error(client, 'no_room', `No room "${code || '----'}". Check the code.`);
    if (room.state !== 'lobby') return this._error(client, 'started', 'That game already started.');
    if (room.players.size >= GAME_DEFS[room.game].max) return this._error(client, 'full', 'That room is full.');
    const name = cleanName(msg.name);
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return this._error(client, 'name_taken', 'Someone in this room already has that name.');
    this._leaveCurrent(client);
    const player = this._makePlayer(room, client, name, msg.avatar);
    client.send({ t: 'welcome', id: player.id, token: player.token, code });
    this._broadcast(room, { t: 'event', kind: 'join', id: player.id, name: player.name });
    this._sync(room);
    return true;
  }

  _rejoin(client, msg) {
    const room = this.rooms.get(String(msg.code || '').toUpperCase());
    const player = room && [...room.players.values()].find(p => p.token === msg.token);
    if (!room || !player) return this._error(client, 'no_room', 'That room is gone.');
    if (player.client && player.client !== client) { player.client.room = null; player.client.player = null; player.client.send({ t: 'error', code: 'replaced', message: 'You joined from another tab.' }); }
    player.cancelGrace?.(); player.cancelGrace = null;
    player.client = client; player.connected = true;
    client.room = room; client.player = player;
    client.send({ t: 'welcome', id: player.id, token: player.token, code: room.code, rejoined: true });
    if (room.state === 'playing' && room.secret) client.send(this._roleMessage(room, player));
    if (room.state === 'playing' && room.engine) { room.engine.setAuto(player.id, false); this._sendIntro(room, player); }
    this._broadcast(room, { t: 'event', kind: 'back', id: player.id, name: player.name });
    this._sync(room);
    return true;
  }

  // ------------------------------------------------------------------ lobby actions
  _ready(room, player, value) {
    if (room.state !== 'lobby' || player.id === room.hostId) return;
    player.ready = value;
    this._broadcast(room, { t: 'event', kind: value ? 'ready' : 'unready', id: player.id, name: player.name });
    this._sync(room);
  }

  _react(room, player, emoji) {
    if (!REACTIONS.includes(emoji)) return;
    const t = this.now();
    if (t - player.lastReact < LIMITS.REACT_COOLDOWN_MS) return;
    player.lastReact = t;
    this._broadcast(room, { t: 'react', id: player.id, emoji });
  }

  _avatar(room, player, avatar) {
    if (room.state !== 'lobby' || !AVATARS.includes(avatar)) return;
    if ([...room.players.values()].some(p => p !== player && p.avatar === avatar)) return;
    player.avatar = avatar;
    this._sync(room);
  }

  _settings(room, player, msg) {
    if (room.game !== 'territory' || room.state !== 'lobby') return;
    if (player.id !== room.hostId) return this._error(player.client, 'not_host', 'Only the host can change the settings.');
    room.settings = cleanSettings(msg, room.settings);
    this._broadcast(room, { t: 'event', kind: 'settings', id: player.id, name: player.name });
    this._sync(room);
  }

  _kick(room, player, id) {
    if (player.id !== room.hostId || room.state !== 'lobby') return;
    const target = room.players.get(id);
    if (!target || target === player) return;
    target.client?.send({ t: 'kicked' });
    this._remove(room, target, 'kicked');
  }

  // ------------------------------------------------------------------ start / countdown / roles
  _start(room, player) {
    if (player.id !== room.hostId) return this._error(player.client, 'not_host', 'Only the host can start.');
    if (room.state !== 'lobby') return;
    const here = [...room.players.values()].filter(p => p.connected);
    const need = GAME_DEFS[room.game].min;
    if (here.length < need) return this._error(player.client, 'few_players', `You need at least ${need} players.`);
    const waiting = here.filter(p => !p.ready);
    if (waiting.length) return this._error(player.client, 'not_ready', `Waiting for ${waiting.map(p => p.name).join(', ')}.`);
    room.state = 'starting';
    room.countdown = LIMITS.COUNTDOWN;
    this._broadcast(room, { t: 'countdown', n: room.countdown });
    this._sync(room);
    const tick = () => {
      room.countdown--;
      if (room.countdown > 0) { this._broadcast(room, { t: 'countdown', n: room.countdown }); room.cancelCountdown = this.scheduler.after(1000, tick); }
      else { room.cancelCountdown = null; this._begin(room); }
    };
    room.cancelCountdown = this.scheduler.after(1000, tick);
  }

  _cancelCountdown(room, reason) {
    room.cancelCountdown?.(); room.cancelCountdown = null;
    if (room.state !== 'starting') return;
    room.state = 'lobby'; room.countdown = 0;
    this._broadcast(room, { t: 'cancelled', reason });
    this._sync(room);
  }

  _cancelByHost(room, player) { if (player.id === room.hostId) this._cancelCountdown(room, 'The host cancelled the start.'); }

  _begin(room) {
    const here = [...room.players.values()].filter(p => p.connected);
    if (here.length < GAME_DEFS[room.game].min) { room.state = 'starting'; return this._cancelCountdown(room, 'Not enough players.'); }
    if (room.game === 'territory') return this._beginTerritory(room, here);
    const imposter = here[Math.floor(this.rng() * here.length)];
    room.state = 'playing';
    room.round++;
    room.secret = { imposterId: imposter.id, word: WORDS[Math.floor(this.rng() * WORDS.length)], category: 'Python' };
    for (const p of room.players.values()) p.client?.send(this._roleMessage(room, p));
    this._broadcast(room, { t: 'started', round: room.round });
    this._sync(room);
  }

  _roleMessage(room, player) {
    const s = room.secret;
    return player.id === s.imposterId
      ? { t: 'role', role: 'imposter', word: null, hint: `The word is a ${s.category} term. Blend in!`, round: room.round }
      : { t: 'role', role: 'crew', word: s.word, hint: null, round: room.round };
  }

  _again(room, player) {
    if (player.id !== room.hostId || room.state !== 'playing') return;
    this._stopEngine(room);
    room.state = 'lobby'; room.secret = null;
    for (const p of room.players.values()) p.ready = p.id === room.hostId;
    this._broadcast(room, { t: 'lobby' });
    this._sync(room);
  }

  // ------------------------------------------------------------------ territory (Paper Trail)
  _beginTerritory(room, here) {
    const def = GAME_DEFS.territory;
    const entities = here.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, bot: false }));
    const used = new Set(entities.map(e => e.color));
    const { bots, level } = room.settings || cleanSettings();
    let botCount = bots === 'auto' ? Math.max(0, def.entities - entities.length) : bots;
    botCount = Math.max(botCount, entities.length < 2 ? 2 - entities.length : 0);          // never a game with a single player on the board
    botCount = Math.min(botCount, def.maxEntities - entities.length);
    for (let b = 0; b < botCount; b++) {
      let color = 0; while (used.has(color)) color++;
      used.add(color);
      entities.push({ id: 'bot' + (b + 1), name: BOT_NAMES[b % BOT_NAMES.length], avatar: BOT_AVATARS[b % BOT_AVATARS.length], color, bot: true, level });
    }
    room.engine = new Territory({ rng: this.rng, entities, duration: def.seconds * TICKS_PER_SECOND });
    room.state = 'playing';
    room.round++;
    for (const p of room.players.values()) if (p.client) this._sendIntro(room, p);
    this._broadcast(room, { t: 'started', round: room.round });
    this._sync(room);
    room.tickCancel = this.scheduler.after(1000 / TICKS_PER_SECOND, () => this._territoryTick(room));
  }

  _sendIntro(room, player) {
    const e = room.engine;
    if (!e || !player.client) return;
    const me = e.byId(player.id);
    player.client.send({ t: 'gstart', ...e.intro(), you: me ? me.i : -1 });
    player.client.send({ t: 'g', ...e.snapshot(), ev: [] });
    if (e.finished) player.client.send({ t: 'gend', results: e.ranking() });
  }

  _territoryTick(room) {
    const e = room.engine;
    if (!e || room.state !== 'playing') return;
    const ev = e.tick();
    this._broadcast(room, { t: 'g', ...e.delta(), ev });            // only what changed: moving heads, new trail points, claimed land
    if (e.finished) { room.tickCancel = null; this._broadcast(room, { t: 'gend', results: e.ranking() }); return; }
    room.tickCancel = this.scheduler.after(1000 / TICKS_PER_SECOND, () => this._territoryTick(room));
  }

  _stopEngine(room) { room.tickCancel?.(); room.tickCancel = null; room.engine = null; }

  // ------------------------------------------------------------------ leaving
  _remove(room, player, why) {
    if (!room.players.has(player.id)) return;
    player.cancelGrace?.(); player.cancelGrace = null;
    room.players.delete(player.id);
    if (player.client) { player.client.room = null; player.client.player = null; }
    this._broadcast(room, { t: 'event', kind: why === 'kicked' ? 'kick' : 'leave', id: player.id, name: player.name });
    if (room.engine) room.engine.setAuto(player.id, true);                     // a player who left is played by the autopilot
    if (!room.players.size) { room.cancelCountdown?.(); this._stopEngine(room); this.rooms.delete(room.code); return; }
    if (room.hostId === player.id) {
      const next = [...room.players.values()].filter(p => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0] || [...room.players.values()][0];
      room.hostId = next.id; next.ready = true;
      this._broadcast(room, { t: 'event', kind: 'host', id: next.id, name: next.name });
    }
    if (room.state === 'starting') this._cancelCountdown(room, `${player.name} left.`);
    else if (room.state === 'playing' && room.game === 'imposter' && [...room.players.values()].filter(p => p.connected).length < 2) { room.state = 'lobby'; room.secret = null; this._broadcast(room, { t: 'lobby' }); }
    else if (room.state === 'playing' && room.game === 'territory' && ![...room.players.values()].some(p => p.connected)) { this._stopEngine(room); room.state = 'lobby'; }
    this._sync(room);
  }

  // ------------------------------------------------------------------ views
  _view(room, forPlayer) {
    return { t: 'room', code: room.code, game: room.game, settings: room.settings, state: room.state, hostId: room.hostId, you: forPlayer.id, round: room.round,
      min: GAME_DEFS[room.game].min, max: GAME_DEFS[room.game].max,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, ready: p.ready, connected: p.connected, host: p.id === room.hostId })) };
  }
  _sync(room) { for (const p of room.players.values()) p.client?.send(this._view(room, p)); }
  _broadcast(room, msg) { for (const p of room.players.values()) p.client?.send(msg); }
}

module.exports = { RoomManager, LIMITS, GAME_DEFS, cleanSettings, AVATARS, REACTIONS, WORDS, CODE_CHARS, nameProblem, cleanName };
