(function () {
  'use strict';
  const { FlappyEngine, clamp } = window.InfoM4thFlight;
  const $ = id => document.getElementById(id);
  const canvas = $('runner-canvas'), ctx = canvas.getContext('2d');
  if (!ctx) {
    $('game-announcement').textContent = 'This browser cannot run the game. InfoM4th is temporarily under maintenance.';
    $('start-button').disabled = true;
    return;
  }
  const config = window.INFOM4TH_FLAPPY_CONFIG || {};
  const storageKey = config.storageKey || 'infom4th-flappy-v1';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const worldHeight = 480;
  const flipCost = Number.isSafeInteger(config.flipCost) && config.flipCost >= 0 ? config.flipCost : 5;
  let audio, best = 0, wallet = 0, sound = false, lastFrame = 0, idleTime = 0, worldScale = 1;
  let particles = [], toastRemaining = 0, shakeRemaining = 0, previousState = 'ready';
  // flyers: coins travelling to the HUD; popups: floating "+1" labels.
  let flyers = [], popups = [], pendingCoins = 0, countdown = 0, chanceUsed = false, flip = null;
  const logo = new Image();
  logo.src = './assets/infom4th-logo.png';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    best = Number.isSafeInteger(saved.best) && saved.best >= 0 ? Math.min(saved.best, 9999999) : 0;
    sound = saved.sound === true;
    wallet = Number.isSafeInteger(saved.wallet) && saved.wallet >= 0 ? Math.min(saved.wallet, 9999999) : 0;
  } catch { /* A disabled/full store must not prevent playing. */ }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify({ best, sound, wallet })); } catch {} }
  if (typeof config.maintenanceMessage === 'string') {
    $('maintenance-message').replaceChildren();
    config.maintenanceMessage.split('\n').forEach((line, index) => {
      if (index) $('maintenance-message').append(document.createElement('br'));
      $('maintenance-message').append(document.createTextNode(line));
    });
  }
  $('year').textContent = String(new Date().getFullYear());
  function unlockAudio() {
    if (!sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audio && AudioContext) audio = new AudioContext();
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
    } catch {}
  }
  function tone(frequency, duration, volume = 0.03, wave = 'sine', delay = 0) {
    if (!sound || !audio) return;
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + delay;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(at); oscillator.stop(at + duration);
    } catch {}
  }
  function coinSound(gem) {
    tone(gem ? 1175 : 988, 0.07, 0.022, 'square');
    tone(gem ? 1760 : 1319, gem ? 0.3 : 0.18, 0.02, 'square', 0.07);
    if (gem) tone(2349, 0.25, 0.012, 'sine', 0.14);
  }
  function updateSound() {
    $('sound-button').setAttribute('aria-pressed', String(sound));
    $('sound-button').setAttribute('aria-label', sound ? 'Mute game sound' : 'Enable game sound');
    $('sound-button').title = sound ? 'Mute sound' : 'Enable sound';
  }
  function toast(message, duration = 1.5) {
    $('game-toast').textContent = message;
    $('game-toast').hidden = false;
    toastRemaining = duration;
  }
  function burst(point, color, count = 8) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < count; i++) particles.push({
      x: point.x, y: point.y, vx: (Math.random() - 0.5) * 140,
      vy: (Math.random() - 0.7) * 140, life: 0.65, color
    });
  }
  function medal(score) {
    return score >= 50 ? { name: 'PLATINUM', next: null } :
      score >= 30 ? { name: 'GOLD', next: 50 } :
      score >= 15 ? { name: 'SILVER', next: 30 } :
      score >= 5 ? { name: 'BRONZE', next: 15 } : { name: 'ROOKIE', next: 5 };
  }
  const engine = new FlappyEngine({ onEvent(event, detail) {
    if (event === 'flap') {
      tone(430, 0.075, 0.02, 'triangle');
      burst({ x: detail.x - 15, y: detail.y + 9 }, '#81dad6', 3);
    }
    if (event === 'score') {
      tone(detail.perfect ? 960 : 740, 0.11);
      burst(detail, detail.perfect ? '#f4cf8c' : '#b1f2dc', detail.perfect ? 12 : 6);
      if (detail.perfect && detail.streak >= 2) toast('PERFECT x' + detail.streak, 0.95);
      $('game-announcement').textContent = 'Score ' + detail.score + (detail.perfect ? '. Perfect gap.' : '.');
    }
    if (event === 'coin') {
      wallet = Math.min(9999999, wallet + detail.value); save();
      coinSound(detail.gem);
      burst(detail, detail.gem ? '#8ff0e4' : '#ffd977', detail.gem ? 16 : 7);
      popups.push({ x: detail.x, y: detail.y - 14, text: '+' + detail.value, life: 0.8, gem: detail.gem });
      if (detail.gem) toast('GEM COIN +5', 1.1);
      if (reducedMotion.matches) bumpCoins();
      else {
        const box = $('coin-count').getBoundingClientRect(), stage = canvas.getBoundingClientRect();
        pendingCoins += detail.value;
        flyers.push({ x0: detail.x, y0: detail.y, x1: (box.left - stage.left) / worldScale - 12, y1: (box.top + box.height / 2 - stage.top) / worldScale, t: 0, value: detail.value, gem: detail.gem });
      }
    }
    if (event === 'milestone') {
      const messages = { 5: 'BRONZE WINGS. Nice start!', 10: 'DOUBLE DIGITS. Stay smooth.', 15: 'SILVER WINGS. Finding your flow.', 20: 'TWENTY GATES. Keep it going.', 30: 'GOLD WINGS. Beautiful flying.', 50: 'PLATINUM. Incredible flight.' };
      toast(messages[detail] || detail + ' GATES. Keep the rhythm.', 2);
      tone(1200, 0.18);
    }
    if (event === 'crash') {
      shakeRemaining = 0.18;
      tone(120, 0.2, 0.04, 'triangle');
      burst({ x: engine.birdX, y: engine.bird.y }, '#a0dadf', 15);
      finishFlight();
    }
  } });
  const pad = value => String(value).padStart(2, '0');
  function setText(id, text) { if ($(id).textContent !== text) $(id).textContent = text; }
  function syncUi() {
    const state = engine.state;
    $('ready-overlay').hidden = state !== 'ready';
    $('pause-overlay').hidden = state !== 'paused';
    $('end-overlay').hidden = state !== 'over';
    $('pause-button').disabled = state !== 'running' && state !== 'paused';
    $('pause-button').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
    $('pause-button').title = state === 'paused' ? 'Resume (P / Escape)' : 'Pause (P / Escape)';
    $('flight-hud').hidden = state !== 'running';
    setText('run-label', ({ ready: 'READY WHEN YOU ARE', running: 'FIND YOUR RHYTHM', paused: 'TAKING A BREATHER', over: 'ONE MORE LITTLE FLIGHT?' })[state]);
    if (state !== previousState) {
      const messages = {
        running: 'Flight started. Tap, click or press Space to flap through the gaps.',
        paused: 'Flight paused. Choose Keep flying to resume.',
        over: 'Flight complete. ' + engine.score + ' gates passed. ' + engine.perfects + ' perfect gaps.'
      };
      $('game-announcement').textContent = messages[state] || '';
      previousState = state;
    }
  }
  function startFlight() {
    if (engine.state === 'over' && !engine.canRestart) return;
    unlockAudio();
    particles = []; flyers = []; popups = []; pendingCoins = 0; countdown = 0; chanceUsed = false;
    toastRemaining = 0; shakeRemaining = 0;
    $('game-toast').hidden = true;
    engine.start();
    syncUi();
    lastFrame = performance.now();
    canvas.focus({ preventScroll: true });
    const box=$('arcade').getBoundingClientRect();
    if(box.top<0||box.bottom>window.innerHeight)$('arcade').scrollIntoView({block:'center',behavior:reducedMotion.matches?'instant':'smooth'});
  }
  function action() {
    if (flip) { if (flip.done) $('flip-continue').click(); return; }
    if (countdown > 0 && engine.state === 'running') return;
    if (engine.state === 'ready' || engine.state === 'over') startFlight();
    else if (engine.state === 'paused') { engine.resume(); syncUi(); canvas.focus({ preventScroll: true }); }
    else engine.flap();
  }
  function togglePause() {
    if (engine.state === 'running') engine.pause();
    else if (engine.state === 'paused') { engine.resume(); canvas.focus({ preventScroll: true }); }
    lastFrame = performance.now();
    syncUi();
  }
  // Arcade hub hook: tell the parent page the final score (no-op when opened standalone).
  function reportScore(value) {
    try { if (window.parent !== window) window.parent.postMessage({ type: 'arcade:score', value, label: 'gates' }, location.origin); } catch {}
  }
  function finishFlight() {
    const newBest = engine.score > best;
    if (newBest) { best = engine.score; save(); }
    const award = medal(engine.score);
    setText('result-score', String(engine.score));
    setText('result-perfects', String(engine.perfects));
    setText('result-coins', String(engine.coinCount));
    updateChance();
    setText('end-kicker', newBest ? 'NEW PERSONAL BEST. LOOK AT YOU FLY.' : 'EVERY GREAT FLIGHT TAKES PRACTICE');
    setText('medal-value', award.name + (award.name === 'ROOKIE' ? ' / BRONZE AT 5' : ' WINGS'));
    $('medal-value').dataset.medal = award.name.toLowerCase();
    setText('best-score', pad(best));
    $('restart-button').disabled = true;
    reportScore(engine.score);
    syncUi();
  }
  function bumpCoins() {
    const score = $('coin-score');
    score.classList.remove('bump'); void score.offsetWidth; score.classList.add('bump');
  }
  function updateChance() {
    const used = chanceUsed || engine.revived;
    $('chance-button').disabled = used || wallet < flipCost;
    setText('chance-label', used ? 'Second chance used' :
      wallet < flipCost ? 'Collect ' + flipCost + ' coins to flip (' + wallet + ')' :
      'Flip for a second chance · ' + flipCost + ' of ' + wallet);
  }
  // Second chance: spend coins, call heads or tails, watch a real toss.
  function openFlip() {
    if (engine.state !== 'over' || chanceUsed || engine.revived || wallet < flipCost) return;
    flip = { done: false, win: false };
    const overlay = $('flip-overlay');
    overlay.classList.remove('win', 'lose');
    $('toss-coin').getAnimations?.().forEach(animation => animation.cancel());
    $('toss-coin').style.transform = '';
    setText('flip-kicker', 'HEADS OR TAILS? CALL IT.');
    $('flip-title').innerHTML = 'Win the toss,<br><span>keep flying.</span>';
    $('flip-actions').hidden = false; $('flip-after').hidden = true; $('flip-hint').hidden = false;
    overlay.hidden = false;
    $('end-overlay').inert = true;
    $('call-heads').focus({ preventScroll: true });
    $('game-announcement').textContent = 'Coin toss for a second chance. Choose heads or tails.';
  }
  function closeFlip() {
    flip = null;
    $('flip-overlay').hidden = true;
    $('end-overlay').inert = false;
    updateChance();
  }
  function callToss(choice) {
    if (!flip || flip.called) return;
    flip.called = true;
    wallet -= flipCost; chanceUsed = true; save();
    const bytes = new Uint8Array(1);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes); else bytes[0] = Math.random() * 256;
    const landed = bytes[0] & 1 ? 'heads' : 'tails';
    flip.win = landed === choice;
    $('flip-actions').hidden = true; $('flip-hint').hidden = true;
    setText('flip-kicker', 'YOU CALLED ' + choice.toUpperCase() + '…');
    const final = 1800 + (landed === 'tails' ? 180 : 0), coin = $('toss-coin');
    const reveal = () => {
      flip.done = true;
      $('flip-overlay').classList.add(flip.win ? 'win' : 'lose');
      setText('flip-kicker', 'IT LANDED ON ' + landed.toUpperCase());
      $('flip-title').innerHTML = flip.win ? 'Lucky wings!<br><span>Back in the air.</span>' : 'Not this time.<br><span>Fly again?</span>';
      $('flip-continue').innerHTML = flip.win ? 'Keep flying <span aria-hidden="true">&rarr;</span>' : 'Back';
      $('flip-after').hidden = false;
      $('flip-continue').focus({ preventScroll: true });
      $('game-announcement').textContent = 'The coin landed on ' + landed + '. ' + (flip.win ? 'You get a second chance.' : 'No second chance this time.');
      if (flip.win) { tone(784, 0.1, 0.025, 'triangle'); tone(1047, 0.1, 0.025, 'triangle', 0.1); tone(1568, 0.3, 0.025, 'triangle', 0.2); }
      else { tone(330, 0.16, 0.03, 'triangle'); tone(247, 0.3, 0.03, 'triangle', 0.15); }
    };
    if (reducedMotion.matches || !coin.animate) { coin.style.transform = 'rotateX(' + final + 'deg)'; reveal(); return; }
    for (let i = 0; i < 9; i++) tone(1400 - i * 40, 0.025, 0.012, 'square', i * 0.15);
    const animation = coin.animate([
      { transform: 'translateY(0) rotateX(0deg) scale(1)', easing: 'cubic-bezier(.15,.7,.4,1)' },
      { transform: 'translateY(-110px) rotateX(' + final * 0.5 + 'deg) scale(1.15)', offset: 0.45, easing: 'cubic-bezier(.6,0,.85,.4)' },
      { transform: 'translateY(0) rotateX(' + final + 'deg) scale(1)', offset: 0.88, easing: 'ease-out' },
      { transform: 'translateY(-10px) rotateX(' + final + 'deg) scale(1)', offset: 0.94, easing: 'ease-in' },
      { transform: 'translateY(0) rotateX(' + final + 'deg) scale(1)' }
    ], { duration: 1700, fill: 'forwards' });
    $('toss-shadow').animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.45)', opacity: .35, offset: 0.45 }, { transform: 'scale(1)', opacity: 1, offset: 0.88 }, { transform: 'scale(1)', opacity: 1 }], { duration: 1700 });
    animation.onfinish = () => { tone(1568, 0.06, 0.02, 'square'); tone(2093, 0.12, 0.015, 'square', 0.05); reveal(); };
  }
  function continueAfterToss() {
    if (!flip?.done) return;
    const win = flip.win;
    closeFlip();
    if (!win || !engine.revive()) return;
    particles = []; flyers = []; popups = []; pendingCoins = 0;
    countdown = reducedMotion.matches ? 0.6 : 1.5;
    toast('SECOND CHANCE', 1.4);
    syncUi();
    lastFrame = performance.now();
    canvas.focus({ preventScroll: true });
  }
  $('chance-button').addEventListener('click', openFlip);
  $('call-heads').addEventListener('click', () => callToss('heads'));
  $('call-tails').addEventListener('click', () => callToss('tails'));
  $('flip-continue').addEventListener('click', continueAfterToss);
  $('start-button').addEventListener('click', startFlight);
  $('restart-button').addEventListener('click', startFlight);
  $('resume-button').addEventListener('click', togglePause);
  $('pause-button').addEventListener('click', togglePause);
  $('flap-button').addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault(); action();
  });
  $('flap-button').addEventListener('click', event => { if (event.detail === 0) action(); });
  $('game-stage').addEventListener('pointerdown', event => {
    if (event.target.closest?.('button,a') || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault(); action();
  });
  $('sound-button').addEventListener('click', () => {
    sound = !sound; unlockAudio(); updateSound(); save(); if (sound) tone(720, 0.12);
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (flip && !flip.called) {
      if (event.code === 'KeyH') { event.preventDefault(); callToss('heads'); return; }
      if (event.code === 'KeyT') { event.preventDefault(); callToss('tails'); return; }
      if (event.code === 'Escape') { event.preventDefault(); closeFlip(); $('chance-button').focus({ preventScroll: true }); return; }
    }
    if (event.target.closest?.('button,a,input,textarea,select,[contenteditable]')) return;
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) { event.preventDefault(); action(); }
    if (['KeyP', 'Escape'].includes(event.code)) { event.preventDefault(); togglePause(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine.state === 'running') { engine.pause(); syncUi(); }
    lastFrame = performance.now();
  });
  window.addEventListener('blur', () => {
    if (engine.state === 'running') { engine.pause(); syncUi(); }
  });
  let lastCanvasWidth = 0, lastCanvasHeight = 0, lastPixelRatio = 0;
  function resize() {
    const bounds = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(bounds.width - lastCanvasWidth) < 0.1 && Math.abs(bounds.height - lastCanvasHeight) < 0.1 && ratio === lastPixelRatio) return;
    lastCanvasWidth = bounds.width; lastCanvasHeight = bounds.height; lastPixelRatio = ratio;
    const scale = bounds.height / worldHeight;
    worldScale = scale || 1;
    if (engine.state === 'running') { engine.pause(); syncUi(); }
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
    engine.resize(bounds.width / scale, worldHeight);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  function polygon(points, color) {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  }
  function mountains(offset, base, size, color) {
    const gap = size * 1.5, phase = offset % gap;
    ctx.beginPath(); ctx.moveTo(-gap, engine.height);
    for (let x = -gap - phase; x < engine.width + gap; x += gap) {
      ctx.lineTo(x, base); ctx.lineTo(x + size * 0.58, base - size * 0.57);
      ctx.lineTo(x + size * 0.9, base - size * 0.3); ctx.lineTo(x + gap, base);
    }
    ctx.lineTo(engine.width + gap, engine.height); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  function landscape(time) {
    const width = engine.width, height = engine.height, floor = engine.floor;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, engine.score >= 20 ? '#151e34' : '#0b1827');
    gradient.addColorStop(0.75, '#162f3d'); gradient.addColorStop(1, '#21434a');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 38; i++) {
      const x = (i * 139.7 + 37) % (width + 60), y = 26 + (i * 53.1) % (height * 0.64);
      const alpha = reducedMotion.matches ? 0.2 : 0.2 + Math.sin(time * 0.5 + i) * 0.07;
      ctx.fillStyle = 'rgba(161,217,219,' + alpha + ')';
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    const moonX = width * 0.83, moonY = height * 0.28;
    ctx.strokeStyle = '#789caa16'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(moonX, moonY, 42, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(moonX, moonY, 60, -0.9, 1.4); ctx.stroke();
    ctx.fillStyle = '#c1e4da'; ctx.beginPath(); ctx.arc(moonX, moonY, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#142a39'; ctx.beginPath(); ctx.arc(moonX + 7, moonY - 5, 15, 0, Math.PI * 2); ctx.fill();
    mountains(engine.distance * 0.06, floor - 5, 165, '#1b3545');
    mountains(engine.distance * 0.11 + 150, floor + 16, 120, '#20414c');
    mountains(engine.distance * 0.2 + 70, floor + 26, 80, '#29515a');
    ctx.fillStyle = '#17363c'; ctx.fillRect(0, floor, width, height - floor);
    ctx.fillStyle = '#699f93'; ctx.fillRect(0, floor, width, 1);
    for (let i = 0; i < width / 70 + 2; i++) {
      const x = i * 70 - engine.distance % 70;
      ctx.fillStyle = '#406961'; ctx.fillRect(x + 8, floor + 17, 13, 1);
      ctx.fillStyle = '#2b554f'; ctx.fillRect(x + 34, floor + 29, 7, 1);
    }
  }
  function gate(pipe, alpha = 1) {
    const top = pipe.center - pipe.gap / 2, bottom = pipe.center + pipe.gap / 2;
    ctx.save(); ctx.globalAlpha = alpha;
    for (const rect of [{ y: 0, h: top, cap: top - 15 }, { y: bottom, h: engine.floor - bottom, cap: bottom }]) {
      const fill = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.w, 0);
      fill.addColorStop(0, '#1c4b50'); fill.addColorStop(0.45, '#2a6262'); fill.addColorStop(1, '#133e45');
      ctx.fillStyle = fill; ctx.fillRect(pipe.x, rect.y, pipe.w, rect.h);
      ctx.fillStyle = '#71c1ad'; ctx.fillRect(pipe.x, rect.y, 2, rect.h);
      ctx.fillStyle = '#102f37'; ctx.fillRect(pipe.x + pipe.w - 5, rect.y, 5, rect.h);
      ctx.fillStyle = '#315f5e'; ctx.fillRect(pipe.x - 5, rect.cap, pipe.w + 10, 15);
      ctx.fillStyle = '#9cdbbd'; ctx.fillRect(pipe.x - 5, rect.cap, pipe.w + 10, 2);
      ctx.strokeStyle = '#91bda72c'; ctx.lineWidth = 1;
      const length = Math.max(0, Math.min(85, rect.h - 30));
      ctx.beginPath(); ctx.moveTo(pipe.x + 15, rect.y + 23);
      ctx.lineTo(pipe.x + 15, rect.y + 23 + length);
      ctx.lineTo(pipe.x + 26, rect.y + 23 + length); ctx.stroke();
      if (rect.h > 65) {
        ctx.fillStyle = '#99c7b17d'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
        ctx.fillText('</>', pipe.x + pipe.w / 2, rect.y === 0 ? top - 30 : bottom + 41);
      }
    }
    ctx.restore();
  }
  // A coin spinning on its vertical axis: the face narrows to its edge and back.
  function coin(x, y, r, spin, gem = false, alpha = 1) {
    const turn = Math.cos(spin), width = Math.max(0.06, Math.abs(turn)) * r;
    const edge = Math.sin(spin) * r * 0.22, front = turn >= 0;
    const colors = gem ? ['#2b7f86', '#8ff0e4', '#e9fffb', '#4fb8b8'] : ['#8f6420', '#f2c25a', '#fff3c4', '#c8932f'];
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y);
    ctx.fillStyle = gem ? '#8ff0e41c' : '#f2c25a1c';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
    // Rim: the coin's thickness shows as it turns side-on.
    ctx.fillStyle = colors[0];
    ctx.beginPath(); ctx.ellipse(edge, 0, width, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(Math.min(0, edge), -r, Math.abs(edge), r * 2);
    const face = ctx.createLinearGradient(-width, -r, width, r);
    face.addColorStop(0, colors[2]); face.addColorStop(0.45, colors[1]); face.addColorStop(1, colors[3]);
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(0, 0, width, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors[0] + 'aa'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, width * 0.7, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    if (Math.abs(turn) > 0.3) {
      ctx.scale(Math.abs(turn), 1);
      ctx.fillStyle = colors[0]; ctx.font = '700 ' + Math.round(r * 1.05) + 'px ' + 'Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(gem ? '✦' : front ? '4' : 'M', 0, 1);
    }
    // A glint sweeps across when the face turns toward the camera.
    if (turn > 0.85) {
      ctx.globalAlpha *= (turn - 0.85) / 0.15;
      ctx.fillStyle = '#ffffffcc';
      ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.16, r * 0.3, 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function coins(time) {
    for (const item of engine.coins) {
      if (item.x < -20 || item.x > engine.width + 20) continue;
      const bob = reducedMotion.matches ? 0 : Math.sin(time * 3 + item.phase) * 2;
      coin(item.x, item.y + bob, item.r, reducedMotion.matches ? 0 : time * 4.2 + item.phase, item.gem);
    }
  }
  function bird(time) {
    const idle = engine.state === 'ready';
    const y = (idle ? 78 : engine.bird.y) + (idle && !reducedMotion.matches ? Math.sin(time * 2.5) * 6 : 0);
    const angle = idle ? 0.02 : engine.state === 'over' ? Math.min(1.25, 0.3 + engine.overElapsed * 2) : clamp(engine.bird.vy / 650, -0.32, 0.75);
    ctx.save(); ctx.translate(idle ? engine.width / 2 : engine.birdX, y); ctx.rotate(angle);
    ctx.shadowColor = '#50b9c12c'; ctx.shadowBlur = reducedMotion.matches ? 0 : 14;
    if (logo.complete && logo.naturalWidth) {
      ctx.filter = 'brightness(1.3)'; ctx.drawImage(logo, -27, -26, 54, 52); ctx.filter = 'none';
    } else {
      polygon([[-24, 0], [24, -17], [0, 17]], '#3fcee1');
      polygon([[-12, -25], [12, 0], [-12, 10]], '#0f829c');
    }
    ctx.restore();
  }
  function render(time, dt) {
    ctx.save();
    if (engine.state !== 'paused') {
      shakeRemaining = Math.max(0, shakeRemaining - dt);
      particles = particles.filter(p => {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt;
        return p.life > 0;
      });
      popups = popups.filter(p => { p.life -= dt; p.y -= 38 * dt; return p.life > 0; });
      flyers = flyers.filter(f => {
        f.t += dt / 0.5;
        if (f.t < 1) return true;
        pendingCoins -= f.value; bumpCoins();
        return false;
      });
    }
    if (shakeRemaining > 0 && !reducedMotion.matches) {
      ctx.translate(Math.sin(time * 75) * shakeRemaining * 12, Math.cos(time * 60) * shakeRemaining * 6);
    }
    landscape(time);
    if (engine.state === 'ready') {
      const gx = engine.width * 0.76, gy = engine.floor * 0.49;
      gate({ x: gx, w: 58, center: gy, gap: 192, passed: false }, 0.2);
      [-110, -75, -40, 29].forEach((dx, i) => coin(gx + dx, gy + (dx < 0 ? -dx * 0.25 : 0), dx > 0 ? 11 : 9, time * 4.2 + i, dx > 0, 0.55));
    } else {
      for (const pipe of engine.pipes) gate(pipe);
      coins(time);
    }
    bird(time);
    for (const particle of particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    for (const f of flyers) {
      // Ease toward the HUD counter on a slight upward arc.
      const t = Math.min(1, f.t), ease = t * t * (3 - 2 * t);
      const x = f.x0 + (f.x1 - f.x0) * ease, y = f.y0 + (f.y1 - f.y0) * ease - Math.sin(t * Math.PI) * 40;
      coin(x, y, (f.gem ? 11 : 9) * (1 - t * 0.4), time * 14, f.gem, 1 - t * 0.3);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.font = '700 ' + (p.gem ? 15 : 12) + 'px ui-monospace, Consolas, monospace';
      ctx.fillStyle = p.gem ? '#8ff0e4' : '#ffe2a0';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    if (countdown > 0 && engine.state !== 'over') {
      const number = Math.ceil(countdown / 0.5), part = countdown % 0.5 / 0.5;
      ctx.fillStyle = '#0a192366'; ctx.fillRect(0, 0, engine.width, engine.height);
      ctx.strokeStyle = '#ffe3a1'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(engine.width / 2, engine.height * 0.42, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part); ctx.stroke();
      ctx.fillStyle = '#ffe3a1'; ctx.font = '600 46px Segoe UI, Arial, sans-serif';
      ctx.fillText(String(Math.min(3, number)), engine.width / 2, engine.height * 0.42 + 2);
      ctx.font = '11px ui-monospace, Consolas, monospace'; ctx.fillStyle = '#c9dcd9';
      ctx.fillText('GET READY TO FLAP', engine.width / 2, engine.height * 0.42 + 72);
    }
    ctx.restore();
  }
  function frame(now) {
    const dt = Math.min((now - (lastFrame || now)) / 1000, 0.05);
    lastFrame = now;
    if (!document.hidden) {
      if (countdown > 0 && engine.state === 'running') {
        countdown = Math.max(0, countdown - dt);
        if (countdown === 0) engine.flap();
      } else engine.update(dt);
      setText('coin-count', String(Math.max(0, engine.coinCount - pendingCoins)));
      if (engine.state === 'ready' && !reducedMotion.matches) idleTime += dt;
      render(engine.elapsed + idleTime + engine.overElapsed, dt);
      setText('score', pad(engine.score));
      setText('streak-value', engine.streak >= 2 ? 'PERFECT STREAK x' + engine.streak : 'ONE GAP. ONE POINT.');
      const award = medal(engine.score);
      setText('next-medal', award.next ? (award.next - engine.score) + ' TO ' + medal(award.next).name : 'PLATINUM WINGS');
      if (engine.state === 'over') $('restart-button').disabled = !engine.canRestart;
      if (engine.state !== 'paused') toastRemaining = Math.max(0, toastRemaining - dt);
      if (toastRemaining === 0) $('game-toast').hidden = true;
    }
    requestAnimationFrame(frame);
  }
  setText('best-score', pad(best));
  updateSound(); resize(); syncUi(); requestAnimationFrame(frame);
})();
