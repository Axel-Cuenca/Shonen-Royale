/* ============ duelo/arcade.js — modo Arcade (1-nov-2026) ============
 * Una escalera de 10 peldaños + jefe final contra la computadora. Cada peldaño usa TODAS las cartas del
 * juego, pero con el mazo mejor compuesto cuanto más arriba: al principio son cartas casi al azar (curva
 * desordenada, magias flojas); al final, una curva de estrellas sana, un tema (tipo/familia) y las mejores
 * magias y trampas. Además la IA sube de nivel (easy → normal → hard → master).
 * Una derrota (o abandonar) manda de vuelta al peldaño 1.
 *   Arcade.RUNGS · Arcade.deck(peldaño, semilla) → 30 ids · Arcade.rung(n)
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});
  const C = () => D.Cards;

  const BOSS = 11;
  /** Peldaños: nombre, nivel de la IA, calidad del mazo (0..1) y premio en ✦ al ganarlo. */
  const RUNGS = [
    { n: 1, es: 'Aprendiz', en: 'Apprentice', ai: 'easy', q: 0.00, pts: 6 },
    { n: 2, es: 'Novato', en: 'Rookie', ai: 'easy', q: 0.10, pts: 8 },
    { n: 3, es: 'Soldado', en: 'Soldier', ai: 'normal', q: 0.20, pts: 10 },
    { n: 4, es: 'Guerrero', en: 'Warrior', ai: 'normal', q: 0.30, pts: 12 },
    { n: 5, es: 'Veterano', en: 'Veteran', ai: 'normal', q: 0.42, pts: 14 },
    { n: 6, es: 'Capitán', en: 'Captain', ai: 'hard', q: 0.54, pts: 16 },
    { n: 7, es: 'Élite', en: 'Elite', ai: 'hard', q: 0.66, pts: 18 },
    { n: 8, es: 'Maestro', en: 'Master', ai: 'hard', q: 0.78, pts: 20 },
    { n: 9, es: 'Campeón', en: 'Champion', ai: 'hard', q: 0.90, pts: 22 },
    { n: 10, es: 'Leyenda', en: 'Legend', ai: 'master', q: 1.00, pts: 24 },
    { n: BOSS, es: 'Jefe final', en: 'Final boss', ai: 'master', q: 1.00, pts: 60, boss: true }
  ];
  const rung = n => RUNGS[Math.max(1, Math.min(BOSS, n | 0)) - 1];

  function mulberry(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  /** Magias y trampas, de mejor a peor para la computadora (las que usa bien y que cambian una partida). */
  const GOOD_ST = ['c_gokumonkyo', 'c_rayo_solar', 'c_x', 'c_gema_realidad', 'c_pothala', 'c_voto', 'c_esferas', 'c_gema', 'c_gema_poder', 'c_susano', 'c_guerrero',
    'c_infarto', 'c_ola_fuego', 'c_kaioken', 'c_botiquin', 'c_superball', 'c_pokeball', 'c_invitacion', 'c_death_note', 'c_tormenta', 'c_gema_alma', 'c_espada', 'c_armadura',
    'c_mark1', 'c_seleccion_magia', 'c_despertar_bestia', 'c_ultratumba'];
  const bucketOf = lv => (lv <= 4 ? 0 : lv <= 6 ? 1 : lv <= 9 ? 2 : 3);

  /** Valor de un monstruo para el mazo (más es mejor): ataque/defensa, rareza y estrellas. */
  function rate(c) { return (c.atk || 0) / 100 + (c.def || 0) / 250 + (C().rarityOf(c.id) === 'l' ? 4 : C().rarityOf(c.id) === 'e' ? 3 : C().rarityOf(c.id) === 'r' ? 2 : 0) + (c.ab ? c.ab.length : 0) * 0.8; }

  /**
   * Mazo de la computadora para un peldaño (30 cartas, máx. 2 copias).
   * Cuanto mayor es `q`: menos cartas al azar y más cartas elegidas con criterio (curva de estrellas, tema, mejores magias).
   */
  function deck(step, seed) {
    const Cs = C(), r = rung(step), q = r.q, rnd = mulberry((seed == null ? 1 : seed) * 7919 + r.n * 104729 + 13);
    const all = Cs.all().filter(c => /^c_/.test(c.id) && !c.hidden);
    const mons = all.filter(c => c.kind === 'monster' && !c.sp);
    const sts = all.filter(c => c.kind !== 'monster');
    const count = {}, out = [];
    const add = (id, n) => { n = Math.min(n, 2 - (count[id] || 0)); for (let i = 0; i < n && out.length < 30; i++) { out.push(id); count[id] = (count[id] || 0) + 1; } };
    const pickW = (list, wf) => { // sorteo ponderado
      let tot = 0; const ws = list.map(x => { const w = Math.max(0.0001, wf(x)); tot += w; return w; });
      let t = rnd() * tot; for (let i = 0; i < list.length; i++) { t -= ws[i]; if (t <= 0) return list[i]; }
      return list[list.length - 1];
    };
    const nMon = Math.round(14 + 4 * q);                       // 14 monstruos al principio, 18 al final
    // tema del mazo: el tipo con más valor entre los 3 mejores (sorteado); sólo importa desde cierta calidad
    const byType = {};
    for (const c of mons) byType[c.type] = (byType[c.type] || 0) + rate(c);
    const themes = Object.keys(byType).sort((a, b) => byType[b] - byType[a]).slice(0, 3);
    const theme = themes[Math.floor(rnd() * themes.length)];
    const goal = r.boss ? [7, 4, 4, 3] : q >= 0.9 ? [8, 5, 3, 2] : q >= 0.6 ? [8, 5, 4, 1] : [8, 5, 3, 1];      // cuántos monstruos de ≤4★, 5-6★, 7-9★ y 10★+ (curva sana)
    const want = goal.slice(); want[0] += nMon - goal.reduce((a, b) => a + b, 0);
    const have = [0, 0, 0, 0], monsIn = () => have[0] + have[1] + have[2] + have[3];
    const guide = Math.min(1, 0.1 + 0.9 * q);                   // probabilidad de que una carta se elija con criterio
    let guard = 0;
    while (monsIn() < nMon && guard++ < 600) {
      let c;
      if (rnd() < guide) {
        // con criterio: el cubo que más falta; dentro, mejor valor y tema (cuanto mayor q, más afinado)
        const need = [0, 1, 2, 3].filter(b => have[b] < want[b]);
        const b = need.length ? need.reduce((m, x) => (want[x] - have[x] > want[m] - have[m] ? x : m), need[0]) : 0;
        const cand = mons.filter(x => bucketOf(x.level) === b && (count[x.id] || 0) < 2);
        if (!cand.length) { have[b] = want[b]; continue; }
        const mx = Math.max(...cand.map(rate)), mn = Math.min(...cand.map(rate));
        c = pickW(cand, x => Math.exp((r.boss ? 9 : 5) * q * ((rate(x) - mn) / ((mx - mn) || 1))) * (q >= 0.3 && (x.type === theme) ? 1 + 2.5 * q : 1));
      } else {
        const cand = mons.filter(x => (count[x.id] || 0) < 2);                       // al azar entre todas
        c = cand[Math.floor(rnd() * cand.length)];
      }
      if (!c) break;
      const b = bucketOf(c.level), two = q >= 0.45 && b <= 1 && monsIn() + 2 <= nMon, before = out.length;
      add(c.id, two ? 2 : 1);
      have[b] += out.length - before;
    }
    // magias y trampas hasta 30
    let g2 = 0;
    while (out.length < 30 && g2++ < 600) {
      let c;
      if (rnd() < guide) { const cand = GOOD_ST.map(id => Cs.get(id)).filter(x => x && (count[x.id] || 0) < 2); c = cand.length ? pickW(cand, x => Math.exp(-GOOD_ST.indexOf(x.id) / (3 + 8 * (1 - q)))) : null; }
      if (!c) { const cand = sts.filter(x => (count[x.id] || 0) < 2); c = cand.length ? cand[Math.floor(rnd() * cand.length)] : null; }
      if (!c) { const cand = mons.filter(x => (count[x.id] || 0) < 2); c = cand[Math.floor(rnd() * cand.length)]; }
      add(c.id, 1);
    }
    return out.slice(0, 30);
  }

  D.Arcade = { RUNGS, BOSS, rung, deck, GOOD_ST };
  if (!isBrowser) module.exports = D.Arcade;
})();
