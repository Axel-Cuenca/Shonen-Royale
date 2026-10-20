/* ============ duelo/ui.js — pantallas del Duelo Pokémon ============ */
(function () {
  'use strict';
  const D = window.Duelo, C = D.Cards, E = D.Engine;
  const app = document.getElementById('app');
  const S = D.Sound;
  S.init();
  document.addEventListener('click', e => { if (e.target.closest('.btn, .menu-btn, .li, .back')) S.play('click'); }, true);
  const byName = {};
  C.all().forEach(c => { byName[c.name] = c; });

  // ---------------- fondo de los menús: la arena de lejos ----------------
  const bgEl = h('div', { id: 'bg' }, h('div', { class: 'vig' }));
  document.body.prepend(bgEl);
  D.Scene.backdrop(bgEl);
  const showBg = on => { bgEl.style.display = on ? '' : 'none'; };

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
  const KEY = 'duelo.v1';
  function loadStore() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.decks) && s.decks.length) { s.active = Math.min(s.active | 0, s.decks.length - 1); return s; }
    } catch (e) { /* nada */ }
    return { decks: [{ name: 'Fuego', ids: C.presetDeck('fire') }], active: 0 };
  }
  const store = loadStore();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* nada */ } }
  const activeDeck = () => store.decks[store.active];

  // ---------------- dibujo de cartas ----------------
  function sprite(card, px) {
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
      return h('div', { class: 'card m' + (o.pos === 'def' ? ' def' : '') + (o.down ? ' dis' : ''), 'data-cid': d.id, style: '--tc:' + C.TYPE_COLOR[d.type] },
        h('div', { class: 'cn' }, d.name), sprite(d),
        h('div', { class: 'cl' }, '★'.repeat(d.level)),
        h('div', { class: 'cs' }, h('b', { class: cls(atk, d.atk) }, atk), h('b', { class: cls(def, d.def) }, def)));
    }
    return h('div', { class: 'card ' + d.kind + (o.down ? ' dis' : ''), 'data-cid': d.id },
      h('div', { class: 'cn' }, d.name), h('div', { class: 'art ico' }, d.icon),
      h('div', { class: 'ck' }, d.kind === 'spell' ? (d.sub === 'equip' ? 'Magia · Equipo' : 'Magia') : 'Trampa'));
  }
  function detailBox(card, extra) {
    const d = typeof card === 'string' ? C.get(card) : card;
    const big = cardEl(d); big.classList.add('big');
    const txt = h('div', { class: 'txt' });
    if (d.kind === 'monster') {
      txt.append(h('h3', null, d.name), h('div', { class: 'chips' }, d.types.map(typeChip)),
        h('div', null, `Nivel ${d.level} · ATK ${d.atk} · DEF ${d.def}`),
        h('div', { class: 'sub' }, C.tributesFor(d.level) ? `Para invocarlo hay que sacrificar ${C.tributesFor(d.level)} monstruo(s) tuyo(s).` : 'Se invoca sin sacrificios.'),
        h('div', { class: 'sub' }, 'Su tipo da ±500/±1000 de ATK al atacar según la tabla de tipos.'));
    } else {
      txt.append(h('h3', null, d.name), h('div', { class: 'chips' }, h('span', { class: 'chip', style: 'background:' + (d.kind === 'spell' ? '#1f9d8a' : '#b04c9a') }, d.kind === 'spell' ? 'Magia' : 'Trampa')), h('div', null, d.text));
      if (d.kind === 'trap') txt.append(h('div', { class: 'sub' }, 'Se coloca boca abajo y se activa sola cuando puedes responder (desde el turno siguiente).'));
    }
    if (extra) txt.append(extra);
    return h('div', { class: 'detail' }, big, txt);
  }

  // ---------------- ventanas ----------------
  let modalEl = null;
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
  function modal(box, onClose) {
    closeModal();
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
    const row = (label, key, on, setOn, vol) => {
      const t = h('button', { class: 'btn tog' + (on() ? ' on' : ''), onclick: () => { setOn(!on()); t.classList.toggle('on', on()); t.textContent = label + (on() ? ': sí' : ': no'); } }, label + (on() ? ': sí' : ': no'));
      const r = h('input', { type: 'range', min: 0, max: 100, value: Math.round(S.volume(vol) * 100), oninput: () => S.setVolume(vol, r.value / 100) });
      return h('div', { class: 'sndrow' }, t, r);
    };
    modal(h('div', { class: 'box' }, h('h2', null, 'Sonido'),
      row('Música', 'm', () => S.musicOn, v => S.setMusic(v), 'music'),
      row('Efectos', 'e', () => S.sfxOn, v => S.setSfx(v), 'sfx'),
      h('p', { class: 'sub' }, 'Los volúmenes son los mismos que en los ajustes del juego.'), btn('Cerrar', closeModal, 'ghost')));
  }

  // ---------------- menú principal ----------------
  let current = null; // partida en curso: { match, cleanup }
  function endCurrent() { if (current) { try { current.match.close(); } catch (e) { /* nada */ } try { current.cleanup && current.cleanup(); } catch (e) { /* nada */ } try { current.cleanup0 && current.cleanup0(); } catch (e) { /* nada */ } current = null; hidePreview(); } closeModal(); }

  function menu() {
    endCurrent(); showBg(true);
    S.setTrack('village'); sndButton(true);
    const dk = activeDeck(), bad = C.checkDeck(dk.ids);
    mount(h('div', { class: 'scr' },
      h('a', { class: 'back', href: 'index.html' }, '← Volver a PokéSurvivor'),
      h('h1', null, 'Duelo Pokémon'),
      h('p', { class: 'sub' }, 'Duelos de cartas con los Pokémon como monstruos. Reglas propias, inspiradas en los juegos de cartas de monstruos.'),
      h('div', { class: 'panel' }, h('div', null, 'Mazo activo: ', h('b', null, dk.name)), bad ? h('div', { class: 'msg err' }, bad + ' Arréglalo en «Mis mazos».') : null),
      h('button', { class: 'menu-btn', disabled: !!bad, onclick: setupAI }, 'Contra la computadora', h('small', null, 'Práctica rápida, dos dificultades')),
      h('button', { class: 'menu-btn', disabled: !!bad, onclick: onlineMenu }, 'Duelo online con un amigo', h('small', null, 'Crea una sala y comparte el código')),
      h('button', { class: 'menu-btn', onclick: deckBuilder }, 'Mis mazos', h('small', null, '30 cartas, máximo 2 copias de cada una')),
      h('button', { class: 'menu-btn', onclick: rules }, 'Reglas', h('small', null, 'Cómo se juega'))));
  }

  function rules() {
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
          h('li', null, 'Monstruos de nivel 5-6 piden sacrificar 1 monstruo tuyo; nivel 7-8, 2 monstruos. Niveles 1-4, ninguno.'),
          h('li', null, '«Colocar» deja el monstruo boca abajo en defensa. Al turno siguiente puedes voltearlo (queda en ataque) o cambiarle la posición.'),
          h('li', null, 'Fase de combate: cada monstruo en ataque puede atacar una vez a un monstruo rival, o directo si no tiene monstruos.')),
        h('h2', null, 'Combate'),
        h('ul', null,
          h('li', null, 'Ataque contra ataque: gana el mayor ATK; el perdedor se destruye y su dueño pierde la diferencia en PV. Si empatan, se destruyen los dos.'),
          h('li', null, 'Ataque contra defensa: si el ATK supera a la DEF, el defensor se destruye (sin daño). Si no, el atacante pierde la diferencia en PV.'),
          h('li', null, 'Ventaja de tipo: el tipo principal del atacante suma o resta 500 o 1000 de ATK según la tabla de tipos del juego.')),
        h('h2', null, 'Magias y trampas'),
        h('ul', null,
          h('li', null, 'Las magias se activan desde la mano o boca abajo, en tu fase principal.'),
          h('li', null, 'Las trampas se colocan boca abajo y pueden responder (ataque, magia rival, invocación) a partir del turno siguiente.'),
          h('li', null, 'Hay 12 magias y 5 trampas distintas: toca cualquier carta para leerla.')))));
  }

  // ---------------- contra la computadora ----------------
  function setupAI() {
    const lvl = h('select', null, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'easy' }, 'Fácil'));
    const rt = h('select', null, h('option', { value: '' }, 'Al azar'), C.PRESET_TYPES.map(t => h('option', { value: t }, 'Mazo de ' + C.TYPE_ES[t])));
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Contra la computadora'),
      h('div', { class: 'panel' }, h('label', null, 'Dificultad ', lvl), h('label', null, 'Mazo rival ', rt),
        h('div', { class: 'sub' }, 'Tu mazo: ' + activeDeck().name),
        btn('¡A duelear!', () => startAI({ level: lvl.value, rival: rt.value }), 'gold'))));
  }
  function startAI(o) {
    const type = o.rival || C.PRESET_TYPES[Math.floor(Math.random() * C.PRESET_TYPES.length)];
    const match = D.Match.local({ deck: activeDeck().ids.slice(), aiDeck: C.presetDeck(type), aiLevel: o.level, name: 'Tú', aiName: 'Computadora (' + C.TYPE_ES[type] + ')' });
    game(match, { rematch: () => startAI(o) });
  }

  // ---------------- online ----------------
  function onlineMenu() {
    const box = h('div', { class: 'scr' }, h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'), h('p', { class: 'sub' }, 'Conectando con tu cuenta…'));
    mount(box);
    D.Online.init().then(me => {
      if (!me) {
        box.replaceChildren(h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'),
          h('div', { class: 'msg err' }, 'Para jugar online necesitas haber iniciado sesión en PokéSurvivor (con el mismo navegador).'),
          h('a', { class: 'btn gold', href: 'index.html', style: 'text-align:center;text-decoration:none' }, 'Ir a iniciar sesión'));
        return;
      }
      const inp = h('input', { type: 'text', maxlength: 5, placeholder: 'CÓDIGO', style: 'text-transform:uppercase;width:8em;font-size:20px;text-align:center', autocomplete: 'off' });
      const err = h('div');
      box.replaceChildren(h('button', { class: 'back', onclick: menu }, '← Menú'), h('h1', null, 'Duelo online'),
        h('p', { class: 'sub' }, `Hola, ${me.name}. Mazo: ${activeDeck().name}.`),
        h('div', { class: 'panel' }, h('h2', null, 'Crear sala'), h('p', { class: 'sub' }, 'Te da un código de 5 letras para pasarle a tu amigo.'), btn('Crear sala', hostRoom, 'gold')),
        h('div', { class: 'panel' }, h('h2', null, 'Unirme a una sala'), h('div', { class: 'row' }, inp, btn('Entrar', () => joinRoom(inp.value, err)))), err);
    }).catch(e => box.replaceChildren(h('button', { class: 'back', onclick: menu }, '← Menú'), h('div', { class: 'msg err' }, 'No se pudo conectar: ' + e.message)));
  }

  const LOSTMSG = 'Vuestras conexiones no logran verse directamente (pasa con algunos Wi‑Fi). Probad con datos móviles en uno de los dos.';

  async function hostRoom() {
    const status = h('div', { class: 'msg' }, 'Creando sala…');
    const codeEl = h('div', { class: 'code' }, '·····');
    let room = null, match = null, failTimer = 0;
    const cancel = () => { clearTimeout(failTimer); if (room) room.close(); if (match) match.close(); menu(); };
    mount(h('div', { class: 'scr' }, h('button', { class: 'back', onclick: cancel }, '← Cancelar'), h('h1', null, 'Tu sala'), codeEl,
      h('p', { class: 'sub', style: 'text-align:center' }, 'Pásale este código a tu amigo. Que abra esta misma página, entre en «Duelo online» y pulse «Entrar».'), status));
    try {
      room = await D.Online.createRoom({
        onGuest: n => { status.className = 'msg ok'; status.textContent = `${n} entró. Conectando…`; failTimer = setTimeout(() => { status.className = 'msg err'; status.textContent = LOSTMSG; }, 20000); },
        onState: st => { if (st === 'direct') { clearTimeout(failTimer); status.className = 'msg ok'; status.textContent = 'Conectados. Preparando el duelo…'; } else if (st === 'failed') { status.className = 'msg err'; status.textContent = LOSTMSG; } },
        onClosed: () => { if (!current) { status.className = 'msg err'; status.textContent = 'Tu amigo salió de la sala.'; } }
      });
    } catch (e) { status.className = 'msg err'; status.textContent = 'No se pudo crear la sala: ' + e.message; return; }
    codeEl.textContent = room.code; status.textContent = 'Esperando a tu amigo…';
    match = D.Match.host({ deck: activeDeck().ids.slice(), name: room.name, transport: room.transport });
    match.onStatus(s => { if (s.k === 'rejected') { status.className = 'msg err'; status.textContent = 'El mazo de tu amigo no es válido: ' + s.why; } });
    game(match, { cleanup: () => { clearTimeout(failTimer); room.close(); }, online: true, wait: true });
  }

  async function joinRoom(code, errBox) {
    errBox.replaceChildren(h('div', { class: 'msg' }, 'Entrando…'));
    let room = null, failTimer = 0;
    try {
      room = await D.Online.joinRoom(code, {
        onState: st => { if (st === 'direct') clearTimeout(failTimer); else if (st === 'failed') errBox.replaceChildren(h('div', { class: 'msg err' }, LOSTMSG)); },
        onClosed: () => { if (!current) errBox.replaceChildren(h('div', { class: 'msg err' }, 'El anfitrión cerró la sala.')); }
      });
    } catch (e) { errBox.replaceChildren(h('div', { class: 'msg err' }, e.message === 'login' ? 'Inicia sesión primero.' : e.message)); return; }
    errBox.replaceChildren(h('div', { class: 'msg ok' }, 'Dentro de la sala. Conectando con el anfitrión…'));
    failTimer = setTimeout(() => errBox.replaceChildren(h('div', { class: 'msg err' }, LOSTMSG)), 20000);
    const match = D.Match.guest({ deck: activeDeck().ids.slice(), name: room.name, transport: room.transport });
    match.onStatus(s => {
      if (s.k === 'rejected') errBox.replaceChildren(h('div', { class: 'msg err' }, 'Tu mazo no es válido: ' + s.why));
    });
    game(match, { cleanup: () => { clearTimeout(failTimer); room.close(); }, online: true, wait: true });
  }

  // ---------------- constructor de mazos ----------------
  function deckBuilder() {
    endCurrent();
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
      const pre = h('select', null, h('option', { value: '' }, 'Nuevo mazo de estreno…'), C.PRESET_TYPES.map(t => h('option', { value: t }, 'Tipo ' + C.TYPE_ES[t])));
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
    const typeSel = h('select', { onchange: () => { type = typeSel.value; shown = 60; renderPool(); } }, h('option', { value: '' }, 'Todos los tipos'), C.PRESET_TYPES.map(t => h('option', { value: t }, C.TYPE_ES[t])));
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
    current = { match, cleanup: opts.cleanup };
    sndButton(false); showBg(false);
    S.setTrack('volcano');
    let v = null, prev = null, sel = null, prevHandN = null, newView = false, firstView = true, lastLogN = 0, endSounded = false;
    const zoneMem = new Map();
    let gameEl = null, zrowsEl = null;
    let fx = [], cut = [], needShake = false, fresh = false, lowTrack = false;
    const seatNames = () => match.names;

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
    function pickTargets(zones, side, area, done, text, direct) {
      sel = { kind: 'target', zones, side, area, done, text, direct }; render();
    }
    function sameSet(a, b) { return a.length === b.length && a.slice().sort().join() === b.slice().sort().join(); }
    function startTribute(i, type, opts2) {
      const need = opts2[0].tributes.length;
      const allowed = [...new Set(opts2.flatMap(o => o.tributes))];
      sel = { kind: 'tribute', need, allowed, chosen: [], opts: opts2, text: `Elige ${need} monstruo(s) para sacrificar` };
      render();
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
      const sp = mine.filter(a => a.t === 'activate');
      if (sp.length) {
        const run = () => {
          if (!sp[0].target) return act(sp[0]);
          const side = (d.fx === 'destroyOne' || d.fx === 'destroyST') ? 'opp' : 'me', area = d.fx === 'destroyST' ? 'st' : 'mz';
          pickTargets(sp.map(a => a.target.z), side, area, z => act(sp.find(a => a.target.z === z)), 'Elige el objetivo');
        };
        acts.push({ label: 'Activar', run });
      }
      const st = mine.find(a => a.t === 'setst');
      if (st) acts.push({ label: d.kind === 'trap' ? 'Colocar boca abajo' : 'Colocar boca abajo (para después)', run: () => act(st), cls: sp.length ? 'ghost' : 'gold' });
      sheet(d, acts, acts.length ? null : (v.me.normalUsed && d.kind === 'monster' ? 'Ya usaste tu invocación del turno.' : v.phase === 'battle' ? 'Solo se puede en la fase principal.' : 'No se puede jugar ahora.'));
    }
    function myMzClick(z) {
      const s = v.me.mz[z], d = C.get(s.c.id), acts = [];
      if (myTurn() && !v.pending) {
        const at = L().filter(a => a.t === 'attack' && a.zone === z);
        if (at.length) {
          const dir = at.find(a => a.target === 'direct');
          if (dir) acts.push({ label: 'Atacar directamente', run: () => act(dir) });
          else acts.push({ label: 'Atacar…', run: () => pickTargets(at.map(a => a.target), 'opp', 'mz', tz => act(at.find(a => a.target === tz)), 'Elige a quién atacar') });
        }
        const fl = L().find(a => a.t === 'flip' && a.zone === z); if (fl) acts.push({ label: 'Voltear (pasa a ataque)', run: () => act(fl) });
        const po = L().find(a => a.t === 'pos' && a.zone === z); if (po) acts.push({ label: s.pos === 'atk' ? 'Pasar a defensa' : 'Pasar a ataque', run: () => act(po), cls: 'ghost' });
      }
      const info = h('div', { class: 'sub' }, `${s.down ? 'Boca abajo · ' : ''}${s.pos === 'atk' ? 'Ataque' : 'Defensa'} · ATK ${s.atk} / DEF ${s.def}`);
      modal(h('div', { class: 'box' }, detailBox(d, info), acts.length ? h('div', { class: 'acts' }, acts.map(a => btn(a.label, () => { closeModal(); a.run(); }, a.cls || 'gold'))) : null, btn('Cerrar', closeModal, 'ghost')));
    }
    function myStClick(z) {
      const s = v.me.st[z], d = C.get(s.c.id), acts = [];
      if (myTurn() && !v.pending) {
        const os = L().filter(a => a.t === 'activateSet' && a.zone === z);
        if (os.length) acts.push({ label: 'Activar', run: () => {
          if (!os[0].target) return act(os[0]);
          const side = (d.fx === 'destroyOne' || d.fx === 'destroyST') ? 'opp' : 'me', area = d.fx === 'destroyST' ? 'st' : 'mz';
          pickTargets(os.map(a => a.target.z), side, area, tz => act(os.find(a => a.target.z === tz)), 'Elige el objetivo');
        } });
      }
      sheet(d, acts, d.kind === 'trap' && s.down ? 'Se activará cuando puedas responder.' : null);
    }
    function oppClick(area, z) {
      const s = v.opp[area][z];
      if (!s) return;
      if (s.down) { modal(h('div', { class: 'box' }, h('div', { class: 'detail' }, h('div', { class: 'card back big' }), h('div', { class: 'txt' }, h('h3', null, 'Carta boca abajo'), h('div', null, area === 'mz' ? 'Un monstruo en defensa. No sabes cuál es.' : 'Una magia o trampa colocada.'))), btn('Cerrar', closeModal, 'ghost'))); return; }
      const d = C.get(s.c.id);
      sheet(d, [], d.kind === 'monster' ? `${s.pos === 'atk' ? 'Ataque' : 'Defensa'} · ATK ${s.atk} / DEF ${s.def}` : null);
    }
    function zoneClick(side, area, z) {
      S.play('select');
      if (sel && sel.kind === 'tribute' && side === 'me' && area === 'mz' && sel.allowed.includes(z)) {
        const k = sel.chosen.indexOf(z);
        if (k >= 0) sel.chosen.splice(k, 1); else sel.chosen.push(z);
        if (sel.chosen.length === sel.need) {
          const a = sel.opts.find(o => sameSet(o.tributes, sel.chosen));
          if (a) return act(a);
        }
        return render();
      }
      if (sel && sel.kind === 'target' && side === sel.side && area === sel.area && sel.zones.includes(z)) { const f = sel.done; return f(z); }
      if (side === 'me') return area === 'mz' ? myMzClick(z) : myStClick(z);
      return oppClick(area, z);
    }

    // ----- ventanas de decisión (trampas, elegir carta, descarte) -----
    const TRG = { attack: 'El rival declara un ataque.', spell: 'El rival activa una magia.', summon: 'El rival invoca un monstruo.' };
    function pendingUI() {
      const pd = v.pending;
      if (!pd || pd.player !== v.seat || v.winner !== null) { if (modalEl && modalEl.dataset.pend) closeModal(); return; }
      if (pd.k === 'respond') {
        const box = h('div', { class: 'box' }, h('h2', null, '¿Activar una trampa?'), h('p', { class: 'sub' }, TRG[pd.trigger] || ''),
          h('div', { class: 'acts' }, pd.cands.map(z => { const d = C.get(v.me.st[z].c.id); return h('button', { class: 'btn gold', onclick: () => act({ t: 'respond', activate: true, zone: z }) }, `${d.icon} ${d.name}`, h('div', { style: 'font-size:12px;font-weight:400' }, d.text)); })),
          btn('No activar', () => act({ t: 'respond', activate: false }), 'ghost'));
        modal(box, false); modalEl.dataset.pend = 1;
      } else if (pd.k === 'pick') {
        const box = h('div', { class: 'box' }, h('h2', null, pd.zone === 'grave' ? 'Elige un monstruo de tu cementerio' : 'Elige un monstruo de tu mazo'),
          h('div', { class: 'cands' }, pd.cands.map(c => h('div', { style: 'cursor:pointer;text-align:center;font-size:13px', onclick: () => act({ t: 'pick', uid: c.uid }) }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)))));
        modal(box, false); modalEl.dataset.pend = 1;
      }
    }

    // ----- dibujo -----
    function zoneEl(side, area, z) {
      const s = v[side][area][z];
      const key = side + '-' + area + '-' + z, old = zoneMem.get(key);
      const hl = (sel && sel.kind === 'target' && sel.side === side && sel.area === area && sel.zones.includes(z)) ||
        (sel && sel.kind === 'tribute' && side === 'me' && area === 'mz' && sel.allowed.includes(z));
      const chosen = sel && sel.kind === 'tribute' && side === 'me' && area === 'mz' && sel.chosen.includes(z);
      const attacking = v.atk && area === 'mz' && v.atk.z === z && ((v.atk.p === v.seat) === (side === 'me'));
      const el = h('div', { class: 'zone ' + area + ' ' + side + (hl ? ' hl' : '') + (attacking ? ' atkr' : ''), 'data-k': key, onclick: () => zoneClick(side, area, z) });
      let cur = null, landing = false;
      if (s) {
        let c;
        if (area === 'mz') c = s.c ? cardEl(C.get(s.c.id), { down: s.down, pos: s.pos, atk: s.atk, def: s.def }) : cardEl(null, { down: true, pos: 'def' });
        else c = s.c ? cardEl(C.get(s.c.id), { down: s.down }) : cardEl(null, { down: true });
        if (chosen) c.classList.add('sel');
        el.append(c);
        if (area === 'st' && s.equipTo != null && s.c) el.append(h('span', { class: 'eqm' }, '🎗️'));
        cur = { uid: s.c ? s.c.uid : 'hidden', id: s.c ? s.c.id : null, down: !!s.down, pos: s.pos, area };
        if (fresh && !firstView && (!old || old.uid !== cur.uid || (old.down && !cur.down))) {
          landing = true; c.classList.add('landing');
          const d = cur.id ? C.get(cur.id) : null;
          fx.push({ k: key, type: cur.down && !cur.id ? 'small' : cur.down ? 'small' : (d && d.kind === 'monster' && d.level >= 7 ? 'epic' : d && d.kind !== 'monster' ? 'spell' : 'normal') });
        }
      } else if (fresh && !firstView && old) fx.push({ k: key, type: 'gone', card: old });
      if (fresh) { if (cur) zoneMem.set(key, cur); else zoneMem.delete(key); }
      return el;
    }
    function pbar(side) {
      const p = v[side], mine = side === 'me', nm = seatNames()[mine ? v.seat : 1 - v.seat];
      const lp = h('span', { class: 'lp' }, String(p.lp));
      if (fresh && prev && prev[side] !== p.lp) {
        const dlt = p.lp - prev[side];
        lp.append(h('span', { class: 'fl ' + (dlt < 0 ? 'neg' : 'pos') }, (dlt > 0 ? '+' : '') + dlt));
        S.play(dlt > 0 ? 'heal' : mine ? 'hurt' : 'hit', 250);
        if (dlt <= -1000) needShake = true;
      }
      const pct = Math.max(0, Math.min(100, p.lp / 80));
      const ini = (nm || '?').trim().charAt(0).toUpperCase();
      return h('div', { class: 'pcard ' + (mine ? 'mine' : 'theirs') },
        h('div', { class: 'av' }, ini),
        h('div', { class: 'pi' },
          h('div', { class: 'pn' }, nm),
          h('div', { class: 'lpw' }, h('div', { class: 'lpbar' }, h('i', { style: `width:${pct}%` })), lp),
          h('div', { class: 'pm' }, h('span', null, `🂠 ${p.deckCount}`), h('span', null, `✋ ${p.handCount}`), h('button', { onclick: () => showGrave(side), title: 'Cementerio' }, `☠ ${p.grave.length}`))));
    }
    function showGrave(side) {
      const g = v[side].grave;
      modal(h('div', { class: 'box' }, h('h2', null, 'Cementerio'), g.length ? h('div', { class: 'cands' }, g.map(c => h('div', { style: 'cursor:pointer;text-align:center', onclick: () => modal(h('div', { class: 'box' }, detailBox(c.id), btn('Cerrar', closeModal))) }, cardEl(C.get(c.id)), h('small', null, C.get(c.id).name)))) : h('p', { class: 'sub' }, 'Vacío.'), btn('Cerrar', closeModal, 'ghost')));
    }
    function showLog() {
      const names = seatNames();
      modal(h('div', { class: 'box' }, h('h2', null, 'Registro'),
        h('div', { class: 'logbox' }, v.log.slice().reverse().map(l => h('div', { class: l.p < 0 ? 'lx' : (l.p === v.seat ? 'l0' : 'l1') }, (l.p >= 0 ? names[l.p] + ' ' : '') + l.t))), btn('Cerrar', closeModal, 'ghost')));
    }
    function showEnd() {
      if (modalEl && modalEl.dataset.end) return;
      if (!endSounded) { endSounded = true; S.setTrack(null); S.play(v.winner === v.seat ? 'win' : 'lose'); }
      const won = v.winner === v.seat, draw = v.winner === 'draw' || v.winner === -1;
      const box = h('div', { class: 'box end ' + (won ? 'win' : 'lose') }, h('h2', null, draw ? 'Empate' : won ? '¡Ganaste!' : 'Perdiste'), h('p', { class: 'sub', style: 'text-align:center' }, v.reason || ''),
        opts.rematch ? btn('Revancha', () => { closeModal(); opts.rematch(); }, 'gold') : null, btn('Menú', menu, opts.rematch ? 'ghost' : 'gold'));
      modal(box, false); modalEl.dataset.end = 1;
    }

    // ----- sonidos y efectos de lo que acaba de pasar -----
    function logEvents() {
      const fresh2 = v.log.filter(l => l.n > lastLogN);
      if (v.log.length) lastLogN = Math.max(lastLogN, v.log[v.log.length - 1].n);
      if (firstView) return;
      let i = 0;
      for (const l of fresh2) {
        const t = l.t; let snd = null;
        if (/^Turno/.test(t)) snd = 'turn';
        else if (/^invoca a/.test(t)) { const m = /^invoca a (.+) \(ATK/.exec(t), d = m && byName[m[1]]; snd = d && d.level >= 7 ? 'epic' : 'summon'; }
        else if (/^revive a/.test(t)) snd = 'summon';
        else if (/boca abajo/.test(t)) snd = 'set';
        else if (/^voltea/.test(t)) snd = 'flip';
        else if (/cambia a/.test(t)) snd = 'pos';
        else if (/^activa la trampa /.test(t)) { snd = 'trap'; const d = byName[t.slice(17)]; if (d) cut.push({ d, kind: 'trap' }); }
        else if (/^activa /.test(t)) { snd = 'spell'; const d = byName[t.slice(7)]; if (d) cut.push({ d, kind: 'spell' }); }
        else if (/No es muy eficaz/.test(t)) snd = 'noteff';
        else if (/muy eficaz/.test(t)) snd = 'eff';
        else if (/ataca/.test(t)) snd = 'attack';
        else if (/destruid|destruye/.test(t)) snd = 'destroy';
        else if (/negado|anulada/.test(t)) snd = 'negate';
        else if (/agrega un monstruo|^roba |^descarta|se revela|fase de batalla/.test(t)) snd = 'select';
        if (snd) { S.play(snd, i * 170); i++; }
      }
    }
    const rectOf = k => { const z = document.querySelector('.zone[data-k="' + k + '"]'); return z ? z.getBoundingClientRect() : null; };
    function runFx() {
      for (const f of fx) {
        const r = rectOf(f.k); if (!r) continue;
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
      const c = cut.shift(); cut = [];
      if (c) {
        const el = h('div', { class: 'cutin ' + c.kind }, h('div', { class: 'cc' }, cardEl(c.d), h('div', { class: 'tag' }, c.kind === 'trap' ? '¡Trampa activada!' : 'Magia activada')));
        const cd = el.querySelector('.card'); cd.style.fontSize = '24px';
        document.body.append(el); setTimeout(() => el.remove(), 1600);
      }
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
    current.cleanup0 = () => window.removeEventListener('resize', fitBoard);

    function render() {
      if (!v) return;
      fresh = newView; newView = false;
      if (fresh) {
        logEvents();
        if (!firstView && prevHandN != null && v.me.handCount > prevHandN) S.play('draw');
        prevHandN = v.me.handCount;
        // música más tensa con poca vida
        const low = Math.min(v.me.lp, v.opp.lp) <= 2500 && v.winner === null;
        if (low !== lowTrack) { lowTrack = low; S.setTrack(low ? 'boss' : 'volcano'); }
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
      const fan = h('div', { class: 'opphand' }, Array.from({ length: Math.min(v.opp.handCount, 9) }, (_, i) => h('i', { style: `--r:${(i - 4) * 3}deg` })));
      let banner = null;
      if (sel) banner = h('div', { class: 'banner' }, sel.text, sel.kind === 'tribute' ? ` (${sel.chosen.length}/${sel.need})` : '',
        sel.direct ? btn('Directo', sel.direct, 'gold') : null, btn('Cancelar', () => { sel = null; render(); }, 'ghost'));
      else if (discarding) banner = h('div', { class: 'banner' }, `Tienes demasiadas cartas: descarta ${v.pending.excess}. Toca una de tu mano.`);
      else if (!my && v.winner === null) banner = h('div', { class: 'banner wait' }, v.actor === 1 - v.seat ? 'El rival está jugando…' : '…');
      const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
      const canBattle = my && !v.pending && L().some(a => a.t === 'toBattle');
      const canEnd = my && !v.pending && L().some(a => a.t === 'endTurn');
      const turnTxt = `Turno ${v.turn} · ${v.current === v.seat ? 'Tu turno' : 'Turno rival'} · ${v.phase === 'battle' ? 'Combate' : 'Principal'}`;
      const logTxt = lastLog ? (lastLog.p >= 0 ? seatNames()[lastLog.p] + ' ' : '') + lastLog.t : '';
      const hudTop = h('div', { class: 'hud-top' }, pbar('opp'),
        h('div', { class: 'turnbox' }, h('div', { class: 'turnpill' }, turnTxt), h('div', { class: 'logline' }, logTxt), fan),
        h('div', { class: 'tools' }, h('button', { class: 'ib', onclick: showLog, title: 'Registro' }, '📜'), h('button', { class: 'ib', onclick: soundPanel, title: 'Sonido' }, '🔊'),
          h('button', { class: 'ib', onclick: () => { if (confirm('¿Rendirte?')) match.resign(); }, title: 'Rendirse' }, '🏳')));
      const acts = h('div', { class: 'acts-bot' },
        canBattle ? btn('⚔ Combate', () => act(L().find(a => a.t === 'toBattle')), 'gold big') : null,
        canEnd ? btn(v.phase === 'battle' ? 'Fin del turno' : 'Terminar turno', () => act(L().find(a => a.t === 'endTurn')), (canBattle ? 'teal' : 'gold') + ' big') : null);
      const hudBot = h('div', { class: 'hud-bot' }, banner, h('div', { class: 'row-bot' }, pbar('me'), acts), hand);
      const rows = [];
      for (const [side, areas] of [['opp', ['st', 'mz']], ['me', ['mz', 'st']]]) for (const area of areas) rows.push(h('div', { class: 'zrow' }, [0, 1, 2, 3, 4].map(z => zoneEl(side, area, z))));
      if (!gameEl) {
        zrowsEl = h('div', { class: 'zrows' });
        const slab = h('div', { class: 'slab' }, zrowsEl);
        D.Scene.build(slab);
        gameEl = h('div', { class: 'game' }, h('div', { class: 'stage' }, h('div', { class: 'persp' }, h('div', { class: 'board3d' }, slab))));
      }
      if (!gameEl.isConnected) app.replaceChildren(gameEl);
      zrowsEl.replaceChildren(...rows);
      const hud = h('div', { class: 'hud' }, hudTop, hudBot);
      const oldHud = gameEl.querySelector(':scope > .hud');
      if (oldHud) oldHud.replaceWith(hud); else gameEl.append(hud);
      fitBoard();
      pendingUI();
      if (fresh) { runFx(); firstView = false; }
      if (v.winner !== null) showEnd();
    }

    match.onView(nv => { prev = v ? { me: v.me.lp, opp: v.opp.lp } : null; v = nv; newView = true; if (sel && !myTurn()) sel = null; render(); });
    match.onStatus(s => {
      if (s.k === 'closed' && v && v.winner === null) { /* el motor ya da la victoria al otro */ }
      if (s.k === 'rejected' && !v) { alert('No se pudo empezar: ' + s.why); menu(); }
    });
    if (!opts.wait) { mount(h('div', { class: 'scr' }, h('p', { class: 'loading' }, 'Repartiendo…'))); }
    match.start();
    window.__duelo = { match, view: () => v };
  }

  mount(h('p', { class: 'loading' }, 'Cargando…'));
  menu();
})();
