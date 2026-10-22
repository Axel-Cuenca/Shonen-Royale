/* ============ duelo/engine.js — reglas del Duelo Pokémon ============
 * Lógica pura (sin DOM): el mismo código corre en el navegador y en Node.
 * El estado es JSON plano. Quien lleva la partida (tú contra la IA, o el
 * anfitrión en online) llama a apply(); los demás sólo reciben vistas
 * (view) con la información oculta tapada.
 *
 * Reglas (resumen en docs/DUELO.md):
 *   · 8000 PV · mazo de 30 · mano inicial 5 · límite de mano 7
 *   · 5 zonas de monstruo + 5 de magia/trampa
 *   · una invocación normal (o colocar) por turno; nivel 5-6: 1 tributo, 7+: 2
 *   · colocar un monstruo = boca abajo en defensa; se puede voltear a otro turno
 *   · el primer turno de la partida no se roba ni se ataca
 *   · no hay ventajas de tipo: el combate sólo compara ATK y DEF
 *   · las trampas se colocan boca abajo y se activan al turno siguiente, como
 *     respuesta a un ataque, una magia o una invocación del rival
 *   · pierdes con 0 PV o si no puedes robar
 *   · 3-4 jugadores: «todos contra todos» (ffa) o «2 contra 2» (teams, 4 asientos:
 *     0 y 2 contra 1 y 3). Cada uno tiene su campo y sus PV. Se juega en orden de
 *     asiento; el que cae queda fuera (su campo y mano van al cementerio) y se
 *     salta su turno. Gana el último jugador (o equipo) en pie. En la primera
 *     ronda nadie ataca. Las trampas las pueden activar todos los rivales del que
 *     actúa (en un ataque, sólo el atacado), por orden de turno.
 *
 * API:  newGame(decks, opts) · actor(st) · legal(st, p) · apply(st, p, action)
 *       view(st, seat)
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});
  const C = () => D.Cards;

  const START_LP = 8000, START_HAND = 5, HAND_MAX = 7, ZONES = 5;

  // ---------------- utilidades ----------------
  function rnd(st) {
    st.seed = (st.seed + 0x6D2B79F5) | 0;
    let t = st.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const def = inst => C().get(inst.id);
  const firstFree = arr => arr.findIndex(s => !s);
  const freeCount = arr => arr.reduce((n, s) => n + (s ? 0 : 1), 0);
  function log(st, p, t) {
    st.log.push({ n: ++st.logN, p, t });
    if (st.log.length > 120) st.log.splice(0, st.log.length - 120);
  }

  function mkPlayer() {
    return { alive: true, lp: START_LP, deck: [], hand: [], grave: [], banish: [], mz: new Array(ZONES).fill(null), st: new Array(ZONES).fill(null), normalUsed: false };
  }

  // ---------------- partida nueva ----------------
  function newGame(decks, opts) {
    opts = opts || {};
    const n = decks.length;
    if (n < 2 || n > 4) throw new Error('El duelo es de 2 a 4 jugadores.');
    const mode = n === 2 ? 'duel' : (opts.mode === 'teams' && n === 4 ? 'teams' : 'ffa');
    const st = {
      n, mode, team: mode === 'teams' ? [0, 1, 0, 1] : decks.map((_, i) => i),
      turn: 0, phase: 'main', current: 0, first: 0, nextUid: 1,
      seed: (opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff)) | 0,
      players: decks.map(() => mkPlayer()),
      pending: null, chain: null, atk: null, summon: null, trig: [],
      winner: null, reason: '', rank: [], log: [], logN: 0
    };
    for (let p = 0; p < n; p++) {
      const P = st.players[p];
      P.deck = shuffle(st, decks[p].map(id => ({ uid: st.nextUid++, id })));
      for (let i = 0; i < START_HAND; i++) P.hand.push(P.deck.shift());
    }
    st.current = opts.first != null ? opts.first : Math.floor(rnd(st) * n);
    st.first = st.current;
    log(st, -1, '¡Comienza el duelo!');
    startTurn(st);
    return st;
  }

  function startTurn(st) {
    st.turn++;
    const P = st.players[st.current];
    P.normalUsed = false;
    for (const s of P.mz) if (s) { s.attacked = false; s.moved = false; s.atkMod = 0; }
    st.phase = 'main';
    log(st, st.current, `Turno ${st.turn}`);
    if (st.turn > 1) drawCards(st, st.current, 1);
  }
  /** Siguiente asiento con vida, en orden. */
  function nextAlive(st, p) {
    for (let i = 1; i <= st.n; i++) { const q = (p + i) % st.n; if (st.players[q].alive) return q; }
    return p;
  }
  /** Rivales vivos de p (de otro equipo), en orden de turno a partir de p. */
  function foes(st, p) {
    const r = [];
    for (let i = 1; i < st.n; i++) { const q = (p + i) % st.n; if (st.players[q].alive && st.team[q] !== st.team[p]) r.push(q); }
    return r;
  }
  const multi = st => st.n > 2;

  function drawCards(st, p, n) {
    const P = st.players[p];
    for (let i = 0; i < n; i++) {
      if (!P.deck.length) { eliminate(st, p, 'No le quedan cartas para robar.'); checkWin(st); return false; }
      P.hand.push(P.deck.shift());
    }
    return true;
  }

  function setWinner(st, w, reason) {
    if (st.winner !== null) return;
    if (st.chain) { st.players[st.chain.p].grave.push(st.chain.inst); }      // la carta que estaba activándose no se pierde
    st.winner = w; st.reason = reason; st.pending = null; st.chain = null; st.atk = null; st.trig = [];
    log(st, -1, w === 'draw' ? 'Empate.' : 'Fin del duelo.');
  }
  /** Un jugador queda fuera: su mano y su campo van al cementerio. */
  function eliminate(st, p, why) {
    const P = st.players[p];
    if (!P.alive) return;
    P.alive = false; P.lp = 0;
    for (let z = 0; z < ZONES; z++) { if (P.mz[z]) { P.grave.push(P.mz[z].c); P.mz[z] = null; } }
    for (let z = 0; z < ZONES; z++) { if (P.st[z]) { P.grave.push(P.st[z].c); P.st[z] = null; } }
    while (P.hand.length) P.grave.push(P.hand.shift());
    st.rank.push(p);
    st.reason = why;
    if (multi(st)) log(st, p, 'queda fuera del duelo');
  }
  function checkWin(st) {
    if (st.winner !== null) return;
    st.players.forEach((P, p) => { if (P.alive && P.lp <= 0) eliminate(st, p, 'Se quedó sin PV.'); });
    const live = st.players.map((P, p) => p).filter(p => st.players[p].alive);
    if (!live.length) { st.reason = st.n === 2 ? 'Los dos llegaron a 0 PV.' : 'Todos quedaron fuera a la vez.'; setWinner(st, 'draw', st.reason); }
    else if (live.every(p => st.team[p] === st.team[live[0]])) setWinner(st, st.team[live[0]], st.reason);
  }
  function lose(st, p, n) {
    const P = st.players[p];
    if (!P.alive) return;
    P.lp = Math.max(0, P.lp - Math.max(0, n));
    checkWin(st);
  }
  function heal(st, p, n) { st.players[p].lp += n; }

  // ---------------- stats en el campo ----------------
  function equipBonus(P, z, key) {
    let n = 0;
    for (const s of P.st) if (s && !s.down && s.equipTo === z) n += (def(s.c)[key] || 0);
    return n;
  }
  // m.base: valores propios de esta aparición en el campo (p. ej. Popeye revivido con 1500/1500)
  function atkOf(P, z) { const m = P.mz[z]; return Math.max(0, (m.base ? m.base.atk : def(m.c).atk) + (m.atkMod || 0) + equipBonus(P, z, 'eAtk')); }
  function defOf(P, z) { const m = P.mz[z]; return Math.max(0, (m.base ? m.base.def : def(m.c).def) + equipBonus(P, z, 'eDef')); }

  /** Un monstruo sale del campo (destruido o tributado): va al cementerio junto con sus equipos. */
  function removeMonster(st, p, z) {
    const P = st.players[p], m = P.mz[z];
    if (!m) return;
    P.mz[z] = null;
    P.grave.push(m.c);
    for (let i = 0; i < ZONES; i++) {
      const s = P.st[i];
      if (s && !s.down && s.equipTo === z) { P.grave.push(s.c); P.st[i] = null; }
    }
  }
  /** Destruir (en combate o por un efecto): igual que removeMonster, y avisa a las habilidades «al ser destruido». */
  function destroyMonster(st, p, z) {
    const m = st.players[p].mz[z];
    if (!m) return;
    removeMonster(st, p, z);
    if (def(m.c).ability === 'spinach' && !m.c.spent) st.trig.push({ p, uid: m.c.uid });
  }
  /** Habilidades pendientes: si hay que preguntar al dueño, deja un pending 'ability'. */
  function runTriggers(st) {
    while (st.winner === null && !st.pending && st.trig && st.trig.length) {
      const t = st.trig.shift(), P = st.players[t.p];
      const inst = P.grave.find(c => c.uid === t.uid);
      if (!inst || !P.alive || inst.spent) continue;
      if (freeCount(P.mz) < 1) { log(st, t.p, `${def(inst).name}: no hay espacio en el campo, pierde su habilidad`); continue; }
      st.pending = { k: 'ability', player: t.p, uid: t.uid, stage: 'ask' };
    }
  }
  /** Desterrar un monstruo del campo: va a la zona de destierro (no al cementerio, así que no activa nada «al ir al cementerio»). */
  function banishMonster(st, p, z) {
    const P = st.players[p], m = P.mz[z];
    if (!m) return;
    P.mz[z] = null;
    P.banish.push(m.c);
    for (let i = 0; i < ZONES; i++) {                 // sus equipos sí se destruyen (van al cementerio)
      const s = P.st[i];
      if (s && !s.down && s.equipTo === z) { P.grave.push(s.c); P.st[i] = null; }
    }
  }
  const boomReady = m => !!m && def(m.c).ability === 'boom' && !m.c.spent;
  function removeST(st, p, z) {
    const P = st.players[p], s = P.st[z];
    if (!s) return;
    P.st[z] = null;
    P.grave.push(s.c);
  }

  // ---------------- magias ----------------
  const monsterCands = (P, f) => P.deck.filter(i => def(i).kind === 'monster' && f(def(i)));
  const FX = {
    heal: {
      targets: () => [null],
      resolve: (st, p, d) => { heal(st, p, d.n); log(st, p, `recupera ${d.n} PV`); }
    },
    draw: {
      targets: (st, p, d) => st.players[p].deck.length >= d.n ? [null] : [],
      resolve: (st, p, d) => { log(st, p, `roba ${d.n} cartas`); drawCards(st, p, d.n); }
    },
    search: {
      targets: (st, p, d) => searchCands(st, p, d).length ? [null] : [],
      resolve: (st, p, d) => {
        const c = searchCands(st, p, d);
        if (c.length) st.pending = { k: 'pick', player: p, zone: 'deck', cands: c.map(i => i.uid), cont: 'search' };
      }
    },
    revive: {
      targets: (st, p) => (st.players[p].grave.some(i => def(i).kind === 'monster') && freeCount(st.players[p].mz) > 0) ? [null] : [],
      resolve: (st, p) => {
        const P = st.players[p];
        const c = P.grave.filter(i => def(i).kind === 'monster');
        if (c.length && freeCount(P.mz) > 0) st.pending = { k: 'pick', player: p, zone: 'grave', cands: c.map(i => i.uid), cont: 'revive' };
      }
    },
    destroyOne: {
      targets: (st, p, d) => st.players[p].lp > d.self ? zoneTargets(st, p, 'mz') : [],
      resolve: (st, p, d, t) => {
        const e = foeOf(st, p, t), o = st.players[e];
        if (!t || !o.mz[t.z]) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, `destruye a ${def(o.mz[t.z].c).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        destroyMonster(st, e, t.z);
        lose(st, p, d.self);
      }
    },
    destroyAll: {
      targets: st => st.players.some(P => zonesWith(P.mz).length) ? [null] : [],
      resolve: st => {
        for (let p = 0; p < st.n; p++) for (let z = 0; z < ZONES; z++) destroyMonster(st, p, z);
        log(st, -1, 'Todos los monstruos son destruidos');
      }
    },
    destroyST: {
      targets: (st, p) => zoneTargets(st, p, 'st'),
      resolve: (st, p, d, t) => {
        const e = foeOf(st, p, t), o = st.players[e];
        if (!t || !o.st[t.z]) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, 'destruye una carta de magia/trampa del rival');
        if (multi(st)) st.log[st.log.length - 1].q = e;
        removeST(st, e, t.z);
      }
    },
    burn: {
      targets: (st, p) => multi(st) ? foes(st, p).map(vs => ({ vs })) : [null],
      resolve: (st, p, d, t) => { const e = foeOf(st, p, t); log(st, p, `inflige ${d.n} de daño directo`); if (multi(st)) st.log[st.log.length - 1].q = e; lose(st, e, d.n); }
    },
    boost: {
      targets: (st, p) => zonesUp(st.players[p]).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        m.atkMod = (m.atkMod || 0) + d.n;
        log(st, p, `${def(m.c).name} gana ${d.n} ATK este turno`);
      }
    },
    equip: {
      targets: (st, p) => zonesUp(st.players[p]).map(z => ({ z })),
      resolve: () => { /* se coloca en continueSpell */ }
    }
  };
  /** Rival elegido por un objetivo ({vs}) o, en duelo de dos, el único rival. */
  function foeOf(st, p, t) {
    if (t && t.vs != null) return t.vs;
    const f = foes(st, p);
    return f.length ? f[0] : (p + 1) % st.n;
  }
  /** Zonas ocupadas de los rivales: [{z}] en duelo de dos, [{vs, z}] con más jugadores. */
  function zoneTargets(st, p, area) {
    const out = [];
    for (const e of foes(st, p)) for (const z of zonesWith(st.players[e][area])) out.push(multi(st) ? { vs: e, z } : { z });
    return out;
  }
  function zonesWith(arr) { const r = []; arr.forEach((s, i) => { if (s) r.push(i); }); return r; }
  function zonesUp(P) { const r = []; P.mz.forEach((s, i) => { if (s && !s.down) r.push(i); }); return r; }
  function searchCands(st, p, d) {
    return monsterCands(st.players[p], c => (d.max == null || c.level <= d.max) && (d.min == null || c.level >= d.min));
  }
  /** Lista de objetivos posibles para activar esta magia ([] = no se puede; [null] = sin objetivo). */
  function spellTargets(st, p, card) {
    const d = def(card), fx = FX[d.fx];
    return fx ? fx.targets(st, p, d) : [];
  }

  function startSpell(st, p, from, idx, target) {
    const P = st.players[p];
    let inst;
    if (from === 'hand') inst = P.hand.splice(idx, 1)[0];
    else { inst = P.st[idx].c; P.st[idx] = null; }
    st.chain = { p, inst, target, negated: false };
    log(st, p, `activa ${def(inst).name}`);
    if (openWindow(st, 'spell', { k: 'spell', by: p })) return;
    continueSpell(st);
  }
  function continueSpell(st) {
    const ch = st.chain; st.chain = null;
    if (!ch) return;
    const P = st.players[ch.p], d = def(ch.inst);
    if (ch.negated) { P.grave.push(ch.inst); log(st, ch.p, `${d.name} es anulada`); return; }
    if (d.fx === 'equip') {
      const z = firstFree(P.st), tz = ch.target && ch.target.z;
      if (z < 0 || !P.mz[tz]) { P.grave.push(ch.inst); log(st, ch.p, `${d.name} no tiene objetivo`); return; }
      P.st[z] = { c: ch.inst, down: false, setTurn: st.turn, equipTo: tz };
      log(st, ch.p, `equipa ${def(P.mz[tz].c).name}`);
      return;
    }
    P.grave.push(ch.inst);
    FX[d.fx].resolve(st, ch.p, d, ch.target);
  }

  // ---------------- trampas y ventanas de respuesta ----------------
  function trapCands(st, resp, trigger) {
    const R = st.players[resp], r = [];
    R.st.forEach((s, z) => {
      if (!s || !s.down || s.setTurn >= st.turn) return;
      const d = def(s.c);
      if (d.kind !== 'trap' || d.trigger !== trigger) return;
      if (trigger === 'attack' && !st.atk) return;
      if (trigger === 'spell' && !st.chain) return;
      if (trigger === 'summon' && !(st.summon && st.players[st.summon.p].mz[st.summon.z])) return;
      r.push(z);
    });
    return r;
  }
  /** Quién puede responder: en un ataque, el atacado; si no, los rivales del que actúa por orden de turno. */
  function responders(st, trigger, by) {
    if (trigger === 'attack' && st.atk && st.atk.vs != null) return [st.atk.vs];
    return foes(st, by);
  }
  function nextWindow(st, trigger, cont, list) {
    for (let i = 0; i < list.length; i++) {
      const resp = list[i];
      if (!st.players[resp].alive) continue;
      const cands = trapCands(st, resp, trigger);
      if (!cands.length) continue;
      st.pending = { k: 'respond', player: resp, trigger, by: cont.by, cands, cont, rest: list.slice(i + 1) };
      return true;
    }
    return false;
  }
  /** Abre una ventana para que un rival active una trampa. Devuelve true si hay que esperar su respuesta. */
  function openWindow(st, trigger, cont) {
    return nextWindow(st, trigger, cont, responders(st, trigger, cont.by));
  }
  function applyTrap(st, resp, d) {
    switch (d.fx) {
      case 'negateAttack': if (st.atk) st.atk.negated = true; log(st, resp, 'el ataque es negado'); break;
      case 'destroyAttacker':
        if (st.atk) {
          const a = st.atk;
          if (st.players[a.p].mz[a.z]) { log(st, resp, `destruye a ${def(st.players[a.p].mz[a.z].c).name}`); destroyMonster(st, a.p, a.z); }
          a.negated = true;
        }
        break;
      case 'mirror':
        if (st.atk) { st.atk.negated = true; log(st, resp, 'refleja el ataque: el rival pierde 800 PV'); lose(st, st.atk.p, 800); }
        break;
      case 'negateSpell': if (st.chain) st.chain.negated = true; break;
      case 'destroySummoned':
        if (st.summon) {
          const s = st.summon, m = st.players[s.p].mz[s.z];
          if (m) { log(st, resp, `destruye a ${def(m.c).name}`); destroyMonster(st, s.p, s.z); }
        }
        break;
    }
  }
  function afterRespond(st, cont) {
    if (cont.k === 'attack') continueAttack(st);
    else if (cont.k === 'spell') continueSpell(st);
    else if (cont.k === 'summon') st.summon = null;
  }

  // ---------------- invocar ----------------
  function placeMonster(st, p, handIdx, tributes, faceDown) {
    const P = st.players[p];
    const inst = P.hand.splice(handIdx, 1)[0];
    inst.spent = false;
    for (const z of tributes) removeMonster(st, p, z);
    const z = firstFree(P.mz);
    P.mz[z] = { c: inst, pos: faceDown ? 'def' : 'atk', down: !!faceDown, summonedTurn: st.turn, attacked: false, moved: false, atkMod: 0 };
    P.normalUsed = true;
    if (tributes.length) log(st, p, `ofrece ${tributes.length} tributo${tributes.length > 1 ? 's' : ''}`);
    if (faceDown) { log(st, p, 'coloca un monstruo boca abajo'); return; }
    log(st, p, `invoca a ${def(inst).name} (ATK ${atkOf(P, z)})`);
    st.summon = { p, z };
    if (openWindow(st, 'summon', { k: 'summon', by: p })) return;
    st.summon = null;
  }

  // ---------------- batalla ----------------
  function declareAttack(st, p, z, target, vs) {
    const m = st.players[p].mz[z];
    m.attacked = true;
    if (vs == null) vs = foeOf(st, p, null);
    st.atk = { p, z, target, vs, negated: false };
    log(st, p, target === 'direct' ? `${def(m.c).name} ataca directamente` : `${def(m.c).name} ataca`);
    if (multi(st)) st.log[st.log.length - 1].q = vs;
    if (openWindow(st, 'attack', { k: 'attack', by: p })) return;
    continueAttack(st);
  }
  function continueAttack(st) {
    const a = st.atk; st.atk = null;
    if (!a || a.negated || st.winner !== null) return;
    const vs = a.vs, me = st.players[a.p], op = st.players[vs], at = me.mz[a.z];
    if (!at || !op.alive) return;
    const ad = def(at.c);
    if (a.target === 'direct') {
      if (zonesWith(op.mz).length) return;
      const dmg = atkOf(me, a.z);
      log(st, a.p, `${ad.name} inflige ${dmg} de daño directo`);
      lose(st, vs, dmg);
      return;
    }
    const dm = op.mz[a.target];
    if (!dm) return;
    const dd = def(dm.c);
    if (dm.down) { dm.down = false; log(st, vs, `se revela: ${dd.name}`); }
    const A = atkOf(me, a.z);
    // Explosión del Creeper: si él (o su rival) tiene la habilidad lista, el daño se calcula igual que siempre
    // y después los dos monstruos son desterrados (no importa quién ganara el combate)
    const boom = boomReady(at) || boomReady(dm);
    const kill = (pl, z, nm) => { if (!boom) { destroyMonster(st, pl, z); log(st, -1, `${nm} es destruido`); } };
    if (dm.pos === 'atk') {
      const B = atkOf(op, a.target);
      if (A > B) { kill(vs, a.target, dd.name); lose(st, vs, A - B); }
      else if (A === B) { if (!boom) { destroyMonster(st, a.p, a.z); destroyMonster(st, vs, a.target); log(st, -1, 'Los dos monstruos son destruidos'); } }
      else { kill(a.p, a.z, ad.name); lose(st, a.p, B - A); }
    } else {
      const B = defOf(op, a.target);
      if (A > B) kill(vs, a.target, dd.name);
      else if (A < B) { lose(st, a.p, B - A); log(st, -1, 'El ataque rebota'); }
      else log(st, -1, 'Nadie sufre daño');
    }
    if (boom) {
      const names = [];
      if (me.mz[a.z] === at) { at.c.spent = at.c.spent || def(at.c).ability === 'boom'; names.push(ad.name); banishMonster(st, a.p, a.z); }
      if (op.mz[a.target] === dm) { dm.c.spent = dm.c.spent || def(dm.c).ability === 'boom'; names.push(dd.name); banishMonster(st, vs, a.target); }
      log(st, -1, `¡${def(at.c).ability === 'boom' ? ad.name : dd.name} explota! ${names.join(' y ')} ${names.length > 1 ? 'son desterrados' : 'es desterrado'}`);
    }
  }

  // ---------------- fin de turno ----------------
  function endTurn(st) {
    const P = st.players[st.current];
    if (P.hand.length > HAND_MAX) { st.pending = { k: 'discard', player: st.current }; return; }
    finishTurn(st);
  }
  function finishTurn(st) {
    const P = st.players[st.current];
    for (const s of P.mz) if (s) s.atkMod = 0;
    st.current = nextAlive(st, st.current);
    startTurn(st);
  }
  /** Primer turno (de la partida) en que se puede atacar: tras la primera ronda si hay más de dos. */
  const canAttackNow = st => st.turn > (st.n > 2 ? st.n : 1);
  /** Deja la partida en un estado jugable tras una acción o una baja: salta turnos y respuestas de quien ya no está. */
  function settle(st) {
    for (let guard = 0; st.winner === null && guard < 16; guard++) {
      const pd = st.pending;
      if (pd && !st.players[pd.player].alive) {
        st.pending = null;
        if (pd.k === 'respond') afterRespond(st, pd.cont);
        continue;
      }
      if (!st.players[st.current].alive) {
        if (st.chain) { st.players[st.chain.p].grave.push(st.chain.inst); st.chain = null; }
        st.pending = null; st.atk = null; st.summon = null;
        finishTurn(st);
        continue;
      }
      break;
    }
  }

  // ---------------- acciones legales ----------------
  function combos(arr, k) {
    if (k === 0) return [[]];
    const out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  function actor(st) {
    if (st.winner !== null) return -1;
    return st.pending ? st.pending.player : st.current;
  }

  function legal(st, p) {
    const out = [];
    if (st.winner !== null || actor(st) !== p) return out;
    const P = st.players[p];
    const pd = st.pending;
    if (pd) {
      if (pd.k === 'respond') {
        out.push({ t: 'respond', activate: false });
        for (const z of pd.cands) out.push({ t: 'respond', activate: true, zone: z });
      } else if (pd.k === 'pick') {
        for (const u of pd.cands) out.push({ t: 'pick', uid: u });
      } else if (pd.k === 'ability') {
        if (pd.stage === 'ask') { out.push({ t: 'ability', use: true }); out.push({ t: 'ability', use: false }); }
        else { out.push({ t: 'ability', pos: 'atk' }); out.push({ t: 'ability', pos: 'def' }); }
      } else if (pd.k === 'discard') {
        P.hand.forEach((_, i) => out.push({ t: 'discard', hand: i }));
      }
      return out;
    }
    if (st.phase === 'main') {
      const occupied = zonesWith(P.mz);
      P.hand.forEach((card, i) => {
        const d = def(card);
        if (d.kind === 'monster') {
          if (P.normalUsed) return;
          const need = C().tributesFor(d.level);
          if (need > occupied.length) return;
          for (const tr of combos(occupied, need)) {
            if (freeCount(P.mz) + tr.length < 1) continue;
            out.push({ t: 'summon', hand: i, tributes: tr });
            out.push({ t: 'set', hand: i, tributes: tr });
          }
        } else {
          if (d.kind === 'spell') {
            const tg = spellTargets(st, p, card);
            const needsZone = d.fx === 'equip';
            if (tg.length && (!needsZone || freeCount(P.st) > 0)) for (const t of tg) out.push(t ? { t: 'activate', hand: i, target: t } : { t: 'activate', hand: i });
          }
          if (freeCount(P.st) > 0) out.push({ t: 'setst', hand: i });
        }
      });
      P.st.forEach((s, z) => {
        if (!s || !s.down) return;
        const d = def(s.c);
        if (d.kind !== 'spell') return;
        for (const t of spellTargets(st, p, s.c)) out.push(t ? { t: 'activateSet', zone: z, target: t } : { t: 'activateSet', zone: z });
      });
      P.mz.forEach((m, z) => {
        if (!m) return;
        if (m.down && m.summonedTurn < st.turn) out.push({ t: 'flip', zone: z });
        if (!m.down && !m.moved && !m.attacked && m.summonedTurn < st.turn) out.push({ t: 'pos', zone: z });
      });
      if (canAttackNow(st) && P.mz.some(m => m && !m.down && m.pos === 'atk')) out.push({ t: 'toBattle' });
      out.push({ t: 'endTurn' });
    } else if (st.phase === 'battle') {
      const mu = multi(st), fl = foes(st, p);
      P.mz.forEach((m, z) => {
        if (!m || m.down || m.pos !== 'atk' || m.attacked) return;
        for (const e of fl) {
          const targets = zonesWith(st.players[e].mz);
          if (!targets.length) out.push(mu ? { t: 'attack', zone: z, vs: e, target: 'direct' } : { t: 'attack', zone: z, target: 'direct' });
          else for (const tz of targets) out.push(mu ? { t: 'attack', zone: z, vs: e, target: tz } : { t: 'attack', zone: z, target: tz });
        }
      });
      out.push({ t: 'endTurn' });
    }
    return out;
  }

  // ---------------- ejecutar ----------------
  /** Aplica una acción de la lista de legal(). Devuelve { ok } o { ok:false, error }. */
  function apply(st, p, a) {
    if (!a || typeof a !== 'object') return { ok: false, error: 'acción vacía' };
    const key = JSON.stringify(a);
    if (!legal(st, p).some(l => JSON.stringify(l) === key)) return { ok: false, error: 'acción no permitida' };
    const P = st.players[p];
    switch (a.t) {
      case 'summon': placeMonster(st, p, a.hand, a.tributes, false); break;
      case 'set': placeMonster(st, p, a.hand, a.tributes, true); break;
      case 'setst': {
        const inst = P.hand.splice(a.hand, 1)[0];
        P.st[firstFree(P.st)] = { c: inst, down: true, setTurn: st.turn, equipTo: null };
        log(st, p, 'coloca una carta boca abajo');
        break;
      }
      case 'activate': startSpell(st, p, 'hand', a.hand, a.target || null); break;
      case 'activateSet': startSpell(st, p, 'set', a.zone, a.target || null); break;
      case 'flip': {
        const m = P.mz[a.zone];
        m.down = false; m.pos = 'atk'; m.moved = true;
        log(st, p, `voltea a ${def(m.c).name} (ATK ${atkOf(P, a.zone)})`);
        st.summon = { p, z: a.zone };
        if (!openWindow(st, 'summon', { k: 'summon', by: p })) st.summon = null;
        break;
      }
      case 'pos': {
        const m = P.mz[a.zone];
        m.pos = m.pos === 'atk' ? 'def' : 'atk'; m.moved = true;
        log(st, p, `${def(m.c).name} cambia a ${m.pos === 'atk' ? 'ataque' : 'defensa'}`);
        break;
      }
      case 'toBattle': st.phase = 'battle'; log(st, p, 'pasa a la fase de batalla'); break;
      case 'attack': declareAttack(st, p, a.zone, a.target, a.vs); break;
      case 'endTurn': endTurn(st); break;
      case 'respond': {
        const pd = st.pending; st.pending = null;
        if (a.activate) {
          const s = P.st[a.zone], d = def(s.c);
          log(st, p, `activa la trampa ${d.name}`);
          applyTrap(st, p, d);
          P.st[a.zone] = null; P.grave.push(s.c);
        }
        if (st.winner === null) {
          const more = !(pd.trigger === 'spell' && st.chain && st.chain.negated) && pd.rest && pd.rest.length && nextWindow(st, pd.trigger, pd.cont, pd.rest);
          if (!more) afterRespond(st, pd.cont);
        }
        break;
      }
      case 'pick': {
        const pd = st.pending; st.pending = null;
        if (pd.cont === 'search') {
          const i = P.deck.findIndex(c => c.uid === a.uid);
          const c = P.deck.splice(i, 1)[0];
          P.hand.push(c);
          shuffle(st, P.deck);
          log(st, p, 'agrega un monstruo de su mazo a la mano');
        } else if (pd.cont === 'revive') {
          const i = P.grave.findIndex(c => c.uid === a.uid);
          const c = P.grave.splice(i, 1)[0];
          c.spent = false;
          const z = firstFree(P.mz);
          if (z >= 0) {
            P.mz[z] = { c, pos: 'atk', down: false, summonedTurn: st.turn, attacked: false, moved: false, atkMod: 0 };
            log(st, p, `revive a ${def(c).name}`);
          } else P.grave.push(c);
        }
        break;
      }
      case 'ability': {
        const pd = st.pending; st.pending = null;
        if (pd.stage === 'ask') {
          const i = P.grave.findIndex(c => c.uid === pd.uid), z = firstFree(P.mz);
          if (!a.use || i < 0 || z < 0) { if (!a.use) log(st, p, 'decide no usar la habilidad'); break; }
          const c = P.grave.splice(i, 1)[0];
          c.spent = true;
          P.mz[z] = { c, pos: 'atk', down: false, summonedTurn: st.turn, attacked: true, moved: false, atkMod: 0, base: { atk: 1500, def: 1500 } };
          log(st, p, `¡${def(c).name} come espinaca!`);
          log(st, p, `${def(c).name} revive con 1500 ATK y 1500 DEF`);
          st.pending = { k: 'ability', player: p, uid: c.uid, stage: 'pos', zone: z };
        } else {
          const m = P.mz[pd.zone];
          if (m) { m.pos = a.pos; log(st, p, `${def(m.c).name} queda en ${a.pos === 'atk' ? 'ataque' : 'defensa'}`); }
        }
        break;
      }
      case 'discard': {
        const c = P.hand.splice(a.hand, 1)[0];
        P.grave.push(c);
        log(st, p, 'descarta una carta');
        if (P.hand.length <= HAND_MAX) { st.pending = null; finishTurn(st); }
        break;
      }
    }
    runTriggers(st);
    settle(st);
    return { ok: true };
  }

  // ---------------- vistas (información oculta tapada) ----------------
  function slotView(P, s, z, own) {
    if (!s) return null;
    if (s.down && !own) return { down: true, pos: s.pos, c: null, atk: 0, def: 0, equipTo: null };
    const v = { down: !!s.down, pos: s.pos, c: { uid: s.c.uid, id: s.c.id }, summonedTurn: s.summonedTurn, attacked: !!s.attacked, moved: !!s.moved };
    if (def(s.c).kind === 'monster') { v.atk = atkOf(P, z); v.def = defOf(P, z); }
    return v;
  }
  function stView(s, own) {
    if (!s) return null;
    if (s.down && !own) return { down: true, c: null };
    return { down: !!s.down, c: { uid: s.c.uid, id: s.c.id }, setTurn: s.setTurn, equipTo: s.equipTo };
  }
  function playerView(st, p, own) {
    const P = st.players[p];
    return {
      seat: p, team: st.team[p], alive: P.alive, lp: P.lp, deckCount: P.deck.length, normalUsed: P.normalUsed,
      hand: own ? P.hand.map(i => ({ uid: i.uid, id: i.id })) : P.hand.map(() => null),
      handCount: P.hand.length,
      grave: P.grave.map(i => ({ uid: i.uid, id: i.id })),
      banish: P.banish.map(i => ({ uid: i.uid, id: i.id })),
      mz: P.mz.map((s, z) => slotView(P, s, z, own)),
      st: P.st.map(s => stView(s, own))
    };
  }
  /** Lo que ve el jugador `seat`: su mano y sus cartas boca abajo, y nada del rival que esté oculto. */
  function view(st, seat) {
    const pd = st.pending;
    let pending = null;
    if (pd) {
      pending = { k: pd.k, player: pd.player };
      if (pd.by != null) pending.by = pd.by;
      if (pd.player === seat) {
        if (pd.k === 'respond') { pending.trigger = pd.trigger; pending.cands = pd.cands.slice(); }
        if (pd.k === 'pick') {
          pending.zone = pd.zone;
          const P = st.players[seat], src = pd.zone === 'deck' ? P.deck : P.grave;
          pending.cands = pd.cands.map(u => { const c = src.find(x => x.uid === u); return { uid: c.uid, id: c.id }; });
        }
        if (pd.k === 'ability') { pending.stage = pd.stage; pending.card = { uid: pd.uid, id: (st.players[seat].grave.concat(st.players[seat].mz.filter(Boolean).map(s => s.c)).find(c => c.uid === pd.uid) || {}).id }; }
        if (pd.k === 'discard') pending.excess = st.players[seat].hand.length - HAND_MAX;
      } else if (pd.k === 'respond') pending.trigger = pd.trigger;
    }
    const players = st.players.map((_, i) => playerView(st, i, i === seat));
    const fl = foes(st, seat);
    const oppSeat = fl.length ? fl[0] : st.players.findIndex((P, i) => i !== seat && st.team[i] !== st.team[seat]);
    return {
      seat, n: st.n, mode: st.mode, team: st.team.slice(), rank: st.rank.slice(),
      turn: st.turn, phase: st.phase, current: st.current, first: st.first,
      winner: st.winner, reason: st.reason, actor: actor(st),
      me: players[seat], opp: players[oppSeat], players,
      pending,
      chain: st.chain ? { p: st.chain.p, c: { uid: st.chain.inst.uid, id: st.chain.inst.id } } : null,
      atk: st.atk ? { p: st.atk.p, z: st.atk.z, target: st.atk.target, vs: st.atk.vs } : null,
      log: st.log.slice(-60),
      legal: legal(st, seat)
    };
  }

  /** Todas las cartas de un jugador (para comprobar que no se pierde ni se duplica ninguna). */
  function countCards(st, p) {
    const P = st.players[p];
    let n = P.deck.length + P.hand.length + P.grave.length + P.banish.length;
    for (const s of P.mz) if (s) n++;
    for (const s of P.st) if (s) n++;
    if (st.chain && st.chain.p === p) n++;
    return n;
  }

  /** Un jugador se rinde (o se desconecta). */
  function resign(st, p, why) {
    if (st.winner !== null || !st.players[p].alive) return;
    eliminate(st, p, why || 'Se rindió.');
    checkWin(st);
    settle(st);
  }

  D.Engine = { newGame, actor, legal, apply, view, resign, countCards, foes, START_LP, HAND_MAX, ZONES };
  if (!isBrowser) module.exports = D.Engine;
})();
