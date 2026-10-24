/* Pruebas del ranking (js/duelo/rank.js): rangos, peldaños, Elo, temporadas. */
'use strict';
module.exports = function (T) {
  const { ok, eq, section } = T;
  section('Ranking, rangos y temporadas');
  global.window = global.window || global;
  delete require.cache[require.resolve('../js/duelo/rank.js')];
  require('../js/duelo/rank.js');
  const R = global.window.Duelo.Rank;
  const lab = n => R.tierOf(n).label;
  eq([lab(0), lab(99), lab(100), lab(299)], ['Bronce I', 'Bronce I', 'Bronce II', 'Bronce III'], 'Bronce: peldaños de 100');
  eq([lab(300), lab(599), lab(600), lab(900), lab(1200), lab(1500), lab(1799)], ['Plata I', 'Plata III', 'Oro I', 'Platino I', 'Diamante I', 'Esmeralda I', 'Esmeralda III'], 'cortes de cada rango');
  eq([lab(1800), lab(4000)], ['Gran Maestro', 'Gran Maestro'], 'Gran Maestro desde 1800');
  eq(R.tierOf(250).next, 50, 'faltan 50 PC para el siguiente peldaño');
  // Elo
  ok(R.delta(500, [500], 1) === 20 && R.delta(500, [500], 0) === -20, 'rivales iguales: ±20');
  ok(R.delta(500, [900], 1) > 20 && R.delta(500, [100], 1) < 20, 'ganar a uno mejor da más; a uno peor, menos');
  ok(R.delta(500, [100], 1) >= 8, 'ganar siempre da al menos 8');
  ok(R.delta(500, [100], 0) < -20 && R.delta(500, [900], 0) > -20, 'perder contra uno peor quita más');
  ok(Math.abs(R.delta(0, [5000], 1)) <= 45 && Math.abs(R.delta(5000, [0], 0)) <= 45, 'el cambio nunca pasa de 45 (las reglas de Firestore lo exigen)');
  eq(R.delta(500, [500], 0.5), 0, 'un empate entre iguales no cambia');
  eq([R.scoreOfPlace(1, 4), R.scoreOfPlace(4, 4), R.scoreOfPlace(2, 3)], [1, 0, .5], 'resultado por puesto');
  // temporada
  eq([R.softReset(200), R.softReset(300), R.softReset(1300), R.softReset(2000)], [200, 300, 800, 1150], 'reinicio parcial: lo que pasa de 300 se reduce a la mitad');
  const d = new Date(2026, 9, 23); eq([R.seasonId(d), R.daysLeft(d)], ['2026-10', 9], 'temporada = mes');
  ok(/octubre 2026/.test(R.seasonName('2026-10')), 'nombre de la temporada');
  // estado
  let store = { rank: { season: '2026-09', pts: 1300, w: 5, l: 2 } }, saves = 0;
  R.init(() => store, () => { saves++; });
  const st = R.state();
  eq([st.season, st.pts, st.w, st.l], [R.seasonId(), 800, 0, 0], 'al cambiar de temporada se reinicia parcialmente y se ponen a 0 las victorias');
  eq(st.prev && st.prev.pts, 1300, 'se recuerda la temporada anterior');
  store.rank = { pts: -10, w: 'x' }; const st2 = R.state(); eq([st2.pts, st2.w], [0, 0], 'datos raros se corrigen');
  store.rank = { season: R.seasonId(), pts: 500, w: 0, l: 0 };
  const a = R.apply({ S: 1, foes: [500] }); eq([a.before, a.after, a.delta], [500, 520, 20], 'ganar suma');
  const b = R.apply({ S: 0, foes: [520] }); eq(b.delta, -20, 'perder resta');
  store.rank.pts = 5; const c = R.apply({ S: 0, foes: [5] }); eq(store.rank.pts, 0, 'nunca baja de 0');
  store.rank.pts = 590; const e = R.apply({ S: 1, foes: [590] }); ok(e.rankUp && e.to.label === 'Oro I', 'sube de rango (Plata III → Oro I)');
  store.rank.pts = 600; const f = R.apply({ S: 0, foes: [600] }); ok(f.rankDown && f.to.tier.id === 'plata', 'baja de rango');
  eq(store.rank.w + store.rank.l > 0, true, 'se cuentan victorias y derrotas');
};
