/* Arcade (1-nov-2026): mazos por peldaño, niveles de la IA, progreso y premios. Se carga desde tools/test_duelo.js. */
'use strict';
module.exports = function (T) {
  const { ok, eq, section, Cards: C, E } = T;
  section('Arcade: mazos por peldaño');
  global.window = global.window || global;
  require('../js/duelo/arcade.js'); require('../js/duelo/ai.js');
  const A = global.Duelo.Arcade, AI = global.Duelo.AI;
  eq([A.RUNGS.length, A.BOSS], [11, 11], '10 peldaños + jefe final');
  eq(A.RUNGS.map(r => r.ai), ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard', 'hard', 'master', 'master'], 'la IA sube de nivel');
  ok(A.RUNGS.every((r, i) => r.n === i + 1 && (i === 0 || r.q >= A.RUNGS[i - 1].q)), 'la calidad del mazo nunca baja');
  let bad = 0;
  const stat = [];
  for (let s = 1; s <= 11; s++) {
    let atk = 0, nm = 0, good = 0, low = 0, n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const d = A.deck(s, seed);
      if (C.checkDeck(d)) { bad++; continue; }
      n++;
      for (const id of d) { const c = C.get(id); if (c.kind === 'monster') { atk += c.atk; nm++; if (c.level <= 4) low++; } else if (A.GOOD_ST.slice(0, 12).includes(id)) good++; }
    }
    stat.push({ atk: atk / nm, good: good / n, low: low / n });
  }
  eq(bad, 0, 'todos los mazos del Arcade son válidos (30 cartas, máx. 2 copias)');
  ok(stat[10].atk > stat[0].atk + 150, 'el jefe usa monstruos más fuertes que el peldaño 1');
  ok(stat[9].good > stat[0].good + 3, 'los peldaños altos llevan mejores magias y trampas');
  ok(stat[10].low >= 7 && stat[0].low < stat[10].low + 3, 'los altos tienen una curva con suficientes cartas de pocas estrellas para sacrificar');
  eq(A.deck(5, 7), A.deck(5, 7), 'con la misma semilla el mazo es el mismo');
  ok(JSON.stringify(A.deck(5, 7)) !== JSON.stringify(A.deck(5, 8)), 'con otra semilla cambia');
  // las partidas con estos mazos y los niveles nuevos terminan sin colgarse
  let stuck = 0;
  for (const s of [1, 6, 10, 11]) {
    const r = A.rung(s), st = E.newGame([A.deck(11, 3), A.deck(s, 4)], { seed: 50 + s, first: 0 });
    const ais = [AI.create('normal', 1), AI.create(r.ai, 2)];
    let n = 0;
    while (st.winner === null && n++ < 3000) { const p = E.actor(st); if (p < 0) break; const a = ais[p].choose(st, p); if (!a) break; if (!E.apply(st, p, a).ok) E.apply(st, p, { t: 'endTurn' }); }
    if (st.winner === null) stuck++;
    ok([0, 1].every(q => E.countCards(st, q) === 30), 'Arcade ' + s + ': no se pierde ninguna carta');
  }
  eq(stuck, 0, 'las partidas del Arcade terminan');

  section('Arcade: progreso y premios');
  for (const f of ['seasons', 'shop']) { delete require.cache[require.resolve('../js/duelo/' + f + '.js')]; require('../js/duelo/' + f + '.js'); }
  const SH = global.window.Duelo.Shop;
  let store = { pts: {} }; SH.init(() => store, () => {});
  eq([SH.arcade().cur, SH.arcade().best, SH.arcade().clears], [1, 0, 0], 'empieza en el peldaño 1');
  const c0 = SH.coins();
  let r = SH.arcadeEnd(1, true);
  eq([r.next, r.pts, SH.coins() - c0, SH.arcade().best], [2, 6, 6, 1], 'ganar el 1 da ✦ 6 y pasa al 2');
  SH.arcadeBegin(2); SH.arcadeEnd(2, true); SH.arcadeBegin(3);
  eq(SH.arcade().cur, 1, 'cerrar la página a medias de un combate cuenta como derrota: vuelve al peldaño 1');
  eq(SH.arcade().best, 2, 'el mejor peldaño se conserva');
  for (let s = 1; s <= 10; s++) { SH.arcadeBegin(s); r = SH.arcadeEnd(s, true); }
  eq(SH.arcade().cur, 11, 'tras el 10 sube el jefe');
  r = SH.arcadeEnd(11, true);
  ok(r.done && SH.arcade().cur === 1 && SH.arcade().clears === 1, 'ganar al jefe completa la escalera y se reinicia');
  ok(SH.arcade().got <= SH.ARC_CAP, 'respeta el tope diario de ✦ (' + SH.arcade().got + '/' + SH.ARC_CAP + ')');
  const before = SH.coins(); SH.arcadeEnd(1, true);
  eq(SH.coins(), before, 'con el tope diario agotado ya no da ✦');
  r = SH.arcadeEnd(5, false);
  ok(r.lost && SH.arcade().cur === 1, 'perder vuelve al peldaño 1');
};
