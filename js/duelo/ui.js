/* ============ duelo/ui.js — pantallas del Duelo Pokémon ============ */
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
  const FAM = { fire: 'fire', water: 'water', electric: 'electric', ice: 'ice', grass: 'nature', bug: 'nature', poison: 'nature', psychic: 'mystic', ghost: 'mystic', dark: 'mystic', fairy: 'mystic', dragon: 'mystic' };
  const famOf = d => (d && FAM[d.type]) || 'phys';
  const byName = {};
  C.all().forEach(c => { byName[c.name] = c; });

  // ---------------- fondo de los menús: la arena de lejos ----------------
  const bgEl = h('div', { id: 'bg' }, h('div', { class: 'vig' }));
  document.body.prepend(bgEl);
  D.Scene.backdrop(bgEl);
  const showBg = on => { bgEl.style.display = on ? '' : 'none'; if (on) D.Scene.toBackdrop(); };

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
  const mount = (...kids) => { app.replaceChildren(...kids); window.scrollTo(0, 0); };

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
  /** Carga los mazos de quien acaba de entrar (null = invitado / sin nube). */
  async function openStore(u) {
    if (!u || u.guest) { storeKey = KEY; store = readStore(KEY) || defaultStore(); return; }
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
    store = clean(pick);
    try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) { /* nada */ }
    if (pick !== rem) D.Account.push(store);
  }
  // en el modo de prueba (?prueba) el mazo es fijo y no se guarda
  const TESTDK = { name: 'Mazo de prueba', get ids() { return C.testDeck(); } };
  const activeDeck = () => C.test ? TESTDK : store.decks[store.active];

  // ---------------- dibujo de cartas ----------------
  function sprite(card, px) {
    if (card.img) {                       // carta propia con ilustración (no es de la Pokédex)
      const b = h('div', { class: 'art', style: px ? `font-size:${px}px;width:1em;height:1em;flex:none;margin:0` : '' });
      b.append(h('img', { class: 'cimg', src: card.img, alt: card.name, draggable: 'false' }));
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
  /** o: { down, pos, atk, def } (atk/def efectivos del tablero) */
  function cardEl(card, o) {
    o = o || {};
    if (o.down && !card) return h('div', { class: 'card back' + (o.pos === 'def' ? ' def' : '') });
    const d = typeof card === 'string' ? C.get(card) : card;
    if (d.kind === 'monster') {
      const atk = o.atk != null ? o.atk : d.atk, def = o.def != null ? o.def : d.def;
      const cls = (v, base) => v > base ? 'up' : v < base ? 'dn' : '';
      return h('div', { class: 'card m' + (d.level >= 7 ? ' hi' : d.level >= 5 ? ' lvmid' : '') + (o.pos === 'def' ? ' def' : '') + (o.down ? ' dis' : ''), 'data-cid': d.id, style: '--tc:' + C.TYPE_COLOR[d.type] },
        h('div', { class: 'cn' }, d.name), sprite(d),
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
  let sndEl = null;
  function sndButton(show) {
    if (!sndEl) { sndEl = h('button', { class: 'sndbtn', title: 'Sonido y música', onclick: soundPanel }, '🔊'); document.body.append(sndEl); }
    sndEl.style.display = show ? '' : 'none';
  }
  function soundPanel() {
    const LBL = { master: 'Volumen general', music: 'Música', ui: 'Interfaz y cartas', combat: 'Combate', amb: 'Ambiente', notify: 'Avisos' };
    const rows = S.CATS.map(k => {
      const r = h('input', { type: 'range', min: 0, max: 100, value: Math.round(S.volume(k) * 100), 'aria-label': LBL[k], oninput: () => { S.setVolume(k, r.value / 100); val.textContent = r.value; }, onchange: () => S.sample(k) });
      const val = h('span', { class: 'sv' }, String(Math.round(S.volume(k) * 100)));
      return h('div', { class: 'sndrow' }, h('label', null, LBL[k]), r, val);
    });
    const tog = (label, get, set) => { const t = h('button', { class: 'btn tog' + (get() ? ' on' : ''), onclick: () => { set(!get()); t.classList.toggle('on', get()); t.textContent = label + (get() ? ': sí' : ': no'); } }, label + (get() ? ': sí' : ': no')); return t; };
    const gfx = h('select', { onchange: () => { D.Floor.setQuality(gfx.value); note.textContent = 'Se aplica al recargar la página.'; } },
      h('option', { value: 'auto' }, 'Gráficos: automático'), h('option', { value: 'low' }, 'Gráficos: ligeros'), h('option', { value: 'off' }, 'Gráficos: sin WebGL'));
    gfx.value = D.Floor.quality();
    const note = h('p', { class: 'sub' }, '');
    modal(h('div', { class: 'box sndbox' }, h('h2', null, 'Sonido y efectos'), ...rows,
      h('div', { class: 'row' }, tog('Música', () => S.musicOn, v => S.setMusic(v)), tog('Efectos', () => S.sfxOn, v => S.setSfx(v)), tog('Silencio', () => S.muted, v => S.setMuted(v))),
      h('div', { class: 'row' }, tog('Efectos reducidos', rmGet, rmSet), gfx), note, btn('Cerrar', () => closeModal(), 'ghost')));
  }

  // ---------------- menú principal ----------------
  let current = null; // partida en curso: { match, cleanup }
  function endCurrent() { if (current) { try { current.match.close(); } catch (e) { /* nada */ } try { current.cleanup && current.cleanup(); } catch (e) { /* nada */ } try { current.cleanup0 && current.cleanup0(); } catch (e) { /* nada */ } current = null; hidePreview(); } closeModal(); }

  function menu() {
    endCurrent(); showBg(true);
    S.setAmbient(false); S.setTrack('menu'); sndButton(true);
    const dk = activeDeck(), bad = C.checkDeck(dk.ids), few = !C.canPlay();
    mount(h('div', { class: 'scr' },
      acctBar(),
      h('h1', null, 'Duelo Pokémon'),
      h('p', { class: 'sub' }, 'Duelos de cartas por turnos. Reglas propias, inspiradas en los juegos de cartas de monstruos.'),
      C.test ? h('div', { class: 'panel' }, h('div', { class: 'msg ok' }, 'MODO DE PRUEBA: mazo fijo de 30 cartas (Popeye, Creeper, monstruos «Prueba ★N», y magias y trampas «Prueba: …»), sólo contra la computadora. No se guarda nada. Para salir, abre el juego sin «?prueba».')) : null,
      few ? h('div', { class: 'panel' }, h('div', { class: 'msg err' }, `Todavía no hay cartas suficientes para jugar: hay ${C.all().length} y hacen falta al menos ${Math.ceil(C.DECK_SIZE / C.MAX_COPIES)} distintas para armar un mazo. Se van añadiendo de a poco; mientras tanto puedes ver las cartas en «Mis mazos».`)) : null,
      h('div', { class: 'panel' }, h('div', null, 'Mazo activo: ', h('b', null, dk.name)), bad ? h('div', { class: 'msg err' }, bad + ' Arréglalo en «Mis mazos».') : null),
      h('button', { class: 'menu-btn', disabled: !!bad || few, onclick: setupAI }, 'Contra la computadora', h('small', null, '1 contra 1, todos contra todos (3 o 4) o 2 contra 2')),
      h('button', { class: 'menu-btn', disabled: !!bad || few || C.test, onclick: onlineMenu }, 'Duelo online con amigos', h('small', null, 'De 2 a 4 personas: crea una sala y comparte el código')),
      h('button', { class: 'menu-btn', onclick: deckBuilder }, 'Mis mazos', h('small', null, '30 cartas, máximo 2 copias de cada una')),
      h('button', { class: 'menu-btn', onclick: rules }, 'Reglas', h('small', null, 'Cómo se juega')),
      h('button', { class: 'menu-btn', onclick: news }, 'Novedades', h('small', null, 'Lo último que se ha añadido'))));
  }

  function rules() {
    S.setTrack('menu');
    sndButton(true);
    mount(h('div', { class: 'scr rules' },
      h('button', { class: 'back', onclick: menu }, '← Menú'),
      h('h1', null, 'Reglas'),
      h('div', { class: 'panel' },
        h('h2', null, 'Objetivo'), h('p', null, 'Deja los Puntos de Vida (PV) del rival en 0. Empiezas con 8000. También pierdes si tienes que robar y tu mazo está vacío.'),
        h('h2', null, 'Un turno'),
        h('ul', null,
          h('li', null, 'Robas 1 carta (quien empieza no roba ni ataca en su primer turno). Mano inicial: 5. Al terminar, máximo 7 cartas en mano.'),
          h('li', null, 'Fase principal: invoca o coloca 1 monstruo por turno (invocación normal), activa magias, coloca magias y trampas.'),
          h('li', null, 'Monstruos de nivel 5-6 piden sacrificar 1 monstruo tuyo; nivel 7-9, 2 monstruos; nivel 10 o más, 3 monstruos. Niveles 1-4, ninguno. Las invocaciones especiales y las transformaciones no piden sacrificios.'),
          h('li', null, '«Colocar» deja el monstruo boca abajo en defensa. Al turno siguiente puedes voltearlo (queda en ataque) o cambiarle la posición.'),
          h('li', null, 'Fase de combate: cada monstruo en ataque puede atacar una vez a un monstruo rival, o directo si no tiene monstruos.')),
        h('h2', null, 'Combate'),
        h('ul', null,
          h('li', null, 'Ataque contra ataque: gana el mayor ATK; el perdedor se destruye y su dueño pierde la diferencia en PV. Si empatan, se destruyen los dos.'),
          h('li', null, 'Ataque contra defensa: si el ATK supera a la DEF, el defensor se destruye (sin daño). Si no, el atacante pierde la diferencia en PV.'),
          h('li', null, 'No hay ventajas de tipo: sólo cuentan el ATK y la DEF.')),
        h('h2', null, '3 o 4 jugadores'),
        h('ul', null,
          h('li', null, 'Todos contra todos (3 o 4): cada uno tiene su campo y sus 8000 PV. Se juega por turnos en orden; quien llega a 0 PV (o no puede robar) queda fuera y su mano y su campo van al cementerio. Gana el último en pie.'),
          h('li', null, '2 contra 2 (4 jugadores): los asientos 1.º y 3.º juegan contra el 2.º y el 4.º. Cada uno conserva sus PV; el equipo gana cuando caen los dos rivales. Nunca se ataca ni se apunta a un compañero.'),
          h('li', null, 'Al atacar eliges a quién. Un monstruo sólo ataca directo al rival que no tiene monstruos. En la primera ronda nadie ataca.'),
          h('li', null, 'Trampas: si te atacan, sólo puede responder el atacado. Con una magia o una invocación, pueden responder todos los rivales de quien actúa, por orden de turno.'),
          h('li', null, 'Magias con rival (destruir un monstruo, destruir una magia/trampa, daño directo) te dejan elegir el rival. «Destruir todos los monstruos» afecta a todos, también a los tuyos y a los de tu equipo.'),
          h('li', null, 'En el tablero ves los campos de todos a la vez; para atacar o elegir objetivo, toca directamente en el campo del rival. Si te sacan del duelo puedes seguir mirando hasta el final.')),
        h('h2', null, 'Magias y trampas'),
        h('ul', null,
          h('li', null, 'Las magias se activan desde la mano o boca abajo, en tu fase principal.'),
          h('li', null, 'Las trampas se colocan boca abajo y pueden responder (ataque, magia rival, invocación) a partir del turno siguiente.'),
          h('li', null, `Cartas disponibles ahora: ${C.all().length}. Toca cualquier carta para leerla.`)))));
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
  function onlineMenu() {
    S.setTrack('prep');
    const box = h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'), h('p', { class: 'sub' }, 'Conectando con tu cuenta…'));
    mount(box);
    D.Online.init().then(me => {
      if (!me) {
        box.replaceChildren(h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'),
          h('div', { class: 'msg err' }, D.Account.cloud ? 'Para jugar online necesitas una cuenta: entra o créala (es gratis). Como invitado sólo puedes jugar contra la computadora.' : 'Jugar online necesita la versión publicada del juego (no funciona abriendo el archivo ni en copias de otra web).'),
          D.Account.cloud ? btn('Entrar o crear cuenta', async () => { await D.Account.logout(); D.Online.reset(); loginScreen(); }, 'gold') : null);
        return;
      }
      const inp = h('input', { type: 'text', maxlength: 5, placeholder: 'CÓDIGO', style: 'text-transform:uppercase;width:8em;font-size:20px;text-align:center', autocomplete: 'off' });
      const err = h('div');
      const f = fmtSelect(null, k => k === 'duel' ? '' : ' Si falta gente, los asientos libres los juega la computadora.');
      box.replaceChildren(h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'),
        h('p', { class: 'sub' }, `Hola, ${me.name}. Mazo: ${activeDeck().name}.`),
        h('div', { class: 'panel' }, h('h2', null, 'Crear sala'), h('label', null, 'Formato ', f.sel), f.note,
          h('p', { class: 'sub' }, 'Te da un código de 5 letras para pasarles a tus amigos.'), btn('Crear sala', () => hostRoom(f.sel.value), 'gold')),
        h('div', { class: 'panel' }, h('h2', null, 'Unirme a una sala'), h('div', { class: 'row' }, inp, btn('Entrar', () => joinRoom(inp.value, err)))), err);
    }).catch(e => box.replaceChildren(h('button', { class: 'back', onclick: menu }, '← Menú'), h('div', { class: 'msg err' }, 'No se pudo conectar: ' + e.message)));
  }

  const LOSTMSG = 'Vuestras conexiones no logran verse directamente (pasa con algunos Wi‑Fi). Probad con datos móviles en uno de los dos.';

  /** Sala del anfitrión: código, asientos, quién entró, y «Empezar» (los asientos libres los juega la computadora). */
  async function hostRoom(fmtId) {
    S.setTrack('prep');
    const fm = FORMATS[fmtId || 'duel'], single = fm.n === 2;
    const status = h('div', { class: 'msg' }, 'Creando sala…');
    const codeEl = h('div', { class: 'code' }, '·····');
    const seatsEl = h('div', { class: 'seats' });
    const startBtn = btn('Empezar ahora', () => { if (match) match.begin(); }, 'gold big');
    startBtn.style.display = 'none';
    let room = null, match = null;
    const conn = new Map();      // idx de invitado -> { state, timer, failed }
    const byUid = new Map();     // uid -> idx
    const queued = [];
    const cancel = () => { conn.forEach(c => clearTimeout(c.timer)); if (room) room.close(); if (match) match.close(); menu(); };
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: cancel }, '← Cancelar'), h('h1', null, 'Tu sala'), codeEl,
      h('p', { class: 'sub', style: 'text-align:center' }, `${fm.t}. Pásales este código a tus amigos: que abran esta misma página, entren en «Duelo online» y pulsen «Entrar».`),
      single ? null : seatsEl, status, single ? null : h('div', { class: 'row', style: 'justify-content:center' }, startBtn),
      single ? null : h('p', { class: 'sub', style: 'text-align:center' }, 'Tú decides cuándo empezar. Los asientos que queden libres los juega la computadora.')));

    function renderSeats() {
      if (single || !match) return;
      const guests = match.lobby().filter(x => !x.left);
      const rows = [];
      rows.push(h('div', { class: 'seat me' }, h('b', null, 'Tú'), h('span', null, activeDeck().name)));
      for (let i = 0; i < fm.n - 1; i++) {
        const g = guests[i];
        if (!g) { rows.push(h('div', { class: 'seat empty' }, h('b', null, 'Esperando…'), h('span', null, 'o la computadora'))); continue; }
        const c = conn.get(g.idx) || {};
        const st = !g.ready ? (c.state === 'direct' ? 'Conectado, recibiendo mazo…' : 'Conectando…') : c.failed ? 'Sin conexión directa' : 'Listo';
        const row = h('div', { class: 'seat ' + (g.ready ? 'ok' : c.failed ? 'bad' : '') }, h('b', null, g.name), h('span', null, st));
        if (fm.mode === 'teams') {
          const sel = h('select', { onchange: () => { match.setPref(g.idx, sel.value); renderSeats(); } }, h('option', { value: 'ally' }, 'Mi compañero'), h('option', { value: 'foe' }, 'Rival'));
          sel.value = g.pref; row.append(sel);
        }
        rows.push(row);
      }
      seatsEl.replaceChildren(...rows);
      const nReady = guests.filter(g => g.ready).length;
      startBtn.style.display = nReady >= 1 ? '' : 'none';
      startBtn.textContent = nReady >= fm.n - 1 ? 'Empezar el duelo' : 'Empezar ahora (la computadora llena los asientos libres)';
      if (nReady) { status.className = 'msg ok'; status.textContent = nReady >= fm.n - 1 ? 'Sala completa. Cuando todos estén listos, pulsa «Empezar el duelo».' : `${nReady + 1} de ${fm.n} en la sala.`; }
      else { status.className = 'msg'; status.textContent = 'Esperando a tus amigos…'; }
    }
    function onJoin(uid, name, tr) {
      if (!match) { queued.push([uid, name, tr]); return; }
      const idx = match.addGuest(tr);
      byUid.set(uid, idx);
      const c = { state: 'connecting', failed: false, timer: 0 };
      c.timer = setTimeout(() => { if (c.state !== 'direct') { c.failed = true; status.className = 'msg err'; status.textContent = LOSTMSG; renderSeats(); } }, 20000);
      conn.set(idx, c);
      if (single) { status.className = 'msg ok'; status.textContent = `${name} entró. Conectando…`; }
      renderSeats();
    }
    try {
      room = await D.Online.createRoom({
        seats: fm.n,
        onJoin,
        onLeave: uid => { const idx = byUid.get(uid); if (idx != null) { const c = conn.get(idx); if (c) clearTimeout(c.timer); } if (single && !current) { status.className = 'msg err'; status.textContent = 'Tu amigo salió de la sala.'; } renderSeats(); },
        onState: (uid, st) => {
          const idx = byUid.get(uid), c = conn.get(idx);
          if (!c) return;
          c.state = st;
          if (st === 'direct') { clearTimeout(c.timer); c.failed = false; if (single) { status.className = 'msg ok'; status.textContent = 'Conectados. Preparando el duelo…'; } }
          else if (st === 'failed') { c.failed = true; status.className = 'msg err'; status.textContent = LOSTMSG; }
          renderSeats();
        }
      });
    } catch (e) { status.className = 'msg err'; status.textContent = 'No se pudo crear la sala: ' + e.message; return; }
    codeEl.textContent = room.code; status.textContent = single ? 'Esperando a tu amigo…' : 'Esperando a tus amigos…';
    match = D.Match.host({ deck: activeDeck().ids.slice(), name: room.name, n: fm.n, mode: fm.mode, autoStart: single });
    match.onStatus(s => {
      if (s.k === 'rejected') { status.className = 'msg err'; status.textContent = 'El mazo de tu amigo no es válido: ' + s.why; }
      else if (s.k === 'started') room.lock();
      renderSeats();
    });
    game(match, { cleanup: () => { conn.forEach(c => clearTimeout(c.timer)); room.close(); }, online: true, wait: true });
    queued.splice(0).forEach(q => onJoin(...q));
    renderSeats();
  }

  async function joinRoom(code, errBox) {
    S.setTrack('prep');
    errBox.replaceChildren(h('div', { class: 'msg' }, 'Entrando…'));
    let room = null, failTimer = 0;
    try {
      room = await D.Online.joinRoom(code, {
        onState: st => { if (st === 'direct') clearTimeout(failTimer); else if (st === 'failed') errBox.replaceChildren(h('div', { class: 'msg err' }, LOSTMSG)); },
        onClosed: () => { if (!current || !current.started) errBox.replaceChildren(h('div', { class: 'msg err' }, 'El anfitrión cerró la sala.')); },
        onKicked: () => { if (!current || !current.started) { errBox.replaceChildren(h('div', { class: 'msg err' }, 'La sala se llenó antes de que entraras.')); menu(); } }
      });
    } catch (e) { errBox.replaceChildren(h('div', { class: 'msg err' }, e.message === 'login' ? 'Inicia sesión primero.' : e.message)); return; }
    errBox.replaceChildren(h('div', { class: 'msg ok' }, 'Dentro de la sala. Conectando con el anfitrión… Cuando empiece el duelo entrarás solo.'));
    failTimer = setTimeout(() => errBox.replaceChildren(h('div', { class: 'msg err' }, LOSTMSG)), 20000);
    const match = D.Match.guest({ deck: activeDeck().ids.slice(), name: room.name, transport: room.transport });
    match.onStatus(s => {
      if (s.k === 'rejected') errBox.replaceChildren(h('div', { class: 'msg err' }, s.why && /empez/.test(s.why) ? s.why : 'Tu mazo no es válido: ' + s.why));
    });
    game(match, { cleanup: () => { clearTimeout(failTimer); room.close(); }, online: true, wait: true });
  }

  // ---------------- constructor de mazos ----------------
  function deckBuilder() {
    endCurrent(); S.setTrack('prep');
    let q = '', kind = 'all', type = '', shown = 60;
    const cnt = ids => { const n = {}; ids.forEach(i => { n[i] = (n[i] || 0) + 1; }); return n; };
    const root = h('div', { class: 'scr', style: 'max-width:980px' });
    const poolEl = h('div', { class: 'list' }), deckEl = h('div', { class: 'list' }), head = h('div', { class: 'panel' });

    function rowFor(card, n, add) {
      const th = h('div', { class: 'th' });
      if (card.kind === 'monster') th.append(sprite(card, 34)); else th.textContent = card.icon;
      return h('div', { class: 'li', onclick: add, oncontextmenu: e => { e.preventDefault(); showCard(card); } }, th,
        h('div', null, card.name, h('small', null, card.kind === 'monster' ? `${C.TYPE_ES[card.type]} · Nv ${card.level} · ${card.atk}/${card.def}` : card.kind === 'spell' ? 'Magia' : 'Trampa')),
        n != null ? h('span', { class: 'n' }, '×' + n) : h('button', { class: 'btn ghost', style: 'padding:2px 8px', onclick: e => { e.stopPropagation(); showCard(card); } }, 'ℹ'));
    }
    const showCard = card => modal(h('div', { class: 'box' }, detailBox(card), btn('Cerrar', closeModal)));

    function refresh() {
      const dk = activeDeck(), n = cnt(dk.ids), bad = C.checkDeck(dk.ids);
      // cabecera
      const sel = h('select', { onchange: () => { store.active = +sel.value; save(); refresh(); } }, store.decks.map((d, i) => h('option', { value: i, selected: i === store.active }, d.name)));
      const pre = h('select', { style: C.PRESET_TYPES.length ? '' : 'display:none' }, h('option', { value: '' }, 'Nuevo mazo de estreno…'), C.PRESET_TYPES.map(t => h('option', { value: t }, 'Tipo ' + C.TYPE_ES[t])));
      pre.onchange = () => {
        if (!pre.value) return;
        if (store.decks.length >= 6) { alert('Máximo 6 mazos.'); pre.value = ''; return; }
        store.decks.push({ name: C.TYPE_ES[pre.value] + ' ' + (store.decks.length + 1), ids: C.presetDeck(pre.value) });
        store.active = store.decks.length - 1; save(); refresh();
      };
      head.replaceChildren(h('div', { class: 'row' }, sel, pre),
        h('div', { class: 'row' }, btn('Renombrar', () => { const nm = prompt('Nombre del mazo', dk.name); if (nm) { dk.name = nm.trim().slice(0, 20) || dk.name; save(); refresh(); } }, 'ghost'),
          btn('Copiar', () => { if (store.decks.length < 6) { store.decks.push({ name: (dk.name + ' 2').slice(0, 20), ids: dk.ids.slice() }); store.active = store.decks.length - 1; save(); refresh(); } }, 'ghost'),
          btn('Borrar', () => { if (store.decks.length > 1 && confirm('¿Borrar «' + dk.name + '»?')) { store.decks.splice(store.active, 1); store.active = 0; save(); refresh(); } }, 'red')),
        h('div', { class: 'count ' + (bad ? 'bad' : 'ok') }, `${dk.ids.length}/${C.DECK_SIZE} cartas · ${bad || 'mazo válido'}`));
      // mazo
      const uniq = [...new Set(dk.ids)].map(id => C.get(id)).sort((a, b) => (a.kind === b.kind ? (a.level || 0) - (b.level || 0) : a.kind === 'monster' ? -1 : b.kind === 'monster' ? 1 : a.kind < b.kind ? 1 : -1));
      deckEl.replaceChildren(...uniq.map(c => rowFor(c, n[c.id], () => { dk.ids.splice(dk.ids.indexOf(c.id), 1); save(); refresh(); })));
      renderPool();
    }
    function renderPool() {
      const dk = activeDeck(), n = cnt(dk.ids), ql = q.trim().toLowerCase();
      let list = C.all().filter(c => (kind === 'all' || c.kind === kind) && (!type || (c.types && c.types.includes(type))) && (!ql || c.name.toLowerCase().includes(ql)));
      const total = list.length; list = list.slice(0, shown);
      poolEl.replaceChildren(...[...list.map(c => rowFor(c, null, () => {
        if (dk.ids.length >= C.DECK_SIZE) return;
        if ((n[c.id] || 0) >= C.MAX_COPIES) return;
        dk.ids.push(c.id); save(); refresh();
      })), ...(total > shown ? [btn(`Ver más (${total - shown})`, () => { shown += 80; renderPool(); }, 'ghost')] : [])]);
    }
    const search = h('input', { type: 'search', placeholder: 'Buscar carta…', oninput: () => { q = search.value; shown = 60; renderPool(); } });
    const kindSel = h('select', { onchange: () => { kind = kindSel.value; shown = 60; renderPool(); } }, [['all', 'Todas'], ['monster', 'Monstruos'], ['spell', 'Magias'], ['trap', 'Trampas']].map(([v, t]) => h('option', { value: v }, t)));
    const typeSel = h('select', { onchange: () => { type = typeSel.value; shown = 60; renderPool(); } }, h('option', { value: '' }, 'Todos los tipos'), C.PRESET_TYPES.concat(C.custom.map(c => c.type).filter((t, i, a) => a.indexOf(t) === i)).map(t => h('option', { value: t }, C.TYPE_ES[t])));
    root.append(h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Mis mazos'),
      h('p', { class: 'sub' }, 'Toca una carta de la colección para añadirla; toca una del mazo para quitarla. Se guarda solo.'),
      head,
      h('div', { class: 'builder' },
        h('div', { class: 'panel' }, h('h2', null, 'Colección'), h('div', { class: 'row' }, search, kindSel, typeSel), poolEl),
        h('div', { class: 'panel' }, h('h2', null, 'Tu mazo'), deckEl)));
    mount(root); refresh();
  }

  // ---------------- la partida ----------------
  function game(match, opts) {
    opts = opts || {};
    endCurrent();
    const cur = current = { match, cleanup: opts.cleanup, started: false };
    let prepared = false;
    // en una sala de espera no se pone todavía el fondo de combate ni su música
    const prepare = () => { if (prepared) return; prepared = true; cur.started = true; sndButton(false); showBg(false); S.setTrack('battle'); S.setAmbient(true); };
    if (!opts.wait) prepare();
    let v = null, prevLps = null, sel = null, prevHandN = null, newView = false, firstView = true, lastLogN = 0, endSounded = false, lpDelta = {};
    const zoneMem = new Map();
    let gameEl = null, zrowsEl = null, lcol = null;
    let cutQ = [], cutBusy = false, fx = [], cut = [], needShake = false, fresh = false, lowTrack = false, lastFam = null, atkFx = [], pops = [];
    const seatNames = () => match.names;
    const nameOf = q => seatNames()[q] || ('Jugador ' + (q + 1));
    const shortOf = q => { const m = /^Computadora(?: (\d))?/.exec(nameOf(q)); return m ? 'Compu' + (m[1] ? ' ' + m[1] : '') : nameOf(q); };
    const multi = () => !!v && v.n > 2;
    const isAlly = q => q !== v.seat && v.team[q] === v.team[v.seat];
    const place = q => v.n - v.rank.indexOf(q);

    const fileSfx = src => { if (src) S.voice({ voice: { src } }); };
    const abn = k => (C.AB && C.AB[k] ? C.AB[k][0] : k);
    const nameId = id => (C.get(id) || {}).name || id;
    /** Estados de un monstruo en el tablero, en texto (ventana de detalle). */
    function statusText(s) {
      const o = [];
      if (s.real) o.push('Transformado (en realidad es ' + nameId(s.real) + ')');
      if (s.shield != null) o.push('Escudo: ' + s.shield);
      if (s.link && s.link.length) o.push('Vinculado: ' + s.link.map(nameId).join(', '));
      if (s.ext && s.ext.length) o.push('Habilidades robadas/absorbidas: ' + s.ext.map(abn).join(', '));
      if (s.absorbed) o.push('Tiene absorbido a ' + nameId(s.absorbed));
      if (s.fury) o.push('Furia de Esparta activa');
      if (s.kills) o.push('Bajas: ' + s.kills);
      if (s.domain) o.push('Su dominio cubre el campo');
      if (s.muted) o.push('Habilidades silenciadas por el dominio');
      if (s.karma) o.push('Karma: muere en ' + s.karma.left + ' turno(s)');
      if (s.gem) o.push('Mente controlada (' + s.gem.left + ' uso(s) de la Gema)');
      return o;
    }
    function badgesEl(s) {
      const b = [];
      if (s.shield != null) b.push('🛡️' + s.shield);
      if (s.link && s.link.length) b.push('🔗');
      if ((s.ext && s.ext.length) || s.absorbed) b.push('🌀');
      if (s.fury) b.push('🔥');
      if (s.domain) b.push('👹');
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
        acts.length ? h('div', { class: 'acts' }, acts.map(a => btn(a.label, () => { closeModal(); a.run(); }, a.cls || 'gold'))) : null,
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
      const toFoe = d.fx === 'destroyOne' || d.fx === 'destroyST' || d.fx === 'gem', area = d.fx === 'destroyST' ? 'st' : 'mz';
      const seatOfA = a => (toFoe ? (a.target.vs != null ? a.target.vs : v.opp.seat) : v.seat);
      return pickTargets(list.map(a => ({ seat: seatOfA(a), area, z: a.target.z })), t => act(list.find(a => seatOfA(a) === t.seat && a.target.z === t.z)), 'Elige el objetivo');
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
      if (myTurn() && !v.pending) {
        const groups = {};
        for (const a of L().filter(a => a.t === 'power' && a.zone === z)) (groups[a.pw] = groups[a.pw] || []).push(a);
        for (const k of Object.keys(groups)) {
          const g = groups[k];
          if (k === 'xform') { const seen = new Set(); for (const a of g) { const nm = nameId(v.me.hand[a.hand].id); if (seen.has(nm)) continue; seen.add(nm); acts.push({ label: 'Transformar en ' + nm, run: () => act(a) }); } }
          else if (k === 'bite') acts.push({ label: abn(k) + ' (−500 PV)', run: () => act(g[0]) });
          else if (k === 'copy') acts.push({ label: 'Transformar en otro personaje…', run: () => copyPick(g) });
          else if (g[0].target) acts.push({ label: abn(k) + '…', run: () => pickTargets(g.map(a => ({ seat: a.target.vs, area: k === 'desmantelar' ? 'st' : 'mz', z: a.target.z })), t => act(g.find(a => a.target.vs === t.seat && a.target.z === t.z)), 'Elige el objetivo') });
          else acts.push({ label: abn(k), run: () => act(g[0]) });
        }
      }
      for (const t of statusText(s)) hint = (hint ? hint + ' · ' : '') + t;
      const info = h('div', null, h('div', { class: 'sub' }, `${s.down ? 'Boca abajo · ' : ''}${s.pos === 'atk' ? 'Ataque' : 'Defensa'} · ATK ${s.atk} / DEF ${s.def}`), hint ? h('div', { class: 'sub', style: 'margin-top:6px' }, hint) : null);
      modal(h('div', { class: 'box' }, detailBox(d, info), acts.length ? h('div', { class: 'acts' }, acts.map(a => btn(a.label, () => { closeModal(); a.run(); }, a.cls || 'gold'))) : null, btn('Cerrar', closeModal, 'ghost')));
    }
    function copyPick(list) {
      modal(h('div', { class: 'box' }, h('h2', null, '¿En qué personaje te transformas?'),
        h('div', { class: 'cands' }, list.map(a => h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => { closeModal(); act(a); } }, cardEl(C.get(a.id)), h('small', null, C.get(a.id).name)))),
        btn('Cancelar', closeModal, 'ghost')));
    }
    function stormFlow(list) {
      const hands = [...new Set(list.map(a => a.hand))];
      const go = hi => { const sub = list.filter(a => a.hand === hi), area = sub[0].pw === 'storm1' ? 'mz' : 'st'; pickTargets(sub.map(a => ({ seat: a.target.vs, area, z: a.target.z })), t => act(sub.find(a => a.target.vs === t.seat && a.target.z === t.z)), 'Elige el objetivo rival'); };
      if (hands.length === 1) return go(hands[0]);
      modal(h('div', { class: 'box' }, h('h2', null, 'Elige la carta de tu mano que se destruye'),
        h('div', { class: 'cands' }, hands.map(hi => { const c = v.me.hand[hi]; return h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => { closeModal(); go(hi); } }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)); })),
        btn('Cancelar', closeModal, 'ghost')));
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
      const extra = s.gem ? `Controla la mente de un rival. Usos que quedan: ${s.gem.left}.` : s.karma ? (s.karma.phase === 'foe' ? `Karma va a morir en ${s.karma.left} turno(s).` : 'Equipada a un personaje tuyo.') : null;
      sheet(d, acts, d.kind === 'trap' && s.down ? 'Se activará cuando puedas responder.' : extra);
    }
    function oppClick(seat, area, z) {
      const s = v.players[seat][area][z];
      if (!s) return;
      if (s.down) { modal(h('div', { class: 'box' }, h('div', { class: 'detail' }, h('div', { class: 'card back big' }), h('div', { class: 'txt' }, h('h3', null, 'Carta boca abajo'), h('div', null, area === 'mz' ? 'Un monstruo en defensa. No sabes cuál es.' : 'Una magia o trampa colocada.'))), btn('Cerrar', closeModal, 'ghost'))); return; }
      const d = C.get(s.c.id);
      sheet(d, [], d.kind === 'monster' ? [`${s.pos === 'atk' ? 'Ataque' : 'Defensa'} · ATK ${s.atk} / DEF ${s.def}`].concat(statusText(s)).join(' · ') : null);
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
    function zoneEl(seat, area, z, low) {
      const side = seat === v.seat ? 'me' : 'opp', s = v.players[seat][area][z];
      const key = 's' + seat + '-' + area + '-' + z, old = zoneMem.get(key);
      const hl = (sel && sel.kind === 'target' && sel.targets.some(t => t.seat === seat && t.area === area && t.z === z)) ||
        (sel && sel.kind === 'tribute' && seat === v.seat && area === 'mz' && sel.allowed.includes(z));
      const chosen = sel && sel.kind === 'tribute' && seat === v.seat && area === 'mz' && sel.chosen.includes(z);
      const attacking = v.atk && area === 'mz' && v.atk.z === z && v.atk.p === seat;
      const el = h('div', { class: 'zone ' + area + ' ' + side + (isAlly(seat) ? ' ally' : '') + (low ? ' lowrow' : '') + (hl ? ' hl' : '') + (attacking ? ' atkr' : ''), 'data-k': key, onclick: () => zoneClick(seat, area, z) });
      let cur = null, landing = false;
      if (s) {
        let c;
        if (area === 'mz') c = s.c ? cardEl(C.get(s.c.id), { down: s.down, pos: s.pos, atk: s.atk, def: s.def }) : cardEl(null, { down: true, pos: 'def' });
        else c = s.c ? cardEl(C.get(s.c.id), { down: s.down }) : cardEl(null, { down: true });
        if (chosen) c.classList.add('sel');
        el.append(c);
        if (area === 'mz' && s.c) { const bg = badgesEl(s); if (bg) el.append(bg); if (s.wide) el.classList.add('wideA'); }
        if (area === 'st' && s.equipTo != null && s.c) el.append(h('span', { class: 'eqm' }, '🎗️'));
        cur = curOf(s, area);
        if (fresh && !firstView && (!old || old.uid !== cur.uid || (old.down && !cur.down))) {
          landing = true; c.classList.add('landing');
          const d = cur.id ? C.get(cur.id) : null;
          fx.push({ k: key, type: cur.down && !cur.id ? 'small' : cur.down ? 'small' : (d && d.kind === 'monster' && d.level >= 7 ? 'epic' : d && d.kind !== 'monster' ? 'spell' : 'normal') });
        }
      } else if (area === 'mz' && v.players[seat].shadow && v.players[seat].shadow[z] >= 0) {
        el.classList.add('shadowz'); el.append(h('span', { class: 'shd' }, '↔ ocupada por un gigante'));
      } else if (fresh && !firstView && old) fx.push({ k: key, type: 'gone', card: old, fam: lastFam });
      if (fresh) { if (cur) zoneMem.set(key, cur); else zoneMem.delete(key); }
      return el;
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
    function pcard(seat) {
      const p = v.players[seat], mine = seat === v.seat, nm = nameOf(seat);
      const lp = h('span', { class: 'lp' }, p.alive ? String(p.lp) : '☠', lpFloat(seat));
      const pct = Math.max(0, Math.min(100, p.lp / 80));
      const ini = (nm || '?').trim().charAt(0).toUpperCase();
      const cls = 'pcard ' + (mine ? 'mine' : isAlly(seat) ? 'ally' : 'theirs') + (!p.alive ? ' dead' : '') + (v.current === seat && v.winner === null && p.alive ? ' turn' : '');
      return h('div', { class: cls, 'data-seat': seat },
        h('div', { class: 'av' }, ini),
        h('div', { class: 'pi' },
          h('div', { class: 'pn', title: nm }, nm),
          h('div', { class: 'lpw' }, h('div', { class: 'lpbar' }, h('i', { style: `width:${pct}%` })), lp),
          h('div', { class: 'pm' }, h('span', null, `🂠 ${p.deckCount}`), h('span', { class: 'hn', title: 'Cartas en la mano' }, `✋ Mano: ${p.handCount}`), h('button', { onclick: e => { e.stopPropagation(); showGrave(seat); }, title: 'Cementerio' }, `☠ ${p.grave.length}`), p.banish && p.banish.length ? h('span', { title: 'Zona de destierro' }, `🌀 ${p.banish.length}`) : null)));
    }
    /** Placa de nombre sobre cada campo del tablero (3-4 jugadores). */
    function plate(seat) {
      const p = v.players[seat], nm = nameOf(seat);
      const pct = Math.max(0, Math.min(100, p.lp / 80));
      const tag = v.mode === 'teams' && seat !== v.seat ? h('em', { class: 'ptag ' + (isAlly(seat) ? 'ally' : 'foe') }, isAlly(seat) ? 'Aliado' : 'Rival') : null;
      return h('div', { class: 'plate', 'data-seat': seat, title: nm },
        h('div', { class: 'pl1' }, h('b', { class: 'pnm' }, seat === v.seat ? 'Tú' : nm), tag,
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
    function showEnd() {
      if (modalEl && modalEl.dataset.end) return;
      const myTeam = v.team[v.seat], won = v.winner === myTeam, draw = v.winner === 'draw' || v.winner === -1;
      if (!endSounded) { endSounded = true; S.setTrack(null); S.setAmbient(false); S.jingle(won ? 'win' : 'lose'); }
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
      const box = h('div', { class: 'endscr ' + (draw ? 'draw' : won ? 'win' : 'lose') },
        h('div', { class: 'rays' }), h('div', { class: 'parts' }, parts),
        h('div', { class: 'endbox' }, h('div', { class: 'endkick' }, draw ? 'Fin del duelo' : won ? 'Duelo ganado' : 'Duelo perdido'),
          h('h2', null, draw ? 'EMPATE' : won ? '¡VICTORIA!' : 'DERROTA'), h('p', { class: 'sub' }, sub), list,
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
        else if (/^invoca a/.test(t)) { const m = /^invoca a (.+) \(ATK/.exec(t), d = m && byName[m[1]]; snd = d && d.level >= 7 ? 'epic' : 'summon'; if (d && !multi()) cin(d, '', { short: true }); }
        else if (/^revive a/.test(t)) snd = 'summon';
        else if (/come espinaca/.test(t)) { snd = 'epic'; spinachFx(); S.voice(byName['Popeye El Marinero']); cin(byName['Popeye El Marinero'], '¡A comer espinaca!'); }
        else if (/ explota!/.test(t)) { snd = 'explosion'; needShake = true; S.voice(byName['Creeper']); cin(byName['Creeper'], '¡BOOM!'); }
        else if (/boca abajo/.test(t)) snd = 'set';
        else if (/^voltea/.test(t)) snd = 'flip';
        else if (/cambia a/.test(t)) snd = 'pos';
        else if (/^activa la trampa /.test(t)) { snd = 'trap'; const d = byName[t.slice(17)]; if (d) cutAdd({ k: 'card', d, trap: true, mine: l.p === v.seat }); }
        else if (/^activa /.test(t)) { snd = 'spell'; const d = byName[t.slice(7)]; if (d) { cutAdd({ k: 'card', d, mine: l.p === v.seat }); fileSfx(d.sfx && d.sfx.use); } }
        else if (/ se transforma en /.test(t) || / se muerde la mano/.test(t)) { snd = 'epic'; const m = /^(.+?) (?:se transforma en|se muerde)/.exec(t), d = m && byName[m[1]]; if (d) { fileSfx(d.sfx && d.sfx.transform); const to = / se transforma en (.+)$/.exec(t); cin(d, '¡TRANSFORMACIÓN!' + (to ? ' → ' + to[1] : '')); } }
        else if (/ usa Big Bang| activa Relicario/.test(t)) { snd = 'explosion'; needShake = true; const m = /^(.+?) (?:usa|activa) /.exec(t), d = m && byName[m[1]]; if (d) { fileSfx(d.sfx && d.sfx.ability); cin(d, / Big Bang/.test(t) ? 'BIG BANG' : 'RELICARIO DEMONÍACO'); } }
        else if (/^(.+?) (?:usa|absorbe) /.test(t) && !/ inmune/.test(t)) { const m = /^(.+?) (usa (.+?)(?: contra .*|: .*)?|absorbe a .*)$/.exec(t), d = m && byName[m[1]]; if (d) { snd = 'epic'; fileSfx(d.sfx && d.sfx.ability); cin(d, m[3] ? m[3].toUpperCase() : 'ABSORCIÓN'); } }
        else if (/ataca/.test(t)) {
          const nm = /^(.+) ataca/.exec(t), d = nm && byName[nm[1]]; lastFam = famOf(d); snd = 'atk_' + lastFam;
          if (nm) atkFx.push({ name: nm[1], p: l.p, fam: lastFam });
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
    function runFx() {
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
          const c = f.card, g = h('div', { class: 'ghostcard', style: `left:${cx}px;top:${cy}px;font-size:${zs}px` }, c.id ? cardEl(C.get(c.id), { down: c.down, pos: c.pos }) : cardEl(null, { down: true }));
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
      else if (meOut) banner = h('div', { class: 'banner wait' }, `Quedaste fuera (${place(v.seat)}.º). Sigues viendo la partida.`, btn('Salir', menu, 'ghost'));
      else if (!my && v.winner === null) banner = h('div', { class: 'banner wait' }, multi() ? `${shortOf(v.actor)} está jugando…` : v.actor === 1 - v.seat ? 'El rival está jugando…' : '…');
      const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
      const canBattle = my && !v.pending && L().some(a => a.t === 'toBattle');
      const canEnd = my && !v.pending && L().some(a => a.t === 'endTurn');
      const whose = v.current === v.seat ? 'Tu turno' : multi() ? 'Turno de ' + shortOf(v.current) : 'Turno rival';
      const turnTxt = `Turno ${v.turn} · ${multi() && v.current !== v.seat ? shortOf(v.current) : whose} · ${v.phase === 'battle' ? 'Combate' : 'Principal'}`;
      const logTxt = lastLog ? fmtLog(lastLog) : '';
      const hudTop = h('div', { class: 'hud-top' + (multi() ? ' multi' : '') },
        multi() ? null : pcard(v.opp.seat),
        h('div', { class: 'turnbox' }, h('div', { class: 'turnpill' }, turnTxt), h('div', { class: 'logline' }, logTxt), fan),
        h('div', { class: 'tools' }, h('button', { class: 'ib', onclick: showLog, title: 'Registro' }, '📜'), h('button', { class: 'ib', onclick: soundPanel, title: 'Sonido' }, '🔊'),
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
    if (u && !u.guest) return h('div', { class: 'acct' }, h('span', null, '👤 ', h('b', null, u.name)), btn('Cuenta', accountModal, 'ghost sm'));
    return h('div', { class: 'acct' }, h('span', { class: 'sub' }, 'Invitado: sin guardar en la nube ni jugar online.'),
      btn('Entrar o crear cuenta', async () => { await D.Account.logout(); D.Online.reset(); loginScreen(); }, 'gold sm'));
  }

  async function afterLogin(isNew) {
    mount(h('div', { class: 'scr' }, h('p', { class: 'loading' }, 'Cargando tus mazos…')));
    D.Online.reset();
    await openStore(D.Account.user);
    menu();
    if (!D.Account.user.guest && D.Account.isNameAccount() && !D.Account.hasGoogle()) offerRecovery();
  }

  function loginScreen() {
    endCurrent(); showBg(true); S.setTrack('menu'); sndButton(true);
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
    mount(h('div', { class: 'scr' }, h('h1', null, 'Duelo Pokémon'),
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
  function news() {
    S.setTrack('menu');
    const en = /^en/i.test(navigator.language || '') ? 1 : 0;
    const SEC = [['new', 'Nuevo', 'New'], ['chg', 'Cambios', 'Changes'], ['fix', 'Arreglos', 'Fixes']];
    const items = (G.CHANGELOG || []).filter(e => e.d >= '2026-10-19').map(e => h('div', { class: 'panel' },
      h('h2', null, e.title[en]), h('div', { class: 'sub' }, e.d),
      ...SEC.filter(x => e[x[0]] && e[x[0]].length).map(x => h('div', null, h('b', null, x[1 + en]), h('ul', null, e[x[0]].map(l => h('li', null, l[en])))))));
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
