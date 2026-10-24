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
  p.coins = 100; ok(!S.buy('hc_oro').ok, 'sin puntos suficientes no compra'); eq(S.coins(), 100, 'y no se descuenta nada');
  p.coins = 500; ok(S.buy('hc_oro').ok, 'compra'); eq(S.coins(), 350, 'descuenta el precio'); ok(S.owns('hc_oro'), 'queda en tu inventario');
  ok(!S.buy('hc_oro').ok && S.coins() === 350, 'no se compra dos veces');
  // equipar
  ok(!S.equip('hc_magenta'), 'no se puede equipar lo que no tienes');
  ok(S.equip('hc_oro') && attrs['data-hc'] === 'oro', 'equipado: el CSS recibe data-hc=oro');
  // datos manipulados
  store.pts = { coins: -50, owned: ['nada', 'hc_oro'], eq: { hc: 'hc_violeta' } };
  eq(S.coins(), 0, 'puntos negativos se corrigen a 0'); ok(!S.owns('nada'), 'ids inventados se descartan');
  eq(S.equipped('hc').id, 'hc_cian', 'un equipado que no tienes vuelve al de serie');
};
