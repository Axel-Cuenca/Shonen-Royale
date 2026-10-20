/* ============ duelo/match.js — una partida, vista desde mi asiento ============
 * Tres formas, misma interfaz para la pantalla:
 *   local  : yo contra la computadora (el motor corre aquí)
 *   host   : online, soy el anfitrión: el motor corre aquí y le mando al
 *            invitado su vista (sin mi mano ni mis cartas ocultas)
 *   guest  : online, soy el invitado: mando mis acciones y pinto lo que me llega
 *
 * Interfaz:  seat · names · onView(fn(view)) · onStatus(fn({k,...}))
 *            start() · act(action) · resign() · close()
 *
 * transport (online) = { send(msg), onMessage(fn(msg)), onClose(fn) }.
 * El anfitrión es la única autoridad: comprueba cada acción del invitado
 * contra la lista de acciones legales.
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

  // ---------------- contra la computadora ----------------
  function local(o) {
    const seed = o.seed != null ? o.seed : randSeed();
    const delay = o.delay != null ? o.delay : 750;
    const st = E().newGame([o.deck, o.aiDeck], { seed, first: o.first });
    const ai = AIm().create(o.aiLevel || 'normal', seed + 1);
    const views = emitter(), status = emitter();
    let timer = 0, closed = false;
    const m = { seat: 0, names: [o.name || 'Tú', o.aiName || 'Computadora'], kind: 'ia', onView: views.on, onStatus: status.on };
    const emit = () => views.emit(E().view(st, 0));
    function pump() {
      if (closed || st.winner !== null || E().actor(st) !== 1) return;
      timer = setTimeout(() => {
        if (closed) return;
        const a = ai.choose(st, 1);
        if (a) E().apply(st, 1, a);
        emit(); pump();
      }, delay);
    }
    m.start = () => { emit(); pump(); };
    m.act = a => { if (closed) return { ok: false }; const r = E().apply(st, 0, a); if (r.ok) { emit(); pump(); } return r; };
    m.resign = () => { if (st.winner === null) { E().resign(st, 0, 'Te rendiste.'); emit(); } };
    m.close = () => { closed = true; clearTimeout(timer); };
    m.state = () => st;
    return m;
  }

  // ---------------- online: anfitrión ----------------
  function host(o) {
    const tr = o.transport;
    const views = emitter(), status = emitter();
    let st = null, closed = false, guestDeck = null;
    const m = { seat: 0, names: [o.name || 'Anfitrión', 'Rival'], kind: 'host', onView: views.on, onStatus: status.on };
    function broadcast() {
      views.emit(E().view(st, 0));
      tr.send({ k: 'view', v: E().view(st, 1), names: m.names });
    }
    function tryStart() {
      if (st || !guestDeck) return;
      st = E().newGame([o.deck, guestDeck], { seed: o.seed != null ? o.seed : randSeed(), first: o.first });
      status.emit({ k: 'started' });
      broadcast();
    }
    tr.onMessage(msg => {
      if (closed || !msg) return;
      if (msg.k === 'hello') {
        if (st) { broadcast(); return; }            // el invitado repite el saludo hasta recibir su vista
        const why = C().checkDeck(msg.deck);
        if (why) { tr.send({ k: 'reject', why }); status.emit({ k: 'rejected', why }); return; }
        guestDeck = msg.deck.slice();
        m.names[1] = String(msg.name || 'Rival').slice(0, 24);
        status.emit({ k: 'guest', name: m.names[1] });
        if (o.autoStart !== false) tryStart();
      } else if (msg.k === 'act') {
        if (!st) return;
        const r = E().apply(st, 1, msg.a);
        if (!r.ok) tr.send({ k: 'err', why: r.error });
        broadcast();
      } else if (msg.k === 'resign') {
        if (st && st.winner === null) { E().resign(st, 1, 'El rival se rindió.'); broadcast(); }
      }
    });
    tr.onClose(() => {
      if (closed) return;
      if (st && st.winner === null) { E().resign(st, 1, 'El rival se desconectó.'); views.emit(E().view(st, 0)); }
      status.emit({ k: 'closed' });
    });
    m.start = () => { if (st) views.emit(E().view(st, 0)); else tryStart(); };
    m.act = a => { if (closed || !st) return { ok: false }; const r = E().apply(st, 0, a); if (r.ok) broadcast(); return r; };
    m.resign = () => { if (st && st.winner === null) { E().resign(st, 0, 'Te rendiste.'); broadcast(); } };
    m.close = () => { closed = true; };
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
        last = msg.v;
        views.emit(msg.v);
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
        if (latency) setTimeout(go, Math.random() * latency); else Promise.resolve().then(go);
      },
      onMessage(fn) { me.fns.push(fn); },
      onClose(fn) { me.closers.push(fn); },
      close() { other.closers.forEach(fn => fn()); }
    });
    return [side(a, b), side(b, a)];
  }

  D.Match = { local, host, guest, memoryPair };
  if (!isBrowser) module.exports = D.Match;
})();
