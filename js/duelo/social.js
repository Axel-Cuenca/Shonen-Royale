/* ============ duelo/social.js — apodo único, amigos, «en línea» e invitaciones a sala ============
 * Sólo con cuenta en la nube (no invitados). Todo va por Firestore (plan gratuito):
 *
 *   names/{apodo en minúsculas}  { uid }                          apodos únicos
 *   profiles/{uid}               { name, lower, at }              apodo público
 *   friendships/{menor_mayor}    { users, from, to, status, names, at }   pending | ok
 *   pres/{uid}                   { on, at, room, play }           «en línea» aproximado
 *   inv/{para_de}                { to, from, room, name, at }     invitación (room = código de sala)
 *
 * La Realtime Database (100 conexiones a la vez en el plan gratuito) NO se usa para la presencia:
 * sólo la usan las salas de duelo que ya existían (js/duelo/online.js). Una invitación sólo lleva
 * el código de esa sala; «Unirse» ejecuta el mismo flujo que escribir el código a mano.
 *
 * Presencia: un latido cada 10 min mientras la pestaña está visible (y sólo si tienes amigos
 * confirmados: sin ellos nadie lo lee). Lo que se lee de los amigos vale 1 min. Se está
 * «en línea» si el último latido tiene menos de 25 min. Modo invisible: no se escribe nada.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const VALID = /^[A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]{3,16}$/;
  const BEAT = 10 * 60 * 1000, ONLINE = 25 * 60 * 1000, PRES_TTL = 60 * 1000, INVITE_TTL = 3 * 60 * 1000;
  const MAX_FRIENDS = 100;
  const INV_KEY = 'duelo.invisible';

  let fs = null, fv = null, uid = null, me = null, started = false;
  let friends = new Map();          // otherUid -> { uid, name, pid, status: 'ok'|'in'|'out', online, play, room, seen }
  const pres = new Map();           // lo último leído de cada amigo
  const invites = new Map();        // fromUid -> { from, name, room, at }
  const sent = new Set();           // a quién invité (se retira al cerrar la sala)
  const listeners = new Set();
  let unFr = null, unInv = null, beatT = 0, presAt = 0, lastBeat = 0, roomCode = '', playing = false, skew = 0;

  const emit = what => listeners.forEach(fn => { try { fn(what); } catch (e) { console.warn(e); } });
  const now = () => Date.now() + skew;
  const msOf = v => (v && v.toMillis ? v.toMillis() : +v || 0);
  const stamp = () => fv.serverTimestamp();
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  const err = (m, e) => ({ ok: false, error: m + (e && e.code ? ' (' + e.code + ')' : '') });

  // Si el reloj del aparato va desfasado, las invitaciones parecían caducadas y nadie salía en línea:
  // se usa la hora del servidor de la web (cabecera Date de version.json).
  function measureSkew() {
    if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
    const t0 = Date.now();
    fetch('version.json?t=' + t0, { method: 'HEAD', cache: 'no-store' }).then(r => {
      const d = Date.parse(r.headers.get('date') || ''); if (!d) return;
      const s = d + 500 - (t0 + Date.now()) / 2; skew = Math.abs(s) > 60000 ? s : 0;
    }).catch(() => {});
  }

  /** Tras iniciar sesión. → 'ok' | 'need-nick' | 'off' (invitado o sin nube). `ctx` sólo para pruebas. */
  async function start(ctx) {
    if (started) return me ? 'ok' : 'need-nick';
    if (ctx) { fs = ctx.fs; fv = ctx.fv; uid = ctx.uid; }
    else {
      const u = D.Account && D.Account.user;
      if (!D.Account || !D.Account.cloud || !u || u.guest || !u.uid) return 'off';
      fs = window.firebase.firestore(); fv = window.firebase.firestore.FieldValue; uid = u.uid;
    }
    started = true; measureSkew();
    const cached = lsGet('duelo.nick.' + uid);
    const prof = cached ? { name: cached } : await fs.collection('profiles').doc(uid).get().then(s => s.exists ? s.data() : null).catch(() => null);
    if (!prof) { emit('need-nick'); return 'need-nick'; }
    me = { uid, name: prof.name }; lsSet('duelo.nick.' + uid, prof.name);
    go(); return 'ok';
  }

  /** Reserva un apodo único (transacción sobre names/ + profiles/). */
  async function claimNick(name) {
    name = (name || '').trim();
    if (!started) return { ok: false, error: 'Inicia sesión primero.' };
    if (!VALID.test(name)) return { ok: false, error: 'El apodo debe tener 3-16 letras, números o _ (sin espacios).' };
    const lower = name.toLowerCase();
    try {
      await fs.runTransaction(async tx => {
        const nref = fs.collection('names').doc(lower), n = await tx.get(nref);
        if (n.exists && n.data().uid !== uid) throw { code: 'taken' };
        if (!n.exists) tx.set(nref, { uid });
        tx.set(fs.collection('profiles').doc(uid), { name, lower, at: stamp() });
      });
    } catch (e) { return e && e.code === 'taken' ? { ok: false, error: 'Ese apodo ya lo tiene otro jugador.' } : err('No se pudo guardar el apodo', e); }
    me = { uid, name }; lsSet('duelo.nick.' + uid, name);
    go(); emit('me'); return { ok: true };
  }

  function go() {
    if (beatT) return;
    listenFriends();
    beatT = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') writeStatus(); }, BEAT);
    if (typeof document !== 'undefined' && document.addEventListener) { document.addEventListener('visibilitychange', onVisible); addEventListener('pagehide', onHide); }
  }

  // ---------------- presencia ----------------
  const hasFriends = () => [...friends.values()].some(f => f.status === 'ok');
  const invisible = () => lsGet(INV_KEY) === '1';
  function writeStatus(on = true) {
    if (!started || !me || !hasFriends() || (invisible() && on)) return;     // invisible: nunca «en línea»
    lastBeat = Date.now();
    fs.collection('pres').doc(uid).set({ on, at: stamp(), room: roomCode, play: playing }).catch(() => {});
  }
  const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastBeat > BEAT) writeStatus(); };
  const onHide = () => { if (!invisible()) writeStatus(false); };
  function setInvisible(v) {
    lsSet(INV_KEY, v ? '1' : null);
    if (!started || !me) return;
    if (v) fs.collection('pres').doc(uid).set({ on: false, at: stamp(), room: '', play: false }).catch(() => {}); else writeStatus();
    emit('me');
  }
  /** Lo llama la interfaz: ¿estoy en una partida? */
  function setPlaying(p) { if (playing !== !!p) { playing = !!p; writeStatus(); } }

  /** Lee el «en línea» de los amigos (1 lectura por amigo; lo leído vale 1 min). */
  async function refreshPresence(force) {
    if (!started || (!force && Date.now() - presAt < PRES_TTL)) return;
    presAt = Date.now();
    const ok = [...friends.values()].filter(f => f.status === 'ok');
    const docs = await Promise.all(ok.map(f => fs.collection('pres').doc(f.uid).get().catch(() => null)));
    const t = now();
    ok.forEach((f, i) => {
      const v = docs[i] && docs[i].exists ? docs[i].data() : null;
      const on = !!(v && v.on && t - msOf(v.at) < ONLINE);
      const p = { online: on, play: !!(on && v.play), room: on ? v.room || '' : '', seen: v ? msOf(v.at) : 0 };
      pres.set(f.uid, p);
      const cur = friends.get(f.uid); if (cur) Object.assign(cur, p);
    });
    emit('presence');
  }

  // ---------------- amigos ----------------
  function listenFriends() {
    unFr = fs.collection('friendships').where('users', 'array-contains', uid).onSnapshot(snap => {
      const next = new Map();
      snap.forEach(d => {
        const f = d.data(), other = f.users[0] === uid ? f.users[1] : f.users[0];
        next.set(other, Object.assign({ uid: other, pid: d.id, name: (f.names && f.names[other]) || '???', status: f.status === 'ok' ? 'ok' : f.to === uid ? 'in' : 'out',
          online: false, play: false, room: '', seen: 0 }, pres.get(other) || {}));
      });
      const had = hasFriends(), added = [...next.values()].some(f => f.status === 'ok' && (!friends.has(f.uid) || friends.get(f.uid).status !== 'ok'));
      friends = next; emit('friends');
      if (!had && hasFriends()) writeStatus();
      if (hasFriends()) listenInvites();
      if (added) setTimeout(() => { if (started) refreshPresence(true); }, 2500);   // el amigo también acaba de recibirlo
    }, e => console.warn('[Social] amigos:', e.code || e.message));
  }

  /** Solicitud por apodo exacto (o acepta la que ya te mandó esa persona). */
  async function request(name) {
    name = (name || '').trim();
    if (!me) return { ok: false, error: 'Primero elige tu apodo.' };
    if (!VALID.test(name)) return { ok: false, error: 'Escribe el apodo exacto de tu amigo.' };
    if ([...friends.values()].length >= MAX_FRIENDS) return { ok: false, error: 'Has llegado al máximo de ' + MAX_FRIENDS + ' amigos.' };
    const n = await fs.collection('names').doc(name.toLowerCase()).get().catch(() => null);
    if (!n || !n.exists) return { ok: false, error: 'No hay ningún jugador con ese apodo.' };
    const other = n.data().uid;
    if (other === uid) return { ok: false, error: 'Ese eres tú.' };
    const f = friends.get(other);
    if (f && f.status === 'ok') return { ok: false, error: 'Ya sois amigos.' };
    if (f && f.status === 'out') return { ok: false, error: 'Ya le enviaste una solicitud.' };
    if (f && f.status === 'in') return accept(other);
    const prof = await fs.collection('profiles').doc(other).get().catch(() => null);
    const otherName = prof && prof.exists ? prof.data().name : name;
    const users = [uid, other].sort();
    try {
      await fs.collection('friendships').doc(users[0] + '_' + users[1]).set({ users, from: uid, to: other, status: 'pending', names: { [uid]: me.name, [other]: otherName }, at: stamp() });
      return { ok: true, msg: 'Solicitud enviada a ' + otherName };
    } catch (e) { return err('No se pudo enviar', e); }
  }
  async function accept(other) {
    const f = friends.get(other);
    if (!f || f.status !== 'in') return { ok: false, error: 'No hay solicitud.' };
    try { await fs.collection('friendships').doc(f.pid).update({ status: 'ok', at: stamp(), ['names.' + uid]: me.name }); return { ok: true, msg: 'Ahora eres amigo de ' + f.name }; }
    catch (e) { return err('No se pudo aceptar', e); }
  }
  async function remove(other) {
    const f = friends.get(other); if (!f) return { ok: false };
    try { await fs.collection('friendships').doc(f.pid).delete(); return { ok: true }; } catch (e) { return err('No se pudo borrar', e); }
  }

  // ---------------- invitaciones ----------------
  function listenInvites() {
    if (unInv) return;
    unInv = fs.collection('inv').where('to', '==', uid).onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        const v = ch.doc.data();
        if (ch.type === 'removed') { invites.delete(v.from); emit('invites'); return; }
        if (!v || (v.at && now() - msOf(v.at) > INVITE_TTL)) { ch.doc.ref.delete().catch(() => {}); return; }   // caducada
        const f = friends.get(v.from); if (!f || f.status !== 'ok') return;                                       // sólo de amigos
        invites.set(v.from, { from: v.from, name: f.name || v.name, room: v.room, at: msOf(v.at) || now() }); emit('invites');
      });
    }, e => console.warn('[Social] invitaciones:', e.code || e.message));
  }
  /** La interfaz avisa: tengo una sala abierta con este código ('' = ya no). Al cerrarla se retiran las invitaciones. */
  function setRoom(code) {
    code = String(code || '').slice(0, 40);
    if (code === roomCode) return;
    roomCode = code;
    if (!code) { for (const o of sent) fs && fs.collection('inv').doc(o + '_' + uid).delete().catch(() => {}); sent.clear(); }
    writeStatus(); emit('room');
  }
  async function invite(other) {
    const f = friends.get(other);
    if (!f || f.status !== 'ok') return { ok: false, error: 'Sólo puedes invitar a tus amigos.' };
    if (!roomCode) return { ok: false, error: 'Primero crea una sala.' };
    try { await fs.collection('inv').doc(other + '_' + uid).set({ to: other, from: uid, room: roomCode, name: me.name, at: stamp() }); }
    catch (e) { return err('No se pudo invitar', e); }
    sent.add(other); return { ok: true, msg: 'Invitación enviada a ' + f.name };
  }
  /** → { ok, room } con el código para entrar con el flujo de siempre. */
  function acceptInvite(from) {
    const inv = invites.get(from); invites.delete(from); emit('invites');
    if (fs) fs.collection('inv').doc(uid + '_' + from).delete().catch(() => {});
    if (!inv || now() - inv.at > INVITE_TTL) return { ok: false, error: 'La invitación ha caducado.' };
    return { ok: true, room: inv.room };
  }
  function declineInvite(from) { invites.delete(from); emit('invites'); if (fs) fs.collection('inv').doc(uid + '_' + from).delete().catch(() => {}); }

  // ---------------- salir / borrar cuenta ----------------
  async function stop(why) {
    if (!started) return;
    if (unFr) { unFr(); unFr = null; } if (unInv) { unInv(); unInv = null; }
    clearInterval(beatT); beatT = 0;
    if (typeof document !== 'undefined' && document.removeEventListener) { document.removeEventListener('visibilitychange', onVisible); removeEventListener('pagehide', onHide); }
    const step = async fn => { try { await fn(); } catch (e) { console.warn('[Social] borrar:', e.code || e.message); } };
    const del = async q => { const s = await q.get(); await Promise.all(s.docs.map(d => d.ref.delete().catch(() => {}))); };
    await step(() => fs.collection('pres').doc(uid).delete());
    for (const o of sent) await step(() => fs.collection('inv').doc(o + '_' + uid).delete());
    if (why === 'delete') {
      await step(() => del(fs.collection('friendships').where('users', 'array-contains', uid)));
      await step(() => del(fs.collection('inv').where('to', '==', uid)));
      await step(async () => {
        const p = await fs.collection('profiles').doc(uid).get(), lower = p.exists ? p.data().lower : me && me.name.toLowerCase();
        if (lower) await fs.collection('names').doc(lower).delete().catch(() => {});
        if (p.exists) await fs.collection('profiles').doc(uid).delete();
      });
      lsSet('duelo.nick.' + uid, null);
    }
    friends = new Map(); pres.clear(); invites.clear(); sent.clear(); presAt = 0; roomCode = ''; playing = false;
    me = null; started = false; fs = null; fv = null; uid = null;
    emit('stop');
  }

  D.Social = {
    VALID, INVITE_TTL, BEAT, ONLINE,
    start, claimNick, stop, request, accept, remove, refreshPresence, setPlaying, setInvisible, setRoom, invite, acceptInvite, declineInvite,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get me() { return me; },
    get started() { return started; },
    get invisible() { return invisible(); },
    get room() { return roomCode; },
    list() { return [...friends.values()]; },
    incoming() { return [...friends.values()].filter(f => f.status === 'in'); },
    inbox() { return [...invites.values()].filter(i => now() - i.at <= INVITE_TTL); },
    pendingCount() { return this.incoming().length + this.inbox().length; }
  };
})();
