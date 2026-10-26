/* Pruebas de los puntos, la recompensa diaria y la Tienda (js/duelo/shop.js). */
'use strict';
module.exports = function (T) {
  const { ok, eq, section } = T;
  section('Puntos, recompensa diaria y Tienda');
  const attrs = {};
  global.window = global.window || global;
  global.document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  delete require.cache[require.resolve('../js/duelo/shop.js')];
  require('../js/duelo/shop.js');
  const S = global.window.Duelo.Shop;
  let store = { decks: [], pts: {} }, saves = 0;
  S.init(() => store, () => { saves++; });
  eq(S.coins(), 0, 'se empieza con 0 puntos');
  ok(S.owns('hc_cian') && !S.owns('hc_oro'), 'lo gratis ya es tuyo; lo demás no');
  // diaria
  let d = S.dailyInfo(); ok(d && d.day === 1 && d.amount === S.DAILY[0], 'primer día de racha');
  S.claimDaily(); eq(S.coins(), S.DAILY[0], 'cobra la recompensa del día 1');
  ok(S.dailyInfo() === null, 'no se puede cobrar dos veces el mismo día');
  // racha: ayer cobró el día 3 -> hoy es el 4; si falló un día, vuelve al 1
  const p = S.pts(), ayer = new Date(Date.now() - 86400000), hace2 = new Date(Date.now() - 2 * 86400000);
  const f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  p.day = f(ayer); p.streak = 3; eq(S.dailyInfo().day, 4, 'racha seguida: día 4');
  p.day = f(hace2); eq(S.dailyInfo().day, 1, 'si te saltas un día la racha vuelve a empezar');
  p.day = f(ayer); p.streak = 7; eq(S.dailyInfo().day, 1, 'tras el día 7 se vuelve a empezar el ciclo');
  // partidas
  p.coins = 0; p.aiDay = ''; p.aiGot = 0;
  eq(S.reward(true, true), S.PLAY_ONLINE + S.WIN_ONLINE, 'online ganada');
  eq(S.reward(true, false), S.PLAY_ONLINE, 'online perdida');
  let tot = 0; for (let i = 0; i < 20; i++) tot += S.reward(false, true);
  eq(tot, S.AI_DAILY_CAP, 'contra la computadora hay un tope diario');
  // compra
  p.coins = 10; ok(!S.buy('hc_oro').ok, 'sin puntos suficientes no compra'); eq(S.coins(), 10, 'y no se descuenta nada');
  const pr = S.priceOf('hc_oro');
  p.coins = 500; ok(S.buy('hc_oro').ok, 'compra'); eq(S.coins(), 500 - pr, 'descuenta el precio'); ok(S.owns('hc_oro'), 'queda en tu inventario');
  ok(!S.buy('hc_oro').ok && S.coins() === 500 - pr, 'no se compra dos veces');
  // equipar
  ok(!S.equip('hc_magenta'), 'no se puede equipar lo que no tienes');
  ok(S.equip('hc_oro') && attrs['data-hc'] === 'oro', 'equipado: el CSS recibe data-hc=oro');
  // datos manipulados
  store.pts = { coins: -50, owned: ['nada', 'hc_oro'], eq: { hc: 'hc_violeta' } };
  eq(S.coins(), 0, 'puntos negativos se corrigen a 0'); ok(!S.owns('nada'), 'ids inventados se descartan');
  eq(S.equipped('hc').id, 'hc_cian', 'un equipado que no tienes vuelve al de serie');
  // ---- ofertas y cajas ----
  const o1 = S.offers(), o2 = S.offers();
  eq(o1, o2, 'las ofertas del día son siempre las mismas ese día'); eq(o1.length, 3, '3 ofertas'); ok(o1.every(id => S.get(id).rar !== 'l' && !S.get(id).free), 'sin legendarios ni gratis en oferta');
  ok(S.priceOf(o1[0]) < S.get(o1[0]).price, 'la oferta es más barata');
  for (const it of S.ITEMS.filter(i => !i.free && i.cat !== 'si')) {      // las skins de ilustración van en el Cofre de skins (test_cofre.js)
    const b = S.BOXES.find(x => x.id === S.boxOf[it.id]);
    ok(b && b.w[it.rar], it.id + ' sale en una sola caja que puede darlo');
    ok(it.price > b.price, it.id + ': comprarlo directo cuesta más que la caja donde sale');
  }
  for (const b of S.BOXES) ok(Object.keys(b.w).reduce((n, r) => n + b.w[r], 0) === 100, b.name + ': las probabilidades suman 100 %');
  store.pts = {}; const q = S.pts(); q.owned = []; q.coins = 100000; q.pity = {};
  const r1 = S.openBox('plata'); ok(r1.ok && r1.item && S.owns(r1.item.id), 'abre una caja y el premio es tuyo'); eq(S.coins(), 100000 - 60 + r1.refund, 'cobra la caja');
  let seenDup = false; for (let i = 0; i < 200 && !seenDup; i++) { const c0 = S.coins(), r = S.openBox('plata'); if (r.dup) { seenDup = true; eq(S.coins(), c0 - 60 + r.refund, 'repetido: devuelve puntos'); ok(r.refund > 0, 'devolución positiva'); } }
  ok(seenDup, 'salen repetidos');
  q.coins = 5; const c5 = S.openBox('legendaria'); ok(!c5.ok && S.coins() === 5, 'sin puntos no abre y no cobra');
  q.coins = 100000; q.owned = []; q.pity = {};
  for (let i = 0; i < 30; i++) { const r = S.openBox('legendaria'); ok(r.item.rar === 'l', 'la Caja Legendaria sólo da legendarios'); }
  // garantía: en la Caja Especial, nunca más de 5 sin legendario
  q.coins = 1e9; q.pity = {}; let sinL = 0, peor = 0;
  for (let i = 0; i < 300; i++) { const r = S.openBox('especial'); if (r.item.rar === 'l') sinL = 0; else { sinL++; peor = Math.max(peor, sinL); } }
  ok(peor <= 4, 'garantía de la Caja Especial: legendario seguro al abrir la 5.ª sin suerte (peor racha ' + peor + ')');
};
