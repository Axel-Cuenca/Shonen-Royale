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
  // migración: un efecto que antes valía para todos queda en UN solo personaje (y ya no está en el inventario general)
  SH.pts().owned.push('sk_dorada');
  const mg = SH.pts(); const duenos = Object.keys(mg.skOwn).filter(c => mg.skOwn[c].includes('sk_dorada'));
  ok(duenos.length === 1 && !mg.owned.includes('sk_dorada'), 'un efecto antiguo pasa a un solo personaje');
  // los efectos son POR PERSONAJE: sólo lo puede poner quien lo tiene
  SH.pts().skOwn = { c_popeye: ['sk_neon'], c_creeper: ['sk_neon'] };
  ok(SH.ownsSk('c_popeye', 'sk_neon') && !SH.ownsSk('c_kratos', 'sk_neon'), 'cada personaje tiene sus propios efectos');
  ok(SH.setSkin('c_kratos', 'sk_neon') === false && SH.skinOf('c_kratos') === null, 'otro personaje no puede usar un efecto que no tiene');
  ok(SH.skinsFor('c_kratos').length === 0 && SH.skinsFor('c_popeye').map(i => i.id).join() === 'sk_neon', 'cada personaje lista sólo los suyos');
  ok(SH.setSkin('c_popeye', 'sk_neon') && SH.skinOf('c_popeye').id === 'sk_neon', 'se pone a un personaje');
  ok(SH.setSkin('c_creeper', 'sk_neon') && SH.skinOf('c_popeye').id === 'sk_neon' && SH.skinOf('c_creeper').id === 'sk_neon', 'dos personajes con el mismo efecto, cada uno el suyo');
  { // un efecto puesto que el personaje no tiene (guardado manipulado o de la nube) se descarta
    SH.pts().sk.c_kratos = 'sk_neon'; ok(SH.pts().sk.c_kratos === undefined && SH.skinOf('c_kratos') === null, 'un efecto puesto sin tenerlo se descarta'); }
  { // abrir cajas: el efecto sale para UN personaje concreto
    const box = SH.BOXES.find(b => SH.poolOf(b).some(i => i.cat === 'sk')); let r = null;
    store.pts = { coins: 1e9 };
    for (let i = 0; i < 400 && !(r && r.item.cat === 'sk'); i++) r = SH.openBox(box.id);
    ok(r && r.ok && r.item.cat === 'sk' && typeof r.card === 'string', 'la caja da un efecto con su personaje');
    ok(SH.ownsSk(r.card, r.item.id) && SH.skinsFor(r.card).some(i => i.id === r.item.id), 'queda sólo en ese personaje');
    const otros = SH.pts(); const cuantos = Object.keys(otros.skOwn).filter(c => otros.skOwn[c].includes(r.item.id)).length;
    ok(cuantos === 1 && !otros.owned.includes(r.item.id), 'no se reparte a los demás personajes');
  }
  store.pts = { coins: 1e6, skOwn: { c_popeye: ['sk_neon'], c_creeper: ['sk_neon'] } };
  ok(SH.equip('sk_neon') === false, 'equip() no sirve para skins');
  ok(SH.setSkin('c_popeye', 'hc_oro') === false && SH.setSkin('mal id!', 'sk_neon') === false, 'sólo skins y ids de carta válidos');
  SH.setSkin('c_popeye', 'sk_neon'); SH.setSkin('c_creeper', 'sk_neon');
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
