/* ============ duelo/online.js — salas para duelos de 2 a 4 personas ============
 * Usa la sesión de la cuenta (js/duelo/account.js). La sala vive en la Realtime
 * Database (rooms/<código>) sólo para encontrarse y negociar la conexión directa
 * (G.Net, WebRTC); las jugadas van de navegador a navegador.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let fb = null, rtdb = null, uid = null, name = 'Entrenador', ready = null, session = null;

  /** Conecta con la sesión de la cuenta. Devuelve { uid, name } o null si no hay una cuenta con sesión (invitado o sin nube). */
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const st = await D.Account.ready();
      const u = D.Account.user;
      if (st.mode !== 'cloud' || !u || u.guest) return null;
      const f = D.Account.firebase();
      fb = f.fb; rtdb = f.rtdb;
      if (!rtdb) throw new Error('La base de datos en tiempo real no está configurada.');
      uid = u.uid; name = u.name;
      G.DB = { get fb() { return { rtdb, uid }; } };
      return { uid, name };
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }
  /** Al cambiar de cuenta hay que volver a conectar. */
  function reset() { ready = null; }

  const genCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

  /** Adaptador entre G.Net y la interfaz de transporte de Duelo.Match. */
  function makeTransport(peerUid) {
    const msgFns = [], closeFns = [];
    let closed = false, seen = false;
    const tr = {
      send: m => { if (!closed) G.Net.send(peerUid(), m); },
      onMessage: fn => msgFns.push(fn),
      onClose: fn => closeFns.push(fn),
      _msg: (from, m) => { if (from === peerUid()) msgFns.forEach(fn => fn(m)); },
      _peer: (u, st) => {
        if (u !== peerUid()) return;
        if (st === 'direct') seen = true;
        if (seen && (st === 'closed' || st === 'failed' || st === 'connecting')) tr._close();
      },
      _close: () => { if (closed) return; closed = true; closeFns.forEach(fn => fn()); }
    };
    return tr;
  }

  function wire(tr, onState) {
    const onMsg = (from, m) => tr._msg(from, m);
    const onPeer = (u, st) => { tr._peer(u, st); onState(u, st); };
    G.Net.on(onMsg); G.Net.onPeer(onPeer);
    return () => { G.Net.off(onMsg); /* onPeer no tiene off: se ignora tras cerrar */ tr._peer = () => {}; };
  }

  /** Crea una sala de 2 a 4 asientos y espera invitados.
   *  cb: { seats, onJoin(uid, name, transport), onLeave(uid, name), onState(uid, state), onClosed() }
   *  Cada invitado trae su propio canal (transport) para Duelo.Match.host().addGuest(). */
  async function createRoom(cb) {
    const me = await init();
    if (!me) throw new Error('login');
    const seats = Math.max(2, Math.min(4, (cb && cb.seats) | 0 || 2));
    let code = '', ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      code = genCode();
      const snap = await rtdb.ref('rooms/' + code + '/host').once('value');
      ok = !snap.exists();
    }
    const ref = rtdb.ref('rooms/' + code);
    await ref.set({ host: uid, open: true, seats, t: Date.now(), m: { [uid]: { n: name } } });
    ref.onDisconnect().remove();
    G.Net.open(code, true, uid);
    const guests = new Map();        // uid -> { name, tr, unwire }
    let locked = false, gone = false;
    const publishOpen = () => { if (!gone) ref.child('open').set(!locked && guests.size < seats - 1).catch(() => {}); };
    ref.child('m').on('value', s => {
      const m = s.val() || {}, uids = Object.keys(m);
      for (const [u, g] of [...guests]) {
        if (m[u]) continue;
        g.tr._close(); g.unwire(); guests.delete(u);
        if (cb.onLeave) cb.onLeave(u, g.name);
      }
      for (const u of uids) {
        if (u === uid || guests.has(u)) continue;
        if (locked || guests.size >= seats - 1) { ref.child('m/' + u).remove().catch(() => {}); continue; }   // llegó tarde: no hay sitio
        const tr = makeTransport(() => u), gname = String((m[u] && m[u].n) || 'Rival').slice(0, 24);
        const unwire = wire(tr, (pu, st) => { if (pu === u && cb.onState) cb.onState(u, st); });
        guests.set(u, { name: gname, tr, unwire });
        if (cb.onJoin) cb.onJoin(u, gname, tr);
      }
      G.Net.syncMembers([uid].concat([...guests.keys()]));
      publishOpen();
    });
    session = { code, ref };
    return {
      code, name, seats,
      /** Cierra la sala a nuevos invitados (ya empezó el duelo). */
      lock() { locked = true; publishOpen(); },
      guestCount() { return guests.size; },
      close() { gone = true; try { ref.child('m').off(); ref.remove(); } catch (e) { /* nada */ } G.Net.close(); for (const g of guests.values()) g.unwire(); guests.clear(); session = null; }
    };
  }

  /** Entra en la sala de un amigo. Devuelve { transport, close() } o lanza Error con el motivo. */
  async function joinRoom(code, cb) {
    const me = await init();
    if (!me) throw new Error('login');
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) throw new Error('El código tiene 5 letras o números.');
    const rr = rtdb.ref('rooms/' + code);
    const [h, o] = await Promise.all([rr.child('host').once('value'), rr.child('open').once('value')]);
    if (!h.exists()) throw new Error('No existe esa sala. Revisa el código.');
    if (o.val() !== true) throw new Error('Esa sala ya está completa.');
    const hostUid = h.val();
    const mine = rr.child('m/' + uid);
    await mine.set({ n: name });
    mine.onDisconnect().remove();
    G.Net.open(code, false, hostUid);
    const tr = makeTransport(() => hostUid);
    const unwire = wire(tr, (u, st) => { if (u === hostUid && cb && cb.onState) cb.onState(st); });
    rr.child('host').on('value', s => { if (!s.exists()) { tr._close(); if (cb && cb.onClosed) cb.onClosed(); } });
    // si el anfitrión nos saca (llegamos tarde y no había sitio), lo avisamos
    let seenMe = false;
    mine.on('value', s => {
      if (s.exists()) { seenMe = true; return; }
      if (seenMe) { seenMe = false; rr.child('host').once('value').then(h => { if (h.exists()) { tr._close(); if (cb && cb.onKicked) cb.onKicked(); } }).catch(() => {}); }
    });
    return {
      code, name, transport: tr,
      close() { try { rr.child('host').off(); mine.off(); mine.remove(); } catch (e) { /* nada */ } G.Net.close(); unwire(); }
    };
  }

  D.Online = { init, reset, createRoom, joinRoom, get name() { return name; } };
})();
