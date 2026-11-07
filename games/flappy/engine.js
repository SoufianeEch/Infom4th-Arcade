/* Pure Flappy Bird rules. Canvas and browser storage live in game.js. */
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function circleIntersectsRect(circle, rect) {
    const x = clamp(circle.x, rect.x, rect.x + rect.w);
    const y = clamp(circle.y, rect.y, rect.y + rect.h);
    return (circle.x - x) ** 2 + (circle.y - y) ** 2 < circle.r ** 2;
  }

  class FlappyEngine {
    constructor({ width = 1100, height = 480, random = Math.random, onEvent = () => {} } = {}) {
      this.width = width;
      this.height = height;
      this.random = random;
      this.onEvent = onEvent;
      this.reset();
    }
    get floor() { return this.height - 40; }
    get ceiling() { return 8; }
    get birdX() { return clamp(this.width * 0.22, 78, 200); }
    get radius() { return 12; }
    get speed() { return 180 + Math.min(55, this.score * 0.85); }
    get gapSize() { return 192 - Math.min(48, this.score * 1.4); }
    get spacing() { return 270 - Math.min(20, this.score * 0.45); }
    get level() { return 1 + Math.floor(this.score / 10); }
    get canRestart() { return this.state !== 'over' || this.overElapsed >= 0.35; }

    reset() {
      this.state = 'ready';
      this.elapsed = 0;
      this.distance = 0;
      this.score = 0;
      this.perfects = 0;
      this.streak = 0;
      this.bestStreak = 0;
      this.flaps = 0;
      this.overElapsed = 0;
      this.pipes = [];
      this.coins = [];
      this.coinCount = 0;
      this.revived = false;
      this.lastGapCenter = (this.ceiling + this.floor) / 2;
      this.bird = { y: this.lastGapCenter, vy: 0 };
      this.lastFlapAt = -1;
    }
    start() {
      this.reset();
      this.state = 'running';
      this.spawnPipe(this.birdX + this.speed * 2.35);
      while (this.pipes.at(-1).x < this.width + this.spacing) {
        this.spawnPipe(this.pipes.at(-1).x + this.spacing);
      }
      this.onEvent('start');
      this.flap();
    }
    flap() {
      if (this.state !== 'running' || this.elapsed - this.lastFlapAt < 0.075) return false;
      this.lastFlapAt = this.elapsed;
      this.bird.vy = -310;
      this.flaps++;
      this.onEvent('flap', { x: this.birdX, y: this.bird.y });
      return true;
    }
    pause() {
      if (this.state === 'running') { this.state = 'paused'; this.onEvent('pause'); }
    }
    resume() {
      if (this.state === 'paused') { this.state = 'running'; this.onEvent('resume'); }
    }
    resize(width, height = this.height) {
      const oldX = this.birdX, oldFloor = this.floor;
      this.width = Math.max(260, width);
      this.height = Math.max(400, height);
      // Preserve time-to-gate on rotations and window resizes.
      const shiftX = this.birdX - oldX;
      this.pipes.forEach(pipe => { pipe.x += shiftX; });
      if (this.floor !== oldFloor) {
        const ratio = (this.floor - this.ceiling) / (oldFloor - this.ceiling);
        this.coins.forEach(coin => { coin.y = this.ceiling + (coin.y - this.ceiling) * ratio; });
        this.bird.y = this.ceiling + (this.bird.y - this.ceiling) * ratio;
        this.lastGapCenter = this.ceiling + (this.lastGapCenter - this.ceiling) * ratio;
        this.pipes.forEach(pipe => {
          pipe.center = this.ceiling + (pipe.center - this.ceiling) * ratio;
          pipe.gap = Math.min(pipe.gap, this.floor - this.ceiling - 72);
          pipe.center = clamp(pipe.center, this.ceiling + 36 + pipe.gap / 2, this.floor - 36 - pipe.gap / 2);
        });
        this.coins.forEach(coin => { if (coin.pipe) coin.y = coin.pipe.center; });
      }
      this.coins.forEach(coin => { coin.x += shiftX; });
      this.bird.y = clamp(this.bird.y, this.ceiling + this.radius + 1, this.floor - this.radius - 1);
    }
    spawnPipe(x) {
      const gap = this.gapSize;
      const maxShift = this.score < 5 ? 42 : 60;
      const desired = this.lastGapCenter + (this.random() * 2 - 1) * maxShift;
      const center = clamp(desired, this.ceiling + 36 + gap / 2, this.floor - 36 - gap / 2);
      const previous = this.pipes.at(-1);
      const pipe = { x, w: 58, center, gap, passed: false, index: this.score + this.pipes.filter(p => !p.passed).length + 1 };
      this.pipes.push(pipe);
      this.lastGapCenter = center;
      // One coin sits in every gap; every tenth gate carries a gem worth five.
      const gem = pipe.index % 10 === 0;
      this.coins.push({ x: x + pipe.w / 2, y: center, r: gem ? 11 : 9, value: gem ? 5 : 1, gem, pipe, phase: pipe.index * 1.7 });
      // Every third gate, a trail of coins follows the line from the previous gap.
      if (previous && pipe.index % 3 === 0 && x > previous.x + previous.w) {
        for (const t of [0.25, 0.5, 0.75]) {
          const from = previous.x + previous.w;
          this.coins.push({ x: from + (x - from) * t, y: previous.center + (center - previous.center) * t, r: 9, value: 1, gem: false, phase: pipe.index + t * 4 });
        }
      }
      return pipe;
    }
    die(reason) {
      if (this.state !== 'running') return;
      this.state = 'over';
      this.overElapsed = 0;
      this.bird.vy = Math.max(70, this.bird.vy);
      this.onEvent('crash', { reason, score: this.score });
    }
    // Second chance after a crash: clear the gate ahead and restart from the next gap.
    revive() {
      if (this.state !== 'over' || this.revived) return false;
      this.revived = true;
      const clearUntil = this.birdX + this.speed * 1.5;
      const removed = this.pipes.filter(pipe => !pipe.passed && pipe.x < clearUntil);
      this.pipes = this.pipes.filter(pipe => !removed.includes(pipe));
      this.coins = this.coins.filter(coin => !removed.includes(coin.pipe) && coin.x > clearUntil);
      if (!this.pipes.some(pipe => !pipe.passed)) this.spawnPipe(clearUntil + this.spacing * 0.4);
      const next = this.pipes.find(pipe => !pipe.passed);
      this.bird = { y: next.center, vy: 0 };
      this.streak = 0;
      this.lastFlapAt = this.elapsed - 1;
      this.state = 'running';
      this.onEvent('revive');
      return true;
    }
    update(delta) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      let remaining = Math.min(delta, 0.05);
      if (this.state === 'over') {
        this.overElapsed += remaining;
        this.bird.vy = Math.min(650, this.bird.vy + 1000 * remaining);
        this.bird.y = Math.min(this.floor - this.radius, this.bird.y + this.bird.vy * remaining);
        return;
      }
      if (this.state !== 'running') return;
      while (remaining > 0 && this.state === 'running') {
        const dt = Math.min(remaining, 1 / 180);
        this.step(dt);
        remaining -= dt;
      }
    }
    step(dt) {
      this.elapsed += dt;
      this.bird.vy = Math.min(650, this.bird.vy + 1080 * dt);
      this.bird.y += this.bird.vy * dt;
      const movement = this.speed * dt;
      this.distance += movement;
      for (const pipe of this.pipes) pipe.x -= movement;
      for (const coin of this.coins) {
        coin.x -= movement;
        if (!coin.taken && (coin.x - this.birdX) ** 2 + (coin.y - this.bird.y) ** 2 < (this.radius + coin.r + 4) ** 2) {
          coin.taken = true;
          this.coinCount += coin.value;
          this.onEvent('coin', { x: coin.x, y: coin.y, value: coin.value, gem: coin.gem, total: this.coinCount });
        }
      }
      this.coins = this.coins.filter(coin => !coin.taken && coin.x > -40);
      if (this.bird.y - this.radius <= this.ceiling) { this.die('ceiling'); return; }
      if (this.bird.y + this.radius >= this.floor) { this.die('ground'); return; }
      const body = { x: this.birdX, y: this.bird.y, r: this.radius };
      for (const pipe of this.pipes) {
        const top = pipe.center - pipe.gap / 2, bottom = pipe.center + pipe.gap / 2;
        // Slightly inset sides are forgiving to the logo's long wing tips.
        if (circleIntersectsRect(body, { x: pipe.x + 2, y: 0, w: pipe.w - 4, h: top })
          || circleIntersectsRect(body, { x: pipe.x + 2, y: bottom, w: pipe.w - 4, h: this.height - bottom })) {
          this.die('gate');
          return;
        }
        if (!pipe.passed && pipe.x + pipe.w < this.birdX - this.radius) {
          pipe.passed = true;
          this.score++;
          const perfect = Math.abs(this.bird.y - pipe.center) < 27;
          if (perfect) { this.perfects++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
          else this.streak = 0;
          this.onEvent('score', { score: this.score, perfect, streak: this.streak, x: this.birdX, y: this.bird.y });
          if (this.score % 5 === 0) this.onEvent('milestone', this.score);
        }
      }
      this.pipes = this.pipes.filter(pipe => pipe.x + pipe.w > -40);
      const last = this.pipes.at(-1);
      if (last && last.x < this.width + this.spacing) this.spawnPipe(last.x + this.spacing);
    }
  }
  const exported = { FlappyEngine, clamp, circleIntersectsRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.InfoM4thFlight = Object.freeze(exported);
})(typeof globalThis !== 'undefined' ? globalThis : this);
