/* Pruebas de las skins de cartas (sólo en cajas, una por personaje, las ven los rivales). */
'use strict';
module.exports = function (T) {
  const { ok, eq, section } = T;
  section('Skins de cartas');
  global.window = global.window || global;
  for (const f of ['seasons', 'shop']) { delete require.cache[require.resolve('../js/duelo/' + f + '.js')]; require('../js/duelo/' + f + '.js'); }
  const SH = global.window.Duelo.Shop;
  let store = {}; SH.init(() => store, () => {});
  const sks = SH.ITEMS.filter(i => i.cat === 'sk');
  ok(sks.length >= 12, 'hay skins (' + sks.length + ')');
  ok(sks.every(i => SH.boxOf[i.id]), 'todas salen de alguna caja');
  ok(SH.BOXES.every(b => SH.poolOf(b).some(i => i.cat === 'sk')), 'cada caja trae al menos una skin');
  ok(!SH.offers().some(id => SH.get(id).cat === 'sk'), 'nunca están en las ofertas del día');
  store.pts = { coins: 1e6 };
  ok(SH.buy('sk_neon').ok === false, 'no se pueden comprar');
  ok(SH.setSkin('c_popeye', 'sk_neon') === false && SH.skinOf('c_popeye') === null, 'no se pone una skin que no tienes');
  SH.pts().owned.push('sk_neon', 'sk_dorada');
  ok(SH.setSkin('c_popeye', 'sk_neon') && SH.skinOf('c_popeye').id === 'sk_neon', 'se pone a un personaje');
  ok(SH.setSkin('c_creeper', 'sk_neon') && SH.skinOf('c_popeye').id === 'sk_neon' && SH.skinOf('c_creeper').id === 'sk_neon', 'la misma skin en varios personajes');
  ok(SH.equip('sk_neon') === false, 'equip() no sirve para skins');
  ok(SH.setSkin('c_popeye', 'hc_oro') === false && SH.setSkin('mal id!', 'sk_neon') === false, 'sólo skins y ids de carta válidos');
  eq(SH.mine().sk, { c_popeye: 'sk_neon', c_creeper: 'sk_neon' }, 'lo que ven los rivales: mis skins por personaje');
  eq(SH.clean({ sk: { c_popeye: 'sk_dorada', x: 'hc_oro', 'a b': 'sk_neon', y: 5 } }).sk, { c_popeye: 'sk_dorada' }, 'lo que mandan otros se sanea (sólo skins existentes)');
  ok(SH.clean({ sk: 'x' }).sk === undefined && SH.clean({}).sk === undefined, 'sin skins no hay campo');
  SH.setSkin('c_popeye', null); ok(SH.skinOf('c_popeye') === null, 'se quita con null');
  const Match = require('../js/duelo/match.js');
  // el anfitrión sólo deja pasar textos cortos y como mucho 60 skins
  const big = {}; for (let i = 0; i < 100; i++) big['c' + i] = 'sk_neon';
  const m = Match.host ? Match.host({ n: 2, deck: [], name: 'x', cos: { sk: big } }) : null;
  if (m) { ok(Object.keys(m.cos[0].sk).length === 60, 'el anfitrión limita a 60 skins por jugador'); m.close && m.close(); }
};
