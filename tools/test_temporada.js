/* Pruebas de los premios de fin de temporada (js/duelo/seasons.js + cobro en rank.js y shop.js). */
'use strict';
module.exports = function (T) {
  const { ok, eq, section } = T;
  section('Premios de fin de temporada');
  global.window = global.window || global;
  for (const f of ['seasons', 'shop', 'rank']) { delete require.cache[require.resolve('../js/duelo/' + f + '.js')]; require('../js/duelo/' + f + '.js'); }
  const D = global.window.Duelo, SE = D.Seasons, R = D.Rank, SH = D.Shop;
  // el reloj se fija en el 2-nov-2026 para probar el paso de octubre a noviembre
  const RD = Date; global.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(2026, 10, 2, 12); } static now() { return new RD(2026, 10, 2, 12).getTime(); } };
  try {
    eq(SE.table('2026-10').map(t => t.ids.length), [1, 1, 2, 3, 3, 3, 3], 'cosméticos por rango: título siempre, marco desde Oro, avatar desde Platino');
    eq(SE.table('2026-10').map(t => t.coins), [40, 90, 180, 320, 520, 800, 1200], 'puntos por rango');
    ok(SE.reward('2026-09', 'oro').ids.length === 0, 'antes de la primera temporada no hay premios');
    const a = SE.item('av_s2026-10-platino'), b = SE.item('av_s2026-11-platino'), c = SE.item('ti_s2026-10-oro'), c2 = SE.item('ti_s2026-11-oro');
    ok(a && b && a.emoji !== b.emoji, 'el avatar cambia de un mes a otro (' + (a && a.emoji) + ' / ' + (b && b.emoji) + ')');
    ok(c && c2 && c.text !== c2.text, 'el título cambia de un mes a otro');
    ok(SE.item('fr_s2026-10-plata') === null && SE.item('av_s2026-10-oro') === null, 'no hay marco antes de Oro ni avatar antes de Platino');
    ok(SE.item('ti_s2026-12-oro') === null && SE.item('ti_s2026-10-nada') === null && SE.item('xx_s2026-10-oro') === null, 'ids de temporadas futuras o inventados no existen');
    ok(a.excl && !SH.ITEMS.some(i => i.id === a.id), 'son exclusivos: no están en la Tienda ni en las cajas');
    // flujo: terminó octubre
    let store = { rank: { season: '2026-10', pts: 1000, w: 8, l: 4, best: 1050 } }, saves = 0;
    R.init(() => store, () => { saves++; }); SH.init(() => store, () => { saves++; });
    const st = R.state();
    eq([st.season, st.pts, st.pending.length], ['2026-11', 650, 1], 'al pasar de mes queda un premio pendiente');
    const pd = R.pending();
    eq([pd[0].season, pd[0].tier, pd[0].ok, pd[0].games], ['2026-10', 'platino', true, 12], 'se paga por el MEJOR rango (1050 PC = Platino) y no por el final');
    const coins0 = SH.coins(), res = R.claim();
    eq([res.length, res[0].coins, res[0].ids.length], [1, 320, 3], 'cobra puntos y 3 cosméticos');
    eq(SH.coins(), coins0 + 320, 'los puntos se suman');
    ok(res[0].ids.every(id => SH.owns(id)), 'los cosméticos quedan en la colección');
    eq(R.claim(), [], 'no se cobra dos veces');
    ok(SH.equip('av_s2026-10-platino') && SH.equipped('av').emoji === a.emoji, 'se puede equipar');
    eq(SH.exclusive('ti').map(i => i.id), ['ti_s2026-10-platino'], 'aparece en «Tus premios de temporada» de su categoría');
    ok(SH.clean({ av: 'av_s2026-10-platino', ti: 'ti_s2026-10-platino' }).av === 'av_s2026-10-platino', 'los demás jugadores ven el cosmético');
    ok(SH.clean({ av: 'av_s2099-01-platino' }).av === undefined, 'una temporada inventada se descarta');
    ok(SH.buy('ti_s2026-10-oro').ok === false, 'no se puede comprar');
    ok(store.pts.owned.every(id => !!SH.get(id)), 'lo guardado se conserva al sanear');
    // pocas partidas: sin premio
    store.rank = { season: '2026-10', pts: 700, w: 1, l: 1, best: 700 }; store.pts.owned = [];
    R.state(); const r2 = R.claim();
    eq([r2[0].ok, r2[0].coins, r2[0].ids.length], [false, 0, 0], 'con menos de 5 partidas con rango no hay premio');
    // dos temporadas sin entrar: se cobran las dos
    store.rank = { season: '2026-10', pts: 1900, w: 9, l: 1, best: 1900 };
    R.state(); store.rank.pending.unshift({ season: '2026-10', best: 100, w: 6, l: 0 }); store.rank.pending = [store.rank.pending[0], { season: '2026-10', best: 1900, w: 10, l: 1 }].slice(0, 1).concat([]);
    const r3 = R.claim(); ok(r3.length === 1 && r3[0].tier === 'bronce', 'las entradas se sanean y se cobran');
    // datos corruptos
    store.rank = { season: '2026-11', pts: 100, pending: [null, { season: 'x' }, { season: '2026-11', best: 999 }, { season: '2020-01', best: 999 }] };
    eq(R.pending(), [], 'entradas corruptas, de la temporada en curso o anteriores a la primera se ignoran');
  } finally { global.Date = RD; }
};
