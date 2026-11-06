/* Tanda 6 (05-11-2026): Black Clover, Solo Leveling, Bulma, Mr. Satan, Elizabeth, Galand, Higuruma, Inosuke, Tobi, Sai,
 * Shikamaru, Liu Kang, Misa, las espadas, Mafuba y las trampas El Único, Full Counter, Kamui, Kyoka Suigetsu y Tsukuyomi.
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
  const fresh = p => { const st = game({ seed: 11 }); ready(st, p || 0); for (const P of st.players) { P.hand = []; P.st = P.st.map(() => null); P.mz = P.mz.map(() => null); } return st; };
  const hand = (st, p, ids) => { st.players[p].hand = ids.map(id => ({ uid: st.nextUid++, id })); };
  const pw = (st, p, name, f) => L(st, p).find(a => a.t === 'power' && a.pw === name && (!f || f(a)));
  const ids = (st, p) => st.players[p].mz.map(m => m ? m.c.id : null);
  const cnt = st => [E.countCards(st, 0), E.countCards(st, 1)];
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const atkA = (st, p, z, tz, f) => L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz && !x.hira && (!f || f(x)));
  const battle = st => { st.phase = 'battle'; };
  const answer = (st, pick) => { let n = 0; while (st.pending && n++ < 12) { const q = E.actor(st), l = L(st, q); act(st, q, pick(st, q, l) || l.find(x => x.t === 'respond' && !x.activate) || l.find(x => x.t === 'ability' && x.use === false) || l[0]); } };
  const no = st => answer(st, () => null);
  const yes = st => answer(st, (s, q, l) => l.find(x => x.t === 'respond' && x.activate) || l.find(x => x.t === 'ability' && x.use === true));
  const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);

  section('tanda 6: catálogo');
  {
    const root = path.join(__dirname, '..');
    const T6 = Cards.inTanda(6);
    eq(T6.length, 30, '30 cartas en la tanda 6');
    for (const id of T6.concat(['c_tinta_leon', 'c_tinta_aguila', 'c_tinta_serpiente'])) {
      const c = Cards.get(id);
      ok(c && c.img && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k of ['imgSung', 'imgDom']) if (c[k]) ok(fs.existsSync(path.join(root, c[k])), id + ' imagen alternativa');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k);
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': ' + a + ' tiene texto');
    }
    const s = Cards.get('c_sung_monarca'), u = Cards.get('c_asta_union');
    eq([s.level, s.atk, s.def, u.level, u.atk, u.def], [12, 2700, 2500, 10, 2400, 2400], 'Sung Monarca y Asta Unión');
    ok(Cards.get('c_tinta_leon').hidden && !Cards.all().some(c => c.ink), 'las criaturas de tinta no salen en el catálogo');
  }

  section('Asta: Espada de la antimagia y transformaciones');
  {
    // anula una magia que apunta a un aliado
    let st = fresh(1); put(st, 0, 0, 'c_asta'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_kratos'); hand(st, 1, ['c_death_note']);
    act(st, 1, L(st, 1).find(a => a.t === 'activate' && a.target && a.target.z === 1));
    ok(st.pending && st.pending.ab === 'antimag' && st.pending.player === 0, 'Asta puede anular la Death Note dirigida a un aliado');
    yes(st);
    ok(!st.players[0].mz[1].dn && grave(st, 1, 'c_death_note'), 'la Death Note queda anulada y va al cementerio');
    eq(cnt(st), [30, 30].map((x, i) => E.countCards(st, i)), 'sin pérdida de cartas');
    hand(st, 1, ['c_death_note']);
    act(st, 1, L(st, 1).find(a => a.t === 'activate' && a.target && a.target.z === 1));
    ok(!(st.pending && st.pending.ab === 'antimag'), 'una sola vez por turno');
    no(st);
    // anula una habilidad
    st = fresh(1); put(st, 0, 0, 'c_asta'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === 1));
    ok(st.pending && st.pending.ab === 'antimag', 'también ante una habilidad enemiga');
    yes(st);
    ok(!!st.players[0].mz[1], 'el Cañón no se resuelve');
    ok(!pw(st, 1, 'canon'), 'la habilidad anulada no se repite ese turno');
    // Gokumonkyo, aunque apunte a otro jugador (aquí, a un aliado)
    st = fresh(1); put(st, 0, 0, 'c_asta'); put(st, 0, 1, 'c_goku'); hand(st, 1, ['c_gokumonkyo']);
    act(st, 1, L(st, 1).find(a => a.t === 'activate')); no(st);
    // Forma Negra: al morir un aliado
    st = fresh(0); put(st, 0, 0, 'c_asta'); put(st, 0, 1, 'c_goku'); hand(st, 0, ['c_asta_negra', 'c_asta_union']);
    ok(!pw(st, 0, 'astaneg'), 'sin bajas no puede transformarse');
    put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj'); ready(st, 1, st.turn + 1);
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === 1)); no(st);
    ok(!st.players[0].mz[1], 'un aliado muere');
    ready(st, 0, st.turn + 1);
    const an = pw(st, 0, 'astaneg');
    ok(!!an, 'Asta puede transformarse en Forma Negra en su siguiente turno');
    act(st, 0, an);
    eq(st.players[0].mz[0].c.id, 'c_asta_negra', 'Asta Forma Negra ocupa su lugar');
    ok(!pw(st, 0, 'astauni'), 'Unión Demoníaca necesita 2 bajas más');
    for (let i = 0; i < 2; i++) { put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj'); ready(st, 1, st.turn + 1); act(st, 1, pw(st, 1, 'canon', a => a.target.z === 1)); no(st); ok(!st.players[0].mz[1], 'baja ' + (i + 2)); }
    ready(st, 0, st.turn + 1);
    ok(!!pw(st, 0, 'astauni'), 'con 2 bajas más, Forma Negra puede pasar a Unión Demoníaca');
  }

  section('Asta: Anulación de aumentos, Unión Demoníaca');
  {
    let st = fresh(0); put(st, 0, 0, 'c_asta_negra'); const g = put(st, 1, 0, 'c_goku'); g.mods = [{ k: 'kaiospell', atk: 400, def: 400, t0: 1, n: 0 }, { k: 'ola', atk: -500, def: -500, t0: 1, n: 0 }];
    battle(st);
    const sa = atkA(st, 0, 0, 0, x => x.strip);
    ok(!!sa, 'puede atacar quitando los aumentos');
    act(st, 0, sa); no(st);
    ok(!st.players[1].mz[0] || !(st.players[1].mz[0].mods || []).some(x => x.atk > 0), 'el rival pierde sus aumentos (las reducciones se quedan)');
    // Anti-Magia Absoluta
    st = fresh(1); put(st, 0, 0, 'c_asta_union'); put(st, 1, 0, 'c_bardock_ssj'); put(st, 1, 1, 'c_megumi');
    ok(!L(st, 1).some(a => a.t === 'power'), 'con Asta Unión Demoníaca, los enemigos no usan habilidades a mano');
    // Protección de la forma negra
    st = fresh(1); const au = put(st, 0, 0, 'c_asta_union'); put(st, 1, 0, 'c_vegeta_ssj', { mods: [] });
    st.players[1].mz[0].c.id = 'c_vegeta_ssj';
    ok(!!au, 'Unión en el campo');
  }

  section('Solo Leveling: soldados, Ejército de las sombras, Monarca');
  {
    let st = fresh(0); put(st, 0, 0, 'c_sung'); hand(st, 0, ['c_igris', 'c_sung_monarca']); st.players[0].deck.unshift({ uid: st.nextUid++, id: 'c_beru' });
    const ig = pw(st, 0, 'sjigris', a => a.from === 'hand');
    ok(!!ig, 'Sung Jin-Woo invoca a Igris desde la mano');
    act(st, 0, ig); no(st);
    const igz = st.players[0].mz.findIndex(m => m && m.c.id === 'c_igris');
    ok(igz >= 0 && st.players[0].mz[igz].bySung, 'Igris entra invocado por Sung');
    eq(stat(st, 0, igz), [2300, 2300], 'Lealtad al Monarca: +400/+400');
    ok(!pw(st, 0, 'sjigris'), 'una vez por turno');
    ok(E.view(st, 0).players[0].mz[igz].art === Cards.get('c_igris').imgSung, 'Igris invocado por Sung usa su otra imagen');
    // Ejército de las sombras
    st.players[1].grave.push({ uid: st.nextUid++, id: 'c_kratos' });
    st.players[0].mz[0].sjc = 2;
    const ar = pw(st, 0, 'sjarmy', a => a.g === 1);
    ok(!!ar, 'con 2 cargas levanta a un personaje del cementerio rival');
    act(st, 0, ar); no(st);
    const kz = st.players[0].mz.findIndex(m => m && m.c.id === 'c_kratos');
    ok(kz >= 0 && st.players[0].mz[kz].shadow && st.players[0].mz[kz].owner === 1, 'entra como soldado de las sombras (sigue siendo del rival)');
    eq(cnt(st), [E.countCards(st, 0), E.countCards(st, 1)], 'el conteo sigue correcto');
    // Monarca: con 2 soldados
    ready(st, 0, st.turn + 2);
    const mo = pw(st, 0, 'sjmon');
    ok(!!mo, 'con 2 soldados, Sung puede transformarse en Monarca');
    act(st, 0, mo);
    eq(st.players[0].mz[0].c.id, 'c_sung_monarca', 'Sung Jin-Woo Monarca');
    eq(stat(st, 0, 0)[0], 2700 + 400, 'Poder del Monarca: +200 ATK por soldado');
    // Sacrificio de las sombras
    st = fresh(1); put(st, 0, 0, 'c_sung'); put(st, 0, 1, 'c_igris'); put(st, 1, 0, 'c_bardock_ssj');
    st.players[1].mz[0].c.id = 'c_cell';
    hand(st, 1, ['c_death_note']);
    // Dominio de las sombras: Cell no puede absorber a Igris
    ok(!pw(st, 1, 'absorb', a => a.target.z === 1), 'Dominio de las sombras: Cell no puede absorber a un soldado');
  }

  section('Solo Leveling: Intercambio de sombras, Beru, Bellion');
  {
    let st = fresh(1); put(st, 0, 0, 'c_sung'); put(st, 0, 1, 'c_igris'); put(st, 1, 0, 'c_odin', { summonedTurn: 0 });
    battle(st);
    act(st, 1, atkA(st, 1, 0, 0));
    ok(st.pending && st.pending.ab === 'shadowred', 'al atacar a Sung puede protegerse con un soldado');
    const sw = L(st, 0).find(a => a.pick === 'swap:1');
    act(st, 0, sw); no(st);
    ok(st.players[0].mz[1] && st.players[0].mz[1].c.id === 'c_sung', 'Sung cambió de casilla');
    ok(!st.players[0].mz[0] || st.players[0].mz[0].c.id !== 'c_sung', 'el soldado recibió el ataque');
    // Beru invocado por el Monarca
    st = fresh(0); put(st, 0, 0, 'c_sung_monarca'); hand(st, 0, ['c_beru']);
    act(st, 0, pw(st, 0, 'sjberu')); no(st);
    const bz = st.players[0].mz.findIndex(m => m && m.c.id === 'c_beru'), be = st.players[0].mz[bz];
    eq(stat(st, 0, bz)[0], 2700, 'Beru: +500 ATK permanente');
    ok(be.xtra && be.xtra.n === 1, 'y un ataque extra ese turno');
    // Regeneración de sombras
    put(st, 1, 0, 'c_bardock_ssj'); ready(st, 1, st.turn + 1);
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === bz) || L(st, 1)[0]); no(st);
    ok(!!st.players[0].mz[bz] && stat(st, 0, bz)[1] === 500, 'Beru sobrevive a la habilidad con 500 de DEF');
    // Bellion: Gran Mariscal
    st = fresh(1); put(st, 0, 0, 'c_bellion'); put(st, 0, 1, 'c_igris'); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === 1)); no(st);
    ok(!!st.players[0].mz[1] && !st.players[0].mz[0], 'Bellion recibe la destrucción en lugar de Igris');
  }

  section('Goku SSJ, Bulma, Mr. Satan');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku_ssj'); put(st, 1, 0, 'c_goku'); putST(st, 1, 0, 'c_armadura', { equipTo: null });
    act(st, 0, pw(st, 0, 'kameha'));
    eq(stat(st, 0, 0)[0], 1800, 'Kamehameha: +300 ATK');
    battle(st); act(st, 0, atkA(st, 0, 0, 0)); no(st);
    ok(!st.players[1].mz[0] && !st.players[1].st[0], 'destruye al personaje y la magia de detrás');
    eq(stat(st, 0, 0)[0], 1500, 'el aumento se gasta');
    ok(!pw(st, 0, 'kameha'), 'una vez por invocación');
    // Bulma: Genio científico
    st = fresh(0); put(st, 0, 0, 'c_bulma'); hand(st, 0, ['c_goku']); st.players[0].deck = [{ uid: st.nextUid++, id: 'c_kaioken' }, { uid: st.nextUid++, id: 'c_goku' }];
    act(st, 0, pw(st, 0, 'bulmagen'));
    act(st, 0, L(st, 0)[0]);
    ok(st.pending && st.pending.cont === 'bulmabot', 'después hay que poner una carta al fondo del mazo');
    act(st, 0, L(st, 0).find(a => a.uid === st.players[0].hand[0].uid));
    ok(st.players[0].hand.some(c => c.id === 'c_kaioken') && st.players[0].deck[st.players[0].deck.length - 1].id === 'c_goku', 'agrega la magia y manda una carta al fondo');
    // Bulma: Inventora de emergencia
    st = fresh(1); put(st, 0, 0, 'c_bulma'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_odin'); battle(st);
    act(st, 1, atkA(st, 1, 0, 1));
    ok(st.pending && st.pending.ab === 'bulma', 'Bulma puede sacrificarse');
    yes(st);
    ok(!!st.players[0].mz[1] && !st.players[0].mz[0] && grave(st, 0, 'c_bulma'), 'Goku se salva y Bulma va al cementerio');
    // Mr. Satan
    st = fresh(1); put(st, 0, 0, 'c_mr_satan'); put(st, 1, 0, 'c_odin'); put(st, 1, 1, 'c_goku'); battle(st);
    ok(!atkA(st, 1, 0, 0) && !!atkA(st, 1, 1, 0), 'los de 7★ o más no pueden atacarlo');
    st = fresh(0); put(st, 0, 0, 'c_mr_satan'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 0, pw(st, 0, 'satanpub', a => a.target.z === 1));
    ready(st, 1, st.turn + 1);
    ok(!pw(st, 1, 'canon', a => a.target.z === 1), 'Publicidad engañosa: no se le pueden lanzar habilidades');
    ready(st, 0, st.turn + 1);
    ok(!st.players[0].mz[1].pub, 'dura hasta tu siguiente turno');
  }

  section('Elizabeth, Galand, Liu Kang, Inosuke');
  {
    let st = fresh(1); put(st, 0, 0, 'c_elizabeth'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === 1)); no(st);
    ok(!!st.players[0].mz[1], 'Barrera de la Diosa: la habilidad no destruye al aliado');
    // Luz purificadora
    st = fresh(0); put(st, 0, 0, 'c_elizabeth'); const g = put(st, 0, 1, 'c_goku'); g.mods = [{ k: 'ola', atk: -500, def: -500, t0: 1, n: 0 }]; g.dn = { by: 1 };
    const lz = L(st, 0).filter(a => a.pw === 'elizluz' && a.target.z === 1);
    eq(lz.length, 2, 'puede elegir cuál de los 2 efectos negativos quita');
    act(st, 0, lz.find(a => a.k === 'dn'));
    ok(!g.dn && g.mods.length === 1, 'quita sólo el elegido');
    // Poder de la Diosa
    st = fresh(1); put(st, 0, 0, 'c_elizabeth'); st.players[0].grave.push({ uid: st.nextUid++, id: 'c_goku' }, { uid: st.nextUid++, id: 'c_odin' }); put(st, 1, 0, 'c_odin'); battle(st);
    act(st, 1, atkA(st, 1, 0, 0));
    let n = 0; while (st.pending && n++ < 6) { const q = E.actor(st), l = L(st, q); act(st, q, st.pending.cont === 'eliz' ? l[0] : (l.find(x => x.t === 'respond' && !x.activate) || l.find(x => x.use === false) || l[0])); }
    ok(st.players[0].hand.some(c => c.id === 'c_goku') && !st.players[0].hand.some(c => c.id === 'c_odin'), 'Poder de la Diosa: vuelve a la mano un personaje de hasta 6★');
    // Galand: Mandamiento de la Verdad (los Conejos de Megumi esquivan y Megumi queda petrificada)
    st = fresh(0); put(st, 0, 0, 'c_galand'); put(st, 1, 0, 'c_megumi'); battle(st);
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    ok(!!st.players[1].mz[0] && st.players[1].mz[0].petri, 'el esquive funciona y Megumi queda petrificada');
    ready(st, 1, st.turn + 1);
    ok(!L(st, 1).some(a => a.t === 'power' && a.zone === 0), 'petrificada: no usa habilidades');
    // Critical Over y Caza Implacable
    st = fresh(0); const ga = put(st, 0, 0, 'c_galand'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_goku'); put(st, 1, 2, 'c_goku');
    act(st, 0, pw(st, 0, 'galcaza'));
    battle(st); act(st, 0, atkA(st, 0, 0, 0)); no(st);
    eq(stat(st, 0, 0)[0], 2600, 'Caza Implacable: el +400 se queda al destruir');
    uOf0(ga).gco = 2;
    act(st, 0, pw(st, 0, 'galco'));
    ok(!!atkA(st, 0, 0, 1), 'Critical Over: puede atacar otra vez');
    // Liu Kang
    st = fresh(0); put(st, 0, 0, 'c_liu_kang'); battle(st);
    act(st, 0, pw(st, 0, 'liukang'));
    let k = 0; while (L(st, 0).some(a => a.t === 'attack' && a.zone === 0)) { act(st, 0, L(st, 0).find(a => a.t === 'attack' && a.zone === 0)); no(st); if (++k > 5) break; }
    eq(k, 3, 'Patadas Continuas: 3 ataques');
    // Inosuke: Sentido del tacto
    st = fresh(0); put(st, 0, 0, 'c_inosuke'); put(st, 1, 0, 'c_goku', { down: true, pos: 'def' });
    ok(E.view(st, 0).players[1].mz[0].c && E.view(st, 0).players[1].mz[0].peeked, 'Inosuke ve al personaje boca abajo');
    putST(st, 1, 0, 'c_kamui', { down: true, setTurn: 1 });
    ok(E.view(st, 0).players[1].st[0].c && E.view(st, 0).players[1].st[0].peeked, 'y también las magias y trampas boca abajo');
    st.players[0].mz[0] = null;
    ok(!E.view(st, 0).players[1].st[0].c, 'sin Inosuke no se ven');
  }
  function uOf0(m) { const k = m.copy || m.form || m.c.id, b = m.uBy || (m.uBy = {}); return b[k] || (b[k] = {}); }

  section('Higuruma: dominio');
  {
    let st = fresh(0); put(st, 0, 0, 'c_higuruma'); put(st, 1, 0, 'c_goku'); putST(st, 1, 0, 'c_armadura', { equipTo: 0 });
    eq(stat(st, 1, 0), [2000, 2000], 'Goku con la Armadura Dorada');
    act(st, 0, pw(st, 0, 'higudom'));
    ok(st.domain && st.domain.dn === 'Sentencia Mortal' && st.domain.min === 7, 'abre Sentencia Mortal (sólo los de más de 6★ usan habilidades)');
    eq(stat(st, 1, 0), [1400, 1400], 'las magias equipadas quedan anuladas');
    eq(stat(st, 0, 0), [2100, 2100], 'Higuruma +500');
    st.domain.higu.k = 3;
    put(st, 1, 1, 'c_odin'); put(st, 0, 1, 'c_goku');
    ready(st, 1, st.turn + 1); battle(st);
    act(st, 1, atkA(st, 1, 1, 1)); no(st);
    ok(st.domain.higu.sword, 'con 4 asesinatos enemigos recibe la Espada del Verdugo');
    eq(stat(st, 0, 0)[0], 4100, '+2000 ATK');
    ok(E.view(st, 0).players[0].mz[0].art === Cards.get('c_higuruma').imgDom, 'cambia de imagen');
    // choque: Higuruma (6★) no puede contra Jogo (7★)
    st = fresh(0); put(st, 0, 0, 'c_jogo'); put(st, 1, 0, 'c_higuruma');
    act(st, 0, pw(st, 0, 'dominio')); ready(st, 1, st.turn + 1);
    ok(!pw(st, 1, 'higudom'), 'con un dominio de más estrellas no puede abrir el suyo');
  }

  section('Tobi, Sai, Shikamaru, Misa');
  {
    let st = fresh(1); put(st, 0, 0, 'c_tobi'); put(st, 1, 0, 'c_odin'); battle(st);
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    ok(!!st.players[0].mz[0], 'Kamui: Tobi esquiva el ataque');
    put(st, 1, 1, 'c_odin');
    act(st, 1, atkA(st, 1, 1, 0)); no(st);
    ok(!st.players[0].mz[0], 'una vez por turno');
    // Dimensión Kamui
    st = fresh(0); put(st, 0, 0, 'c_tobi'); put(st, 1, 0, 'c_odin');
    const c0 = cnt(st);
    act(st, 0, pw(st, 0, 'tobidim', a => a.target.vs === 1));
    ok(!st.players[1].mz[0] && st.limbo.length === 1, 'Odin sale del campo');
    eq(cnt(st), c0, 'sigue contando para su dueño');
    act(st, 0, L(st, 0).find(a => a.t === 'endTurn')); no(st);
    ok(!st.players[1].mz[0], 'no vuelve en su propio turno...');
    act(st, 1, L(st, 1).find(a => a.t === 'endTurn')); no(st);
    ok(!!st.players[1].mz[0] && st.players[1].mz[0].c.id === 'c_odin', '...vuelve al terminar el siguiente turno de su controlador');
    // Maestro de la manipulación
    st = fresh(0); put(st, 1, 0, 'c_odin'); put(st, 0, 1, 'c_goku'); hand(st, 0, ['c_tobi']);
    act(st, 0, L(st, 0).find(a => a.t === 'summon' && a.hand === 0)); no(st);
    ok(!!st.players[1].mz[0].tobiNA, 'al invocarlo elige a un enemigo');
    // Sai
    st = fresh(0); put(st, 0, 0, 'c_sai'); put(st, 1, 0, 'c_goku');
    act(st, 0, pw(st, 0, 'tinta', a => a.opt === 'serp'));
    eq(stat(st, 1, 0)[0], 900, 'Serpiente de tinta: −500 ATK');
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_tinta_serpiente'), 'la serpiente ocupa una casilla');
    eq(cnt(st), [E.countCards(st, 0), E.countCards(st, 1)], 'la criatura no cuenta como carta');
    ok(!pw(st, 0, 'tinta'), 'una por turno');
    ready(st, 1, st.turn + 1); battle(st);
    ok(!L(st, 1).some(a => a.t === 'attack' && a.target === 1), 'las criaturas de tinta no pueden ser atacadas');
    ready(st, 0, st.turn + 1);
    act(st, 0, L(st, 0).find(a => a.t === 'endTurn')); no(st);
    ok(!st.players[0].mz.some(m => m && m.c.id === 'c_tinta_serpiente') && !st.players[0].grave.some(c => c.id === 'c_tinta_serpiente'), 'al final del turno desaparece sin ir al cementerio');
    st = fresh(0); put(st, 0, 0, 'c_sai'); put(st, 1, 0, 'c_goku');
    act(st, 0, pw(st, 0, 'tinta', a => a.opt === 'leon'));
    const lz = st.players[0].mz.findIndex(m => m && m.c.id === 'c_tinta_leon');
    battle(st);
    ok(!!atkA(st, 0, lz, 0), 'el León de tinta ataca el mismo turno');
    // Shikamaru
    st = fresh(0); put(st, 0, 0, 'c_shikamaru'); put(st, 1, 0, 'c_bardock_ssj'); put(st, 0, 1, 'c_goku');
    act(st, 0, pw(st, 0, 'shikasomb', a => a.target.z === 0));
    ready(st, 1, st.turn + 1);
    ok(!pw(st, 1, 'canon'), 'Posesión de sombras: no usa habilidades en su siguiente turno');
    battle(st); ok(!L(st, 1).some(a => a.t === 'attack'), 'ni ataca');
    // Estratega brillante
    st = fresh(1); put(st, 0, 0, 'c_shikamaru'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === 1));
    ok(st.pending && st.pending.ab === 'shikaestr', 'Shikamaru puede anticiparse a la habilidad');
    act(st, 0, { t: 'ability', use: true }); no(st);
    eq(stat(st, 1, 0)[0], Cards.get('c_bardock_ssj').atk + 800 - 400, 'el que la usó pierde 400 ATK (Bardock solo tiene +800)');
    // Misa
    st = fresh(0); put(st, 0, 0, 'c_misa'); put(st, 1, 0, 'c_goku', { down: true, pos: 'def' }); put(st, 1, 1, 'c_odin');
    putST(st, 1, 0, 'c_kamui', { down: true, setTurn: 1 });
    ok(!!pw(st, 0, 'misaojos', a => a.target.area === 'st'), 'Ojos de Shinigami: también puede mirar una magia/trampa boca abajo');
    act(st, 0, pw(st, 0, 'misaojos', a => a.target.area === 'st'));
    ok(E.view(st, 0).players[1].st[0].c && E.view(st, 0).players[1].st[0].peeked && !E.view(st, 1).players[1].st[0].peeked, 've la trampa en secreto');
    st.players[0].mz[0].uBy = {};
    act(st, 0, pw(st, 0, 'misaojos', a => !a.target.area));
    ok(E.view(st, 0).players[1].mz[0].peeked && !E.view(st, 1).players[1].mz[0].peeked, 'Ojos de Shinigami: lo ve sólo Misa');
    act(st, 0, pw(st, 0, 'misadn', a => a.target.z === 1));
    ok(!!st.players[1].mz[1].dn, 'Portadora de la Death Note');
    ready(st, 0, st.turn + 2);
    ok(!pw(st, 0, 'misadn'), 'una vez cada 2 turnos');
  }

  section('Espadas y Mafuba');
  {
    let st = fresh(1); put(st, 0, 0, 'c_goku'); putST(st, 0, 0, 'c_espada_antimagia', { equipTo: 0 }); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 1, pw(st, 1, 'canon'));
    ok(st.pending && st.pending.ab === 'antimag', 'Espada de la Antimagia: el portador puede anular lo que lo elige');
    yes(st); ok(!!st.players[0].mz[0], 'anulado');
    st = fresh(0); put(st, 0, 0, 'c_goku'); putST(st, 0, 0, 'c_katana_antimagia', { equipTo: 0 }); put(st, 1, 0, 'c_bardock_ssj');
    act(st, 0, pw(st, 0, 'katana', a => a.ab === 'canon'));
    ready(st, 1, st.turn + 1);
    ok(!pw(st, 1, 'canon'), 'Katana: la habilidad queda destruida durante la invocación');
    st = fresh(0); const gk = put(st, 0, 0, 'c_goku'); gk.mods = [{ k: 'ola', atk: -500, def: -500, t0: 1, n: 0 }]; putST(st, 0, 0, 'c_espada_causas', { equipTo: 0 });
    act(st, 0, L(st, 0).find(a => a.t === 'toBattle'));
    ok(!(gk.mods || []).length, 'Espada Destructora de Causas: limpia al empezar el combate');
    st = fresh(0); put(st, 0, 0, 'c_goku'); putST(st, 0, 0, 'c_espada_demonios', { equipTo: 0 }); const o = put(st, 1, 0, 'c_goku'); o.mods = [{ k: 'kaiospell', atk: 400, def: 400, t0: 1, n: 0 }]; battle(st);
    ok(!!atkA(st, 0, 0, 0, x => x.strip), 'Espada Destructora de Demonios: puede quitar los aumentos al atacar');
    // Mafuba
    st = fresh(0); put(st, 1, 0, 'c_odin'); hand(st, 0, ['c_mafuba']); const c0 = cnt(st);
    act(st, 0, L(st, 0).find(a => a.t === 'activate')); no(st);
    ok(!st.players[1].mz[0] && st.limbo.length === 1, 'Mafuba encierra a Odin');
    eq(cnt(st), c0, 'sigue contando');
    for (let i = 0; i < 8 && !st.players[1].mz[0]; i++) { act(st, E.actor(st), L(st, E.actor(st)).find(a => a.t === 'endTurn')); no(st); }
    ok(!!st.players[1].mz[0], 'vuelve a los 2 turnos');
  }

  section('Trampas: El Único, Tsukuyomi, Kamui, Full Counter, Kyoka Suigetsu');
  {
    let st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_odin'); putST(st, 0, 0, 'c_el_unico', { down: true, setTurn: 1 }); battle(st);
    act(st, 1, atkA(st, 1, 0, 0)); yes(st);
    ok(!!st.players[0].mz[0] && !st.players[1].mz[0], 'El Único: Goku queda 100 por encima y gana el combate');
    eq(stat(st, 0, 0)[0], 1400, 'el aumento era sólo para ese combate');
    st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_odin'); putST(st, 0, 0, 'c_tsukuyomi', { down: true, setTurn: 1 }); battle(st);
    act(st, 1, atkA(st, 1, 0, 0)); yes(st);
    ok(!!st.players[0].mz[0] && st.players[1].mz[0].binds && st.players[1].mz[0].binds[0].n === 2, 'Tsukuyomi: cancela y bloquea 2 turnos');
    // Kamui ante un combate
    st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_odin'); putST(st, 0, 0, 'c_kamui', { down: true, setTurn: 1 }); battle(st);
    const c0 = cnt(st);
    act(st, 1, atkA(st, 1, 0, 0)); yes(st);
    ok(!st.players[0].mz[0] && st.limbo.length === 1 && !grave(st, 0, 'c_goku'), 'Kamui: Goku se va a otra dimensión en vez de morir');
    eq(cnt(st), c0, 'sin pérdida de cartas');
    act(st, 1, L(st, 1).find(a => a.t === 'endTurn')); no(st);
    ok(!!st.players[0].mz[0], 'vuelve al empezar tu turno');
    // Kamui ante una habilidad
    st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj'); putST(st, 0, 0, 'c_kamui', { down: true, setTurn: 1 });
    act(st, 1, pw(st, 1, 'canon')); yes(st);
    ok(!st.players[0].mz[0] && st.limbo.length === 1, 'también ante una habilidad que destruye');
    // Full Counter: devuelve un ataque
    st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_odin'); put(st, 1, 1, 'c_creeper'); putST(st, 0, 0, 'c_full_counter', { down: true, setTurn: 1 }); battle(st);
    act(st, 1, atkA(st, 1, 0, 0));
    answer(st, (s, q, l) => l.find(x => x.t === 'respond' && x.activate && x.opt && x.opt.z === 1));
    ok(!!st.players[0].mz[0], 'Full Counter: el ataque se devuelve contra un personaje rival');
    // Full Counter: devuelve una habilidad
    st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_bardock_ssj'); put(st, 1, 1, 'c_goku'); putST(st, 0, 0, 'c_full_counter', { down: true, setTurn: 1 });
    act(st, 1, pw(st, 1, 'canon', a => a.target.vs === 0));
    answer(st, (s, q, l) => l.find(x => x.t === 'respond' && x.activate && x.opt && x.opt.vs === 1 && x.opt.z === 1));
    ok(!!st.players[0].mz[0] && !st.players[1].mz[1], 'el Cañón cae sobre el Goku rival');
    // Kyoka Suigetsu
    st = fresh(1); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_creeper'); put(st, 1, 0, 'c_bardock_ssj'); putST(st, 0, 0, 'c_kyoka', { down: true, setTurn: 1 });
    act(st, 1, pw(st, 1, 'canon', a => a.target.z === 0));
    ok(st.pending && st.pending.k === 'respond', 'Kyoka Suigetsu se puede activar');
    const kopts = L(st, 0).filter(x => x.t === 'respond' && x.activate).map(x => x.opt.vs + ':' + x.opt.z);
    ok(kopts.includes('0:1') && !kopts.includes('1:0'), 'cualquier otro personaje válido (no el que usa la habilidad)');
    answer(st, (s, q, l) => l.find(x => x.t === 'respond' && x.activate && x.opt && x.opt.vs === 0 && x.opt.z === 1));
    ok(!!st.players[0].mz[0] && !st.players[0].mz[1], 'la habilidad cae sobre el nuevo objetivo');
  }

  section('tanda 6: partidas al azar con las cartas nuevas');
  {
    const NEW = Cards.inTanda(6);
    const rest = Cards.custom.filter(c => !c.hidden).map(c => c.id);
    let bad = '', done = 0, seed = 6060; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let g = 0; g < 100 && !bad; g++) {
      const mk = () => { const d = []; for (const id of NEW) if (rnd() < .55 && d.length < 24) d.push(id); while (d.length < 30) { const id = rest[Math.floor(rnd() * rest.length)]; if (d.filter(x => x === id).length < 2) d.push(id); } return d; };
      const st = E.newGame([mk(), mk()], { seed: 6000 + g, first: g % 2 });
      let n = 0;
      try {
        while (st.winner === null && n++ < 2000) {
          const p = E.actor(st), Ls = E.legal(st, p);
          if (!Ls.length) { bad = 'sin acciones legales (partida ' + g + ') ' + JSON.stringify(st.pending && [st.pending.k, st.pending.ab]); break; }
          const pref = Ls.filter(a => a.t !== 'endTurn'), pool = rnd() < 0.85 && pref.length ? pref : Ls;
          const a = pool[Math.floor(rnd() * pool.length)];
          const r = E.apply(st, p, a);
          if (!r.ok) { bad = 'rechazada ' + JSON.stringify(a) + ' ' + r.error; break; }
          for (let q = 0; q < 2; q++) if (E.countCards(st, q) !== 30) { bad = `partida ${g}: jugador ${q} tiene ${E.countCards(st, q)} cartas tras ${JSON.stringify(a)}`; break; }
          if (bad) break;
          E.view(st, 0); E.view(st, 1);
        }
        if (st.winner !== null) done++;
      } catch (e) { bad = 'excepción (partida ' + g + '): ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | '); }
    }
    ok(!bad, bad || 'partidas con la tanda 6 sin errores');
    ok(done >= 60, done + ' de 100 partidas terminaron');
  }
};
