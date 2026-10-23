/* ============ duelo/match.js — una partida, vista desde mi asiento ============
 * Tres formas, misma interfaz para la pantalla:
 *   local  : yo contra la computadora (el motor corre aquí); de 1 a 3 rivales
 *   host   : online, soy el anfitrión: el motor corre aquí y le mando a cada
 *            invitado su vista (sin mi mano ni mis cartas ocultas). Los asientos
 *            que nadie ocupa los juega la computadora.
 *   guest  : online, soy invitado: mando mis acciones y pinto lo que me llega
 *
 * Formatos: duelo de 2 · todos contra todos de 3 o 4 (mode 'ffa') · 2 contra 2
 * (mode 'teams': asientos 0 y 2 contra 1 y 3).
 *
 * Interfaz:  seat · names · onView(fn(view)) · onStatus(fn({k,...}))
 *            start() · act(action) · resign() · close()
 *
 * transport (online) = { send(msg), onMessage(fn(msg)), onClose(fn) }, uno por invitado.
 * El anfitrión es la única autoridad: comprueba cada acción de un invitado
 * contra la lista de acciones legales de su asiento.
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});
  const E = () => D.Engine, C = () => D.Cards, AIm = () => D.AI;

  function emitter() {
    const subs = [];
    return { on: fn => { subs.push(fn); }, emit: v => subs.slice().forEach(fn => { try { fn(v); } catch (e) { console.error(e); } }) };
  }
  const randSeed = () => Math.floor(Math.random() * 0x7fffffff);

  /** Asientos para los invitados (en orden de llegada). En 2 contra 2, «ally» pide ser compañero del anfitrión (asiento 2). */
  function assignSeats(mode, n, guests) {
    const out = [];
    if (mode !== 'teams') { guests.forEach((_, i) => out.push(i + 1)); return out; }
    const free = { ally: [2], foe: [1, 3] };
    for (const g of guests) {
      const want = g.pref === 'foe' ? 'foe' : 'ally', other = want === 'ally' ? 'foe' : 'ally';
      out.push(free[want].length ? free[want].shift() : free[other].shift());
    }
    return out;
  }
  const aiTypeName = t => (C().TYPE_ES && C().TYPE_ES[t]) || t;
  /** Mazos y nombres para los asientos vacíos (computadora). */
  function fillAI(n, decks, names, rnd) {
    const types = C().PRESET_TYPES;
    let k = 0;
    for (let s = 0; s < n; s++) {
      if (decks[s]) continue;
      const t = types[Math.floor(rnd() * types.length)];
      decks[s] = C().presetDeck(t);
      names[s] = 'Computadora' + (n > 2 ? ' ' + (++k) : '') + (t ? ' (' + aiTypeName(t) + ')' : '');
    }
  }
  const seedRnd = seed => { let a = (seed | 0) + 12345; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  // ---------------- contra la computadora ----------------
  function local(o) {
    const seed = o.seed != null ? o.seed : randSeed();
    const delay = o.delay != null ? o.delay : 750;
    const n = o.n || 2, mode = o.mode || 'ffa';
    const decks = [o.deck], names = [o.name || 'Tú'];
    if (o.aiDecks) o.aiDecks.forEach((d, i) => { decks.push(d); names.push((o.aiNames && o.aiNames[i]) || 'Computadora'); });
    else if (o.aiDeck) { decks.push(o.aiDeck); names.push(o.aiName || 'Computadora'); }
    fillAI(n, decks, names, seedRnd(seed));
    const st = E().newGame(decks, { seed, first: o.first, mode });
    const ais = decks.map((_, s) => (s === 0 ? null : AIm().create(o.aiLevel || 'normal', seed + 1 + s)));
    const views = emitter(), status = emitter();
    let timer = 0, closed = false;
    const m = { seat: 0, names, kind: 'ia', onView: views.on, onStatus: status.on };
    const emit = () => views.emit(E().view(st, 0));
    // si yo ya caí, la partida sigue entre las computadoras, más rápido
    const wait = () => (st.players[0].alive ? delay : Math.min(delay, 220));
    function pump() {
      if (closed || st.winner !== null || timer) return;
      const who = E().actor(st);
      if (who < 1 || !ais[who]) return;
      timer = setTimeout(() => {
        timer = 0;
        if (closed || st.winner !== null) return;
        const w = E().actor(st);
        if (w >= 1 && ais[w]) { const a = ais[w].choose(st, w); if (a) E().apply(st, w, a); }
        emit(); pump();
      }, wait());
    }
    m.start = () => { emit(); pump(); };
    m.refresh = () => { emit(); pump(); };
    m.act = a => { if (closed) return { ok: false }; const r = E().apply(st, 0, a); if (r.ok) { emit(); pump(); } return r; };
    m.resign = () => { if (st.winner === null) { E().resign(st, 0, 'Te rendiste.'); emit(); pump(); } };
    m.close = () => { closed = true; clearTimeout(timer); };
    m.state = () => st;
    return m;
  }

  // ---------------- online: anfitrión ----------------
  /** Lo que viaja por la red: la vista sin duplicar `me` y `opp` (el invitado los reconstruye). */
  function wireView(v) { const w = Object.assign({}, v); delete w.me; delete w.opp; w.oppSeat = v.opp ? v.opp.seat : 0; return w; }
  function unwireView(w) { if (!w.me && w.players) { w.me = w.players[w.seat]; w.opp = w.players[w.oppSeat != null ? w.oppSeat : 0]; } return w; }

  function host(o) {
    const views = emitter(), status = emitter();
    const n = o.n || 2, mode = o.mode || 'ffa', delay = o.delay != null ? o.delay : 750;
    let st = null, closed = false, timer = 0, ais = [];
    const slots = [];      // un invitado por canal: { tr, name, deck, pref, seat, left }
    const m = { seat: 0, names: [o.name || 'Anfitrión'].concat(Array.from({ length: n - 1 }, () => 'Rival')), kind: 'host', onView: views.on, onStatus: status.on };
    const humanSeat = s => s === 0 || slots.some(g => g.seat === s && !g.left);

    function broadcast() {
      views.emit(E().view(st, 0));
      for (const g of slots) if (g.seat != null && !g.left) g.tr.send({ k: 'view', v: wireView(E().view(st, g.seat)), names: m.names });
    }
    function pump() {
      if (closed || !st || st.winner !== null || timer) return;
      const who = E().actor(st);
      if (who < 0 || !ais[who]) return;
      timer = setTimeout(() => {
        timer = 0;
        if (closed || st.winner !== null) return;
        const w = E().actor(st);
        if (w >= 0 && ais[w]) { const a = ais[w].choose(st, w); if (a) E().apply(st, w, a); }
        broadcast(); pump();
      }, delay);
    }
    const ready = () => slots.filter(g => g.deck && !g.left);
    /** Empieza con los invitados que hay; los asientos libres los juega la computadora. */
    function begin() {
      if (st || closed) return false;
      const gs = ready();
      if (!gs.length) return false;
      const seed = o.seed != null ? o.seed : randSeed();
      const seats = assignSeats(mode, n, gs);
      const decks = new Array(n).fill(null), names = new Array(n).fill(null);
      decks[0] = o.deck; names[0] = m.names[0];
      gs.forEach((g, i) => { g.seat = seats[i]; decks[g.seat] = g.deck; names[g.seat] = g.name; });
      fillAI(n, decks, names, seedRnd(seed));
      m.names = names;
      ais = decks.map((_, s) => (humanSeat(s) ? null : AIm().create(o.aiLevel || 'normal', seed + 1 + s)));
      for (const g of slots) if (g.deck && !g.left && g.seat == null) { g.tr.send({ k: 'reject', why: 'La partida ya empezó.' }); }
      st = E().newGame(decks, { seed, first: o.first, mode });
      status.emit({ k: 'started' });
      broadcast(); pump();
      return true;
    }
    function tryStart() {
      if (st || o.autoStart === false) return;
      if (ready().length >= n - 1) begin();
    }
    function lobbyInfo() { return slots.map((g, i) => ({ idx: i, name: g.name, ready: !!g.deck, left: !!g.left, pref: g.pref })); }

    function addGuest(tr) {
      const g = { tr, name: 'Rival', deck: null, pref: slots.filter(x => !x.left).length === 0 ? 'ally' : 'foe', seat: null, left: false };
      slots.push(g);
      const idx = slots.length - 1;
      tr.onMessage(msg => {
        if (closed || !msg || g.left) return;
        if (msg.k === 'hello') {
          if (st) {                                  // el invitado repite el saludo hasta recibir su vista
            if (g.seat != null) tr.send({ k: 'view', v: wireView(E().view(st, g.seat)), names: m.names });
            else tr.send({ k: 'reject', why: 'La partida ya empezó.' });
            return;
          }
          const why = C().checkDeck(msg.deck);
          if (why) { tr.send({ k: 'reject', why }); status.emit({ k: 'rejected', why }); return; }
          const first = !g.deck;
          g.deck = msg.deck.slice();
          g.name = String(msg.name || 'Rival').slice(0, 24);
          if (n === 2) m.names[1] = g.name;
          if (first) status.emit({ k: 'guest', name: g.name, idx });
          tryStart();
        } else if (msg.k === 'act') {
          if (!st || g.seat == null) return;
          const r = E().apply(st, g.seat, msg.a);
          if (!r.ok) tr.send({ k: 'err', why: r.error });
          broadcast(); pump();
        } else if (msg.k === 'resign') {
          if (st && g.seat != null && st.winner === null) { E().resign(st, g.seat, g.name + ' se rindió.'); broadcast(); pump(); }
        }
      });
      tr.onClose(() => {
        if (closed || g.left) return;
        g.left = true;
        if (st && g.seat != null) {
          if (st.winner === null) { E().resign(st, g.seat, g.name + ' se desconectó.'); broadcast(); pump(); }
          status.emit({ k: 'closed', idx, name: g.name });
        } else status.emit({ k: 'left', idx, name: g.name });
      });
      return idx;
    }
    if (o.transport) addGuest(o.transport);
    (o.transports || []).forEach(addGuest);

    m.addGuest = addGuest;
    m.lobby = lobbyInfo;
    m.setPref = (idx, pref) => { if (slots[idx] && !st) slots[idx].pref = pref === 'foe' ? 'foe' : 'ally'; };
    m.begin = begin;
    m.mode = mode; m.n = n;
    m.start = () => { if (st) views.emit(E().view(st, 0)); else tryStart(); };
    m.act = a => { if (closed || !st) return { ok: false }; const r = E().apply(st, 0, a); if (r.ok) { broadcast(); pump(); } return r; };
    m.resign = () => { if (st && st.winner === null) { E().resign(st, 0, 'Te rendiste.'); broadcast(); pump(); } };
    m.close = () => { closed = true; clearTimeout(timer); };
    m.state = () => st;
    return m;
  }

  // ---------------- online: invitado ----------------
  function guest(o) {
    const tr = o.transport;
    const views = emitter(), status = emitter();
    let closed = false, got = false, last = null, timer = 0;
    const m = { seat: 1, names: ['Anfitrión', o.name || 'Tú'], kind: 'guest', onView: views.on, onStatus: status.on };
    const hello = () => tr.send({ k: 'hello', deck: o.deck, name: o.name || 'Rival' });
    tr.onMessage(msg => {
      if (closed || !msg) return;
      if (msg.k === 'view') {
        if (!got) { got = true; clearInterval(timer); status.emit({ k: 'started' }); }
        if (msg.names) m.names = msg.names;
        last = unwireView(msg.v);
        m.seat = last.seat;
        views.emit(last);
      } else if (msg.k === 'reject') { clearInterval(timer); status.emit({ k: 'rejected', why: msg.why }); }
      else if (msg.k === 'err') status.emit({ k: 'err', why: msg.why });
    });
    tr.onClose(() => { if (!closed) status.emit({ k: 'closed' }); });
    m.start = () => { hello(); timer = setInterval(() => { if (!got && !closed) hello(); }, o.helloMs || 1500); };
    m.act = a => { if (closed) return { ok: false }; tr.send({ k: 'act', a }); return { ok: true }; };
    m.resign = () => tr.send({ k: 'resign' });
    m.close = () => { closed = true; clearInterval(timer); };
    m.lastView = () => last;
    return m;
  }

  /** Un par de canales en memoria (para las pruebas): lo que envía uno lo recibe el otro. */
  function memoryPair(latency) {
    const mk = () => ({ fns: [], closers: [], peer: null });
    const a = mk(), b = mk();
    const side = (me, other) => ({
      send(msg) {
        const copy = JSON.parse(JSON.stringify(msg));
        const go = () => other.fns.forEach(fn => fn(copy));
        if (latency) {
          // como el canal real (ordenado): una cola por sentido; nunca sale un mensaje antes que otro enviado antes
          const q = me.q || (me.q = []);
          const at = Math.max(Date.now() + Math.random() * latency, q.length ? q[q.length - 1].at : 0);
          q.push({ at, go });
          if (!me.timer) {
            const pump = () => {
              me.timer = 0;
              while (q.length && q[0].at <= Date.now()) q.shift().go();
              if (q.length) me.timer = setTimeout(pump, Math.max(1, q[0].at - Date.now()));
            };
            me.timer = setTimeout(pump, Math.max(1, at - Date.now()));
          }
        } else Promise.resolve().then(go);
      },
      onMessage(fn) { me.fns.push(fn); },
      onClose(fn) { me.closers.push(fn); },
      close() { other.closers.forEach(fn => fn()); }
    });
    return [side(a, b), side(b, a)];
  }

  D.Match = { local, host, guest, memoryPair, assignSeats };
  if (!isBrowser) module.exports = D.Match;
})();
