/* Pruebas del Duelo Pokémon (motor + IA + protocolo online), sin navegador.
 *   node tools/test_duelo.js
 */
'use strict';
const path = require('path');
global.G = {};
require('../js/data/pokedex.js');
require('../js/data/types.js');
const root = path.join(__dirname, '..', 'js', 'duelo');
const Cards = require(path.join(root, 'cards.js'));
require('./legacy_catalog.js')(Cards, global.G);   // el catálogo antiguo, sólo para las pruebas
const E = require(path.join(root, 'engine.js'));
let AI = null;
try { AI = require(path.join(root, 'ai.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)})`); }
function section(t) { console.log('· ' + t); }

// ---------- ayudas ----------
const mon = (name) => Cards.monsters.find(m => m.name === name).id;
function deck30(fill) { const d = []; while (d.length < 30) d.push(fill); return d; }
function game(opts) {
  const A = Cards.presetDeck('fire'), B = Cards.presetDeck('water');
  return E.newGame([A, B], Object.assign({ seed: 7, first: 0 }, opts));
}
function give(st, p, ids) { // deja esas cartas en la mano (sacándolas del mazo si están)
  const P = st.players[p];
  P.hand = ids.map(id => ({ uid: st.nextUid++, id }));
}
function act(st, p, a) { const r = E.apply(st, p, a); if (!r.ok) throw new Error('acción rechazada: ' + JSON.stringify(a) + ' → ' + r.error); }
function find(st, p, pred) { return E.legal(st, p).find(pred); }
function nextTurn(st) { // pasa el turno del jugador actual
  const p = E.actor(st);
  const a = find(st, p, x => x.t === 'endTurn') || find(st, p, x => x.t === 'discard');
  act(st, p, a);
}

// ---------- cartas ----------
section('cartas');
ok(Cards.monsters.length === 966, '966 monstruos');
const lv = {}; for (const m of Cards.monsters) lv[m.level] = (lv[m.level] || 0) + 1;
ok(Object.keys(lv).length >= 6, 'hay variedad de niveles ' + JSON.stringify(lv));
for (const t of Cards.PRESET_TYPES) {
  const d = Cards.presetDeck(t);
  const why = Cards.checkDeck(d);
  ok(why === '', `mazo ${t}: ${why}`);
}
eq(Cards.checkDeck(['m1']), 'El mazo debe tener exactamente 30 cartas (tiene 1).', 'mazo corto');
const pika = Cards.get(mon('Pikachu')), mewtwo = Cards.get(mon('Mewtwo'));
console.log(`  Pikachu: nv${pika.level} ATK ${pika.atk} DEF ${pika.def} · Mewtwo: nv${mewtwo.level} ATK ${mewtwo.atk} DEF ${mewtwo.def}`);
ok(pika.level <= 3 && mewtwo.level >= 7, 'niveles razonables');
ok(typeof Cards.typeBonus === 'undefined', 'no hay ventajas de tipo');

// ---------- inicio ----------
section('inicio de partida');
{
  const st = game();
  eq(st.players[0].hand.length, 5, 'mano inicial 5 (primer jugador no roba en el turno 1)');
  eq(st.players[1].hand.length, 5, 'mano inicial 5 (rival)');
  eq(st.players[0].deck.length, 25, 'mazo 25');
  eq(st.turn, 1, 'turno 1');
  ok(!E.legal(st, 0).some(a => a.t === 'toBattle'), 'en el turno 1 no hay batalla');
  eq(E.legal(st, 1), [], 'el rival no puede actuar');
  const v = E.view(st, 0);
  ok(v.opp.hand.every(x => x === null), 'la mano del rival va oculta');
  ok(!('deck' in v.me), 'el mazo no se envía');
}

// ---------- invocar y tributos ----------
section('invocación y tributos');
{
  const st = game();
  const low = mon('Pikachu'), mid = mon('Charizard'), top = mon('Mewtwo');
  give(st, 0, [low, mid, top, low, low]);
  const a = E.legal(st, 0);
  ok(a.some(x => x.t === 'summon' && x.hand === 0 && x.tributes.length === 0), 'nivel bajo: sin tributo');
  ok(!a.some(x => x.t === 'summon' && x.hand === 1), 'nivel 5-6 sin monstruos propios no se puede');
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  ok(st.players[0].mz[0] && st.players[0].mz[0].pos === 'atk', 'Pikachu en ataque');
  ok(!E.legal(st, 0).some(x => x.t === 'summon' || x.t === 'set'), 'sólo una invocación por turno');
  eq(E.apply(st, 0, { t: 'summon', hand: 0, tributes: [] }).ok, false, 'rechaza la segunda invocación');
  eq(E.apply(st, 1, { t: 'endTurn' }).ok, false, 'rechaza al jugador que no es');
  nextTurn(st);                     // turno del rival
  nextTurn(st);                     // vuelve
  const b = E.legal(st, 0);
  const charizardIdx = st.players[0].hand.findIndex(c => c.id === mid);
  ok(charizardIdx >= 0, 'Charizard sigue en mano');
  const need1 = b.filter(x => x.t === 'summon' && x.hand === charizardIdx);
  ok(need1.length === 1 && need1[0].tributes.length === 1, 'Charizard (nv ' + Cards.get(mid).level + ') pide 1 tributo');
  const mewIdx = st.players[0].hand.findIndex(c => c.id === top);
  ok(!b.some(x => x.t === 'summon' && x.hand === mewIdx), 'Mewtwo pide 2 tributos: no se puede con 1 monstruo');
  act(st, 0, need1[0]);
  eq(st.players[0].mz.filter(Boolean).length, 1, 'el tributo libera la zona');
  ok(st.players[0].grave.some(c => c.id === low), 'el tributo va al cementerio');
}

// ---------- batalla y tipos ----------
section('batalla (sin ventajas de tipo)');
{
  const st = game();
  // agua (que antes perdía contra planta) con más ATK gana sin ningún bonus ni penalización
  const low = Cards.monsters.filter(m => m.level <= 4);
  const wat = low.filter(m => m.types[0] === 'water').sort((a, b) => b.atk - a.atk)[0];
  const gra = low.filter(m => m.types[0] === 'grass' && m.atk < wat.atk).sort((a, b) => b.atk - a.atk)[0];
  const char = wat.id, bulb = gra.id;
  give(st, 0, [char]); give(st, 1, [bulb]);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st);
  act(st, 1, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st);
  act(st, 0, { t: 'toBattle' });
  const atk = find(st, 0, x => x.t === 'attack');
  ok(atk && atk.target === 0, 'puede atacar al monstruo rival');
  const cc = Cards.get(char), bb = Cards.get(bulb);
  const before = st.players[1].lp;
  act(st, 0, atk);
  ok(!st.players[1].mz[0], 'el de menos ATK es destruido');
  eq(st.players[1].lp, before - (cc.atk - bb.atk), 'daño = ATK − ATK del defensor, sin bonus de tipo');
  ok(!st.log.some(l => /eficaz/.test(l.t)), 'no hay avisos de eficacia de tipo');
}
{
  // defensa y ataque directo
  const st = game();
  const wallCard = Cards.monsters.filter(m => m.level <= 4).sort((a, b) => b.def - a.def)[0];
  const wall = wallCard.id;
  give(st, 0, [mon('Pikachu')]); give(st, 1, [wall]);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st);
  act(st, 1, { t: 'set', hand: 0, tributes: [] });
  ok(st.players[1].mz[0].down, 'monstruo colocado boca abajo');
  const v0 = E.view(st, 0);
  ok(v0.opp.mz[0].down && v0.opp.mz[0].c === null, 'el rival no ve qué monstruo es');
  ok(!JSON.stringify(v0.opp).includes('"id":"' + wall + '"'), 'el id del monstruo oculto no se filtra');
  nextTurn(st);
  ok(!find(st, 1, x => x.t === 'flip'), 'sin turno propio no se puede voltear');
  act(st, 0, { t: 'toBattle' });
  const a = find(st, 0, x => x.t === 'attack');
  ok(a && a.target === 0, 'ataca al monstruo boca abajo');
  const lp0 = st.players[0].lp;
  act(st, 0, a);
  ok(!st.players[1].mz[0].down, 'el defensor se revela al ser atacado');
  ok(st.players[0].lp <= lp0, 'el ataque contra una defensa mayor no daña al rival');
}
{
  // ataque directo
  const st = game();
  give(st, 0, [mon('Pikachu')]); give(st, 1, [mon('Pikachu')]);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st); nextTurn(st);
  act(st, 0, { t: 'toBattle' });
  const a = find(st, 0, x => x.t === 'attack');
  eq(a.target, 'direct', 'sin monstruos rivales: ataque directo');
  act(st, 0, a);
  eq(st.players[1].lp, 8000 - Cards.get(mon('Pikachu')).atk, 'daño directo');
  ok(!find(st, 0, x => x.t === 'attack'), 'cada monstruo ataca una vez');
}

