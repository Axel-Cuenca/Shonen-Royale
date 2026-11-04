/* Pruebas de las correcciones del 26-10-2026: dominio de Yuta una vez por invocación, técnicas de los Seis Ojos
 * en la vista, Mahoraga desde la mano (también por volteo y transformación) y bonus de Rhaast.
 * Se carga desde tools/test_duelo.js. */
'use strict';
module.exports = function (T) {
  const { E, Cards, ok, eq, section, act, find, game } = T;
  const L = (st, p) => E.legal(st, p);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    if (id === 'c_kayn' && !m.kn) m.kn = { rh: false, sh: false };
    st.players[p].mz[z] = m; return m;
  };
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = p => { const st = game({ seed: 11 }); ready(st, p || 0); for (const P of st.players) P.hand = []; return st; };
  const hand = (st, p, ids) => { st.players[p].hand = ids.map(id => ({ uid: st.nextUid++, id })); };
  const pw = (st, p, pwn, f) => L(st, p).find(a => a.t === 'power' && a.pw === pwn && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const pass = (st, n) => { for (let i = 0; i < (n || 1); i++) { const p = E.actor(st); act(st, p, find(st, p, x => x.t === 'endTurn') || find(st, p, x => x.t === 'discard')); } };
  const mahoAsk = (st, p) => !!st.pending && st.pending.ab === 'mahoraga' && st.pending.player === p;

  section('correcciones 26-10: Yuta, Amor Mutuo y Verdadero una vez por invocación');
  {
    const st = fresh(0); put(st, 0, 0, 'c_yuta');
    const a = pw(st, 0, 'ydominio');
    ok(!!a, 'Yuta puede abrir su dominio');
    act(st, 0, a);
    ok(!!st.domain && st.domain.nm === 'de Yuta', 'el dominio de Yuta está activo');
    eq(stat(st, 0, 0), [3000, 3000], 'el dominio sigue dando +500 ATK y DEF');
    ok(!E.apply(st, 0, a).ok, 'repetir la misma petición (doble clic) se rechaza');
    pass(st, 6);
    ok(!st.domain, 'el dominio termina a los 2 turnos, como antes');
    ready(st, 0, st.turn + 2);
    ok(!pw(st, 0, 'ydominio'), 'terminado el dominio, no se puede volver a abrir en la misma invocación');
    ok(!E.apply(st, 0, a).ok, 'ni enviando la acción a mano');
    ok(E.view(st, 0).players[0].mz[0].used && E.view(st, 0).players[0].mz[0].used.ydom, 'la ficha la marca como usada');
    // nueva invocación: otra instancia de Yuta en el campo
    st.players[0].mz[0] = null; put(st, 0, 0, 'c_yuta');
    ok(!!pw(st, 0, 'ydominio'), 'una invocación nueva de Yuta puede volver a usarlo');
    ok(!(E.view(st, 0).players[0].mz[0].used || {}).ydom, 'y la ficha ya no la marca como usada');
    // con la Gema del Poder sigue siendo una sola vez
    const s2 = fresh(0); put(s2, 0, 0, 'c_yuta'); putST(s2, 0, 0, 'c_gema_poder', { equipTo: 0 });
    act(s2, 0, pw(s2, 0, 'ydominio'));
    pass(s2, 6); ready(s2, 0, s2.turn + 2);
    ok(!s2.domain && !pw(s2, 0, 'ydominio'), 'con la Gema del Poder tampoco se puede usar dos veces');
    ok((E.view(s2, 0).players[0].mz[0].used || {}).ydom, 'y la ficha la marca como usada');
  }

  section('correcciones 26-10: técnicas de los Seis Ojos en la vista');
  {
    const st = fresh(0); put(st, 0, 0, 'c_yuta', { six: { t0: 6 } }); put(st, 1, 0, 'c_zenitsu'); putST(st, 1, 0, 'c_karma', { down: true });
    eq(E.view(st, 0).players[0].mz[0].sixU, { rojo: false, azul: false, purpura: false }, 'la vista indica qué técnicas quedan');
    act(st, 0, pw(st, 0, 'rojo'));
    eq(stat(st, 1, 0), [0, 0], 'Rojo: −1000 ATK y −1000 DEF (sin cambios en el efecto)');
    eq(E.view(st, 0).players[0].mz[0].sixU, { rojo: true, azul: false, purpura: false }, 'Rojo queda marcada como usada');
    ok(!pw(st, 0, 'purpura') && !!pw(st, 0, 'azul'), 'tras Rojo: Azul sigue disponible y Púrpura no');
    ok(!('sixU' in (E.view(st, 0).players[1].mz[0] || {})), 'sin Seis Ojos no se envía nada');
  }

  section('correcciones 26-10: General Mahoraga responde desde la mano');
  {
    // invocación normal enemiga de exactamente 10★
    const st = fresh(1); put(st, 1, 0, 'c_lara'); put(st, 1, 1, 'c_creeper'); put(st, 1, 2, 'c_bardock');
    hand(st, 1, ['c_sukuna60']); hand(st, 0, ['c_mahoraga']);
    act(st, 1, L(st, 1).find(a => a.t === 'summon'));
    ok(mahoAsk(st, 0), '10★ enemigo invocado: se pregunta al dueño de Mahoraga');
    act(st, 0, { t: 'ability', use: true });
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_mahoraga') && !st.players[0].hand.some(c => c.id === 'c_mahoraga'), 'Mahoraga sale de la mano al campo');
    ok(!st.players[0].normalUsed, 'no gasta la invocación normal');
    ok(!mahoAsk(st, 0), 'una sola pregunta por esa invocación');
    // más de 10★
    const s2 = fresh(1); put(s2, 1, 0, 'c_lara'); put(s2, 1, 1, 'c_creeper'); put(s2, 1, 2, 'c_bardock');
    hand(s2, 1, ['c_yoriichi']); hand(s2, 0, ['c_mahoraga']);
    act(s2, 1, L(s2, 1).find(a => a.t === 'summon'));
    ok(mahoAsk(s2, 0), 'también con más de 10★ (Yoriichi, 11★)');
    act(s2, 0, { t: 'ability', use: false });
    ok(s2.players[0].hand.some(c => c.id === 'c_mahoraga') && !s2.pending, 'si se rechaza, Mahoraga sigue en la mano');
    // transformación a 10★ (Vegeta → Vegeta Blue Evolution)
    const s3 = fresh(1); put(s3, 1, 0, 'c_vegeta', { since: 0 }); hand(s3, 1, ['c_vegeta_blue']); hand(s3, 0, ['c_mahoraga']); s3.turn = 20;
    act(s3, 1, pw(s3, 1, 'xform'));
    ok(mahoAsk(s3, 0), 'transformarse en un 10★ también cuenta');
    // volteo de un 10★ boca abajo
    const s4 = fresh(1); put(s4, 1, 0, 'c_yuta', { down: true, pos: 'def' }); hand(s4, 0, ['c_mahoraga']); s4.turn = 8;
    act(s4, 1, L(s4, 1).find(a => a.t === 'flip'));
    ok(mahoAsk(s4, 0), 'voltear un 10★ colocado boca abajo también cuenta');
    // casos que no deben activarse
    const s5 = fresh(0); put(s5, 0, 0, 'c_lara'); put(s5, 0, 1, 'c_creeper'); put(s5, 0, 2, 'c_bardock'); hand(s5, 0, ['c_sukuna60', 'c_mahoraga']);
    act(s5, 0, L(s5, 0).find(a => a.t === 'summon' && s5.players[0].hand[a.hand].id === 'c_sukuna60'));
    ok(!s5.pending, 'una invocación propia no lo activa');
    const s6 = fresh(1); put(s6, 1, 0, 'c_lara'); put(s6, 1, 1, 'c_creeper'); hand(s6, 1, ['c_rika']); hand(s6, 0, ['c_mahoraga']);
    act(s6, 1, L(s6, 1).find(a => a.t === 'summon'));
    ok(!s6.pending, 'un enemigo de 9★ no lo activa');
    const s7 = fresh(1); put(s7, 1, 0, 'c_lara'); put(s7, 1, 1, 'c_creeper'); put(s7, 1, 2, 'c_bardock'); hand(s7, 1, ['c_sukuna60']);
    s7.players[0].grave.push({ uid: s7.nextUid++, id: 'c_mahoraga' });
    act(s7, 1, L(s7, 1).find(a => a.t === 'summon'));
    ok(!s7.pending, 'sólo desde la mano: en el cementerio no cuenta');
    ok(!E.apply(st, 0, { t: 'ability', use: true }).ok, 'responder otra vez a la misma pregunta se rechaza');
  }

  section('correcciones 26-10: Kayn → Rhaast +300 ATK y DEF');
  {
    const st = fresh(0); const k = put(st, 0, 0, 'c_kayn'); k.kn.rh = true;
    const a = pw(st, 0, 'kform', x => x.form === 'c_kayn_rhaast');
    act(st, 0, a);
    eq(stat(st, 0, 0), [2000, 2000], 'Rhaast: +300/+300 al transformarse');
    ok(!E.apply(st, 0, a).ok, 'la transformación no se repite');
    eq(stat(st, 0, 0), [2000, 2000], 'el bonus no se acumula');
    eq(E.view(st, 0).players[0].mz[0].mods.filter(m => m.k === 'rhaast').length, 1, 'un solo bonus de transformación');
    ok(/\+300 ATK y \+300 DEF/.test(Cards.get('c_kayn_rhaast').text), 'la carta Rhaast explica el +300');
    // cada asesinato en combate como Rhaast: +300 ATK y DEF más
    for (const [n, want] of [[1, 2300], [2, 2600]]) {
      put(st, 1, 0, 'c_lara', { pos: 'def' }); ready(st, 0, 7 + 2 * n); st.phase = 'battle'; k.attacked = false; k.atkN = 0;
      act(st, 0, L(st, 0).find(x => x.t === 'attack' && x.zone === 0 && x.target === 0));
      eq(stat(st, 0, 0), [want, want], 'Rhaast tras ' + n + ' asesinato(s): +300/+300 por cada uno');
    }
  }

  section('correcciones 27-10: Guerrero del Infinito protege contra el destierro');
  {
    // sin los Seis Ojos, la explosión del Creeper destierra a ambos
    let st = fresh(0); const a0 = put(st, 0, 0, 'c_lara'); put(st, 1, 0, 'c_creeper', { pos: 'def' }); st.phase = 'battle';
    act(st, 0, L(st, 0).find(x => x.t === 'attack' && x.zone === 0 && x.target === 0));
    ok(!st.players[0].mz[0] && st.players[0].banish.length === 1 && st.players[1].banish.length === 1, 'sin Seis Ojos: el atacante y el Creeper son desterrados');
    // con los Seis Ojos: el portador sigue en el campo y sólo el Creeper se destierra
    st = fresh(0); const b = put(st, 0, 0, 'c_lara'); b.six = { t0: st.turn }; put(st, 1, 0, 'c_creeper', { pos: 'def' }); st.phase = 'battle';
    const at = L(st, 0).find(x => x.t === 'attack' && x.zone === 0 && x.target === 0);
    ok(!!at, 'el portador puede atacar al Creeper');
    act(st, 0, at);
    ok(st.players[0].mz[0] === b && !st.players[0].banish.length, 'el portador NO es desterrado y sigue en el campo');
    ok(!st.players[1].mz[0] && st.players[1].banish.length === 1, 'el otro personaje sí se destierra');
    ok(st.log.some(l => /no puede ser desterrado: los Seis Ojos/.test(l.t || l.m || JSON.stringify(l))), 'el registro explica la protección');
  }

  section('correcciones 03-11: Kurama, habilidades evadidas y Warwick');
  {
    // Minato: Chakra de Kurama una sola vez por invocación
    const st = fresh(0); put(st, 0, 0, 'c_minato');
    act(st, 0, pw(st, 0, 'kurama'));
    ok(!pw(st, 0, 'kurama'), 'Kurama no se reactiva mientras dura');
    pass(st, 8); ready(st, 0, st.turn + 2);
    eq(stat(st, 0, 0), [1900, 1800], 'Kurama terminó');
    ok(!pw(st, 0, 'kurama'), 'terminado, no se puede volver a usar en la misma invocación');
    st.players[0].mz[0] = null; put(st, 0, 0, 'c_minato');
    ok(!!pw(st, 0, 'kurama'), 'una invocación nueva de Minato puede volver a usarlo');

    // Cell Semi Perfecto: si Megumi evade la Absorción, no puede volver a absorber ese turno
    const s2 = fresh(0); put(s2, 0, 0, 'c_cell'); put(s2, 1, 0, 'c_megumi'); put(s2, 1, 1, 'c_zenitsu');
    act(s2, 0, pw(s2, 0, 'absorb', a => a.target.vs === 1 && a.target.z === 0));
    ok(!!s2.players[1].mz[0] && !s2.players[0].mz[0].abs, 'Megumi evade la Absorción con Conejos');
    ok(!pw(s2, 0, 'absorb'), 'Cell no puede volver a absorber en el mismo turno (ni a otro objetivo)');
    ready(s2, 0, s2.turn + 2);
    ok(!!pw(s2, 0, 'absorb'), 'en su siguiente turno sí puede intentarlo de nuevo');

    // Shang Tsung: transformación evadida, no se repite ese turno
    const s3 = fresh(0); put(s3, 0, 0, 'c_shang'); put(s3, 1, 0, 'c_megumi'); put(s3, 1, 1, 'c_zenitsu');
    act(s3, 0, pw(s3, 0, 'copy', a => a.target.vs === 1 && a.target.z === 0));
    ok(!s3.players[0].mz[0].copy, 'Megumi evade la Transformación de Shang Tsung');
    ok(!pw(s3, 0, 'copy'), 'Shang Tsung no puede volver a transformarse en ese turno');
    ready(s3, 0, s3.turn + 2);
    ok(!!pw(s3, 0, 'copy'), 'en su siguiente turno sí puede');

    // Warwick atacando a uno con más ATK y más estrellas: +500 (Sed insaciable) +500 ATK (Instinto depredador) en ese mismo ataque
    const view = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return [m.atk, m.def]; };
    const s4 = fresh(0); put(s4, 0, 0, 'c_warwick'); put(s4, 1, 0, 'c_odin');
    s4.atk = { p: 0, z: 0, target: 0, vs: 1, negated: false };
    eq(view(s4, 0, 0), [2300, 1800], 'Warwick ataca a Odin: +500/+500 por estrellas y +500 ATK por tener menos ATK');
    s4.atk = null;
    const s5 = fresh(0); put(s5, 0, 0, 'c_warwick'); put(s5, 1, 0, 'c_goku', { atkMod: 600 });
    s5.atk = { p: 0, z: 0, target: 0, vs: 1, negated: false };
    eq(view(s5, 0, 0), [1800, 1300], 'Warwick ataca a uno de igual estrella con más ATK: sólo +500 ATK');
    s5.atk = null;
    const s6 = fresh(0); put(s6, 0, 0, 'c_warwick'); put(s6, 1, 0, 'c_warwick', { atkMod: 100 });
    s6.atk = { p: 0, z: 0, target: 0, vs: 1, negated: false };
    eq(view(s6, 0, 0), [1800, 1300], 'Warwick contra Warwick: sin bucles, el de menos ATK gana +500');
  }

  section('correcciones 04-11: Kayn y la X');
  {
    const st = fresh(0); put(st, 0, 0, 'c_kayn', { kn: { rh: true, sh: true } }); putST(st, 1, 0, 'c_x', { down: true, setTurn: 1 });
    act(st, 0, pw(st, 0, 'kform', a => a.form === 'c_kayn_rhaast'));
    let n = 0;
    while (st.pending && n++ < 10) { const q = E.actor(st), l = L(st, q); act(st, q, l.find(x => x.t === 'respond' && x.activate) || l.find(x => x.t === 'respond') || l[0]); }
    ok(!st.players[0].mz[0].form, 'la X cancela la transformación de Kayn');
    ok(!pw(st, 0, 'kform'), 'Kayn no puede volver a transformarse en ese mismo turno (ninguna de las dos formas)');
  }
};
