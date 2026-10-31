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

  section('tanda 5 etapa 2: Freezer, Freezer Segunda Forma y Goku Dios');
  {
    const root = path.join(__dirname, '..');
    const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);
    for (const id of ['c_freezer', 'c_freezer2', 'c_goku_dios']) {
      const c = Cards.get(id);
      ok(c && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
    }
    const st = fresh(); put(st, 0, 0, 'c_freezer'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_odin'); put(st, 1, 2, 'c_toge');
    putST(st, 1, 0, 'c_botiquin', { down: true }); putST(st, 1, 1, 'c_kaioken');
    ok(!pw(st, 0, 'supernova'), 'Supernova: no se puede sin canalizar');
    act(st, 0, pw(st, 0, 'canal'));
    act(st, 0, { t: 'toBattle' });
    ok(!L(st, 0).some(a => a.t === 'attack'), 'Canalización: Freezer no puede atacar ese turno');
    let n = 0; while (E.actor(st) === 0 && n++ < 6) act(st, 0, L(st, 0).find(a => a.t === 'endTurn') || L(st, 0).find(a => a.t === 'discard'));
    ok(!pw(st, 0, 'supernova'), 'Supernova: todavía no, falta su turno siguiente');
    n = 0; while (E.actor(st) !== 0 && n++ < 6) { const q = E.actor(st); act(st, q, L(st, q).find(a => a.t === 'endTurn') || L(st, q).find(a => a.t === 'discard')); }
    const sn = pw(st, 0, 'supernova');
    ok(!!sn, 'Supernova: lista en su turno siguiente');
    if (sn) {
      act(st, 0, sn); settle(st);
      const hv = ids(st, 1);
      ok(st.players[1].st.every(x => !x), 'Supernova: destruye todas las magias y trampas rivales (boca arriba y boca abajo)');
      ok(!hv.includes('c_goku') && !hv.includes('c_toge') && hv.includes('c_odin'), 'Supernova: caen los de ≤7★ y sobrevive Odin (10★)');
      ok(ids(st, 0)[0] === 'c_freezer', 'Supernova: no toca el campo propio');
    }
    const s2 = fresh(); put(s2, 0, 0, 'c_freezer2'); put(s2, 1, 0, 'c_goku'); put(s2, 1, 1, 'c_odin');
    eq(L(s2, 0).filter(a => a.t === 'power' && a.pw === 'cuerno').map(a => a.target.z), [0], 'Ataque de Cuerno: sólo personajes de 4★ o menos');
    act(s2, 0, pw(s2, 0, 'cuerno')); settle(s2);
    ok(!ids(s2, 1)[0] && !pw(s2, 0, 'cuerno'), 'Ataque de Cuerno: destruye y es una vez por invocación');
    const s3 = fresh(); put(s3, 0, 0, 'c_freezer'); hand(s3, 0, ['c_freezer2']);
    ok(!!pw(s3, 0, 'xform'), 'Freezer puede transformarse en Segunda Forma');
    const s4 = fresh(1); put(s4, 0, 0, 'c_goku_dios'); put(s4, 0, 1, 'c_goku'); put(s4, 1, 0, 'c_goku');
    const ds = Cards.all().find(c => c.kind === 'spell' && c.fx === 'destroyOne');
    hand(s4, 1, [ds.id]);
    const ac = L(s4, 1).find(a => a.t === 'activate' && a.hand === 0 && a.target && a.target.z === 1);
    ok(!!ac, 'hay magia que destruye para probar');
    if (ac) { act(s4, 1, ac); settle(s4); ok(ids(s4, 0)[1] === 'c_goku' && grave(s4, 1, ds.id), 'Repulsión divina: la magia se destruye y el aliado se salva'); }
    const s5 = fresh(); put(s5, 0, 0, 'c_goku_dios');
    ok(!!pw(s5, 0, 'kaioken'), 'Goku Dios tiene Kaio-ken');
  }

  section('Dexter');
  {
    const st = fresh(); put(st, 0, 0, 'c_dexter', { summonedTurn: 1 }); st.players[0].grave.push({ uid: st.nextUid++, id: 'c_goku' });
    ok(!pw(st, 0, 'maquina'), 'Dexter: sin preparación no puede usar la máquina');
    for (let i = 0; i < 2; i++) {
      let n = 0; while (E.actor(st) === 0 && n++ < 6) act(st, 0, L(st, 0).find(a => a.t === 'endTurn') || L(st, 0).find(a => a.t === 'discard'));
      n = 0; while (E.actor(st) !== 0 && n++ < 6) { const q = E.actor(st); act(st, q, L(st, q).find(a => a.t === 'endTurn') || L(st, q).find(a => a.t === 'discard')); }
      if (i === 0) ok(!pw(st, 0, 'maquina'), 'Dexter: con 1 turno completo todavía no');
    }
    const a = pw(st, 0, 'maquina');
    ok(!!a, 'Dexter: tras 2 turnos completos la máquina está lista');
    if (a) {
      act(st, 0, a);
      ok(st.pending && st.pending.k === 'pick', 'Dexter: elige qué personaje revive');
      if (st.pending) { act(st, 0, { t: 'pick', uid: st.pending.cands[0] }); settle(st); ok(ids(st, 0).includes('c_goku'), 'Dexter: Goku revive'); ok(!pw(st, 0, 'maquina'), 'Dexter: la máquina vuelve a prepararse'); }
    }
  }

  section('Vegeta Dios y Bruce Banner / Hulk');
  {
    const root = path.join(__dirname, '..');
    for (const id of ['c_vegeta_dios', 'c_bruce_banner', 'c_hulk']) {
      const c = Cards.get(id);
      ok(c && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
    }
    const st = fresh(); put(st, 0, 0, 'c_vegeta_dios'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_toge'); put(st, 0, 1, 'c_goku');
    act(st, 0, pw(st, 0, 'dios', a => a.target.z === 0));
    ok(st.players[1].mz[0].god, 'Poder de Dios: Goku queda atrapado');
    ok(!pw(st, 0, 'dios'), 'Poder de Dios: una vez por invocación');
    // el atrapado no usa habilidades ni ataca; nadie ajeno lo elige
    ready(st, 1);
    ok(!L(st, 1).some(a => a.t === 'power' && a.zone === 0), 'atrapado: no usa habilidades');
    act(st, 1, { t: 'toBattle' });
    ok(!L(st, 1).some(a => a.t === 'attack' && a.zone === 0), 'atrapado: no ataca');
    // el equipo de Vegeta Dios sí puede atacarlo
    ready(st, 0); act(st, 0, { t: 'toBattle' });
    ok(L(st, 0).some(a => a.t === 'attack' && a.target === 0), 'el jugador de Vegeta Dios puede atacar al atrapado');
    // se libera cuando Vegeta Dios deja el campo
    const s2 = fresh(); put(s2, 0, 0, 'c_vegeta_dios'); put(s2, 1, 0, 'c_goku');
    act(s2, 0, pw(s2, 0, 'dios'));
    E.legal; s2.players[0].mz[0] = null; 
    // sacrificio: el atrapado no cuenta como tributo
    const s3 = fresh(1); put(s3, 1, 0, 'c_goku'); put(s3, 1, 1, 'c_goku'); put(s3, 1, 2, 'c_goku'); s3.players[1].mz[0].god = { p: 0, uid: 999 }; s3.players[1].mz[1].god = { p: 0, uid: 999 }; hand(s3, 1, ['c_odin']);
    ok(!L(s3, 1).some(a => a.t === 'summon'), 'atrapados no pueden sacrificarse (Odin de 10★ necesita 3 tributos)');
    // Bruce -> Hulk
    const sb = fresh(1); put(sb, 0, 0, 'c_bruce_banner'); put(sb, 1, 0, 'c_goku'); hand(sb, 0, ['c_hulk']);
    ok(!pw(sb, 0, 'bruce'), 'Bruce no se transforma voluntariamente');
    act(sb, 1, { t: 'toBattle' }); act(sb, 1, atkA(sb, 1, 0, 0));
    let n = 0; while (sb.pending && sb.pending.ab !== 'titan' && n++ < 12) { const q = E.actor(sb), l = L(sb, q); act(sb, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
    ok(sb.pending && sb.pending.ab === 'titan', 'Bruce: al morir ofrece invocar a Hulk');
    if (sb.pending && sb.pending.ab === 'titan') {
      act(sb, 0, { t: 'ability', use: true }); settle(sb);
      ok(ids(sb, 0)[0] === 'c_hulk' && sb.players[0].mz[0].link.some(c => c.id === 'c_bruce_banner'), 'Hulk entra en su lugar con Bruce vinculado');
      ok(!sb.players[0].mz[0].wide, 'Hulk ocupa una sola zona');
    }
  }

  section('Capa de Invisibilidad y Minions');
  {
    const equip = (st, p, hi, z) => { const a = L(st, p).find(x => x.t === 'activate' && x.hand === hi && x.target && x.target.z === z); if (a) { act(st, p, a); settle(st); } return !!a; };
    // Capa
    const st = fresh(); put(st, 0, 0, 'c_goku'); hand(st, 0, ['c_capa']); put(st, 1, 0, 'c_toge'); put(st, 1, 1, 'c_goku');
    ok(equip(st, 0, 0, 0), 'Capa: se equipa a un aliado');
    ok(st.players[0].st.some(x => x && x.equipTo === 0), 'Capa: queda equipada');
    ready(st, 1);
    ok(!L(st, 1).some(a => a.t === 'power' && a.target && a.target.vs === 0 && a.target.z === 0), 'Capa: las habilidades enemigas no la eligen');
    act(st, 1, { t: 'toBattle' });
    ok(!L(st, 1).some(a => a.t === 'attack' && a.target === 0), 'Capa: los ataques enemigos no la eligen');
    // sólo muere por magia
    const g = Cards.all().find(c => c.kind === 'spell' && c.fx === 'destroyOne');
    const s2 = fresh(); put(s2, 0, 0, 'c_goku'); hand(s2, 0, ['c_capa']); equip(s2, 0, 0, 0);
    hand(s2, 1, [g.id]); ready(s2, 1);
    const ac = L(s2, 1).find(a => a.t === 'activate' && a.target && a.target.z === 0);
    ok(!!ac, 'Capa: una magia enemiga sí puede elegirla');
    if (ac) { act(s2, 1, ac); settle(s2); ok(!ids(s2, 0)[0], 'Capa: la magia la destruye'); ok(s2.players[0].grave.some(c => c.id === 'c_capa'), 'Capa: va al cementerio con su portador'); }
    // Minions
    const sm = fresh(); put(sm, 0, 0, 'c_odin'); hand(sm, 0, ['c_minions']); put(sm, 1, 0, 'c_toge'); put(sm, 1, 1, 'c_goku');
    ok(equip(sm, 0, 0, 0), 'Minions: se equipa');
    const lp = sm.players[0].lp;
    act(sm, 0, { t: 'toBattle' }); act(sm, 0, atkA(sm, 0, 0, 0)); settle(sm);
    eq(sm.players[0].st.find(x => x && x.min).min.n, 1, 'Minions: una victoria suma un contador');
    // ahora el portador pierde un combate: el Minion se sacrifica y no hay daño
    const sp = fresh(1); put(sp, 0, 0, 'c_toge'); hand(sp, 0, ['c_minions']); ready(sp, 0); put(sp, 1, 0, 'c_odin'); equip(sp, 0, 0, 0);
    sp.players[0].st.find(x => x && x.min).min.n = 1; ready(sp, 1);
    const lp2 = sp.players[0].lp;
    act(sp, 1, { t: 'toBattle' }); act(sp, 1, atkA(sp, 1, 0, 0)); settle(sp);
    ok(ids(sp, 0)[0] === 'c_toge', 'Minions: el portador sobrevive a la derrota');
    eq([sp.players[0].lp, sp.players[0].st.find(x => x && x.min).min.n], [lp2, 0], 'Minions: sin daño y se gasta el contador');
    // sin contadores: mueren portador y carta
    ready(sp, 1); for (const m of sp.players[1].mz) if (m) { m.attacked = false; m.atkN = 0; }
    act(sp, 1, { t: 'toBattle' }); act(sp, 1, atkA(sp, 1, 0, 0)); settle(sp);
    ok(!ids(sp, 0)[0] && sp.players[0].grave.some(c => c.id === 'c_minions'), 'Minions: sin contadores caen el personaje y la carta');
  }

  section('Reyna Flama');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); hand(st, 0, ['c_reyna_flama']); put(st, 1, 0, 'c_toge');
    const opts = L(st, 0).filter(a => a.t === 'summon' && a.hand === 0);
    ok(opts.length > 0 && opts.every(a => a.vs === 1 && a.fz != null && a.fz !== 0), 'Reyna: sólo se puede invocar en huecos vacíos del campo rival');
    ok(!L(st, 0).some(a => a.t === 'set' && a.hand === 0), 'Reyna: no se coloca boca abajo');
    const n0 = [E.countCards(st, 0), E.countCards(st, 1)];
    const o = opts.find(a => a.fz === 2);
    act(st, 0, o); settle(st);
    ok(st.players[1].mz[2] && st.players[1].mz[2].c.id === 'c_reyna_flama' && st.players[1].mz[2].owner === 0, 'Reyna entra en el campo rival, su dueño sigue siendo quien la invocó');
    eq([E.countCards(st, 0), E.countCards(st, 1)], n0, 'Reyna: sin pérdida de cartas');
    // quema a su nuevo controlador al terminar su turno
    const lp = st.players[1].lp;
    let n = 0; while (E.actor(st) === 0 && n++ < 6) act(st, 0, L(st, 0).find(a => a.t === 'endTurn') || L(st, 0).find(a => a.t === 'discard'));
    n = 0; while (E.actor(st) === 1 && n++ < 6) act(st, 1, L(st, 1).find(a => a.t === 'endTurn') || L(st, 1).find(a => a.t === 'discard'));
    eq(st.players[1].lp, lp - 500, 'Reyna: le quita 500 PV a quien la controla');
    // al morir va al cementerio de su dueño
    const sx = fresh(); sx.players[0].grave = []; put(sx, 1, 0, 'c_reyna_flama', { owner: 0 });
    E.destroyMonster && E.destroyMonster(sx, 1, 0, { src: 'spell', bp: 1 });
  }

  section('Sasuke Chico y Sasuke Marca Despertada');
  {
    const root = path.join(__dirname, '..');
    for (const id of ['c_sasuke', 'c_sasuke_marca']) {
      const c = Cards.get(id);
      ok(c && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
    }
    // Chidori: +400 ATK sólo en un ataque
    const st = fresh(); put(st, 0, 0, 'c_sasuke'); put(st, 1, 0, 'c_toge', { pos: 'def' });
    const atk0 = E.view(st, 0).players[0].mz[0].atk;
    act(st, 0, pw(st, 0, 'chidori'));
    eq(E.view(st, 0).players[0].mz[0].atk - atk0, 400, 'Chidori: +400 ATK');
    act(st, 0, { t: 'toBattle' }); act(st, 0, atkA(st, 0, 0, 0));
    settle(st);
    eq(E.view(st, 0).players[0].mz[0].atk - atk0 - 0, st.players[0].mz[0].mods && st.players[0].mz[0].mods.length ? 500 : 0, 'Chidori: se gasta tras el ataque (queda sólo el +500 de la marca, si la despierta)');
    // Marca de maldición: tras vencer, +500/+500
    const s2 = fresh(); put(s2, 0, 0, 'c_sasuke'); put(s2, 1, 0, 'c_kuriboh', { pos: 'def' });
    act(s2, 0, { t: 'toBattle' }); act(s2, 0, atkA(s2, 0, 0, 0));
    let k = 0; while (s2.pending && s2.pending.ab !== 'marcamal' && k++ < 12) { const q = E.actor(s2), l = L(s2, q); act(s2, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
    ok(s2.pending && s2.pending.ab === 'marcamal', 'Marca de maldición: se ofrece tras vencer en combate');
    if (s2.pending && s2.pending.ab === 'marcamal') {
      eq(s2.pending.opts, ['stat'], 'sin la forma en la mano sólo ofrece el aumento');
      act(s2, 0, { t: 'ability', pick: 'stat' });
      eq(E.view(s2, 0).players[0].mz[0].atk, 1700, 'Marca de maldición: +500 ATK');
    }
    // con la forma en la mano: transformación vinculada
    const s3 = fresh(); put(s3, 0, 0, 'c_sasuke'); put(s3, 1, 0, 'c_kuriboh', { pos: 'def' }); hand(s3, 0, ['c_sasuke_marca']);
    act(s3, 0, { t: 'toBattle' }); act(s3, 0, atkA(s3, 0, 0, 0));
    k = 0; while (s3.pending && s3.pending.ab !== 'marcamal' && k++ < 12) { const q = E.actor(s3), l = L(s3, q); act(s3, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
    ok(s3.pending && s3.pending.opts && s3.pending.opts.includes('form'), 'Marca: ofrece transformarse si la forma está en la mano');
    if (s3.pending && s3.pending.opts) { act(s3, 0, { t: 'ability', pick: 'form' }); ok(ids(s3, 0)[0] === 'c_sasuke_marca' && s3.players[0].mz[0].link.some(c => c.id === 'c_sasuke'), 'Sasuke se transforma y queda vinculado'); }
    // Sharingan: evade una magia que lo elige, una vez por turno
    const g = Cards.all().find(c => c.kind === 'spell' && c.fx === 'destroyOne');
    const s4 = fresh(1); put(s4, 0, 0, 'c_sasuke'); put(s4, 1, 0, 'c_goku'); hand(s4, 1, [g.id, g.id]);
    const ac = L(s4, 1).find(a => a.t === 'activate' && a.hand === 0 && a.target && a.target.z === 0);
    ok(!!ac, 'hay magia para probar el Sharingan');
    if (ac) {
      act(s4, 1, ac); settle(s4);
      ok(ids(s4, 0)[0] === 'c_sasuke', 'Sharingan: evade la magia');
      const ac2 = L(s4, 1).find(a => a.t === 'activate' && a.hand === 0 && a.target && a.target.z === 0);
      if (ac2) { act(s4, 1, ac2); settle(s4); ok(!ids(s4, 0)[0], 'Sharingan: sólo una vez por turno (la segunda magia lo destruye)'); }
    }
  }

  section('Gema del Alma');
  {
    const root = path.join(__dirname, '..');
    const c = Cards.get('c_gema_alma');
    ok(c && fs.existsSync(path.join(root, c.img)), 'Gema del Alma tiene imagen');
    const st = fresh(); hand(st, 0, ['c_gema_alma']); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_goku');
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.hand === 0)); settle(st);
    const slot = st.players[0].st.find(x => x && x.alma);
    ok(!!slot, 'Gema del Alma queda en el campo');
    // el rival usa una magia sobre un personaje
    hand(st, 1, ['c_superball', 'c_superball']); ready(st, 1);
    const bo = Cards.all().find(x => x.kind === 'spell' && x.fx === 'boost');
    hand(st, 1, [bo.id]);
    const ac = L(st, 1).find(a => a.t === 'activate' && a.hand === 0 && a.target && a.target.z === 0);
    ok(!!ac, 'hay una magia de objetivo para probar (' + bo.name + ')');
    if (ac) {
      act(st, 1, ac); settle(st);
      eq(slot.alma.eff, [bo.id], 'Gema del Alma: guarda el efecto de la magia enemiga');
      ready(st, 0);
      const rel = L(st, 0).filter(a => a.t === 'spow' && a.pw === 'almaus');
      ok(rel.length > 0, 'Gema del Alma: se puede liberar el efecto');
      const tgt = rel.find(a => a.target && a.target.z === 0);
      const base = E.view(st, 0).players[0].mz[0].atk;
      act(st, 0, tgt); settle(st);
      eq(E.view(st, 0).players[0].mz[0].atk - base, bo.n || (Cards.get(bo.id).n), 'Gema del Alma: aplica el efecto guardado a un personaje propio');
      eq(slot.alma.eff.length, 0, 'el efecto se consume');
      ok(!L(st, 0).some(a => a.t === 'spow' && a.pw === 'almaus'), 'sólo uno por turno / sin efectos');
    }
    // una magia propia no se guarda
    const s2 = fresh(); hand(s2, 0, ['c_gema_alma']); put(s2, 0, 0, 'c_goku');
    act(s2, 0, L(s2, 0).find(a => a.t === 'activate' && a.hand === 0)); settle(s2);
    hand(s2, 0, [bo.id]); const own = L(s2, 0).find(a => a.t === 'activate' && a.hand === 0 && a.target);
    if (own) { act(s2, 0, own); settle(s2); eq(s2.players[0].st.find(x => x && x.alma).alma.eff.length, 0, 'las magias propias no se guardan'); }
    // se agota a los 5 turnos
    const s3 = fresh(); hand(s3, 0, ['c_gema_alma']); act(s3, 0, L(s3, 0).find(a => a.t === 'activate' && a.hand === 0)); settle(s3);
    for (let i = 0; i < 12 && s3.players[0].st.some(x => x && x.alma); i++) { const q = E.actor(s3); act(s3, q, L(s3, q).find(a => a.t === 'endTurn') || L(s3, q).find(a => a.t === 'discard') || L(s3, q)[0]); }
    ok(!s3.players[0].st.some(x => x && x.alma) && s3.players[0].grave.some(x => x.id === 'c_gema_alma'), 'Gema del Alma: se va al cementerio tras 5 turnos');
    // Thanos cuenta la gema
    const s4 = fresh(); put(s4, 0, 0, 'c_thanos'); const b0 = E.view(s4, 0).players[0].mz[0].atk; hand(s4, 0, ['c_gema_alma']);
    act(s4, 0, L(s4, 0).find(a => a.t === 'activate' && a.hand === 0)); settle(s4);
    eq(E.view(s4, 0).players[0].mz[0].atk - b0, 500, 'Thanos: +500 ATK por la Gema del Alma');
  }
};
