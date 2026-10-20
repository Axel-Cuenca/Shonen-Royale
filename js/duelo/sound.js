/* ============ duelo/sound.js — sonido y música del Duelo ============
 * Usa el sintetizador del juego (core/audio.js): no hay archivos de audio.
 * Los volúmenes se comparten con los ajustes del juego principal.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const KEY = 'duelo.snd';
  const st = { music: true, sfx: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* nada */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* nada */ } };
  const A = () => (window.G && G.Audio) || null;

  // nombre del duelo -> secuencia de efectos del juego [nombre, retraso ms]
  const MAP = {
    click: [['click']], select: [['select']], back: [['back']], error: [['error']],
    turn: [['pause']], draw: [['select']],
    summon: [['ball'], ['confirm', 90]],
    epic: [['rift'], ['legend', 140], ['boss', 60]],
    set: [['shake'], ['back', 70]],
    flip: [['shiny']], pos: [['select'], ['shake', 60]],
    spell: [['rift'], ['select', 120]], trap: [['judge'], ['hit', 80]],
    heal: [['heal']], hurt: [['hurt']], hit: [['hit'], ['hurt', 60]],
    attack: [['ball'], ['select', 90]], destroy: [['break'], ['hit', 40]],
    negate: [['error'], ['back', 80]], eff: [['confirm']], noteff: [['back']],
    win: [['levelup'], ['legend', 350]], lose: [['gameover']]
  };

  function play(name, delay) {
    const a = A();
    if (!st.sfx || !a || !MAP[name]) return;
    for (const [n, d] of MAP[name]) {
      const t = (d || 0) + (delay || 0);
      if (t) setTimeout(() => a.sfx(n), t); else a.sfx(n);
    }
  }

  let track = null;
  function applyMusic() {
    const a = A();
    if (!a) return;
    a.music(st.music ? track : null);
  }
  function setTrack(name) { track = name; applyMusic(); }

  function init() {
    const a = A();
    if (a && a.settings.muted) a.toggleMute();   // aquí se viene a oír
  }

  D.Sound = {
    init, play, setTrack,
    get musicOn() { return st.music; }, get sfxOn() { return st.sfx; },
    setMusic(on) { st.music = !!on; save(); applyMusic(); },
    setSfx(on) { st.sfx = !!on; save(); if (on) play('select'); },
    volume(which) { const a = A(); return a ? a.settings[which] : 0; },
    setVolume(which, v) { const a = A(); if (a) a.setVolume(which, v); if (which === 'sfx') play('select'); }
  };
})();
