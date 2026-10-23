/* ============ duelo/sound.js — música y sonido del Duelo (Web Audio) ============
 * Archivos en assets/duelo/audio/*.mp3 (generados por tools/make_duelo_audio.py; se pueden
 * reemplazar por otros con el mismo nombre). Si un archivo falta o no se decodifica, el juego
 * sigue: se usa el sintetizador del juego principal (core/audio.js) como respaldo.
 *
 * Categorías con volumen propio:  master · music · ui (interfaz y cartas) · combat · amb · notify
 * Música con fundido cruzado (nunca dos pistas a la vez), ambiente en bucle, un solo sonido por
 * evento (antirrebote por nombre) y el audio sólo arranca tras el primer gesto del usuario.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const KEY = 'duelo.snd2', BASE = 'assets/duelo/audio/';
  const st = { master: .85, music: .55, ui: .75, combat: .85, amb: .5, notify: .8, voice: .4, muted: false, musicOn: true, sfxOn: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* nada */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* nada */ } };
  const A = () => (window.G && G.Audio) || null;

  // nombre lógico -> archivo, categoría, ganancia, antirrebote (ms), variación de tono
  const T = (f, c, g, cd, pv) => ({ f, c, g, cd: cd || 40, pv: pv == null ? .035 : pv });
  const SFX = {
    hover: T('ui_hover', 'ui', .16, 110, .06), click: T('ui_click', 'ui', .42), confirm: T('ui_confirm', 'ui', .5, 80, .01), back: T('ui_cancel', 'ui', .4, 80, .01),
    open: T('ui_open', 'ui', .38, 120, .01), close: T('ui_close', 'ui', .34, 120, .01), tab: T('ui_tab', 'ui', .4), notify: T('notify', 'notify', .5, 200, 0), error: T('error', 'ui', .28, 150, 0),
    select: T('card_select', 'ui', .6), inspect: T('card_inspect', 'ui', .22, 160, .05), place: T('card_place', 'ui', .6), set: T('card_set', 'ui', .6), flip: T('card_flip', 'ui', .55),
    pos: T('flip_pos', 'ui', .45), draw: T('draw', 'ui', .5, 60, .05),
    summon: T('card_summon', 'combat', .7, 150, .02), epic: T('card_epic', 'combat', .8, 300, 0),
    turn: T('turn_start', 'notify', .6, 300, 0), turn_end: T('turn_end', 'notify', .7, 300, 0),
    atk_phys: T('atk_phys', 'combat', .7, 120), atk_fire: T('atk_fire', 'combat', .6, 120), atk_water: T('atk_water', 'combat', .6, 120), atk_electric: T('atk_electric', 'combat', .75, 120),
    atk_ice: T('atk_ice', 'combat', .7, 120), atk_nature: T('atk_nature', 'combat', .6, 120), atk_mystic: T('atk_mystic', 'combat', .55, 120),
    hit: T('hit', 'combat', .7, 100), hit_heavy: T('hit_heavy', 'combat', .8, 150), crit: T('crit', 'combat', .8, 200), hurt: T('hurt', 'combat', .65, 150),
    shield: T('shield', 'combat', .6, 150), destroy: T('destroy', 'combat', .7, 120), explosion: T('explosion', 'combat', .8, 250),
    heal: T('heal', 'combat', .6, 200, 0), spell: T('spell', 'combat', .6, 150), trap: T('trap', 'combat', .7, 150), negate: T('negate', 'combat', .6, 150),
    eff: T('eff', 'combat', .5, 150, 0), noteff: T('noteff', 'combat', .5, 150, 0)
  };
  SFX.attack = SFX.atk_phys;
  // nombres del juego principal que se usan como respaldo si falta el archivo
  const LEGACY = {
    click: ['click'], select: ['select'], back: ['back'], error: ['error'], turn: ['pause'], draw: ['select'], summon: ['ball', 'confirm'], epic: ['rift', 'legend'],
    set: ['shake'], flip: ['shiny'], pos: ['select'], spell: ['rift'], trap: ['judge'], heal: ['heal'], hurt: ['hurt'], hit: ['hit'], attack: ['ball'], destroy: ['break'],
    negate: ['error'], eff: ['confirm'], noteff: ['back'], confirm: ['confirm']
  };
  const TRACKS = { menu: 'music_menu', prep: 'music_prep', battle: 'music_battle', tense: 'music_tense' };
  const LEGACY_MUSIC = { menu: 'village', prep: 'forest', battle: 'volcano', tense: 'boss' };

  let streamBad = false, ctx = null, master = null, buses = {}, want = null, cur = null, amb = null, ambOn = false, tok = 0, ambTok = 0;
  const last = {}, bufs = new Map();
  let active = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = .004; comp.release.value = .2;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    for (const k of ['music', 'ui', 'combat', 'amb', 'notify']) { buses[k] = ctx.createGain(); buses[k].connect(master); }
    applyVolumes();
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(st.muted ? 0 : st.master, t, .03);
    for (const k of ['music', 'ui', 'combat', 'amb', 'notify']) buses[k].gain.setTargetAtTime(k === 'music' ? st.music : st[k], t, .03);
  }

  function buffer(file) {
    if (!bufs.has(file)) {
      bufs.set(file, fetch(BASE + file + '.mp3').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(a => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).catch(() => null));
    }
    return bufs.get(file);
  }

  function legacy(name) {
    const a = A(); if (!a || !LEGACY[name]) return;
    LEGACY[name].forEach((n, i) => setTimeout(() => { try { a.sfx(n); } catch (e) { /* nada */ } }, i * 90));
  }

  function play(name, delay) {
    if (!st.sfxOn || st.muted) return;
    const d = SFX[name];
    const run = () => {
      const now = performance.now();
      if (now - (last[name] || 0) < (d ? d.cd : 40)) return;     // un evento = un sonido
      last[name] = now;
      if (!d) return legacy(name);
      if (!ctx || ctx.state !== 'running') return;
      if (active > 28) return;
      buffer('sfx_' + d.f).then(b => {
        if (!b) return legacy(name);
        const s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = b; s.playbackRate.value = 1 + (Math.random() - .5) * 2 * d.pv; g.gain.value = d.g;
        s.connect(g); g.connect(buses[d.c]); active++; s.onended = () => { active--; s.disconnect(); g.disconnect(); };
        s.start();
      });
    };
    if (delay) setTimeout(run, delay); else run();
  }

  // ---- música con fundido cruzado ----
  function fadeOut(c, sec) {
    if (!c) return;
    try { c.gain.gain.cancelScheduledValues(ctx.currentTime); c.gain.gain.setValueAtTime(c.gain.gain.value, ctx.currentTime); c.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + sec); if (c.src) c.src.stop(ctx.currentTime + sec + .05); } catch (e) { /* nada */ }
    if (c.el) setTimeout(() => { try { c.el.pause(); c.el.removeAttribute('src'); c.el.load(); } catch (e) { /* nada */ } }, sec * 1000 + 100);
    if (c.legacy) { const a = A(); if (a) a.music(null); }
  }
  function applyMusic() {
    if (!ctx || ctx.state !== 'running') return;
    const target = st.musicOn && !st.muted ? want : null;
    // En partida (normal o en tensión) suena la misma pista larga: no se reinicia al cambiar entre las dos
    const key = (target === 'battle' || target === 'tense') && !streamBad ? 'match' : target;
    if ((cur && cur.name === key) || (!cur && !key)) return;
    const my = ++tok;
    fadeOut(cur, 1.6); cur = null;
    if (!target) return;
    if (key === 'match') {
      // Una hora de música: se reproduce en streaming (decodificarla entera ocuparía más de 1 GB de memoria)
      const el = new Audio(), g = ctx.createGain();
      el.loop = true; el.preload = 'auto'; el.src = 'assets/music/dbz-lofi.mp3';
      el.addEventListener('loadedmetadata', () => { try { if (el.duration > 600) el.currentTime = Math.random() * (el.duration - 300); } catch (e) { /* nada */ } }, { once: true });
      el.addEventListener('error', () => { streamBad = true; if (cur && cur.el === el) { cur = null; applyMusic(); } }, { once: true });
      try { const ms = ctx.createMediaElementSource(el); ms.connect(g); g.connect(buses.music); } catch (e) { streamBad = true; return applyMusic(); }
      g.gain.value = 0; g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.2);
      cur = { name: 'match', el, gain: g };
      el.play().catch(() => { /* el navegador exige un clic: applyMusic se repite al interactuar */ });
      return;
    }
    buffer(TRACKS[target]).then(b => {
      if (my !== tok) return;
      if (!b) { const a = A(); if (a) { a.music(LEGACY_MUSIC[target]); cur = { name: target, legacy: true }; } return; }
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(buses.music); s.start();
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.2);
      cur = { name: target, src: s, gain: g };
    });
  }
  function setTrack(name) { want = name; applyMusic(); }

  function applyAmb() {
    if (!ctx || ctx.state !== 'running') return;
    const on = ambOn && st.sfxOn && !st.muted;
    if (on && !amb) {
      const my = ++ambTok;
      buffer('amb_arena').then(b => {
        if (!b || my !== ambTok || amb || !ambOn) return;
        const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(buses.amb); s.start();
        g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5); amb = { src: s, gain: g };
      });
    } else if (!on && amb) { ambTok++; fadeOut(amb, 1.5); amb = null; }
  }
  function setAmbient(on) { ambOn = !!on; applyAmb(); }

  function jingle(kind) {                                     // victoria / derrota
    if (!st.sfxOn || st.muted || !ctx || ctx.state !== 'running') return;
    buffer('jingle_' + kind).then(b => {
      if (!b) { const a = A(); if (a) a.sfx(kind === 'win' ? 'levelup' : 'gameover'); return; }
      const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = .95; s.connect(g); g.connect(buses.notify); s.start();
    });
  }

  // ---- arranque tras el primer gesto (política de reproducción automática) ----
  function unlock() {
    if (!ensure()) return;
    const go = () => { applyMusic(); applyAmb(); preload(); };
    if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => { /* nada */ });
  }
  let preloaded = false;
  function preload() {
    if (preloaded) return; preloaded = true;
    const run = () => Object.values(SFX).forEach(d => buffer('sfx_' + d.f));
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 800);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => { /* nada */ }); else ctx.resume().then(() => { applyMusic(); applyAmb(); }).catch(() => { /* nada */ });
  });

  function init() {
    const a = A();
    if (a && a.settings && !a.settings.muted) { /* el respaldo sólo suena si falla un archivo */ }
    if (a && a.settings && a.settings.muted) a.toggleMute();
  }

  /** Voz de una carta al usar su habilidad: un archivo de audio propio (card.voice.src) y, si no existe, la voz
   *  genérica del navegador diciendo la frase (card.voice.say). Respeta el silencio y el volumen. */
  let voiceEl = null;
  function voice(card) {
    const v = card && card.voice;
    if (!v || !st.sfxOn || st.muted) return;
    const vol = Math.min(1, st.master * st.voice);
    const fallback = () => {
      try {
        if (!window.speechSynthesis || !v.say) return;
        const u = new SpeechSynthesisUtterance(v.say);
        u.lang = 'es-ES'; u.pitch = .55; u.rate = .9; u.volume = vol;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) { /* nada */ }
    };
    try {
      if (voiceEl) voiceEl.pause();
      voiceEl = new Audio(v.src); voiceEl.volume = vol;
      voiceEl.onerror = fallback;
      const pr = voiceEl.play(); if (pr && pr.catch) pr.catch(e => { if (e && e.name === 'NotSupportedError') fallback(); });
    } catch (e) { fallback(); }
  }
  const CATS = ['master', 'music', 'ui', 'combat', 'voice', 'amb', 'notify'];
  const SAMPLE = { master: 'confirm', music: null, ui: 'select', combat: 'hit', amb: null, notify: 'notify' };
  D.Sound = {
    init, play, setTrack, setAmbient, jingle, voice, CATS,
    get muted() { return st.muted; },
    get musicOn() { return st.musicOn; }, get sfxOn() { return st.sfxOn; },
    setMuted(m) { st.muted = !!m; save(); applyVolumes(); applyMusic(); applyAmb(); },
    setMusic(on) { st.musicOn = !!on; save(); applyMusic(); },
    setSfx(on) { st.sfxOn = !!on; save(); applyAmb(); if (on) play('select'); },
    volume(k) { return st[k]; },
    setVolume(k, v) { st[k] = Math.max(0, Math.min(1, v)); save(); applyVolumes(); },
    sample(k) { if (k === 'voice') { const c = D.Cards && D.Cards.get('c_creeper'); if (c) voice(c); } else if (SAMPLE[k]) play(SAMPLE[k]); },
    get ready() { return !!ctx && ctx.state === 'running'; },
    get state() { return { track: cur && cur.name, legacy: !!(cur && cur.legacy), ambient: !!amb, ctx: ctx && ctx.state, buffers: bufs.size }; }
  };
})();
