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
eq(Cards.typeBonus('fire', ['grass']), 500, 'fuego > planta');
eq(Cards.typeBonus('fire', ['water']), -500, 'fuego < agua');
eq(Cards.typeBonus('normal', ['ghost']), -1000, 'normal vs fantasma');
eq(Cards.typeBonus('fire', ['grass', 'bug']), 1000, 'fuego vs planta/bicho');

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
section('batalla y tabla de tipos');
{
  const st = game();
  const char = mon('Charmander'), bulb = mon('Bulbasaur');
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
  ok(!st.players[1].mz[0], 'Bulbasaur (planta) destruido por Charmander (fuego)');
  eq(st.players[1].lp, before - (cc.atk + 500 - bb.atk), 'daño = ATK + 500 − ATK del defensor');
  ok(st.log.some(l => /muy eficaz/.test(l.t)), 'avisa que es muy eficaz');
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
    const hidden = O.hand.map(c => c.uid).concat(O.deck.map(c => c.uid));
    for (const s of O.mz) if (s && s.down) hidden.push(s.c.uid);
    for (const s of O.st) if (s && s.down) hidden.push(s.c.uid);
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
    const h = Match.host({ deck: Cards.presetDeck('water'), name: 'Axel', transport: tH, seed: 21 });
    const g = Match.guest({ deck: Cards.presetDeck('electric'), name: 'Amigo', transport: tG, helloMs: 20 });
    const vh = [], vg = [];
    let hv = null, gv = null; h.onView(x => { hv = x; vh.push(x); }); g.onView(x => { gv = x; vg.push(x); });
    const status = []; h.onStatus(s => status.push(s.k)); g.onStatus(s => status.push('g:' + s.k));
    h.start(); g.start();
    ok(await until(() => hv && gv, 2000), `[${latency}ms] los dos reciben su vista inicial`);
    ok(h.names[1] === 'Amigo' && g.names[0] === 'Axel', 'los apodos llegan');
    ok(gv.seat === 1 && hv.seat === 0, 'asientos');
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

matchTests().then(() => {
  console.log(fails ? `\n✗ ${fails} fallo(s) de ${checks} comprobaciones` : `\n✓ ${checks} comprobaciones correctas`);
  process.exit(fails ? 1 : 0);
});
