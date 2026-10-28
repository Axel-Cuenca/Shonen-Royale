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

  const ZONES = 3;
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
          } else if (['power', 'trap', 'destroy', 'reduce'].includes(pd.trigger)) s = 75;
          else if (pd.trigger === 'spell') s = 70;
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
      if (pd.k === 'ability') {
        if (pd.ab === 'karma' || pd.stage === 'target') {                       // arrastra (o golpea) al rival más fuerte
          let best = L[0], bs = -1;
          for (const a of L) { const m = v.players[a.vs] && v.players[a.vs].mz[a.z]; const sc = m ? (m.atk || 0) + (v.team[a.vs] !== v.team[v.seat] ? 5000 : 0) : 0; if (sc > bs) { bs = sc; best = a; } }
          return best;
        }
        if (pd.ab === 'steal') return L.find(a => a.pick != null) || L[0];
        return L.find(a => a.use === true || a.pos === 'atk') || L[0];
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
          if (!v.legal.some(x => x.t === 'endTurn')) return 30;      // obligada a atacar (Rika sin Yuta ni Anillo)
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
        case 'power': case 'spow': {
          const m = a.t === 'power' ? me.mz[a.zone] : null;
          const tm = a.target && v.players[a.target.vs] ? v.players[a.target.vs].mz[a.target.z] : null;
          switch (a.pw) {
            case 'canon': return 58 + ((tm && tm.atk) || 0) / 100;
            case 'absorb': return tm && v.team[a.target.vs] === v.team[v.seat] ? -1 : 50 + ((tm && tm.atk) || 0) / 200;
            case 'furia': return 55;
            case 'bigbang': return allFoes.some(q => q.mz.some(t => t && (t.down || (t.atk || 0) < 2000))) ? 66 : -1;
            case 'relicario': return info.count >= 2 ? 48 : -1;
            case 'desmantelar': return 47;
            case 'bite': return 36;
            case 'xform': return 61;
            case 'copy': {
              return tm && m && (tm.atk || 0) > m.atk + 300 ? 30 + tm.atk / 100 : -1;
            }
            case 'gempos': return 28;
            case 'gematk': return tm && v.team[a.target.vs] === v.team[v.seat] ? 31 : -1;
            case 'storm1': { const hd = cardOf(me.hand[a.hand]); return 44 + ((tm && tm.atk) || 0) / 100 - hd.atk / 200; }
            case 'storm2': return 40 - cardOf(me.hand[a.hand]).atk / 200 + (cardOf(me.hand[a.hand]).kind === 'monster' ? 0 : 0);
            // ----- tanda 2 -----
            case 'conc': case 'conc2': case 'kaioken': case 'kaioken6': return info.count ? 52 : -1;
            case 'desp': return tm && v.team[a.target.vs] === v.team[v.seat] ? 48 + (tm.atk || 0) / 500 : -1;
            case 'genki': return info.count ? 60 : -1;
            case 'teach': return 40;
            case 'dominio': return info.count >= 2 ? 46 : -1;
            case 'llama': return 55;
            case 'kform': return 56;
            case 'telar': return 38;
            case 'corromper': return 62 + ((tm && tm.atk) || 0) / 200;
            case 'rojo': return 58 + ((tm && tm.atk) || 0) / 200;
            case 'azul': return 55;
            case 'purpura': return a.target && a.target.area === 'mz' ? 64 + ((tm && tm.atk) || 0) / 200 : 45;
            case 'avpred': return 52;
            case 'marca': {                                                  // Gyomei muere a los 3 turnos: sólo si decide el combate o la partida
              if (!m || m.pos !== 'atk') return -1;
              const op = v.opp;
              if (!info.count && m.atk < op.lp && m.atk + 500 >= op.lp) return 95;
              for (const q of allFoes) for (const t of q.mz) if (t && !t.down && t.pos === 'atk' && t.atk >= m.atk && t.atk < m.atk + 500) return 56 + t.atk / 200;
              return -1;
            }
            case 'ydominio': return info.count >= 1 ? 50 : -1;
            // ----- tanda 3 -----
            case 'eren': return 62;
            case 'punos': return v.phase === 'battle' ? 57 : (info.count ? 45 : -1);
            case 'tq': return tm && tm.down ? 44 : (tm && tm.pos === 'atk' && tm.atk >= 1800 ? 46 : -1);
            case 'td': return tm ? 42 + (tm.atk || 0) / 400 : -1;
            case 'tm': return tm ? 56 + (tm.atk || 0) / 300 : -1;
            case 'semilla': return 47;
            case 'armadura': return 57;
            case 'kurama': return info.count ? 54 : 30;
            case 'robo': return 53;
            case 'simb': return -1;
            case 'jkmove': return -1;
          }
          return -1;
        }
        case 'attach': return a.mode === 'venom' ? 55 : (a.mode === 'sword' ? 50 : 46);
        case 'special': return 63;
        case 'couple': return 49 + (me.mz[a.host] && me.mz[a.host].atk ? me.mz[a.host].atk / 400 : 0);
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
            case 'special': {                              // Superball: personaje de 6★ o menos sin gastar invocación
              const hc = a.target && a.target.u != null ? me.hand.find(c => c && c.uid === a.target.u) : null;
              return hc ? 46 + cardOf(hc).atk / 100 : -1;
            }
            case 'gem': case 'storm': return myMons.length || d.fx === 'gem' ? 42 : -1;
            case 'esferas': {
              const w = a.target && a.target.wish;
              if (w === 'heal') return lowLp ? 62 : -1;
              if (w === 'revive') { const best = me.grave.reduce((n, c) => Math.max(n, cardOf(c).kind === 'monster' && cardOf(c).level <= 7 ? cardOf(c).atk : 0), 0); return best >= 1200 ? 56 : -1; }
              if (w === 'summon') return 47;
              return -1;
            }
            case 'cana': return 45;
            case 'uno': { const m = me.mz[a.target.z]; return m && m.pos === 'atk' && info.count ? 44 : -1; }
            case 'pothala': return myMons.length >= 2 && info.count ? 50 : -1;
            case 'gokumon': { const t = opp.mz[a.target.z]; return t ? 60 + (t.atk || 0) / 100 : -1; }
            case 'guerrero': return me.lp > 6000 ? 40 : -1;
            case 'voto': {                                                   // sacrifica la DEF de un aliado a cambio del ATK de un enemigo mucho mayor
              const t = a.target, mine = me.mz[t.z], foe = v.players[t.vs] && v.players[t.vs].mz[t.ez];
              if (!mine || !foe || t.mode !== 1 || mine.pos !== 'atk' || !info.count) return -1;
              const gain = (foe.atk || 0) - (mine.atk || 0);
              return gain >= 600 ? 42 + Math.min(30, gain / 60) : -1;
            }
            case 'karma': {
              const m = me.mz[a.target.z];
              return m && !m.down && info.count ? 41 : -1;
            }
            case 'equip': {
              const m = me.mz[a.target.z];
              if (!m || m.down) return -1;
              if (d.ring1 && !(cardOf(m.c).level >= 7)) return -1;      // el Anillo Único mata a los personajes de pocas estrellas
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
      if (a.t !== 'attack') return scoreMain(v, a, info);        // poderes que se pueden usar en la fase de batalla (Furia, Big Bang, Cañón…)
      const m = v.me.mz[a.zone], opp = targetOf(v, a);
      if (a.vs != null && a.vs === v.seat) return -4;                // Rika obligada a atacar a un aliado: último recurso
      if (a.target === 'direct') return (m.atk >= opp.lp ? 200 : 70) + m.atk / 100 + (8000 - opp.lp) / 400;
      const t = opp.mz[a.target];
      if (t.down) return m.atk >= 1800 ? 38 : -1;
      const att = cardOf(m.c), tgt = cardOf(t.c);
      const A = m.atk;
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

    /** Red de seguridad: si algo falla al decidir, la computadora nunca se queda colgada (termina turno o toma la primera acción legal). */
    function safe(v) {
      try { return chooseView(v); } catch (e) {
        if (typeof console !== 'undefined') console.warn('IA:', e);
        const L = v.legal || [];
        return L.find(a => a.t === 'endTurn') || L.find(a => a.t === 'respond' && !a.activate) || L[0] || null;
      }
    }
    function choose(st, p) { return safe(E().view(st, p)); }
    return { choose, chooseView: safe, level };
  }

  D.AI = { create };
  if (!isBrowser) module.exports = D.AI;
})();
