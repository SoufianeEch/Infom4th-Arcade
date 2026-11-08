'use strict';
// The Imposter: game-specific screen (secret role reveal). Lobby, join, countdown etc. live in /shared/room-kit/lobby.js.
(function () {
  const R = window.Room, FX = window.FX, $ = R.$, S = R.S;
  let role = null;

  function showReveal() {
    R.show('reveal');
    $('flip').classList.remove('open', 'is-imposter');
    $('role-kind').textContent = ''; $('role-word').textContent = ''; $('role-hint').textContent = '';
  }
  function toggleReveal() {
    if (!role) return;
    const flip = $('flip');
    if (flip.classList.contains('open')) { flip.classList.remove('open'); FX.SFX.click(); return; }
    const imp = role.role === 'imposter';
    $('role-kind').textContent = imp ? 'YOU ARE THE IMPOSTER' : 'You are CREW';
    $('role-word').textContent = imp ? '???' : role.word;
    $('role-hint').textContent = imp ? role.hint : 'Give a clue that fits the word without saying it. Spot who is bluffing!';
    flip.classList.toggle('is-imposter', imp);
    flip.classList.add('open');
    FX.SFX.flip();
    setTimeout(() => {
      if (imp) { FX.SFX.imposter(); R.flash('#ff3b4d'); R.shake(); } else { FX.SFX.crew(); FX.burst(innerWidth / 2, innerHeight / 2, 50); }
    }, 220);
  }

  R.on('role', m => { role = m; });
  R.on('started', showReveal);
  R.on('lobby', () => { role = null; });
  R.on('left', () => { role = null; });
  R.on('room', room => {
    const host = room.hostId === S.me;
    $('again').hidden = !host;
    $('reveal-wait').hidden = host;
    if (room.state === 'playing' && role && $('screen-reveal').hidden) showReveal();      // back after a refresh
  });

  $('again').onclick = () => { FX.SFX.click(); R.send({ t: 'again' }); };
  $('flip').onclick = toggleReveal;
  $('flip').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleReveal(); } });
})();
