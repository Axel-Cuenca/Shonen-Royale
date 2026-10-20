/* ============ duelo/ai.js — el rival de la computadora ============
 * Decide con lo mismo que ve un jugador (la vista de su asiento): su mano y
 * su campo, lo visible del rival, nunca las cartas ocultas.
 *   level 'easy'   : puntúa con ruido y a veces hace una jugada al azar
 *   level 'normal' : puntúa las acciones y hace la mejor
 * choose(st, p) / chooseView(vista) devuelven una de las acciones legales.
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});
  const C = () => D.Cards, E = () => D.Engine;

  function mulberry(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  const ZONES = 5;
  const cardOf = c => c && C().get(c.id);
  const valueOf = d => d.kind === 'monster' ? d.atk / 100 : 15;
  /** Rivales vivos de mi vista (con 3-4 jugadores hay varios). */
  const foesOf = v => v.players.filter(q => q.alive && q.team !== v.team[v.seat]);
  /** El rival al que apunta una acción (o el único rival en un duelo de dos). */
  const targetOf = (v, a) => (a.vs != null ? v.players[a.vs] : a.target && a.target.vs != null ? v.players[a.target.vs] : v.opp);

  function create(level, seed) {
    const rnd = mulberry((seed == null ? Date.now() : seed) | 0);
    const easy = level === 'easy';
    const noise = easy ? 18 : 2;

    function pickPending(v) {
      const pd = v.pending, L = v.legal;
      if (pd.k === 'respond') {
        const acts = L.filter(a => a.activate);
        if (!acts.length) return L[0];
        if (easy && rnd() < 0.45) return L.find(a => !a.activate);
        let best = null, bs = -1;
        for (const a of acts) {
          const d = cardOf(v.me.st[a.zone].c);
          let s = 0;
          if (pd.trigger === 'attack') {
            const atkr = v.atk && v.players[v.atk.p].mz[v.atk.z];
            s = d.fx === 'destroyAttacker' ? 90 : d.fx === 'mirror' ? 80 : 60;
            if (atkr && atkr.atk < 500 && d.fx !== 'destroyAttacker') s = 20;
          } else if (pd.trigger === 'spell') s = 70;
          else if (pd.trigger === 'summon') s = 70;
          if (s > bs) { bs = s; best = a; }
        }
        return bs >= 30 ? best : L.find(a => !a.activate);
      }
      if (pd.k === 'pick') {
        let best = L[0], bs = -1e9;
        const myMons = v.me.mz.filter(Boolean).length;
        for (const a of L) {
          const c = pd.cands.find(x => x.uid === a.uid), d = cardOf(c);
          const need = C().tributesFor(d.level);
          const s = pd.zone === 'grave' ? d.atk : d.atk - Math.max(0, need - myMons) * 1500 + rnd() * 50;
          if (s > bs) { bs = s; best = a; }
        }
        return best;
      }
      if (pd.k === 'discard') {
        let best = L[0], bs = 1e9;
        const myMons = v.me.mz.filter(Boolean).length;
        for (const a of L) {
          const d = cardOf(v.me.hand[a.hand]);
          let s = valueOf(d);
          if (d.kind === 'monster' && C().tributesFor(d.level) > myMons) s -= 6;
          if (s < bs) { bs = s; best = a; }
        }
        return best;
      }
      return L[0];
    }

    // fuerza del campo rival visible
    function oppInfo(v) {
      let maxAtk = 0, faceDown = 0, count = 0, power = 0;
      for (const q of foesOf(v)) for (const m of q.mz) {
        if (!m) continue;
        count++;
        if (m.down) { faceDown++; power += 1400; continue; }
        power += m.pos === 'atk' ? m.atk : m.def;
        if (m.pos === 'atk') maxAtk = Math.max(maxAtk, m.atk);
        else maxAtk = Math.max(maxAtk, Math.floor(m.def * 0.6));
      }
      return { maxAtk: Math.max(maxAtk, faceDown ? 1400 : 0), count, power, faceDown };
    }

    function scoreMain(v, a, info) {
      const me = v.me, opp = targetOf(v, a);
      const allFoes = foesOf(v);
      const myMons = me.mz.filter(Boolean);
      const myBest = myMons.reduce((n, m) => Math.max(n, m.atk || 0), 0);
      const myPower = myMons.reduce((n, m) => n + (m.pos === 'atk' ? m.atk : m.def), 0);
      switch (a.t) {
        case 'endTurn': return 1;
        case 'toBattle': {
          // ¿hay algún ataque que valga la pena?
          let good = false;
          for (const m of me.mz) {
            if (!m || m.down || m.pos !== 'atk') continue;
            if (!info.count) good = true;
            else for (const q of allFoes) for (const t of q.mz) { if (t && !t.down && ((t.pos === 'atk' && m.atk > t.atk) || (t.pos === 'def' && m.atk > t.def))) good = true; }
            if (info.faceDown && m.atk >= 1800) good = true;
          }
          return good ? 20 : -1;
        }
        case 'summon': case 'set': {
          const d = cardOf(me.hand[a.hand]);
          const lost = a.tributes.reduce((n, z) => n + (me.mz[z].atk || 0), 0);
          const gain = d.atk - lost;
          if (a.tributes.length && gain < 300) return -1;
          const strongEnough = !info.count || d.atk >= info.maxAtk * 0.95;
          const canWall = d.def >= info.maxAtk;
          if (a.t === 'summon') return strongEnough ? 40 + gain / 100 : (canWall ? -1 : 38 + gain / 200);
          return strongEnough ? 30 + gain / 200 : (canWall ? 42 + d.def / 200 : 35 + d.def / 300);
        }
        case 'setst': {
          const d = cardOf(me.hand[a.hand]);
          return d.kind === 'trap' ? 47 : 12;
        }
        case 'flip': {
          const m = me.mz[a.zone];
          return m.atk >= info.maxAtk ? 34 + m.atk / 200 : -1;
        }
        case 'pos': {
          const m = me.mz[a.zone];
          if (m.pos === 'def') return (!info.count || m.atk >= info.maxAtk) ? 30 : -1;
          return (m.atk < info.maxAtk * 0.8 && m.def >= info.maxAtk * 0.8) ? 26 : -1;
        }
        case 'activate': case 'activateSet': {
          const card = a.t === 'activate' ? me.hand[a.hand] : me.st[a.zone].c;
          const d = cardOf(card);
          const lowLp = me.lp <= 4500;
          switch (d.fx) {
            case 'heal': return lowLp ? 60 + (8000 - me.lp) / 100 : -1;
            case 'draw': return 55;
            case 'search': return 50 + (me.hand.some(c => c && cardOf(c).kind === 'monster') ? 0 : 20);
            case 'revive': {
              const best = me.grave.reduce((n, c) => Math.max(n, cardOf(c).kind === 'monster' ? cardOf(c).atk : 0), 0);
              return best >= 1200 ? 52 + best / 400 : -1;
            }
            case 'destroyOne': {
              const t = opp.mz[a.target.z];
              const tv = t.down ? 1400 : (t.pos === 'atk' ? t.atk : t.def);
              return (tv > myBest * 0.8 || tv >= 1800) ? 40 + tv / 60 : -1;
            }
            case 'destroyAll': {
              const ally = v.players.filter(q => q.seat !== v.seat && q.alive && q.team === v.team[v.seat]).reduce((n, q) => n + q.mz.reduce((k, m) => k + (m ? (m.down ? 1400 : m.pos === 'atk' ? m.atk : m.def) : 0), 0), 0);
              return (info.power > myPower + ally + 600 && info.count >= 2) ? 62 : -1;
            }
            case 'destroyST': return opp.st.filter(Boolean).length ? 44 : -1;
            case 'burn': return opp.lp <= d.n ? 120 : 33 + (8000 - opp.lp) / 500;
            case 'boost': {
              const m = me.mz[a.target.z];
              if (!m || m.pos !== 'atk') return -1;
              for (const t of allFoes.flatMap(q => q.mz)) {
                if (!t || t.down) continue;
                const th = t.pos === 'atk' ? t.atk : t.def;
                if (m.atk <= th && m.atk + d.n > th) return 54;
              }
              return !info.count ? 24 : -1;
            }
            case 'equip': {
              const m = me.mz[a.target.z];
              if (!m || m.down) return -1;
              return 44 + (m.atk >= myBest ? 6 : 0);
            }
          }
          return -1;
        }
      }
      return -1;
    }

    function scoreBattle(v, a, info) {
      if (a.t === 'endTurn') return 0;
      const m = v.me.mz[a.zone], opp = targetOf(v, a);
      if (a.target === 'direct') return (m.atk >= opp.lp ? 200 : 70) + m.atk / 100 + (8000 - opp.lp) / 400;
      const t = opp.mz[a.target];
      if (t.down) return m.atk >= 1800 ? 38 : -1;
      const att = cardOf(m.c), tgt = cardOf(t.c);
      const A = Math.max(0, m.atk + C().typeBonus(att.type, tgt.types));
      if (t.pos === 'atk') {
        if (A > t.atk) return 60 + (A - t.atk) / 100 + t.atk / 100;
        if (A === t.atk) return tgt.atk > att.atk ? 40 : -1;
        return -1;
      }
      return A > t.def ? 52 + t.def / 200 : -1;
    }

    /** Elige una acción a partir de la vista de su asiento (sirve igual para un asiento remoto). */
    function chooseView(v) {
      const L = v.legal;
      if (!L.length) return null;
      if (v.pending) return pickPending(v);
      if (easy && rnd() < 0.18) {
        const rest = L.filter(a => a.t !== 'endTurn');
        if (rest.length) return rest[Math.floor(rnd() * rest.length)];
      }
      const info = oppInfo(v);
      const battle = v.phase === 'battle';
      let best = null, bs = -1e9;
      for (const a of L) {
        const s = (battle ? scoreBattle(v, a, info) : scoreMain(v, a, info)) + (rnd() - 0.5) * noise;
        if (s > bs) { bs = s; best = a; }
      }
      const floor = battle ? 0 : 1;
      if (bs <= floor + (easy ? 0 : 0)) return L.find(a => a.t === 'endTurn') || best;
      return best;
    }

    function choose(st, p) { return chooseView(E().view(st, p)); }
    return { choose, chooseView, level };
  }

  D.AI = { create };
  if (!isBrowser) module.exports = D.AI;
})();
