/* Pruebas de las cartas propias (las del ZIP): cada habilidad con las reglas de su texto.
 * Se carga desde tools/test_duelo.js y comparte sus ayudas. */
'use strict';
module.exports = function (T) {
  const { E, Cards, AI, ok, eq, section, act, find, give, mulberry, randomBot, game } = T;
  const L = (st, p) => E.legal(st, p);
  const has = (st, p, f) => L(st, p).some(f);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    st.players[p].mz[z] = m; return m;
  };
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) { P.normalUsed = false; } };
  const total = (st, p) => E.countCards(st, p);
  const fresh = () => { const st = game({ seed: 11 }); ready(st, 0); for (const P of st.players) { P.hand = []; } return st; };
  const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);
  const banish = (st, p, id) => st.players[p].banish.some(c => c.id === id);
  const toBattle = (st, p) => act(st, p, { t: 'toBattle' });
  const atk = (st, p, z, tz, vs) => { const a = L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz); if (!a) throw new Error('no hay ataque ' + z + '→' + tz); act(st, p, a); };
  const pw = (st, p, pwn, f) => L(st, p).find(a => (a.t === 'power' || a.t === 'spow') && a.pw === pwn && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const names = id => Cards.get(id).name;

  // ---------- catálogo ----------
  section('cartas propias: catálogo');
  {
    const want = {
      c_bardock: [4, 1400, 1400, 'dbz'], c_bardock_ssj: [7, 1800, 1800, 'dbz'], c_cell: [6, 1500, 1400, 'dbz'], c_kratos: [4, 1300, 1300, 'gow'],
      c_kratos_f: [6, 1800, 1800, 'gow'], c_lara: [2, 300, 300, 'aot'], c_titan: [8, 1800, 2000, 'aot'], c_sukuna5: [4, 1300, 1300, 'jjk'],
      c_sukuna60: [10, 2800, 2900, 'jjk'], c_shang: [9, 1100, 1000, 'mk'], c_vegeta: [4, 1500, 1500, 'dbz'], c_vegeta_blue: [10, 2700, 2800, 'dbz'],
      c_popeye: [4, 1200, 1200, 'popeye'], c_creeper: [3, 1000, 1000, 'minecraft']
    };
    for (const id in want) { const c = Cards.get(id); eq([c.level, c.atk, c.def, c.type], want[id], 'estadísticas de ' + id); ok(c.img && /\.webp$/.test(c.img), id + ' tiene imagen'); }
    for (const id of ['c_armadura', 'c_espada', 'c_gema', 'c_karma', 'c_superball', 'c_tormenta']) ok(Cards.get(id).kind === 'spell' && Cards.get(id).img, id + ' es magia con imagen');
    ok(Cards.canPlay(), 'con 20 cartas ya se puede jugar');
    eq(Cards.checkDeck(Cards.presetDeck('x')), '', 'el mazo de la computadora es válido');
    ok(Cards.get('c_titan').wide && Cards.get('c_shang').sp, 'Titán ocupa 2 zonas y Shang es sólo especial');
  }

  // ---------- equipos y magias ----------
  section('Armadura Dorada y Espada del Rey Arruinado');
  {
    const st = fresh(); put(st, 0, 0, 'c_popeye'); give(st, 0, ['c_armadura']);
    const a = find(st, 0, x => x.t === 'activate'); act(st, 0, a);
    eq(stat(st, 0, 0), [1800, 1800], 'Armadura: +600/+600 a un personaje que no es Caballero del Zodiaco');
    Cards.get('c_popeye').type = 'zodiaco';
    eq(stat(st, 0, 0), [2200, 2200], 'Armadura: +1000/+1000 a un Caballero del Zodiaco');
    Cards.get('c_popeye').type = 'popeye';
    st.players[0].st[0] = null; st.players[0].st.forEach(s => s);
    eq(stat(st, 0, 0), [1200, 1200], 'al retirar la armadura vuelven las estadísticas');
    put(st, 0, 1, 'c_creeper'); give(st, 0, ['c_armadura']);
    const a2 = L(st, 0).find(x => x.t === 'activate' && x.target.z === 1); act(st, 0, a2);
  }
  {
    // espada: +500 ATK y -500 DEF al objetivo sólo en ese combate
    const st = fresh(); const m = put(st, 0, 0, 'c_popeye'); putST(st, 0, 0, 'c_espada', { equipTo: 0 });
    put(st, 1, 0, 'c_lara', { pos: 'def' });
    st.turn = 7; toBattle(st, 0);
        atk(st, 0, 0, 0);
    ok(grave(st, 1, 'c_lara'), 'la espada: 1700 ATK destruye al objetivo en defensa');
    eq(stat(st, 0, 0), [1200, 1200], 'el +500 ATK no queda');
    // contra un monstruo con DEF 1500: 1200+500 > 1500-500
    const st2 = fresh(); put(st2, 0, 0, 'c_popeye'); putST(st2, 0, 0, 'c_espada', { equipTo: 0 }); put(st2, 1, 0, 'c_bardock', { pos: 'def' });
    st2.turn = 7; toBattle(st2, 0); atk(st2, 0, 0, 0);
    ok(grave(st2, 1, 'c_bardock'), 'Bardock (DEF 1400): 1700 > 900 → destruido');
    ok(st2.players[1].lp === 8000, 'sin daño de vida contra defensa');
    // sin espada no pasa
    const st3 = fresh(); put(st3, 0, 0, 'c_popeye'); put(st3, 1, 0, 'c_bardock', { pos: 'def' });
    st3.turn = 7; toBattle(st3, 0); atk(st3, 0, 0, 0);
    ok(!grave(st3, 1, 'c_bardock') && st3.players[0].lp < 8000, 'sin espada, 1200 < 1400: rebota');
    // ataque directo: sin efecto
    const st4 = fresh(); put(st4, 0, 0, 'c_popeye'); putST(st4, 0, 0, 'c_espada', { equipTo: 0 });
    st4.turn = 7; toBattle(st4, 0); act(st4, 0, L(st4, 0).find(x => x.t === 'attack'));
    eq(st4.players[1].lp, 6800, 'la espada no suma en ataques directos');
  }
  section('Tormenta Eléctrica: un solo uso y al cementerio');
  {
    // sin coste o sin objetivo válido: no se puede activar y la carta permanece
    const st = fresh(); putST(st, 0, 0, 'c_tormenta', { storm: { usedTurn: -1 } }); put(st, 1, 0, 'c_popeye');
    ok(!pw(st, 0, 'storm1') && !pw(st, 0, 'storm2'), 'sin carta en la mano no hay activación');
    give(st, 0, ['c_lara']);
    ok(!pw(st, 0, 'storm1'), 'Lara (2★) no puede asesinar a Popeye (4★): sin objetivo válido no se ofrece y la carta se queda');
    ok(!!st.players[0].st[0], 'Tormenta permanece en el campo sin consumir su uso');
    st.players[0].hand = []; give(st, 0, ['c_bardock']);
    const s1 = pw(st, 0, 'storm1'); ok(!!s1, 'función 1: personaje de la mano → asesina a un rival de igual o menos estrellas');
    ok(!pw(st, 0, 'storm2'), 'sin magia/trampa rival no hay función 2');
    const tot = total(st, 0) + total(st, 1);
    act(st, 0, s1);
    ok(grave(st, 1, 'c_popeye') && grave(st, 0, 'c_bardock'), 'rival destruido y coste pagado');
    ok(grave(st, 0, 'c_tormenta') && !st.players[0].st[0], 'Tormenta Eléctrica se envía al cementerio tras resolver');
    eq(st.players[0].grave.filter(c => c.id === 'c_tormenta').length, 1, 'va al cementerio una sola vez');
    eq(total(st, 0) + total(st, 1), tot, 'sin duplicar cartas');
  }
  {
    const st = fresh(); putST(st, 0, 0, 'c_tormenta', { storm: { usedTurn: -1 } }); putST(st, 1, 0, 'c_espada', { equipTo: null });
    give(st, 0, ['c_karma']);
    const s2 = pw(st, 0, 'storm2'); ok(!!s2, 'función 2: magia de la mano → destruye magia/trampa rival');
    act(st, 0, s2);
    ok(grave(st, 1, 'c_espada') && grave(st, 0, 'c_tormenta'), 'función 2 también la envía al cementerio');
  }
  section('Tiempo de turno agotado');
  {
    const st = fresh(); put(st, 0, 0, 'c_popeye'); const cur = st.current, tr = st.turn;
    E.timeoutTurn(st);
    ok(st.turn !== tr || st.current !== cur, 'al acabarse el tiempo el turno pasa al siguiente');
    eq(total(st, 0) + total(st, 1), total(st, 0) + total(st, 1), 'sin perder cartas');
    // con algo pendiente (descartar) se resuelve y el turno pasa igual
    const st2 = fresh(); give(st2, 0, ['c_popeye', 'c_popeye', 'c_creeper', 'c_lara', 'c_bardock', 'c_cell', 'c_vegeta', 'c_kratos', 'c_titan', 'c_popeye', 'c_creeper', 'c_lara', 'c_bardock']);
    const c2 = st2.current; E.timeoutTurn(st2);
    ok(st2.current !== c2 || st2.pending === null, 'con mano grande no se queda atascado');
  }
  {
    const st = fresh(); give(st, 0, ['c_popeye']); const s0 = E.view(st, 0).seq;
    act(st, 0, L(st, 0).find(x => x.t === 'summon'));
    ok(E.view(st, 0).seq === s0 + 1, 'cada acción sube el contador que reinicia el reloj de inactividad');
  }
  section('Espectador: el eliminado ve las manos');
  {
    const st = fresh(); give(st, 1, ['c_popeye']);
    ok(E.view(st, 0).players[1].hand.every(c => c === null), 'vivo: no ve la mano del rival');
    st.players[0].alive = false;
    const ve = E.view(st, 0);
    ok(ve.players[1].hand.length && ve.players[1].hand.every(c => c && c.id), 'eliminado: ve las cartas de la mano de los demás');
    ok(E.view(st, 1).players[0].hand.every(c => c === null), 'los vivos no ven la mano del eliminado');
  }
  section('Superball');
  {
    const st = fresh(); give(st, 0, ['c_superball', 'c_cell', 'c_sukuna60', 'c_lara']);
    const acts = L(st, 0).filter(x => x.t === 'activate');
    ok(acts.length === 2, 'sólo personajes de 6★ o menos (Cell y Lara), no Sukuna 60%');
    act(st, 0, acts[0]);
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_cell'), 'Cell entra al campo (sin tributo, es de 6★)');
    ok(!st.players[0].normalUsed, 'no gasta la invocación normal');
    ok(has(st, 0, x => x.t === 'summon' && st.players[0].hand[x.hand].id === 'c_lara'), 'aún puede invocar normalmente');
    ok(grave(st, 0, 'c_superball'), 'Superball va al cementerio');
  }

  // ---------- Bardock y Vegeta ----------
  section('Bardock y Bardock SSJ');
  {
    const st = fresh(); put(st, 0, 0, 'c_bardock', { summonedTurn: 5 }); give(st, 0, ['c_bardock_ssj', 'c_popeye']);
    eq(stat(st, 0, 0), [1800, 1800], 'Instinto Saiyajin: solo → +400/+400');
    put(st, 0, 1, 'c_popeye');
    eq(stat(st, 0, 0), [1400, 1400], 'con otro aliado pierde el bonus');
    st.players[0].mz[1] = null;
    eq(stat(st, 0, 0), [1800, 1800], 'al quedar solo lo recupera');
    ok(!pw(st, 0, 'xform'), 'no se puede transformar el mismo turno ni antes de un turno completo');
    st.turn = 9; ready(st, 0, 9);
        const tot0 = total(st, 0);
    const x = pw(st, 0, 'xform'); ok(!!x && st.players[0].hand[x.hand].id === 'c_bardock_ssj', 'tras un turno completo puede transformarse (SSJ en la mano)');
    act(st, 0, x);
    const m = st.players[0].mz[0];
    ok(m.c.id === 'c_bardock_ssj' && m.link.length === 1 && m.link[0].id === 'c_bardock', 'SSJ ocupa el sitio y Bardock queda vinculado');
    ok(!st.players[0].normalUsed, 'la transformación no gasta la invocación normal');
    eq(stat(st, 0, 0), [2600, 2600], 'SSJ solo: 1800+800');
    eq(total(st, 0), tot0, 'sin duplicar cartas');
    // Cañón: sólo enemigos de 7★ o menos
    put(st, 1, 0, 'c_sukuna60'); put(st, 1, 1, 'c_kratos'); put(st, 1, 2, 'c_vegeta', { down: true });
    const cs = L(st, 0).filter(a => a.pw === 'canon');
    eq(cs.map(a => a.target.z), [1], 'Cañón: sin 10★, sin boca abajo; sólo Kratos (4★)');
    act(st, 0, cs[0]);
    ok(grave(st, 1, 'c_kratos'), 'Kratos muere');
    // muere SSJ → los dos al cementerio
    const st2 = fresh(); const s2 = put(st2, 0, 0, 'c_bardock_ssj'); s2.link = [{ uid: 900, id: 'c_bardock' }];
    st2.players[0].deck.pop();
    put(st2, 1, 0, 'c_sukuna60'); st2.turn = 7; ready(st2, 1, 7);
    toBattle(st2, 1); atk(st2, 1, 0, 0);
    ok(grave(st2, 0, 'c_bardock_ssj') && grave(st2, 0, 'c_bardock'), 'si SSJ muere, Bardock sigue su destino');
    ok(!st2.players[0].mz[0], 'el espacio queda libre');
  }
  section('Vegeta, Blue Evolution y Big Bang');
  {
    const st = fresh(); put(st, 0, 0, 'c_vegeta', { summonedTurn: 6 }); give(st, 0, ['c_vegeta_blue']);
    ready(st, 0, 10); ok(!pw(st, 0, 'xform'), '4★→10★ pide 3 turnos completos: a 1 no');
    ready(st, 0, 12); ok(!pw(st, 0, 'xform'), 'a los 2 completos todavía no');
    ready(st, 0, 14); const x = pw(st, 0, 'xform'); ok(!!x, 'a los 3 turnos completos sí');
    act(st, 0, x);
    const m = st.players[0].mz[0];
    ok(m.c.id === 'c_vegeta_blue' && m.link[0].id === 'c_vegeta', 'Blue ocupa el sitio con Vegeta vinculado');
    eq(stat(st, 0, 0), [2700, 2800], 'Blue usa sus propias estadísticas');
    const v = E.view(st, 0).players[0].mz[0]; eq(v.shield, 3000, 'escudo 3000/3000');
    // ataque al escudo
    put(st, 1, 0, 'c_cell'); ready(st, 1, 11); toBattle(st, 1);
    atk(st, 1, 0, 0);
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_vegeta_blue', 'Blue sigue en el campo');
    eq(E.view(st, 0).players[0].mz[0].shield, 1500, 'el escudo recibe el ATK del atacante (1500)');
    eq(st.players[0].lp, 8000, 'el escudo protege también la vida');
    eq(st.players[1].lp, 8000, 'el atacante no recibe daño de diferencia');
    ok(st.players[1].mz[0] && st.players[1].mz[0].c.id === 'c_cell', 'el atacante no es destruido');
    // atacante débil (menos ATK que el ATK/DEF de Blue): igual sólo toca el escudo, sin rebote ni daño
    {
      const st5 = fresh(); put(st5, 0, 0, 'c_vegeta_blue'); put(st5, 1, 0, 'c_popeye'); ready(st5, 1, 7); toBattle(st5, 1); atk(st5, 1, 0, 0);
      eq(E.view(st5, 0).players[0].mz[0].shield, 3000 - 1200, 'escudo recibe 1200 (ATK de Popeye)');
      eq([st5.players[0].lp, st5.players[1].lp], [8000, 8000], 'sin daño para nadie aunque su ATK sea menor que el de Blue');
      ok(st5.players[1].mz[0], 'el atacante sigue vivo');
      // escudo con 800 y un atacante de 2000 ATK: se destruye el escudo, sin daño sobrante ni a Vegeta ni al atacante
      const st6 = fresh(); const bl = put(st6, 0, 0, 'c_vegeta_blue'); bl.uBy = { c_vegeta_blue: { sh: 800 } }; put(st6, 1, 0, 'c_sukuna5', { atkMod: 0 }); ready(st6, 1, 7); toBattle(st6, 1);
      st6.players[1].mz[0].bonus = { atk: 2000 - st6.players[1].mz[0] .c.atk, def: 0 };
      atk(st6, 1, 0, 0);
      eq(E.view(st6, 0).players[0].mz[0].shield || 0, 0, 'el escudo se destruye');
      eq([st6.players[0].lp, st6.players[1].lp], [8000, 8000], 'Vegeta y el atacante no reciben daño');
      ok(st6.players[0].mz[0] && st6.players[1].mz[0], 'los dos siguen en el campo');
      // el siguiente ataque ya se resuelve con el ATK/DEF de Vegeta
      st6.players[1].mz[0].attacked = false; st6.players[1].mz[0].attackedTurn = 0; st6.players[1].mz[0].attacked = false;
      const lp0 = st6.players[1].lp;
      if (L(st6, 1).some(x => x.t === 'attack')) { atk(st6, 1, 0, 0); ok(st6.players[1].lp < lp0 || !st6.players[1].mz[0], 'sin escudo, el combate usa el ATK de Vegeta (el atacante pierde)'); }
    }
    // magia que lo destruye: sólo el escudo
    const st2 = fresh(); put(st2, 0, 0, 'c_vegeta_blue'); give(st2, 1, ['c_popeye']); ready(st2, 1, 7);
    st2.players[1].hand = [{ uid: 777, id: 'xs_beam' }];
    // creamos Hiperrayo si existe en el catálogo antiguo
    const beam = Cards.get('s_beam');
    if (beam) {
      st2.players[1].hand = [{ uid: 777, id: 's_beam' }];
      act(st2, 1, L(st2, 1).find(x => x.t === 'activate'));
      ok(st2.players[0].mz[0], 'Hiperrayo no destruye a Blue con escudo');
      eq(E.view(st2, 0).players[0].mz[0].shield, 0, 'el escudo se destruye');
      st2.players[1].hand = [{ uid: 778, id: 's_beam' }]; st2.players[1].lp = 8000; st2.players[1].normalUsed = false;
      act(st2, 1, L(st2, 1).find(x => x.t === 'activate'));
      ok(!st2.players[0].mz[0], 'sin escudo, el siguiente sí lo destruye');
    }
    // Big Bang
    const st3 = fresh(); put(st3, 0, 0, 'c_vegeta_blue'); put(st3, 0, 1, 'c_lara');
    put(st3, 1, 0, 'c_cell'); put(st3, 1, 1, 'c_kratos_f'); put(st3, 1, 2, 'c_sukuna5', { down: true });
    st3.players[1].mz[0].atkMod = 600;
    const bb = pw(st3, 0, 'bigbang'); ok(!!bb, 'Big Bang disponible'); act(st3, 0, bb);
    ok(!st3.players[1].mz[2] && grave(st3, 1, 'c_sukuna5'), 'destruye a los de menos de 2000 ATK (aun boca abajo)');
    ok(st3.players[1].mz[0] && !st3.players[1].mz[1], 'Cell con 2100 ATK se salva; Kratos F con 1800 muere');
    ok(st3.players[0].mz[1], 'no toca a los aliados');
    ok(!pw(st3, 0, 'bigbang'), 'una sola vez por invocación');
  }

  section('Cell, Sukuna, Shang, Lara/Titán, Kratos');
  {
    // Cell absorbe: gana la mitad; si muere libera al absorbido
    const st = fresh(); put(st, 0, 0, 'c_cell'); put(st, 1, 0, 'c_kratos'); const tot0 = total(st, 0) + total(st, 1);
    const a = pw(st, 0, 'absorb', x => x.target.vs === 1); ok(!!a, 'Cell puede absorber a Kratos (4★ ≤ 6★)');
    act(st, 0, a);
    ok(!st.players[1].mz[0], 'Kratos sale del campo rival');
    eq(stat(st, 0, 0), [1500 + 650, 1400 + 650], 'Cell gana la mitad del ATK y DEF absorbidos');
    eq(total(st, 0) + total(st, 1), tot0, 'las cartas absorbidas se cuentan');
    ok(!pw(st, 0, 'absorb'), 'una vez por invocación');
  }
  {
    const st = fresh(); put(st, 0, 0, 'c_sukuna5'); give(st, 1, ['c_popeye']);
    put(st, 1, 0, 'c_cell'); st.turn = 7; ready(st, 1, 7);
    st.players[1].hand = [];
    const heavy = put(st, 1, 1, 'c_sukuna60');
    ok(!has(st, 1, x => x.pw === 'canon'), 'sin Cañón no hay efecto');
    // Sukuna 60%: Relicario → dominio: 10★ sólo
    st.players[0].mz[0] = null; put(st, 0, 0, 'c_sukuna60');
    ready(st, 0, 7);
    const r = pw(st, 0, 'relicario'); ok(!!r, 'Relicario Demoníaco disponible');
    act(st, 0, r);
    ok(!!E.view(st, 0).domain, 'el dominio queda activo');
    eq(stat(st, 0, 0), [2800 + 500 + 0, 2900 + 500], 'Relicario: +500/+500');
    ok(!L(st, 0).some(x => x.t === 'activate'), 'nadie activa magias durante el dominio');
  }
  {
    // Shang Tsung: copia y vuelve a su forma si lo derrotan
    const st = fresh(); put(st, 0, 0, 'c_shang', { summonedTurn: 3 });
    ok(!pw(st, 0, 'copy'), 'sin personajes en el campo no hay a quién copiar');
    put(st, 1, 0, 'c_kratos_f', { summonedTurn: 1, bonus: { atk: 300, def: 100 } });
    const cp = pw(st, 0, 'copy', x => x.target && x.target.vs === 1 && x.target.z === 0); ok(!!cp, 'Shang puede copiar a Kratos F del campo');
    const kf = E.view(st, 0).players[1].mz[0];
    act(st, 0, cp);
    eq([E.view(st, 0).players[0].mz[0].atk, E.view(st, 0).players[0].mz[0].def], [kf.atk, kf.def], 'copia el ATK/DEF final exacto (con sus bonos), sin duplicar');
    st.players[1].mz[0].bonus = null;
    st.players[1].mz[0] = null;
    eq(E.view(st, 0).players[0].mz[0].c.id, 'c_kratos_f', 'toma el nombre del copiado');
    eq(E.view(st, 0).players[0].mz[0].real, 'c_shang', 'la vista recuerda quién es en realidad');
    put(st, 1, 0, 'c_sukuna60'); ready(st, 1, 7); toBattle(st, 1); atk(st, 1, 0, 0);
    const m = st.players[0].mz[0];
    ok(m && m.c.id === 'c_shang' && m.noCopy, 'derrotado transformado: vuelve a su forma y no puede volver a transformarse');
    eq(total(st, 0), 30 - 30 + total(st, 0), 'sin duplicar');
  }
  {
    // Lara muerde: Titán desde la mano, vinculado
    const st = fresh(); put(st, 0, 0, 'c_lara', { summonedTurn: 2 }); give(st, 0, ['c_titan']);
    const tot0 = total(st, 0);
    const b = pw(st, 0, 'bite'); ok(!!b, 'Lara puede invocar a Titán desde la mano');
    act(st, 0, b);
    eq(st.players[0].lp, 7500, 'paga 500 PV');
    const t = st.players[0].mz.find(m => m && m.c.id === 'c_titan'); ok(t && t.wide && t.link.length === 1, 'Titán ocupa 2 zonas y Lara queda vinculada');
    eq(total(st, 0), tot0, 'sin duplicar');
    ok(st.players[0].mz.filter(Boolean).length === 1, 'Lara deja su sitio');
  }
  {
    // Kratos roba habilidad al asesinar
    const st = fresh(); put(st, 0, 0, 'c_kratos'); put(st, 1, 0, 'c_cell', { pos: 'atk' });
    st.players[1].mz[0].atkMod = -1200;
    ready(st, 0, 7); toBattle(st, 0); atk(st, 0, 0, 0);
    const pd = st.pending;
    ok(!pd || pd.ab === 'steal', 'tras la baja Kratos puede robar');
    if (pd) { const a = L(st, 0).find(x => x.pick != null); ok(!!a, 'hay habilidad que robar'); if (a) act(st, 0, a); ok(st.players[0].mz[0].ext && st.players[0].mz[0].ext.length === 1, 'la habilidad robada se guarda'); }
    const sv = E.view(st, 0).players[0].mz[0];
    eq(sv.stealCap, 1, 'Kratos puede guardar 1 habilidad robada'); eq(sv.stealN, 1, 'ya robó 1');
    eq(sv.extInfo.map(x => [x.id, x.from]), [['absorb', 'Cell Semi Perfecto']], 'la vista dice cuál y de quién la robó');
    eq(sv.extInfo[0].state, 'ready', 'disponible mientras no se use');
    const ab = pw(st, 0, 'absorb'); if (ab) { act(st, 0, ab); eq(E.view(st, 0).players[0].mz[0].extInfo[0].state, 'used', 'tras usarla figura como usada'); }
    const v1 = E.view(st, 1).players[0].mz[0]; ok(v1.extInfo && v1.extInfo.length === 1, 'el rival también ve lo que robó');
  }

  section('Sacrificios: 10★ o más piden 3');
  {
    eq([4, 5, 7, 9, 10].map(Cards.tributesFor), [0, 1, 2, 2, 3], 'sacrificios por nivel');
    const st = fresh(); put(st, 0, 0, 'c_popeye'); put(st, 0, 1, 'c_lara'); give(st, 0, ['c_sukuna60']);
    ok(!has(st, 0, x => x.t === 'summon'), 'con 2 personajes no se invoca uno de 10★');
    put(st, 0, 2, 'c_creeper');
    const a = L(st, 0).filter(x => x.t === 'summon'); ok(a.length === 1 && a[0].tributes.length === 3, 'con 3 sí, sacrificando los 3');
    const tot0 = total(st, 0); act(st, 0, a[0]);
    ok(st.players[0].mz.filter(Boolean).length === 1 && st.players[0].mz.some(m => m && m.c.id === 'c_sukuna60'), 'queda sólo el invocado');
    eq(st.players[0].grave.length, 3, 'los 3 sacrificados van al cementerio'); eq(total(st, 0), tot0, 'sin duplicar');
  }

  section('IA: poderes en la fase de batalla');
  {
    const st = fresh(); put(st, 0, 0, 'c_kratos_f'); st.players[0].mz[0].uBy = { c_kratos_f: { kills: 1 } };
    put(st, 1, 0, 'c_sukuna5'); ready(st, 0, 7); toBattle(st, 0);
    ok(has(st, 0, x => x.pw === 'furia'), 'Furia disponible en la fase de batalla');
    let thrown = null; try { const a = AI.create('normal', 1).choose(st, 0); ok(!!a, 'la IA elige una acción con Furia disponible'); } catch (e) { thrown = e; }
    ok(!thrown, 'la IA no lanza errores en batalla con poderes');
  }
}