// ---------- magias ----------
section('magias');
{
  const st = game();
  give(st, 0, ['s_potion', 's_bag', 's_flame', 's_beam', 's_quake']);
  const a = E.legal(st, 0);
  ok(a.some(x => x.t === 'activate' && x.hand === 0), 'Poción');
  ok(!a.some(x => x.t === 'activate' && x.hand === 3), 'Hiperrayo sin objetivo no se puede');
  st.players[0].lp = 3000;
  act(st, 0, { t: 'activate', hand: 0 });
  eq(st.players[0].lp, 4000, 'Poción cura 1000');
  ok(st.players[0].grave.some(c => c.id === 's_potion'), 'la magia va al cementerio');
  const deck = st.players[0].deck.length;
  act(st, 0, { t: 'activate', hand: 0 });
  eq(st.players[0].hand.length, 3 + 2, 'Mochila roba 2 (la mano pasa de 3 a 5)');
  eq(st.players[0].deck.length, deck - 2, 'mazo −2');
  act(st, 0, { t: 'activate', hand: st.players[0].hand.findIndex(c => c.id === 's_flame') });
  eq(st.players[1].lp, 7000, 'Llamarada 1000');
}
{
  const st = game();
  give(st, 0, ['s_ball', 's_revive', 's_band', 's_twister']);
  const ball = st.players[0].deck.filter(c => Cards.get(c.id).kind === 'monster' && Cards.get(c.id).level <= 4);
  ok(ball.length > 0, 'hay candidatos para la Poké Ball');
  act(st, 0, { t: 'activate', hand: 0 });
  ok(st.pending && st.pending.k === 'pick' && st.pending.zone === 'deck', 'pide elegir del mazo');
  const v = E.view(st, 0);
  ok(v.pending.cands.length === ball.length, 'la vista da las candidatas');
  ok(E.view(st, 1).pending.cands === undefined, 'el rival no ve las candidatas');
  eq(E.legal(st, 1), [], 'el rival espera');
  const pick = E.legal(st, 0)[0];
  const handN = st.players[0].hand.length;
  act(st, 0, pick);
  eq(st.players[0].hand.length, handN + 1, 'el monstruo elegido va a la mano');
  eq(st.pending, null, 'sin pendientes');
  ok(!E.legal(st, 0).some(x => x.t === 'activate' && st.players[0].hand[x.hand] && st.players[0].hand[x.hand].id === 's_revive'), 'Revivir sin cementerio no se puede');
}
{
  // Revivir + equipo + Terremoto
  const st = game();
  const pk = mon('Pikachu');
  give(st, 0, [pk, 's_band', 's_quake', 's_revive']);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  const bandIdx = st.players[0].hand.findIndex(c => c.id === 's_band');
  act(st, 0, { t: 'activate', hand: bandIdx, target: { z: 0 } });
  const base = Cards.get(pk).atk;
  eq(E.view(st, 0).me.mz[0].atk, base + 600, 'Cinta Experto +600 ATK');
  const quakeIdx = st.players[0].hand.findIndex(c => c.id === 's_quake');
  act(st, 0, { t: 'activate', hand: quakeIdx });
  ok(!st.players[0].mz[0], 'Terremoto destruye');
  ok(st.players[0].st.every(s => !s), 'la Cinta se va con su monstruo');
  const revIdx = st.players[0].hand.findIndex(c => c.id === 's_revive');
  act(st, 0, { t: 'activate', hand: revIdx });
  ok(st.pending && st.pending.k === 'pick' && st.pending.zone === 'grave', 'Revivir pide elegir del cementerio');
  act(st, 0, E.legal(st, 0)[0]);
  ok(st.players[0].mz[0] && st.players[0].mz[0].pos === 'atk', 'revive en ataque');
}

// ---------- trampas ----------
section('trampas');
{
  const st = game();
  give(st, 0, [mon('Pikachu')]); give(st, 1, ['t_barrier', 't_counter']);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st);
  act(st, 1, { t: 'setst', hand: 0 });
  act(st, 1, { t: 'setst', hand: 0 });
  nextTurn(st);
  act(st, 0, { t: 'toBattle' });
  // la trampa se colocó el turno anterior (turno 2): ya se puede activar
  act(st, 0, find(st, 0, x => x.t === 'attack'));
  ok(st.pending && st.pending.k === 'respond' && st.pending.player === 1, 'el rival puede responder');
  eq(E.legal(st, 1).filter(x => x.activate).length, 2, 'dos trampas disponibles');
  eq(E.legal(st, 0), [], 'el atacante espera');
  act(st, 1, { t: 'respond', activate: true, zone: 1 });  // Contraataque
  ok(!st.players[0].mz[0], 'Contraataque destruye al atacante');
  eq(st.players[1].lp, 8000, 'sin daño');
  ok(st.players[1].grave.some(c => c.id === 't_counter'), 'la trampa va al cementerio');
}
{
  // una trampa no se activa el turno en que se coloca
  const st = game();
  give(st, 0, ['t_snare']); give(st, 1, [mon('Pikachu')]);
  act(st, 0, { t: 'setst', hand: 0 });
  nextTurn(st);
  act(st, 1, { t: 'summon', hand: 0, tributes: [] });
  ok(st.pending && st.pending.k === 'respond', 'Cepo puede activarse al turno siguiente');
  act(st, 0, { t: 'respond', activate: true, zone: 0 });
  ok(!st.players[1].mz[0], 'Cepo destruye al invocado');
  const st2 = game();
  give(st2, 0, ['t_snare', mon('Pikachu')]); give(st2, 1, []);
  act(st2, 0, { t: 'setst', hand: 0 });
  act(st2, 0, { t: 'summon', hand: 0, tributes: [] });
  eq(st2.pending, null, 'no responde a sus propias invocaciones');
}
{
  // Anulación contra una magia
  const st = game();
  give(st, 0, ['t_negate']); give(st, 1, ['s_flame']);
  act(st, 0, { t: 'setst', hand: 0 });
  nextTurn(st);
  act(st, 1, { t: 'activate', hand: 0 });
  ok(st.pending && st.pending.trigger === 'spell', 'respuesta a una magia');
  act(st, 0, { t: 'respond', activate: true, zone: 0 });
  eq(st.players[0].lp, 8000, 'Llamarada anulada');
  ok(st.players[1].grave.some(c => c.id === 's_flame'), 'la magia anulada va al cementerio');
}
{
  // pasar sin activar
  const st = game();
  give(st, 0, [mon('Pikachu')]); give(st, 1, ['t_barrier']);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st);
  act(st, 1, { t: 'setst', hand: 0 });
  nextTurn(st); act(st, 0, { t: 'toBattle' });
  act(st, 0, find(st, 0, x => x.t === 'attack'));
  act(st, 1, { t: 'respond', activate: false });
  eq(st.players[1].lp, 8000 - Cards.get(mon('Pikachu')).atk, 'si no responde, el ataque sigue');
  ok(st.players[1].st[0] && st.players[1].st[0].down, 'la trampa sigue boca abajo');
}

