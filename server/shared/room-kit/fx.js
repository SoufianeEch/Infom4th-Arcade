'use strict';
/* Vibes: confetti, sounds, floating reactions. No gradients, no libraries. Respects "reduce motion" and the mute switch. */
(function () {
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- sound (WebAudio, starts after a click or tap)
  const MUTE_KEY = 'infom4th.imposter.mute';
  let ctx = null, muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}
  function audio() {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { ctx = null; }
    return ctx;
  }
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.08, delay = 0, slideTo = null) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    pop() { tone(420, 0.1, 'triangle', 0.09, 0, 780); },
    ding() { tone(880, 0.16, 'sine', 0.08); tone(1320, 0.22, 'sine', 0.06, 0.07); },
    bye() { tone(520, 0.14, 'triangle', 0.07, 0, 300); },
    crown() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.07)); },
    tick(n) { tone(n === 1 ? 760 : 560, 0.09, 'square', 0.05); },
    go() { [523, 659, 784].forEach(f => tone(f, 0.35, 'triangle', 0.07)); },
    click() { tone(660, 0.05, 'square', 0.04); },
    flip() { tone(300, 0.18, 'triangle', 0.08, 0, 900); },
    crew() { [660, 880, 1100].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.09)); },
    imposter() { tone(150, 0.7, 'sawtooth', 0.09, 0, 60); tone(95, 0.9, 'square', 0.05, 0.05, 50); },
    claim(big) { [523, 659, 784, 1046].slice(0, big ? 4 : 2).forEach((f, i) => tone(f, 0.12, 'triangle', 0.07, i * 0.05)); },
    pow() { tone(220, 0.2, 'sawtooth', 0.08, 0, 70); tone(880, 0.08, 'square', 0.05); },
    splat() { tone(260, 0.35, 'sawtooth', 0.08, 0, 60); },
    react() { tone(700 + Math.random() * 300, 0.07, 'sine', 0.05); },
  };
  document.addEventListener('pointerdown', () => audio(), { once: true });

  // ---------------------------------------------------------------- confetti (pencil-coloured paper bits on a canvas)
  const canvas = document.getElementById('fx');
  const g = canvas.getContext('2d');
  let bits = [], raf = 0;
  const COLORS = ['#2d6bff', '#f25c54', '#ffd43b', '#3ddc97', '#ff8fc7', '#7fa6ff'];
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', resize); resize();
  function burst(x, y, n = 36, power = 1) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (120 + Math.random() * 380) * power;
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180, r: Math.random() * 6, vr: (Math.random() - .5) * 12,
        w: 5 + Math.random() * 7, h: 3 + Math.random() * 5, life: 1.1 + Math.random() * .8, age: 0, c: COLORS[(Math.random() * COLORS.length) | 0], star: Math.random() < .2 });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  function rain(n = 80) { for (let i = 0; i < n; i++) burst(Math.random() * canvas.width, -10, 1, .35); }
  let last = 0;
  function step(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    g.clearRect(0, 0, canvas.width, canvas.height);
    bits = bits.filter(b => (b.age += dt) < b.life);
    for (const b of bits) {
      b.vy += 620 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.globalAlpha = Math.min(1, (b.life - b.age) * 2); g.fillStyle = b.c;
      if (b.star) { g.font = '16px sans-serif'; g.fillText('✦', -6, 6); } else g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (bits.length) raf = requestAnimationFrame(step); else { raf = 0; last = 0; g.clearRect(0, 0, canvas.width, canvas.height); }
  }

  // ---------------------------------------------------------------- floating emoji reactions
  function floatEmoji(emoji, fromEl) {
    if (reduced()) return;
    const r = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const e = document.createElement('span');
    e.className = 'float-emoji'; e.textContent = emoji;
    e.style.left = (r.left + r.width / 2 + (Math.random() - .5) * 40) + 'px';
    e.style.top = (r.top + r.height * .2) + 'px';
    e.style.setProperty('--dx', ((Math.random() - .5) * 120) + 'px');
    document.body.append(e);
    setTimeout(() => e.remove(), 1900);
  }

  function setMuted(v) { muted = !!v; try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {} }
  window.FX = { SFX, burst, rain, floatEmoji, reduced, isMuted: () => muted, setMuted };
})();
