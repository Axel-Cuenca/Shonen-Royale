/* ============ duelo/ui.js — pantallas de Shonen Royale ============ */
(function () {
  'use strict';
  const D = window.Duelo, C = D.Cards, E = D.Engine;
  const app = document.getElementById('app');
  const S = D.Sound;
  S.init();
  // un clic = un sonido, según el tipo de control
  document.addEventListener('click', e => {
    const t = e.target.closest('.btn, .menu-btn, .li, .back, .ib, .tab');
    if (!t || t.disabled) return;
    S.play(t.classList.contains('endturn') ? 'turn_end' : t.classList.contains('tab') || t.classList.contains('tog') ? 'tab' : t.classList.contains('ghost') || t.classList.contains('back') ? 'back'
      : t.classList.contains('gold') || t.classList.contains('teal') ? 'confirm' : 'click');
  }, true);
  // hover: sólo al entrar en un control nuevo y con un mínimo entre sonidos
  let hoverEl = null, hoverT = 0;
  document.addEventListener('pointerover', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const t = e.target.closest && e.target.closest('.btn, .menu-btn, .li, .ib, .hand .card');
    if (!t || t === hoverEl) { if (!t) hoverEl = null; return; }
    hoverEl = t; const now = performance.now();
    if (now - hoverT < 90 || t.disabled) return;
    hoverT = now; if (!t.classList.contains('card')) S.play('hover');      // las cartas ya no suenan al pasar el ratón
  });
  // efectos visuales reducidos (preferencia propia o del sistema)
  const RM = 'duelo.rm';
  const rmGet = () => { try { const v = localStorage.getItem(RM); return v == null ? (matchMedia('(prefers-reduced-motion: reduce)').matches) : v === '1'; } catch (e) { return false; } };
  const rmSet = on => { try { localStorage.setItem(RM, on ? '1' : '0'); } catch (e) { /* nada */ } document.documentElement.classList.toggle('rm', on); };
  document.documentElement.classList.toggle('rm', rmGet());
  const FAM = { fire: 'fire', water: 'water', electric: 'electric', ice: 'ice', grass: 'nature', bug: 'nature', poison: 'nature', psychic: 'mystic', ghost: 'mystic', dark: 'mystic', fairy: 'mystic', dragon: 'mystic', demonslayer: 'electric', lol: 'mystic', shrek: 'nature', pecados: 'fire', anillos: 'mystic', marvel: 'phys' };
  const famOf = d => (d && FAM[d.type]) || 'phys';
  const byName = {};
  C.all().forEach(c => { byName[c.name] = c; });
  (C.custom || []).forEach(c => { byName[c.name] = c; });      // también las formas ocultas (Rhaast, Asesino Sombra)

  // ---------------- fondo de los menús: la arena de lejos ----------------
  const bgEl = h('div', { id: 'bg' }, h('div', { class: 'vig' }));
  document.body.prepend(bgEl);
  D.Scene.backdrop(bgEl);
  // fondo dorado de todos los menús (el mismo del menú principal): suelo de piedra, niebla, luz y brasas
  const goldBg = (() => {
    const parts = h('div', { class: 'hb-parts' });
    if (!document.documentElement.classList.contains('rm')) for (let i = 0; i < 30; i++) { const sz = 2 + Math.random() * 5, d = 6 + Math.random() * 9; parts.append(h('i', { style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(40 + Math.random() * 60).toFixed(1)}%;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;--d:${d.toFixed(1)}s;animation-delay:-${(Math.random() * d).toFixed(1)}s;--dx:${((Math.random() - .5) * 120).toFixed(0)}px` })); }
    const e = h('div', { class: 'hbg' }, h('div', { class: 'hb-sky' }), h('div', { class: 'hb-floorwrap' }, h('div', { class: 'hb-floor' }), h('div', { class: 'hb-floorfade' })), h('div', { class: 'hb-tint' }), h('div', { class: 'hb-rays' }), h('div', { class: 'hb-fog' }), h('div', { class: 'hb-halo' }), h('div', { class: 'hb-shadow' }), parts, h('div', { class: 'hb-dim' }), h('div', { class: 'hb-vig' }));
    e.style.display = 'none'; document.body.prepend(e); return e;
  })();
  const showBg = on => { bgEl.style.display = on ? '' : 'none'; goldBg.style.display = on ? '' : 'none'; document.body.classList.toggle('goldbg', !!on); if (on) D.Scene.toBackdrop(); else { topEl.style.display = 'none'; document.body.classList.remove('gtop-on'); } };

  // ---------------- vista previa al pasar el mouse ----------------
  let prevEl = null;
  function hidePreview() { if (prevEl) { prevEl.remove(); prevEl = null; } }
  document.addEventListener('mouseover', e => {
    if (!window.matchMedia || !matchMedia('(hover: hover) and (min-width: 900px)').matches) return;
    const el = e.target.closest && e.target.closest('[data-cid]');
    if (!el) { hidePreview(); return; }
    const d = C.get(el.dataset.cid); if (!d) return;
    hidePreview();
    const big = cardEl(d); big.classList.add('big');
    prevEl = h('div', { class: 'preview' }, big, h('div', { class: 'pv-t' }, h('b', null, d.name), d.kind === 'monster' ? h('div', null, `Nivel ${d.level} · ATK ${d.atk} · DEF ${d.def}`) : h('div', null, d.text)));
    document.body.append(prevEl);
  });
  document.addEventListener('mouseleave', hidePreview);

  // ---------------- utilidades ----------------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const btn = (text, fn, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: fn }, text);
  const typeChip = t => h('span', { class: 'chip', style: 'background:' + C.TYPE_COLOR[t] }, C.TYPE_ES[t] || t);
  // cabecera fija de todas las pantallas de menú (logo, secciones, puntos, rango y cuenta)
  let curScreen = 'boot', pendScreen = null, introDone = false;
  const scr = k => { pendScreen = k; };           // cada pantalla dice cuál es antes de montarse
  const mount = (...kids) => { curScreen = pendScreen || ''; pendScreen = null; app.replaceChildren(...kids); window.scrollTo(0, 0); refreshHeader(); };
  const topEl = h('header', { class: 'htop gtop' });
  topEl.style.display = 'none';
  document.body.prepend(topEl);
  // puntitos de aviso en la barra: recompensa por cobrar, ofertas de hoy, cajas que ya puedes abrir, premio de temporada y novedades sin leer
  const localDay = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  const newsSig = () => { const l = (G.CHANGELOG || []).filter(e => e.d >= '2026-10-19'); return l.length ? l[l.length - 1].d + ':' + ['new', 'chg', 'fix'].reduce((n, k) => n + l.reduce((m, e) => m + ((e[k] || []).length), 0), 0) : ''; };
  function badges() {
    const b = {};
    try {
      if (C.test || !D.Shop) return b;
      if (D.Shop.dailyInfo()) b.jugar = 'Recompensa diaria por cobrar';
      const day = localDay();
      if (lsGet('duelo.offSeen') !== day) b.tienda = 'Ofertas nuevas de hoy';
      const min = Math.min(...D.Shop.BOXES.map(x => x.price));
      if (D.Shop.coins() >= min) b.cajas = 'Ya puedes abrir una caja';
      if (D.Rank.pending && D.Rank.pending().length) b.ranking = 'Premio de temporada por cobrar';
      if (newsSig() && lsGet('duelo.newsSeen') !== newsSig()) b.novedades = 'Novedades sin leer';
    } catch (e) { /* nada */ }
    return b;
  }
  function refreshHeader() {
    const show = document.body.classList.contains('goldbg') && curScreen !== 'boot' && curScreen !== 'login';
    topEl.style.display = show ? '' : 'none';
    document.body.classList.toggle('gtop-on', show);
    if (D.FriendsUI) { initFriends(); D.FriendsUI.show(show && D.Account.cloud); }   // burger de amigos (arriba a la derecha)
    if (!show) return;
    const nav = [['jugar', 'Jugar', menu], ['mazos', 'Mazos', deckBuilder], ['tienda', 'Tienda', () => shopScreen()], ['cajas', 'Cajas', () => boxScreen()], ['ranking', 'Ranking', () => rankScreen()], ['novedades', 'Novedades', news]];
    topEl.replaceChildren(h('div', { class: 'brand' }, embEl(), 'SHONEN ROYALE'),
      h('nav', { class: 'hnav' }, nav.map(n => { const bd = badges()[n[0]]; return h('button', { class: n[0] === curScreen ? 'on' : '', onclick: n[2], title: bd || null }, n[1], bd ? h('i', { class: 'bdg', 'aria-label': bd }) : null); })),
      h('div', { class: 'hright' }, pointsBar(true), acctBar()));
    if (!introDone) {                               // la primera vez entra con el splash: espera a que se vaya
      introDone = true; const sp = document.getElementById('splash');
      if (sp && !sp.classList.contains('out')) { topEl.classList.add('pre'); setTimeout(() => topEl.classList.remove('pre'), 4000); }
    }
    document.documentElement.style.setProperty('--gtop', topEl.offsetHeight + 'px');
  }
  // ---------------- amigos (js/duelo/social.js + friends-ui.js) ----------------
  let friendsReady = false;
  function initFriends() {
    if (friendsReady || !D.Social) return; friendsReady = true;
    D.FriendsUI.init({ h, joinCode: joinByCode, host: hostNow, login: () => { D.Account.logout().then(() => { D.Online.reset(); loginScreen(); }); } });
  }
  /** «Unirse» desde una invitación o desde un amigo: el mismo flujo que escribir el código en «Duelo online». */
  function joinByCode(code) {
    S.setTrack('prep');
    const err = h('div', { class: 'msg' }, 'Conectando con tu cuenta…');
    scr('online'); mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'), err));
    D.Online.init().then(me => { if (!me) { err.className = 'msg err'; err.textContent = 'Para jugar online necesitas una cuenta.'; return; } joinRoom(code, err); })
      .catch(e => { err.className = 'msg err'; err.textContent = 'No se pudo conectar: ' + e.message; });
  }
  /** «Invitar» sin sala: se crea el lobby (el formato crece solo según cuántos entren, y se puede cambiar) y, ya creado, se manda la invitación (FriendsUI.roomOpened). */
  function hostNow() { if (lobbyApi && curScreen === 'lobby') lobbyApi.invite(); else lobby({ invite: true }); }
  addEventListener('resize', () => { if (topEl.style.display !== 'none') document.documentElement.style.setProperty('--gtop', topEl.offsetHeight + 'px'); });

  // ---------------- mazos guardados ----------------
  // Sin cuenta (invitado o sin nube): en este navegador. Con cuenta: una copia por cuenta en este
  // navegador y otra en la nube (js/duelo/account.js); gana la más reciente.
  const KEY = 'duelo.v1';
  let storeKey = KEY;
  const defaultStore = () => ({ decks: [{ name: 'Mi mazo', ids: [] }], active: 0, updated: 0 });
  /** Quita de los mazos guardados las cartas que ya no existen en el catálogo. */
  function clean(s) { if (s && Array.isArray(s.decks)) for (const d of s.decks) if (Array.isArray(d.ids)) d.ids = d.ids.filter(id => C.get(id)); return s; }
  function readStore(key) {
    try {
      const s = JSON.parse(localStorage.getItem(key));
      if (s && Array.isArray(s.decks) && s.decks.length) { s.active = Math.min(s.active | 0, s.decks.length - 1); return clean(s); }
    } catch (e) { /* nada */ }
    return null;
  }
  let store = readStore(KEY) || defaultStore();
  const cloudUser = () => { const u = D.Account.user; return D.Account.cloud && u && !u.guest ? u : null; };
  function save() {
    store.updated = Date.now();
    try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) { /* nada */ }
    if (cloudUser()) D.Account.push(store);
  }
  D.Shop.init(() => store, save); D.Shop.apply(); D.Rank.init(() => store, save);
  /** Carga los mazos de quien acaba de entrar (null = invitado / sin nube). */
  async function openStore(u) {
    if (!u || u.guest) { storeKey = KEY; store = readStore(KEY) || defaultStore(); D.Shop.apply(); return; }
    storeKey = KEY + '.' + u.uid;
    const local = readStore(storeKey), remote = await D.Account.pull();
    const ok = r => r && Array.isArray(r.decks) && r.decks.length ? r : null;
    const rem = ok(remote);
    let pick = rem && local ? ((rem.updated || 0) >= (local.updated || 0) ? rem : local) : rem || local;
    const fresh = !pick;
    if (fresh) {                                    // cuenta nueva: la primera de este navegador se queda los mazos que ya había aquí
      let claimed = null; try { claimed = localStorage.getItem(KEY + '.claimed'); } catch (e) { /* nada */ }
      pick = (!claimed && readStore(KEY)) || defaultStore();
      if (!claimed) { try { localStorage.setItem(KEY + '.claimed', u.uid); } catch (e) { /* nada */ } }
      pick.updated = Date.now();
    }
    pick.active = Math.min(pick.active | 0, pick.decks.length - 1);
    store = clean(pick); D.Shop.apply();
    try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) { /* nada */ }
    if (pick !== rem) D.Account.push(store);
  }
  // en el modo de prueba (?prueba) el mazo es fijo y no se guarda
  const TESTDK = { name: 'Mazo de prueba', get ids() { return C.testDeck(); } };
  const activeDeck = () => C.test ? TESTDK : store.decks[store.active];

  // ---------------- dibujo de cartas ----------------
  /** Figuras de pie («holograma»): la ilustración de cada personaje con el fondo claro recortado (se hace una vez en el navegador). */
  const Holo = (() => {
    const cache = new Map();
    function cutout(src) {
      return new Promise(res => {
        const im = new Image();
        im.onerror = () => res(null);
        im.onload = () => {
          try {
            const k = Math.min(1, 560 / Math.max(im.naturalWidth, im.naturalHeight));
            const W = Math.round(im.naturalWidth * k), H = Math.round(im.naturalHeight * k);
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
            const d = x.getImageData(0, 0, W, H), p = d.data, seen = new Uint8Array(W * H), q = [];
            const light = i => { const a = p[i * 4 + 3]; if (a < 20) return true; return p[i * 4] > 226 && p[i * 4 + 1] > 226 && p[i * 4 + 2] > 226; };
            for (let i = 0; i < W; i++) q.push(i, (H - 1) * W + i);
            for (let j = 0; j < H; j++) q.push(j * W, j * W + W - 1);
            while (q.length) {
              const i = q.pop();
              if (seen[i] || !light(i)) continue;
              seen[i] = 1; p[i * 4 + 3] = 0;
              const xx = i % W, yy = (i / W) | 0;
              if (xx > 0) q.push(i - 1); if (xx < W - 1) q.push(i + 1); if (yy > 0) q.push(i - W); if (yy < H - 1) q.push(i + W);
            }
            // quita el halo blanco del borde: píxeles casi blancos pegados a lo transparente
            for (let i = 0; i < W * H; i++) {
              if (p[i * 4 + 3] === 0) continue;
              const xx = i % W, yy = (i / W) | 0;
              if ((xx > 0 && seen[i - 1]) || (xx < W - 1 && seen[i + 1]) || (yy > 0 && seen[i - W]) || (yy < H - 1 && seen[i + W])) {
                if (p[i * 4] > 190 && p[i * 4 + 1] > 190 && p[i * 4 + 2] > 190) p[i * 4 + 3] = 0;
              }
            }
            x.putImageData(d, 0, 0);
            res(c.toDataURL('image/png'));
          } catch (e) { res(null); }          // p. ej. abierto como archivo local: se queda la carta plana
        };
        im.src = src;
      });
    }
    return {
      // la caché va por imagen (no por carta): así cada skin de ilustración tiene su propio recorte
      prepare() {
        for (const c of C.all().concat(C.custom.filter(x => x.hidden))) if (c.kind === 'monster' && c.img) want(c.img);
        if (D.Shop && D.Shop.skinPool) for (const it of D.Shop.skinPool()) want(it.img);
      },
      /** Recorte listo de esa carta (con la skin `img` si se da) o null mientras se prepara. */
      src: (id, img) => { const k = img || (C.get(id) || {}).img; if (!k) return null; want(k); return cache.get(k) || null; }
    };
    function want(k) { if (!cache.has(k)) { cache.set(k, null); cutout(k).then(u => cache.set(k, u)); } }
  })();
  setTimeout(() => Holo.prepare(), 0);

  /** Imagen de la skin de ilustración que YO le puse a esa carta, o null (imagen original). */
  const myArt = id => { const it = D.Shop && D.Shop.artOf && D.Shop.artOf(id); return it ? it.img : null; };
  /** Imagen de la skin que puso el dueño de la carta (cosméticos `cs` ya saneados con D.Shop.clean/mine), o null. */
  const cosArt = (cs, id) => { const sid = cs && cs.si && cs.si[id], it = sid && D.Shop.get(sid); return it && it.cat === 'si' && it.card === id ? it.img : null; };
  function sprite(card, px, art) {
    if (card.img) {                       // carta propia con ilustración (no es de la Pokédex); `art`: skin de ilustración
      const b = h('div', { class: 'art', style: px ? `font-size:${px}px;width:1em;height:1em;flex:none;margin:0` : '' });
      b.append(h('img', { class: 'cimg', src: art || card.img, alt: card.name, draggable: 'false' }));
      return b;
    }
    const m = window.G.SPRITE_META && G.SPRITE_META[card.dex], a = m && m.a && m.a.Idle;
    const box = h('div', { class: 'art', style: px ? `font-size:${px}px;width:1em;height:1em;flex:none;margin:0` : '' });
    if (!a) { box.textContent = '?'; return box; }
    const k = 0.92 / Math.max(a.w, a.h);
    const s = h('div', { class: 'spr', style: `width:${a.w * k}em;height:${a.h * k}em;background:url(assets/pokemon/${card.dex}/Idle.png) 0 0/${a.n * a.w * k}em ${a.r * a.h * k}em no-repeat` });
    box.append(s);
    return box;
  }
  /** o: { down, pos, atk, def } (atk/def efectivos del tablero), art: imagen de la skin (sin dar: la mía; null: la original) */
  function cardEl(card, o) {
    o = o || {};
    if (o.down && !card) return h('div', { class: 'card back' + (o.pos === 'def' ? ' def' : '') });
    const d = typeof card === 'string' ? C.get(card) : card;
    if (d.kind === 'monster') {
      const atk = o.atk != null ? o.atk : d.atk, def = o.def != null ? o.def : d.def;
      const cls = (v, base) => v > base ? 'up' : v < base ? 'dn' : '';
      const mySk = D.Shop && D.Shop.skinOf(d.id);
      return h('div', Object.assign({ class: 'card m' + (d.level >= 7 ? ' hi' : d.level >= 5 ? ' lvmid' : '') + (o.pos === 'def' ? ' def' : '') + (o.down ? ' dis' : ''), 'data-cid': d.id, style: '--tc:' + C.TYPE_COLOR[d.type] }, mySk && !o.down ? { 'data-sk': D.Shop.slug(mySk.id) } : {}),
        h('div', { class: 'cn' }, d.name), sprite(d, 0, o.down ? null : o.art !== undefined ? o.art : myArt(d.id)),
        h('div', { class: 'cl' }, '★'.repeat(d.level)),
        h('div', { class: 'cs' }, h('b', { class: cls(atk, d.atk) }, atk), h('b', { class: cls(def, d.def) }, def)));
    }
    return h('div', { class: 'card ' + d.kind + (o.down ? ' dis' : '') + (d.img ? ' hasimg' : ''), 'data-cid': d.id },
      h('div', { class: 'cn' }, d.name), d.img ? sprite(d) : h('div', { class: 'art ico' }, d.icon),
      h('div', { class: 'ck' }, d.kind === 'spell' ? (d.sub === 'equip' ? 'Magia · Equipo' : d.sub === 'cont' ? 'Magia continua' : 'Magia') : 'Trampa'));
  }
  function detailBox(card, extra) {
    const d = typeof card === 'string' ? C.get(card) : card;
    const big = cardEl(d); big.classList.add('big');
    const txt = h('div', { class: 'txt' });
    if (d.kind === 'monster') {
      txt.append(h('h3', null, d.name), h('div', { class: 'chips' }, d.types.map(typeChip)),
        h('div', null, `Nivel ${d.level} · ATK ${d.atk} · DEF ${d.def}`),
        d.text ? h('div', { class: 'abil' }, h('b', null, 'Habilidad'), h('div', null, d.text)) : null,
        h('div', { class: 'sub' }, C.tributesFor(d.level) ? `Para invocarlo hay que sacrificar ${C.tributesFor(d.level)} monstruo(s) tuyo(s).` : 'Se invoca sin sacrificios.'),
        h('div', { class: 'sub' }, 'No hay ventajas de tipo: el combate sólo compara ATK y DEF.'));
    } else {
      txt.append(h('h3', null, d.name), h('div', { class: 'chips' }, h('span', { class: 'chip', style: 'background:' + (d.kind === 'spell' ? '#1f9d8a' : '#b04c9a') }, d.kind === 'spell' ? 'Magia' : 'Trampa')), h('div', null, d.text));
      if (d.kind === 'trap') txt.append(h('div', { class: 'sub' }, 'Se coloca boca abajo y se activa sola cuando puedes responder (desde el turno siguiente).'));
    }
    if (extra) txt.append(extra);
    return h('div', { class: 'detail' }, big, txt);
  }

  // ---------------- ventanas ----------------
  let modalEl = null;
  function closeModal(silent) { if (modalEl) { modalEl.remove(); modalEl = null; if (silent !== true) S.play('close'); } }
  function modal(box, onClose) {
    const had = !!modalEl; closeModal(true); if (!had) S.play('open');
    const m = h('div', { class: 'modal', onclick: e => { if (e.target === m && onClose !== false) { closeModal(); if (typeof onClose === 'function') onClose(); } } }, box);
    document.body.append(m); modalEl = m; return m;
  }

  // ---------------- sonido ----------------
  let sndEl = null, fsEl = null;
  function sndButton(show) {
    if (!sndEl) { sndEl = h('button', { class: 'sndbtn', title: 'Ajustes', 'aria-label': 'Ajustes', onclick: soundPanel }, '⚙️'); document.body.append(sndEl); }
    sndEl.style.display = show ? '' : 'none';
    if (FS.wanted()) {
      if (!fsEl) { fsEl = h('button', { class: 'sndbtn fsbtn fsb', title: 'Pantalla completa', onclick: FS.toggle }, FS.icon()); document.body.append(fsEl); }
      fsEl.style.display = show ? '' : 'none';
    }
  }

  // ---------------- pantalla completa (móvil) ----------------
  // Android/iPad: API de pantalla completa. iPhone no la tiene: se explica «Añadir a pantalla de inicio»
  // (la app ya es standalone por el manifest). Si el jugador la activó, se vuelve a pedir en su siguiente toque
  // (al recargar por una actualización el navegador sale de pantalla completa).
  const FS = (() => {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const cur = () => document.fullscreenElement || document.webkitFullscreenElement;
    const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone === true;
    const pref = v => { try { if (v === undefined) return localStorage.getItem('duelo.fs') === '1'; localStorage.setItem('duelo.fs', v ? '1' : '0'); } catch (e) { return false; } };
    const touch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const api = {
      wanted: () => !standalone(),
      icon: () => (cur() ? '⤡' : '⛶'),
      sync: () => document.querySelectorAll('.fsb').forEach(b => { b.textContent = api.icon(); b.title = cur() ? 'Salir de pantalla completa' : 'Pantalla completa'; }),
      toggle: () => {
        if (cur()) { pref(false); (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        if (!req) { api.help(); return; }
        pref(true);
        try { const r = req.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(api.help); } catch (e) { api.help(); }
      },
      help: () => modal(h('div', { class: 'box' }, h('h2', null, 'Pantalla completa'),
        h('p', null, 'Este navegador no permite la pantalla completa dentro de la página. En iPhone se consigue así:'),
        h('ol', null, h('li', null, 'Toca el botón Compartir de Safari.'), h('li', null, 'Elige «Añadir a pantalla de inicio».'), h('li', null, 'Abre el juego desde ese icono: sin barras y a toda la pantalla.')),
        btn('Entendido', () => closeModal(), 'gold'))),
    };
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, api.sync));
    document.addEventListener('pointerdown', () => { if (req && touch() && api.wanted() && pref() && !cur()) { try { const r = req.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* nada */ } } }, true);
    return api;
  })();
  // ---------------- accesibilidad: tamaño de letra y subtítulos de voces ----------------
  const FS_KEY = 'duelo.fs', SUB_KEY = 'duelo.subs';
  const fsGet = () => { const v = lsGet(FS_KEY); return v === 'l' || v === 'xl' ? v : 'n'; };
  const fsSet = v => { lsSet(FS_KEY, v); document.documentElement.dataset.fs = v; setTimeout(() => { if (topEl.style.display !== 'none') document.documentElement.style.setProperty('--gtop', topEl.offsetHeight + 'px'); }, 50); };
  const subsGet = () => lsGet(SUB_KEY) !== '0';
  const subsSet = on => lsSet(SUB_KEY, on ? '1' : '0');
  document.documentElement.dataset.fs = fsGet();
  let capEl = null, capT = 0;
  S.onVoice = card => {
    if (!subsGet() || !card) return;
    const say = card.voice && card.voice.say;
    if (capEl) capEl.remove();
    capEl = h('div', { class: 'vcap', role: 'status' }, h('b', null, card.name || ''), say ? ' — «' + say + '»' : ' (voz)');
    document.body.append(capEl); clearTimeout(capT);
    const el = capEl; capT = setTimeout(() => { el.remove(); if (capEl === el) capEl = null; }, 2800);
  };
  function soundPanel() {
    const LBL = { master: 'Volumen general', music: 'Música', ui: 'Interfaz y cartas', combat: 'Combate', voice: 'Voces y sonidos de las cartas', amb: 'Ambiente', notify: 'Avisos' };
    const rows = S.CATS.map(k => {
      const r = h('input', { type: 'range', min: 0, max: 100, value: Math.round(S.volume(k) * 100), 'aria-label': LBL[k], oninput: () => { S.setVolume(k, r.value / 100); val.textContent = r.value; }, onchange: () => S.sample(k) });
      const val = h('span', { class: 'sv' }, String(Math.round(S.volume(k) * 100)));
      return h('div', { class: 'sndrow' }, h('label', null, LBL[k]), r, val);
    });
    const tog = (label, get, set) => { const t = h('button', { class: 'btn tog' + (get() ? ' on' : ''), onclick: () => { set(!get()); t.classList.toggle('on', get()); t.textContent = label + (get() ? ': sí' : ': no'); } }, label + (get() ? ': sí' : ': no')); return t; };
    const gfx = h('select', { onchange: () => { D.Floor.setQuality(gfx.value); note.textContent = 'Se aplica al recargar la página.'; } },
      h('option', { value: 'auto' }, 'Gráficos: automático'), h('option', { value: 'low' }, 'Gráficos: bajos'), h('option', { value: 'mid' }, 'Gráficos: medios'), h('option', { value: 'high' }, 'Gráficos: altos'), h('option', { value: 'off' }, 'Gráficos: sin WebGL'));
    gfx.value = D.Floor.quality();
    const note = h('p', { class: 'sub' }, '');
    const fs = h('select', { 'aria-label': 'Tamaño de letra', onchange: () => { fsSet(fs.value); note.textContent = 'Se aplica a menús y ventanas; el tablero mantiene su tamaño.'; } },
      h('option', { value: 'n' }, 'Letra: normal'), h('option', { value: 'l' }, 'Letra: grande'), h('option', { value: 'xl' }, 'Letra: muy grande'));
    fs.value = fsGet();
    modal(h('div', { class: 'box sndbox' }, h('h2', null, 'Ajustes'), ...rows,
      h('div', { class: 'row' }, tog('Música', () => S.musicOn, v => S.setMusic(v)), tog('Efectos', () => S.sfxOn, v => S.setSfx(v)), tog('Silencio', () => S.muted, v => S.setMuted(v))),
      h('div', { class: 'row' }, tog('Efectos reducidos', rmGet, rmSet), gfx),
      h('div', { class: 'row' }, tog('Subtítulos de voces', subsGet, subsSet), fs), note, btn('Cerrar', () => closeModal(), 'ghost')));
  }

  // ---------------- menú principal ----------------
  let current = null; // partida en curso: { match, cleanup }
  function endCurrent() { if (current) { if (D.Social) D.Social.setPlaying(false); try { current.leave && current.leave(); } catch (e) { /* nada */ } try { current.match.close(); } catch (e) { /* nada */ } try { current.cleanup && current.cleanup(); } catch (e) { /* nada */ } try { current.cleanup0 && current.cleanup0(); } catch (e) { /* nada */ } try { current.tutEnd && current.tutEnd(); } catch (e) { /* nada */ } current = null; hidePreview(); } closeModal(); }

  // emblema y logo: los mismos del splash (index.html); aquí en dorado
  const EMB = '<svg class="emb" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#12080a" stroke="url(#lgG)" stroke-width="3.5"/><circle cx="50" cy="50" r="39" fill="none" stroke="url(#lgG)" stroke-width="1" stroke-dasharray="2 3"/><path d="M50 8 C58 24 74 30 74 52 C74 66 64 78 50 82 C36 78 26 66 26 52 C26 42 32 36 36 30 C36 40 42 44 46 44 C42 32 44 18 50 8 Z" fill="url(#lgR)" stroke="#ffb0a0" stroke-width="1" transform="translate(0 4)"/><path d="M50 30 C54 40 60 44 60 54 C60 62 56 68 50 70 C44 68 40 62 40 54 C40 48 44 46 44 42 C47 46 49 46 50 30Z" fill="#ffd27a" transform="translate(0 4)"/></svg>';
  const embEl = () => { const d = document.createElement('div'); d.innerHTML = EMB; return d.firstChild; };
  // las 3 novedades más recientes para la columna de la derecha del menú
  function latestNews(n) {
    const en = /^en/i.test(navigator.language || '') ? 1 : 0, out = [];
    const days = (G.CHANGELOG || []).filter(e => e.d >= '2026-10-19').slice().sort((x, y) => (x.d < y.d ? 1 : -1));
    const LB = { new: ['NUEVO', 'NEW'], chg: ['CAMBIO', 'CHANGE'], fix: ['ARREGLO', 'FIX'] };
    for (const e of days) for (const k of ['new', 'chg', 'fix']) for (const l of (e[k] || []).slice().reverse()) {
      if (!l || l.length < 4 || out.length >= n) continue;
      out.push({ k: LB[k][en], kind: k, t: l[en * 2], d: l[en * 2 + 1] });
    }
    return out;
  }
  // icono de cada categoría de novedad (nuevo = el emblema, cambio = flechas, arreglo = llave)
  const NICO = {
    new: EMB,
    chg: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18h30M30 9l9 9-9 9M40 32H10M18 23l-9 9 9 9"/></svg>',
    fix: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M30 8a10 10 0 0 0-9 14L8 35a4 4 0 0 0 5 5l13-13a10 10 0 0 0 14-9l-7 6-5-2-2-5z"/></svg>'
  };
  const nicoEl = k => { const d = document.createElement('span'); d.className = 'nico ' + k; d.innerHTML = NICO[k] || NICO.new; d.setAttribute('aria-hidden', 'true'); return d; };
  let homeKeys = false;

  function menu() {
    scr('jugar');
    endCurrent(); showBg(true);
    S.setAmbient(false); S.setTrack('menu'); sndButton(true);
    const dk = activeDeck(), bad = C.checkDeck(dk.ids), few = !C.canPlay();
    const off = !!bad || few;
    const items = [
      { t: 'Sala de espera', d: 'Juega contra la computadora o invita hasta a 3 amigos y tú decides cuándo empezar', f: lobby, off },
      { t: 'Mis mazos', d: '30 cartas, máximo 2 copias de cada una', f: deckBuilder },
      { t: 'Tienda', d: 'Gasta tus puntos en cosméticos: hologramas, reversos, tableros…', f: () => shopScreen() },
      { t: 'Ranking', d: 'Tu rango, los mejores de la temporada y cómo se sube', f: () => rankScreen() },
      { t: 'Reglas', d: 'Cómo se juega', f: rules },
      { t: 'Novedades', d: 'Lo último que se ha añadido', f: news }
    ];
    const desc = h('div', { class: 'hdesc' });
    let on = 0;
    const btns = items.map((it, i) => h('button', { class: 'menu-btn', style: '--i:' + i, disabled: !!it.off, onclick: it.f, onpointerenter: () => setOn(i), onfocus: () => setOn(i) }, it.t, (() => { const bd = badges()[{ 'Sala de espera': 'jugar', 'Tienda': 'tienda', 'Ranking': 'ranking', 'Novedades': 'novedades' }[it.t]]; return bd ? h('i', { class: 'bdg', 'aria-label': bd, title: bd }) : null; })(), h('small', null, it.d)));
    function setOn(i) {
      on = i; btns.forEach((b, j) => b.classList.toggle('on', j === i));
      const dl = h('div', { class: 'dl', style: 'min-height:24px' }, items[i].d + '.');
      desc.replaceChildren(dl, h('div', null, 'Mazo activo: ', h('b', null, dk.name)));
      desc.classList.toggle('long', items[i].d.length > 52);
    }
    setOn(Math.max(0, items.findIndex(it => !it.off)));
    const notes = [];
    if (C.test) notes.push(h('div', { class: 'hnote' }, 'MODO DE PRUEBA: mazo fijo de 30 cartas (Popeye, Creeper, monstruos «Prueba ★N», y magias y trampas «Prueba: …»), sólo contra la computadora. No se guarda nada. Para salir, abre el juego sin «?prueba».'));
    if (few) notes.push(h('div', { class: 'hnote err' }, `Todavía no hay cartas suficientes para jugar: hay ${C.all().length} y hacen falta al menos ${Math.ceil(C.DECK_SIZE / C.MAX_COPIES)} distintas para armar un mazo. Se van añadiendo de a poco; mientras tanto puedes ver las cartas en «Mis mazos».`));
    if (bad) notes.push(h('div', { class: 'hnote err' }, bad + ' Arréglalo en «Mis mazos».'));
    const u = D.Account.user;
    if (!D.Account.cloud) notes.push(h('div', { class: 'hnote' }, 'Sin conexión con la nube: tus mazos se guardan sólo en este navegador.'));
    else if (!u || u.guest) notes.push(h('div', { class: 'hnote' }, 'Invitado: sin guardar en la nube ni jugar online.'));
    const nw = latestNews(3), rs = !C.test && D.Rank.state();
    const info = C.test ? null : D.Shop.dailyInfo();
    popups();
    const hero = h('div', { class: 'hhero' }, h('img', { src: 'assets/duelo/home/bardock.webp', alt: '', draggable: 'false' }));
    const sp = document.getElementById('splash');
    const home = h('div', { class: 'home' + (sp && !sp.classList.contains('out') ? ' pre' : '') },
      hero,
      h('div', { class: 'hmain' },
        h('div', { class: 'hlist' }, ...btns, desc, ...notes),
        h('aside', { class: 'hnews' }, h('h3', null, 'NOVEDADES'),
          ...nw.map(c => h('button', { class: 'ncard', onclick: news }, nicoEl(c.kind), h('div', null, h('small', null, c.k), h('b', null, c.t), h('p', null, c.d)))),
          rs ? h('button', { class: 'hseason', onclick: () => rankScreen() }, 'TEMPORADA', h('b', null, D.Seasons.theme(D.Rank.seasonId()).name), `Termina en ${D.Rank.daysLeft()} días · Tu mejor rango: ${D.Rank.tierOf(rs.best != null ? rs.best : rs.pts).label}`) : null)),
      h('footer', { class: 'hbot' }, C.test ? h('span') : info ? h('span', null, 'RECOMPENSA DE HOY ', h('b', null, 'DISPONIBLE')) : h('span', null, 'RECOMPENSA DE HOY ', h('b', null, 'COBRADA')), h('span', { class: 'hint' }, '↑ ↓ · ENTER · ELEGIR')));
    mount(home);
    if (home.classList.contains('pre')) setTimeout(() => home.classList.remove('pre'), 4000);   // por si el splash no avisa
    if (!homeKeys) {
      homeKeys = true;
      document.addEventListener('keydown', e => {
        const hm = document.querySelector('.home .hlist'); if (!hm || document.querySelector('.modal') || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || ''))) return;
        const bs = [...hm.querySelectorAll('.menu-btn')], cur = Math.max(0, bs.findIndex(b => b.classList.contains('on')));
        const go = d => { let i = cur; for (let k = 0; k < bs.length; k++) { i = (i + d + bs.length) % bs.length; if (!bs[i].disabled) { bs[i].dispatchEvent(new Event('pointerenter')); bs[i].focus({ preventScroll: true }); S.play('hover'); return; } } };
        if (e.key === 'ArrowDown') { e.preventDefault(); go(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
        else if (e.key === 'Enter' && bs[cur] && !bs[cur].disabled && document.activeElement !== bs[cur]) { e.preventDefault(); bs[cur].click(); }
      });
    }
    if (window.DueloSplash) window.DueloSplash.done();
  }

  function rules(tab) {
    S.setTrack('menu');
    sndButton(true);
    // mini ejemplo visual: dos fichas con ATK/DEF y lo que pasa
    const mini = (n, stat, cls) => h('div', { class: 'mini ' + (cls || '') }, h('b', null, n), h('span', null, stat));
    const ex = (a, vs, b, out) => h('div', { class: 'rexample' }, h('div', { class: 'rexrow' }, a, h('i', null, vs), b), h('p', null, out));
    const TABS = [
      ['turno', 'Turno y objetivo', () => [
        h('h2', null, 'Objetivo'), h('p', null, 'Deja los Puntos de Vida (PV) del rival en 0. Empiezas con 8000. También pierdes si tienes que robar y tu mazo está vacío.'),
        ex(mini('Tú', '8000 PV'), 'vs', mini('Rival', '0 PV', 'dead'), '¡Ganas! El rival se quedó sin PV.'),
        h('h2', null, 'Un turno'),
        h('ul', null,
          h('li', null, 'Robas 1 carta (quien empieza no roba en su primer turno). El contador de «Turno» sube cuando todos han jugado (una ronda), y los efectos «durante N turnos» cuentan rondas completas. En la primera ronda nadie ataca: el primer ataque llega en la segunda. Mano inicial: 5. Al terminar, máximo 7 cartas en mano.'),
          h('li', null, 'Fase principal: invoca o coloca 1 monstruo por turno (invocación normal), activa magias, coloca magias y trampas.'),
          h('li', null, 'Monstruos de nivel 5-6 piden sacrificar 1 monstruo tuyo; nivel 7-9, 2 monstruos; nivel 10 o más, 3 monstruos. Niveles 1-4, ninguno. Las invocaciones especiales y las transformaciones no piden sacrificios.'),
          h('li', null, '«Colocar» deja el monstruo boca abajo en defensa. Al turno siguiente puedes voltearlo (queda en ataque) o cambiarle la posición.'),
          h('li', null, 'Fase de combate: cada monstruo en ataque puede atacar una vez a un monstruo rival, o directo si no tiene monstruos.'))]],
      ['combate', 'Combate', () => [
        h('h2', null, 'Combate'),
        h('ul', null,
          h('li', null, 'Ataque contra ataque: gana el mayor ATK; el perdedor se destruye y su dueño pierde la diferencia en PV. Si empatan, se destruyen los dos.'),
          h('li', null, 'Ataque contra defensa: si el ATK supera a la DEF, el defensor se destruye (sin daño). Si no, el atacante pierde la diferencia en PV.'),
          h('li', null, 'No hay ventajas de tipo: sólo cuentan el ATK y la DEF.')),
        h('h3', null, 'Ejemplos'),
        ex(mini('Tuyo', 'ATK 1800'), '⚔', mini('Rival', 'ATK 1200', 'dead'), 'Gana el tuyo. El monstruo rival se destruye y el rival pierde 600 PV (1800 − 1200).'),
        ex(mini('Tuyo', 'ATK 1000', 'dead'), '⚔', mini('Rival', 'ATK 1500'), 'Pierde el tuyo: se destruye y tú pierdes 500 PV (1500 − 1000).'),
        ex(mini('Tuyo', 'ATK 1600'), '⚔', mini('Rival', 'DEF 1200 🛡', 'dead'), 'El ATK supera a la DEF: el defensor se destruye y no hay daño en PV.'),
        ex(mini('Tuyo', 'ATK 1000', 'warn'), '⚔', mini('Rival', 'DEF 1400 🛡'), 'El ATK no supera a la DEF: no se destruye nada y tú pierdes 400 PV (1400 − 1000).'),
        ex(mini('Tuyo', 'ATK 1500'), '⚔', mini('Rival', 'sin monstruos'), 'Ataque directo: el rival pierde 1500 PV.')]],
      ['magia', 'Magias y trampas', () => [
        h('h2', null, 'Magias y trampas'),
        h('ul', null,
          h('li', null, 'Las magias se activan desde la mano o boca abajo, en tu fase principal.'),
          h('li', null, 'Las trampas se colocan boca abajo y pueden responder (ataque, magia rival, invocación) a partir del turno siguiente.'),
          h('li', null, `Cartas disponibles ahora: ${C.all().length}. Toca cualquier carta para leerla.`)),
        ex(mini('Turno 1', 'colocas una trampa 🂠'), '→', mini('Turno 2 del rival', 'ataca', 'warn'), 'La trampa ya puede responder al ataque del rival.')]],
      ['multi', '3 o 4 jugadores', () => [
        h('h2', null, '3 o 4 jugadores'),
        h('ul', null,
          h('li', null, 'Todos contra todos (3 o 4): cada uno tiene su campo y sus 8000 PV. Se juega por turnos en orden; quien llega a 0 PV (o no puede robar) queda fuera y su mano y su campo van al cementerio. Gana el último en pie.'),
          h('li', null, '2 contra 2 (4 jugadores): los asientos 1.º y 3.º juegan contra el 2.º y el 4.º. Cada uno conserva sus PV; el equipo gana cuando caen los dos rivales. Nunca se ataca ni se apunta a un compañero.'),
          h('li', null, 'Al atacar eliges a quién. Un monstruo sólo ataca directo al rival que no tiene monstruos. En la primera ronda nadie ataca.'),
          h('li', null, 'Trampas: si te atacan, sólo puede responder el atacado. Con una magia o una invocación, pueden responder todos los rivales de quien actúa, por orden de turno.'),
          h('li', null, 'Magias con rival (destruir un monstruo, destruir una magia/trampa, daño directo) te dejan elegir el rival. «Destruir todos los monstruos» afecta a todos, también a los tuyos y a los de tu equipo.'),
          h('li', null, 'En el tablero ves los campos de todos a la vez; para atacar o elegir objetivo, toca directamente en el campo del rival. Si te sacan del duelo puedes seguir mirando hasta el final.'))]]
    ];
    const body = h('div', { class: 'panel rbody' });
    const bar = h('div', { class: 'rtabs', role: 'tablist' });
    const bs = TABS.map(t => h('button', { class: 'rtab', role: 'tab', onclick: () => pick(t[0]) }, t[1]));
    bs.forEach(b => bar.append(b));
    function pick(id) {
      const i = Math.max(0, TABS.findIndex(t => t[0] === id));
      bs.forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      body.replaceChildren(...TABS[i][2]());
      S.play('hover');
    }
    mount(h('div', { class: 'scr rules' },
      h('button', { class: 'back', onclick: menu }, '← Menú'),
      h('h1', null, 'Reglas'),
      bar, body,
      h('div', { class: 'row' }, btn('Ver el tutorial en una partida', () => { try { localStorage.removeItem(TUT_KEY); } catch (e) { /* nada */ } setupAI(); }, 'ghost'))));
    pick(typeof tab === 'string' ? tab : 'turno');
  }

  // ---------------- contra la computadora ----------------
  // formatos de duelo: id → { n asientos, mode, título, descripción }
  const FORMATS = {
    duel: { n: 2, mode: 'duel', t: '1 contra 1', d: 'El duelo de siempre.' },
    ffa3: { n: 3, mode: 'ffa', t: 'Todos contra todos · 3', d: 'Tres jugadores, cada uno por su cuenta. Gana el último en pie.' },
    ffa4: { n: 4, mode: 'ffa', t: 'Todos contra todos · 4', d: 'Cuatro jugadores, cada uno por su cuenta. Gana el último en pie.' },
    teams: { n: 4, mode: 'teams', t: '2 contra 2', d: 'Dos equipos de dos. Gana el equipo que deje sin PV a los dos rivales.' }
  };
  const fmtSelect = (onchange, aiNote) => {
    const sel = h('select', { onchange: () => { note.textContent = FORMATS[sel.value].d + (aiNote ? aiNote(sel.value) : ''); if (onchange) onchange(sel.value); } },
      Object.keys(FORMATS).map(k => h('option', { value: k }, FORMATS[k].t)));
    const note = h('div', { class: 'sub' }, FORMATS.duel.d);
    return { sel, note };
  };
  function setupAI() {
    S.setTrack('prep');
    const lvl = h('select', null, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'easy' }, 'Fácil'));
    const rt = h('select', null, h('option', { value: '' }, 'Al azar'), C.PRESET_TYPES.map(t => h('option', { value: t }, 'Mazo de ' + C.TYPE_ES[t])));
    const rtLabel = h('label', null, 'Mazo rival ', rt);
    const f = fmtSelect(k => { rtLabel.style.display = k === 'duel' ? '' : 'none'; }, k => k === 'teams' ? ' Tu compañero y los dos rivales los juega la computadora.' : k === 'duel' ? '' : ' Los rivales los juega la computadora, cada uno con un mazo distinto.');
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Contra la computadora'),
      h('div', { class: 'panel' }, h('label', null, 'Formato ', f.sel), f.note, h('label', null, 'Dificultad ', lvl), rtLabel,
        h('div', { class: 'sub' }, 'Tu mazo: ' + activeDeck().name),
        btn('¡A duelear!', () => startAI({ level: lvl.value, rival: rt.value, fmt: f.sel.value }), 'gold'))));
  }
  function startAI(o) {
    const fm = FORMATS[o.fmt || 'duel'];
    let match;
    if (fm.n === 2) {
      const type = o.rival || C.PRESET_TYPES[Math.floor(Math.random() * C.PRESET_TYPES.length)];
      match = D.Match.local({ deck: activeDeck().ids.slice(), aiDeck: C.presetDeck(type), aiLevel: o.level, name: 'Tú', aiName: 'Computadora' + (type ? ' (' + C.TYPE_ES[type] + ')' : '') });
    } else match = D.Match.local({ deck: activeDeck().ids.slice(), n: fm.n, mode: fm.mode, aiLevel: o.level, name: 'Tú', delay: 600 });
    game(match, { rematch: () => startAI(o) });
  }

  // ---------------- online ----------------
  const LOSTMSG = 'Vuestras conexiones no logran verse directamente (pasa con algunos Wi‑Fi). Probad con datos móviles en uno de los dos.';

  /** Casilla de un jugador en la sala de espera (estilo lobby): avatar, nombre y estado. */
  const lobbySlot = (o) => h('div', { class: 'lcard ' + (o.cls || '') },
    h('div', { class: 'lav' }, o.av || '＋'), h('b', null, o.name || ''), o.sub ? h('small', null, o.sub) : null, o.tag ? h('span', { class: 'ltag' }, o.tag) : null, o.extra || null);

  let lobbyApi = null;
  /** SALA DE ESPERA (única entrada para jugar: contra la computadora o con amigos, sin códigos).
   *  Sola, «Empezar» juega contra la computadora con el formato elegido. Al invitar amigos se crea la sala online
   *  (sólo entonces) y el formato se ajusta solo (1 amigo → 1 contra 1, 2 → 3 jugadores, 3 → 4), salvo que lo elijas tú.
   *  Los asientos que queden libres los juega la computadora. */
  async function lobby(opts) {
    opts = opts || {};
    S.setTrack('prep'); scr('lobby');
    let key = 'duel', picked = false, room = null, match = null, creating = null, onlineErr = '';
    const fm = () => FORMATS[key];
    const status = h('div', { class: 'msg' }), fmtEl = h('div', { class: 'lfmt' }), noteEl = h('p', { class: 'sub', style: 'text-align:center;margin:4px 0' });
    const slotsEl = h('div', { class: 'lslots' }), lvl = h('select', null, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'easy' }, 'Fácil'));
    const lvlRow = h('label', { class: 'lvl' }, 'Dificultad de la computadora ', lvl);
    const startBtn = btn('Empezar', () => start(), 'gold big');
    const conn = new Map(), byUid = new Map(), queued = [];
    const guestsNow = () => (match ? match.lobby().filter(x => !x.left) : []);
    const canStart = () => { const gs = guestsNow(); return gs.length === 0 || (gs.length <= fm().n - 1 && gs.every(g => g.ready)); };
    function start() {
      const gs = guestsNow();
      if (!gs.length) { startAI({ level: lvl.value, rival: '', fmt: key }); return; }
      if (canStart()) match.begin();
    }
    mount(h('div', { class: 'scr lobby' }, h('button', { class: 'back', onclick: menu }, '← Salir de la sala'), h('h1', null, 'Sala de espera'),
      h('div', { class: 'lhead' }, btn('👥 Invitar amigos', () => api.invite().then(() => { if (D.FriendsUI && !D.FriendsUI.isOpen) D.FriendsUI.toggle(); }), 'gold')),
      fmtEl, noteEl, slotsEl, lvlRow, status, h('div', { class: 'row lact' }, startBtn),
      h('p', { class: 'sub', style: 'text-align:center' }, 'Juega solo contra la computadora o invita a tus amigos (hasta 3): el formato se ajusta solo según cuántos entren. Tú decides cuándo empezar; los asientos libres los juega la computadora.')));

    function render() {
      const gs = guestsNow();
      if (!picked) key = gs.length >= 3 ? 'ffa4' : gs.length === 2 ? 'ffa3' : gs.length === 1 ? 'duel' : key;
      if (match && (match.n !== fm().n || match.mode !== fm().mode)) match.setFormat(fm().n, fm().mode);
      fmtEl.replaceChildren(...Object.keys(FORMATS).map(k => h('button', { class: 'lfb' + (k === key ? ' on' : ''), onclick: () => { picked = true; key = k; render(); } }, FORMATS[k].t)));
      noteEl.textContent = fm().d;
      const cards = [lobbySlot({ cls: 'me', av: '🧑', name: 'Tú', sub: activeDeck().name, tag: 'Anfitrión' })];
      for (let i = 0; i < fm().n - 1; i++) {
        const g = gs[i];
        if (!g) { cards.push(h('button', { class: 'lcard empty', onclick: () => api.invite().then(() => { if (D.FriendsUI && !D.FriendsUI.isOpen) D.FriendsUI.toggle(); }) }, h('div', { class: 'lav' }, '＋'), h('b', null, 'Computadora'), h('small', null, 'Toca para invitar a un amigo'))); continue; }
        const c = conn.get(g.idx) || {};
        const st = !g.ready ? (c.failed ? 'Sin conexión directa' : c.state === 'direct' ? 'Recibiendo mazo…' : 'Conectando…') : 'Listo';
        let extra = null;
        if (fm().mode === 'teams') {
          const sel = h('select', { onchange: () => { match.setPref(g.idx, sel.value); render(); } }, h('option', { value: 'ally' }, 'Mi compañero'), h('option', { value: 'foe' }, 'Rival'));
          sel.value = g.pref; extra = sel;
        }
        cards.push(lobbySlot({ cls: g.ready ? 'ok' : c.failed ? 'bad' : '', av: (g.name || '?').slice(0, 1).toUpperCase(), name: g.name, sub: st, extra }));
      }
      slotsEl.replaceChildren(...cards);
      const over = gs.length > fm().n - 1, wait = gs.some(g => !g.ready), failed = gs.some(g => (conn.get(g.idx) || {}).failed && !g.ready);
      lvlRow.style.display = gs.length ? 'none' : '';
      startBtn.disabled = !canStart() || over;
      startBtn.textContent = !gs.length ? 'Jugar contra la computadora' : gs.length + 1 >= fm().n ? 'Empezar el duelo' : 'Empezar (la computadora llena los libres)';
      if (over) { status.className = 'msg err'; status.textContent = `Hay ${gs.length + 1} jugadores y este formato es de ${fm().n}: elige uno más grande.`; }
      else if (failed) { status.className = 'msg err'; status.textContent = LOSTMSG; }
      else if (onlineErr && !gs.length) { status.className = 'msg err'; status.textContent = onlineErr; }
      else if (creating && !match) { status.className = 'msg'; status.textContent = 'Preparando la sala para tus amigos…'; }
      else if (!gs.length) { status.className = 'msg'; status.textContent = match ? 'Esperando a tus amigos… o pulsa para jugar ya contra la computadora.' : 'Elige el formato y pulsa para jugar contra la computadora, o invita a tus amigos.'; }
      else if (wait) { status.className = 'msg'; status.textContent = 'Conectando con los que acaban de entrar…'; }
      else { status.className = 'msg ok'; status.textContent = `${gs.length + 1} de ${fm().n} en la sala. Pulsa «Empezar» cuando quieras.`; }
    }
    function onJoin(uid, name, tr) {
      if (!match) { queued.push([uid, name, tr]); return; }
      const idx = match.addGuest(tr);
      byUid.set(uid, idx);
      const c = { state: 'connecting', failed: false, timer: 0 };
      c.timer = setTimeout(() => { if (c.state !== 'direct') { c.failed = true; render(); } }, 20000);
      conn.set(idx, c);
      render();
    }
    /** Crea la sala online (una sola vez) cuando haces falta para invitar. */
    function ensureRoom() {
      if (match) return Promise.resolve(true);
      if (creating) return creating;
      creating = (async () => {
        try {
          const me = await D.Online.init();
          if (!me) throw new Error(D.Account.cloud ? 'Para invitar amigos necesitas una cuenta (entra o créala, es gratis). Como invitado sólo puedes jugar contra la computadora.' : 'Invitar amigos necesita la versión publicada del juego.');
          room = await D.Online.createRoom({
            seats: 4,
            onJoin,
            onLeave: uid => { const idx = byUid.get(uid); if (idx != null) { const c = conn.get(idx); if (c) clearTimeout(c.timer); } render(); },
            onState: (uid, st) => {
              const idx = byUid.get(uid), c = conn.get(idx);
              if (!c) return;
              c.state = st;
              if (st === 'direct') { clearTimeout(c.timer); c.failed = false; } else if (st === 'failed') c.failed = true;
              render();
            }
          });
        } catch (e) { onlineErr = e.message; creating = null; render(); return false; }
        if (curScreen !== 'lobby') { room.close(); creating = null; return false; }        // saliste mientras se creaba
        onlineErr = '';
        if (D.FriendsUI) D.FriendsUI.roomOpened(room.code);
        match = D.Match.host({ cos: D.Shop.mine(), rk: (D.Rank.state() || {}).pts, deck: activeDeck().ids.slice(), name: room.name, n: fm().n, mode: fm().mode, autoStart: false });
        match.onStatus(s => {
          if (s.k === 'rejected') { status.className = 'msg err'; status.textContent = 'El mazo de tu amigo no es válido: ' + s.why; }
          else if (s.k === 'started') room.lock();
          else render();
        });
        const myRoom = room;
        game(match, { cleanup: () => { conn.forEach(c => clearTimeout(c.timer)); myRoom.close(); if (D.FriendsUI) D.FriendsUI.roomClosed(); }, online: true, wait: true });
        queued.splice(0).forEach(q => onJoin(...q));
        render();
        return true;
      })();
      render();
      return creating;
    }
    const api = lobbyApi = { invite: ensureRoom };
    render();
    if (opts.invite) ensureRoom();
  }

  async function joinRoom(code, errBox) {
    S.setTrack('prep');
    errBox.replaceChildren(h('div', { class: 'msg' }, 'Entrando…'));
    let room = null, failTimer = 0, box = errBox, match = null;
    const put = (cls, text) => box.replaceChildren(h('div', { class: cls }, text));
    try {
      room = await D.Online.joinRoom(code, {
        onState: st => { if (st === 'direct') clearTimeout(failTimer); else if (st === 'failed') put('msg err', LOSTMSG); },
        onClosed: () => { if (!current || !current.started) put('msg err', 'El anfitrión cerró la sala.'); },
        onKicked: () => { if (!current || !current.started) { put('msg err', 'La sala se llenó antes de que entraras.'); menu(); } }
      });
    } catch (e) { errBox.replaceChildren(h('div', { class: 'msg err' }, e.message === 'login' ? 'Inicia sesión primero.' : e.message)); return; }
    // sala de espera del invitado: ve quién hay y el formato; el anfitrión decide cuándo empezar
    const slotsEl = h('div', { class: 'lslots' }), info = h('div'), titleEl = h('p', { class: 'sub', style: 'text-align:center' }, 'Conectando con el anfitrión…');
    const leave = () => { clearTimeout(failTimer); if (match) match.close(); room.close(); menu(); };
    scr('online');
    mount(h('div', { class: 'scr lobby' }, h('button', { class: 'back', onclick: leave }, '← Salir de la sala'), h('h1', null, 'Sala de espera'), titleEl, slotsEl, info,
      h('p', { class: 'sub', style: 'text-align:center' }, 'Cuando el anfitrión empiece el duelo entrarás solo.')));
    box = info;
    put('msg ok', 'Dentro de la sala. Conectando con el anfitrión…');
    slotsEl.replaceChildren(lobbySlot({ cls: 'me', av: (room.name || '?').slice(0, 1).toUpperCase(), name: room.name, sub: 'Tú' }));
    failTimer = setTimeout(() => put('msg err', LOSTMSG), 20000);
    match = D.Match.guest({ cos: D.Shop.mine(), rk: (D.Rank.state() || {}).pts, deck: activeDeck().ids.slice(), name: room.name, transport: room.transport });
    match.onStatus(s => {
      if (s.k === 'rejected') put('msg err', s.why && /empez/.test(s.why) ? s.why : 'Tu mazo no es válido: ' + s.why);
      else if (s.k === 'lobby') {
        const f = Object.keys(FORMATS).map(k => FORMATS[k]).find(x => x.n === s.n && x.mode === s.mode);
        titleEl.textContent = (f ? f.t : 'Duelo') + ' · ' + (s.players.length + 1) + ' de ' + s.n + ' en la sala';
        const cards = [lobbySlot({ cls: 'ok', av: (s.host || '?').slice(0, 1).toUpperCase(), name: s.host, sub: 'Listo', tag: 'Anfitrión' })];
        s.players.forEach(p => cards.push(lobbySlot({ cls: (p.name === room.name ? 'me ' : '') + (p.ready ? 'ok' : ''), av: p.name.slice(0, 1).toUpperCase(), name: p.name + (p.name === room.name ? ' (tú)' : ''), sub: p.ready ? 'Listo' : 'Conectando…' })));
        for (let i = s.players.length + 1; i < s.n; i++) cards.push(h('div', { class: 'lcard empty' }, h('div', { class: 'lav' }, '＋'), h('b', null, 'Libre'), h('small', null, 'La computadora si nadie entra')));
        slotsEl.replaceChildren(...cards);
        put('msg ok', 'Esperando a que el anfitrión empiece…');
      }
    });
    game(match, { cleanup: () => { clearTimeout(failTimer); room.close(); }, online: true, wait: true });
  }

  // ---------------- mazos: primero la lista de mazos y luego el editor (arrastrar y soltar en escritorio) ----------------
  const MAX_DECKS = 6;
  const myDecks = () => C.test ? [TESTDK] : store.decks;
  const countOf = ids => { const n = {}; ids.forEach(i => { n[i] = (n[i] || 0) + 1; }); return n; };
  const KIND_ORDER = { monster: 0, spell: 1, trap: 2 };
  const byKindLevel = (a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || ((a.level || 0) - (b.level || 0)) || a.name.localeCompare(b.name);
  /** Miniatura de una carta (con la skin que tenga puesta). */
  function thumbEl(card) {
    const sk = card.kind === 'monster' && D.Shop.skinOf(card.id);
    const el = h('div', { class: 'tmb ' + card.kind }, card.img ? h('img', { class: 'cimg', src: (card.kind === 'monster' && myArt(card.id)) || card.img, alt: card.name, draggable: 'false' }) : h('span', { class: 'ico' }, card.icon || '?'));
    if (sk) el.dataset.sk = D.Shop.slug(sk.id);
    return el;
  }
  const deckInfo = ids => {
    const cs = ids.map(i => C.get(i)).filter(Boolean), bad = C.checkDeck(ids);
    return { n: ids.length, bad, mon: cs.filter(c => c.kind === 'monster').length, spl: cs.filter(c => c.kind === 'spell').length, trp: cs.filter(c => c.kind === 'trap').length };
  };

  /** Lista de mazos (entrada): una tarjeta por mazo; Editar abre el editor. */
  function deckBuilder() {
    scr('mazos');
    endCurrent(); S.setTrack('prep');
    const decks = myDecks();
    const again = () => deckBuilder();
    const rename = i => { const d = decks[i], nm = prompt('Nombre del mazo', d.name); if (nm) { d.name = nm.trim().slice(0, 20) || d.name; save(); again(); } };
    const copy = i => { if (decks.length >= MAX_DECKS) { alert('Máximo ' + MAX_DECKS + ' mazos.'); return; } decks.push({ name: (decks[i].name + ' 2').slice(0, 20), ids: decks[i].ids.slice() }); save(); again(); };
    const del = i => {
      if (decks.length <= 1) { alert('Tienes que conservar al menos un mazo.'); return; }
      if (!confirm('¿Borrar «' + decks[i].name + '»?')) return;
      decks.splice(i, 1); if (store.active === i) store.active = 0; else if (store.active > i) store.active--; save(); closeModal(true); again();
    };
    const use = i => { store.active = i; save(); S.play('confirm'); again(); };
    const more = i => modal(h('div', { class: 'box' }, h('h2', null, decks[i].name),
      btn('Renombrar', () => { closeModal(true); rename(i); }, 'ghost'), btn('Copiar', () => { closeModal(true); copy(i); }, 'ghost'),
      i === store.active ? null : btn('Usar para jugar', () => { closeModal(true); use(i); }, 'gold'),
      btn('Borrar', () => del(i), 'red'), btn('Cerrar', closeModal, 'ghost')));
    const create = ids => { decks.push({ name: 'Mazo ' + (decks.length + 1), ids }); save(); closeModal(true); deckEditor(decks.length - 1); };
    const newDeck = () => {
      if (decks.length >= MAX_DECKS) { alert('Máximo ' + MAX_DECKS + ' mazos.'); return; }
      modal(h('div', { class: 'box' }, h('h2', null, 'Nuevo mazo'),
        btn('Mazo vacío', () => create([]), 'gold'), btn('Copia del mazo activo', () => create(activeDeck().ids.slice()), 'ghost'),
        ...C.PRESET_TYPES.map(t => btn('Mazo de estreno · tipo ' + C.TYPE_ES[t], () => { decks.push({ name: C.TYPE_ES[t] + ' ' + (decks.length + 1), ids: C.presetDeck(t) }); save(); closeModal(true); deckEditor(decks.length - 1); }, 'ghost')),
        btn('Cancelar', closeModal, 'ghost')));
    };
    const tile = (d, i) => {
      const inf = deckInfo(d.ids), act = !C.test && i === store.active;
      const top = [...new Set(d.ids)].map(id => C.get(id)).filter(Boolean).sort((x, y) => (KIND_ORDER[x.kind] - KIND_ORDER[y.kind]) || ((y.level || 0) - (x.level || 0))).slice(0, 3);
      const fan = h('div', { class: 'dkfan' }, top.length ? top.map((c, k) => h('div', { class: 'fc fc' + k + (top.length === 1 ? ' solo' : '') }, thumbEl(c))) : [0, 1, 2].map(k => h('div', { class: 'fc fc' + k + ' e' }, '?')));
      return h('div', { class: 'panel dktile' + (act ? ' act' : '') },
        act ? h('span', { class: 'dktag' }, 'MAZO ACTIVO') : null, fan,
        h('div', { class: 'dkrow' }, h('b', null, d.name), h('span', { class: 'sub' }, `${inf.n} / ${C.DECK_SIZE}`)),
        h('div', { class: 'dkst ' + (inf.bad ? 'bad' : 'ok') }, inf.bad || 'Mazo válido'),
        h('div', { class: 'sub' }, `${inf.mon} personajes · ${inf.spl} magias` + (inf.trp ? ` · ${inf.trp} trampas` : '')),
        h('div', { class: 'row dkact' }, btn(C.test ? 'Ver' : 'Editar', () => deckEditor(i), 'gold sm'),
          C.test ? null : (act ? null : btn('Usar para jugar', () => use(i), 'ghost sm')),
          C.test ? null : btn('Copiar', () => copy(i), 'ghost sm'), C.test ? null : h('button', { class: 'btn ghost sm', 'aria-label': 'Más opciones', onclick: () => more(i) }, '⋯')));
    };
    mount(h('div', { class: 'scr', style: 'max-width:1100px' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Mis mazos'),
      h('p', { class: 'sub' }, C.test ? 'Modo de prueba: el mazo es fijo.' : `Elige un mazo para editarlo. El mazo activo es el que usas al jugar. Hasta ${MAX_DECKS} mazos.`),
      h('div', { class: 'dkgrid' }, decks.map(tile),
        C.test || decks.length >= MAX_DECKS ? null : h('button', { class: 'dknew', onclick: newDeck }, h('span', { class: 'plus' }, '+'), 'Nuevo mazo', h('small', null, 'Vacío, o a partir de uno que ya tengas')))));
  }

  /** Editor de un mazo: colección al centro, detalle de la carta a la derecha, tu mazo abajo. Escritorio: arrastrar y soltar. Móvil: botones − / +. */
  function deckEditor(idx) {
    scr('mazos');
    endCurrent(); S.setTrack('prep');
    const ro = !!C.test, decks = myDecks();
    idx = Math.max(0, Math.min(idx | 0, decks.length - 1));
    const dk = decks[idx];
    let q = '', kind = 'all', type = '', shown = 60, sel = null, flash = '', flashT = 0, noClick = false;
    const narrow = () => window.matchMedia && window.matchMedia('(max-width: 860px)').matches;
    const root = h('div', { class: 'scr dked', 'data-tab': 'pool' });
    const leftEl = h('div', { class: 'panel dkleft' }), poolEl = h('div', { class: 'dkpool' }), sideEl = h('div', { class: 'panel dkside' });
    const stripEl = h('div', { class: 'dkstrip' }), listEl = h('div', { class: 'dkpool dklist' }), statEl = h('div', { class: 'dkbar' }), statEl2 = h('div', { class: 'dkbar2' });
    const tabPool = h('button', { class: 'on', onclick: () => tab('pool') }, 'Colección'), tabDeck = h('button', { onclick: () => tab('deck') }, 'Tu mazo');
    function tab(t) { root.dataset.tab = t; tabPool.className = t === 'pool' ? 'on' : ''; tabDeck.className = t === 'deck' ? 'on' : ''; }

    const copies = id => dk.ids.filter(x => x === id).length;
    function say(msg) { flash = msg; clearTimeout(flashT); flashT = setTimeout(() => { flash = ''; renderStatus(); }, 1800); renderStatus(); }
    function add(id) {
      if (ro) { say('Modo de prueba: el mazo es fijo'); return false; }
      if (dk.ids.length >= C.DECK_SIZE) { S.play('error'); say(`El mazo ya tiene ${C.DECK_SIZE} cartas: quita una primero`); return false; }
      if (copies(id) >= C.MAX_COPIES) { S.play('error'); say(`Máximo ${C.MAX_COPIES} copias de cada carta`); return false; }
      dk.ids.push(id); save(); S.play('select'); renderAll(); return true;
    }
    function remove(id) {
      if (ro) { say('Modo de prueba: el mazo es fijo'); return false; }
      const i = dk.ids.indexOf(id); if (i < 0) return false;
      dk.ids.splice(i, 1); save(); S.play('close'); renderAll(); return true;
    }
    function pick(id) {
      if (noClick) return;
      sel = id; renderSide(); renderPool(); renderDeck();
      if (narrow()) cardModal(C.get(id));
    }

    /** Skins de ilustración de ESTE personaje (Cofre de skins) y efectos de las cajas que tengo, para ponérselos. */
    function skinPicker(card, again) {
      const SH = D.Shop, mine = SH.skinsFor(card.id);      // los efectos son de un personaje concreto
      if (card.kind !== 'monster' || !card.img) return null;
      const redo = () => { S.play('select'); again(); renderPool(); renderDeck(); };
      const box = h('div', null);
      const arts = SH.artsFor(card.id);
      if (arts.length) {             // otra ilustración para esta carta: sólo las que tengo se pueden poner
        const cur = SH.artOf(card.id), row = h('div', { class: 'skpick si' }, h('b', null, 'Skin'));
        const opt = (label, it) => h('button', { class: (it ? cur && cur.id === it.id : !cur) ? 'on' : '', onclick: () => { SH.setArt(card.id, it ? it.id : null); redo(); } }, label);
        row.append(opt('Original', null), ...arts.map(it => SH.owns(it.id) ? opt(it.name, it) : h('button', { class: 'lock', disabled: true, title: 'Sale en el Cofre de skins (Cajas)' }, '🔒 ' + it.name)));
        if (!arts.some(it => SH.owns(it.id))) row.append(h('small', { class: 'sub' }, 'Te faltan: salen en el Cofre de skins (Tienda → Cajas), todas con la misma probabilidad.'));
        box.append(row);
      }
      const cur = SH.skinOf(card.id), row = h('div', { class: 'skpick' }, h('b', null, 'Efecto'));
      if (!mine.length) { row.append(h('small', { class: 'sub' }, 'Este personaje aún no tiene efectos. Salen en las cajas (Tienda → Cajas) y cada uno es para un personaje concreto.')); box.append(row); return box; }
      const opt = (label, it) => h('button', { class: (it ? 'r-' + it.rar : '') + ((it ? cur && cur.id === it.id : !cur) ? ' on' : ''), onclick: () => { SH.setSkin(card.id, it ? it.id : null); redo(); } }, label);
      row.append(opt('Normal', null), ...mine.map(it => opt(it.name, it)));
      box.append(row);
      return box;
    }
    /** Ventana de una carta (móvil): detalle, skin y botones de añadir y quitar. */
    function cardModal(card) {
      const n = copies(card.id);
      modal(h('div', { class: 'box' }, detailBox(card, skinPicker(card, () => cardModal(card))),
        h('div', { class: 'dkcnt' }, 'En el mazo: ', h('b', null, `${n} / ${C.MAX_COPIES}`)),
        h('div', { class: 'row' }, btn('Quitar una', () => { remove(card.id); cardModal(card); }, 'ghost'), btn('Añadir', () => { add(card.id); cardModal(card); }, 'gold')),
        btn('Cerrar', closeModal, 'ghost')));
    }

    // ---- arrastrar y soltar (ratón o lápiz; en táctil se usan los botones − / +) ----
    function drag(el, id, from) {
      el.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch' || e.button !== 0 || ro) return;
        const sx = e.clientX, sy = e.clientY; let ghost = null, over = null;
        const move = ev => {
          if (!ghost) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
            ghost = h('div', { class: 'dgh' }, thumbEl(C.get(id))); document.body.append(ghost);
            document.body.dataset.drag = from; noClick = true;
          }
          ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
          const t = document.elementFromPoint(ev.clientX, ev.clientY), z = t && t.closest ? t.closest('[data-drop]') : null;
          if (z !== over) { if (over) over.classList.remove('over'); over = z; if (over) over.classList.add('over'); }
        };
        const up = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          if (!ghost) return;
          ghost.remove(); delete document.body.dataset.drag;
          const zone = over && over.dataset.drop; if (over) over.classList.remove('over');
          setTimeout(() => { noClick = false; }, 0);
          if (from === 'pool' && zone === 'deck') add(id);
          else if (from === 'deck' && zone === 'pool') remove(id);
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      });
    }

    // ---- dibujo ----
    function poolCard(c) {
      const n = copies(c.id);
      const el = h('div', { class: 'mcard' + (n ? ' in' : '') + (sel === c.id ? ' sel' : ''), 'data-did': c.id, onclick: () => pick(c.id), ondblclick: () => { if (!narrow()) add(c.id); } },
        h('div', { class: 'im' }, thumbEl(c)), n ? h('span', { class: 'bd' }, '×' + n) : null,
        h('div', { class: 'nm' }, c.name),
        h('div', { class: 'mt' }, c.kind === 'monster' ? `Nv ${c.level} · ${c.atk}/${c.def}` : c.kind === 'spell' ? 'Magia' : 'Trampa'),
        h('div', { class: 'stp' }, h('button', { 'aria-label': 'Quitar una', onclick: e => { e.stopPropagation(); remove(c.id); } }, '−'), h('b', null, String(n)), h('button', { class: 'p', 'aria-label': 'Añadir una', onclick: e => { e.stopPropagation(); add(c.id); } }, '+')));
      drag(el, c.id, 'pool');
      return el;
    }
    function renderPool() {
      const ql = q.trim().toLowerCase();
      let list = C.all().filter(c => (kind === 'all' || c.kind === kind) && (!type || (c.types && c.types.includes(type))) && (!ql || c.name.toLowerCase().includes(ql)));
      const total = list.length; list = list.slice(0, shown);
      poolEl.replaceChildren(...list.map(poolCard), ...(total > shown ? [btn(`Ver más (${total - shown})`, () => { shown += 80; renderPool(); }, 'ghost')] : []), ...(!total ? [h('p', { class: 'sub' }, 'No hay cartas con ese filtro.')] : []));
    }
    function renderDeck() {
      const cs = dk.ids.map(i => C.get(i)).filter(Boolean).sort(byKindLevel);
      stripEl.replaceChildren(...cs.map(c => { const el = h('div', { class: 'dk' + (sel === c.id ? ' sel' : ''), 'data-did': c.id, title: c.name, onclick: () => pick(c.id), ondblclick: () => { if (!narrow()) remove(c.id); } }, thumbEl(c)); drag(el, c.id, 'deck'); return el; }),
        ...Array.from({ length: Math.max(0, C.DECK_SIZE - cs.length) }, () => h('div', { class: 'dk empty' }, '+')));
      const uniq = [...new Set(dk.ids)].map(i => C.get(i)).filter(Boolean).sort(byKindLevel);
      listEl.replaceChildren(...(uniq.length ? uniq.map(poolCard) : [h('p', { class: 'sub' }, 'Todavía no hay cartas: ve a «Colección» y añade con +.')]));
    }
    function renderStatus() {
      const inf = deckInfo(dk.ids), full = inf.n === C.DECK_SIZE;
      const txt = h('span', { class: 'dkst ' + (inf.bad ? 'bad' : 'ok') }, flash || (inf.bad || 'Mazo válido · listo para jugar'));
      const cnt = h('b', { class: full && !inf.bad ? 'ok' : '' }, `${inf.n} / ${C.DECK_SIZE}`);
      statEl.replaceChildren(h('b', { class: 'gold' }, 'Tu mazo'), cnt, txt, h('span', { class: 'sub' }, `${inf.mon} personajes · ${inf.spl} magias` + (inf.trp ? ` · ${inf.trp} trampas` : '')), h('span', { class: 'sub hint' }, ro ? '' : 'Arrastra cartas aquí · doble clic para quitar'));
      statEl2.replaceChildren(h('div', null, h('b', { class: 'big ' + (inf.bad ? 'bad' : 'ok') }, `${inf.n} / ${C.DECK_SIZE}`), h('div', { class: 'sub' }, flash || (inf.bad || 'Mazo válido · se guarda solo'))));
      tabDeck.textContent = `Tu mazo · ${inf.n}`;
    }
    function renderSide() {
      const card = sel && C.get(sel);
      if (!card) { sideEl.replaceChildren(h('h2', null, 'Carta seleccionada'), h('p', { class: 'sub' }, 'Toca una carta para ver su habilidad y ponerle una skin. Arrastra las cartas al mazo de abajo, o usa los botones − / +.')); return; }
      const n = copies(card.id);
      sideEl.replaceChildren(h('h2', null, 'Carta seleccionada'), detailBox(card, skinPicker(card, renderSide)),
        h('div', { class: 'dkcnt' }, 'En el mazo: ', h('b', null, `${n} / ${C.MAX_COPIES}`)),
        h('div', { class: 'row' }, btn('Quitar una', () => remove(card.id), 'ghost'), btn(n >= C.MAX_COPIES ? 'Máximo' : 'Añadir', () => add(card.id), n >= C.MAX_COPIES ? 'ghost' : 'gold')));
    }
    function renderLeft() {
      leftEl.replaceChildren(h('h2', null, 'Mazos'),
        ...decks.map((d, i) => h('button', { class: 'dkl' + (i === idx ? ' on' : ''), onclick: () => { if (i !== idx) deckEditor(i); } }, h('span', null, d.name), h('b', { class: deckInfo(d.ids).bad ? 'bad' : 'ok' }, String(d.ids.length)))),
        ro ? null : h('div', { class: 'dkmore' },
          btn('+ Nuevo mazo', () => { if (decks.length >= MAX_DECKS) { alert('Máximo ' + MAX_DECKS + ' mazos.'); return; } decks.push({ name: 'Mazo ' + (decks.length + 1), ids: [] }); save(); deckEditor(decks.length - 1); }, 'ghost sm'),
          btn('Renombrar', () => { const nm = prompt('Nombre del mazo', dk.name); if (nm) { dk.name = nm.trim().slice(0, 20) || dk.name; save(); renderLeft(); } }, 'ghost sm'),
          btn('Copiar', () => { if (decks.length >= MAX_DECKS) { alert('Máximo ' + MAX_DECKS + ' mazos.'); return; } decks.push({ name: (dk.name + ' 2').slice(0, 20), ids: dk.ids.slice() }); save(); deckEditor(decks.length - 1); }, 'ghost sm'),
          btn('Borrar', () => { if (decks.length > 1 && confirm('¿Borrar «' + dk.name + '»?')) { decks.splice(idx, 1); if (store.active === idx) store.active = 0; else if (store.active > idx) store.active--; save(); deckEditor(0); } }, 'red sm'),
          idx === store.active ? h('div', { class: 'dkact2' }, 'Mazo activo (el que usas al jugar)') : btn('Usar para jugar', () => { store.active = idx; save(); S.play('confirm'); renderLeft(); }, 'gold sm')));
    }
    function renderAll() { renderLeft(); renderPool(); renderDeck(); renderStatus(); renderSide(); }

    const search = h('input', { type: 'search', placeholder: 'Buscar carta…', oninput: () => { q = search.value; shown = 60; renderPool(); } });
    const kindSel = h('select', { onchange: () => { kind = kindSel.value; shown = 60; renderPool(); } }, [['all', 'Todas'], ['monster', 'Monstruos'], ['spell', 'Magias'], ['trap', 'Trampas']].map(([v, t]) => h('option', { value: v }, t)));
    const typeSel = h('select', { onchange: () => { type = typeSel.value; shown = 60; renderPool(); } }, h('option', { value: '' }, 'Todos los tipos'), C.PRESET_TYPES.concat(C.custom.map(c => c.type).filter((t, i, a) => a.indexOf(t) === i)).map(t => h('option', { value: t }, C.TYPE_ES[t])));
    root.append(h('button', { class: 'back', onclick: deckBuilder }, '← Mis mazos'), h('h1', null, dk.name),
      h('div', { class: 'dktabs' }, tabPool, tabDeck),
      h('div', { class: 'dkmain' }, leftEl,
        h('div', { class: 'panel dkcenter', 'data-drop': 'pool' }, h('div', { class: 'dkpl' }, h('h2', null, 'Colección'), h('div', { class: 'row' }, search, kindSel, typeSel)), poolEl),
        h('div', { class: 'panel dkdeckm', 'data-drop': 'deck' }, h('h2', null, 'Tu mazo'), listEl),
        sideEl),
      h('div', { class: 'panel dkbottom', 'data-drop': 'deck' }, statEl, stripEl),
      statEl2);
    mount(root); renderAll();
  }


  // ---------------- tutorial de la primera partida contra la computadora ----------------
  const TUT_KEY = 'duelo.tut';
  const tutSeen = () => { try { return localStorage.getItem(TUT_KEY) === '1'; } catch (e) { return true; } };
  const tutMark = () => { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) { /* nada */ } };
  const TUT = [
    ['Objetivo', 'Cada uno empieza con 8000 PV. Gana quien deje los PV del rival en 0. Tu campo está abajo y el del rival arriba.'],
    ['Tu mano', 'Tus cartas están abajo. Robas 1 por turno. Toca una carta para verla y elegir qué hacer con ella.'],
    ['Monstruos', 'Puedes invocar o colocar 1 monstruo por turno. «Colocar» lo deja boca abajo en defensa. Los de nivel 5 o más piden sacrificar monstruos tuyos.'],
    ['Magias y trampas', 'Las magias se activan en tu fase principal. Las trampas se colocan boca abajo y responden a un ataque o a una jugada del rival desde el turno siguiente.'],
    ['Combate', 'Con «⚔ Combate» tus monstruos en ataque pueden atacar una vez. Gana el mayor ATK y el perdedor paga la diferencia en PV. Si el rival no tiene monstruos, pegas directo a sus PV.'],
    ['Terminar el turno', 'Cuando termines, pulsa «Terminar turno». Si tardas demasiado, el contador lo pasa solo. Quien empieza no roba en su primer turno y en la primera ronda nadie ataca. ¡Suerte!']
  ];
  function tutorial(cur, force) {
    if (C.test || (!force && tutSeen())) return;
    let i = 0, el = null;
    const end = () => { if (el) { el.remove(); el = null; } tutMark(); };
    cur.tutEnd = () => { if (el) { el.remove(); el = null; } };
    const draw = () => {
      const b = h('div', { class: 'tutbox', role: 'dialog', 'aria-label': 'Tutorial' },
        h('div', { class: 'tuth' }, h('small', null, `Tutorial · ${i + 1}/${TUT.length}`), h('b', null, TUT[i][0])),
        h('p', null, TUT[i][1]),
        h('div', { class: 'row' },
          btn('Saltar', () => end(), 'ghost'),
          btn(i === TUT.length - 1 ? 'Entendido' : 'Siguiente', () => { if (i >= TUT.length - 1) end(); else { i++; draw(); } }, 'gold')));
      if (el) el.replaceWith(b); else document.body.append(b);
      el = b;
    };
    setTimeout(() => { if (current === cur) draw(); }, 1200);
  }

  // ---------------- la partida ----------------
  function game(match, opts) {
    opts = opts || {};
    endCurrent();
    const cur = current = { match, cleanup: opts.cleanup, started: false };
    // ---- ranking: sólo partidas online con al menos 2 personas y cuenta con nombre ----
    let rankDone = false, rankRes = null;
    const rankable = () => match.kind !== 'ia' && !C.test && D.Account.user && !D.Account.user.guest && (match.hum || []).filter(Boolean).length >= 2;
    function rankFinish(leaving) {
      if (rankDone || !v || !rankable()) return null;
      rankDone = true;
      const R = D.Rank, mine = (R.state() || {}).pts || 0, rk = q => (match.hum[q] && match.rk && match.rk[q]) ? match.rk[q] : mine;
      const draw = v.winner === 'draw' || v.winner === -1, won = v.winner === v.team[v.seat];
      let S, foes;
      if (leaving) { S = 0; foes = v.players.filter(p => p.seat !== v.seat && v.team[p.seat] !== v.team[v.seat]).map(p => rk(p.seat)); }
      else if (v.n > 2 && v.mode !== 'teams') { S = draw ? .5 : R.scoreOfPlace(standings().indexOf(v.seat) + 1, v.n); foes = v.players.filter(p => p.seat !== v.seat).map(p => rk(p.seat)); }
      else { S = draw ? .5 : won ? 1 : 0; foes = v.players.filter(p => v.team[p.seat] !== v.team[v.seat]).map(p => rk(p.seat)); }
      return (rankRes = R.apply({ S, foes }));
    }
    cur.leave = () => { if (v && v.winner === null && v.me.alive) rankFinish(true); };
    let prepared = false;
    // en una sala de espera no se pone todavía el fondo de combate ni su música
    const prepare = () => { if (prepared) return; prepared = true; cur.started = true; if (D.Social && match.kind !== 'ia') D.Social.setPlaying(true); sndButton(false); showBg(false); S.setTrack('battle'); S.setAmbient(true); };
    if (!opts.wait) prepare();
    if (match.kind === 'ia') tutorial(cur);
    // Contador de turno: 45 s de inactividad (cada acción lo reinicia). Aquí sólo se ve: cuenta atrás, color y un sonido; quien pasa el turno es el anfitrión.
    const TURN_SECS = 45;
    let tt = { key: '', t0: 0, beeped: false }, ttInt = null;
    function ttTick() {
      const el = document.querySelector('.turntimer');
      if (!el) { clearInterval(ttInt); ttInt = null; return; }
      const left = Math.max(0, TURN_SECS - Math.floor((Date.now() - tt.t0) / 1000));
      el.textContent = left > 0 ? '⏱ ' + left + ' s' : '⏱ ¡Tiempo!';
      el.classList.toggle('low', left <= 10 && left > 0); el.classList.toggle('out', left === 0);
      if (left === 0 && !tt.beeped) { tt.beeped = true; if (v && v.current === v.seat) S.play('error'); }
    }
    let v = null, prevLps = null, sel = null, prevHandN = null, newView = false, firstView = true, lastLogN = 0, endSounded = false, lpDelta = {};
    const zoneMem = new Map(), enterMem = new Map();
    let gameEl = null, zrowsEl = null, lcol = null;
    let cutQ = [], cutBusy = false, fx = [], cut = [], needShake = false, fresh = false, lowTrack = false, lastFam = null, atkFx = [], atkTg = [], pops = [];
    const seatNames = () => match.names;
    const nameOf = q => seatNames()[q] || ('Jugador ' + (q + 1));
    const shortOf = q => { const m = /^Computadora(?: (\d))?/.exec(nameOf(q)); return m ? 'Compu' + (m[1] ? ' ' + m[1] : '') : nameOf(q); };
    const multi = () => !!v && v.n > 2;
    const isAlly = q => q !== v.seat && v.team[q] === v.team[v.seat];
    const place = q => v.n - v.rank.indexOf(q);

    const fileSfx = src => { if (src) S.voice({ voice: { src } }); };
    const abn = k => (C.AB && C.AB[k] ? C.AB[k][0] : k);
    const nameId = id => (C.get(id) || {}).name || id;
    /** Nombre de cada poder (los de la tanda 2 no coinciden con el id de la habilidad). */
    const PWN = { conc: 'Respiración de Concentración Total', conc2: 'Respiración de Concentración Total', marca: 'Marca de Cazador', desp: 'Despertar del Poder Oculto',
      kaioken: 'Kaio-ken', kaioken6: 'Kaio-ken', genki: 'Genkidama', teach: 'Maestro de las Artes', dominio: 'Ataúd de la Montaña de Hierro', llama: 'Llama Infernal',
      kform: 'Transformación', telar: 'Telarañas', corromper: 'Promesa de Poder', rojo: 'Rojo', azul: 'Azul', purpura: 'Púrpura', avpred: 'Depredador de Magia', ydominio: 'Amor Mutuo y Verdadero' };
    const pwName = k => PWN[k] || abn(k);
    const MODN = { conc: 'Concentración Total', marca: 'Marca de Cazador', roca: 'Respiración de la Roca', sol: 'Respiración Solar', rayo: 'Postura del Rayo', desp: 'Poder Oculto', kaioken: 'Kaio-ken',
      llama: 'Llama Infernal', rhaast: 'Transformación en Rhaast', rhaastk: 'Rhaast (asesinatos)', sombra: 'Asesino Sombra', muerte: 'Muertes', bestia: 'la Bestia', rojo: 'Rojo', voto: 'Voto Vinculante', 'av-base': 'Anti-Venom', 'av-atk': 'Adaptación Ofensiva' };
    /** Técnicas de los Seis Ojos (Guerrero del Infinito): efecto real de cada una, según doPower de engine.js. */
    const SIX_INFO = {
      rojo: ['Rojo', 'Elige a un personaje enemigo que puedas tomar como objetivo: pierde 1000 ATK y 1000 DEF hasta que salga del campo.'],
      azul: ['Azul', 'Sin objetivo: destruye todas las magias y trampas del rival (salvo una Gokumonkyo que tenga a alguien sellado).'],
      purpura: ['Púrpura', 'Elige un personaje del rival o una de sus magias/trampas (salvo una Gokumonkyo que tenga a alguien sellado): queda desterrado, no va al cementerio.']
    };
    const SIX_RULE = 'Cada técnica una vez por invocación; Rojo y Azul se pueden usar las dos, Púrpura sólo si aún no usaste ninguna y después bloquea las otras.';
    /** Botón de acción de la ficha; con descripción debajo si la tiene, y deshabilitado si está gastado o bloqueado. */
    function actBtn(a) {
      if (a.note) return h('small', { class: 'actn' }, a.note);
      const b = btn(a.label, () => { if (a.off || !a.run) return; closeModal(); a.run(); }, a.cls || 'gold');
      if (a.off || !a.run) b.disabled = true;
      return a.desc ? h('div', { class: 'actd' }, b, h('small', null, a.desc)) : b;
    }
    /** Estados de un monstruo en el tablero, en texto (ventana de detalle). */
    function statusText(s) {
      const o = [];
      if (s.real) o.push('Transformado (en realidad es ' + nameId(s.real) + ')');
      if (s.shield != null) o.push('Escudo: ' + s.shield);
      if (s.link && s.link.length) o.push('Vinculado: ' + s.link.map(nameId).join(', '));
      if (s.absorbed) o.push('Tiene absorbido a ' + nameId(s.absorbed));
      if (s.fury) o.push('Furia de Esparta activa');
      if (s.kills) o.push('Bajas: ' + s.kills);
      if (s.domain) o.push('Su dominio cubre el campo');
      if (s.yuta) {
        const y = s.yuta;
        o.push('Rika (intercepción): ' + y.rk + '/' + y.rkMax + ' usos' + (y.rkTurn ? ' · usada este turno' : '') + (y.rkNext ? ' · puede volver a usarse este turno' : ' · no puede usarse más este turno'));
        if (y.rkLast) o.push('Última intercepción (turno ' + y.rkLast.t + '): ' + y.rkLast.fx + ' → protegió a ' + y.rkLast.ally);
        o.push('Técnicas copiadas: ' + y.learned.length + '/3' + (y.learned.length ? ' (' + y.learned.map(abn).join(', ') + ')' : '') + (y.lrnTurn ? ' · ya aprendió una este turno' : ''));
        if (y.dom) o.push('Dominio activo: +500 ATK/DEF, magias y trampas suspendidas, sólo habilidades de más de 10★' + (y.borrow && y.borrow.length ? ' · puede copiar: ' + y.borrow.map(pwName).join(', ') : ''));
      }
      if (s.rika) {
        const r = s.rika;
        o.push(r.happy ? 'Rika contenta (+' + r.bonus + ' ATK/DEF): ataca cuando quieras' : 'Maldición Incontrolable: debe atacar cada turno a un personaje del campo (o directo si no hay)');
        o.push('Yuta en el campo: ' + (r.yuta ? 'sí' : 'no') + ' · Anillo de la Promesa equipado: ' + (r.ring ? 'sí' : 'no'));
        if (r.imm) o.push('Inmune a equipamientos, magias y trampas');
      }
      if (s.muted) o.push('Habilidades silenciadas por el dominio');
      if (s.karma) o.push('Karma: muere en ' + s.karma.left + ' turno(s)');
      if (s.gem) o.push('Mente controlada (' + s.gem.left + ' uso(s) de la Gema)');
      if (s.sh) o.push((s.sh.kind === 'shen' ? 'Escudo de Shen' : s.sh.kind === 'susano' ? 'Susano' : 'Escudo Blue Evolution') + ': ' + s.sh.cur + '/' + s.sh.max);
      if (s.six) o.push('Seis Ojos: intocable ' + s.six + ' turno(s)');
      if (s.fused) o.push('Fusionado con ' + nameId(s.fused.b) + ' (' + s.fused.left + ' turno(s))');
      if (s.kn) o.push(s.form ? 'Forma elegida: ' + nameId(s.form) + ' (la otra ya no se puede elegir en esta invocación)' : 'Rhaast: ' + (s.kn.rh ? 'desbloqueada' : 'bloqueada (asesina a un enemigo en combate)') + ' · Asesino Sombra: ' + (s.kn.sh ? 'desbloqueada' : 'bloqueada (inflige daño directo)'));
      if (s.av) o.push('Anti-Venom acoplado · ' + (s.av.choice === 'atk' ? 'Adaptación Ofensiva ' + s.av.n + '/3' : s.av.choice === 'mag' ? 'Depredador de Magia ' + s.av.n + '/3' : 'sin evolución elegida') + (s.av.choice && s.av.turn ? ' (ya usada este turno)' : ''));
      if (s.rock != null) o.push('Posturas de la Roca: ' + s.rock + '/4');
      if (s.sun != null) o.push('Posturas solares: ' + s.sun + '/13');
      if (s.sealedAb && s.sealedAb.length) o.push('Habilidades selladas: ' + s.sealedAb.map(abn).join(', '));
      if (s.promesa) o.push('Promesa de Poder: no puede atacar y cambiará de bando');
      if (s.owner != null) o.push('Corrompido: pertenece a ' + nameOf(s.owner));
      if (s.learn) o.push('Ha aprendido: ' + [s.learn.kaioken ? 'Kaio-ken' : null, s.learn.genki ? 'Genkidama' : null].filter(Boolean).join(' y '));
      if (s.mods && s.mods.length) for (const m of s.mods) if (m.k !== 'av-base') o.push(`${MODN[m.k] || m.k}: ${m.atk ? (m.atk > 0 ? '+' : '') + m.atk + ' ATK' : ''}${m.atk && m.def ? ' / ' : ''}${m.def ? (m.def > 0 ? '+' : '') + m.def + ' DEF' : ''}${m.left != null ? ' · ' + m.left + ' turno(s)' : ''}`);
      return o;
    }
    const LIMIT = { canon: 'Sin límite de usos (cada vez que quieras).', absorb: 'Una vez por invocación.', furia: 'Sólo tras su primera baja; una vez por invocación.', bigbang: 'Una vez por invocación.', relicario: 'Una vez por invocación; no se puede usar con un dominio activo.', desmantelar: 'Una vez por invocación.', boom: 'Una vez por invocación; no se activa en ataques directos.', spinach: 'Una sola vez: al ser destruido.', instinto: 'Pasiva: siempre activa si es tu único personaje.', sangre: 'Pasiva: siempre activa si es tu único personaje.', regen5: 'Pasiva.', regen60: 'Pasiva.', escudo: 'Pasiva.', saiyan: 'Pasiva: al ser revivido.',
      yutadom: 'Una sola vez por invocación, también con la Gema del Poder; dura 2 turnos completos.', copia: 'Pasiva: aprende una técnica por turno (máx. 3).', rikaint: '2 usos por invocación, uno por turno.', rikamal: 'Pasiva.', rikaprot: 'Pasiva.', rikavinc: 'Pasiva.', zenitsu1: 'Pasiva: con cada ataque que declara.', zenitsu2: 'Una vez por invocación.', gyomei1: 'Pasiva: 4 posturas por invocación.', gyomei2: 'Una vez por invocación.', gyomei3: 'Una vez por invocación; Gyomei muere al terminar.', yoriichi: 'Pasiva: 13 posturas por invocación.',
      patriarca: 'Una vez por turno, hasta 3 veces por invocación.', kaioken: 'Una vez por invocación.', maestro: 'Una enseñanza por turno; cada habilidad una vez por invocación.', jogodom: 'Una vez por invocación.', llama: 'Una vez por invocación; necesita asesinatos.',
      sentido: 'Pasiva.', telar: 'Una vez por turno, hasta 2 veces por invocación.', corrupt: 'Cada 3 turnos.', asimila: 'Pasiva: una vez por turno.', espada: 'Pasiva.', muerte: 'Pasiva.', counter: 'Cuando el rival activa una magia hostil.' };
    /** Sección «Habilidades robadas» (Kratos) o «absorbidas» (Cell): propia de esa carta, separada de las originales. */
    function stolenBox(s) {
      if (!s.stealCap && !(s.extInfo && s.extInfo.length)) return null;
      const steal = !!s.stealCap, info = s.extInfo || [];
      const title = (steal ? 'Habilidades robadas' : 'Habilidades absorbidas') + (steal ? ` (${info.length}/${s.stealCap})` : '');
      const items = info.map(x => {
        const ab = C.AB && C.AB[x.id] || [x.id, ''];
        const stTxt = x.state === 'used' ? 'Ya usada' : x.state === 'ready' ? 'Disponible' : 'Pasiva';
        const det = h('div', { class: 'sd', style: 'display:none' }, h('div', null, ab[1]), h('div', { class: 'sub' }, 'Condiciones: ' + (LIMIT[x.id] || '—')));
        const row = h('button', { class: 'stolen ' + x.state, onclick: () => { det.style.display = det.style.display === 'none' ? '' : 'none'; } },
          h('b', null, ab[0]), h('span', { class: 'sf' }, x.from ? 'de ' + x.from : ''), h('span', { class: 'ss' }, stTxt));
        return h('div', { class: 'stitem' }, row, det);
      });
      return h('div', { class: 'stbox' }, h('b', null, title),
        items.length ? items : h('div', { class: 'sub' }, steal ? 'Aún no ha robado ninguna.' : 'Ninguna.'));
    }
    function badgesEl(s) {
      const b = [];
      if (s.sh) b.push((s.sh.kind === 'shen' ? '🛡️' : s.sh.kind === 'susano' ? '👹' : '🛡️') + s.sh.cur);
      else if (s.shield != null) b.push('🛡️' + s.shield);
      if (s.six) b.push('👁️' + s.six);
      if (s.fused) b.push('☯️' + s.fused.left);
      if (s.av) b.push('🧬');
      if (s.sealedAb && s.sealedAb.length) b.push('🕸️');
      if (s.promesa) b.push('⛓️');
      if (s.owner != null) b.push('🎭');
      if (s.mods && s.mods.some(m => m.k !== 'av-base' && (m.atk > 0 || m.def > 0))) b.push('⬆️');
      if (s.link && s.link.length) b.push('🔗');
      if ((s.ext && s.ext.length) || s.absorbed) b.push('🌀');
      if (s.fury) b.push('🔥');
      if (s.domain) b.push('👹');
      if (s.yuta && s.yuta.dom) b.push('💞');
      if (s.rika) b.push(s.rika.happy ? '😊' : '😡');
      if (s.muted) b.push('🔇');
      if (s.kills) b.push('☠️' + s.kills);
      if (s.karma) b.push('☯️' + s.karma.left);
      if (s.gem) b.push('🔮');
      return b.length ? h('span', { class: 'badges' }, b.map(x => h('i', null, x))) : null;
    }
    function act(a) {
      if (!v || v.actor !== v.seat) { S.play('error'); return; }
      sel = null; closeModal();
      const r = match.act(a);
      if (r && r.ok === false && r.error) console.warn(r.error);
    }
    const L = () => (v ? v.legal : []);
    const myTurn = () => v && v.actor === v.seat && v.winner === null;
    // ----- acciones al tocar -----
    function sheet(card, acts, hint) {
      const box = h('div', { class: 'box' }, detailBox(card, hint ? h('div', { class: 'sub', style: 'margin-top:6px' }, hint) : null),
        acts.length ? h('div', { class: 'acts' }, acts.map(a => { const b = btn(a.label, () => { if (a.off) return; closeModal(); a.run(); }, a.cls || 'gold'); if (a.off) b.disabled = true; return b; })) : null,
        btn('Cerrar', closeModal, 'ghost'));
      modal(box);
    }
    /** Elegir una casilla entre varias de cualquier campo: targets = [{seat, area, z}]; done(t). */
    function pickTargets(targets, done, text, direct) {
      sel = { kind: 'target', targets, done, text, direct }; render();
    }
    function sameSet(a, b) { return a.length === b.length && a.slice().sort().join() === b.slice().sort().join(); }
    function startTribute(i, type, opts2) {
      const need = opts2[0].tributes.length;
      const allowed = [...new Set(opts2.flatMap(o => o.tributes))];
      sel = { kind: 'tribute', need, allowed, chosen: [], opts: opts2, text: `Elige ${need} monstruo(s) para sacrificar` };
      render();
    }
    /** Pregunta a qué rival (ventana) y llama a done(asiento). */
    function pickFoe(seats, done, text) {
      const box = h('div', { class: 'box' }, h('h2', null, text || '¿Sobre qué rival?'),
        h('div', { class: 'acts' }, seats.map(q => btn(`${nameOf(q)} · ${v.players[q].lp} PV`, () => { closeModal(); done(q); }, 'gold'))),
        btn('Cancelar', closeModal, 'ghost'));
      modal(box);
    }
    /** Activar una magia: elegir rival y/o objetivo si hace falta. `list` = las acciones legales de esa carta. */
    function spellFlow(list, d) {
      if (!list[0].target) return act(list[0]);
      if (d.fx === 'burn') {
        const vsList = list.map(a => a.target.vs);
        return vsList.length === 1 ? act(list[0]) : pickFoe(vsList, q => act(list.find(a => a.target.vs === q)), '¿A quién le haces daño?');
      }
      if (d.fx === 'special') return chooseHand(list.map(a => a.target.u), u => act(list.find(a => a.target.u === u)), 'Elige el personaje de tu mano');
      if (d.fx === 'esferas') return wishMenu(list);
      if (d.fx === 'pothala') {              // elegir los dos personajes aliados que se fusionan
        const mine = z => ({ seat: v.seat, area: 'mz', z });
        const firsts = [...new Set(list.flatMap(a => [a.target.z, a.target.z2]))];
        return pickTargets(firsts.map(mine), t1 => {
          const partners = [...new Set(list.filter(a => a.target.z === t1.z || a.target.z2 === t1.z).map(a => (a.target.z === t1.z ? a.target.z2 : a.target.z)))];
          pickTargets(partners.map(mine), t2 => act(list.find(a => (a.target.z === t1.z && a.target.z2 === t2.z) || (a.target.z === t2.z && a.target.z2 === t1.z))), 'Elige el segundo personaje a fusionar');
        }, 'Elige el primer personaje a fusionar');
      }
      if (d.fx === 'voto') {                 // tu personaje que se sacrifica, el enemigo que copias y qué copias
        const zs = [...new Set(list.map(a => a.target.z))];
        return pickTargets(zs.map(z => ({ seat: v.seat, area: 'mz', z })), t1 => {
          const sub = list.filter(a => a.target.z === t1.z), seen = new Set(), foes = [];
          for (const a of sub) { const k = a.target.vs + ':' + a.target.ez; if (!seen.has(k)) { seen.add(k); foes.push({ seat: a.target.vs, area: 'mz', z: a.target.ez }); } }
          pickTargets(foes, t2 => {
            const opts = sub.filter(a => a.target.vs === t2.seat && a.target.ez === t2.z);
            const lab = a => (a.target.mode === 1 ? 'Copiar su ATK (tu DEF se sacrifica)' : a.target.mode === 2 ? 'Copiar su DEF (tu ATK se sacrifica)' : 'Copiar su habilidad: ' + (C.AB && C.AB[a.target.ab] ? C.AB[a.target.ab][0] : a.target.ab) + ' (tu ATK y DEF se sacrifican)');
            modal(h('div', { class: 'box' }, h('h2', null, 'Voto Vinculante: ¿qué copias?'),
              h('div', { class: 'acts', style: 'flex-direction:column;align-items:stretch;gap:8px' }, opts.map(a => btn(lab(a), () => { closeModal(); act(a); }, 'gold'))),
              btn('Cancelar', closeModal, 'ghost')));
          }, 'Elige al enemigo del que copias');
        }, 'Elige a tu personaje que hace el sacrificio');
      }
      if (d.fx === 'cana') return chooseGrave(list.map(a => a.target.u), u => act(list.find(a => a.target.u === u)), 'Elige el personaje desterrado que vuelve a tu mano', 'banish');
      const toFoe = d.fx === 'destroyOne' || d.fx === 'destroyST' || d.fx === 'gem' || d.fx === 'gokumon', area = d.fx === 'destroyST' ? 'st' : 'mz';
      const seatOfA = a => (toFoe ? (a.target.vs != null ? a.target.vs : v.opp.seat) : v.seat);
      return pickTargets(list.map(a => ({ seat: seatOfA(a), area, z: a.target.z })), t => act(list.find(a => seatOfA(a) === t.seat && a.target.z === t.z)), 'Elige el objetivo');
    }
    /** Esferas del Dragón: menú con los tres deseos. Los que no se pueden cumplir salen apagados y con el motivo. */
    function wishMenu(list) {
      const by = w => list.filter(a => a.target && a.target.wish === w);
      const opts = [
        { w: 'revive', title: 'Resurrección', text: 'Devuelve al campo un personaje tuyo del cementerio de hasta 7★.', why: 'No tienes en el cementerio un personaje de 7★ o menos, o no hay espacio libre en tu campo.',
          run: as => chooseGrave(as.map(a => a.target.u), u => act(as.find(a => a.target.u === u)), 'Elige el personaje de tu cementerio') },
        { w: 'heal', title: 'Restaurar vida', text: 'Recuperas exactamente 1500 PV.', why: 'No se puede pedir este deseo ahora.', run: as => act(as[0]) },
        { w: 'summon', title: 'Invocación especial', text: 'Invoca de tu mano un personaje tuyo de hasta 7★.', why: 'No tienes en la mano un personaje de 7★ o menos que se pueda invocar, o no hay espacio libre en tu campo.',
          run: as => chooseHand(as.map(a => a.target.u), u => act(as.find(a => a.target.u === u)), 'Elige el personaje de tu mano') }
      ];
      modal(h('div', { class: 'box' }, h('h2', null, 'Esferas del Dragón: pide un deseo'),
        h('p', { class: 'sub' }, 'Sólo se cumple un deseo. La carta no se gasta hasta que el deseo se cumple.'),
        h('div', { class: 'acts', style: 'flex-direction:column;align-items:stretch;gap:8px' }, opts.map(o => {
          const as = by(o.w), b = btn(o.title, () => { closeModal(); o.run(as); }, as.length ? 'gold' : 'ghost');
          if (!as.length) { b.disabled = true; b.style.opacity = '.55'; b.style.cursor = 'not-allowed'; }
          return h('div', { style: 'text-align:center' }, b, h('small', { style: 'display:block;margin-top:3px;opacity:.85' }, as.length ? o.text : o.why));
        })),
        btn('Cancelar', closeModal, 'ghost')));
    }
    /** Ventana para elegir una carta de tu cementerio (o de tu zona de desterradas, con from = 'banish') por uid. */
    function chooseGrave(uids, done, text, from) {
      const cs = uids.map(u => v.me[from || 'grave'].find(c => c && c.uid === u)).filter(Boolean);
      modal(h('div', { class: 'box' }, h('h2', null, text),
        h('div', { class: 'cands' }, cs.map(c => h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => { closeModal(); done(c.uid); } }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)))),
        btn('Cancelar', closeModal, 'ghost')));
    }
    /** Ventana para elegir una carta de la mano por uid. */
    function chooseHand(uids, done, text) {
      const cs = uids.map(u => v.me.hand.find(c => c && c.uid === u)).filter(Boolean);
      modal(h('div', { class: 'box' }, h('h2', null, text),
        h('div', { class: 'cands' }, cs.map(c => h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => { closeModal(); done(c.uid); } }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)))),
        btn('Cancelar', closeModal, 'ghost')));
    }
    function handClick(i) {
      const c = v.me.hand[i], d = C.get(c.id);
      S.play('select');
      if (!myTurn() || v.pending) { sheet(d, [], null); return; }
      const mine = L().filter(a => a.hand === i), acts = [];
      for (const t of ['summon', 'set']) {
        const os = mine.filter(a => a.t === t);
        if (!os.length) continue;
        const label = t === 'summon' ? 'Invocar (ataque)' : 'Colocar boca abajo (defensa)';
        if (os[0].tributes.length === 0) acts.push({ label, run: () => act(os[0]) });
        else acts.push({ label: label + ` · sacrificar ${os[0].tributes.length}`, run: () => startTribute(i, t, os) });
      }
      const cp = mine.filter(a => a.t === 'couple');
      if (cp.length) {
        const hosts = [...new Set(cp.map(a => a.host))], tn = cp[0].tributes.length;
        acts.push({ label: 'Acoplar a un aliado' + (tn ? ` · sacrificar ${tn}` : ''), run: () => pickTargets(hosts.map(z => ({ seat: v.seat, area: 'mz', z })), t => {
          const opts = cp.filter(a => a.host === t.z);
          if (!tn) return act(opts[0]);
          startTribute(i, 'couple', opts);
        }, 'Elige el personaje al que se acopla') });
      }
      const spc = mine.find(a => a.t === 'special');
      if (spc) acts.push({ label: 'Invocar especialmente (ataque)', run: () => act(spc) });
      const sp = mine.filter(a => a.t === 'activate');
      if (sp.length) acts.push({ label: 'Activar', run: () => spellFlow(sp, d) });
      const st = mine.find(a => a.t === 'setst');
      if (st) acts.push({ label: d.kind === 'trap' ? 'Colocar boca abajo' : 'Colocar boca abajo (para después)', run: () => act(st), cls: sp.length ? 'ghost' : 'gold' });
      if (!acts.length && d.sp) { sheet(d, acts, 'Sólo entra con invocación especial: ' + d.text); return; }
      sheet(d, acts, acts.length ? null : (v.me.normalUsed && d.kind === 'monster' ? 'Ya usaste tu invocación del turno.' : v.phase === 'battle' ? 'Solo se puede en la fase principal.' : 'No se puede jugar ahora.'));
    }
    function myMzClick(z) {
      if (!v.me.mz[z]) return;
      const s = v.me.mz[z], d = C.get(s.c.id), acts = [];
      let hint = null;
      if (myTurn() && !v.pending) {
        const all = L().filter(a => a.t === 'attack' && a.zone === z);
        const vsOf = a => (a.vs != null ? a.vs : v.opp.seat);
        for (const a of all.filter(a => a.target === 'direct')) acts.push({ label: 'Atacar directamente' + (multi() ? ' a ' + shortOf(vsOf(a)) : ''), run: () => act(a) });
        const onZone = all.filter(a => a.target !== 'direct');
        if (onZone.length) acts.push({ label: 'Atacar…', run: () => pickTargets(onZone.map(a => ({ seat: vsOf(a), area: 'mz', z: a.target })), t => act(onZone.find(a => vsOf(a) === t.seat && a.target === t.z)), 'Elige a quién atacar') });
        const fl = L().find(a => a.t === 'flip' && a.zone === z); if (fl) acts.push({ label: 'Voltear (pasa a ataque)', run: () => act(fl) });
        const po = L().find(a => a.t === 'pos' && a.zone === z); if (po) acts.push({ label: s.pos === 'atk' ? 'Pasar a defensa' : 'Pasar a ataque', run: () => act(po), cls: 'ghost' });
      }
      const groups = {};
      const tgtList = (g, area) => g.map(a => ({ seat: a.target.vs, area: area || a.target.area || 'mz', z: a.target.z }));
      const choose = (g, area, text) => pickTargets(tgtList(g, area), t => act(g.find(a => a.target.vs === t.seat && a.target.z === t.z && (area || a.target.area || 'mz') === t.area)), text || 'Elige el objetivo');
      if (myTurn() && !v.pending) {
        for (const a of L().filter(a => a.t === 'power' && a.zone === z)) (groups[a.pw] = groups[a.pw] || []).push(a);
        for (const k of Object.keys(groups)) {
          const g = groups[k];
          if (SIX_INFO[k]) continue;      // Rojo, Azul y Púrpura: más abajo, con su descripción
          if (k === 'xform') { const seen = new Set(); for (const a of g) { const nm = nameId(v.me.hand[a.hand].id); if (seen.has(nm)) continue; seen.add(nm); acts.push({ label: 'Transformar en ' + nm, run: () => act(a) }); } }
          else if (k === 'bite') acts.push({ label: abn(k) + ' (−500 PV)', run: () => act(g[0]) });
          else if (k === 'kform') { for (const a of g) acts.push({ label: 'Transformarse en ' + (a.form === 'c_kayn_rhaast' ? 'Rhaast' : 'Asesino Sombra'), run: () => act(a) }); }
          else if (k === 'teach') { for (const sk of [...new Set(g.map(a => a.skill))]) { const gs = g.filter(a => a.skill === sk); acts.push({ label: 'Enseñar ' + (sk === 'kaioken' ? 'el Kaio-ken' : 'la Genkidama') + '…', run: () => choose(gs, 'mz', 'Elige a qué aliado se lo enseñas') }); } }
          else if (k === 'telar') {
            const ts = [...new Set(g.map(a => a.target.vs + ':' + a.target.z))];
            acts.push({ label: 'Telarañas…', run: () => pickTargets(ts.map(x => { const [q, z] = x.split(':').map(Number); return { seat: q, area: 'mz', z }; }), t => {
              const opts = g.filter(a => a.target.vs === t.seat && a.target.z === t.z);
              modal(h('div', { class: 'box' }, h('h2', null, '🕸️ ¿Qué habilidad sellas?'), h('div', { class: 'acts' }, opts.map(a => btn(abn(a.ab) + ' — ' + ((C.AB[a.ab] || [])[1] || '').slice(0, 70), () => { closeModal(); act(a); }, 'gold'))), btn('Cancelar', closeModal, 'ghost')));
            }, 'Elige al personaje enemigo') });
          }
          else if (k === 'desmantelar' || k === 'avpred') acts.push({ label: pwName(k) + '…', run: () => choose(g, 'st', 'Elige la magia o trampa rival') });
          else if (k === 'corromper') acts.push({ label: (g[0].ring ? 'Promesa de Poder (Anillo Único)' : 'Promesa de Poder') + '…', run: () => choose(g, 'mz', 'Elige al personaje enemigo que quedará bajo tu poder') });
          else if (g[0].target) acts.push({ label: (k === 'copy' ? 'Transformarse en un personaje del campo' : pwName(k)) + '…', run: () => choose(g, 'mz') });
          else acts.push({ label: pwName(k), run: () => act(g[0]) });
        }
      }
      if (s.used) {        // habilidades de un solo uso ya gastadas en esta invocación: se muestran deshabilitadas
        if (s.used.canon) acts.push({ label: abn('canon') + ' (usada)', off: true, cls: 'ghost' });
        if (s.used.kk6) acts.push({ label: 'Kaio-ken (usada)', off: true, cls: 'ghost' });
        if (s.used.gen) acts.push({ label: 'Genkidama (usada)', off: true, cls: 'ghost' });
        if (s.used.ydom) acts.push({ label: 'Amor Mutuo y Verdadero (usada)', desc: 'Una vez por invocación de Yuta: vuelve a estar disponible si Yuta sale del campo y se invoca de nuevo.', off: true, cls: 'ghost' });
      }
      if (s.six && s.sixU) {        // Seis Ojos: las tres técnicas, con lo que hace cada una antes de lanzarla
        const u = s.sixU, can = myTurn() && !v.pending;
        acts.push({ note: 'Seis Ojos (' + s.six + ' turno(s)): ' + SIX_RULE });
        for (const k of ['rojo', 'azul', 'purpura']) {
          const g = groups[k], [nm, txt] = SIX_INFO[k];
          let why = null;
          if (u[k]) why = 'Ya usada en esta invocación.';
          else if (k !== 'purpura' && u.purpura) why = 'Bloqueada: ya lanzaste Púrpura.';
          else if (k === 'purpura' && (u.rojo || u.azul)) why = 'Bloqueada: ya lanzaste ' + (u.rojo ? 'Rojo' : 'Azul') + '.';
          else if (!can) why = 'Sólo en tu turno.';
          else if (!g) why = k === 'azul' ? 'El rival no tiene magias ni trampas que destruir.' : 'No hay objetivos válidos ahora.';
          const run = !g ? null : k === 'rojo' ? () => choose(g, 'mz', 'Rojo: elige al personaje enemigo que pierde 1000 ATK y 1000 DEF')
            : k === 'purpura' ? () => choose(g, null, 'Púrpura: elige qué desterrar (personaje o magia/trampa rival)') : () => act(g[0]);
          acts.push({ label: nm + (g && !why && k !== 'azul' ? '…' : ''), desc: txt + (why ? ' — ' + why : ''), run, off: !!why, cls: why ? 'ghost' : 'gold' });
        }
      }
      for (const t of statusText(s)) hint = (hint ? hint + ' · ' : '') + t;
      const info = h('div', null, h('div', { class: 'sub' }, `${s.down ? 'Boca abajo · ' : ''}${s.pos === 'atk' ? 'Ataque' : 'Defensa'} · ATK ${s.atk} / DEF ${s.def}`), hint ? h('div', { class: 'sub', style: 'margin-top:6px' }, hint) : null, stolenBox(s));
      modal(h('div', { class: 'box' }, detailBox(d, info), acts.length ? h('div', { class: 'acts' }, acts.map(actBtn)) : null, btn('Cerrar', closeModal, 'ghost')));
    }
    function stormFlow(list) {
      const hands = [...new Set(list.map(a => a.hand))];
      const go = hi => { const sub = list.filter(a => a.hand === hi), area = sub[0].pw === 'storm1' ? 'mz' : 'st'; pickTargets(sub.map(a => ({ seat: a.target.vs, area, z: a.target.z })), t => act(sub.find(a => a.target.vs === t.seat && a.target.z === t.z)), 'Elige el objetivo rival'); };
      if (hands.length === 1) return go(hands[0]);
      modal(h('div', { class: 'box' }, h('h2', null, 'Elige la carta de tu mano que se destruye'),
        h('div', { class: 'cands' }, hands.map(hi => { const c = v.me.hand[hi]; return h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => { closeModal(); go(hi); } }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)); })),
        btn('Cancelar', closeModal, 'ghost')));
    }
    /** Estado de las magias de equipo y continuas de la tanda 2 (anillos, Susano, la Bestia, Guerrero, Gokumonkyo). */
    function stText(s) {
      if (s.ring) return s.ring.sauron ? 'Anillo Único en Sauron: +1000 ATK y DEF, sin corrupción.' : `Anillo Único (portador de ${s.ring.stars}★): +${s.ring.atk} ATK y DEF · corrupción en ${s.ring.left} turno(s)` + (s.ring.can ? (s.ring.promesa ? ' · Promesa de Poder ya usada.' : ' · Promesa de Poder disponible.') : '.');
      if (s.susano) return s.susano.awake ? `Susano despierto: escudo ${s.susano.sh}/${s.susano.max}.` : 'Susano dormido: despierta cuando muere otro personaje del mismo tipo que el portador.';
      if (s.beast) return s.beast.done ? 'La Bestia ya despertó.' : 'Espera la muerte de otro aliado.';
      if (s.guerrero) return s.guerrero.waiting ? 'Esperando al próximo personaje que entre en tu campo.' : 'Seis Ojos concedidos.';
      if (s.prison) return `Tiene sellado a ${nameId(s.prison.c)}: vuelve en ${s.prison.left} turno(s).`;
      if (s.promise) return 'Rika Orimoto es feliz mientras el portador siga en el campo. El portador no puede cambiar durante la partida' + (s.bearer ? ' (portador: ' + nameId(s.bearer) + ').' : '.');
      return null;
    }
    function myStClick(z) {
      if (!v.me.st[z]) return;
      const s = v.me.st[z], d = C.get(s.c.id), acts = [];
      if (myTurn() && !v.pending) {
        const sw = L().filter(a => a.t === 'spow' && a.zone === z);
        const gp = sw.find(a => a.pw === 'gempos'); if (gp) acts.push({ label: 'Cambiar su posición', run: () => act(gp) });
        const ga = sw.filter(a => a.pw === 'gematk');
        if (ga.length) acts.push({ label: 'Obligarlo a atacar a un aliado…', run: () => pickTargets(ga.map(a => ({ seat: a.target.vs, area: 'mz', z: a.target.z })), t => act(ga.find(a => a.target.vs === t.seat && a.target.z === t.z)), 'Elige a quién ataca') });
        const sto = sw.filter(a => a.pw === 'storm1' || a.pw === 'storm2');
        if (sto.length) acts.push({ label: 'Usar la tormenta…', run: () => stormFlow(sto) });
        const os = L().filter(a => a.t === 'activateSet' && a.zone === z);
        if (os.length) acts.push({ label: 'Activar', run: () => spellFlow(os, d) });
      }
      const extra = stText(s) || (s.gem ? `Controla la mente de un rival. Usos que quedan: ${s.gem.left}.` : s.karma ? (s.karma.phase === 'foe' ? `Karma va a morir en ${s.karma.left} turno(s).` : 'Equipada a un personaje tuyo.') : null);
      sheet(d, acts, d.kind === 'trap' && s.down ? 'Se activará cuando puedas responder.' : extra);
    }
    function oppClick(seat, area, z) {
      const s = v.players[seat][area][z];
      if (!s) return;
      if (s.down) { modal(h('div', { class: 'box' }, h('div', { class: 'detail' }, h('div', { class: 'card back big' }), h('div', { class: 'txt' }, h('h3', null, 'Carta boca abajo'), h('div', null, area === 'mz' ? 'Un monstruo en defensa. No sabes cuál es.' : 'Una magia o trampa colocada.'))), btn('Cerrar', closeModal, 'ghost'))); return; }
      const d = C.get(s.c.id);
      if (area === 'st' && stText(s)) { modal(h('div', { class: 'box' }, detailBox(d, h('div', { class: 'sub', style: 'margin-top:6px' }, stText(s))), btn('Cerrar', closeModal, 'ghost'))); return; }
      const hint = d.kind === 'monster' ? [`${s.pos === 'atk' ? 'Ataque' : 'Defensa'} · ATK ${s.atk} / DEF ${s.def}`].concat(statusText(s).filter(x => !/^Habilidades robadas/.test(x))).join(' · ') : null;
      const sb = d.kind === 'monster' ? stolenBox(s) : null;
      modal(h('div', { class: 'box' }, detailBox(d, h('div', null, hint ? h('div', { class: 'sub', style: 'margin-top:6px' }, hint) : null, sb)), btn('Cerrar', closeModal, 'ghost')));
    }
    function zoneClick(seat, area, z) {
      S.play('select');
      if (sel && sel.kind === 'tribute' && seat === v.seat && area === 'mz' && sel.allowed.includes(z)) {
        const k = sel.chosen.indexOf(z);
        if (k >= 0) sel.chosen.splice(k, 1); else sel.chosen.push(z);
        if (sel.chosen.length === sel.need) {
          const a = sel.opts.find(o => sameSet(o.tributes, sel.chosen));
          if (a) return act(a);
        }
        return render();
      }
      if (sel && sel.kind === 'target') { const t = sel.targets.find(x => x.seat === seat && x.area === area && x.z === z); if (t) return sel.done(t); }
      if (area === 'mz' && !v.players[seat].mz[z] && v.players[seat].shadow && v.players[seat].shadow[z] >= 0) z = v.players[seat].shadow[z];
      if (seat === v.seat) return area === 'mz' ? myMzClick(z) : myStClick(z);
      return oppClick(seat, area, z);
    }

    // ----- ventanas de decisión (trampas, elegir carta, descarte) -----
    function trgText(pd) {
      const who = multi() && pd.by != null ? nameOf(pd.by) : 'El rival';
      return { attack: `${who} declara un ataque.`, spell: `${who} activa una magia.`, summon: `${who} invoca un monstruo.` }[pd.trigger] || '';
    }
    function pendingUI() {
      const pd = v.pending;
      if (!pd || pd.player !== v.seat || v.winner !== null) { if (modalEl && modalEl.dataset.pend) closeModal(); return; }
      if (pd.k === 'respond') {
        const box = h('div', { class: 'box' }, h('h2', null, '¿Activar una trampa?'), h('p', { class: 'sub' }, trgText(pd)),
          h('div', { class: 'acts' }, pd.cands.map(z => { const d = C.get(v.me.st[z].c.id); return h('button', { class: 'btn gold', onclick: () => act({ t: 'respond', activate: true, zone: z }) }, `${d.icon} ${d.name}`, h('div', { style: 'font-size:12px;font-weight:400' }, d.text)); })),
          btn('No activar', () => act({ t: 'respond', activate: false }), 'ghost'));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'steal') {
        const box = h('div', { class: 'box' }, h('h2', null, 'Robar habilidad'), h('p', { class: 'sub' }, `Mataste a ${pd.from || 'un personaje'}. ¿Te quedas con una de sus habilidades?`),
          h('div', { class: 'acts' }, L().filter(a => a.pick != null).map(a => btn(abn(a.pick), () => act(a), 'gold')), btn('No robar', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'karma') {
        const box = h('div', { class: 'box' }, h('h2', null, '☯️ Karma'), h('p', { class: 'sub' }, 'Tu personaje murió. Elige al personaje enemigo que arrastrará: morirá en 3 turnos y el tuyo revivirá.'),
          h('div', { class: 'acts' }, L().map(a => { const m = v.players[a.vs].mz[a.z]; return btn(`${m && m.c ? nameId(m.c.id) : 'Carta boca abajo'} · ${nameOf(a.vs)} · zona ${a.z + 1}`, () => act(a), 'gold'); })));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'titan') {
        const box = h('div', { class: 'box' }, h('h2', null, '¿Invocar a Titán Martillo?'), h('p', { class: 'sub' }, 'Lara Tybur murió: puedes invocar especialmente a Titán Martillo desde tu mano; ella queda vinculada a él.'),
          h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(C.get('c_titan'))),
          h('div', { class: 'acts' }, btn('Sí, invocar', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'mahoraga') {
        const box = h('div', { class: 'box' }, h('h2', null, '¿Invocar a General Mahoraga?'), h('p', { class: 'sub' }, `${pd.nm || 'El rival'} acaba de entrar con 10★ o más. Puedes invocar especialmente a General Mahoraga desde tu mano (no gasta tu invocación normal).`),
          h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(C.get('c_mahoraga'))),
          h('div', { class: 'acts' }, btn('Sí, invocar', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'muerte') {
        const box = h('div', { class: 'box' }, h('h2', null, '¿Invocar a La Muerte?'), h('p', { class: 'sub' }, `${pd.nm || 'Un personaje'} se salvó de morir. Puedes invocar especialmente a La Muerte desde tu mano (no gasta tu invocación normal).`),
          h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(C.get('c_la_muerte'))),
          h('div', { class: 'acts' }, btn('Sí, invocar', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'shen') {
        const box = h('div', { class: 'box' }, h('h2', null, '🛡️ Protección del Ojo del Crepúsculo'), h('p', { class: 'sub' }, `${pd.nm || 'Un aliado'} está a punto de recibir un golpe mortal. ¿Invocas a Shen desde tu mano para interceptarlo? Se cancela el efecto y tu aliado recibe un escudo de 1000.`),
          h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(C.get('c_shen'))),
          h('div', { class: 'acts' }, btn('Sí, invocar a Shen', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'meliodas' && pd.stage === 'ask') {
        const box = h('div', { class: 'box' }, h('h2', null, '⚔️ Total Counter'), h('p', { class: 'sub' }, `${({ spell: 'El rival activa la magia', trap: 'El rival activa la trampa', power: 'El rival usa la habilidad de', attack: 'El rival ataca con' })[pd.kind || 'spell']} ${pd.nm || ''}. Puedes devolver su efecto contra su dueño y elegir el objetivo; el efecto original no se aplica (una vez por turno).`),
          h('div', { class: 'acts' }, btn('Devolver el efecto', () => act({ t: 'ability', use: true }), 'gold'), btn('Dejar que se resuelva', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'meliodas') {
        const box = h('div', { class: 'box' }, h('h2', null, '⚔️ Total Counter: elige el objetivo'), h('p', { class: 'sub' }, 'El efecto vuelve contra su dueño. ¿A quién o a qué golpea?'),
          h('div', { class: 'acts' }, L().filter(a => a.z != null).map(a => { const sl = v.players[a.vs] && v.players[a.vs][pd.area || 'mz'][a.z]; const nm = sl && sl.c ? nameId(sl.c.id) : 'Carta'; return btn(`${nm} · ${nameOf(a.vs)} · zona ${a.z + 1}`, () => act(a), 'gold'); })));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'rika') {
        const box = h('div', { class: 'box' }, h('h2', null, '👁️ Rika Orimoto: Intercepción Protectora'), h('p', { class: 'sub' }, `${pd.nm || 'Un aliado'} está a punto de morir por ${({ attack: 'un ataque', spell: 'una magia', trap: 'una trampa', power: 'una habilidad' })[pd.kind] || 'un efecto'}. Rika puede interceptarlo: el efecto no le afecta, sin daño ni reflejo. (2 usos por invocación de Yuta, 1 por turno)`),
          h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(C.get('c_rika'))),
          h('div', { class: 'acts' }, btn('Interceptar', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'yutalearn') {
        const box = h('div', { class: 'box' }, h('h2', null, '📖 Copia de Técnicas'), h('p', { class: 'sub' }, `${pd.from || 'Un personaje'} usó «${pd.nm || 'una habilidad'}». ¿Yuta Okkotsu la aprende? Se conserva aunque el original salga del campo (1 por turno, máximo 3).`),
          h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(C.get('c_yuta'))),
          h('div', { class: 'acts' }, btn('Aprender', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'avchoice') {
        const box = h('div', { class: 'box' }, h('h2', null, '🧬 Evolución Adaptativa'), h('p', { class: 'sub' }, 'Tu anfitrión asesinó a un enemigo. Elige UNA evolución; es permanente durante esta invocación de Anti-Venom.'),
          h('div', { class: 'acts' },
            h('button', { class: 'btn gold', onclick: () => act({ t: 'ability', pick: 'atk' }) }, '⚔️ Adaptación Ofensiva', h('div', { style: 'font-size:12px;font-weight:400' }, '+400 ATK y DEF por activación (una por turno, hasta 3).')),
            h('button', { class: 'btn gold', onclick: () => act({ t: 'ability', pick: 'mag' }) }, '🍽️ Depredador de Magia', h('div', { style: 'font-size:12px;font-weight:400' }, 'Destruye una magia o trampa rival (una por turno, hasta 3).'))));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability' && pd.ab === 'gem') {
        const box = h('div', { class: 'box' }, h('h2', null, '🔮 Gema de la Mente'), h('p', { class: 'sub' }, 'Un personaje enemigo controlado va a atacar. ¿Cancelas el ataque? (gasta un uso de la Gema)'),
          h('div', { class: 'acts' }, btn('Cancelar el ataque', () => act({ t: 'ability', use: true }), 'gold'), btn('Dejar atacar', () => act({ t: 'ability', use: false }), 'ghost')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'ability') {
        const d = pd.card && pd.card.id ? C.get(pd.card.id) : null, nm = d ? d.name : 'Popeye';
        const box = pd.stage === 'ask'
          ? h('div', { class: 'box' }, h('h2', null, '¿Comer espinaca?'), h('p', { class: 'sub' }, `${nm} fue destruido. Puedes revivirlo con 1500 ATK y 1500 DEF (una sola vez).`),
            d ? h('div', { style: 'display:flex;justify-content:center;margin:8px 0' }, cardEl(d)) : null,
            h('div', { class: 'acts' }, btn('🥬 Sí, comer espinaca', () => act({ t: 'ability', use: true }), 'gold'), btn('No', () => act({ t: 'ability', use: false }), 'ghost')))
          : h('div', { class: 'box' }, h('h2', null, `${nm} revive`), h('p', { class: 'sub' }, '¿En qué posición lo dejas?'),
            h('div', { class: 'acts' }, btn('⚔️ Ataque', () => act({ t: 'ability', pos: 'atk' }), 'gold'), btn('🛡️ Defensa', () => act({ t: 'ability', pos: 'def' }), 'gold')));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'pick') {
        const box = h('div', { class: 'box' }, h('h2', null, pd.zone === 'grave' ? 'Elige un monstruo de tu cementerio' : 'Elige un monstruo de tu mazo'),
          h('div', { class: 'cands' }, pd.cands.map(c => h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => act({ t: 'pick', uid: c.uid }) }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)))));
        modal(box, false); modalEl.dataset.pend = 1;
      }
    }

    // ----- dibujo -----
    const curOf = (s, area) => (s ? { uid: s.c ? s.c.uid : 'hidden', id: s.c ? s.c.id : null, down: !!s.down, pos: s.pos, area } : null);
    /** low = el campo está en la fila de abajo del tablero (el mío, o el de un compañero/rival que se sienta abajo). */
    /** Cosméticos de un asiento: los míos salen de mi equipo; los de los demás, de lo que mandaron (validado). */
    const cosOf = q => q === v.seat ? D.Shop.mine() : D.Shop.clean(current && current.match && current.match.cos && current.match.cos[q]);
    function zoneEl(seat, area, z, low) {
      const side = seat === v.seat ? 'me' : 'opp', s = v.players[seat][area][z];
      const key = 's' + seat + '-' + area + '-' + z, old = zoneMem.get(key);
      const hl = (sel && sel.kind === 'target' && sel.targets.some(t => t.seat === seat && t.area === area && t.z === z)) ||
        (sel && sel.kind === 'tribute' && seat === v.seat && area === 'mz' && sel.allowed.includes(z));
      const chosen = sel && sel.kind === 'tribute' && seat === v.seat && area === 'mz' && sel.chosen.includes(z);
      const attacking = v.atk && area === 'mz' && v.atk.z === z && v.atk.p === seat;
      const cs = cosOf(seat);
      const el = h('div', { class: 'zone ' + area + ' ' + side + (isAlly(seat) ? ' ally' : '') + (low ? ' lowrow' : '') + (hl ? ' hl' : '') + (attacking ? ' atkr' : ''), 'data-k': key, onclick: () => zoneClick(seat, area, z) });
      for (const k of ['hc', 'ha', 'hm', 'cb']) if (cs[k]) el.dataset[k] = D.Shop.slug(cs[k]);
      let cur = null, landing = false, art = null;
      if (s) {
        let c;
        art = area === 'mz' && s.c && !s.down ? cosArt(cs, s.c.id) : null;      // skin de ilustración que le puso SU dueño
        if (area === 'mz') c = s.c ? cardEl(C.get(s.c.id), { down: s.down, pos: s.pos, atk: s.atk, def: s.def, art }) : cardEl(null, { down: true, pos: 'def' });
        else c = s.c ? cardEl(C.get(s.c.id), { down: s.down }) : cardEl(null, { down: true });
        if (chosen) c.classList.add('sel');
        const skId = area === 'mz' && s.c && !s.down && s.c.id && cs.sk ? cs.sk[s.c.id] : null;      // skin que le puso SU dueño
        if (skId) { el.dataset.sk = D.Shop.slug(skId); c.dataset.sk = el.dataset.sk; } else delete c.dataset.sk;
        el.append(c);
        const hsrc = area === 'mz' && s.c && !s.down ? Holo.src(s.c.id, art) : null;
        if (hsrc) c.classList.add('holohide');
        if (area === 'mz' && s.c) { const bg = badgesEl(s); if (bg) el.append(bg); if (s.wide) el.classList.add('wideA'); }
        if (area === 'st' && s.equipTo != null && s.c) el.append(h('span', { class: 'eqm' }, '🎗️'));
        if (area === 'st' && s.c && (s.prison || s.ring || s.susano || s.beast || s.guerrero)) el.append(h('span', { class: 'eqm' }, s.prison ? '⛓️' : s.ring ? '💍' : s.susano ? '👹' : s.beast ? '🐺' : '👁️'));
        cur = curOf(s, area); if (art) cur.art = art;
        if (fresh && !firstView && (!old || old.uid !== cur.uid || (old.down && !cur.down))) {
          landing = true; c.classList.add('landing');
          const d = cur.id ? C.get(cur.id) : null;
          fx.push({ k: key, type: cur.down && !cur.id ? 'small' : cur.down ? 'small' : (d && d.kind === 'monster' && d.level >= 7 ? 'epic' : d && d.kind !== 'monster' ? 'spell' : 'normal') });
        }
      } else if (area === 'mz' && v.players[seat].sealed && v.players[seat].sealed.includes(z)) {
        el.classList.add('shadowz'); el.append(h('span', { class: 'shd' }, '☯️ fusionado en la zona vecina'));
      } else if (area === 'mz' && v.players[seat].shadow && v.players[seat].shadow[z] >= 0) {
        el.classList.add('shadowz'); el.append(h('span', { class: 'shd' }, '↔ ocupada por un gigante'));
      } else if (fresh && !firstView && old) fx.push({ k: key, type: 'gone', card: old, fam: lastFam });
      if (fresh) { if (cur) zoneMem.set(key, cur); else zoneMem.delete(key); }
      if (cur && s && area === 'mz' && s.c && !s.down && Holo.src(s.c.id, art)) el.append(...holoEls(s, key, cur, landing, chosen, art));
      return el;
    }
    /** Figura de pie + anillo de luz (y, al aparecer, haz de luz y onda). */
    function holoEls(s, key, cur, landing, chosen, art) {
      const d = C.get(s.c.id), now = performance.now(), hi = d.level >= 7, lo = d.level <= 4;
      const ms = hi ? 2100 : lo ? 1000 : 1500;
      if (landing) enterMem.set(key, { uid: cur.uid, t0: now, ms });
      const m = enterMem.get(key);
      const entering = !!m && m.uid === cur.uid && now - m.t0 < m.ms;
      const dl = entering ? `animation-delay:-${Math.round(now - m.t0)}ms;` : '';
      const cls = 'holo' + (s.pos === 'def' ? ' def' : '') + (s.wide ? ' wide' : '') + (multi() ? ' compact' : '') + (hi ? ' hi' : lo ? ' lo' : '') + (entering ? ' enter' : '');
      const stat = h('div', { class: 'pl' }, s.pos === 'def' ? '🛡️ ' : '', h('b', { class: s.atk > d.atk ? 'up' : s.atk < d.atk ? 'dn' : '' }, String(s.atk)), ' / ', h('b', { class: s.def > d.def ? 'up' : s.def < d.def ? 'dn' : '' }, String(s.def)));
      const bob = `animation-delay:-${((now % 3200) / 1000).toFixed(2)}s`;
      const fig = h('div', { class: 'hin', style: `--ms:${ms}ms;${dl}` }, h('img', { src: Holo.src(d.id, art), alt: d.name, draggable: 'false', style: bob }), stat);
      const out = [h('div', { class: 'hbase' + (entering ? ' enter' : '') + (chosen ? ' sel' : ''), style: `--ms:${ms}ms;${dl}` }), h('div', { class: cls, style: `--ms:${ms}ms` }, fig)];
      if (entering) out.push(h('div', { class: 'hbeam', style: `--ms:${ms}ms;${dl}` }), h('div', { class: 'hwave', style: `--ms:${ms}ms;${dl}` }));
      return out;
    }
    /** Cambios de PV desde la vista anterior: sonidos y efectos una sola vez; las fichas sólo pintan el número flotante. */
    function lpEvents() {
      lpDelta = {};
      if (!prevLps) return;
      v.players.forEach((p, seat) => {
        const dlt = p.lp - prevLps[seat];
        if (!dlt || (prevLps[seat] === 0 && !p.alive)) return;
        lpDelta[seat] = dlt;
        S.play(dlt > 0 ? 'heal' : dlt <= -2000 ? 'hit_heavy' : seat === v.seat ? 'hurt' : 'hit', 250);
        if (dlt < 0 && lastFam) fx.push({ pc: seat, type: 'pc', fam: lastFam });
        if (dlt <= -1000) needShake = true;
      });
    }
    const lpFloat = seat => (lpDelta[seat] ? h('span', { class: 'fl ' + (lpDelta[seat] < 0 ? 'neg' : 'pos') }, (lpDelta[seat] > 0 ? '+' : '') + lpDelta[seat]) : null);
    /** Ficha grande de un jugador (1 contra 1, y la mía abajo). */
    /** Avatar, marco y título que lleva un jugador (los suyos propios o los que mandó por la red). */
    const lookOf = q => { const c = cosOf(q), g = k => D.Shop.get(c[k]); return { emoji: g('av') && !g('av').free ? g('av').emoji : '', fr: c.fr && !g('fr').free ? D.Shop.slug(c.fr) : '', ti: g('ti') && g('ti').text || '' }; };
    function pcard(seat) {
      const lk = lookOf(seat);
      const p = v.players[seat], mine = seat === v.seat, nm = nameOf(seat);
      const lp = h('span', { class: 'lp' }, p.alive ? String(p.lp) : '☠', lpFloat(seat));
      const pct = Math.max(0, Math.min(100, p.lp / 80));
      const ini = (nm || '?').trim().charAt(0).toUpperCase();
      const cls = 'pcard ' + (mine ? 'mine' : isAlly(seat) ? 'ally' : 'theirs') + (!p.alive ? ' dead' : '') + (v.current === seat && v.winner === null && p.alive ? ' turn' : '');
      return h('div', { class: cls, 'data-seat': seat },
        h('div', { class: 'av' + (lk.fr ? ' fr-' + lk.fr : '') }, lk.emoji || ini),
        h('div', { class: 'pi' },
          h('div', { class: 'pn', title: nm }, nm), lk.ti ? h('small', { class: 'ttl' }, lk.ti) : null,
          h('div', { class: 'lpw' }, h('div', { class: 'lpbar' }, h('i', { style: `width:${pct}%` })), lp),
          h('div', { class: 'pm' }, h('span', null, `🂠 ${p.deckCount}`), h('span', { class: 'hn', title: 'Cartas en la mano' }, `✋ Mano: ${p.handCount}`), h('button', { onclick: e => { e.stopPropagation(); showGrave(seat); }, title: 'Cementerio' }, `☠ ${p.grave.length}`), p.banish && p.banish.length ? h('span', { title: 'Zona de destierro' }, `🌀 ${p.banish.length}`) : null)));
    }
    /** Placa de nombre sobre cada campo del tablero (3-4 jugadores). */
    function plate(seat) {
      const p = v.players[seat], nm = nameOf(seat);
      const pct = Math.max(0, Math.min(100, p.lp / 80));
      const tag = v.mode === 'teams' && seat !== v.seat ? h('em', { class: 'ptag ' + (isAlly(seat) ? 'ally' : 'foe') }, isAlly(seat) ? 'Aliado' : 'Rival') : null;
      return h('div', { class: 'plate', 'data-seat': seat, title: nm },
        h('div', { class: 'pl1' }, h('b', { class: 'pnm' }, (lookOf(seat).emoji ? lookOf(seat).emoji + ' ' : '') + (seat === v.seat ? 'Tú' : nm)), tag,
          h('span', { class: 'plp' }, p.alive ? String(p.lp) : '☠ fuera', lpFloat(seat))),
        h('div', { class: 'lpbar' }, h('i', { style: `width:${pct}%` })),
        h('div', { class: 'pl2' }, h('span', null, `🂠 ${p.deckCount}`), h('span', { class: 'hn', title: 'Cartas en la mano' }, `✋ Mano: ${p.handCount}`), h('button', { onclick: e => { e.stopPropagation(); showGrave(seat); }, title: 'Cementerio' }, `☠ ${p.grave.length}`), p.banish && p.banish.length ? h('span', { title: 'Zona de destierro' }, `🌀 ${p.banish.length}`) : null));
    }
    /** Un campo completo: placa + fila de monstruos + fila de magias/trampas. top = fila de arriba (la placa va por fuera). */
    function fieldEl(seat, top, big) {
      const p = v.players[seat], order = top ? ['st', 'mz'] : ['mz', 'st'];
      const rows = order.map(area => h('div', { class: 'zrow' }, [0, 1, 2].map(z => zoneEl(seat, area, z, !top))));
      const cls = 'field' + (big ? '' : ' small') + (seat === v.seat ? ' mine' : isAlly(seat) ? ' ally' : ' foe') + (!p.alive ? ' dead' : '') + (v.current === seat && v.winner === null && p.alive ? ' turn' : '');
      return h('div', { class: cls, 'data-seat': seat }, top ? plate(seat) : null, ...rows, top ? null : plate(seat));
    }
    /** Dónde se sienta cada uno: arriba los rivales (y en 2 contra 2, abajo mi compañero). */
    function layout() {
      const s0 = v.seat, at = k => (s0 + k) % v.n;
      if (v.n === 3) return { top: [at(1), at(2)], bot: [s0] };
      if (v.mode === 'teams') return { top: [at(1), at(3)], bot: [s0, at(2)] };
      return { top: [at(1), at(2)], bot: [s0, at(3)] };
    }
    /** Espectador (eliminado): las manos de los jugadores que siguen en la partida. */
    function specHands() {
      const rows = v.players.filter((p, q) => q !== v.seat && p.alive).map(p => h('div', { style: 'margin:.4em 0' },
        h('h3', null, nameOf(p.seat) + ' · ' + p.handCount + ' cartas en la mano'),
        p.handCount ? h('div', { class: 'cands' }, p.hand.map(c => c ? h('div', { style: 'text-align:center;font-size:13px' }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)) : null)) : h('p', { class: 'sub' }, 'Sin cartas en la mano.')));
      modal(h('div', { class: 'box' }, h('h2', null, 'Manos de los que siguen'), rows.length ? rows : h('p', null, 'No queda nadie.'), btn('Cerrar', closeModal, 'ghost')));
    }
    function showGrave(seat) {
      const g = v.players[seat].grave;
      modal(h('div', { class: 'box' }, h('h2', null, seat === v.seat ? 'Tu cementerio' : 'Cementerio de ' + nameOf(seat)), g.length ? h('div', { class: 'cands' }, g.map(c => h('div', { style: 'cursor:pointer;text-align:center', onclick: () => modal(h('div', { class: 'box' }, detailBox(c.id), btn('Cerrar', closeModal))) }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)))) : h('p', { class: 'sub' }, 'Vacío.'), btn('Cerrar', closeModal, 'ghost')));
    }
    /** Icono de una línea del registro, según lo que pasó. */
    const logIcon = t => /^Turno/.test(t) ? '⏳' : /come espinaca/.test(t) ? '🥬' : /explota/.test(t) ? '💣' : /ataca/.test(t) ? '⚔️' : /negado|anulada|rebota/.test(t) ? '🛡️' :
      /destruid|destruye/.test(t) ? '💥' : /daño|pierde|refleja/.test(t) ? '🔥' : /recupera/.test(t) ? '💚' : /^invoca|^revive|queda en/.test(t) ? '✨' : /boca abajo/.test(t) ? '🂠' :
      /^voltea/.test(t) ? '🔄' : /cambia a/.test(t) ? '🔁' : /trampa/.test(t) ? '🪤' : /^activa|equipa/.test(t) ? '🔮' : /^roba|agrega/.test(t) ? '🃏' : /descarta/.test(t) ? '🗑️' :
      /fase de batalla|ofrece/.test(t) ? '⚔' : /fuera|Fin del duelo|Empate/.test(t) ? '🏁' : '•';
    // ---- chat de la partida (sólo online) ----
    const chatSt = { msgs: [], open: true, muted: false, unread: 0 };
    let chatBox = null, chatList = null, chatDot = null, chatIn = null;
    function chatPaint() {
      if (!chatList) return;
      chatList.replaceChildren(...chatSt.msgs.slice(-6).map(m => h('div', { class: 'cm ' + m.who }, h('b', null, m.name + ': '), m.text)));
      chatList.scrollTop = chatList.scrollHeight;
      chatDot.style.display = chatSt.unread && !chatSt.open ? '' : 'none';
      chatDot.textContent = chatSt.unread;
    }
    function chatAdd(m, who) {
      chatSt.msgs.push({ name: m.name, text: m.text, who });
      if (chatSt.msgs.length > 40) chatSt.msgs.shift();
      if (who !== 'me' && !chatSt.open) chatSt.unread++;
      chatPaint();
    }
    function chatSend() {
      const t = chatIn.value;
      if (!t.trim()) return;
      const r = match.chat(t);
      if (r.ok) { chatAdd({ name: nameOf(v.seat), text: r.text }, 'me'); chatIn.value = ''; }
      else if (r.why === 'wait') { chatIn.classList.add('shake'); setTimeout(() => chatIn.classList.remove('shake'), 400); }
    }
    function chatEl() {
      if (chatBox || typeof match.chat !== 'function') return chatBox;
      chatList = h('div', { class: 'cmsgs', 'aria-live': 'polite' });
      chatDot = h('i', { class: 'cdot' });
      chatIn = h('input', { class: 'cin', type: 'text', maxlength: 120, placeholder: 'Escribe un mensaje…', autocomplete: 'off', 'aria-label': 'Mensaje de chat' });
      chatIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); chatSend(); } });
      const body = h('div', { class: 'cbody' }, chatList, h('div', { class: 'cform' }, chatIn, h('button', { class: 'csend', onclick: chatSend, title: 'Enviar' }, '➤')));
      const mute = h('button', { class: 'ib sm', title: 'Silenciar el chat del rival', onclick: () => { chatSt.muted = !chatSt.muted; mute.textContent = chatSt.muted ? '🔇' : '🔊'; } }, '🔊');
      const tog = h('button', { class: 'ib sm', title: 'Plegar / abrir el chat', onclick: () => { chatSt.open = !chatSt.open; chatSt.unread = 0; chatBox.classList.toggle('closed', !chatSt.open); tog.textContent = chatSt.open ? '▾' : '▴'; chatPaint(); if (chatSt.open) chatIn.focus(); } }, '▾');
      chatBox = h('div', { class: 'chat' }, h('div', { class: 'chead' }, h('span', null, '💬 Chat', chatDot), h('span', { class: 'cbtns' }, mute, tog)), body);
      match.onChat(m => {
        if (chatSt.muted) return;
        chatAdd(m, m.seat != null && v && isAlly(m.seat) ? 'ally' : 'foe');
        if (!chatSt.open) S.play && S.play('tab');
      });
      return chatBox;
    }
    /** Lista fija con las últimas acciones: la más nueva arriba y más grande; las viejas se van apagando. */
    let feedLastN = null;
    function feedEl() {
      const items = v.log.slice(-6).reverse();
      const top = v.log.length ? v.log[v.log.length - 1].n : 0;
      const box = h('div', { class: 'feed', 'aria-live': 'polite' }, items.map((l, i) => {
        const who = l.p < 0 ? 'x' : l.p === v.seat ? 'me' : isAlly(l.p) ? 'ally' : 'foe';
        const isNew = feedLastN != null && l.n > feedLastN;
        return h('div', { class: 'fe ' + who + (i === 0 ? ' top' : '') + (isNew ? ' new' : '') + (/^Turno/.test(l.t) ? ' turn' : ''), style: `opacity:${[1, .9, .78, .66, .54, .42][i]}` },
          h('i', null, logIcon(l.t)), h('span', null, l.p >= 0 ? h('b', null, nameOf(l.p) + ' ') : null, l.t + (l.q != null ? ' → ' + nameOf(l.q) : '')));
      }));
      feedLastN = top;
      return box;
    }
    const fmtLog = l => (l.p >= 0 ? nameOf(l.p) + ' ' : '') + l.t + (l.q != null ? ' → ' + nameOf(l.q) : '');
    function showLog() {
      modal(h('div', { class: 'box' }, h('h2', null, 'Registro'),
        h('div', { class: 'logbox' }, v.log.slice().reverse().map(l => h('div', { class: l.p < 0 ? 'lx' : (l.p === v.seat ? 'l0' : 'l1') }, fmtLog(l)))), btn('Cerrar', closeModal, 'ghost')));
    }
    /** Orden final: ganadores primero y luego, de último a primero en caer. */
    function standings() {
      const win = v.winner;
      if (win === 'draw' || win == null || win === -1) return v.players.map(q => q.seat);
      const winners = v.players.filter(q => v.team[q.seat] === win).map(q => q.seat);
      return winners.concat(v.rank.slice().reverse().filter(q => !winners.includes(q)));
    }
    let endEarned = 0;
    function showEnd() {
      if (modalEl && modalEl.dataset.end) return;
      const myTeam = v.team[v.seat], won = v.winner === myTeam, draw = v.winner === 'draw' || v.winner === -1;
      let earned = 0;
      const vsAI = !!(current && current.match && current.match.kind === 'ia');
      if (!endSounded) { endSounded = true; S.setTrack(null); S.setAmbient(false); S.jingle(won ? 'win' : 'lose'); if (!C.test) earned = D.Shop.reward(!vsAI, won); rankFinish(false); endEarned = earned; }
      else earned = endEarned;
      const parts = [];
      for (let i = 0; i < (won ? 46 : 26); i++) parts.push(h('i', { style: `left:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 3).toFixed(2)}s;--t:${(3 + Math.random() * 4).toFixed(2)}s;--x:${((Math.random() - .5) * 120) | 0}px;--c:${(Math.random() * 360) | 0};--z:${(.5 + Math.random()).toFixed(2)}` }));
      let sub = v.reason || '', list = null;
      if (multi() && !draw) {
        const order = standings(), winners = order.filter(q => v.team[q] === v.winner);
        if (v.mode === 'teams') {
          sub = 'Equipo ganador: ' + winners.map(nameOf).join(' y ');
          list = h('div', { class: 'standings' }, order.map((q, i) => h('div', { class: 'st' + (v.team[q] === v.winner ? ' w' : '') + (q === v.seat ? ' me' : '') }, h('b', null, v.team[q] === v.winner ? '🏆' : '·'), nameOf(q), h('small', null, v.team[q] === v.winner ? 'Ganó' : 'Cayó'))));
        } else {
          sub = won ? `Eres el último en pie.` : `Ganó ${nameOf(winners[0])}. Quedaste ${order.indexOf(v.seat) + 1}.º de ${v.n}.`;
          list = h('div', { class: 'standings' }, order.map((q, i) => h('div', { class: 'st' + (i === 0 ? ' w' : '') + (q === v.seat ? ' me' : '') }, h('b', null, i === 0 ? '🏆' : (i + 1) + '.º'), nameOf(q))));
        }
      }
      if (current && current.tutEnd) { current.tutEnd(); tutMark(); }           // el tutorial no se queda encima del resultado
      // motivo explicado + pista de la regla (1 contra 1)
      let hint = '';
      if (!multi() && !draw) {
        if (/sin PV/.test(v.reason || '')) { sub = won ? 'Los PV del rival llegaron a 0.' : 'Tus PV llegaron a 0.'; hint = 'Gana quien deja los PV del rival en 0 (se empieza con 8000).'; }
        else if (/robar/.test(v.reason || '')) { sub = won ? 'Al rival no le quedaban cartas para robar.' : 'No te quedaban cartas para robar.'; hint = 'Si tienes que robar y tu mazo está vacío, pierdes.'; }
      }
      // puntos ganados y tope diario contra la computadora
      let ptsLine = null;
      if (!C.test && vsAI) {
        const t = D.Shop.aiToday();
        ptsLine = earned ? h('p', { class: 'earned' }, '✦ +' + earned + ' puntos', h('small', null, ` · hoy ${t.got}/${t.cap} contra la computadora`))
          : t.got >= t.cap ? h('p', { class: 'earned cap' }, 'Llegaste al máximo de hoy contra la computadora (' + t.cap + '/' + t.cap + ' ✦).', h('small', null, 'Mañana vuelve a sumar. Online y la recompensa diaria no tienen este tope.')) : null;
      } else if (earned) ptsLine = h('p', { class: 'earned' }, '✦ +' + earned + ' puntos');
      // resumen de la partida (1 contra 1)
      let recap = null;
      if (!multi() && v.me && v.players.length === 2) {
        const foe = v.players.find(q => q.seat !== v.seat), lp = x => Math.max(0, x.lp), kills = x => (x.grave || []).length;
        const cell = (a, b) => h('div', null, h('b', null, b), h('small', null, a));
        recap = h('div', { class: 'recap' }, cell('Turnos', v.round != null ? v.round : v.turn), cell('Tus PV', lp(v.me)), cell('PV rival', lp(foe)), cell('Tu cementerio', kills(v.me)), cell('Cementerio rival', kills(foe)));
      }
      const box = h('div', { class: 'endscr ' + (draw ? 'draw' : won ? 'win' : 'lose') },
        h('div', { class: 'rays' }), h('div', { class: 'parts' }, parts),
        h('div', { class: 'endbox' }, h('div', { class: 'endkick' }, draw ? 'Fin del duelo' : won ? 'Duelo ganado' : 'Duelo perdido'),
          h('h2', null, draw ? 'EMPATE' : won ? '¡VICTORIA!' : 'DERROTA'), h('p', { class: 'sub' }, sub), hint ? h('p', { class: 'hintr' }, hint) : null, recap, ptsLine, rankRes ? rankLine(rankRes) : null, list,
          h('div', { class: 'row' }, opts.rematch ? btn('Revancha', () => { closeModal(); opts.rematch(); }, 'gold big') : null, btn('Menú', menu, opts.rematch ? 'ghost big' : 'gold big'))));
      modal(box, false); modalEl.dataset.end = 1; modalEl.classList.add('endmodal');
    }

    // ----- sonidos y efectos de lo que acaba de pasar -----
    /** Animación de Popeye: destello verde con una hoja de espinaca. */
    // ----- apariciones a pantalla grande (cartas y personajes), una detrás de otra; tocar la pantalla salta la actual -----
    function cutAdd(c) {
      if (c.short && (cutQ.length || cutBusy)) return;                  // las acciones menores no se acumulan
      c.ms = c.k === 'card' ? 2400 : c.short ? 1500 : 2300;
      if (cutQ.length >= 3) cutQ.shift();
      cutQ.push(c);
    }
    function cutBuild(c) {
      const d = c.d;
      if (c.k === 'card') {
        const card = cardEl(d);
        return h('div', { class: 'cutin cardcut' + (c.trap ? ' trap' : ''), style: `animation-duration:${c.ms}ms` },
          h('div', { class: 'cc', style: `animation-duration:${c.ms}ms` }, card, h('div', { class: 'tag' }, c.trap ? '¡Trampa activada!' : '¡Magia activada!')));
      }
      const col = (C.TYPE_COLOR && C.TYPE_COLOR[d.type]) || '#ffd84a';
      const fig = d.img ? h('img', { src: d.img, alt: d.name, draggable: 'false' }) : sprite(d);
      const el = h('div', { class: 'cutin cutc' + (c.mine ? '' : ' foe') + (c.short ? ' short' : ''), style: `--tc:${col};--ms:${c.ms}ms` },
        h('div', { class: 'cbg' }), h('div', { class: 'cfig' }, fig),
        h('div', { class: 'ctx' }, h('b', null, d.name), c.text ? h('span', null, c.text) : null));
      return el;
    }
    function cutPump() {
      if (cutBusy || !cutQ.length || current !== cur) { if (current !== cur) cutQ = []; return; }
      const c = cutQ.shift(); cutBusy = true;
      const el = cutBuild(c); document.body.append(el);
      const cd = el.querySelector('.cardcut .card'); if (cd) { const f = parseFloat(getComputedStyle(cd).fontSize) || 12, k = Math.min(innerWidth * .7 / cd.offsetWidth, innerHeight * .62 / cd.offsetHeight); cd.style.fontSize = (f * k) + 'px'; }
      let t = 0;
      const done = () => { clearTimeout(t); el.remove(); cutBusy = false; cutPump(); };
      t = setTimeout(done, c.ms);
      el.addEventListener('pointerdown', done);
    }
    function spinachFx() {
      if (document.documentElement.classList.contains('rm')) return;
      const e = h('div', { class: 'spinach' }, h('span', null, '🥬'), h('b', null, '¡A comer espinaca!'));
      document.body.append(e); setTimeout(() => e.remove(), 1700);
    }
    function logEvents() {
      const fresh2 = v.log.filter(l => l.n > lastLogN);
      if (v.log.length) lastLogN = Math.max(lastLogN, v.log[v.log.length - 1].n);
      if (firstView) return;
      let i = 0; lastFam = null;
      for (const l of fresh2) {
        const t = l.t; let snd = null;
        const cin = (d, text, o) => { if (d && d.kind === 'monster') cutAdd(Object.assign({ k: 'char', d, text, mine: l.p === v.seat }, o || {})); };
        if (/^Turno/.test(t)) snd = (!multi() || l.p === v.seat) ? 'turn' : null;
        else if (/^queda fuera/.test(t)) { snd = 'destroy'; needShake = true; pops.push({ t: l.p === v.seat ? 'Quedaste fuera' : nameOf(l.p) + ' queda fuera', cls: 'weak' }); }
        else if (/^invoca a|(?<!se )invoca especialmente a /.test(t)) { const m = /invoca (?:especialmente )?a (.+?)(?: \(ATK.*)?$/.exec(t), d = m && byName[m[1]]; snd = d && d.level >= 7 ? 'epic' : 'summon'; if (d) fileSfx(d.sfx && d.sfx.summon); if (d && !multi()) cin(d, '', { short: true }); }
        else if (/^revive a/.test(t)) snd = 'summon';
        else if (/come espinaca/.test(t)) { snd = 'epic'; spinachFx(); S.voice(byName['Popeye El Marinero']); cin(byName['Popeye El Marinero'], '¡A comer espinaca!'); }
        else if (/ explota!/.test(t)) { snd = 'explosion'; needShake = true; S.voice(byName['Creeper']); cin(byName['Creeper'], '¡BOOM!'); }
        else if (/boca abajo/.test(t)) snd = 'set';
        else if (/^voltea/.test(t)) snd = 'flip';
        else if (/cambia a/.test(t)) snd = 'pos';
        else if (/^activa la trampa /.test(t)) { snd = 'trap'; const d = byName[t.slice(17)]; if (d) { cutAdd({ k: 'card', d, trap: true, mine: l.p === v.seat }); fileSfx(d.sfx && d.sfx.use); } }
        else if (/^activa /.test(t)) { snd = 'spell'; const d = byName[t.slice(7)]; if (d) { cutAdd({ k: 'card', d, mine: l.p === v.seat }); fileSfx(d.sfx && d.sfx.use); } }
        else if (/^Lara Tybur muere y se invoca especialmente a /.test(t)) { snd = 'epic'; needShake = true; const d = byName['Lara Tybur']; if (d) { fileSfx(d.sfx && d.sfx.transform); cin(d, '¡TRANSFORMACIÓN! → Titán Martillo'); } }
        else if (/ se transforma en /.test(t) || / se muerde la mano/.test(t)) { snd = 'epic'; const m = /^(.+?) (?:se transforma en|se muerde)/.exec(t), d = m && byName[m[1]]; if (d) { const to = / se transforma en ([^:]+?)(?::|$)/.exec(t), toD = to && byName[to[1]]; fileSfx((toD && toD.sfx && toD.sfx.transform) || (d.sfx && d.sfx.transform)); cin(d, '¡TRANSFORMACIÓN!' + (to ? ' → ' + to[1] : '')); } }
        else if (/ usa Big Bang| activa Relicario| activa el dominio /.test(t)) { snd = 'explosion'; needShake = true; const m = /^(.+?) (?:usa|activa) /.exec(t), d = m && byName[m[1]]; if (d) { fileSfx(d.sfx && d.sfx.ability); cin(d, / Big Bang/.test(t) ? 'BIG BANG' : / el dominio /.test(t) ? 'ATAÚD DE LA MONTAÑA DE HIERRO' : 'RELICARIO DEMONÍACO'); } }
        else if (/ sella con sus telarañas /.test(t)) { snd = 'epic'; const d = byName[/^(.+?) sella /.exec(t)[1]]; if (d) { fileSfx(d.sfx && d.sfx.ability); cin(d, 'TELARAÑAS'); } }
        else if (/^Total Counter: /.test(t)) { snd = 'shield'; const d = byName['Meliodas 5%']; if (d) { fileSfx(d.sfx && d.sfx.ability); cin(d, 'TOTAL COUNTER', { mine: l.p === v.seat }); } }
        else if (/\(Asimilación\)/.test(t)) { snd = 'epic'; const d = byName['General Mahoraga']; if (d) { fileSfx(d.sfx && d.sfx.ability); cin(d, 'ASIMILACIÓN'); } }
        else if (/^Rika Orimoto intercepta /.test(t)) { snd = 'shield'; needShake = true; const d = byName['Yuta Okkotsu']; if (d) { fileSfx(d.sfx && d.sfx.rika); cin(d, 'RIKA · INTERCEPCIÓN', { mine: l.p === v.seat }); } }
        else if (/^Protección del Ojo del Crepúsculo — /.test(t)) { snd = 'shield'; needShake = true; const d = byName['Shen']; if (d) cin(d, 'PROTECCIÓN DEL OJO DEL CREPÚSCULO', { mine: l.p === v.seat }); pops.push({ t: t.replace(/^.*? — /, ''), cls: 'weak' }); }
        else if (/ intercepta /.test(t)) { snd = 'shield'; needShake = true; }
        else if (/^Yuta Okkotsu aprende /.test(t)) { snd = 'epic'; const d = byName['Yuta Okkotsu']; if (d) cin(d, 'COPIA DE TÉCNICAS'); }
        else if (/ muere en lugar de /.test(t)) { snd = 'destroy'; needShake = true; }
        else if (/sucumbe a la corrupción|La Marca de Cazador se cumple/.test(t)) { snd = 'destroy'; needShake = true; }
        else if (/^(.+?) (?:usa|absorbe) /.test(t) && !/ inmune/.test(t)) { const m = /^(.+?) (usa (.+?)(?: contra .*|: .*)?|absorbe a .*)$/.exec(t), d = m && byName[m[1]]; if (d) { snd = 'epic'; fileSfx(d.sfx && d.sfx.ability); cin(d, m[3] ? m[3].toUpperCase() : 'ABSORCIÓN'); } }
        else if (l.rv && /^se revela: /.test(t)) {          // el objetivo boca abajo se voltea: el aviso «versus» muestra ya su carta
          const q = atkTg.find(x => x.vs === l.rv.vs && x.tg === l.rv.z && x.ti == null);
          if (q) { q.ti = l.rv.ti; q.tpos = l.rv.tpos; q.tv = null; }
          else revealMark(l.rv);
        }
        else if (/ataca/.test(t)) {
          const nm = /^(.+) ataca/.exec(t), d = nm && byName[nm[1]]; lastFam = famOf(d); snd = 'atk_' + lastFam;
          if (nm) atkFx.push({ name: nm[1], p: l.p, fam: lastFam });
          if (l.a) atkTg.push(Object.assign({ p: l.p, who: nm && nm[1] }, l.a));
          if (d && d.sfx) fileSfx(d.sfx.attack);
          cin(d, d && d.voice && d.voice.say && d.type !== 'popeye' ? d.voice.say : '¡ATAQUE!');
        }
        else if (/Todos los monstruos son destruidos/.test(t)) { snd = 'explosion'; needShake = true; }
        else if (/destruid|destruye/.test(t)) snd = 'destroy';
        else if (/ataque es negado|refleja el ataque/.test(t)) snd = 'shield';
        else if (/negado|anulada/.test(t)) snd = 'negate';
        else if (/agrega un monstruo|^roba |^descarta|se revela|fase de batalla/.test(t)) snd = 'select';
        if (snd) { S.play(snd, i * 170); i++; }
      }
    }
    const rectOf = k => { const z = document.querySelector('.zone[data-k="' + k + '"]'); return z ? z.getBoundingClientRect() : null; };
    function elemFx(cx, cy, size, fam, big) {
      if (document.documentElement.classList.contains('rm')) return;
      const e = h('div', { class: 'efx ' + fam + (big ? ' big' : ''), style: `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px` });
      const n = { fire: 7, water: 3, electric: 3, ice: 7, nature: 9, mystic: 4, phys: 3 }[fam] || 3;
      for (let i = 0; i < n; i++) {
        const k = h('i', { style: `--i:${i};--r:${(i * 360 / n + Math.random() * 20) | 0}deg;--d:${(Math.random() * .25).toFixed(2)}s;--s:${(.7 + Math.random() * .6).toFixed(2)}` });
        if (fam === 'electric') k.innerHTML = `<svg viewBox="0 0 40 100"><polyline points="${boltPts()}"/></svg>`;
        e.append(k);
      }
      e.append(h('b', { class: 'core' }));
      document.body.append(e); setTimeout(() => e.remove(), 1300);
    }
    const boltPts = () => { let x = 20, y = 0, a = ''; while (y < 100) { a += `${x.toFixed(0)},${y} `; x = 20 + (Math.random() - .5) * 30; y += 14 + Math.random() * 10; } return a + '20,100'; };
    /** Aviso «versus» de cada ataque (lo ven todos): atacante a la izquierda, objetivo a la derecha. Espera a que acaben los cortes a pantalla grande. */
    function atkMark(a, tries) {
      if (current !== cur || innerWidth <= 560) return;   // en el móvil no se muestra (ocupa demasiado)
      if ((cutBusy || cutQ.length) && (tries || 0) < 40) { setTimeout(() => atkMark(a, (tries || 0) + 1), 150); return; }
      const direct = a.tg === 'direct', mine = a.p === v.seat, ally = mine || isAlly(a.p);
      const fig = (d, q) => d ? (d.img ? h('img', { src: cosArt(cosOf(q), d.id) || d.img, alt: d.name, draggable: 'false' }) : sprite(d, 56)) : h('span', { class: 'qm' }, '?');      // con la skin de su dueño
      const ad = a.ci ? C.get(a.ci) : (a.who && byName[a.who]) || null, td = a.ti ? C.get(a.ti) : null;
      const owner = q => (q === v.seat ? 'Tú' : shortOf(q));
      const left = h('div', { class: 'vs-side l ' + (ally ? 'good' : 'bad') }, h('div', { class: 'vs-fig' }, fig(ad, a.p)),
        h('div', { class: 'vs-tx' }, h('b', null, (ad && ad.name) || a.who || 'Monstruo'), h('small', null, '⚔ ' + (a.at != null ? 'ATK ' + a.at + ' · ' : '') + owner(a.p))));
      const rightAlly = a.vs === v.seat || isAlly(a.vs);
      const right = direct
        ? h('div', { class: 'vs-side r ' + (rightAlly ? 'good' : 'bad') }, h('div', { class: 'vs-fig av' }, lookOf(a.vs).emoji || (owner(a.vs)[0] || '?').toUpperCase()),
          h('div', { class: 'vs-tx' }, h('b', null, owner(a.vs)), h('small', null, '💥 ATAQUE DIRECTO')))
        : h('div', { class: 'vs-side r ' + (rightAlly ? 'good' : 'bad') }, h('div', { class: 'vs-fig' }, fig(td, a.vs)),
          h('div', { class: 'vs-tx' }, h('b', null, td ? td.name : 'Carta boca abajo'), h('small', null, (td ? (a.tpos === 'atk' ? '⚔ ATK ' : '🛡 DEF ') + a.tv + ' · ' : '') + owner(a.vs))));
      const el = h('div', { class: 'vsban' }, left, h('div', { class: 'vs-mid' }, '⚔'), right);
      document.body.append(el);
      curBan = { el, a, right };
      setTimeout(() => { el.remove(); if (curBan && curBan.el === el) curBan = null; }, direct || td ? 2300 : 3200);
    }
    let curBan = null;
    /** Un monstruo boca abajo atacado se revela: el aviso que ya está en pantalla cambia el «?» por su carta. */
    function revealMark(r) {
      const b = curBan; if (!b || !b.el.isConnected || b.a.vs !== r.vs || b.a.tg !== r.z) return;
      const d = C.get(r.ti); if (!d) return;
      const fig = b.right.querySelector('.vs-fig'), tx = b.right.querySelector('.vs-tx');
      if (fig) fig.replaceChildren(d.img ? h('img', { src: cosArt(cosOf(r.vs), d.id) || d.img, alt: d.name, draggable: 'false' }) : sprite(d, 56));
      if (tx) tx.replaceChildren(h('b', null, d.name), h('small', null, (r.tpos === 'atk' ? '⚔ ' : '🛡 ') + 'Se revela · ' + (r.vs === v.seat ? 'Tú' : shortOf(r.vs))));
      b.right.classList.add('flip');
    }
    window.__duelo_atkMark = a => atkMark(a);
    function runFx() {
      for (const a of atkTg) atkMark(a);
      atkTg = [];
      // preparación del atacante (efecto del elemento)
      for (const a of atkFx) {
        const zi = a.p >= 0 && v.players[a.p] ? v.players[a.p].mz.findIndex(z => z && z.c && C.get(z.c.id).name === a.name) : -1;
        const r = zi >= 0 ? rectOf('s' + a.p + '-mz-' + zi) : null;
        if (r) elemFx(r.left + r.width / 2, r.top + r.height / 2, r.width * 2.1, a.fam, false);
      }
      atkFx = [];
      for (const p of pops) {
        const el = h('div', { class: 'effpop ' + p.cls }, p.t); document.body.append(el); setTimeout(() => el.remove(), 1500);
      }
      pops = [];
      for (const f of fx) {
        if (f.type === 'pc') {
          const pc = document.querySelector('.plate[data-seat="' + f.pc + '"], .pcard[data-seat="' + f.pc + '"]');
          if (pc) { const r = pc.getBoundingClientRect(); elemFx(r.left + r.width / 2, r.top + r.height / 2, Math.max(r.width, 220), f.fam, true); pc.classList.add('hurt'); setTimeout(() => pc.classList.remove('hurt'), 600); }
          continue;
        }
        const r = rectOf(f.k); if (!r) continue;
        if (f.type === 'gone' && f.fam) elemFx(r.left + r.width / 2, r.top + r.height / 2, r.width * 2.6, f.fam, true);
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, zel = document.querySelector('.zone[data-k="' + f.k + '"]'), zs = (parseFloat(getComputedStyle(zel).fontSize) || 10) * (r.width / zel.offsetWidth);
        if (f.type === 'gone') {
          const c = f.card, hs = c.id && !c.down && Holo.src(c.id, c.art);
          const g = hs ? h('div', { class: 'ghostholo', style: `left:${cx}px;top:${cy - r.height * .35}px;width:${r.width * 1.1}px;height:${r.height * 1.5}px` }, h('img', { src: hs, alt: '' }))
            : h('div', { class: 'ghostcard', style: `left:${cx}px;top:${cy}px;font-size:${zs}px` }, c.id ? cardEl(C.get(c.id), { down: c.down, pos: c.pos, art: c.art || null }) : cardEl(null, { down: true }));
          document.body.append(g); setTimeout(() => g.remove(), 800);
        } else {
          const size = r.width * (f.type === 'epic' ? 3.8 : f.type === 'small' ? 2 : 3);
          const b = h('div', { class: 'fxburst ' + f.type, style: `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px` }, h('div', { class: 'glow' }), h('div', { class: 'rays' }));
          document.body.append(b); setTimeout(() => b.remove(), 1400);
        }
      }
      fx = [];
      cut = []; cutPump();
      if (needShake) { const g = document.querySelector('.game'); if (g) { g.classList.add('shake'); setTimeout(() => g.classList.remove('shake'), 500); } needShake = false; }
    }

    const TILT = D.Scene.TILT;
    function fitBoard() {
      if (!gameEl) return;
      const q = sel2 => gameEl.querySelector(sel2);
      const st = q('.stage'), b = q('.board3d'), pr = q('.persp'), top = q('.hud-top'), bot = q('.hud-bot');
      if (!st || !b) return;
      const sw = st.clientWidth, sh = st.clientHeight, bw = b.offsetWidth, bh = b.offsetHeight;
      const rt = top ? Math.max(0, top.offsetHeight - 34) : 0, rb = bot ? Math.max(0, bot.offsetHeight - 40) : 0, avail = sh - rt - rb;
      const k = Math.max(0.2, Math.min(sw / ((bw + 150) * 1.12), (avail - 4) / (bh * Math.cos(TILT * Math.PI / 180) * 1.06 + 6)));
      b.style.setProperty('--k', k.toFixed(3));
      b.style.top = Math.round(rt + avail / 2) + 'px';
      pr.style.perspective = Math.round(bw * k * 2.6) + 'px';
    }
    window.addEventListener('resize', fitBoard);
    cur.cleanup0 = () => window.removeEventListener('resize', fitBoard);

    function render() {
      if (!v) return;
      fresh = newView; newView = false;
      if (fresh) {
        logEvents();
        lpEvents();
        if (!firstView && prevHandN != null && v.me.handCount > prevHandN) S.play('draw');
        prevHandN = v.me.handCount;
        // música más tensa con poca vida
        const low = Math.min(...v.players.filter(q => q.alive).map(q => q.lp)) <= 2500 && v.winner === null;
        if (low !== lowTrack) { lowTrack = low; S.setTrack(low ? 'tense' : 'battle'); }
      }
      const my = myTurn();
      const dis = v.pending && v.pending.player === v.seat;
      const hand = h('div', { class: 'hand' + (v.me.hand.length <= 5 ? ' few' : '') });
      const discarding = dis && v.pending.k === 'discard';
      v.me.hand.forEach((c, i) => {
        const d = C.get(c.id);
        const can = my && !v.pending && L().some(a => a.hand === i);
        const el = cardEl(d); if (can) el.classList.add('can');
        el.onclick = () => { if (discarding) return act({ t: 'discard', hand: i }); if (sel) { sel = null; render(); } handClick(i); };
        hand.append(el);
      });
      const fan = h('div', { class: 'opphand' }, multi() ? null : Array.from({ length: Math.min(v.opp.handCount, 9) }, (_, i) => h('i', { style: `--r:${(i - 4) * 3}deg` })));
      const meOut = !v.me.alive && v.winner === null;
      let banner = null;
      if (sel) banner = h('div', { class: 'banner' }, sel.text, sel.kind === 'tribute' ? ` (${sel.chosen.length}/${sel.need})` : '',
        sel.direct ? btn('Directo', sel.direct, 'gold') : null, btn('Cancelar', () => { sel = null; render(); }, 'ghost'));
      else if (discarding) banner = h('div', { class: 'banner' }, `Tienes demasiadas cartas: descarta ${v.pending.excess}. Toca una de tu mano.`);
      else if (meOut) banner = h('div', { class: 'banner wait' }, `Quedaste fuera (${place(v.seat)}.º). Sigues viendo la partida.`, btn('Ver manos', specHands, 'gold'), btn('Salir', menu, 'ghost'));
      else if (!my && v.winner === null) banner = h('div', { class: 'banner wait' }, multi() ? `${shortOf(v.actor)} está jugando…` : v.actor === 1 - v.seat ? 'El rival está jugando…' : '…');
      const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
      const canBattle = my && !v.pending && L().some(a => a.t === 'toBattle');
      const canEnd = my && !v.pending && L().some(a => a.t === 'endTurn');
      const whose = v.current === v.seat ? 'Tu turno' : multi() ? 'Turno de ' + shortOf(v.current) : 'Turno rival';
      const turnTxt = `Turno ${v.round != null ? v.round : v.turn} · ${multi() && v.current !== v.seat ? shortOf(v.current) : whose} · ${v.phase === 'battle' ? 'Combate' : 'Principal'}`;
      const logTxt = lastLog ? fmtLog(lastLog) : '';
      const tkey = v.turn + ':' + v.current + ':' + (v.seq || 0);   // cada acción reinicia la cuenta
      if (tt.key !== tkey) tt = { key: tkey, t0: Date.now(), beeped: false };
      const timer = v.winner === null && v.players[v.current] && v.players[v.current].alive ? h('div', { class: 'turntimer' }, '⏱ ' + Math.max(0, TURN_SECS - Math.floor((Date.now() - tt.t0) / 1000)) + ' s') : null;
      if (timer && !ttInt) ttInt = setInterval(ttTick, 250);
      const hudTop = h('div', { class: 'hud-top' + (multi() ? ' multi' : '') },
        multi() ? null : pcard(v.opp.seat),
        h('div', { class: 'turnbox' }, h('div', { class: 'turnpill' }, turnTxt), timer, h('div', { class: 'logline' }, logTxt), fan),
        h('div', { class: 'tools' }, h('button', { class: 'ib', onclick: showLog, title: 'Registro' }, '📜'), h('button', { class: 'ib', onclick: soundPanel, title: 'Ajustes' }, '⚙️'),
          FS.wanted() ? h('button', { class: 'ib fsb', onclick: FS.toggle, title: 'Pantalla completa' }, FS.icon()) : null,
          h('button', { class: 'ib', onclick: () => { if (confirm(multi() ? '¿Rendirte? Quedarás fuera del duelo.' : '¿Rendirte?')) match.resign(); }, title: 'Rendirse' }, '🏳')));
      const acts = h('div', { class: 'acts-bot' },
        canBattle ? btn('⚔ Combate', () => act(L().find(a => a.t === 'toBattle')), 'gold big') : null,
        canEnd ? btn(v.phase === 'battle' ? 'Fin del turno' : 'Terminar turno', () => act(L().find(a => a.t === 'endTurn')), (canBattle ? 'teal' : 'gold') + ' big endturn') : null);
      const hudBot = h('div', { class: 'hud-bot' }, banner, h('div', { class: 'row-bot' }, pcard(v.seat), acts), hand);
      let rows;
      if (multi()) {
        const lay = layout();
        rows = [h('div', { class: 'frow top' }, lay.top.map(q => fieldEl(q, true, false))), h('div', { class: 'frow bot' }, lay.bot.map(q => fieldEl(q, false, lay.bot.length === 1)))];
      } else {
        rows = [];
        for (const [seat, areas] of [[v.opp.seat, ['st', 'mz']], [v.seat, ['mz', 'st']]]) for (const area of areas) rows.push(h('div', { class: 'zrow' }, [0, 1, 2].map(z => zoneEl(seat, area, z, seat === v.seat))));
      }
      if (zrowsEl) zrowsEl.className = 'zrows' + (multi() ? ' multi' : '');
      if (!gameEl) {
        zrowsEl = h('div', { class: 'zrows' });
        const slab = h('div', { class: 'slab' }, zrowsEl);
        D.Scene.build(slab);
        lcol = h('div', { class: 'lcol' });
        gameEl = h('div', { class: 'game' }, h('div', { class: 'stage' }, h('div', { class: 'persp' }, h('div', { class: 'board3d' }, slab))), lcol);
      }
      if (!gameEl.isConnected) app.replaceChildren(gameEl);
      gameEl.querySelector('.slab').classList.toggle('multi', multi());
      zrowsEl.replaceChildren(...rows);
      const hud = h('div', { class: 'hud' }, hudTop, hudBot);
      const oldFeed = lcol.querySelector('.feed'), newFeed = feedEl();
      if (oldFeed) oldFeed.replaceWith(newFeed); else lcol.prepend(newFeed);
      const cb = chatEl(); if (cb && !cb.isConnected) lcol.append(cb);
      const oldHud = gameEl.querySelector(':scope > .hud');
      if (oldHud) oldHud.replaceWith(hud); else gameEl.append(hud);
      // en móvil la barra de arriba ocupa varias filas: el registro de acciones va justo debajo (no tapa tarjetas ni turno)
      lcol.style.top = window.innerWidth <= 900 ? Math.round(hudTop.getBoundingClientRect().bottom + 4) + 'px' : '';
      fitBoard();
      pendingUI();
      if (fresh) { runFx(); firstView = false; }
      if (v.winner !== null) showEnd();
    }

    match.onView(nv => {
      prevLps = v ? v.players.map(q => q.lp) : null;
      v = nv; newView = true;
      if (sel && !myTurn()) sel = null;
      prepare();
      render();
    });
    match.onStatus(s => {
      if (s.k === 'closed' && v && v.winner === null) { /* el motor ya da la victoria al otro */ }
      if (s.k === 'rejected' && !v && !opts.wait) { alert('No se pudo empezar: ' + s.why); menu(); }
    });
    if (!opts.wait) { mount(h('div', { class: 'scr' }, h('p', { class: 'loading' }, 'Repartiendo…'))); }
    match.start();
    window.__duelo = { match, view: () => v, elemFx };
  }

  // ---------------- cuenta ----------------
  /** Barra de arriba del menú: quién eres y cómo cambiar de cuenta. */
  function acctBar() {
    const u = D.Account.user;
    if (!D.Account.cloud) return h('div', { class: 'acct' }, h('span', { class: 'sub' }, 'Sin conexión con la nube: tus mazos se guardan sólo en este navegador.'));
    if (u && !u.guest) return h('div', { class: 'acct' }, h('span', { class: 'who fr-' + D.Shop.equipped('fr').id.slice(3) }, (D.Shop.equipped('av').emoji || '👤') + ' ', h('b', null, u.name), D.Shop.equipped('ti').text ? h('small', { class: 'ttl' }, ' · ' + D.Shop.equipped('ti').text) : null), btn('Cuenta', accountModal, 'ghost sm'));
    return h('div', { class: 'acct' }, h('span', { class: 'sub' }, 'Invitado: sin guardar en la nube ni jugar online.'),
      btn('Entrar o crear cuenta', async () => { await D.Account.logout(); D.Online.reset(); loginScreen(); }, 'gold sm'));
  }

  async function afterLogin(isNew) {
    scr('boot');
    mount(h('div', { class: 'scr' }, h('p', { class: 'loading' }, 'Cargando tus mazos…')));
    D.Online.reset();
    await openStore(D.Account.user);
    menu();
    if (D.FriendsUI) D.FriendsUI.login().catch(e => console.warn('[Amigos]', e));
    if (!D.Account.user.guest && D.Account.isNameAccount() && !D.Account.hasGoogle()) offerRecovery();
  }

  function loginScreen() {
    scr('login');
    endCurrent(); showBg(true); S.setTrack('menu'); sndButton(true);
    setTimeout(() => { if (window.DueloSplash) window.DueloSplash.done(); }, 0);
    let mode = 'login';
    const err = h('div', { class: 'msg err', style: 'display:none' });
    const showErr = t => { err.textContent = t; err.style.display = t ? '' : 'none'; };
    const nameI = h('input', { type: 'text', placeholder: 'Tu nombre', autocomplete: 'username', maxlength: 16, 'aria-label': 'Nombre' });
    const passI = h('input', { type: 'password', placeholder: 'Contraseña', autocomplete: 'current-password', 'aria-label': 'Contraseña' });
    const go = h('button', { class: 'btn gold big', type: 'submit' }, 'Entrar');
    const tabs = ['login', 'register'].map(m => h('button', { type: 'button', class: 'tab' + (m === mode ? ' on' : ''), onclick: () => setMode(m) }, m === 'login' ? 'Entrar' : 'Crear cuenta'));
    function setMode(m) {
      mode = m; tabs.forEach((t, i) => t.classList.toggle('on', ['login', 'register'][i] === m));
      go.textContent = m === 'login' ? 'Entrar' : 'Crear cuenta';
      passI.autocomplete = m === 'login' ? 'current-password' : 'new-password'; showErr('');
    }
    const forgot = h('p', { class: 'sub', style: 'display:none' }, 'Si vinculaste tu Gmail a la cuenta, pulsa «Entrar con Google»: es la misma cuenta. Si no lo hiciste, no hay forma de recuperarla: crea una cuenta nueva.');
    const busy = on => { go.disabled = on; };
    const finish = async r => { busy(false); if (!r.ok) { showErr(r.error); return; } passI.value = ''; afterLogin(r.isNew); };
    const form = h('form', { class: 'panel', onsubmit: async e => {
      e.preventDefault(); showErr(''); busy(true);
      finish(await (mode === 'login' ? D.Account.login(nameI.value, passI.value) : D.Account.register(nameI.value, passI.value)));
    } }, h('div', { class: 'tabs' }, tabs), nameI, passI, err, go,
      h('a', { href: '#', class: 'sub', onclick: e => { e.preventDefault(); forgot.style.display = forgot.style.display ? '' : 'none'; } }, '¿Olvidaste la contraseña?'), forgot);
    const googleBtn = D.Account.cloud ? btn('Entrar con Google', async () => { showErr(''); finish(await D.Account.google()); }, '') : null;
    mount(h('div', { class: 'scr' }, h('h1', null, 'Shonen Royale'),
      h('p', { class: 'sub' }, 'Entra o crea tu cuenta gratis para guardar tus mazos en la nube y jugar online con tus amigos.'),
      form, googleBtn,
      btn('Jugar como invitado', () => { D.Account.guest(); afterLogin(false); }, 'ghost'),
      h('p', { class: 'sub' }, 'Como invitado juegas contra la computadora; los mazos se quedan sólo en este navegador.')));
    setTimeout(() => nameI.focus(), 50);
  }

  /** Una vez por sesión: «¿te da miedo perder tu cuenta?» (vincular el Gmail). */
  let offered = false;
  function offerRecovery() {
    const u = D.Account.user;
    if (offered || !u || u.guest) return;
    try { if (localStorage.getItem('duelo.recover.no.' + u.uid) || sessionStorage.getItem('duelo.recover.seen')) return; sessionStorage.setItem('duelo.recover.seen', '1'); } catch (e) { /* nada */ }
    offered = true;
    const err = h('div', { class: 'msg err', style: 'display:none' });
    modal(h('div', { class: 'box' }, h('h2', null, '¿Te da miedo perder tu cuenta?'),
      h('p', null, 'Tu cuenta de nombre y contraseña no tiene un correo real, así que si olvidas la contraseña no se puede recuperar. Vincula tu Gmail y, si te pasa, entras con Google y es la misma cuenta.'),
      err,
      btn('Vincular mi Gmail', async () => { const r = await D.Account.linkGoogle(); if (!r.ok) { err.textContent = r.error; err.style.display = ''; return; } closeModal(); }, 'gold'),
      btn('Ahora no', () => closeModal(), 'ghost'),
      btn('No volver a preguntar', () => { try { localStorage.setItem('duelo.recover.no.' + u.uid, '1'); } catch (e) { /* nada */ } closeModal(); }, 'ghost')));
  }

  function accountModal() {
    const u = D.Account.user;
    const msg = h('div', { class: 'msg', style: 'display:none' });
    const say = (t, bad) => { msg.textContent = t; msg.className = 'msg ' + (bad ? 'err' : 'ok'); msg.style.display = t ? '' : 'none'; };
    const pw = h('input', { type: 'password', placeholder: 'Tu contraseña para confirmar', autocomplete: 'current-password', style: 'display:none' });
    const rows = [h('h2', null, 'Tu cuenta'), h('div', null, 'Nombre: ', h('b', null, u.name))];
    if (D.Account.isNameAccount() && !D.Account.hasGoogle())
      rows.push(btn('Vincular mi Gmail (para recuperar la cuenta)', async () => { const r = await D.Account.linkGoogle(); say(r.ok ? '¡Gmail vinculado!' : r.error, !r.ok); }, ''));
    rows.push(btn('Cerrar sesión', async () => { closeModal(); await D.Account.logout(); D.Online.reset(); await openStore(null); loginScreen(); }, ''));
    let armed = false;
    rows.push(pw, msg, btn('Borrar mi cuenta', async () => {
      if (!armed) { armed = true; say('Se borrarán tu cuenta y tus mazos de la nube. Pulsa otra vez para confirmar.', true); if (D.Account.isNameAccount()) pw.style.display = ''; return; }
      const r = await D.Account.deleteAccount(pw.value);
      if (!r.ok) { say(r.error, true); return; }
      closeModal(); D.Online.reset(); await openStore(null); loginScreen();
    }, 'red'), btn('Cerrar', () => closeModal(), 'ghost'));
    modal(h('div', { class: 'box' }, ...rows));
  }

  // ---------------- novedades ----------------
  // ---------------- ranking ----------------
  const rkBadge = (pts, small) => { const t = D.Rank.tierOf(pts); return h('span', { class: 'rkb' + (small ? ' sm' : ''), style: `--rc:${t.tier.color}`, title: t.label + ' · ' + pts + ' PC' }, h('i', null, '⬢'), t.step >= 0 ? D.Rank.ROMAN[t.step] : 'GM'); };
  const rankLine = r => h('div', { class: 'rkres ' + (r.delta >= 0 ? 'up' : 'dn') }, rkBadge(r.after), h('b', null, (r.delta >= 0 ? '+' : '') + r.delta + ' PC'), h('span', null, r.to.label + ' · ' + r.after + ' PC'),
    r.rankUp ? h('em', null, '¡Subes a ' + r.to.label + '!') : r.rankDown ? h('em', { class: 'bad' }, 'Bajas a ' + r.to.label) : null);
  async function rankScreen() {
    scr('ranking');
    const R = D.Rank, u = D.Account.user, st = R.state(); S.setTrack('menu');
    const guestMsg = !u || u.guest ? 'Entra con una cuenta (nombre o Google) para jugar partidas con rango.' : null;
    const info = st ? R.tierOf(st.pts) : null;
    const tbl = h('div', { class: 'rktable' }, h('p', { class: 'sub' }, 'Cargando la tabla…'));
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Ranking'),
      h('div', { class: 'sub' }, R.seasonName(R.seasonId()) + ' · termina en ' + R.daysLeft() + ' días. Al empezar la siguiente, tus puntos pasan por un reinicio parcial.'),
      guestMsg ? h('div', { class: 'msg err' }, guestMsg) : null,
      info ? h('div', { class: 'rkme', style: `--rc:${info.tier.color}` }, h('div', { class: 'rkbig' }, h('i', null, '⬢'), h('b', null, info.step >= 0 ? R.ROMAN[info.step] : 'GM')),
        h('div', null, h('h2', null, info.label), h('div', { class: 'sub' }, `${st.pts} PC · ${st.w} victorias · ${st.l} derrotas`),
          info.to ? h('div', { class: 'rkbar' }, h('i', { style: `width:${info.pct}%` })) : null,
          h('small', null, info.to ? `Te faltan ${info.next} PC para ${R.tierOf(info.to).label}` : 'Eres Gran Maestro: sigue sumando para subir en la tabla.'))) : null,
      seasonPrizes(st),
      h('h2', null, 'Los mejores de la temporada'), tbl,
      h('details', { class: 'rkinfo' }, h('summary', null, 'Rangos y cómo se sube'),
        h('p', null, 'Ganar una partida online suma PC; perder resta. Ganarle a alguien mejor que tú da más; perderle a alguien peor te quita más. En 3 o 4 jugadores cuenta el puesto. Las partidas contra la computadora no cuentan. Si abandonas una partida, cuenta como derrota.'),
        h('ul', null, R.TIERS.slice(0, 6).map((t, i) => h('li', null, rkBadge(i * 300), ' ', h('b', null, t.name), ` · ${i * 300}–${i * 300 + 299} PC (3 peldaños de 100)`)), h('li', null, rkBadge(1800), ' ', h('b', null, 'Gran Maestro'), ' · desde 1800 PC')))));
    if (guestMsg) { tbl.replaceChildren(h('p', { class: 'sub' }, 'Inicia sesión para ver la tabla.')); return; }
    await R.publish();
    const res = await R.top(100);
    if (!document.body.contains(tbl)) return;
    if (!res.ok) { tbl.replaceChildren(h('div', { class: 'msg err' }, res.error === 'denied' ? 'La tabla pública aún no está activada (falta publicar sus reglas en Firebase). Tus PC y tu rango sí cuentan y se guardan.' : 'No se pudo cargar la tabla ahora mismo.')); return; }
    if (!res.rows.length) { tbl.replaceChildren(h('p', { class: 'sub' }, 'Todavía no hay nadie en la tabla esta temporada. ¡Juega una partida online con rango!')); return; }
    tbl.replaceChildren(...res.rows.map((r, i) => h('div', { class: 'rkrow' + (u && r.uid === u.uid ? ' me' : '') }, h('span', { class: 'pos' }, String(i + 1)), rkBadge(r.pts, true), h('b', null, r.name || 'Jugador'), h('small', null, `${r.w || 0}V · ${r.l || 0}D`), h('span', { class: 'pc' }, r.pts + ' PC'))));
  }

  /** Premios de fin de temporada de esta temporada, por rango (cambian cada mes). */
  function seasonPrizes(st) {
    const R = D.Rank, SE = D.Seasons, sid = R.seasonId(), best = st ? R.tierOf(st.best || st.pts).tier.id : null;
    const bi = best ? SE.TIERS.indexOf(best) : -1, th = SE.theme(sid);
    const prev = id => { const it = SE.item(id); if (!it) return null; return it.cat === 'ti' ? h('span', { class: 'sp-ti' }, it.text) : it.cat === 'av' ? h('span', { class: 'sp-av' }, it.emoji) : h('span', { class: 'sp-fr', style: `border-color:${it.sw};box-shadow:0 0 6px ${th.c}` }); };
    return h('div', { class: 'seasonp' }, h('h2', null, `🏅 Premios de la temporada «${th.name}»`),
      h('div', { class: 'sub' }, `Al cerrar la temporada (en ${R.daysLeft()} días) cobras el premio de tu MEJOR rango, si jugaste al menos ${SE.MIN_GAMES} partidas con rango. Los cosméticos son exclusivos de este mes: no se compran ni salen de cajas, y el mes que viene serán otros.`),
      h('div', { class: 'sprow' }, SE.table(sid).map((t, i) => h('div', { class: 'sprw' + (i === bi ? ' now' : i < bi ? ' got' : ''), style: `--rc:${t.color}` },
        h('b', null, t.name), h('span', { class: 'spc' }, '✦ ' + t.coins), h('span', { class: 'spi' }, t.ids.map(prev)), i === bi ? h('small', null, 'Tu mejor rango') : null))));
  }
  /** Aviso de premios de temporada por cobrar (se enseña al entrar al menú, una vez por sesión). */
  function seasonModal() {
    const res = D.Rank.claim(); if (!res.length) return;
    S.play('win');
    const SE = D.Seasons;
    modal(h('div', { class: 'box' }, h('h2', null, '🏅 Premios de temporada'),
      ...res.map(x => h('div', { class: 'seasonp' }, h('b', null, 'Temporada «' + SE.label(x.season) + '»'),
        x.ok ? h('div', null, 'Mejor rango: ', h('b', { style: `color:${SE.TCOLOR[x.tier]}` }, SE.TNAME[x.tier]), ' · ', h('b', null, '✦ +' + x.coins + ' puntos')) : h('div', { class: 'sub' }, `Jugaste ${x.games} de ${SE.MIN_GAMES} partidas con rango necesarias: esta vez sin premio.`),
        x.ok ? h('ul', null, x.ids.map(id => h('li', null, SE.item(id).name))) : null)),
      h('p', { class: 'sub' }, 'Los cosméticos nuevos están en la Tienda, en «Tus premios de temporada», para equiparlos.'),
      btn('Genial', () => { closeModal(); menu(); }, 'gold')));
  }

  // ---------------- puntos, recompensa diaria y Tienda ----------------
  let dailyShown = false, seasonShown = false;
  // avisos al entrar al menú: premios de temporada y recompensa diaria (una vez por sesión)
  function popups() {
    if (C.test) return;
    const info = D.Shop.dailyInfo();
    if (!seasonShown && D.Rank.pending().length) { seasonShown = true; setTimeout(() => { if (!current && document.querySelector('.menu-btn')) seasonModal(); }, 300); }
    if (info && !dailyShown) { dailyShown = true; setTimeout(() => { if (!current && document.querySelector('.menu-btn')) dailyModal(); }, 500); }
  }
  function pointsBar(slim) {
    if (C.test) return null;
    const info = D.Shop.dailyInfo();
    return h('div', { class: 'ptsbar' }, h('span', { class: 'pts' }, '✦ ', h('b', null, String(D.Shop.coins())), slim ? '' : ' puntos'),
      info ? btn('🎁 +' + info.amount, dailyModal, 'gold sm') : slim ? null : h('span', { class: 'sub' }, 'Recompensa de hoy cobrada'),
      D.Rank.state() && D.Account.user && !D.Account.user.guest ? h('button', { class: 'rkchip', onclick: rankScreen, title: 'Ranking' }, rkBadge(D.Rank.state().pts, true), D.Rank.me().label) : null,
      slim ? null : btn('Tienda', () => shopScreen(), 'ghost sm'), slim ? null : btn('Cajas', () => boxScreen(), 'ghost sm'));
  }
  function dailyModal() {
    const info = D.Shop.dailyInfo(); if (!info) return;
    const got = D.Shop.claimDaily();
    S.play('confirm');
    modal(h('div', { class: 'box' }, h('h2', null, '🎁 Recompensa diaria'),
      h('p', null, `¡Día ${got.day} de racha! Recibes `, h('b', null, '✦ ' + got.amount + ' puntos'), '.'),
      h('div', { class: 'streak' }, D.Shop.DAILY.map((n, i) => h('div', { class: 'sd' + (i + 1 < got.day ? ' done' : i + 1 === got.day ? ' now' : '') }, h('small', null, 'Día ' + (i + 1)), h('b', null, '+' + n)))),
      h('p', { class: 'sub' }, 'Entra cada día para no perder la racha. Si te saltas un día, vuelve a empezar. También ganas puntos jugando partidas.'),
      btn('Genial', () => { closeModal(); menu(); }, 'gold')));
  }
  function shopScreen(cat) {
    scr('tienda'); lsSet('duelo.offSeen', localDay());
    cat = cat || 'hc'; S.setTrack('menu');
    const SH = D.Shop, items = SH.ITEMS.filter(i => i.cat === cat);
    const sample = () => {
      if (cat === 'cb') return h('div', { class: 'shpv' }, h('div', { class: 'card back', style: 'font-size:14px' }));
      if (cat === 'bd') return h('div', { class: 'shpv' }, h('div', { class: 'board3d mini' }, [0, 1, 2].map(() => h('div', { class: 'zone mz', style: 'width:5em;height:7em;display:inline-block;margin:.3em' }))));
      if (cat === 'av' || cat === 'fr' || cat === 'ti') return h('div', { class: 'shpv' }, h('div', { class: 'acct' }, h('span', { class: 'who fr-' + SH.equipped('fr').id.slice(3) }, (SH.equipped('av').emoji || '👤') + ' ', h('b', null, (D.Account.user && D.Account.user.name) || 'Tú'), SH.equipped('ti').text ? h('small', { class: 'ttl' }, ' · ' + SH.equipped('ti').text) : null)));
      if (cat === 'ef') return h('div', { class: 'shpv ef' }, h('div', { class: 'endscr win mini' }, h('div', { class: 'parts' }, Array.from({ length: 22 }, () => h('i', { style: `left:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2).toFixed(2)}s;--t:${(2 + Math.random() * 2).toFixed(2)}s;--x:${((Math.random() - .5) * 80) | 0}px;--c:${(Math.random() * 360) | 0};--z:${(.5 + Math.random()).toFixed(2)}` }))), h('h2', null, '¡VICTORIA!')));
      const src = Holo.src('c_popeye');
      return h('div', { class: 'shpv' }, h('div', { class: 'zone me shz' }, h('div', { class: 'hbase' }),
        h('div', { class: 'holo' }, h('div', { class: 'hin' }, src ? h('img', { src, alt: '', draggable: 'false' }) : h('div', { class: 'sub' }, '…')))));
    };
    const offerIds = SH.offers();
    const tile = it => {
      const own = SH.owns(it.id), on = SH.equipped(it.cat).id === it.id, offer = offerIds.includes(it.id), pr = SH.priceOf(it.id);
      const prev = it.emoji ? h('span', { class: 'big' }, it.emoji) : it.text ? h('span', { class: 'ttlprev' }, it.text) : it.sw ? h('span', { class: 'sw', style: 'background:' + it.sw }) : h('span', { class: 'sw none' }, '∅');
      return h('div', { class: 'shi r-' + it.rar + (on ? ' on' : '') },
        offer && !own ? h('span', { class: 'offtag' }, '−' + Math.round(SH.OFFER_OFF * 100) + '%') : null,
        prev, h('b', null, it.name), h('small', null, (it.excl ? 'Temporada · ' : '') + SH.RARITY[it.rar] + (it.cat !== cat ? ' · ' + SH.catName(it.cat) : '')),
        on ? h('span', { class: 'tag' }, 'Puesto ✓')
          : own ? btn('Equipar', () => { SH.equip(it.id); S.play('select'); shopScreen(cat); }, 'ghost sm')
          : btn(offer ? h('span', null, h('s', null, '✦ ' + it.price), ' ✦ ' + pr) : '✦ ' + pr, () => { const r = SH.buy(it.id); if (r.ok) { SH.equip(it.id); S.play('confirm'); shopScreen(cat); } else { S.play('error'); const m = document.querySelector('.shmsg'); if (m) m.textContent = r.error; } }, SH.coins() >= pr ? 'gold sm' : 'ghost sm'));
    };
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Tienda'),
      h('div', { class: 'ptsbar' }, h('span', { class: 'pts' }, '✦ ', h('b', null, String(SH.coins())), ' puntos'), btn('📦 Cajas con premios al azar', () => boxScreen(), 'gold sm')),
      h('h2', null, '🔥 Ofertas de hoy'), h('div', { class: 'sub' }, 'Cambian cada día. Comprar directo cuesta más que abrir cajas, pero el premio es seguro.'),
      h('div', { class: 'shgrid' }, offerIds.map(id => tile(SH.get(id)))),
      h('div', { class: 'tabs shtabs' }, SH.CATS.map(c => h('button', { class: 'tab' + (c.id === cat ? ' on' : ''), onclick: () => shopScreen(c.id) }, c.icon + ' ' + c.name))),
      sample(), h('div', { class: 'msg err shmsg' }),
      SH.exclusive(cat).length ? h('div', null, h('h2', null, '🏅 Tus premios de temporada'), h('div', { class: 'sub' }, 'Se consiguen por rango al cerrar cada temporada: no se compran ni salen de cajas.'), h('div', { class: 'shgrid' }, SH.exclusive(cat).map(tile))) : null,
      h('div', { class: 'shgrid' }, items.map(tile))));
  }
  // ---------------- cajas (estilo apertura de contenedores de CS2) ----------------
  const skSample = () => C.all().find(c => c.kind === 'monster' && c.img);
  const itemPrev = (it, cid) => it.cat === 'si' ? h('span', { class: 'siprev' }, h('img', { class: 'cimg', src: it.img, alt: it.name, draggable: 'false' })) : it.cat === 'sk' ? h('span', { class: 'skprev', 'data-sk': D.Shop.slug(it.id) }, (cid && C.get(cid) && C.get(cid).img ? C.get(cid) : skSample()) ? h('img', { class: 'cimg', src: (cid && C.get(cid) && C.get(cid).img ? C.get(cid) : skSample()).img, alt: '', draggable: 'false' }) : '🃏') : it.emoji ? h('span', { class: 'big' }, it.emoji) : it.text ? h('span', { class: 'ttlprev' }, it.text) : it.sw ? h('span', { class: 'sw', style: 'background:' + it.sw }) : h('span', { class: 'sw none' }, '✦');
  const RAR_ORDER = ['c', 'r', 'e', 'l'];
  const bxTile = (it, own) => h('div', { class: 'bxt r-' + it.rar + (own ? ' got' : '') }, h('div', { class: 'bxp' }, itemPrev(it)), h('b', null, it.name),
    h('small', null, (it.cat === 'si' ? cardName(it.card) + ' · ' + fmtPct(D.Shop.skinChance()) + ' %' : it.cat === 'sk' ? 'Efecto · personaje al azar' : D.Shop.catName(it.cat)) + (own ? ' ✓' : '')));
  const pctOf = b => b.kind === 'skins' ? 'Cada skin: ' + fmtPct(D.Shop.skinChance()) + ' % (todas igual, sin rarezas)' : Object.keys(b.w).map(r => `${D.Shop.RARITY[r]} ${b.w[r]}%`).join(' · ');
  const cardName = id => (C.get(id) || {}).name || id;
  /** Porcentaje legible: 20 → «20», 33,333… → «33,33». */
  const fmtPct = n => (Math.round(n * 100) / 100).toLocaleString('es', { maximumFractionDigits: 2 });
  let boxBusy = false;      // una apertura a la vez: evita abrir dos veces con clics rápidos
  /** Lista de cajas: cuadrícula de tarjetas; al tocar una se ve el detalle con todos sus premios. */
  function boxScreen() {
    scr('cajas');
    const SH = D.Shop; S.setTrack('menu');
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: () => shopScreen() }, '← Tienda'), h('h1', null, 'Cajas'),
      h('div', { class: 'ptsbar' }, h('span', { class: 'pts' }, '✦ ', h('b', null, String(SH.coins())), ' puntos'), h('span', { class: 'sub' }, 'Premios al azar. Cada premio sólo sale de su caja. Toca una caja para ver sus premios.')),
      h('div', { class: 'bxgrid' }, [SH.SKIN_BOX].concat(SH.BOXES).map(b => h('button', { class: 'bxcard' + (SH.coins() >= b.price ? '' : ' poor') + (b.kind === 'skins' ? ' skc' : ''), style: `--bc:${b.color}`, onclick: () => boxPrizes(b) },
        h('div', { class: 'bxic' }, b.icon), h('b', null, b.name), h('small', null, b.kind === 'skins' ? SH.poolOf(b).length + ' skins · ' + fmtPct(SH.skinChance()) + ' % cada una' : SH.poolOf(b).length + ' premios'), h('span', { class: 'bxpr' }, '✦ ' + b.price))))));
  }
  /** Detalle de una caja: la caja grande, sus probabilidades y todos los premios posibles (de común a legendario). */
  function boxPrizes(b) {
    if (b.kind === 'skins') return skinBox(b);
    const SH = D.Shop; S.setTrack('menu');
    const items = SH.poolOf(b).slice().sort((x, y) => RAR_ORDER.indexOf(x.rar) - RAR_ORDER.indexOf(y.rar));
    const n = (SH.pts().pity[b.id] | 0);
    mount(h('div', { class: 'scr bxdet', style: `--bc:${b.color}` }, h('button', { class: 'back', onclick: boxScreen }, '← Cajas'),
      h('h1', null, 'Abrir contenedor'), h('div', { class: 'bxsub' }, 'Abrir ', h('b', null, b.name)),
      h('div', { class: 'ptsbar' }, h('span', { class: 'pts' }, '✦ ', h('b', null, String(SH.coins())), ' puntos'), h('span', { class: 'sub' }, pctOf(b))),
      h('div', { class: 'bxstage' }, h('div', { class: 'bxbig' }, b.icon), h('div', { class: 'bxpal' })),
      h('div', { class: 'shmsg msg err' }),
      h('div', { class: 'row bxact' }, btn('Abrir ✦ ' + b.price, () => openBoxFlow(b), SH.coins() >= b.price ? 'gold' : 'ghost'), btn('Cancelar', boxScreen, 'ghost')),
      h('div', { class: 'bxhead' }, 'Abre la caja para recibir una de las siguientes opciones'),
      h('div', { class: 'bxlist' }, items.map(it => bxTile(it, SH.owns(it.id)))),
      h('div', { class: 'sub' }, b.pity ? `Garantía: ${SH.RARITY[b.pity.to]} seguro tras ${b.pity.n} sin suerte (${Math.min(n, b.pity.n)}/${b.pity.n}). ` : 'Todo lo que sale es legendario. ', 'Si te sale uno repetido, te devolvemos parte en puntos.')));
  }
  /** Cofre de skins: todas las skins con su probabilidad (la misma para todas), tu colección y equipar. */
  function skinBox(b) {
    scr('cajas');
    const SH = D.Shop; S.setTrack('menu');
    const pool = SH.skinPool(), got = pool.filter(i => SH.owns(i.id)).length, pc = fmtPct(SH.skinChance());
    const colRow = it => {
      const own = SH.owns(it.id), on = own && SH.artOf(it.card) && SH.artOf(it.card).id === it.id;
      const set = id => { SH.setArt(it.card, id); S.play('select'); skinBox(b); };
      return h('div', { class: 'sicol' + (own ? ' own' : ' miss') + (on ? ' on' : '') },
        h('div', { class: 'sicmp' }, h('figure', null, h('img', { class: 'cimg', src: C.get(it.card).img, alt: '', draggable: 'false' }), h('figcaption', null, 'Original')), h('span', null, '→'),
          h('figure', null, h('img', { class: 'cimg', src: it.img, alt: it.name, draggable: 'false' }), h('figcaption', null, 'Skin'))),
        h('b', null, it.name), h('small', null, cardName(it.card) + ' · ' + pc + ' %'),
        !own ? h('span', { class: 'tag miss' }, '🔒 Te falta')
          : on ? h('div', { class: 'row' }, h('span', { class: 'tag' }, 'Puesta ✓'), btn('Quitar', () => set(null), 'ghost sm'))
          : btn('Equipar', () => set(it.id), 'gold sm'));
    };
    mount(h('div', { class: 'scr bxdet', style: `--bc:${b.color}` }, h('button', { class: 'back', onclick: boxScreen }, '← Cajas'),
      h('h1', null, 'Abrir contenedor'), h('div', { class: 'bxsub' }, 'Abrir ', h('b', null, b.name)),
      h('div', { class: 'ptsbar' }, h('span', { class: 'pts' }, '✦ ', h('b', null, String(SH.coins())), ' puntos'), h('span', { class: 'sub' }, pctOf(b))),
      h('div', { class: 'bxstage' }, h('div', { class: 'bxbig' }, b.icon), h('div', { class: 'bxpal' })),
      h('div', { class: 'shmsg msg err' }),
      h('div', { class: 'row bxact' }, btn('Abrir ✦ ' + b.price, () => openBoxFlow(b), SH.coins() >= b.price && pool.length ? 'gold' : 'ghost'), btn('Cancelar', boxScreen, 'ghost')),
      h('div', { class: 'bxhead' }, `Abre el cofre para recibir una de estas ${pool.length} skins: todas tienen la misma probabilidad (${pc} %)`),
      h('div', { class: 'bxlist' }, pool.map(it => bxTile(it, SH.owns(it.id)))),
      h('div', { class: 'sub' }, `Las skins sólo cambian el aspecto de la carta: nombre, estrellas, ATK, DEF, tipo y habilidades no cambian. Si te sale una que ya tienes, te devolvemos ✦ ${b.dupRefund}.`),
      h('h2', null, `Tu colección de skins (${got}/${pool.length})`),
      h('div', { class: 'sub' }, 'Equipa una skin a su carta: la verás en tu mano, en el tablero y en tus mazos, y tus rivales también la verán. Sin skin puesta, la carta usa su imagen original.'),
      h('div', { class: 'sigrid' }, pool.map(colRow))));
  }
  /** Apertura: ruleta horizontal que se frena en el premio ya sorteado (el resultado se decide y se guarda ANTES de la animación). */
  function openBoxFlow(b) {
    if (boxBusy) return;
    const SH = D.Shop, r = SH.openBox(b.id);
    if (!r.ok) { S.play('error'); const m = document.querySelector('.shmsg'); if (m) m.textContent = r.error; return; }
    boxBusy = true;
    const it = r.item, rar = it.rar, pool = SH.poolOf(b), by = {}, skins = b.kind === 'skins';
    for (const p of pool) (by[p.rar] = by[p.rar] || []).push(p);
    const rolls = skins ? [] : Object.keys(b.w).filter(k => by[k]);
    // relleno de la ruleta (sólo decorado): en el cofre de skins, todas por igual
    const rnd = skins ? () => pool[(Math.random() * pool.length) | 0]
      : () => { let x = Math.random() * rolls.reduce((a, k) => a + b.w[k], 0), k = rolls[0]; for (const q of rolls) { if ((x -= b.w[q]) < 0) { k = q; break; } } return by[k][(Math.random() * by[k].length) | 0]; };
    const back = () => { boxBusy = false; ov.remove(); if (skins) skinBox(b); else boxScreen(); };
    const W = 150, GAP = 8, N = 120, WIN = 104;      // más premios pasando antes de llegar al tuyo
    const seq = Array.from({ length: N }, (_, i) => i === WIN ? it : rnd());
    const rm = document.documentElement.classList.contains('rm');
    const strip = h('div', { class: 'bx-strip' }, seq.map(x => bxTile(x, false)));
    const reel = h('div', { class: 'bx-reel' }, strip, h('div', { class: 'bx-mark' }));
    const skip = btn('Saltar', () => finish(true), 'ghost sm');
    const ov = h('div', { class: 'boxov r-' + rar, style: skins ? `--bc:${b.color}` : null },
      h('div', { class: 'bx-rays' }),
      h('div', { class: 'bx-spin' }, h('h2', null, 'Abrir contenedor'), h('div', { class: 'bxsub' }, 'Abrir ', h('b', null, b.name)), reel, skip),
      h('div', { class: 'bx-prize' }, itemPrev(it, r.card), h('div', { class: 'bx-rar' }, it.cat === 'si' ? 'SKIN · ' + cardName(it.card).toUpperCase() : it.cat === 'sk' ? SH.RARITY[rar].toUpperCase() + ' · ' + cardName(r.card).toUpperCase() : SH.RARITY[rar].toUpperCase()), h('h2', null, it.name),
        h('small', null, it.cat === 'si' ? 'Skin de ' + cardName(it.card) + ' · ' + fmtPct(SH.skinChance()) + ' % de probabilidad' : it.cat === 'sk' ? 'Efecto para ' + cardName(r.card) + ' (sólo él puede usarlo)' : SH.catName(it.cat)),
        h('div', { class: 'bx-note' }, r.dup ? `Repetido: te devolvemos ✦ ${r.refund} puntos.` : '¡Nuevo! Ya está en tu colección.'),
        it.cat === 'sk' ? h('small', { class: 'sub' }, 'Pónselo en el constructor de mazos (ℹ de la carta).') : null,
        h('div', { class: 'row' },
          it.cat === 'sk' && !r.dup && !(SH.skinOf(r.card) && SH.skinOf(r.card).id === it.id) ? btn('Equipar en ' + cardName(r.card), () => { SH.setSkin(r.card, it.id); back(); }, 'gold')
            : it.cat === 'si' && !(SH.artOf(it.card) && SH.artOf(it.card).id === it.id) ? btn('Equipar en ' + cardName(it.card), () => { SH.setArt(it.card, it.id); back(); }, 'gold')
            : !r.dup && it.cat !== 'sk' && it.cat !== 'si' ? btn('Equipar', () => { SH.equip(it.id); back(); }, 'gold') : null,
          btn('Seguir', back, 'ghost'))));
    document.body.append(ov);
    S.play('confirm');
    let done = false, raf = 0, last = -1, lastT = 0;
    const off = (Math.random() * .7 - .35) * W;                    // dónde cae dentro del cuadro
    let target = 0, cw = 0;
    const finish = (quick) => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      strip.style.transform = `translateX(${target}px)`;
      S.play(rar === 'l' ? 'win' : 'confirm');
      try { if (rar === 'l' || rar === 'e') S.jingle && S.jingle('win'); } catch (e) { /* nada */ }
      setTimeout(() => ov.classList.add('open'), quick ? 150 : 900);
    };
    // Frenado en cuarta potencia: arranca muy rápido y los últimos cuadros van cada vez más despacio (suspenso)
    const DUR = rm ? 1800 : 12000, ease = t => 1 - Math.pow(1 - t, 4);
    requestAnimationFrame(() => {
      cw = reel.clientWidth; target = -(WIN * (W + GAP) + W / 2 + off) + cw / 2;
      const t0 = performance.now();
      const frame = (now) => {
        if (done) return;
        const t = Math.min(1, (now - t0) / DUR), x = target * ease(t);
        strip.style.transform = `translateX(${x}px)`;
        const i = Math.floor((-x + cw / 2) / (W + GAP));            // «clic» cada vez que pasa un cuadro bajo la marca
        if (i !== last && now - lastT > 40) { last = i; lastT = now; try { S.play('select'); } catch (e) { /* nada */ } }
        if (t >= 1) return finish(false);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  function news() {
    scr('novedades'); lsSet('duelo.newsSeen', newsSig());
    S.setTrack('menu');
    const en = /^en/i.test(navigator.language || '') ? 1 : 0;
    const SEC = [['new', 'Nuevo', 'New', 'NUEVO', 'NEW'], ['chg', 'Cambios', 'Changes', 'CAMBIO', 'CHANGE'], ['fix', 'Arreglos', 'Fixes', 'ARREGLO', 'FIX']];
    const MES = [['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']];
    const fecha = d => { const [y, m, dd] = d.split('-').map(Number); return en ? MES[1][m - 1] + ' ' + dd + ', ' + y : dd + ' de ' + MES[0][m - 1] + ' de ' + y; };
    // cada cambio = [títuloES, descES, títuloEN, descEN] (los viejos [es, en] salen sin título)
    const ent = (k, l) => l.length >= 4
      ? h('div', { class: 'ent ' + k }, h('div', { class: 'et' }, h('i', null, SEC.find(x => x[0] === k)[3 + en]), l[en * 2]), h('p', null, l[en * 2 + 1]))
      : h('div', { class: 'ent ' + k }, h('p', null, l[en]));
    const items = (G.CHANGELOG || []).filter(e => e.d >= '2026-10-19').map(e => h('div', { class: 'panel nv' },
      h('h2', null, fecha(e.d)),
      ...SEC.filter(x => e[x[0]] && e[x[0]].length).map(x => h('div', { class: 'nvs' }, h('div', { class: 'nvh' }, x[1 + en]), ...e[x[0]].map(l => ent(x[0], l))))));
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Novedades'), ...items));
  }

  // lo que mira el actualizador automático (js/core/updater.js)
  D.UI = { inMatch: () => !!current, forceLeave: () => { if (current) endCurrent(); } };

  mount(h('p', { class: 'loading' }, 'Cargando…'));
  D.Account.ready().then(async st => {
    if (st.user) return afterLogin(false);
    if (st.mode === 'cloud') return loginScreen();
    await openStore(null); menu();
  }).catch(async e => { console.warn(e); await openStore(null); menu(); });
})();
