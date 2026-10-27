/* Pruebas del sistema de amigos (26-10-2026) con un Firestore falso en memoria compartido por dos jugadores.
 * Se carga desde tools/test_duelo.js. */
'use strict';
module.exports = function (T) {
  const { ok, eq, section } = T;
  section('Amigos: apodo, solicitudes, en línea e invitaciones');
  global.window = global.window || global;
  delete require.cache[require.resolve('../js/duelo/social.js')]; require('../js/duelo/social.js');
  const S = global.window.Duelo.Social;

  // ---- Firestore falso (lo justo que usa social.js) ----
  const db = new Map(), watchers = [];
  let clock = 1_000_000;
  const SENT = { sentinel: true };
  const fv = { serverTimestamp: () => SENT };
  // El servidor fija la hora al escribir; al leer, es un Timestamp con toMillis().
  const settle = v => v === SENT ? { ms: clock, toMillis() { return this.ms; } }
    : Array.isArray(v) ? v.map(settle) : v && typeof v === 'object' && !v.toMillis ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, settle(x)])) : v;
  const put = (k, v) => { db.set(k, settle(v)); fire(); };
  const snapOf = (col, prev) => {
    const docs = [...db.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => mk(k, v));
    return { docs, forEach: f => docs.forEach(f), docChanges: () => {
      const ids = new Set(docs.map(d => d.id)), ch = docs.map(d => ({ type: 'added', doc: d }));
      prev.forEach(id => { if (!ids.has(id)) ch.push({ type: 'removed', doc: { id, data: () => prev.data[id], ref: refOf(col, id) } }); });
      return ch;
    }, _ids: ids };
  };
  const mk = (k, v) => { const [c, id] = k.split('/'); return { id, exists: true, data: () => settle(v), ref: refOf(c, id) }; };
  const refOf = (c, id) => ({
    id,
    get: async () => db.has(c + '/' + id) ? mk(c + '/' + id, db.get(c + '/' + id)) : { id, exists: false, data: () => undefined },
    set: async d => { if (rules && rules(c, id, d, 'set') === false) throw { code: 'permission-denied' }; db.set(c + '/' + id, settle(d)); fire(); },
    update: async d => {
      const cur = Object.assign({}, db.get(c + '/' + id));
      for (const [k, v] of Object.entries(d)) { if (k.includes('.')) { const [a, b] = k.split('.'); cur[a] = Object.assign({}, cur[a], { [b]: v }); } else cur[k] = v; }
      if (rules && rules(c, id, cur, 'update') === false) throw { code: 'permission-denied' };
      db.set(c + '/' + id, settle(cur)); fire();
    },
    delete: async () => { db.delete(c + '/' + id); fire(); }
  });
  let rules = null;
  const fake = {
    collection: c => ({
      doc: id => refOf(c, id),
      where: (field, op, val) => {
        const match = ([k, v]) => k.startsWith(c + '/') && (op === 'array-contains' ? (v[field] || []).includes(val) : v[field] === val);
        const sel = () => { const docs = [...db.entries()].filter(match).map(([k, v]) => mk(k, v)); return { docs, forEach: f => docs.forEach(f), docChanges: null }; };
        return {
          get: async () => sel(),
          onSnapshot: cb => {
            let prevIds = new Set(); const prevData = {};
            const run = () => {
              const cur = sel(), ids = new Set(cur.docs.map(d => d.id)), ch = [];
              cur.docs.forEach(d => { if (!prevIds.has(d.id)) ch.push({ type: 'added', doc: d }); prevData[d.id] = d.data(); });
              prevIds.forEach(id => { if (!ids.has(id)) ch.push({ type: 'removed', doc: { id, data: () => prevData[id], ref: refOf(c, id) } }); });
              prevIds = ids; cur.docChanges = () => ch; cb(cur);
            };
            const w = { run, off: false }; watchers.push(w);
            queueMicrotask(run);
            return () => { w.off = true; };
          }
        };
      }
    }),
    runTransaction: async fn => {
      const writes = [];
      await fn({ get: async r => r.get(), set: (r, d) => writes.push([r, d]) });
      for (const [r, d] of writes) await r.set(d);
    }
  };
  function fire() { queueMicrotask(() => watchers.filter(w => !w.off).forEach(w => w.run())); }
  const tick = () => new Promise(r => setTimeout(r, 5));
  const as = async (uid, name) => {
    // cambiar de jugador = cerrar la sesión del anterior; su pestaña «sigue abierta», así que se conserva lo que dejó en la nube
    const keep = [...db.entries()].filter(([k]) => /^(pres|inv)\//.test(k));
    await S.stop(); keep.forEach(([k, v]) => { db.set(k, v); }); fire(); const st = await S.start({ fs: fake, fv, uid });
    if (name && st === 'need-nick') { const r = await S.claimNick(name); if (!r.ok) throw new Error(r.error); }
    await tick(); return st;
  };
  const realNow = Date.now;
  const run = async () => {
    const mem = {}; global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
    Date.now = () => clock;     // reloj controlado (sólo mientras corre esta prueba)
    // ---- apodo único ----
    eq(await as('uA'), 'need-nick', 'sin apodo todavía → pide uno');
    for (const bad of ['', 'ab', 'x'.repeat(17), 'con espacio', 'raro!']) ok((await S.claimNick(bad)).ok === false, 'apodo no válido: «' + bad + '»');
    ok((await S.claimNick('Goku_77')).ok && S.me.name === 'Goku_77', 'apodo válido guardado');
    ok(db.get('names/goku_77').uid === 'uA' && db.get('profiles/uA').lower === 'goku_77', 'queda reservado en minúsculas y con su perfil');
    eq(await as('uB'), 'need-nick', 'otra cuenta también empieza sin apodo');
    const dup = await S.claimNick('goku_77'); ok(!dup.ok && /otro jugador/.test(dup.error), 'un apodo ocupado se rechaza aunque cambien las mayúsculas');
    ok((await S.claimNick('Vegeta')).ok, 'B elige otro apodo');
    eq(await as('uA'), 'ok', 'al volver A, ya tiene apodo');

    // ---- solicitud de amistad ----
    ok((await S.request('Nadie_existe')).error === 'No hay ningún jugador con ese apodo.', 'apodo inexistente');
    ok((await S.request('goku_77')).error === 'Ese eres tú.', 'no puedes agregarte a ti mismo');
    ok((await S.request('x')).ok === false, 'apodo con formato malo');
    const r = await S.request('vegeta'); ok(r.ok, 'A envía solicitud (sin importar mayúsculas)');
    await tick(); eq(S.list().map(f => f.status), ['out'], 'A la ve como enviada');
    ok((await S.request('Vegeta')).error === 'Ya le enviaste una solicitud.', 'no se duplica');
    const doc = db.get('friendships/uA_uB'); ok(doc && doc.status === 'pending' && doc.from === 'uA' && doc.to === 'uB' && doc.users[0] < doc.users[1], 'documento con id ordenado uMenor_uMayor');
    await as('uB'); eq(S.incoming().map(f => f.name), ['Goku_77'], 'B ve la solicitud entrante');
    ok(S.pendingCount() === 1, 'cuenta como aviso pendiente');
    ok((await S.accept('uA')).ok, 'B acepta');
    await tick(); eq(S.list()[0].status, 'ok', 'ya son amigos para B');
    await as('uA'); eq(S.list()[0].status, 'ok', 'y para A');
    ok((await S.request('Vegeta')).error === 'Ya sois amigos.', 'no se repite');
    ok((await S.accept('uB')).ok === false, 'sólo se acepta lo entrante');

    // ---- reglas: sólo quien recibe acepta (réplica de firestore.rules) ----
    put('friendships/uA_uC', { users: ['uA', 'uC'], from: 'uC', to: 'uA', status: 'pending', names: { uC: 'Cell', uA: 'Goku_77' }, at: fv.serverTimestamp() });
    await tick(); ok(S.incoming().length === 1, 'solicitud de un tercero');
    ok((await S.remove('uC')).ok && !db.has('friendships/uA_uC'), 'se puede rechazar borrándola');

    // ---- en línea (aproximado) ----
    await tick(); await S.refreshPresence(true);
    ok(S.list()[0].online === true && S.list()[0].play === false, 'B escribió su latido al aceptar: A lo ve en línea (sin jugar)');
    db.delete('pres/uB'); await S.refreshPresence(true); ok(S.list()[0].online === false, 'sin latido del amigo → desconectado');
    await as('uB'); S.setRoom(''); clock += 1000;
    // B escribe su latido al tener amigos
    S.setPlaying(true); await tick();
    ok(db.get('pres/uB') && db.get('pres/uB').on === true && db.get('pres/uB').play === true, 'B escribe «en línea» y «jugando»');
    await as('uA'); await S.refreshPresence(true);
    ok(S.list()[0].online && S.list()[0].play, 'A lo ve en línea y jugando');
    clock += 26 * 60 * 1000; await S.refreshPresence(true);
    ok(!S.list()[0].online, 'tras 25 min sin latido, desconectado');
    clock += 1000;
    const w0 = [...db.keys()].filter(k => k.startsWith('pres/')).length;
    S.setInvisible(true); await tick();
    ok(db.get('pres/uA').on === false, 'modo invisible: aparece desconectado');
    S.setPlaying(true); await tick(); ok(db.get('pres/uA').on === false, 'invisible no se «enciende» al jugar');
    S.setPlaying(false); S.setInvisible(false); await tick(); ok(db.get('pres/uA').on === true, 'al salir de invisible vuelve a latir');
    ok(w0 >= 1, 'hay presencia escrita');

    // ---- invitaciones ----
    ok((await S.invite('uB')).error === 'Primero crea una sala.', 'sin sala no se puede invitar');
    S.setRoom('ABCD2'); await tick();
    ok(db.get('pres/uA').room === 'ABCD2', 'la presencia lleva el código de la sala');
    ok((await S.invite('uZ')).ok === false, 'sólo a amigos');
    ok((await S.invite('uB')).ok, 'A invita a B');
    ok(db.get('inv/uB_uA').room === 'ABCD2' && db.get('inv/uB_uA').to === 'uB', 'invitación con id para_de y el código de sala');
    await as('uB'); eq(S.inbox().map(i => i.room), ['ABCD2'], 'B recibe la invitación');
    eq(S.inbox()[0].name, 'Goku_77', 'con el nombre de A');
    const acc = S.acceptInvite('uA'); ok(acc.ok && acc.room === 'ABCD2', 'aceptar devuelve el código para entrar con el flujo de siempre');
    await tick(); ok(!db.has('inv/uB_uA') && S.inbox().length === 0, 'la invitación se consume');
    // caducada
    await as('uA'); S.setRoom('ABCD2'); await S.invite('uB'); clock += 4 * 60 * 1000; await as('uB'); await tick();
    ok(S.inbox().length === 0 && !db.has('inv/uB_uA'), 'invitación de hace más de 3 min: se descarta y se borra');
    // rechazar y retirar al cerrar sala
    await as('uA'); S.setRoom('QWERT'); await S.invite('uB'); await as('uB'); await tick();
    eq(S.inbox().length, 1, 'nueva invitación'); S.declineInvite('uA'); await tick(); ok(!db.has('inv/uB_uA'), 'rechazar la borra');
    await as('uA'); S.setRoom('QWERT'); await S.invite('uB'); ok(db.has('inv/uB_uA'), 'invitada'); S.setRoom(''); await tick();
    ok(!db.has('inv/uB_uA'), 'al cerrar la sala se retiran las invitaciones');
    // de alguien que no es amigo
    put('inv/uA_uC', { to: 'uA', from: 'uC', room: 'ZZZZZ', name: 'Cell', at: fv.serverTimestamp() });
    await tick(); ok(S.inbox().length === 0, 'una invitación de quien no es amigo se ignora');

    // ---- eliminar amigo y borrar cuenta ----
    ok((await S.remove('uB')).ok && !db.has('friendships/uA_uB'), 'eliminar amigo');
    await tick(); eq(S.list().length, 0, 'desaparece de la lista');
    await S.request('Vegeta'); await S.stop('delete');
    ok(!db.has('names/goku_77') && !db.has('profiles/uA') && !db.has('pres/uA') && ![...db.keys()].some(k => k.startsWith('friendships/') && k.includes('uA')), 'borrar cuenta: apodo, perfil, presencia y amistades fuera');
    ok((await as('uC', 'Goku_77')) === 'need-nick' && S.me.name === 'Goku_77', 'el apodo liberado puede usarlo otra persona');

    // ---- sin cuenta en la nube ----
    await S.stop(); eq(await S.start(), 'off', 'sin cuenta en la nube / invitado: el sistema no se activa');
  };
  return () => run().finally(() => { Date.now = realNow; delete global.localStorage; S.stop(); });
};
