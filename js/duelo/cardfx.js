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
  /** Añade el fondo de energía y la capa del personaje a una carta de monstruo. `src` = recorte o animación. */
  function layers(el, src, px) {
    if (!el || el.querySelector('.cch')) return el;
    const bg = document.createElement('div'); bg.className = 'cbg';
    el.insertBefore(bg, el.firstChild);
    if (src) {
      const im = document.createElement('img'); im.className = 'cch' + (px ? ' px' : ''); im.alt = ''; im.draggable = false; im.src = src;
      el.append(im);
    }
    el.classList.add('layered');
    return el;
  }

  // ---------------- inclinación 3D + paralaje + squash ----------------
  const SEL = '.hand .card.m, .detail .card.big.m, .card.big.m';
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

  const api = {
    on3d, onExt, set3d: v => lsSet(K3D, v ? '1' : '0'), setExt: v => lsSet(KEXT, v ? '1' : '0'),
    allowed, norm, setManifest, loadManifest, animFor, fail, layers, shards, tired, HOSTS,
    _state: state, _manifest: () => MANIFEST
  };
  D.CardFX = api;
  initTilt(); loadManifest();
})();
