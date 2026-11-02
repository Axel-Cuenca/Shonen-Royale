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
    lp: T('lp', 'combat', .5, 400, 0), eff: T('eff', 'combat', .5, 150, 0), noteff: T('noteff', 'combat', .5, 150, 0)
  };
  SFX.attack = SFX.atk_phys;
  // nombres del juego principal que se usan como respaldo si falta el archivo
  const LEGACY = {
    click: ['click'], select: ['select'], back: ['back'], error: ['error'], turn: ['pause'], draw: ['select'], summon: ['ball', 'confirm'], epic: ['rift', 'legend'],
    set: ['shake'], flip: ['shiny'], pos: ['select'], spell: ['rift'], trap: ['judge'], heal: ['heal'], hurt: ['hurt'], hit: ['hit'], attack: ['ball'], destroy: ['break'],
    negate: ['error'], eff: ['confirm'], noteff: ['back'], confirm: ['confirm']
  };
  const TRACKS = { menu: 'music_menu', prep: 'music_prep', battle: 'music_battle', tense: 'music_tense' };
  // vol: la pista del lobby está grabada ~7 dB más baja que la de la partida
  const STREAMS = { match: { src: 'assets/music/dbz-lofi.mp3', vol: 1, random: true }, lobby: { src: 'assets/music/chrono-cross.mp3', vol: 2.2, random: false } };
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


  // ---- efectos de batalla sintetizados (1-nov-2026, inspirados en el estilo de Duel Links; originales, sin archivos) ----
  // Nunca tocan los sonidos propios de los personajes (`sfx`/`voice` de cards.js): esos siguen siendo sus .mp3.
  let nbuf = null, T0 = 0, OUT = null;
  const R = (a, b) => a + Math.random() * (b - a);
  const ev = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(o) {
    const t = T0 + (o.t || 0), a = o.a || 0.004, d = o.d || 0.2, os = ctx.createOscillator(), g = ctx.createGain(); let n = os;
    os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
    if (o.lp) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; os.connect(lp); n = lp; }
    ev(g, t, a, d, o.g == null ? 0.2 : o.g); n.connect(g); g.connect(OUT); active++; os.onended = () => { active--; os.disconnect(); g.disconnect(); };
    os.start(t); os.stop(t + a + d + 0.05);
  }
  function noise(o) {
    const t = T0 + (o.t || 0), a = o.a || 0.004, d = o.d || 0.15, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nbuf; s.loop = true; f.type = o.type || 'bandpass'; f.Q.value = o.q || 0.8; f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
    ev(g, t, a, d, o.g == null ? 0.2 : o.g); s.connect(f); f.connect(g); g.connect(OUT); active++; s.onended = () => { active--; s.disconnect(); f.disconnect(); g.disconnect(); };
    s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  }
  const SYN = {
    draw: () => { noise({ f: 3800, f2: 1800, d: 0.07, g: 0.2 }); tone({ type: 'triangle', f: 1400, d: 0.04, g: 0.05, t: 0.05 }); },
    place: () => { noise({ f: 1900, f2: 600, q: 1.2, d: 0.06, g: 0.4 }); tone({ f: 150, f2: 62, d: 0.14, g: 0.55 }); tone({ type: 'triangle', f: 2600, d: 0.09, g: 0.04, t: 0.01 }); },
    set: () => { noise({ type: 'highpass', f: 3200, f2: 800, a: 0.03, d: 0.18, g: 0.16 }); tone({ f: 115, f2: 60, d: 0.12, g: 0.4, t: 0.15 }); noise({ f: 900, d: 0.04, g: 0.2, t: 0.15 }); },
    flip: () => { noise({ f: 4200, f2: 1500, d: 0.09, g: 0.2 }); tone({ f: 1568, d: 0.4, g: 0.13, t: 0.07 }); tone({ f: 2349, d: 0.3, g: 0.05, t: 0.07 }); },
    pos: () => { noise({ f: 900, f2: 2600, q: 1.4, a: 0.03, d: 0.12, g: 0.22 }); tone({ type: 'triangle', f: 520, d: 0.05, g: 0.1, t: 0.13 }); },
    summon: () => { [660, 880, 1320, 1760].forEach((f, i) => tone({ type: i % 2 ? 'triangle' : 'sine', f, a: 0.01, d: 0.5, g: 0.13, t: i * 0.055 }));
      noise({ type: 'highpass', f: 6500, f2: 3000, a: 0.05, d: 0.4, g: 0.05 }); tone({ f: 95, f2: 55, d: 0.25, g: 0.45 }); },
    epic: () => { tone({ f: 72, f2: 34, d: 1.0, g: 0.75 }); noise({ type: 'lowpass', f: 500, f2: 90, q: 0.5, d: 0.9, g: 0.35 });
      [220, 330, 440, 660].forEach(f => tone({ type: 'triangle', f, a: 0.28, d: 1.2, g: 0.09, lp: 2400 }));
      [1320, 1760, 2640, 3520, 2640, 3960].forEach((f, i) => tone({ f, a: 0.01, d: 0.6, g: 0.08, t: 0.32 + i * 0.07 }));
      noise({ type: 'highpass', f: 7000, f2: 2500, a: 0.2, d: 0.9, g: 0.07, t: 0.2 }); },
    attack: () => { noise({ f: 400, f2: 3600, q: 1.5, a: 0.3, d: 0.08, g: 0.32 }); tone({ type: 'sawtooth', f: 120, f2: 560, a: 0.3, d: 0.08, g: 0.1, lp: 1800 });
      tone({ type: 'square', f: 900, f2: 300, d: 0.05, g: 0.12, t: 0.38 }); },
    hit: () => { noise({ f: 2600, f2: 500, q: 0.9, d: 0.13, g: 0.6 }); tone({ f: 190, f2: 48, d: 0.24, g: 0.75 }); tone({ type: 'square', f: 900, f2: 200, d: 0.05, g: 0.14 }); },
    heavy: () => { noise({ f: 2800, f2: 350, q: 0.8, d: 0.2, g: 0.7 }); tone({ f: 170, f2: 40, d: 0.45, g: 0.85 }); tone({ f: 85, f2: 28, d: 0.9, g: 0.8, t: 0.03 });
      noise({ type: 'lowpass', f: 900, f2: 90, q: 0.5, d: 0.7, g: 0.4, t: 0.02 }); noise({ f: 1800, f2: 400, d: 0.2, g: 0.25, t: 0.11 }); },
    destroy: () => { noise({ type: 'highpass', f: 5200, f2: 1800, a: 0.01, d: 0.5, g: 0.2 }); tone({ f: 130, f2: 50, d: 0.25, g: 0.5 });
      for (let i = 0; i < 9; i++) { const f = R(2200, 6200); tone({ f, f2: f * 0.55, a: 0.003, d: R(0.12, 0.38), g: 0.07, t: R(0, 0.28) }); } },
    lp: () => { for (let i = 0; i < 11; i++) tone({ type: 'triangle', f: 980 + i * 22, a: 0.002, d: 0.05, g: 0.14, t: i * 0.045 }); tone({ f: 640, d: 0.3, g: 0.17, t: 0.55 }); tone({ f: 960, d: 0.25, g: 0.06, t: 0.55 }); },
    heal: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone({ f, a: 0.01, d: 0.55, g: 0.12, t: i * 0.07 }); tone({ f: f * 2, a: 0.01, d: 0.3, g: 0.03, t: i * 0.07 }); });
      noise({ type: 'highpass', f: 7000, a: 0.1, d: 0.5, g: 0.03, t: 0.1 }); },
    spell: () => { noise({ f: 500, f2: 5200, q: 4, a: 0.42, d: 0.1, g: 0.22 }); tone({ f: 400, f2: 1700, a: 0.42, d: 0.1, g: 0.1 });
      tone({ f: 1760, a: 0.01, d: 0.7, g: 0.15, t: 0.46 }); tone({ f: 2637, a: 0.01, d: 0.6, g: 0.08, t: 0.5 }); noise({ type: 'highpass', f: 6000, d: 0.4, g: 0.05, t: 0.46 }); },
    trap: () => { noise({ f: 300, f2: 2200, q: 1.5, a: 0.2, d: 0.03, g: 0.22 }); tone({ type: 'square', f: 110, f2: 55, d: 0.4, g: 0.3, t: 0.22, lp: 900 });
      noise({ f: 1500, q: 1, d: 0.15, g: 0.3, t: 0.22 }); [523, 1109, 1567, 2217].forEach((f, i) => tone({ f, a: 0.003, d: 0.9 - i * 0.12, g: 0.1, t: 0.22 })); },
    negate: () => { tone({ type: 'sawtooth', f: 440, f2: 105, d: 0.36, g: 0.18, lp: 1200 }); noise({ f: 3000, f2: 600, d: 0.3, g: 0.2 });
      tone({ f: 1976, d: 0.35, g: 0.08 }); tone({ f: 1318, d: 0.3, g: 0.06, t: 0.04 }); },
    turn: () => { [784, 1175].forEach((f, i) => { tone({ f, a: 0.006, d: 0.7, g: 0.2, t: i * 0.13 }); tone({ f: f * 2.76, a: 0.004, d: 0.3, g: 0.04, t: i * 0.13 }); }); }
  };
  // nombre lógico del juego -> [sonido sintetizado, bus]
  const SYNMAP = {
    draw: ['draw', 'ui'], place: ['place', 'ui'], set: ['set', 'ui'], flip: ['flip', 'ui'], pos: ['pos', 'ui'], summon: ['summon', 'combat'], epic: ['epic', 'combat'],
    attack: ['attack', 'combat'], atk_phys: ['attack', 'combat'], atk_fire: ['attack', 'combat'], atk_water: ['attack', 'combat'], atk_electric: ['attack', 'combat'],
    atk_ice: ['attack', 'combat'], atk_nature: ['attack', 'combat'], atk_mystic: ['attack', 'combat'],
    hit: ['hit', 'combat'], hurt: ['hit', 'combat'], hit_heavy: ['heavy', 'combat'], destroy: ['destroy', 'combat'], lp: ['lp', 'combat'], heal: ['heal', 'combat'],
    spell: ['spell', 'combat'], trap: ['trap', 'combat'], negate: ['negate', 'combat'], turn: ['turn', 'notify']
  };
  function synth(name) {
    const m = SYNMAP[name]; if (!m || !ctx || ctx.state !== 'running' || active > 40) return;
    if (!nbuf) { nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    T0 = ctx.currentTime + 0.02; OUT = buses[m[1]]; try { SYN[m[0]](); } catch (e) { /* nada */ }
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
      if (!d && !SYNMAP[name]) return legacy(name);
      if (!ctx || ctx.state !== 'running') return;
      if (SYNMAP[name]) return synth(name);          // efectos de batalla sintetizados
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
    // Fuera de partida (menú, mazos, sala) suena otra pista larga: tampoco se reinicia al pasar de una pantalla a otra
    const key = !streamBad && (target === 'battle' || target === 'tense') ? 'match' : !streamBad && (target === 'menu' || target === 'prep') ? 'lobby' : target;
    if ((cur && cur.name === key) || (!cur && !key)) return;
    const my = ++tok;
    fadeOut(cur, 1.6); cur = null;
    if (!target) return;
    if (key === 'match' || key === 'lobby') {
      // Pistas largas: se reproducen en streaming (decodificar la de la partida, de una hora, ocuparía más de 1 GB)
      const F = STREAMS[key], el = new Audio(), g = ctx.createGain();
      el.loop = true; el.preload = 'auto'; el.src = F.src;
      if (F.random) el.addEventListener('loadedmetadata', () => { try { if (el.duration > 600) el.currentTime = Math.random() * (el.duration - 300); } catch (e) { /* nada */ } }, { once: true });
      el.addEventListener('error', () => { streamBad = true; if (cur && cur.el === el) { cur = null; applyMusic(); } }, { once: true });
      try { const ms = ctx.createMediaElementSource(el); ms.connect(g); g.connect(buses.music); } catch (e) { streamBad = true; return applyMusic(); }
      g.gain.value = 0; g.gain.linearRampToValueAtTime(F.vol, ctx.currentTime + 2.2);
      cur = { name: key, el, gain: g };
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
    try { if (D.Sound && D.Sound.onVoice) D.Sound.onVoice(card); } catch (e) { /* nada */ }
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
  /** Pitido de cuenta atrás (últimos segundos del turno): sintetizado, sin archivo. `final` = el último, más agudo y largo. */
  function tick(final) {
    if (!st.sfxOn || st.muted || !ctx || ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (last.tick || 0) < 400) return;
    last.tick = now;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime, dur = final ? .32 : .12;
      o.type = 'sine'; o.frequency.value = final ? 1320 : 880;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(final ? .6 : .45, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(buses.notify); o.start(t); o.stop(t + dur + .02);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    } catch (e) { /* nada */ }
  }
  D.Sound = {
    init, play, tick, setTrack, setAmbient, jingle, voice, CATS,
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
