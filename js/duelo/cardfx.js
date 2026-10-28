/* ============ duelo/cardfx.js — capas de carta, inclinación 3D y animaciones externas (rama v2-visual) ============
 * 1. CAPAS: a las cartas de la mano y de la ficha se les añade `.cbg` (fondo de energía) y `.cch` (personaje
 *    recortado) además del marco que ya existe. Al pasar el cursor, el personaje "sale" del marco (pop-out).
 * 2. INCLINACIÓN 3D: perspective() + rotateX/rotateY siguiendo el cursor, con paralaje (fondo, ilustración y
 *    personaje se desplazan a distinta velocidad) y «squash & stretch» al pulsar. Sólo transform/opacity.
 * 3. ANIMACIONES EXTERNAS (opcional): si `assets/anim/manifest.json` (o `duelo.anim` en localStorage) asigna a una
 *    carta un GIF/WebP animado transparente, se comprueba una vez (tiempo límite, tamaño, lista de servidores
 *    permitidos). Si carga bien, la figura del tablero y la capa del personaje lo usan; si falla (red, CORS,
 *    404, tiempo, archivo raro), el juego vuelve SIEMPRE a la ilustración estática de assets/cards/.
 *    No se inventa ningún enlace: el manifiesto sale vacío y se rellena con URLs comprobadas.
 * 4. ESTADOS: helpers para clases de animación según la partida (golpeado, herido/cansado, ataque).
 * Se apaga en Ajustes («Efectos 3D de cartas», «Animaciones externas») y con «Efectos reducidos».
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const K3D = 'duelo.fx3d', KEXT = 'duelo.extanim', KDEV = 'duelo.anim';
  const ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  const reduced = () => document.documentElement.classList.contains('rm') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const on3d = () => ls(K3D) !== '0' && !reduced();
  const onExt = () => ls(KEXT) !== '0';

  // ---------------- animaciones externas ----------------
  /** Servidores de los que se acepta cargar imágenes (sólo https; el resto se rechaza sin tocar la red). */
  const HOSTS = ['raw.githubusercontent.com', 'media.githubusercontent.com', 'user-images.githubusercontent.com', 'cdn.jsdelivr.net'];
  const MAX_SIDE = 1600, MIN_SIDE = 16, TIMEOUT = 7000;
  /** ¿Es una URL aceptable? (relativa al propio sitio, o https en la lista de servidores). */
  function allowed(u) {
    if (typeof u !== 'string' || !u || u.length > 400) return false;
    if (/^(?:data|javascript|blob|file):/i.test(u)) return false;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//')) return !u.includes('..');      // ruta del propio sitio
    let x; try { x = new URL(u, location.href); } catch (e) { return false; }
    if (x.protocol !== 'https:') return false;
    return HOSTS.includes(x.hostname);
  }
  /** Acepta "url", ["url", …] o { u|url, px } y devuelve [{ u, px }] sólo con las permitidas. */
  function norm(e) {
    const arr = Array.isArray(e) ? e : e == null ? [] : [e], out = [];
    for (const it of arr) {
      const o = typeof it === 'string' ? { u: it } : it && typeof it === 'object' ? { u: it.u || it.url, px: !!it.px } : null;
      if (o && allowed(o.u)) out.push({ u: o.u, px: !!o.px });
    }
    return out;
  }
  let MANIFEST = {};                      // idCarta → [{ u, px }]
  const state = new Map();                // idCarta → { st: 'probing' | 'ok' | 'fail', u, px }
  function setManifest(obj) {
    const m = {};
    if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) { if (k[0] === '_') continue; const n = norm(obj[k]); if (n.length) m[k] = n; }
    MANIFEST = m; state.clear();
  }
  function loadManifest() {
    let dev = null; try { dev = JSON.parse(ls(KDEV) || 'null'); } catch (e) { dev = null; }
    if (dev) { setManifest(dev); return Promise.resolve(); }
    return fetch('assets/anim/manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => setManifest(j)).catch(() => { /* sin manifiesto: todo estático */ });
  }
  /** Comprueba una vez las URL de una carta, en orden, hasta que una cargue bien. */
  function probe(id) {
    const list = MANIFEST[id]; if (!list || state.has(id)) return;
    const s = { st: 'probing' }; state.set(id, s);
    let i = 0;
    const next = () => {
      if (i >= list.length) { s.st = 'fail'; return; }
      const c = list[i++], im = new Image(); let done = false;
      const fail = () => { if (done) return; done = true; clearTimeout(t); next(); };
      const t = setTimeout(fail, TIMEOUT);
      im.onerror = fail;
      im.onload = () => {
        if (done) return; done = true; clearTimeout(t);
        const w = im.naturalWidth, h = im.naturalHeight;
        if (w < MIN_SIDE || h < MIN_SIDE || w > MAX_SIDE || h > MAX_SIDE) return next();
        s.st = 'ok'; s.u = c.u; s.px = c.px;
      };
      try { im.referrerPolicy = 'no-referrer'; im.decoding = 'async'; im.src = c.u; } catch (e) { fail(); }
    };
    next();
  }
  /** URL externa ya verificada de esa carta, o null (entonces se usa la ilustración estática). */
  function animFor(id) {
    if (!onExt() || !MANIFEST[id]) return null;
    const s = state.get(id);
    if (!s) { probe(id); return null; }
    return s.st === 'ok' ? { u: s.u, px: s.px } : null;
  }
  /** Una imagen que ya se mostraba dio error: se descarta esa carta y se pasa a la estática. */
  function fail(id) { const s = state.get(id) || {}; s.st = 'fail'; state.set(id, s); }

  // ---------------- capas de la carta ----------------
  /** Cara de carta de monstruo en capas: fondo (cbg) · personaje que sobresale del marco (cch) · panel de nombre y ATK/DEF (cpanel).
   *  o = { canvas } (malla animada) | { src, px } (imagen o GIF) | {} (sin personaje todavía); o.saga = texto de la insignia. */
  function layers(el, o) {
    if (!el || el.classList.contains('layered')) return el;
    o = o || {};
    const bg = document.createElement('div'); bg.className = 'cbg';
    el.insertBefore(bg, el.firstChild);
    const cn = el.querySelector(':scope > .cn'), cs = el.querySelector(':scope > .cs');
    if (cn || cs) { const pn = document.createElement('div'); pn.className = 'cpanel'; if (cn) pn.append(cn); if (cs) pn.append(cs); el.append(pn); }
    if (o.saga) { const sg = document.createElement('span'); sg.className = 'csaga'; sg.textContent = o.saga; el.append(sg); }
    if (o.canvas) { o.canvas.classList.add('cch', 'rg'); el.append(o.canvas); }
    else if (o.src) { const im = document.createElement('img'); im.className = 'cch' + (o.px ? ' px' : ''); im.alt = ''; im.draggable = false; im.src = o.src; el.append(im); }
    el.classList.add('layered');
    return el;
  }

  // ---------------- inclinación 3D + paralaje + squash ----------------
  const SEL = '.hand .card.m, .detail .card.big.m, .card.big.m, .board3d .zone .card.m.layered.onboard';
  let cur = null, raf = 0, last = null;
  function reset(c) { if (!c) return; c.classList.remove('tilting'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); c.style.removeProperty('--mx'); c.style.removeProperty('--my'); }
  function apply() {
    raf = 0; if (!cur || !last) return;
    const r = cur.getBoundingClientRect(); if (!r.width) return;
    const nx = Math.max(-1, Math.min(1, ((last.clientX - r.left) / r.width) * 2 - 1)), ny = Math.max(-1, Math.min(1, ((last.clientY - r.top) / r.height) * 2 - 1));
    cur.classList.add('tilting');
    cur.style.setProperty('--rx', (-ny * 13).toFixed(2) + 'deg'); cur.style.setProperty('--ry', (nx * 16).toFixed(2) + 'deg');
    cur.style.setProperty('--mx', nx.toFixed(3)); cur.style.setProperty('--my', ny.toFixed(3));
  }
  function initTilt() {
    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !on3d()) return;
      const c = e.target && e.target.closest ? e.target.closest(SEL) : null;
      if (c !== cur) { reset(cur); cur = c; }
      if (!cur) return;
      last = e; if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    document.addEventListener('pointerout', e => { if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))) { reset(cur); cur = null; } }, { passive: true });
    document.addEventListener('pointerdown', e => {                       // compresión y estiramiento al pulsar
      if (!on3d()) return;
      const c = e.target && e.target.closest ? e.target.closest('.hand .card, .card.big') : null;
      if (c) { c.classList.remove('fxpress'); void c.offsetWidth; c.classList.add('fxpress'); setTimeout(() => c.classList.remove('fxpress'), 420); }
    }, { passive: true });
  }

  // ---------------- estados según la partida ----------------
  const LOW = .3;                                                           // por debajo del 30 % de PV el personaje queda «cansado»
  const tired = (lp, max) => max > 0 && lp > 0 && lp / max <= LOW;
  /** Partículas geométricas que salen despedidas de una casilla (sólo CSS: transform/opacity). */
  function shards(el, color) {
    if (!el || reduced()) return;
    const box = document.createElement('div'); box.className = 'shards';
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 2.2 + Math.random() * 3.6;
      s.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(2)}em;--dy:${(Math.sin(a) * d - 1.2).toFixed(2)}em;--r:${Math.round(Math.random() * 540 - 270)}deg;--s:${(.25 + Math.random() * .4).toFixed(2)}em;--c:${color || '#ff6b6b'};--sh:${i % 3}`;
      box.append(s);
    }
    el.append(box); setTimeout(() => box.remove(), 900);
  }

  const mark = () => document.documentElement.classList.toggle('fx3d', on3d());

  // ---------------- tablero reactivo: partículas y líneas que siguen al ratón y se ponen rojas con poca vida ----------------
  const Ambient = (() => {
    let cv = null, cx = null, raf = 0, W = 0, H = 0, P = [], mouse = { x: -999, y: -999 }, danger = 0, target = 0, t = 0, last = 0;
    const N = () => (innerWidth < 700 || ls('duelo.gfx') === 'low') ? 34 : 70;
    function resize() { if (!cv) return; const d = Math.min(devicePixelRatio || 1, 1.5); W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.max(1, W * d); cv.height = Math.max(1, H * d); cx.setTransform(d, 0, 0, d, 0, 0); }
    function seed() { P = []; for (let i = 0; i < N(); i++) P.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, r: .7 + Math.random() * 1.6, ph: Math.random() * 6.28 }); }
    function frame(ts) {
      if (!cv || !cv.isConnected) { stop(); return; }
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, ts - (last || ts)); last = ts; if (document.hidden) return;
      danger += (target - danger) * Math.min(1, dt / 600); t += dt * (1 + danger * 2.6) / 1000;
      const sp = 1 + danger * 2.6;
      // calma: azul-dorado · alerta: rojo que late
      const hue = 205 - danger * 195, sat = 70 + danger * 20, pulse = danger > .05 ? .5 + .5 * Math.sin(t * 6) : 0;
      cx.clearRect(0, 0, W, H); cv.classList.toggle('alert', danger > .3);
      for (const p of P) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 22500) { const f = (1 - Math.sqrt(d2) / 150) * .9; p.vx += dx / (Math.sqrt(d2) + 1) * f * .12; p.vy += dy / (Math.sqrt(d2) + 1) * f * .12; }     // se apartan suavemente del cursor
        p.vx *= .985; p.vy *= .985; p.vx += (Math.random() - .5) * .01; p.vy += (Math.random() - .5) * .01;
        p.x += p.vx * sp * dt / 16 + Math.sin(t + p.ph) * .12 * sp; p.y += p.vy * sp * dt / 16 - .05 * sp;
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      }
      cx.lineWidth = 1;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 11000) { cx.strokeStyle = `hsla(${hue},${sat}%,65%,${((1 - d2 / 11000) * (.16 + .16 * danger + .1 * pulse)).toFixed(3)})`; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
      }
      for (const p of P) { cx.fillStyle = `hsla(${hue},${sat}%,${72 + 8 * pulse}%,${(.5 + .3 * danger).toFixed(2)})`; cx.beginPath(); cx.arc(p.x, p.y, p.r * (1 + .3 * danger), 0, 6.283); cx.fill(); }
      if (danger > .05) {                                                       // borde de alerta que late
        const g = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
        g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,30,50,${(danger * (.30 + .22 * pulse)).toFixed(3)})`);
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      }
    }
    const move = e => { if (!cv) return; const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    function stop() { cancelAnimationFrame(raf); raf = 0; window.removeEventListener('pointermove', move); window.removeEventListener('resize', resize); cv = null; }
    return {
      /** Monta (o reutiliza) el lienzo dentro de `host` (la pantalla de partida). */
      attach(host) {
        if (!host || reduced() || !on3d()) return;
        if (cv && cv.isConnected && cv.parentNode === host) return;
        stop();
        cv = document.createElement('canvas'); cv.className = 'ambient'; cx = cv.getContext('2d'); if (!cx) { cv = null; return; }
        host.insertBefore(cv, host.firstChild); resize(); seed();
        window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('resize', () => { resize(); seed(); });
        last = 0; raf = requestAnimationFrame(frame);
      },
      /** 0 = tranquilo · 1 = alerta máxima (poca vida). */
      setDanger(x) { target = Math.max(0, Math.min(1, x)); },
      _state: () => ({ on: !!cv, danger, target, n: P.length })
    };
  })();
  /** Peligro según los PV propios: ≤ 30 % alerta total, ≤ 50 % media. */
  const dangerOf = (lp, max) => !(lp > 0) ? 0 : lp / max <= .3 ? 1 : lp / max <= .5 ? .4 : 0;

  // ---------------- banner cinético «TU TURNO» ----------------
  /** Texto gigante que cruza la pantalla, frena con elasticidad y sale. Sólo opacidad/transform + desenfoque de fondo. */
  function banner(text, tone) {
    if (reduced() || !document.body) return null;
    const old = document.querySelector('.tbanner'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'tbanner' + (tone ? ' ' + tone : '');
    const bar = document.createElement('div'); bar.className = 'tb-bar';
    const tx = document.createElement('div'); tx.className = 'tb-tx';
    [...text].forEach((ch, i) => { const s = document.createElement('span'); s.textContent = ch === ' ' ? '\u00a0' : ch; s.style.setProperty('--i', i); tx.append(s); });
    el.append(bar, tx); document.body.append(el);
    const E = 'cubic-bezier(.16, 1, .3, 1)', out = 'cubic-bezier(.7, 0, .84, 0)', done = () => el.remove();
    try {
      bar.animate([{ opacity: 0, backdropFilter: 'blur(0px)' }, { opacity: 1, backdropFilter: 'blur(8px)', offset: .2 }, { opacity: 1, backdropFilter: 'blur(8px)', offset: .78 }, { opacity: 0, backdropFilter: 'blur(0px)' }], { duration: 2000, easing: 'ease-out', fill: 'forwards' });
      const an = tx.animate([{ transform: 'translateX(-115vw) skewX(-14deg)', filter: 'blur(14px)', opacity: 0 }, { transform: 'translateX(2.5vw) skewX(-4deg)', filter: 'blur(0)', opacity: 1, offset: .30, easing: E },
        { transform: 'translateX(0) skewX(0)', opacity: 1, offset: .38 }, { transform: 'translateX(0) skewX(0)', opacity: 1, offset: .76 },
        { transform: 'translateX(115vw) skewX(14deg)', filter: 'blur(12px)', opacity: 0, easing: out }], { duration: 2000, easing: E, fill: 'forwards' });
      an.onfinish = done; setTimeout(done, 2400);
    } catch (e) { setTimeout(done, 1600); }
    return el;
  }

  const api = {
    on3d, onExt, set3d: v => { lsSet(K3D, v ? '1' : '0'); mark(); }, setExt: v => lsSet(KEXT, v ? '1' : '0'),
    allowed, norm, setManifest, loadManifest, animFor, fail, layers, shards, tired, HOSTS, ambient: Ambient, dangerOf, banner,
    _state: state, _manifest: () => MANIFEST
  };
  D.CardFX = api;
  mark(); initTilt(); loadManifest();
})();
