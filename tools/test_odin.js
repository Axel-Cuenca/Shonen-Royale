/* Odin (28-10-2026): Cargas de vida, Revelación divina y Bendición de poder. Se carga desde tools/test_duelo.js. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function (T) {
  const { E, Cards, ok, eq, section, act, game } = T;
  const L = (st, p) => E.legal(st, p);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    st.players[p].mz[z] = m; return m;
  };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = () => { const st = game({ seed: 11 }); ready(st, 0); for (const P of st.players) P.hand = []; return st; };
  const pw = (st, p, name, f) => L(st, p).filter(a => a.t === 'power' && a.pw === name && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const cnt = st => E.countCards(st, 0) + '/' + E.countCards(st, 1);
  const odinU = (st, p, z) => { const m = st.players[p].mz[z]; return (m.uBy || (m.uBy = {}))[m.c.id] || (m.uBy[m.c.id] = {}); };

  section('Odin: catálogo');
  {
    const c = Cards.get('c_odin');
    ok(c && c.level === 10 && c.atk === 2500 && c.def === 2600 && c.type === 'marvel', 'Odin: 10★ Marvel 2500/2600');
    ok(c && c.img && fs.existsSync(path.join(__dirname, '..', c.img)), 'Odin tiene imagen');
    for (const a of c.ab) ok(Cards.AB[a], 'Odin: la habilidad ' + a + ' tiene texto');
    ok(Cards.all().some(x => x.id === 'c_odin'), 'Odin sale en la colección');
  }

  section('Odin: Cargas de vida');
  {
    const st = fresh();
    put(st, 0, 0, 'c_odin'); put(st, 0, 1, 'c_popeye', { atkMod: 3000 }); put(st, 1, 0, 'c_bardock', { pos: 'def' });
    act(st, 0, { t: 'toBattle' });
    act(st, 0, L(st, 0).find(a => a.t === 'attack' && a.zone === 1 && a.target === 0));
    const v = E.view(st, 0).players[0].mz[0];
    ok(v.odin && v.odin.c >= 1, 'Odin gana una carga cuando muere un personaje del campo (' + JSON.stringify(v.odin) + ')');
    ok(pw(st, 0, 'odinvida').length === 0, 'con menos de 3 cargas no puede revivir');
    // con 3 cargas: revive a un personaje de su cementerio
    const st2 = fresh();
    put(st2, 0, 0, 'c_odin'); odinU(st2, 0, 0).odc = 3;
    st2.players[0].grave.push({ uid: st2.nextUid++, id: 'c_popeye' }, { uid: st2.nextUid++, id: 'c_creeper' });
    st2.players[1].grave.push({ uid: st2.nextUid++, id: 'c_bardock' });
    const opts = pw(st2, 0, 'odinvida');
    ok(opts.length === 2, 'puede revivir a cada personaje de SU cementerio (y a ninguno del rival): ' + opts.length);
    act(st2, 0, opts[0]);
    ok(st2.players[0].mz.some(m => m && m.c.id === 'c_popeye'), 'el personaje elegido vuelve al campo');
    ok((odinU(st2, 0, 0).odc || 0) === 0, 'gasta las 3 cargas');
    ok(pw(st2, 0, 'odinvida').length === 0, 'sin cargas ya no revive más');
  }

  section('Odin: Revelación divina');
  {
    const st = fresh();
    put(st, 0, 0, 'c_odin');
    put(st, 1, 0, 'c_popeye', { down: true, pos: 'def' }); put(st, 1, 1, 'c_creeper');          // uno boca abajo y otro boca arriba
    st.players[1].st[0] = { c: { uid: st.nextUid++, id: 'c_ola_fuego' }, down: true, setTurn: 1, equipTo: null };
    const n0 = cnt(st), ts = pw(st, 0, 'odinrev');
    ok(ts.length === 2, 'sólo se pueden elegir las cartas boca abajo del rival (' + ts.length + ')');
    ok(ts.some(a => a.target.area === 'mz' && a.target.z === 0) && ts.some(a => a.target.area === 'st' && a.target.z === 0), 'monstruo y magia/trampa boca abajo');
    ok(!ts.some(a => a.target.z === 1 && a.target.area === 'mz'), 'no el monstruo que ya está revelado');
    act(st, 0, ts.find(a => a.target.area === 'mz'));
    ok(!st.players[1].mz[0] && st.players[1].grave.some(c => c.id === 'c_popeye'), 'destruye al personaje boca abajo');
    ok(pw(st, 0, 'odinrev').length === 0, 'sólo una vez por turno');
    ok(st.players[1].st[0] && cnt(st) === n0, 'la otra carta sigue y no se pierden cartas');
    ready(st, 0, 8);
    const ts2 = pw(st, 0, 'odinrev');
    ok(ts2.length === 1 && ts2[0].target.area === 'st', 'al turno siguiente puede volver a usarlo');
    act(st, 0, ts2[0]);
    ok(!st.players[1].st[0] && st.players[1].grave.some(c => c.id === 'c_ola_fuego') && cnt(st) === n0, 'destruye la magia/trampa boca abajo');
  }

  section('Odin: Bendición de poder');
  {
    const st = fresh();
    put(st, 0, 0, 'c_odin'); put(st, 0, 1, 'c_popeye'); put(st, 0, 2, 'c_creeper'); put(st, 1, 0, 'c_bardock');
    const base = stat(st, 0, 1);
    const os = pw(st, 0, 'odinbend');
    ok(os.length === 2 && os.every(a => a.target.vs === 0 && a.target.z !== 0), 'sólo aliados y nunca a sí mismo (' + JSON.stringify(os.map(a => a.target)) + ')');
    act(st, 0, os.find(a => a.target.z === 1));
    eq(stat(st, 0, 1), [base[0] + 600, base[1] + 600], 'Popeye gana +600 ATK y +600 DEF');
    ok(pw(st, 0, 'odinbend').length === 0, 'una vez por turno');
    ready(st, 0, 8); act(st, 0, pw(st, 0, 'odinbend').find(a => a.target.z === 1));
    ready(st, 0, 10); act(st, 0, pw(st, 0, 'odinbend').find(a => a.target.z === 1));
    eq(stat(st, 0, 1), [base[0] + 1800, base[1] + 1800], 'las bendiciones se acumulan y duran más de un turno');
    ready(st, 0, 12);
    ok(pw(st, 0, 'odinbend').length === 0, 'máximo 3 veces por invocación');
    ok(E.view(st, 0).players[0].mz[0].odin.b === 3, 'la vista cuenta las bendiciones');
  }

  section('Odin: partidas al azar con Odin en el mazo');
  {
    let bad = '', done = 0, seed = 777; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const ids = Cards.custom.filter(c => !c.hidden).map(c => c.id).filter(i => i !== 'c_odin');
    for (let g = 0; g < 60 && !bad; g++) {
      const mk = () => { const d = ['c_odin', 'c_odin']; while (d.length < 30) { const id = ids[Math.floor(rnd() * ids.length)]; if (d.filter(x => x === id).length < 2) d.push(id); } return d; };
      const st = E.newGame([mk(), mk()], { seed: 900 + g, first: g % 2 });
      let n = 0;
      try {
        while (st.winner === null && n++ < 1500) {
          const p = E.actor(st), Ls = E.legal(st, p);
          if (!Ls.length) { bad = 'sin acciones legales'; break; }
          const pref = Ls.filter(a => a.t !== 'endTurn'), pool = rnd() < 0.85 && pref.length ? pref : Ls;
          const a = pool[Math.floor(rnd() * pool.length)];
          const r = E.apply(st, p, a);
          if (!r.ok) { bad = 'rechazada ' + JSON.stringify(a) + ' ' + r.error; break; }
          for (let q = 0; q < 2; q++) if (E.countCards(st, q) !== 30) { bad = `jugador ${q} tiene ${E.countCards(st, q)} cartas tras ${JSON.stringify(a)}`; break; }
          if (bad) break;
        }
        if (st.winner !== null) done++;
      } catch (e) { bad = 'excepción: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '); }
    }
    ok(!bad, bad || 'partidas con Odin sin errores'); ok(done >= 20, done + ' de 60 partidas terminaron');
  }
};
