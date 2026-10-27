/* Pruebas del Cofre de skins (26-10-2026): skins de ilustración por carta, todas con la MISMA probabilidad, sin rarezas.
 * Se carga desde tools/test_duelo.js. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function (T) {
  const { ok, eq, section, Cards } = T;
  section('Cofre de skins');
  global.window = global.window || global;
  for (const f of ['seasons', 'shop']) { delete require.cache[require.resolve('../js/duelo/' + f + '.js')]; require('../js/duelo/' + f + '.js'); }
  const SH = global.window.Duelo.Shop, root = path.join(__dirname, '..');
  let store = {}, saves = 0; SH.init(() => store, () => { saves++; });
  const pool = SH.skinPool();

  // ---- catálogo: cada skin es de UNA carta existente y con su imagen ----
  ok(pool.length >= 5, 'hay skins en el cofre (' + pool.length + ')');
  ok(new Set(pool.map(i => i.id)).size === pool.length, 'ids de skin únicos');
  for (const it of pool) {
    const c = Cards.get(it.card);
    ok(c && c.kind === 'monster' && !c.hidden, it.id + ' pertenece a un personaje que existe (' + it.card + ')');
    ok(it.img && fs.existsSync(path.join(root, it.img)), it.id + ' tiene su imagen en disco');
    ok(it.id.length <= 24 && /^si_[a-z0-9_]+$/.test(it.id), it.id + ' tiene un id válido (cabe en el límite que reenvía el anfitrión)');
    ok(c && c.img && it.img !== c.img, it.id + ' es otra imagen distinta de la original');
    ok(it.rar === 'u' && it.price === 0 && it.box === 1, it.id + ': sin rareza y no se compra');
  }
  ok(!pool.some(i => SH.boxOf[i.id]), 'las skins no están en ninguna caja con rarezas');
  ok(!SH.offers().some(id => SH.get(id).cat === 'si'), 'nunca están en las ofertas del día');
  ok(SH.buy(pool[0].id).ok === false, 'no se pueden comprar');
  ok(SH.SKIN_BOX.w === undefined && SH.SKIN_BOX.pity === undefined, 'el cofre no tiene rarezas ni garantías');

  // ---- la skin no toca las estadísticas ni las habilidades ----
  const before = JSON.stringify(Cards.custom);
  store.pts = { coins: 1e9 }; SH.pts().owned.push(pool[0].id); SH.setArt(pool[0].card, pool[0].id);
  ok(JSON.stringify(Cards.custom) === before, 'poner una skin no cambia nada de las cartas (nombre, ★, ATK, DEF, tipo, habilidades)');

  // ---- probabilidad: 100 / cantidad, igual para todas, y se recalcula sola ----
  eq(SH.skinChance(), 100 / pool.length, 'cada skin tiene 100 / ' + pool.length + ' %');
  const extra = { id: 'si_prueba_extra', cat: 'si', name: 'Extra', rar: 'u', price: 0, box: 1, card: 'c_goku', img: 'assets/skins/goku_dbz.webp' };
  SH.ITEMS.push(extra);
  eq(SH.skinPool().length, pool.length + 1, 'una skin nueva entra sola en el cofre');
  eq(SH.skinChance(), 100 / (pool.length + 1), 'las probabilidades se recalculan solas');
  SH.ITEMS.pop();
  eq(SH.skinPool().length, pool.length, 'quitarla lo deja como estaba');

  // ---- sorteo uniforme (chi-cuadrado) ----
  store.pts = { coins: 1e9 };
  const N = 20000, cnt = {}; for (const it of pool) cnt[it.id] = 0;
  const price = SH.SKIN_BOX.price;
  for (let i = 0; i < N; i++) { const r = SH.openBox('skins'); cnt[r.item.id]++; }
  const e = N / pool.length, chi = pool.reduce((s, it) => s + (cnt[it.id] - e) * (cnt[it.id] - e) / e, 0);
  // gl = n-1; p = 0,001 con 4 gl ≈ 18,5 (con 10 gl, 29,6): holgado para que no falle por azar
  ok(chi < 18.5 + (pool.length - 5) * 3, `reparto uniforme: chi² = ${chi.toFixed(1)} con ${pool.length} skins (${JSON.stringify(cnt)})`);
  ok(pool.every(it => Math.abs(cnt[it.id] / N - 1 / pool.length) < 0.02), 'todas salen cerca de ' + (100 / pool.length).toFixed(1) + ' %');

  // ---- cobro, repetidos y guardado permanente ----
  store.pts = { coins: 1000 }; saves = 0;
  const r1 = SH.openBox('skins');
  ok(r1.ok && !r1.dup && r1.refund === 0, 'primera apertura: skin nueva');
  eq(SH.coins(), 1000 - price, 'cobra el precio del cofre');
  ok(SH.pts().owned.includes(r1.item.id) && SH.owns(r1.item.id), 'la skin queda en el inventario');
  ok(saves === 1, 'se guarda en el sistema persistente al abrir (antes de mostrar nada)');
  store.pts.owned = pool.map(i => i.id); store.pts.coins = 1000;
  const r2 = SH.openBox('skins');
  ok(r2.ok && r2.dup && r2.refund === SH.SKIN_BOX.dupRefund, 'repetida: devuelve puntos');
  eq(SH.coins(), 1000 - price + SH.SKIN_BOX.dupRefund, 'cobro y devolución correctos');
  eq(SH.pts().owned.filter(id => id === r2.item.id).length, 1, 'una repetida no se duplica en el inventario');
  store.pts = { coins: price - 1, owned: [] }; saves = 0;
  const r3 = SH.openBox('skins');
  ok(!r3.ok && SH.coins() === price - 1 && !SH.pts().owned.length && saves === 0, 'sin puntos suficientes no se abre ni se cobra nada');
  store.pts = { coins: price * 3, owned: [] };
  const tres = [SH.openBox('skins'), SH.openBox('skins'), SH.openBox('skins')];
  eq(SH.coins(), price * 3 - 3 * price + tres.reduce((n, r) => n + r.refund, 0), 'cada llamada cobra una sola vez (tres aperturas = tres cobros; sólo vuelve lo de repetidas)');
  ok(tres.every(r => r.ok) && new Set(SH.pts().owned).size === SH.pts().owned.length, 'y el inventario no tiene duplicados');
  store.pts = { coins: price - 1, owned: [] };
  ok(SH.openBox('skins').ok === false, 'sin puntos no se abre');

  // ---- equipar: sólo si la tienes y es de ESA carta ----
  store.pts = { coins: 0, owned: [] };
  const [a, b2] = [pool[0], pool.find(i => i.card !== pool[0].card)];
  ok(SH.artOf(a.card) === null, 'sin skin puesta se usa la imagen original');
  ok(SH.setArt(a.card, a.id) === false && SH.artOf(a.card) === null, 'no se puede equipar una que no tienes');
  SH.pts().owned.push(a.id);
  ok(SH.setArt(b2.card, a.id) === false, 'no se puede equipar la skin de otra carta');
  ok(SH.setArt(a.card, 'sk_neon') === false && SH.setArt(a.card, 'hc_oro') === false && SH.setArt(a.card, 'nada') === false, 'sólo skins de carta');
  ok(SH.setArt('mal id!', a.id) === false, 'id de carta inválido');
  ok(SH.setArt(a.card, a.id) && SH.artOf(a.card).id === a.id, 'se equipa a su carta');
  ok(SH.artOf(b2.card) === null, 'las demás cartas siguen con su imagen');
  ok(SH.equip(a.id) === false, 'equip() (cosméticos) no sirve para skins de carta');
  SH.setArt(a.card, null); ok(SH.artOf(a.card) === null, 'se quita con null y vuelve la original');

  // ---- se conservan al cerrar sesión y volver a entrar; una manipulación se descarta ----
  SH.pts().owned.push(b2.id); SH.setArt(a.card, a.id); SH.setArt(b2.card, b2.id);
  const saved = JSON.parse(JSON.stringify(store));            // lo que va a localStorage / la nube
  store = saved;
  ok(SH.artOf(a.card).id === a.id && SH.artOf(b2.card).id === b2.id && SH.owns(a.id), 'tras guardar y volver a cargar siguen ahí');
  store.pts.si[a.card] = b2.id;                                // alguien edita el guardado: skin de otra carta
  SH.pts(); ok(SH.artOf(a.card) === null && store.pts.si[a.card] === undefined, 'una skin de otra carta en el guardado se descarta');
  store.pts.si = { [b2.card]: 'si_no_existe' };
  SH.pts(); ok(SH.artOf(b2.card) === null, 'una skin que no existe se descarta');
  store.pts.owned = []; store.pts.si = { [a.card]: a.id };
  ok(SH.artOf(a.card) === null, 'equipada pero no obtenida: no se usa');
  store.pts = { si: 'x', owned: 'y' }; SH.pts(); ok(typeof store.pts.si === 'object' && Array.isArray(store.pts.owned), 'guardados dañados no rompen nada');

  // ---- lo que ven los rivales: sólo skins válidas de ESA carta ----
  store.pts = { owned: [a.id, b2.id] }; SH.setArt(a.card, a.id); SH.setArt(b2.card, b2.id);
  eq(SH.mine().si, { [a.card]: a.id, [b2.card]: b2.id }, 'lo que mando a los rivales: mis skins por carta');
  eq(SH.clean({ si: { [a.card]: a.id, [b2.card]: a.id, c_x: 'si_no_existe', 'a b': a.id, y: 5 } }).si, { [a.card]: a.id }, 'lo que mandan otros se sanea: sólo la skin que es de esa carta');
  ok(SH.clean({ si: 'x' }).si === undefined && SH.clean({}).si === undefined && SH.clean(null).si === undefined, 'sin skins no hay campo');
  const Match = require('../js/duelo/match.js');
  const big = {}; for (let i = 0; i < 100; i++) big['c' + i] = a.id;
  const m = Match.host ? Match.host({ n: 2, deck: [], name: 'x', cos: { si: big, sk: { c_x: 'sk_neon' } } }) : null;
  if (m) { ok(Object.keys(m.cos[0].si).length === 60, 'el anfitrión limita a 60 skins de ilustración por jugador'); ok(m.cos[0].sk && m.cos[0].sk.c_x === 'sk_neon', 'y no estropea los efectos de caja'); m.close && m.close(); }

  // ---- no se rompen los efectos de caja de antes ----
  store.pts = { skOwn: { c_popeye: ['sk_neon'] } };
  ok(SH.setSkin('c_popeye', 'sk_neon') && SH.skinOf('c_popeye').id === 'sk_neon', 'los efectos de caja (sk) siguen funcionando');
  ok(SH.mySkins().every(i => i.cat === 'sk'), 'mySkins() sólo lista efectos');
};
