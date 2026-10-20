/* ============ duelo/online.js — salas para duelos entre dos personas ============
 * Usa el mismo Firebase y la misma sesión que el juego principal (mismo sitio, así
 * que si ya iniciaste sesión allí, aquí también). La sala vive en la Realtime
 * Database (rooms/<código>) sólo para encontrarse y negociar la conexión directa
 * (G.Net, WebRTC); las jugadas van de navegador a navegador.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let fb = null, rtdb = null, uid = null, name = 'Entrenador', ready = null, session = null;

  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }
  function cleanName(u) {
    const raw = (u.displayName || '').trim().split(/\s+/)[0] || 'Entrenador';
    return raw.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 14) || 'Entrenador';
  }

  /** Conecta con Firebase. Devuelve { uid, name } o null si no hay sesión iniciada. */
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = G.FIREBASE_CONFIG;
      if (!cfg) throw new Error('Firebase no está configurado.');
      await loadScript(SDK + 'firebase-app-compat.js');
      await loadScript(SDK + 'firebase-auth-compat.js');
      await loadScript(SDK + 'firebase-database-compat.js');
      fb = window.firebase;
      const app = fb.apps.length ? fb.app() : fb.initializeApp(cfg);
      const auth = fb.auth(app);
      rtdb = fb.database(app);
      const user = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
      if (!user) return null;
      uid = user.uid; name = cleanName(user);
      G.DB = { get fb() { return { rtdb, uid }; } };
      return { uid, name };
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }

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

  /** Crea una sala y espera a un invitado. cb: { onGuest(name), onState(state), onClosed() } */
  async function createRoom(cb) {
    const me = await init();
    if (!me) throw new Error('login');
    let code = '', ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      code = genCode();
      const snap = await rtdb.ref('rooms/' + code + '/host').once('value');
      ok = !snap.exists();
    }
    const ref = rtdb.ref('rooms/' + code);
    await ref.set({ host: uid, open: true, t: Date.now(), m: { [uid]: { n: name } } });
    ref.onDisconnect().remove();
    G.Net.open(code, true, uid);
    let guest = null, gname = '';
    const tr = makeTransport(() => guest);
    const unwire = wire(tr, (u, st) => { if (u === guest && cb.onState) cb.onState(st); });
    ref.child('m').on('value', s => {
      const m = s.val() || {}, uids = Object.keys(m);
      if (!guest) {
        const g = uids.find(u => u !== uid);
        if (g) { guest = g; gname = String((m[g] && m[g].n) || 'Rival'); ref.child('open').set(false); }
      } else if (!m[guest]) { tr._close(); if (cb.onClosed) cb.onClosed(); return; }
      G.Net.syncMembers(uids);
      if (guest && cb.onGuest && !tr._announced) { tr._announced = true; cb.onGuest(gname); }
    });
    session = { code, ref, unwire };
    return {
      code, name, transport: tr,
      close() { try { ref.child('m').off(); ref.remove(); } catch (e) { /* nada */ } G.Net.close(); unwire(); session = null; }
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
    return {
      code, name, transport: tr,
      close() { try { rr.child('host').off(); mine.remove(); } catch (e) { /* nada */ } G.Net.close(); unwire(); }
    };
  }

  D.Online = { init, createRoom, joinRoom, get name() { return name; } };
})();
