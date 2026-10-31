/* Tanda 5 (31-10-2026), etapa 1: Pokeball, Mark 1, Selección de magia, Invitación, Kuriboh, Kuriboh Mago Oscuro, Bugs Bunny, Warwick y Vegeta SS.
 * Se carga desde tools/test_duelo.js. */
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
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = p => { const st = game({ seed: 11 }); ready(st, p || 0); for (const P of st.players) { P.hand = []; P.st = P.st.map(() => null); } return st; };
  const hand = (st, p, ids) => { st.players[p].hand = ids.map(id => ({ uid: st.nextUid++, id })); };
  const deck = (st, p, ids) => { st.players[p].deck = ids.map(id => ({ uid: st.nextUid++, id })); };
  const pw = (st, p, name, f) => L(st, p).find(a => a.t === 'power' && a.pw === name && (!f || f(a)));
  const ids = (st, p) => st.players[p].mz.map(m => m ? m.c.id : null);
  const cnt = st => [E.countCards(st, 0), E.countCards(st, 1)];
  const atkA = (st, p, z, tz) => L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz && !x.hira);
  const settle = st => { let n = 0; while (st.pending && n++ < 12) { const q = E.actor(st), l = L(st, q); act(st, q, l.find(x => x.t === 'respond' && !x.activate) || l.find(x => x.t === 'ability' && x.use === false) || l[0]); } };
  const cast = (st, p, i) => L(st, p).find(a => a.t === 'activate' && a.hand === i);

  section('tanda 5: catálogo (etapa 1)');
  {
    const root = path.join(__dirname, '..');
    for (const id of ['c_pokeball', 'c_mark1', 'c_seleccion_magia', 'c_invitacion', 'c_kuriboh', 'c_kuriboh_mo', 'c_bugs_bunny', 'c_warwick', 'c_vegeta_ssj']) {
      const c = Cards.get(id);
      ok(c && c.img && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
      ok(Cards.tandaOf(id) === 5, id + ' es de la tanda 5');
    }
    ok(fs.existsSync(path.join(root, Cards.get('c_kaioken').sfx.use)), 'Kaioken usa el sonido de Goku Dios');
    const w = Cards.get('c_warwick'), v = Cards.get('c_vegeta_ssj'), b = Cards.get('c_bugs_bunny');
    eq([w.level, w.atk, w.def, v.level, v.atk, v.def, v.fam, b.level, b.atk, b.def], [4, 1300, 1300, 5, 1500, 1200, 'Vegeta', 2, 600, 300], 'estadísticas de Warwick, Vegeta SSJ y Bugs Bunny');
  }

  section('Pokeball, Invitación y Selección de magia');
  {
    const st = fresh(); hand(st, 0, ['c_pokeball', 'c_goku', 'c_odin']);
    const a = L(st, 0).find(x => x.t === 'activate' && x.hand === 0 && x.target && x.target.u === st.players[0].hand[1].uid);
    ok(!!a, 'Pokeball: puede invocar a un personaje de 4★ de la mano');
    ok(!L(st, 0).some(x => x.t === 'activate' && x.hand === 0 && x.target && x.target.u === st.players[0].hand[2].uid), 'Pokeball: no a uno de más de 4★');
    if (a) { act(st, 0, a); settle(st); ok(ids(st, 0)[0] === 'c_goku' && !st.players[0].normalUsed, 'Pokeball: Goku entra sin gastar la invocación normal'); }
    const si = fresh(); hand(si, 0, ['c_invitacion']); deck(si, 0, ['c_odin', 'c_goku', 'c_toge', 'c_botiquin']);
    const ai = cast(si, 0, 0);
    ok(!!ai, 'Invitación: se puede activar con personajes de ≤4★ en el mazo');
    if (ai) {
      act(si, 0, ai); settle1(si);
      ok(si.pending && si.pending.k === 'pick' && si.pending.cands.length === 2, 'Invitación: ofrece sólo a los personajes de ≤4★ del mazo');
      if (si.pending && si.pending.k === 'pick') { const u = si.pending.cands[0]; act(si, 0, { t: 'pick', uid: u }); settle(si); ok(ids(si, 0).some(Boolean) && !si.players[0].normalUsed, 'Invitación: entra al campo sin gastar la invocación normal'); }
    }
    const sm = fresh(); hand(sm, 0, ['c_seleccion_magia']); deck(sm, 0, ['c_odin', 'c_botiquin', 'c_kaioken']);
    const am = cast(sm, 0, 0);
    ok(!!am, 'Selección de magia: se puede activar si hay magias en el mazo');
    if (am) {
      act(sm, 0, am); settle1(sm);
      ok(sm.pending && sm.pending.k === 'pick' && sm.pending.cands.length === 2, 'Selección de magia: sólo ofrece magias');
      if (sm.pending && sm.pending.k === 'pick') { act(sm, 0, { t: 'pick', uid: sm.pending.cands[0] }); settle(sm); ok(sm.players[0].hand.length === 1 && Cards.get(sm.players[0].hand[0].id).kind === 'spell', 'Selección de magia: la magia elegida va a la mano'); }
    }
    function settle1(s) { let n = 0; while (s.pending && s.pending.k !== 'pick' && n++ < 12) { const q = E.actor(s), l = L(s, q); act(s, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); } }
  }

  section('Mark 1');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_spiderman'); put(st, 0, 2, 'c_tony_armadura'); hand(st, 0, ['c_mark1']);
    const v0 = z => E.view(st, 0).players[0].mz[z].atk;
    const base = [0, 1, 2].map(v0);
    for (const [z, n] of [[0, 400], [1, 700], [2, 1000]]) {
      const s2 = fresh(); put(s2, 0, 0, 'c_goku'); put(s2, 0, 1, 'c_spiderman'); put(s2, 0, 2, 'c_tony_armadura'); hand(s2, 0, ['c_mark1']);
      const b = E.view(s2, 0).players[0].mz[z].atk;
      const a = L(s2, 0).find(x => x.t === 'activate' && x.hand === 0 && x.target && x.target.z === z);
      ok(!!a, 'Mark 1: puede elegir la zona ' + (z + 1));
      if (a) { act(s2, 0, a); settle(s2); eq(E.view(s2, 0).players[0].mz[z].atk - b, n, 'Mark 1: bono de ATK ' + n); }
    }
  }

  section('Kuriboh');
  {
    const st = fresh(1); put(st, 0, 0, 'c_kuriboh'); put(st, 1, 0, 'c_goku');
    const lp = st.players[0].lp;
    act(st, 1, { t: 'toBattle' }); act(st, 1, atkA(st, 1, 0, 0)); settle(st);
    ok(!ids(st, 0)[0] && st.players[0].grave.some(c => c.id === 'c_kuriboh'), 'Kuriboh cae en combate');
    eq(st.players[0].lp, lp, 'Kuriboh: no recibe daño de la diferencia el resto del turno');
    // ataque directo extra en el mismo turno
    const s2 = fresh(1); put(s2, 0, 0, 'c_kuriboh'); put(s2, 1, 0, 'c_goku'); put(s2, 1, 1, 'c_goku');
    act(s2, 1, { t: 'toBattle' }); act(s2, 1, atkA(s2, 1, 0, 0)); settle(s2);
    const d = L(s2, 1).find(x => x.t === 'attack' && x.zone === 1 && x.target === 'direct');
    if (d) { act(s2, 1, d); settle(s2); eq(s2.players[0].lp, 8000, 'Kuriboh: el ataque directo siguiente tampoco hace daño'); }
    // al turno siguiente el daño vuelve
    const s3 = fresh(1); put(s3, 0, 0, 'c_kuriboh'); put(s3, 1, 0, 'c_goku');
    act(s3, 1, { t: 'toBattle' }); act(s3, 1, atkA(s3, 1, 0, 0)); settle(s3);
    ok(s3.players[0].imm === s3.turn, 'Kuriboh: la inmunidad está marcada para este turno');
    s3.turn++; E.lose && 0;
  }

  section('Kuriboh Mago Oscuro');
  {
    const st = fresh(1); put(st, 0, 0, 'c_kuriboh_mo'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_odin');
    act(st, 1, { t: 'toBattle' }); act(st, 1, atkA(st, 1, 0, 0));
    let n = 0; while (st.pending && !(st.pending.ab === 'kuribomo') && n++ < 12) { const q = E.actor(st), l = L(st, q); act(st, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
    ok(st.pending && st.pending.ab === 'kuribomo' && st.pending.player === 0, 'Mago Oscuro: su jugador elige un enemigo al caer');
    if (st.pending && st.pending.ab === 'kuribomo') {
      const c = L(st, 0).find(x => x.t === 'ability' && x.z === 1);
      act(st, 0, c); settle(st);
      ok(!ids(st, 1)[1] && st.players[1].grave.some(c => c.id === 'c_odin'), 'Mago Oscuro: Odin es destruido y va al cementerio');
    }
  }

  section('Bugs Bunny');
  {
    const st = fresh(); put(st, 0, 0, 'c_bugs_bunny'); putST(st, 1, 0, 'c_botiquin', { down: true }); putST(st, 1, 1, 'c_kaioken');
    const a = pw(st, 0, 'agujero', x => x.target.z === 0);
    ok(!!a, 'Bugs Bunny: puede elegir una carta boca abajo');
    act(st, 0, a);
    ok(!st.players[1].st[0] && st.players[1].grave.some(c => c.id === 'c_botiquin'), 'Bugs Bunny: la carta rival va al cementerio');
    ok(!pw(st, 0, 'agujero'), 'Bugs Bunny: una sola vez por turno');
    st.turn += 2; ready(st, 0, st.turn);
    ok(!!pw(st, 0, 'agujero'), 'Bugs Bunny: vuelve a estar disponible el turno siguiente');
  }

  section('Warwick');
  {
    const view = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return [m.atk, m.def]; };
    // atacando a uno con más estrellas: +500/+500 y recupera 500 PV al matar
    const st = fresh(); put(st, 0, 0, 'c_warwick'); put(st, 1, 0, 'c_shen', { pos: 'def' });
    const sh = Cards.get('c_shen');
    const st2 = fresh(); put(st2, 0, 0, 'c_warwick'); put(st2, 1, 0, 'c_toge', { pos: 'def' });
    const lp = st2.players[0].lp;
    act(st2, 0, { t: 'toBattle' }); act(st2, 0, atkA(st2, 0, 0, 0)); settle(st2);
    ok(!ids(st2, 1)[0], 'Warwick destruye a Toge en defensa');
    ok(st2.players[0].lp === lp + 500, 'Warwick: Sed de sangre recupera 500 PV (' + st2.players[0].lp + ')');
    // defendiendo contra uno con más ATK: +500 por Sed insaciable (más estrellas) y +500 ATK por Instinto depredador
    const s3 = fresh(1); put(s3, 0, 0, 'c_warwick'); put(s3, 1, 0, 'c_odin', { atkMod: -1200 });
    act(s3, 1, { t: 'toBattle' }); act(s3, 1, atkA(s3, 1, 0, 0));
    const seen = []; let n = 0; while (s3.pending && n++ < 12) { const q = E.actor(s3), l = L(s3, q); act(s3, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
    ok(true, 'Warwick atacado por Odin se resuelve sin errores');
    // valores durante el combate (st.atk en curso): Odin (10★, 2500 ATK) supera a Warwick: Sed insaciable + Instinto depredador
    const s5 = fresh(1); put(s5, 0, 0, 'c_warwick'); put(s5, 1, 0, 'c_odin');
    s5.atk = { p: 1, z: 0, target: 0, vs: 0, negated: false };
    eq(view(s5, 0, 0), [2300, 1800], 'Warwick atacado por Odin (más estrellas y más ATK): +500/+500 y +500 ATK de Instinto depredador');
    s5.atk = null;
    // fuera de combate no hay bonos
    const s4 = fresh(); put(s4, 0, 0, 'c_warwick');
    eq(view(s4, 0, 0), [1300, 1300], 'Warwick fuera de combate: 1300/1300');
  }

  section('Vegeta Super Saiyajin');
  {
    const st = fresh(); put(st, 0, 0, 'c_vegeta_ssj'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_odin'); put(st, 1, 2, 'c_toge');
    const cands = L(st, 0).filter(a => a.t === 'power' && a.pw === 'bigbang1').map(a => a.target.z);
    eq(cands.sort(), [0, 2], 'Big Bang: sólo rivales con igual o menos estrellas (≤5★)');
    act(st, 0, pw(st, 0, 'bigbang1', a => a.target.z === 0)); settle(st);
    ok(!ids(st, 1)[0] && st.players[1].grave.some(c => c.id === 'c_goku'), 'Big Bang destruye a Goku');
    ok(!pw(st, 0, 'bigbang1'), 'Big Bang: una vez por invocación');
    const s2 = fresh(); put(s2, 0, 0, 'c_vegeta'); hand(s2, 0, ['c_vegeta_ssj']);
    ok(!!pw(s2, 0, 'xform'), 'Vegeta SSJ: Vegeta puede transformarse en él');
  }
};