// ---------- Popeye (habilidad «¡A comer espinaca!») ----------
section('tablero 3+3 y catálogo');
{
  const st = game();
  ok(st.players[0].mz.length === 3 && st.players[0].st.length === 3, 'el tablero tiene 3 zonas de monstruo y 3 de magia/trampa');
  ok(E.ZONES === 3, 'ZONES = 3');
  ok(typeof Cards.canPlay === 'function', 'Cards.canPlay existe');
  // el catálogo de producción (sin el legado de pruebas) sólo tiene las cartas propias
  ok(Cards.custom.length === 20 && Cards.custom.some(c => c.id === 'c_popeye') && Cards.custom.some(c => c.id === 'c_creeper'), 'las cartas propias son 20 (con Popeye y Creeper)');
  const v = E.view(st, 0);
  ok(typeof v.opp.handCount === 'number' && v.opp.handCount === 5, 'la vista dice cuántas cartas tiene el rival en la mano');
}
section('Popeye');
{
  const P = Cards.get('c_popeye');
  ok(P && P.name === 'Popeye El Marinero' && P.level === 4 && P.atk === 1200 && P.def === 1200 && P.type === 'popeye', 'carta Popeye: 4★ 1200/1200 tipo Popeye');
  ok(P.img && Cards.all().some(c => c.id === 'c_popeye') && !Cards.monsters.some(c => c.id === 'c_popeye'), 'Popeye está en el catálogo pero no en los mazos de estreno');
  ok(Cards.TYPE_ES.popeye === 'Popeye', 'el tipo Popeye tiene nombre');
  eq(Cards.checkDeck(Cards.presetDeck('fire').slice(0, 28).concat(['c_popeye', 'c_popeye'])), '', 'se puede meter en un mazo (2 copias)');
  const total = st => st.players.reduce((n, _, p) => n + E.countCards(st, p), 0);
  // p1 destruye a Popeye con Hiperrayo en su turno 2
  const setup = () => {
    const st = game();
    give(st, 0, ['c_popeye']); give(st, 1, ['s_beam']);
    act(st, 0, { t: 'summon', hand: 0, tributes: [] });
    nextTurn(st);
    return st;
  };
  const beam = st => { const a = find(st, 1, x => x.t === 'activate'); act(st, 1, a); };
  {
    const st = setup(), n0 = total(st);
    beam(st);
    ok(st.pending && st.pending.k === 'ability' && st.pending.player === 0 && E.actor(st) === 0, 'al ser destruido por un efecto se le ofrece la habilidad a su dueño');
    ok(st.players[0].grave.some(c => c.id === 'c_popeye'), 'mientras decide, Popeye está en el cementerio');
    const v1 = E.view(st, 1);
    ok(v1.pending && v1.pending.k === 'ability' && !v1.pending.card, 'el rival ve que hay una pregunta pero no los datos');
    act(st, 0, { t: 'ability', use: true });
    ok(st.pending && st.pending.stage === 'pos', 'luego elige la posición');
    ok(!E.legal(st, 1).length, 'nadie más puede actuar mientras elige');
    act(st, 0, { t: 'ability', pos: 'def' });
    const m = st.players[0].mz[0];
    ok(!st.pending && m && m.pos === 'def' && !m.down, 'revive boca arriba en la posición elegida');
    const v = E.view(st, 0).me.mz[0];
    ok(v.atk === 1500 && v.def === 1500, 'revive con 1500/1500');
    ok(st.players[0].lp === 8000 && st.players[1].lp === 8000 - 1000, 'el Hiperrayo costó 1000 PV al que lo usó (no cambia)');
    eq(total(st), n0, 'no se pierde ni se duplica ninguna carta');
    ok(!st.players[0].grave.some(c => c.id === 'c_popeye'), 'sale del cementerio');
    ok(st.players[1].normalUsed === false, 'no consume la invocación normal de nadie');
    // segunda destrucción: ya no se puede
    give(st, 1, ['s_beam']);
    nextTurn(st); nextTurn(st);   // vuelve a p1 (turno 4)
    ok(E.actor(st) === 1, 'turno del rival');
    st.players[1].lp = 8000;
    beam(st);
    ok(!st.pending && st.players[0].grave.some(c => c.id === 'c_popeye') && !st.players[0].mz[0], 'sólo una vez: la segunda destrucción lo deja en el cementerio');
    eq(total(st), n0, 'cartas íntegras tras la segunda destrucción');
  }
  {
    // el revivido no puede atacar ese turno
    const st = setup();
    beam(st);
    act(st, 0, { t: 'ability', use: true }); act(st, 0, { t: 'ability', pos: 'atk' });
    ok(st.players[0].mz[0].attacked === true, 'marcado como que ya atacó este turno');
    nextTurn(st); // p1 termina turno
    ok(E.actor(st) === 0 && !find(st, 0, x => x.t === 'attack'), 'sin ataques de Popeye antes de que acabe el turno de revivir');
  }
  {
    // rechazar pierde la oportunidad
    const st = setup(), n0 = total(st);
    beam(st);
    act(st, 0, { t: 'ability', use: false });
    ok(!st.pending && !st.players[0].mz[0] && st.players[0].grave.some(c => c.id === 'c_popeye'), 'si rechaza, se queda en el cementerio');
    eq(total(st), n0, 'cartas íntegras tras rechazar');
    nextTurn(st); nextTurn(st);
    ok(E.actor(st) === 1 && !st.pending, 'la partida sigue con normalidad');
  }
  {
    // en combate
    const st = game();
    const strong = Cards.monsters.filter(m => m.level <= 4).sort((a, b) => b.atk - a.atk)[0];
    give(st, 0, ['c_popeye']); give(st, 1, [strong.id]);
    act(st, 0, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st);
    act(st, 1, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st);
    nextTurn(st);
    act(st, 1, { t: 'toBattle' });
    const a = find(st, 1, x => x.t === 'attack' && x.target === 0);
    ok(!!a, 'el rival puede atacar a Popeye');
    act(st, 1, a);
    ok(st.pending && st.pending.k === 'ability' && st.pending.player === 0, 'destruido en combate: se ofrece la habilidad');
    act(st, 0, { t: 'ability', use: true }); act(st, 0, { t: 'ability', pos: 'atk' });
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_popeye', 'revive tras el combate');
    ok(E.actor(st) === 1 && !st.pending, 'el turno sigue siendo del atacante');
  }
  {
    // reinicio: invocarlo desde la mano o revivirlo con otra carta
    const st = game();
    give(st, 0, ['c_popeye']); st.players[0].hand[0].spent = true;
    act(st, 0, { t: 'summon', hand: 0, tributes: [] });
    ok(!st.players[0].mz[0].c.spent, 'invocado desde la mano: la habilidad vuelve a estar disponible');
    const st2 = game();
    give(st2, 0, ['c_popeye']); give(st2, 1, ['s_beam']);
    act(st2, 0, { t: 'set', hand: 0, tributes: [] }); nextTurn(st2);
    ok(st2.players[0].mz[0].down && !st2.players[0].mz[0].c.spent, 'colocado boca abajo también la deja disponible');
    // revivir con la magia Revivir reinicia
    const st3 = game();
    const c = { uid: st3.nextUid++, id: 'c_popeye', spent: true };
    st3.players[0].grave.push(c);
    give(st3, 0, ['s_revive']);
    act(st3, 0, find(st3, 0, x => x.t === 'activate'));
    act(st3, 0, { t: 'pick', uid: c.uid });
    ok(st3.players[0].mz[0].c.id === 'c_popeye' && !st3.players[0].mz[0].c.spent && !st3.players[0].mz[0].base, 'Revivir lo trae con 1200/1200 y la habilidad disponible');
  }
  {
    // Terremoto con dos Popeye (uno de cada lado) y varios monstruos: todos pueden volver, sin bucles
    const st = game();
    give(st, 0, ['c_popeye', 's_quake']); give(st, 1, ['c_popeye']);
    act(st, 0, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st);
    act(st, 1, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st);
    const n0 = total(st);
    act(st, 0, find(st, 0, x => x.t === 'activate'));
    ok(st.pending && st.pending.player === 0, 'primero decide el que activó la magia');
    act(st, 0, { t: 'ability', use: true }); act(st, 0, { t: 'ability', pos: 'atk' });
    ok(st.pending && st.pending.player === 1, 'luego decide el otro dueño');
    act(st, 1, { t: 'ability', use: true }); act(st, 1, { t: 'ability', pos: 'def' });
    ok(!st.pending && st.players[0].mz[0] && st.players[1].mz[0], 'los dos vuelven');
    eq(total(st), n0, 'cartas íntegras');
  }
  if (AI) {
    const st = setup();
    beam(st);
    const bot = AI.create('normal', 3);
    act(st, 0, bot.choose(st, 0));
    act(st, 0, bot.choose(st, 0));
    ok(!st.pending && st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_popeye', 'la computadora la activa sola');
  }
}

// ---------- Creeper (habilidad «Explosión del Creeper») ----------
section('Creeper');
{
  const Cr = Cards.get('c_creeper');
  ok(Cr && Cr.name === 'Creeper' && Cr.level === 3 && Cr.atk === 1000 && Cr.def === 1000 && Cr.type === 'minecraft', 'carta Creeper: 3★ 1000/1000 tipo Minecraft');
  ok(Cards.TYPE_ES.minecraft === 'Minecraft', 'el tipo Minecraft tiene nombre');
  const total = st => st.players.reduce((n, _, p) => n + E.countCards(st, p), 0);
  const low = Cards.monsters.filter(m => m.level <= 4);
  const strong = low.slice().sort((a, b) => b.atk - a.atk)[0], weak = low.filter(m => m.atk < 900 && m.def < 900)[0];
  const wall = low.slice().sort((a, b) => b.def - a.def)[0];
  // p0 invoca a Creeper (turno 1), p1 pone a X (turno 2) en la posición indicada; vuelve p0 (turno 3)
  const setup = (xid, how) => {
    const st = game();
    give(st, 0, ['c_creeper']); give(st, 1, [xid]);
    act(st, 0, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st);
    act(st, 1, { t: how || 'summon', hand: 0, tributes: [] }); nextTurn(st);
    return st;
  };
  const gr = (st, p) => st.players[p].grave.map(c => c.id), bn = (st, p) => st.players[p].banish.map(c => c.id);
  {
    // Creeper ataca a uno más fuerte: el daño es el normal (pierde la diferencia) y los dos son desterrados
    const st = setup(strong.id), n0 = total(st), lp0 = st.players[0].lp;
    act(st, 0, { t: 'toBattle' });
    act(st, 0, find(st, 0, x => x.t === 'attack' && x.target === 0));
    eq(st.players[0].lp, lp0 - (strong.atk - 1000), 'ataca a uno más fuerte: pierde la diferencia de ATK');
    ok(!st.players[0].mz[0] && !st.players[1].mz[0], 'los dos salen del campo');
    eq(bn(st, 0), ['c_creeper'], 'Creeper queda desterrado');
    eq(bn(st, 1), [strong.id], 'el rival queda desterrado');
    ok(!gr(st, 0).includes('c_creeper') && !gr(st, 1).includes(strong.id), 'no pasan por el cementerio');
    ok(st.log.some(l => /Creeper explota/.test(l.t)), 'queda registrado en el log');
    eq(total(st), n0, 'ninguna carta se pierde ni se duplica');
    ok(E.view(st, 1).players[0].banish.length === 1, 'la vista incluye la zona de destierro');
  }
  {
    // Creeper ataca a uno más débil: el rival pierde la diferencia
    const st = setup(weak.id), lp1 = st.players[1].lp;
    act(st, 0, { t: 'toBattle' });
    act(st, 0, find(st, 0, x => x.t === 'attack' && x.target === 0));
    eq(st.players[1].lp, lp1 - (1000 - weak.atk), 'ataca a uno más débil: el rival pierde la diferencia');
    eq(bn(st, 1), [weak.id], 'aunque ganara el combate, los dos se destierran');
  }
  {
    // Creeper en defensa es atacado por uno más fuerte: sin daño (regla normal), y los dos desterrados
    const st = game();
    give(st, 0, ['c_creeper']); give(st, 1, [strong.id]);
    act(st, 0, { t: 'set', hand: 0, tributes: [] }); nextTurn(st);
    act(st, 1, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st); nextTurn(st);
    const lp = st.players.map(P => P.lp);
    act(st, 1, { t: 'toBattle' });
    act(st, 1, find(st, 1, x => x.t === 'attack' && x.target === 0));
    eq(st.players.map(P => P.lp), lp, 'atacado en defensa por uno más fuerte: sin daño por diferencia');
    ok(bn(st, 0).includes('c_creeper') && bn(st, 1).includes(strong.id), 'los dos desterrados (Creeper estaba boca abajo)');
  }
  {
    // atacado en defensa por uno MÁS DÉBIL que su DEF: el atacante sufre la diferencia (rebote normal)
    const st = game();
    give(st, 0, ['c_creeper']); give(st, 1, [weak.id]);
    act(st, 0, { t: 'set', hand: 0, tributes: [] }); nextTurn(st);
    act(st, 1, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st); nextTurn(st);
    const lp1 = st.players[1].lp;
    act(st, 1, { t: 'toBattle' });
    act(st, 1, find(st, 1, x => x.t === 'attack' && x.target === 0));
    eq(st.players[1].lp, lp1 - (1000 - weak.atk), 'el atacante pierde DEF − ATK');
    ok(bn(st, 0).includes('c_creeper') && bn(st, 1).includes(weak.id), 'y los dos se destierran');
  }
  {
    // ataque directo: la habilidad no se activa
    const st = game();
    give(st, 0, ['c_creeper']); give(st, 1, [weak.id]);
    act(st, 0, { t: 'summon', hand: 0, tributes: [] }); nextTurn(st); nextTurn(st);
    act(st, 0, { t: 'toBattle' });
    const d = find(st, 0, x => x.t === 'attack' && x.target === 'direct');
    ok(!!d, 'sin monstruos rivales, puede atacar directo');
    act(st, 0, d);
    ok(st.players[0].mz[0] && !st.players[0].banish.length, 'un ataque directo no activa la explosión');
    eq(st.players[1].lp, 8000 - 1000, 'el daño directo es normal');
  }
  {
    // contra Popeye: queda desterrado, no va al cementerio y no hay espinaca
    const st = setup('c_popeye');
    act(st, 0, { t: 'toBattle' });
    act(st, 0, find(st, 0, x => x.t === 'attack' && x.target === 0));
    ok(!st.pending && bn(st, 1).includes('c_popeye') && !gr(st, 1).includes('c_popeye'), 'Popeye desterrado: sin habilidad de cementerio');
  }
  if (AI) {
    let boomGames = 0, ended2 = 0;
    for (let g = 0; g < 80; g++) {
      const rng = mulberry(9000 + g);
      const mk = t => { const d = Cards.presetDeck(t).slice(); d[0] = 'c_creeper'; d[1] = 'c_creeper'; d[2] = 'c_popeye'; return d; };
      const st = E.newGame([mk(Cards.PRESET_TYPES[g % Cards.PRESET_TYPES.length]), mk(Cards.PRESET_TYPES[(g * 3 + 1) % Cards.PRESET_TYPES.length])], { seed: 1300 + g });
      let steps = 0;
      try {
        while (st.winner === null && steps++ < 4000) { const p = E.actor(st); act(st, p, randomBot(st, p, rng)); if (steps % 5 === 0) checkInvariants(st, `Creeper partida ${g}`); }
        checkInvariants(st, `Creeper partida ${g} final`);
      } catch (e) { ok(false, e.message); break; }
      if (st.winner !== null) ended2++;
      if (st.log.some(l => /explota/.test(l.t))) boomGames++;
    }
    ok(ended2 === 80, 'las partidas con Creeper y Popeye terminan');
    console.log(`  80 partidas con Creeper · explosión en ${boomGames}`);
  }
}

// ---------- fin de turno y victoria ----------
section('fin de turno y victoria');
{
  const st = game();
  give(st, 0, Array.from({ length: 9 }, () => mon('Pikachu')));
  act(st, 0, { t: 'endTurn' });
  ok(st.pending && st.pending.k === 'discard' && E.view(st, 0).pending.excess === 2, 'hay que descartar hasta 7');
  act(st, 0, { t: 'discard', hand: 0 });
  eq(st.current, 0, 'aún es su turno');
  act(st, 0, { t: 'discard', hand: 0 });
  eq(st.current, 1, 'pasa el turno al llegar a 7');
}
{
  const st = game();
  st.players[1].lp = 500;
  give(st, 0, [mon('Pikachu')]); give(st, 1, []);
  act(st, 0, { t: 'summon', hand: 0, tributes: [] });
  nextTurn(st); nextTurn(st);
  act(st, 0, { t: 'toBattle' });
  act(st, 0, find(st, 0, x => x.t === 'attack'));
  eq(st.winner, 0, 'gana quien deja al rival sin PV');
  eq(E.legal(st, 0), [], 'sin acciones al terminar');
}
{
  const st = game();
  st.players[1].deck = [];
  nextTurn(st);
  eq(st.winner, 0, 'quien no puede robar pierde');
}

// ---------- partidas al azar: invariantes ----------
section('partidas al azar (invariantes)');
function randomBot(st, p, rng) {
  const l = E.legal(st, p);
  const nonEnd = l.filter(a => a.t !== 'endTurn' && a.t !== 'toBattle');
  const end = l.filter(a => a.t === 'endTurn' || a.t === 'toBattle');
  if (nonEnd.length && (rng() < 0.75 || !end.length)) return nonEnd[Math.floor(rng() * nonEnd.length)];
  return end.length ? end[Math.floor(rng() * end.length)] : l[Math.floor(rng() * l.length)];
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function checkInvariants(st, tag) {
  for (let p = 0; p < 2; p++) {
    if (E.countCards(st, p) !== 30) throw new Error(`${tag}: el jugador ${p} tiene ${E.countCards(st, p)} cartas`);
    if (st.players[p].lp < 0) throw new Error(tag + ': PV negativos');
    if (st.players[p].hand.length > 12) throw new Error(tag + ': mano enorme');
  }
  // la vista no filtra información oculta
  for (let seat = 0; seat < 2; seat++) {
    const v = JSON.stringify(E.view(st, seat));
    const O = st.players[1 - seat];
    const spec = !st.players[seat].alive && st.winner === null;   // el eliminado mira como espectador: ve manos y cartas boca abajo, pero no los mazos
    const hidden = (spec ? [] : O.hand.map(c => c.uid)).concat(O.deck.map(c => c.uid));
    if (!spec) { for (const s of O.mz) if (s && s.down) hidden.push(s.c.uid); for (const s of O.st) if (s && s.down) hidden.push(s.c.uid); }
    for (const u of hidden) if (v.includes(`"uid":${u},`) || v.includes(`"uid":${u}}`)) {
      // las candidatas de un 'pick' del propio jugador son suyas, no del rival: aquí sólo miramos al rival
      throw new Error(`${tag}: la vista del asiento ${seat} filtra la carta ${u}`);
    }
  }
}
let ended = 0, turns = 0, draws = 0, wins = [0, 0];
const types = Cards.PRESET_TYPES;
for (let g = 0; g < 120; g++) {
  const rng = mulberry(1000 + g);
  const st = E.newGame([Cards.presetDeck(types[g % types.length]), Cards.presetDeck(types[(g * 7 + 3) % types.length])], { seed: 500 + g });
  let steps = 0;
  try {
    while (st.winner === null && steps++ < 4000) {
      const p = E.actor(st);
      const a = randomBot(st, p, rng);
      act(st, p, a);
      if (steps % 5 === 0) checkInvariants(st, `partida ${g} paso ${steps}`);
    }
    checkInvariants(st, `partida ${g} final`);
  } catch (e) { ok(false, e.message); break; }
  if (st.winner !== null) { ended++; turns += st.turn; if (st.winner === 'draw') draws++; else wins[st.winner]++; }
  else ok(false, `partida ${g} no termina`);
}
ok(ended === 120, 'todas las partidas terminan');
console.log(`  ${ended} partidas · ${(turns / Math.max(1, ended)).toFixed(1)} turnos de media · victorias ${wins} · empates ${draws}`);

// partidas al azar con Popeye en los dos mazos (2 copias cada uno): nada se pierde ni se duplica y no hay bucles
{
  let usedSpinach = 0, endedP = 0;
  for (let g = 0; g < 80; g++) {
    const rng = mulberry(7000 + g);
    const mk = t => { const d = Cards.presetDeck(t).slice(); d[0] = 'c_popeye'; d[1] = 'c_popeye'; d[28] = 's_beam'; d[29] = 's_quake'; return d; };
    const st = E.newGame([mk(types[g % types.length]), mk(types[(g * 5 + 2) % types.length])], { seed: 900 + g });
    let steps = 0;
    try {
      while (st.winner === null && steps++ < 4000) {
        const p = E.actor(st);
        act(st, p, randomBot(st, p, rng));
        if (steps % 5 === 0) checkInvariants(st, `Popeye partida ${g} paso ${steps}`);
      }
      checkInvariants(st, `Popeye partida ${g} final`);
    } catch (e) { ok(false, e.message); break; }
    if (st.winner !== null) endedP++;
    if (st.log.some(l => /come espinaca/.test(l.t))) usedSpinach++;
  }
  ok(endedP === 80, 'las partidas con Popeye terminan');
  console.log(`  80 partidas con Popeye · espinaca usada en ${usedSpinach}`);
}

// ---------- IA ----------
if (AI) {
  section('IA');
  function playAI(seed, lvlA, lvlB, maxSteps) {
    const st = E.newGame([Cards.presetDeck(types[seed % types.length]), Cards.presetDeck(types[(seed * 5 + 1) % types.length])], { seed });
    const ais = [AI.create(lvlA, seed), AI.create(lvlB, seed + 1)];
    let steps = 0;
    while (st.winner === null && steps++ < maxSteps) {
      const p = E.actor(st);
      const a = ais[p].choose(st, p);
      const r = E.apply(st, p, a);
      if (!r.ok) throw new Error('la IA eligió una acción ilegal: ' + JSON.stringify(a));
      if (steps % 7 === 0) checkInvariants(st, 'IA partida ' + seed + ' paso ' + steps);
    }
    checkInvariants(st, 'IA final ' + seed);
    return st;
  }
  const res = { easy: 0, normal: 0, draw: 0, open: 0 };
  let t0 = Date.now();
  for (let g = 0; g < 80; g++) {
    const flip = g % 2;  // alternar quién empieza y qué nivel va en cada asiento
    const st = playAI(g, flip ? 'normal' : 'easy', flip ? 'easy' : 'normal', 6000);
    if (st.winner === null) res.open++;
    else if (st.winner === 'draw') res.draw++;
    else { const lvl = (st.winner === 0) === !flip ? 'easy' : 'normal'; res[lvl]++; }
  }
  console.log(`  80 partidas IA (${Date.now() - t0} ms): normal ${res.normal} · fácil ${res.easy} · empates ${res.draw} · sin terminar ${res.open}`);
  ok(res.open === 0, 'las partidas de la IA terminan');
  ok(res.normal > res.easy, 'la IA normal gana más que la fácil');
}

// ---------- partida: contra la IA y online por canal simulado ----------
let Match = null;
try { Match = require(path.join(root, 'match.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(cond, ms) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) return false; await sleep(2); } return true; }

async function matchTests() {
  section('partida local contra la IA');
  {
    const m = Match.local({ deck: Cards.presetDeck('fire'), aiDeck: Cards.presetDeck('grass'), aiLevel: 'normal', delay: 0, seed: 11 });
    let v = null; m.onView(x => { v = x; });
    m.start();
    const bot = AI.create('normal', 99);
    let steps = 0;
    while (steps++ < 3000 && !(v && v.winner !== null)) {
      if (v && v.actor === 0) { const r = m.act(bot.chooseView(v)); if (!r.ok) { ok(false, 'acción rechazada en local'); break; } }
      else await sleep(1);
    }
    ok(v && v.winner !== null, 'la partida local termina');
    ok(v.opp.hand.every(x => x === null), 'la vista local no enseña la mano de la IA');
    m.close();
  }

  section('online: anfitrión + invitado');
  for (const latency of [0, 8]) {
    const [tH, tG] = Match.memoryPair(latency);
    const h = Match.host({ deck: Cards.presetDeck('water'), name: 'Axel', transport: tH, seed: 21, cos: { hc: 'hc_oro', ha: 'ha_fuego' }, rk: 640 });
    const g = Match.guest({ deck: Cards.presetDeck('electric'), name: 'Amigo', transport: tG, helloMs: 20, cos: { hc: 'hc_violeta', cb: 'x'.repeat(50), zz: 'hack' }, rk: 99999 });
    const vh = [], vg = [];
    let hv = null, gv = null; h.onView(x => { hv = x; vh.push(x); }); g.onView(x => { gv = x; vg.push(x); });
    const status = []; h.onStatus(s => status.push(s.k)); g.onStatus(s => status.push('g:' + s.k));
    h.start(); g.start();
    ok(await until(() => hv && gv, 2000), `[${latency}ms] los dos reciben su vista inicial`);
    ok(h.names[1] === 'Amigo' && g.names[0] === 'Axel', 'los apodos llegan');
    ok(gv.seat === 1 && hv.seat === 0, 'asientos');
    eq(g.rk, [640, 5000], 'los PC de ranking llegan a los dos lados (con tope de 5000)'); eq(g.hum, [true, true], 'se sabe quién es humano');
    eq(g.cos[0], { hc: 'hc_oro', ha: 'ha_fuego' }, 'el invitado recibe los cosméticos del anfitrión'); eq(h.cos[1], { hc: 'hc_violeta' }, 'el anfitrión recibe los del invitado (lo raro se descarta)'); eq(g.cos[1], { hc: 'hc_violeta' }, 'y el invitado ve los suyos en la lista común');
    const bots = [AI.create('normal', 5), AI.create('normal', 6)];
    let guard = 0, illegalSent = false;
    while (guard++ < 60000 && !(hv.winner !== null && gv.winner !== null)) {
      if (hv.actor === 0 && hv.winner === null) { const a = bots[0].chooseView(hv); const r = h.act(a); ok(r.ok, 'anfitrión: acción aceptada'); }
      else if (gv.actor === 1 && gv.winner === null) {
        if (!illegalSent && gv.turn > 3) { illegalSent = true; g.act({ t: 'summon', hand: 99, tributes: [] }); }   // trampa: debe rechazarse
        const before = gv; g.act(bots[1].chooseView(gv));
        await until(() => gv !== before, 500);
      }
      else await sleep(1);
    }
    ok(hv.winner !== null && hv.winner === gv.winner, `[${latency}ms] los dos ven el mismo ganador (${hv.winner})`);
    ok(status.includes('started') && status.includes('g:started'), 'estado: partida empezada');
    ok(status.includes('g:err'), 'una acción ilegal del invitado se rechaza y avisa');
    // el invitado nunca vio la mano del anfitrión
    ok(vg.every(v => v.opp.hand.every(x => x === null)), 'el invitado no ve la mano del anfitrión');
    ok(vh.every(v => v.opp.hand.every(x => x === null)), 'el anfitrión no ve la mano del invitado');
    h.close(); g.close();
  }
  {
    // mazo inválido y desconexión
    const [tH, tG] = Match.memoryPair(0);
    const h = Match.host({ deck: Cards.presetDeck('fire'), transport: tH });
    const g = Match.guest({ deck: ['m1', 'm1', 'm1'], transport: tG, helloMs: 20 });
    const st = []; g.onStatus(s => st.push(s.k)); h.onStatus(s => st.push('h:' + s.k));
    h.start(); g.start();
    ok(await until(() => st.includes('rejected'), 1000), 'un mazo inválido se rechaza');
    h.close(); g.close();
  }
  {
    const [tH, tG] = Match.memoryPair(0);
    const h = Match.host({ deck: Cards.presetDeck('fire'), transport: tH, seed: 4 });
    const g = Match.guest({ deck: Cards.presetDeck('ice'), transport: tG, helloMs: 20 });
    let hv = null; h.onView(x => { hv = x; });
    h.start(); g.start();
    await until(() => hv, 1000);
    tG.close();       // el invitado se va
    ok(await until(() => hv.winner === 0, 1000), 'si el invitado se desconecta, el anfitrión gana');
    h.close(); g.close();
  }
}


// ---------- 3 y 4 jugadores ----------
function checkMulti(st, tag) {
  for (let p = 0; p < st.n; p++) {
    if (E.countCards(st, p) !== 30) throw new Error(`${tag}: el jugador ${p} tiene ${E.countCards(st, p)} cartas`);
    const P = st.players[p];
    if (P.lp < 0) throw new Error(tag + ': PV negativos');
    if (!P.alive && (P.hand.length || P.mz.some(Boolean) || P.st.some(Boolean))) throw new Error(`${tag}: el eliminado ${p} conserva cartas`);
    if (P.alive && P.lp <= 0) throw new Error(`${tag}: ${p} con 0 PV sigue vivo`);
  }
  if (st.winner === null && !st.players[st.current].alive) throw new Error(tag + ': le toca a un eliminado');
  if (st.winner === null && E.actor(st) >= 0 && !st.players[E.actor(st)].alive) throw new Error(tag + ': actúa un eliminado');
  // ninguna vista enseña lo oculto de los demás
  for (let seat = 0; seat < st.n; seat++) {
    const v = JSON.stringify(E.view(st, seat));
    for (let q = 0; q < st.n; q++) {
      if (q === seat) continue;
      const O = st.players[q];
      const spec = !st.players[seat].alive && st.winner === null;
      const hidden = (spec ? [] : O.hand.map(c => c.uid)).concat(O.deck.map(c => c.uid));
      if (!spec) { for (const s of O.mz) if (s && s.down) hidden.push(s.c.uid); for (const s of O.st) if (s && s.down) hidden.push(s.c.uid); }
      for (const u of hidden) if (v.includes(`"uid":${u},`) || v.includes(`"uid":${u}}`)) throw new Error(`${tag}: la vista del asiento ${seat} filtra la carta ${u} de ${q}`);
    }
  }
}
function multiGame(n, mode, seed, opts) {
  const decks = []; for (let i = 0; i < n; i++) decks.push(Cards.presetDeck(types[(seed + i * 3) % types.length]));
  return E.newGame(decks, Object.assign({ seed, mode, first: 0 }, opts));
}

async function multiTests() {
  section('3 y 4 jugadores: reglas');
  {
    const st = multiGame(4, 'ffa', 3);
    eq([st.n, st.mode, st.team], [4, 'ffa', [0, 1, 2, 3]], 'todos contra todos: cada uno su equipo');
    ok(E.view(st, 2).players.length === 4 && E.view(st, 2).me.seat === 2, 'la vista trae a los 4 jugadores');
    ok(!E.view(st, 0).players[1].hand.some(Boolean), 'la mano ajena va oculta');
    const t = multiGame(4, 'teams', 3);
    eq(t.team, [0, 1, 0, 1], '2 contra 2: equipos 0-2 y 1-3');
    eq(multiGame(3, 'teams', 3).mode, 'ffa', 'con 3 no hay equipos');
    eq(multiGame(2, 'teams', 3).mode, 'duel', 'con 2 es un duelo');
    let threw = false; try { E.newGame([Cards.presetDeck('fire')], {}); } catch (e) { threw = true; }
    ok(threw, 'una persona sola no es un duelo');
  }
  {
    // primera ronda sin ataques; orden de turnos
    const st = multiGame(3, 'ffa', 5);
    const mons = [mon('Pikachu'), mon('Pikachu'), mon('Pikachu'), mon('Pikachu'), mon('Pikachu')];
    const order = [];
    for (let i = 0; i < 3; i++) {
      const p = E.actor(st); order.push(p);
      give(st, p, mons);
      act(st, p, find(st, p, x => x.t === 'summon'));
      ok(!find(st, p, x => x.t === 'toBattle'), `ronda 1, asiento ${p}: sin combate`);
      act(st, p, find(st, p, x => x.t === 'endTurn'));
    }
    eq(order, [0, 1, 2], 'turnos en orden de asiento');
    eq(E.actor(st), 0, 'vuelve al primero');
    ok(!!find(st, 0, x => x.t === 'toBattle'), 'ronda 2: ya hay combate');
  }
  {
    // objetivos: todos los rivales; directo sólo contra quien no tiene monstruos
    const st = multiGame(3, 'ffa', 6);
    const big = mon('Mewtwo'), low = mon('Pikachu');
    for (const p of [0, 1, 2]) { give(st, p, [low, low, low, low, low]); }
    st.turn = 5;
    const place = (p, z, id, pos) => { st.players[p].mz[z] = { c: { uid: st.nextUid++, id }, pos: pos || 'atk', down: false, summonedTurn: 1, attacked: false, moved: false, atkMod: 0 }; };
    place(0, 0, big); place(1, 0, low); // el asiento 2 sin monstruos
    st.current = 0; st.phase = 'battle';
    const at = E.legal(st, 0).filter(a => a.t === 'attack');
    ok(at.some(a => a.vs === 1 && a.target === 0), 'puede atacar el monstruo del asiento 1');
    ok(at.some(a => a.vs === 2 && a.target === 'direct'), 'ataque directo al asiento 2, que no tiene monstruos');
    ok(!at.some(a => a.vs === 1 && a.target === 'direct'), 'no directo contra quien sí tiene monstruos');
    const lp2 = st.players[2].lp;
    act(st, 0, at.find(a => a.vs === 2 && a.target === 'direct'));
    eq(st.players[2].lp, lp2 - E.view(st, 0).me.mz[0].atk, 'el daño directo lo recibe el atacado');
    ok(!E.legal(st, 0).some(a => a.t === 'attack' && a.zone === 0), 'cada monstruo ataca una vez');
  }
  {
    // 2 contra 2: no se ataca ni se apunta al compañero
    const st = multiGame(4, 'teams', 7);
    st.turn = 9; st.current = 0; st.phase = 'battle';
    const mk = (p, z, id) => { st.players[p].mz[z] = { c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 1, attacked: false, moved: false, atkMod: 0 }; };
    for (const p of [0, 1, 2, 3]) mk(p, 0, mon('Charizard'));
    const at = E.legal(st, 0).filter(a => a.t === 'attack');
    ok(at.length > 0 && at.every(a => a.vs === 1 || a.vs === 3), 'sólo se ataca a los rivales (1 y 3), nunca al compañero (2)');
    eq(E.foes(st, 0), [1, 3], 'rivales del asiento 0');
    eq(E.foes(st, 1), [2, 0], 'rivales del asiento 1: 2 y 0, por orden de turno');
  }
  {
    // magias con varios rivales
    const st = multiGame(3, 'ffa', 8);
    st.turn = 5; st.current = 0;
    const burn = Cards.all().find(c => c.fx === 'burn').id;
    st.players[0].hand = [{ uid: st.nextUid++, id: burn }];
    const acts = E.legal(st, 0).filter(a => a.t === 'activate');
    eq(acts.map(a => a.target.vs).sort(), [1, 2], 'daño directo: se elige a quién');
    const d = Cards.get(burn);
    const before = [st.players[1].lp, st.players[2].lp];
    act(st, 0, acts.find(a => a.target.vs === 2));
    eq([st.players[1].lp, st.players[2].lp], [before[0], before[1] - d.n], 'el daño va sólo al elegido');
  }
  {
    // eliminación: sus cosas van al cementerio, se salta su turno y gana el último
    const st = multiGame(3, 'ffa', 9);
    st.turn = 5; st.current = 0; st.phase = 'battle';
    const mk = (p, z, id) => { st.players[p].mz[z] = { c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 1, attacked: false, moved: false, atkMod: 0 }; };
    mk(0, 0, mon('Mewtwo')); mk(1, 0, mon('Pikachu'));
    st.players[1].lp = 100;
    act(st, 0, find(st, 0, a => a.t === 'attack' && a.vs === 1));
    ok(!st.players[1].alive, 'el asiento 1 cae con 0 PV');
    ok(st.winner === null, 'quedan dos: sigue el duelo');
    eq(st.rank, [1], 'orden de caídas');
    ok(st.players[1].hand.length === 0 && st.players[1].mz.every(x => !x), 'su mano y su campo se van');
    eq(E.countCards(st, 1), 31, 'ninguna carta se pierde (30 + la que puse a mano)');
    ok(st.players[1].grave.length >= 6, 'su mano y su monstruo están en el cementerio');
    act(st, 0, find(st, 0, a => a.t === 'endTurn'));
    eq(E.actor(st), 2, 'se salta al eliminado');
    ok(E.foes(st, 0).length === 1 && E.foes(st, 0)[0] === 2, 'ya sólo hay un rival');
    // último rival cae
    st.players[2].lp = 10; st.current = 0; st.phase = 'battle';
    st.players[0].mz[0].attacked = false;
    st.turn = 9;
    act(st, 0, find(st, 0, a => a.t === 'attack' && a.target === 'direct'));
    eq(st.winner, 0, 'gana el último en pie');
    eq(st.rank, [1, 2], 'ranking');
  }
  {
    // 2 contra 2: el equipo gana cuando caen los dos rivales; el aliado puede seguir solo
    const st = multiGame(4, 'teams', 10);
    st.turn = 9; st.current = 0;
    E.resign(st, 1, 'x'); ok(st.winner === null, 'cae un rival: sigue');
    E.resign(st, 2, 'x'); ok(st.winner === null, 'cae un compañero: el equipo sigue con el otro');
    E.resign(st, 3, 'x');
    eq(st.winner, 0, 'cayeron los dos rivales: gana el equipo 0');
    eq(E.actor(st), -1, 'partida cerrada');
  }
  {
    // rendirse o desconectarse en mitad de todo
    for (let g = 0; g < 80; g++) {
      const rng = mulberry(7000 + g), n = 3 + (g % 2), mode = n === 4 && g % 4 === 1 ? 'teams' : 'ffa';
      const st = multiGame(n, mode, 40 + g);
      let steps = 0, quit = 20 + Math.floor(rng() * 200);
      try {
        while (st.winner === null && steps++ < 6000) {
          if (steps === quit || steps === quit + 25) {
            const alive = st.players.map((P, i) => i).filter(i => st.players[i].alive);
            E.resign(st, alive[Math.floor(rng() * alive.length)], 'se fue');
            checkMulti(st, `resign ${g}`);
            if (st.winner !== null) break;
          }
          const p = E.actor(st);
          act(st, p, randomBot(st, p, rng));
          if (steps % 6 === 0) checkMulti(st, `partida ${g} paso ${steps}`);
        }
        checkMulti(st, `partida ${g} final`);
        if (st.winner === null) ok(false, `partida multi ${g} no termina`);
        else if (st.winner !== 'draw') ok(st.players.filter(P => P.alive).every((P, i, a) => st.team[st.players.indexOf(P)] === st.winner), `partida ${g}: el ganador es el equipo de los que quedan`);
      } catch (e) { ok(false, e.message); break; }
    }
  }
  section('3 y 4 jugadores: partidas al azar');
  {
    let ended = 0, turns = 0;
    const wins = {};
    for (let g = 0; g < 100; g++) {
      const rng = mulberry(9000 + g), n = 3 + (g % 2), mode = n === 4 && g % 3 === 0 ? 'teams' : 'ffa';
      const st = multiGame(n, mode, 300 + g, { first: g % n });
      let steps = 0;
      try {
        while (st.winner === null && steps++ < 9000) {
          const p = E.actor(st);
          act(st, p, randomBot(st, p, rng));
          if (steps % 9 === 0) checkMulti(st, `azar ${g} paso ${steps}`);
        }
        checkMulti(st, `azar ${g} final`);
      } catch (e) { ok(false, e.message); break; }
      if (st.winner !== null) { ended++; turns += st.turn; wins[st.winner] = (wins[st.winner] || 0) + 1; } else ok(false, `azar ${g} no termina`);
    }
    ok(ended === 100, 'todas las partidas de 3-4 terminan');
    console.log(`  ${ended} partidas · ${(turns / Math.max(1, ended)).toFixed(1)} turnos de media · ganadores ${JSON.stringify(wins)}`);
  }
  if (AI) {
    section('3 y 4 jugadores: IA');
    const t0 = Date.now(); let ended = 0, open = 0, steps = 0; const seatWins = {};
    for (let g = 0; g < 60; g++) {
      const n = 3 + (g % 2), mode = n === 4 && g % 2 === 0 ? 'teams' : 'ffa', seed = 600 + g;
      const st = multiGame(n, mode, seed, { first: g % n });
      const ais = []; for (let i = 0; i < n; i++) ais.push(AI.create(i % 2 ? 'easy' : 'normal', seed + i));
      let k = 0;
      try {
        while (st.winner === null && k++ < 12000) {
          const p = E.actor(st);
          const a = ais[p].choose(st, p);
          const r = E.apply(st, p, a);
          if (!r.ok) throw new Error('la IA eligió una acción ilegal: ' + JSON.stringify(a));
          if (k % 11 === 0) checkMulti(st, `IA multi ${g} paso ${k}`);
        }
        checkMulti(st, `IA multi ${g} final`);
      } catch (e) { ok(false, e.message); break; }
      steps += k;
      if (st.winner === null) open++; else { ended++; seatWins[st.winner] = (seatWins[st.winner] || 0) + 1; }
    }
    console.log(`  60 partidas de IA (${Date.now() - t0} ms): terminadas ${ended} · sin terminar ${open} · ganadores ${JSON.stringify(seatWins)}`);
    ok(open === 0, 'las partidas de la IA de 3-4 terminan');
  }

  section('3 y 4 jugadores: partida local y sala online');
  {
    const m = Match.local({ deck: Cards.presetDeck('fire'), n: 4, mode: 'teams', aiLevel: 'normal', delay: 0, seed: 13 });
    ok(m.names.length === 4 && m.names.slice(1).every(x => /^Computadora/.test(x)), 'local 2v2: tres computadoras con nombre');
    let v = null; m.onView(x => { v = x; });
    m.start();
    const bot = AI.create('normal', 99);
    let k = 0;
    while (k++ < 6000 && !(v && v.winner !== null)) {
      if (v && v.actor === 0) { const r = m.act(bot.chooseView(v)); if (!r.ok) { ok(false, 'acción rechazada en local multi'); break; } }
      else await sleep(1);
    }
    ok(v && v.winner !== null, 'la partida local 2v2 termina');
    ok(v.players.every((p, i) => i === 0 || p.hand.every(x => x === null)), 'no se ven las manos de los demás');
    m.close();
  }
  {
    // todos contra todos de 3 humanos por canales simulados, y un cuarto asiento de la computadora
    const [h1, g1] = Match.memoryPair(0), [h2, g2] = Match.memoryPair(0);
    const h = Match.host({ deck: Cards.presetDeck('water'), name: 'Axel', n: 4, mode: 'ffa', seed: 31, delay: 0, autoStart: false });
    h.addGuest(h1); h.addGuest(h2);
    const a = Match.guest({ deck: Cards.presetDeck('fire'), name: 'Ana', transport: g1, helloMs: 20 });
    const b = Match.guest({ deck: Cards.presetDeck('grass'), name: 'Beto', transport: g2, helloMs: 20 });
    let hv = null, av = null, bv = null;
    h.onView(x => { hv = x; }); a.onView(x => { av = x; }); b.onView(x => { bv = x; });
    h.start(); a.start(); b.start();
    ok(await until(() => h.lobby().filter(x => x.ready).length === 2, 1000), 'la sala ve a los dos invitados');
    ok(!hv, 'no empieza sola con autoStart apagado');
    ok(h.begin(), 'el anfitrión empieza con 3 personas');
    ok(await until(() => hv && av && bv, 1000), 'todos reciben su vista');
    eq([hv.seat, av.seat, bv.seat], [0, 1, 2], 'asientos 0,1,2');
    ok(hv.n === 4 && /^Computadora/.test(h.names[3]), 'el cuarto asiento lo juega la computadora');
    eq(a.names.slice(0, 3), ['Axel', 'Ana', 'Beto'], 'los nombres llegan al invitado');
    const bots = [AI.create('normal', 1), AI.create('normal', 2), AI.create('normal', 3)];
    const views = [() => hv, () => av, () => bv], ms = [h, a, b];
    let guard = 0, illegal = false;
    while (guard++ < 40000 && !(hv.winner !== null && av.winner !== null && bv.winner !== null)) {
      let moved = false;
      for (let i = 0; i < 3; i++) {
        const v = views[i]();
        if (v.actor === i && v.winner === null) {
          if (i === 1 && !illegal && v.turn > 5) { illegal = true; a.act({ t: 'attack', zone: 0, vs: 1, target: 'direct' }); }   // atacarse a sí mismo: rechazado
          const before = v; ms[i].act(bots[i].chooseView(v)); moved = true;
          await until(() => views[i]() !== before, 500);
        }
      }
      if (!moved) await sleep(1);
    }
    ok(hv.winner !== null && hv.winner === av.winner && hv.winner === bv.winner, `los tres ven el mismo ganador (${hv.winner})`);
    ok(av.players.every((p, i) => i === av.seat || p.hand.every(x => x === null)), 'un invitado no ve las manos ajenas');
    h.close(); a.close(); b.close();
  }
  {
    // chat de la partida online: del invitado al anfitrión y al otro invitado, texto limpio y con límite de ritmo
    const [h1, g1] = Match.memoryPair(0), [h2, g2] = Match.memoryPair(0);
    const h = Match.host({ deck: Cards.presetDeck('water'), name: 'Axel', n: 3, mode: 'ffa', seed: 41, delay: 100000, autoStart: false });
    h.addGuest(h1); h.addGuest(h2);
    const a = Match.guest({ deck: Cards.presetDeck('fire'), name: 'Ana', transport: g1, helloMs: 20 });
    const b = Match.guest({ deck: Cards.presetDeck('grass'), name: 'Beto', transport: g2, helloMs: 20 });
    const gh = [], ga = [], gb = []; let hv = null, av = null;
    h.onChat(x => gh.push(x)); a.onChat(x => ga.push(x)); b.onChat(x => gb.push(x));
    h.onView(x => { hv = x; }); a.onView(x => { av = x; });
    ok(!h.chat('hola').ok && !a.chat('hola').ok, 'sin partida empezada no hay chat');
    h.start(); a.start(); b.start();
    await until(() => h.lobby().filter(x => x.ready).length === 2, 1000);
    h.begin(); await until(() => hv && av, 1000);
    ok(a.chat('  Hola\n\n  mundo\u0007  ').ok, 'el invitado escribe');
    ok(await until(() => gh.length === 1 && gb.length === 1, 500), 'llega al anfitrión y al otro invitado');
    eq(gh[0], { k: 'chat', seat: 1, name: 'Ana', text: 'Hola mundo' }, 'texto limpio y con autor');
    eq(ga.length, 0, 'el que escribe no recibe su propio mensaje de vuelta');
    ok(a.chat('otro').why === 'wait', 'escribir muy seguido se frena');
    ok(h.chat('x'.repeat(500)).text.length === 120, 'máximo 120 letras');
    ok(await until(() => ga.length === 1 && gb.length === 2, 500), 'el anfitrión llega a todos');
    eq(ga[0].name, 'Axel', 'con su nombre');
    ok(!h.chat('   ').ok, 'un mensaje vacío no se envía');
    g1.send({ k: 'chat', text: 'a' }); g1.send({ k: 'chat', text: 'b' });
    await sleep(20);
    ok(gh.length === 1, 'un invitado tramposo no se salta el límite de ritmo');
    h.close(); a.close(); b.close();
  }
  {
    // 2 contra 2 online con un invitado de compañero y desconexión
    const [h1, g1] = Match.memoryPair(0);
    const h = Match.host({ deck: Cards.presetDeck('water'), name: 'Axel', n: 4, mode: 'teams', seed: 32, delay: 5, autoStart: false });
    h.addGuest(h1);
    const a = Match.guest({ deck: Cards.presetDeck('fire'), name: 'Ana', transport: g1, helloMs: 20 });
    let hv = null, av = null; h.onView(x => { hv = x; }); a.onView(x => { av = x; });
    h.start(); a.start();
    await until(() => h.lobby().filter(x => x.ready).length === 1, 1000);
    h.begin();
    await until(() => hv && av, 1000);
    eq(av.seat, 2, 'el primer invitado es el compañero (asiento 2)');
    eq(hv.team, [0, 1, 0, 1], 'equipos');
    g1.close();
    ok(await until(() => hv.players[2].alive === false, 1000), 'si el compañero se desconecta, queda fuera');
    ok(hv.winner === null, 'el resto sigue jugando');
    h.close(); a.close();
  }
  {
    eq(Match.assignSeats('ffa', 4, [{}, {}, {}]), [1, 2, 3], 'asientos todos contra todos');
    eq(Match.assignSeats('teams', 4, [{ pref: 'ally' }, { pref: 'foe' }, { pref: 'foe' }]), [2, 1, 3], 'asientos 2v2: compañero y rivales');
    eq(Match.assignSeats('teams', 4, [{ pref: 'foe' }, { pref: 'foe' }]), [1, 3], '2v2: dos humanos rivales');
    eq(Match.assignSeats('teams', 4, [{ pref: 'ally' }, { pref: 'ally' }]), [2, 1], '2v2: si ya hay compañero, el otro va de rival');
  }
}

require('./test_cartas.js')({ E, Cards, AI, ok, eq, section, act, find, give, mulberry, randomBot, checkInvariants: null, game });
require('./test_tienda.js')({ ok, eq, section });
require('./test_rank.js')({ ok, eq, section });
require('./test_temporada.js')({ ok, eq, section });
matchTests().then(multiTests).then(() => {
  console.log(fails ? `\n✗ ${fails} fallo(s) de ${checks} comprobaciones` : `\n✓ ${checks} comprobaciones correctas`);
  process.exit(fails ? 1 : 0);
});
