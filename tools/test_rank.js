/* Ranking (29-10-2026): puntos por partida (máx. +34) y escudos al subir de peldaño o de rango. */
'use strict';
module.exports = function ({ ok, eq, section }) {
  const had = 'window' in global;
  if (!had) global.window = {};
  window.Duelo = window.Duelo || {};
  delete require.cache[require.resolve('../js/duelo/rank.js')];
  require('../js/duelo/rank.js');
  const R = window.Duelo.Rank;
  if (!had) delete global.window;
  section('Ranking: puntos y escudos (29-10-2026)');
  // --- puntos ---
  eq(R.delta(500, [500], 1), 24, 'victoria contra alguien igual: +24');
  eq(R.delta(500, [500], 0), -24, 'derrota contra alguien igual: −24');
  ok(R.delta(500, [900], 1) === 34, 'victoria muy difícil: tope +34');
  ok(R.delta(500, [100], 1) === 10, 'victoria muy fácil: mínimo +10');
  ok(R.delta(500, [100], 0) === -30, 'derrota muy fea: tope −30');
  ok(R.delta(500, [900], 0) === -10, 'derrota muy justificada: mínimo −10');
  let mx = 0; for (let m = 0; m <= 3000; m += 50) for (let o = 0; o <= 3000; o += 50) mx = Math.max(mx, R.delta(m, [o], 1));
  ok(mx <= 34, 'nunca se ganan más de 34 PC');
  // --- escudos ---
  let store = { rank: { pts: 190, w: 0, l: 0, best: 190, season: R.seasonId() } };
  R.init(() => store, () => {});
  const play = (S, foe) => R.apply({ S, foes: [foe == null ? store.rank.pts : foe] });
  let r = play(1);                                   // 190 + 24 = 214: sube de Bronce II a Bronce III
  ok(r.rankUp && r.to.label === 'Bronce III' && store.rank.sh === 2, 'subir de peldaño da 2 escudos');
  const floor = 200;
  r = play(0); ok(r.shielded && r.after === floor && !r.rankDown && store.rank.sh === 1, 'primera derrota que bajaría: el escudo te deja en el mínimo del peldaño');
  r = play(0); ok(r.shielded && r.after === floor && store.rank.sh === 0, 'segunda derrota: segundo escudo');
  r = play(0); ok(r.rankDown && r.to.label === 'Bronce II' && store.rank.sh === 0, 'sin escudos, ya baja');
  // una derrota que no baja de peldaño no gasta escudo
  store.rank = { pts: 260, w: 0, l: 0, best: 260, season: R.seasonId(), sh: 2 };
  r = play(0); ok(!r.shielded && r.after < 260 && r.after >= 200 && store.rank.sh === 2, 'derrota dentro del peldaño: resta normal y no gasta escudo');
  // subir de rango (Bronce III → Plata I) también da escudos
  store.rank = { pts: 290, w: 0, l: 0, best: 290, season: R.seasonId(), sh: 0 };
  r = play(1); ok(r.rankUp && r.to.label === 'Plata I' && store.rank.sh === 2, 'subir de rango da 2 escudos');
  r = play(0, store.rank.pts + 600); ok(r.after >= 300, 'el escudo también protege el piso del rango (Plata I)');
  // Bronce I no puede bajar
  store.rank = { pts: 5, w: 0, l: 0, best: 5, season: R.seasonId(), sh: 2 };
  r = play(0); ok(r.after === 0 && !r.shielded && store.rank.sh === 2, 'en 0 PC no se gasta escudo');
  // temporada nueva: sin escudos
  store.rank = { pts: 450, w: 3, l: 1, best: 450, season: '2000-01', sh: 2 };
  R.state(); ok(store.rank.sh === 0, 'al empezar una temporada nueva los escudos se reinician');
};
