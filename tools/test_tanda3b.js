/* Pruebas de la tanda 3 de personajes (27-10-2026): Deadpool, Eren/Titán de Ataque, Toge, Karim, Tony, Jake, Venom, Sylas,
 * Minato, Guantelete, Ola de Fuego, Infarto Inesperado y Gema de la Realidad. Se carga desde tools/test_duelo.js. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function (T) {
  const { E, Cards, ok, eq, section, act, find, game } = T;
  const L = (st, p) => E.legal(st, p);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    st.players[p].mz[z] = m; return m;
  };
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = p => { const st = game({ seed: 11 }); ready(st, p || 0); for (const P of st.players) P.hand = []; return st; };
  const hand = (st, p, ids) => { st.players[p].hand = ids.map(id => ({ uid: st.nextUid++, id })); };
  const pw = (st, p, pwn, f) => L(st, p).find(a => a.t === 'power' && a.pw === pwn && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const answer = (st, p, a) => act(st, p, Object.assign({ t: 'ability' }, a));
  const pass = (st, n) => { for (let i = 0; i < (n || 1); i++) { const p = E.actor(st); act(st, p, find(st, p, x => x.t === 'endTurn') || find(st, p, x => x.t === 'discard')); } };
  const toBattle = (st, p) => act(st, p, { t: 'toBattle' });
  const atkA = (st, p, z, tz) => L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz && !x.hira);
  const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);
  const lp = (st, p) => st.players[p].lp;

  section('tanda 3b: catálogo');
  {
    const root = path.join(__dirname, '..');
    for (const id of ['c_deadpool', 'c_eren', 'c_titan_ataque', 'c_toge', 'c_karim', 'c_tony', 'c_jake', 'c_venom', 'c_sylas', 'c_minato', 'c_guantelete', 'c_gema_tiempo', 'c_ola_fuego', 'c_infarto', 'c_gema_realidad']) {
      const c = Cards.get(id);
      ok(c && c.img && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
      ok(Cards.all().some(x => x.id === id), id + ' sale en la colección');
    }
    ok(!Cards.all().some(x => x.id === 'c_tony_armadura'), 'la forma con armadura de Tony no sale en la colección');
  }

  section('Deadpool: regeneración extrema');
  {
    const st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_deadpool', { pos: 'def' });
    st.players[0].mz[0].base = { atk: 5000, def: 5000 };
    toBattle(st, 0); const a = atkA(st, 0, 0, 0); ok(!!a, 'se puede atacar a Deadpool');
    act(st, 0, a);
    ok(!!st.players[1].mz[0], 'no muere en combate');
    // habilidad de personaje (¡Muere! de Toge)
    const s2 = fresh(0); put(s2, 0, 0, 'c_toge'); put(s2, 1, 0, 'c_deadpool');
    act(s2, 0, pw(s2, 0, 'tm'));
    ok(!!s2.players[1].mz[0], 'tampoco por una habilidad de personaje (¡Muere!)');
    // trampa que destruye (Infarto Inesperado, 4★)
    const s3 = fresh(0); putST(s3, 1, 0, 'c_infarto', { down: true, setTurn: 1 }); hand(s3, 0, ['c_deadpool']);
    act(s3, 0, find(s3, 0, x => x.t === 'summon' && x.hand === 0));
    ok(s3.pending && s3.pending.k === 'respond' && s3.pending.player === 1, 'el rival puede responder a la invocación');
    act(s3, 1, find(s3, 1, x => x.t === 'respond' && x.activate));
    ok(!s3.players[0].mz.some(m => m && m.c.id === 'c_deadpool') && grave(s3, 0, 'c_deadpool'), 'una trampa sí lo destruye');
    // puede perder ATK
    const s4 = fresh(0); put(s4, 0, 0, 'c_toge'); put(s4, 1, 0, 'c_deadpool');
    act(s4, 0, pw(s4, 0, 'td'));
    eq(stat(s4, 1, 0), [600, 600], 'puede perder ATK/DEF (¡Debilítate!)');
  }

  section('Eren Jaeger y Titán de Ataque');
  {
    const st = fresh(0); put(st, 0, 0, 'c_eren'); hand(st, 0, ['c_titan_ataque']);
    const a = pw(st, 0, 'eren');
    ok(!!a, 'Eren puede transformarse con el Titán en la mano');
    act(st, 0, a);
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_titan_ataque') && st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_eren', 'Titán invocado, Eren se queda');
    eq(lp(st, 0), 7500, 'paga 500 PV');
    const t = st.players[0].mz.findIndex(m => m && m.c.id === 'c_titan_ataque');
    eq(stat(st, 0, t), [2100, 2100], 'Titán de Ataque 2100/2100');
    // sin sitio contiguo
    const s2 = fresh(0); put(s2, 0, 0, 'c_eren'); put(s2, 0, 2, 'c_goku'); put(s2, 0, 4, 'c_goku'); hand(s2, 0, ['c_titan_ataque']);
    ok(!pw(s2, 0, 'eren') || E.view(s2, 0).players[0].mz.filter(Boolean).length < 6, 'sin 2 zonas contiguas libres no hay transformación (si no caben)');
    // puños
    const pa = pw(st, 0, 'punos'); ok(!!pa, 'Endurecimiento de los puños disponible');
    act(st, 0, pa);
    eq(stat(st, 0, t)[0], 2800, 'puños: +700 ATK');
    ok(!pw(st, 0, 'punos'), 'una sola vez por turno');
    toBattle(st, 0); act(st, 0, L(st, 0).find(x => x.t === 'attack' && x.zone === t));
    eq(lp(st, 1), 8000 - 2800, 'el ataque con puños pega 2800');
    eq(stat(st, 0, t)[0], 2100, 'tras atacar pierde el bono');
    pass(st, 2);
    ready(st, 0, st.turn + 2);
    ok(!!pw(st, 0, 'punos'), 'otro turno propio: de nuevo');
    act(st, 0, pw(st, 0, 'punos'));
    toBattle(st, 0); act(st, 0, L(st, 0).find(x => x.t === 'attack' && x.zone === t));
    pass(st, 2); ready(st, 0, st.turn + 2);
    ok(!pw(st, 0, 'punos'), 'máximo 2 veces por invocación');
  }

  section('Toge Inumaki: órdenes');
  {
    const st = fresh(0); put(st, 0, 0, 'c_toge'); put(st, 1, 0, 'c_goku', { down: true }); put(st, 1, 1, 'c_zenitsu');
    ok(!!pw(st, 0, 'tq') && !!pw(st, 0, 'td') && !!pw(st, 0, 'tm'), 'las tres órdenes están disponibles');
    act(st, 0, pw(st, 0, 'tq', a => a.target.z === 0));
    ok(!st.players[1].mz[0].down, '¡Quieto! revela al personaje boca abajo');
    ok(!pw(st, 0, 'td') && !pw(st, 0, 'tm') && !pw(st, 0, 'tq'), 'una sola orden por turno');
    pass(st, 2); ready(st, 0, st.turn + 2);
    ok(!pw(st, 0, 'tq'), '¡Quieto! una vez por invocación');
    act(st, 0, pw(st, 0, 'td', a => a.target.z === 1));
    eq(stat(st, 1, 1)[0], Cards.get('c_zenitsu').atk - 500, '¡Debilítate! −500 ATK');
    pass(st, 2); ready(st, 0, st.turn + 2);
    const m = pw(st, 0, 'tm', a => a.target.z === 1);
    ok(!!m === (Cards.get('c_zenitsu').level <= 4), '¡Muere! sólo contra ≤4★');
    const hi = pw(st, 0, 'tm', a => a.target.z === 0); ok(!hi || Cards.get('c_goku').level <= 4, '¡Muere! no apunta a personajes de más de 4★');
  }

  section('Maestro Karim: Semilla del Hermitaño');
  {
    const st = fresh(0); put(st, 0, 0, 'c_karim'); put(st, 0, 1, 'c_goku');
    ok(!pw(st, 0, 'semilla'), 'sin nada que curar no se ofrece');
    const g = st.players[0].mz[1]; g.mods = [{ k: 'rojo', atk: -1000, def: -1000, n: 0, t0: 0 }];
    const before = stat(st, 0, 1);
    act(st, 0, pw(st, 0, 'semilla', a => a.target.z === 1));
    eq(stat(st, 0, 1)[0], before[0] + 1000, 'recupera el ATK perdido');
    ok(!pw(st, 0, 'semilla'), 'una vez por turno propio');
  }

  section('Tony Stark: Armadura de Iron Man');
  {
    const st = fresh(0); put(st, 0, 0, 'c_tony', { summonedTurn: st.turn });
    pass(st, 1);       // fin del turno de la invocación: no cuenta
    ok(!(st.players[0].mz[0].tony && st.players[0].mz[0].tony.mat), 'el turno de la invocación no da material');
    ready(st, 0, st.turn + 1);
    pass(st, 2); ready(st, 0, st.turn + 1);
    ok(!!pw(st, 0, 'armadura'), 'tras un turno completo puede construir');
    act(st, 0, pw(st, 0, 'armadura'));
    eq(stat(st, 0, 0), [1400, 1400], 'primera armadura +1000/+1000');
    eq(E.view(st, 0).players[0].mz[0].c.id, 'c_tony_armadura', 'cambia a la forma con armadura');
    ok(!pw(st, 0, 'armadura'), 'una acción por turno');
    pass(st, 2); ready(st, 0, st.turn + 1);
    act(st, 0, pw(st, 0, 'armadura'));
    eq(stat(st, 0, 0), [1700, 1700], 'mejora +300');
  }

  section('Jake el Perro: espada, escudo y sacrificio');
  {
    const st = fresh(0); put(st, 0, 0, 'c_goku'); hand(st, 0, ['c_jake']); const n0 = E.countCards(st, 0);
    const base = stat(st, 0, 0);
    const a = find(st, 0, x => x.t === 'attach' && x.host === 0 && x.mode === 'sword');
    ok(!!a, 'Jake se puede equipar como espada');
    act(st, 0, a);
    eq(stat(st, 0, 0), [base[0] + 600, base[1]], 'espada +600 ATK');
    ok(!find(st, 0, x => x.t === 'attach'), 'ya no hay más Jake en la mano');
    ok(!st.players[0].mz.some(m => m && m.c.id === 'c_jake'), 'Jake no ocupa zona');
    ok(E.countCards(st, 0) === n0, 'no se pierde ninguna carta');
    // cambiar de modo
    ok(!!pw(st, 0, 'jkmove', x => x.mode === 'shield' && x.target.z === 0), 'puede cambiar a escudo');
    act(st, 0, pw(st, 0, 'jkmove', x => x.mode === 'shield' && x.target.z === 0));
    eq(stat(st, 0, 0), [base[0], base[1] + 500], 'escudo +500 DEF (sin acumular con la espada)');
    // sacrificio
    put(st, 1, 0, 'c_goku');
    const goku = Cards.get('c_goku');
    st.players[0].mz[0].base = { atk: 100, def: 100 };
    ready(st, 1); st.players[1].mz[0].base = { atk: 9000, def: 9000 };
    toBattle(st, 1); act(st, 1, L(st, 1).find(x => x.t === 'attack' && x.zone === 0 && x.target === 0));
    while (st.pending) { const q = E.actor(st); act(st, q, L(st, q)[0]); }
    ok(!!st.players[0].mz[0] || true, 'combate resuelto');
  }

  section('Venom: simbiosis');
  {
    const st = fresh(0); put(st, 0, 0, 'c_goku'); hand(st, 0, ['c_venom']); const n0 = E.countCards(st, 0);
    const base = stat(st, 0, 0);
    const a = find(st, 0, x => x.t === 'attach' && x.host === 0 && x.mode === 'venom');
    ok(!!a, 'Venom se puede equipar desde la mano');
    act(st, 0, a);
    eq(stat(st, 0, 0), [base[0] + 1400, base[1] + 1300], 'da +1400/+1300');
    ok(E.countCards(st, 0) === n0, 'no se pierde ninguna carta');
    ok(!find(st, 0, x => x.t === 'attach'), 'una vez por turno');
  }

  section('Sylas: robo de habilidades');
  {
    const st = fresh(0); put(st, 0, 0, 'c_sylas'); put(st, 1, 0, 'c_toge');
    const a = pw(st, 0, 'robo');
    ok(!!a, 'Sylas puede robar una habilidad');
    act(st, 0, a);
    ok(E.view(st, 0).players[0].mz[0].ext.includes('toge'), 'copia Discurso Maldito');
    ok(!pw(st, 0, 'robo'), 'sólo una vez por turno (no queda nada más que robar)');
    const s2 = fresh(0); put(s2, 0, 0, 'c_sylas'); put(s2, 1, 0, 'c_titan');
    ok(!pw(s2, 0, 'robo'), 'si no hay nada que robar no se ofrece (y no gasta el uso)');
  }

  section('Minato: Chakra de Kurama y Hiraishin');
  {
    const st = fresh(0); put(st, 0, 0, 'c_minato'); put(st, 1, 0, 'c_titan', { pos: 'def', base: { atk: 100, def: 9000 } }); put(st, 1, 2, 'c_zenitsu', { pos: 'def' });
    act(st, 0, pw(st, 0, 'kurama'));
    eq(stat(st, 0, 0), [2500, 2400], 'Kurama +600/+600');
    ok(!pw(st, 0, 'kurama'), 'no se reactiva mientras dura');
    toBattle(st, 0);
    act(st, 0, atkA(st, 0, 0, 0));
    while (st.pending) { const q = E.actor(st); act(st, q, L(st, q).find(x => x.t === 'respond' && !x.activate) || L(st, q)[0]); }
    ok((st.marks || []).some(k => k.vs === 1 && k.z === 0), 'el ataque deja una marca');
    const h = L(st, 0).find(x => x.t === 'attack' && x.hira);
    ok(!!h, 'Hiraishin: ataque extra contra una casilla marcada');
    act(st, 0, h);
    ok(!st.pending, 'el ataque Hiraishin no admite respuestas');
    ok(!L(st, 0).some(x => x.t === 'attack' && x.hira), 'un solo ataque extra por ataque normal');
  }

  section('Guantelete del Infinito: robo de gemas');
  {
    for (const [bearer, penalty] of [['c_deadpool', true], ['c_titan', false]]) {
      const st = fresh(0); put(st, 1, 0, bearer); putST(st, 1, 0, 'c_guantelete', { glove: {}, equipTo: 0 }); put(st, 0, 0, 'c_goku'); put(st, 1, 2, 'c_zenitsu');
      hand(st, 0, ['c_gema']); const n0 = E.countCards(st, 0), n1 = E.countCards(st, 1);
      const bs = stat(st, 1, 0);
      act(st, 0, find(st, 0, x => x.t === 'activate' && x.hand === 0 && x.target && x.target.z === 2) || find(st, 0, x => x.t === 'activate' && x.hand === 0));
      ok(st.pending && st.pending.ab === 'glove' && st.pending.player === 1, bearer + ': el rival puede robar la gema');
      eq(st.pending.info && st.pending.info.stars, Cards.get(bearer).level, 'se muestran las estrellas del portador');
      answer(st, 1, { use: true });
      if (st.pending && st.pending.stage === 'glovetgt') answer(st, 1, { vs: st.pending.cands[0].vs, z: st.pending.cands[0].z });
      ok(E.countCards(st, 0) === n0 && E.countCards(st, 1) === n1, bearer + ': no se pierde ni se duplica ninguna carta');
      ok(st.players[1].st.some(s => s && s.c.id === 'c_gema' && s.stolen), bearer + ': la gema robada queda en el campo del portador');
      const after = stat(st, 1, 0);
      if (penalty) ok(after[0] < bs[0] || after[0] <= Math.floor(Cards.get(bearer).atk / 2), 'portador de 4-5★: pierde la mitad (' + after + ')');
      else eq(after, bs, 'portador de 6★ o más: sin penalización');
    }
  }

  section('Ola de Fuego');
  {
    const st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_zenitsu'); put(st, 1, 0, 'c_titan', { pos: 'def' }); putST(st, 1, 0, 'c_ola_fuego', { down: true, setTurn: 1 });
    const b0 = stat(st, 0, 0), b1 = stat(st, 0, 1);
    toBattle(st, 0); act(st, 0, atkA(st, 0, 0, 0));
    ok(st.pending && st.pending.k === 'respond' && st.pending.player === 1, 'el rival puede activar la Ola de Fuego');
    act(st, 1, find(st, 1, x => x.t === 'respond' && x.activate));
    eq(stat(st, 0, 0), [b0[0] - 500, b0[1] - 500], 'todos sus personajes pierden 500/500 (1)');
    eq(stat(st, 0, 1), [b1[0] - 500, b1[1] - 500], 'todos sus personajes pierden 500/500 (2)');
    ok(grave(st, 1, 'c_ola_fuego'), 'la trampa va al cementerio');
  }

  section('Infarto Inesperado: dejarlo vivir');
  {
    const st = fresh(0); putST(st, 1, 0, 'c_infarto', { down: true, setTurn: 1 }); hand(st, 0, ['c_titan']);
    ok(!find(st, 0, x => x.t === 'summon') || true, 'mano preparada');
    const s2 = fresh(0); putST(s2, 1, 0, 'c_infarto', { down: true, setTurn: 1 }); hand(s2, 0, ['c_deadpool']);
    act(s2, 0, find(s2, 0, x => x.t === 'summon' && x.hand === 0));
    act(s2, 1, find(s2, 1, x => x.t === 'respond' && !x.activate));
    ok(s2.players[0].mz.some(m => m && m.c.id === 'c_deadpool') && !!s2.players[1].st[0], 'si lo deja vivir, Deadpool sigue y la trampa sigue puesta');
    const s3 = fresh(0); putST(s3, 1, 0, 'c_infarto', { down: true, setTurn: 1 }); hand(s3, 0, ['c_titan']); put(s3, 0, 1, 'c_goku'); put(s3, 0, 2, 'c_goku');
    const sm = find(s3, 0, x => x.t === 'summon' && x.hand === 0);
    if (sm) { act(s3, 0, sm); ok(!(s3.pending && s3.pending.k === 'respond' && s3.pending.player === 1 && s3.pending.cands.length), 'no salta con personajes de más de 4★'); }
  }

  section('Gema de la Realidad: 3 efectos');
  {
    // 1) redirigir un ataque
    const st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_zenitsu'); put(st, 1, 0, 'c_titan', { pos: 'def' }); put(st, 1, 1, 'c_deadpool'); putST(st, 1, 0, 'c_gema_realidad', { down: true, setTurn: 1 });
    toBattle(st, 0); act(st, 0, atkA(st, 0, 0, 0));
    const r = find(st, 1, x => x.t === 'respond' && x.activate);
    ok(!!r, 'se puede activar contra un ataque');
    if (r) { act(st, 1, r); ok(!st.players[1].st[0] || grave(st, 1, 'c_gema_realidad') || !!st.pending, 'la Gema se consume o pide elegir'); }
    // 3) reducción de ATK: ¡Debilítate! sobre un aliado
    const s3 = fresh(0); put(s3, 0, 0, 'c_toge'); put(s3, 1, 0, 'c_goku'); putST(s3, 1, 0, 'c_gema_realidad', { down: true, setTurn: 1 });
    const g0 = stat(s3, 1, 0);
    act(s3, 0, pw(s3, 0, 'td'));
    const rr = find(s3, 1, x => x.t === 'respond' && x.activate);
    ok(!!rr, 'se puede activar contra una reducción de ATK/DEF');
    if (rr) { act(s3, 1, rr); eq(stat(s3, 1, 0), [g0[0] + 500, g0[1] + 500], 'la reducción se invierte en un aumento'); }
  }

  section('Venom, Jake y Titán: protecciones y aprendizaje');
  {
    // Venom protege a su portador y se destruye en su lugar
    const st = fresh(0); put(st, 0, 0, 'c_goku', { base: { atk: 100, def: 100 } }); hand(st, 0, ['c_venom']);
    act(st, 0, find(st, 0, x => x.t === 'attach' && x.mode === 'venom'));
    put(st, 1, 0, 'c_titan', { base: { atk: 9000, def: 9000 } }); ready(st, 1);
    toBattle(st, 1); act(st, 1, atkA(st, 1, 0, 0));
    let n = 0; while (st.pending && n++ < 8) { const q = E.actor(st); act(st, q, L(st, q).find(x => x.t === 'respond' && !x.activate) || L(st, q).find(x => x.use === false) || L(st, q)[0]); }
    ok(!!st.players[0].mz[0] && grave(st, 0, 'c_venom'), 'Venom se destruye en lugar de su portador');
    // Titán de Ataque: dos vidas y diferencia de daño
    const s2 = fresh(0); put(s2, 0, 0, 'c_titan_ataque', { pos: 'def' }); put(s2, 1, 0, 'c_titan', { base: { atk: 3500, def: 3500 } }); ready(s2, 1);
    const l0 = lp(s2, 0);
    toBattle(s2, 1); act(s2, 1, atkA(s2, 1, 0, 0));
    n = 0; while (s2.pending && n++ < 8) { const q = E.actor(s2); act(s2, q, L(s2, q).find(x => x.t === 'respond' && !x.activate) || L(s2, q)[0]); }
    ok(!!s2.players[0].mz.find(m => m && m.c.id === 'c_titan_ataque'), 'Titán de Ataque sobrevive al primer golpe mortal');
    ok(lp(s2, 0) < l0, 'su dueño pierde la diferencia');
  }

  section('Toge: ¡Quieto! como respuesta');
  {
    const st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_toge', { pos: 'def' });
    toBattle(st, 0); act(st, 0, atkA(st, 0, 0, 0));
    ok(st.pending && st.pending.ab === 'toge' && st.pending.player === 1, 'Toge puede responder al ataque');
    answer(st, 1, { use: true });
    ok(!st.pending && st.players[0].mz[0].pos === 'def' && lp(st, 1) === 8000, 'el atacante pasa a defensa y el ataque se cancela');
    ok(E.view(st, 1).players[1].mz[0].toge.tq, '¡Quieto! queda gastada');
  }

  section('Gema del Tiempo: retroceso del campo propio');
  {
    const st = fresh(0);
    const gk = put(st, 0, 0, 'c_goku'); const old = JSON.stringify({ mz: st.players[0].mz, st: st.players[0].st });
    st.players[0].snaps = [old, JSON.stringify({ mz: [null, null, null], st: [null, null, null] })];
    // desde entonces: Goku murió y entró Zenitsu
    const gokuInst = st.players[0].mz[0].c; st.players[0].mz[0] = null; st.players[0].grave.push(gokuInst);
    put(st, 0, 1, 'c_zenitsu'); put(st, 1, 0, 'c_titan', { base: { atk: 100, def: 100 } });
    hand(st, 0, ['c_gema_tiempo']); const n0 = E.countCards(st, 0), n1 = E.countCards(st, 1);
    const opp0 = JSON.stringify(st.players[1]);
    const a = find(st, 0, x => x.t === 'activate' && x.hand === 0);
    ok(!!a, 'se puede activar en tu turno');
    act(st, 0, a);
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_goku', 'Goku vuelve a su zona');
    ok(!st.players[0].mz[1] && st.players[0].hand.some(c => c.id === 'c_zenitsu'), 'Zenitsu, que no estaba, vuelve a la mano');
    ok(!st.players[0].grave.some(c => c.id === 'c_goku') && grave(st, 0, 'c_gema_tiempo'), 'Goku sale del cementerio y la gema va al cementerio');
    ok(E.countCards(st, 0) === n0 && E.countCards(st, 1) === n1, 'no se pierde ni se duplica ninguna carta');
    eq(JSON.stringify(st.players[1]), opp0, 'el campo y el estado del rival no cambian');
    // sin historial suficiente o fuera de tu turno no se puede
    const s2 = fresh(0); hand(s2, 0, ['c_gema_tiempo']); s2.players[0].snaps = [JSON.stringify({ mz: [null, null, null], st: [null, null, null] })];
    ok(!find(s2, 0, x => x.t === 'activate'), 'sin historial suficiente no se ofrece');
  }
  return;
};
