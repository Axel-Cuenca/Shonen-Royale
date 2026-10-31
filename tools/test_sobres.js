/* Pruebas de la colección por tandas y los sobres (31-10-2026). Se carga desde tools/test_duelo.js. */
'use strict';
module.exports = function (T) {
  const { ok, eq, section, Cards: C } = T;
  section('Tandas, rarezas y sobres');
  global.window = global.window || global;
  for (const f of ['seasons', 'shop']) { delete require.cache[require.resolve('../js/duelo/' + f + '.js')]; require('../js/duelo/' + f + '.js'); }
  const SH = global.window.Duelo.Shop;
  let store = { pts: {} }; SH.init(() => store, () => {});
  // reparto por tandas
  eq(C.TANDAS.map(t => C.inTanda(t).length), [20, 31, 17, 12], 'tandas de 20, 31, 17 y 12 cartas');
  const all = C.all().map(c => c.id).filter(id => /^c_/.test(id)), listed = C.TANDAS.flatMap(t => C.inTanda(t));
  ok(all.every(id => listed.includes(id)) && new Set(listed).size === listed.length, 'cada carta del catálogo está en una sola tanda (si añades una, ponla en TANDA_IDS de cards.js)');
  // rarezas por estrellas
  const lv = (n) => { const c = C.all().find(x => x.kind === 'monster' && x.level === n); return c && C.rarityOf(c.id); };
  eq([lv(1), lv(2), lv(3), lv(4), lv(5), lv(6), lv(7), lv(8), lv(9), lv(10), lv(11)], ['c', 'c', 'c', 'u', 'r', 'r', 'e', 'e', 'e', 'l', 'l'], 'rareza por estrellas: 1-3 común, 4 poco común, 5-6 rara, 7-9 épica, 10+ legendaria');
  ok(C.all().filter(c => c.kind !== 'monster').every(c => C.rarityOf(c.id) === 'c'), 'magias y trampas: comunes');
  // colección
  ok(C.inTanda(1).every(id => SH.hasCard(id)), 'la tanda 1 viene desbloqueada');
  ok([2, 3, 4].every(t => C.inTanda(t).every(id => !SH.hasCard(id))), 'las demás tandas empiezan bloqueadas');
  // sobres
  eq([SH.PACK_PRICE, SH.PACK_SIZE], [50, 3], 'sobre de 3 cartas por 50 monedas');
  const p = SH.pts(); p.coins = 49; ok(!SH.buyPack(2).ok && SH.coins() === 49, 'sin monedas no abre y no cobra');
  ok(!SH.buyPack(1).ok && !SH.buyPack(9).ok, 'no hay sobre de la tanda 1 ni de tandas que no existen');
  p.coins = 1000; let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const r = SH.buyPack(3, rnd);
  ok(r.ok && r.cards.length === 3 && SH.coins() === 950, 'abre: 3 cartas y cobra 50');
  ok(r.cards.every(x => C.tandaOf(x.id) === 3 && SH.hasCard(x.id)), 'las cartas son de esa tanda y quedan desbloqueadas');
  // repetidas guardadas y primera para siempre
  const id = r.cards[0].id; store.pts.cards[id] = 1; eq([SH.cardCount(id), SH.spareOf(id)], [1, 0], 'la primera copia la desbloquea y no es repetida');
  store.pts.cards[id] = 4; eq([SH.cardCount(id), SH.spareOf(id)], [4, 3], 'las siguientes quedan guardadas como repetidas');
  // estadística de rarezas (muchos sobres): mayoría comunes, y salen las 5 rarezas en la tanda 2
  p.coins = 1e9; const cnt = { c: 0, u: 0, r: 0, e: 0, l: 0 }; let n = 0;
  for (let i = 0; i < 4000; i++) for (const x of SH.buyPack(2, rnd).cards) { cnt[x.rar]++; n++; }
  ok(cnt.c > cnt.u && cnt.u > cnt.r && cnt.r > cnt.e && cnt.e > cnt.l && cnt.l > 0, 'más comunes que raras: ' + JSON.stringify(cnt));
  ok(Math.abs(cnt.c / n - 0.55) < 0.06, 'las comunes salen ~55 %');
  // guardado manipulado
  store.pts = { cards: { c_goku: 2, c_popeye: 5, nada: 3, c_odin: -4, c_x: 'a' } };
  const q = SH.pts(); eq(Object.keys(q.cards), ['c_goku'], 'se descartan ids inventados, la tanda 1, negativos y no numéricos');
  // economía más generosa
  eq([SH.PLAY_ONLINE + SH.WIN_ONLINE, SH.AI_DAILY_CAP >= 150], [80, true], 'más monedas por partida online y tope diario contra la computadora de 150');
};
