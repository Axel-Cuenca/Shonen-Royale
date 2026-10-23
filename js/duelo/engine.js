/* ============ duelo/engine.js — reglas del Duelo Pokémon ============
 * Lógica pura (sin DOM): el mismo código corre en el navegador y en Node.
 * El estado es JSON plano. Quien lleva la partida (tú contra la IA, o el
 * anfitrión en online) llama a apply(); los demás sólo reciben vistas
 * (view) con la información oculta tapada.
 *
 * Reglas (resumen en docs/DUELO.md):
 *   · 8000 PV · mazo de 30 · mano inicial 5 · límite de mano 7
 *   · 3 zonas de monstruo + 3 de magia/trampa
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
 * Habilidades de las cartas propias (campo `ab` de cada carta, ver cards.js):
 *   · cada monstruo en el campo es una «casilla» m con su propio estado: m.uBy[forma] (usos de habilidades
 *     por invocación), m.bonus (aumentos que dura la invocación), m.ext (habilidades robadas o absorbidas),
 *     m.link (cartas vinculadas que siguen su mismo destino), m.abs (personaje absorbido), m.copy (Shang Tsung)
 *   · «turno completo» = un turno numerado del juego (st.turn): lo que pasa entre dos turnos de un jugador
 *   · Titán Martillo ocupa 2 zonas contiguas (m.wide en la primera; la segunda queda «sombreada»)
 *
 * API:  newGame(decks, opts) · actor(st) · legal(st, p) · apply(st, p, action)
 *       view(st, seat)
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});
  const C = () => D.Cards;

  const START_LP = 8000, START_HAND = 5, HAND_MAX = 7, ZONES = 3;
  /** Habilidades que se pueden robar (Kratos), absorber (Cell) o copiar. Las demás son propias de su carta. */
  const GIVE = ['spinach', 'boom', 'instinto', 'sangre', 'canon', 'absorb', 'regen5', 'regen60', 'relicario', 'desmantelar', 'saiyan', 'escudo', 'bigbang'];
  const SHIELD_MAX = 3000;

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

  // ---------------- el monstruo en el campo ----------------
  /** Identidad con la que actúa: la copia de Shang Tsung o su propia carta. */
  const eid = m => m.copy || m.c.id;
  const mdef = m => C().get(eid(m));
  const lvl = m => mdef(m).level;
  /** Estado de uso de las habilidades de la forma actual (cada forma lleva el suyo). */
  function uOf(m) { const k = eid(m), b = m.uBy || (m.uBy = {}); return b[k] || (b[k] = {}); }
  /** Habilidades que puede usar ahora (el dominio de Sukuna apaga las de los personajes de menos de 10 estrellas). */
  function abil(st, m) {
    if (!m) return [];
    if (st.domain && lvl(m) < 10) return [];
    const d = mdef(m);
    return (d.ab || []).concat(m.ext || []);
  }
  const has = (st, m, id) => abil(st, m).includes(id);
  /** Todas las habilidades que tiene la carta, aunque estén apagadas (para robarlas o absorberlas). */
  const rawAbil = m => ((mdef(m).ab || []).concat(m.ext || []));

  function mkSlot(st, inst, o) {
    return Object.assign({ c: inst, pos: 'atk', down: false, summonedTurn: st.turn, attacked: false, moved: false, atkMod: 0 }, o || {});
  }
  const slotByUid = (st, p, uid) => { const P = st.players[p]; for (let z = 0; z < ZONES; z++) if (P.mz[z] && P.mz[z].c.uid === uid) return { p, z, m: P.mz[z] }; return null; };
  function findByUid(st, uid) { for (let p = 0; p < st.n; p++) { const r = slotByUid(st, p, uid); if (r) return r; } return null; }

  // ---------------- zonas de monstruo (Titán Martillo ocupa 2) ----------------
  /** Qué zonas están ocupadas; `free` = zonas que se van a vaciar (tributos). */
  function occ(P, free) {
    const o = new Array(ZONES).fill(false);
    P.mz.forEach((m, z) => { if (m && !(free && free.includes(z))) { o[z] = true; if (m.wide && z + 1 < ZONES) o[z + 1] = true; } });
    return o;
  }
  /** Primera zona donde cabe esa carta (la de la izquierda si ocupa dos), o -1. */
  function spot(P, d, free) {
    const o = occ(P, free);
    if (d.wide) { for (let a = 0; a + 1 < ZONES; a++) if (!o[a] && !o[a + 1]) return a; return -1; }
    return o.indexOf(false);
  }
  const freeN = P => occ(P).filter(x => !x).length;
  const shadowOf = (P, z) => (z > 0 && P.mz[z - 1] && P.mz[z - 1].wide ? z - 1 : -1);
  /** Dónde cabe un Titán que debe cubrir la zona z (la de Lara Tybur). */
  function titanAnchor(P, z, free) {
    const o = occ(P, free);
    for (const a of [z, z - 1]) if (a >= 0 && a + 1 < ZONES && !o[a] && !o[a + 1] && (a === z || a + 1 === z)) return a;
    return -1;
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
      pending: null, chain: null, atk: null, summon: null, trig: [], domain: null,
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
    timers(st);
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
    for (let z = 0; z < ZONES; z++) { if (P.mz[z]) removeMonster(st, p, z, 'grave'); }
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
    const m = P.mz[z];
    let n = 0;
    for (const s of P.st) if (s && !s.down && s.equipTo === z) {
      const d = def(s.c), k = key === 'eAtk' ? 'atk' : 'def';
      n += (d.eType && m && mdef(m).type === d.eType.type) ? d.eType[k] : (d[key] || 0);
    }
    return n;
  }
  const isSolo = P => P.mz.filter(Boolean).length === 1;
  /** Aumentos de habilidades que dependen del momento (iguales para ATK y DEF). */
  function passiveBonus(st, P, z) {
    const m = P.mz[z];
    let n = 0;
    const ab = abil(st, m);
    if (isSolo(P)) { if (ab.includes('instinto')) n += 400; if (ab.includes('sangre')) n += 800; }
    if (st.domain && st.domain.uid === m.c.uid) n += 500;
    if (m.fur && m.fur === st.turn) n += 700;
    return n;
  }
  // m.base: valores propios de esta aparición en el campo (p. ej. Popeye revivido con 1500/1500)
  const baseOf = m => (m.copy ? mdef(m) : (m.base || def(m.c)));
  function atkOf(st, P, z) { const m = P.mz[z]; return Math.max(0, baseOf(m).atk + (m.atkMod || 0) + (m.bonus ? m.bonus.atk : 0) + equipBonus(P, z, 'eAtk') + passiveBonus(st, P, z)); }
  function defOf(st, P, z) { const m = P.mz[z]; return Math.max(0, baseOf(m).def + (m.bonus ? m.bonus.def : 0) + equipBonus(P, z, 'eDef') + passiveBonus(st, P, z)); }
  const shieldOf = m => { const u = uOf(m); if (u.sh == null) u.sh = SHIELD_MAX; return u.sh; };

  /** Saca el monstruo de la zona: sus equipos se destruyen (salvo Karma, que se encarga de sí misma). */
  function takeOff(st, p, z, how) {
    const P = st.players[p], m = P.mz[z];
    if (!m) return null;
    P.mz[z] = null;
    for (let i = 0; i < ZONES; i++) {
      const s = P.st[i];
      if (!s || s.down || s.equipTo !== z) continue;
      if (s.karma && s.karma.phase === 'ally' && how === 'grave') {          // el aliado murió: Karma pasa a un enemigo
        s.equipTo = null; s.karma.phase = 'transfer';
        st.trig.push({ k: 'karma', p, stz: i, uid: s.c.uid });
      } else { P.grave.push(s.c); P.st[i] = null; }
    }
    if (st.domain && st.domain.uid === m.c.uid) { st.domain = null; log(st, -1, 'El dominio termina'); }
    return m;
  }
  /** Un monstruo sale del campo (destruido, tributado o desterrado): él y las cartas vinculadas van al mismo sitio. */
  function removeMonster(st, p, z, how) {
    const P = st.players[p];
    const m = takeOff(st, p, z, how || 'grave');
    if (!m) return null;
    const dest = how === 'banish' ? P.banish : P.grave;
    dest.push(m.c);
    for (const l of (m.link || [])) dest.push(l);
    if (m.abs) releaseAbsorbed(st, m);
    return m;
  }
  const banishMonster = (st, p, z) => removeMonster(st, p, z, 'banish');
  function removeST(st, p, z) {
    const P = st.players[p], s = P.st[z];
    if (!s) return;
    P.st[z] = null;
    P.grave.push(s.c);
  }

  /** Cell muere: el personaje absorbido vuelve al campo de su dueño o, si no hay sitio, a su cementerio. */
  function releaseAbsorbed(st, cell) {
    const r = cell.abs; cell.abs = null;
    if (!r) return;
    const O = st.players[r.owner], d = def(r.c);
    const z = O.alive ? spot(O, d) : -1;
    if (z >= 0) {
      O.mz[z] = mkSlot(st, r.c, { pos: 'atk', link: r.link && r.link.length ? r.link : undefined, wide: !!d.wide });
      r.c.spent = false;
      log(st, r.owner, `${d.name} es liberado y vuelve al campo`);
    } else {
      O.grave.push(r.c); for (const l of (r.link || [])) O.grave.push(l);
      log(st, r.owner, `${d.name} es liberado pero no hay espacio: va al cementerio`);
    }
  }

  // ---------------- destruir ----------------
  /** Destruir un monstruo. ctx = { src: 'combat'|'spell'|'trap'|'power', by: {p, uid} }. Devuelve true si salió del campo. */
  function destroyMonster(st, p, z, ctx) {
    ctx = ctx || { src: 'effect' };
    const P = st.players[p], m = P.mz[z];
    if (!m) return false;
    const ab = abil(st, m), nm = mdef(m).name;
    const fromCard = ctx.src === 'spell' || ctx.src === 'trap';
    if ((fromCard && (ab.includes('regen5') || ab.includes('regen60'))) || (ctx.src === 'power' && ab.includes('regen60'))) {
      log(st, p, `${nm} es inmune: ${ctx.src === 'power' ? 'la habilidad' : 'la carta'} no le afecta`);
      return false;
    }
    if (fromCard && ab.includes('escudo') && shieldOf(m) > 0) {
      uOf(m).sh = 0;
      log(st, p, `El escudo de ${nm} absorbe el efecto y se destruye`);
      return false;
    }
    if (m.copy) { revertCopy(st, m, p); return false; }
    const victimAbs = rawAbil(m);
    const killer = ctx.by ? slotByUid(st, ctx.by.p, ctx.by.uid) : null;
    removeMonster(st, p, z, 'grave');
    if (ab.includes('spinach') && !m.c.spent) st.trig.push({ k: 'spinach', p, uid: m.c.uid });
    if (m.c && def(m.c).ab && def(m.c).ab.includes('bite') && !m.copy) st.trig.push({ k: 'titan', p, uid: m.c.uid, z });
    if (killer) {
      const ku = uOf(killer.m);
      ku.kills = (ku.kills || 0) + 1;
      const kab = abil(st, killer.m);
      const cap = kab.includes('robar2') ? 2 : kab.includes('robar1') ? 1 : 0;
      const opts = victimAbs.filter(a => GIVE.includes(a) && !(killer.m.ext || []).includes(a) && !(mdef(killer.m).ab || []).includes(a));
      if (cap && (ku.stolen || 0) < cap && opts.length) st.trig.push({ k: 'steal', p: killer.p, uid: killer.m.c.uid, from: nm, opts: Array.from(new Set(opts)) });
    }
    return true;
  }
  /** Shang Tsung transformado es derrotado: no muere, pierde la transformación y ya no puede volver a transformarse. */
  function revertCopy(st, m, p) {
    const was = mdef(m).name;
    m.copy = null; m.noCopy = true; m.bonus = null; m.ext = []; m.extFrom = null;
    if (m.abs) releaseAbsorbed(st, m);
    log(st, p, `${was} es derrotado: Shang Tsung pierde la transformación y ya no puede transformarse`);
  }

  // ---------------- habilidades pendientes ----------------
  const handIdx = (P, id) => P.hand.findIndex(c => c.id === id);
  /** Habilidades pendientes: si hay que preguntar al dueño, deja un pending 'ability'. */
  function runTriggers(st) {
    while (st.winner === null && !st.pending && st.trig && st.trig.length) {
      const t = st.trig.shift(), P = st.players[t.p];
      if (!P.alive) continue;
      if (t.k === 'spinach') {
        const inst = P.grave.find(c => c.uid === t.uid);
        if (!inst || inst.spent) continue;
        if (freeN(P) < 1) { log(st, t.p, `${def(inst).name}: no hay espacio en el campo, pierde su habilidad`); continue; }
        st.pending = { k: 'ability', ab: 'spinach', player: t.p, uid: t.uid, stage: 'ask' };
      } else if (t.k === 'steal') {
        const kr = slotByUid(st, t.p, t.uid);
        if (!kr) continue;
        const ku = uOf(kr.m), kab = abil(st, kr.m), cap = kab.includes('robar2') ? 2 : kab.includes('robar1') ? 1 : 0;
        const opts = t.opts.filter(a => !(kr.m.ext || []).includes(a) && !(mdef(kr.m).ab || []).includes(a));
        if (!cap || (ku.stolen || 0) >= cap || !opts.length) continue;
        st.pending = { k: 'ability', ab: 'steal', player: t.p, uid: t.uid, stage: 'ask', from: t.from, opts };
      } else if (t.k === 'titan') {
        const inst = P.grave.find(c => c.uid === t.uid), ti = handIdx(P, 'c_titan');
        if (!inst || ti < 0) continue;
        if (titanAnchor(P, t.z) < 0) { log(st, t.p, 'No hay espacio para Titán Martillo'); continue; }
        st.pending = { k: 'ability', ab: 'titan', player: t.p, uid: t.uid, stage: 'ask', z: t.z };
      } else if (t.k === 'karma') {
        const s = P.st[t.stz];
        if (!s || !s.karma || s.c.uid !== t.uid) continue;
        const cands = [];
        for (const e of foes(st, t.p)) for (const z of zonesWith(st.players[e].mz)) cands.push({ vs: e, z });
        if (!cands.length) { removeST(st, t.p, t.stz); log(st, t.p, 'Karma se destruye: no hay enemigos'); continue; }
        st.pending = { k: 'ability', ab: 'karma', player: t.p, uid: t.uid, stage: 'foe', stz: t.stz, cands };
      }
    }
  }
  /** Revive una carta del cementerio al campo (en ataque). Devuelve la zona o -1. */
  function reviveInst(st, p, inst, from) {
    const P = st.players[p], d = def(inst), z = spot(P, d);
    if (z < 0) return -1;
    const i = (from || P.grave).findIndex(c => c.uid === inst.uid);
    if (i >= 0) (from || P.grave).splice(i, 1);
    inst.spent = false;
    P.mz[z] = mkSlot(st, inst, { pos: 'atk', wide: !!d.wide });
    log(st, p, `revive a ${d.name}`);
    onRevive(st, p, z);
    return z;
  }
  /** «Sangre Saiyan»: al ser revivido vuelve con +500 ATK y +500 DEF durante esa invocación. */
  function onRevive(st, p, z) {
    const m = st.players[p].mz[z];
    if (m && has(st, m, 'saiyan')) {
      m.bonus = m.bonus || { atk: 0, def: 0 };
      m.bonus.atk += 500; m.bonus.def += 500;
      log(st, p, `${mdef(m).name}: Sangre Saiyan (+500 ATK y +500 DEF)`);
    }
  }
  const boomReady = (st, m) => !!m && has(st, m, 'boom') && !m.c.spent;

  // ---------------- magias ----------------
  const monsterCands = (P, f) => P.deck.filter(i => def(i).kind === 'monster' && f(def(i)));
  /** Zonas de monstruos rivales con carta boca arriba. */
  function zoneTargetsUp(st, p) {
    const out = [];
    for (const e of foes(st, p)) for (const z of zonesWith(st.players[e].mz)) if (!st.players[e].mz[z].down) out.push(multi(st) ? { vs: e, z } : { z });
    return out;
  }
  const PERM = { equip: 1, karma: 1, gem: 1, storm: 1 };
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
      targets: (st, p) => (st.players[p].grave.some(i => def(i).kind === 'monster' && spot(st.players[p], def(i)) >= 0)) ? [null] : [],
      resolve: (st, p) => {
        const P = st.players[p];
        const c = P.grave.filter(i => def(i).kind === 'monster' && spot(P, def(i)) >= 0);
        if (c.length) st.pending = { k: 'pick', player: p, zone: 'grave', cands: c.map(i => i.uid), cont: 'revive' };
      }
    },
    destroyOne: {
      targets: (st, p, d) => st.players[p].lp > d.self ? zoneTargets(st, p, 'mz') : [],
      resolve: (st, p, d, t) => {
        const e = foeOf(st, p, t), o = st.players[e];
        if (!t || !o.mz[t.z]) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, `destruye a ${mdef(o.mz[t.z]).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        destroyMonster(st, e, t.z, { src: 'spell' });
        lose(st, p, d.self);
      }
    },
    destroyAll: {
      targets: st => st.players.some(P => zonesWith(P.mz).length) ? [null] : [],
      resolve: st => {
        for (let p = 0; p < st.n; p++) for (let z = 0; z < ZONES; z++) destroyMonster(st, p, z, { src: 'spell' });
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
        log(st, p, `${mdef(m).name} gana ${d.n} ATK este turno`);
      }
    },
    equip: {
      targets: (st, p) => zonesUp(st.players[p]).map(z => ({ z })),
      resolve: () => { /* se coloca en continueSpell */ }
    },
    karma: {
      targets: (st, p) => zonesUp(st.players[p]).map(z => ({ z })),
      resolve: () => { /* se coloca en continueSpell */ }
    },
    // Gema de la Mente: controla a un personaje enemigo (boca arriba)
    gem: {
      targets: (st, p) => zoneTargetsUp(st, p),
      resolve: () => { /* se coloca en continueSpell */ }
    },
    // Tormenta Eléctrica: magia continua con efectos propios (ver spowers)
    storm: {
      targets: () => [null],
      resolve: () => { /* se coloca en continueSpell */ }
    },
    // Superball: invoca de la mano un personaje de hasta 6 estrellas sin gastar la invocación normal
    special: {
      targets: (st, p, d) => {
        const P = st.players[p];
        return P.hand.filter(i => { const c = def(i); return c.kind === 'monster' && !c.sp && c.level <= d.max && spot(P, c) >= 0; }).map(i => ({ u: i.uid }));
      },
      resolve: (st, p, d, t) => {
        const P = st.players[p], i = P.hand.findIndex(c => c.uid === (t && t.u));
        if (i < 0) { log(st, p, 'no tiene objetivo'); return; }
        const c = def(P.hand[i]);
        if (c.level > d.max || spot(P, c) < 0) { log(st, p, 'no hay espacio'); return; }
        const inst = P.hand.splice(i, 1)[0];
        specialSummon(st, p, inst, 'atk');
      }
    }
  };
  /** Invocación especial desde la mano: no gasta la invocación normal y abre la ventana de las trampas de invocación. */
  function specialSummon(st, p, inst, pos) {
    const P = st.players[p], d = def(inst), z = spot(P, d);
    inst.spent = false;
    P.mz[z] = mkSlot(st, inst, { pos: pos || 'atk', wide: !!d.wide });
    log(st, p, `invoca especialmente a ${d.name} (ATK ${atkOf(st, P, z)})`);
    st.summon = { p, z };
    if (openWindow(st, 'summon', { k: 'summon', by: p })) return z;
    st.summon = null;
    return z;
  }
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
    if (PERM[d.fx]) {                                   // equipos y magias continuas: se quedan en el campo
      const z = firstFree(P.st), t = ch.target;
      const tz = (d.fx === 'equip' || d.fx === 'karma') ? (t && t.z) : null;
      const slot = { c: ch.inst, down: false, setTurn: st.turn, equipTo: tz };
      let okp = z >= 0;
      if (d.fx === 'equip' || d.fx === 'karma') okp = okp && !!P.mz[tz];
      if (d.fx === 'karma' && okp) slot.karma = { phase: 'ally', owner: ch.p, allyUid: P.mz[tz].c.uid };
      if (d.fx === 'gem') {
        const tv = foeOf(st, ch.p, t), tm = st.players[tv].mz[t && t.z];
        okp = okp && !!tm && !tm.down;
        if (okp) slot.gem = { vs: tv, uid: tm.c.uid, uses: 0, usedTurn: -1 };
      }
      if (d.fx === 'storm') slot.storm = { usedTurn: -1 };
      if (!okp) { P.grave.push(ch.inst); log(st, ch.p, `${d.name} no tiene objetivo`); return; }
      P.st[z] = slot;
      if (d.fx === 'equip') log(st, ch.p, `equipa ${mdef(P.mz[tz]).name}`);
      else if (d.fx === 'karma') log(st, ch.p, `equipa Karma a ${mdef(P.mz[tz]).name}`);
      else if (d.fx === 'gem') log(st, ch.p, `controla la mente de ${mdef(st.players[slot.gem.vs].mz[t.z]).name}`);
      return;
    }
    P.grave.push(ch.inst);
    FX[d.fx].resolve(st, ch.p, d, ch.target);
  }

  // ---------------- trampas y ventanas de respuesta ----------------
  function trapCands(st, resp, trigger) {
    const R = st.players[resp], r = [];
    if (st.domain) return r;                             // dentro del dominio nadie activa trampas
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
          if (st.players[a.p].mz[a.z]) { log(st, resp, `destruye a ${mdef(st.players[a.p].mz[a.z]).name}`); destroyMonster(st, a.p, a.z, { src: 'trap' }); }
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
          if (m) { log(st, resp, `destruye a ${mdef(m).name}`); destroyMonster(st, s.p, s.z, { src: 'trap' }); }
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
    for (const z of tributes) removeMonster(st, p, z, 'grave');
    const d = def(inst), z = spot(P, d);
    P.mz[z] = mkSlot(st, inst, { pos: faceDown ? 'def' : 'atk', down: !!faceDown, wide: !!d.wide });
    P.normalUsed = true;
    if (tributes.length) log(st, p, `ofrece ${tributes.length} tributo${tributes.length > 1 ? 's' : ''}`);
    if (faceDown) { log(st, p, 'coloca un monstruo boca abajo'); return; }
    log(st, p, `invoca a ${d.name} (ATK ${atkOf(st, P, z)})`);
    st.summon = { p, z };
    if (openWindow(st, 'summon', { k: 'summon', by: p })) return;
    st.summon = null;
  }

  // ---------------- batalla ----------------
  const gemOf = (st, uid) => {
    for (let p = 0; p < st.n; p++) { const P = st.players[p]; for (let i = 0; i < ZONES; i++) { const s = P.st[i]; if (s && s.gem && s.gem.uid === uid) return { p, i, s }; } }
    return null;
  };
  function declareAttack(st, p, z, target, vs) {
    const m = st.players[p].mz[z];
    m.attacked = true;
    if (vs == null) vs = foeOf(st, p, null);
    st.atk = { p, z, target, vs, negated: false };
    log(st, p, target === 'direct' ? `${mdef(m).name} ataca directamente` : `${mdef(m).name} ataca`);
    if (multi(st)) st.log[st.log.length - 1].q = vs;
    // Gema de la Mente: quien controla la mente del atacante puede cancelar el ataque
    const g = !st.domain && gemOf(st, m.c.uid);
    if (g && st.players[g.p].alive && g.s.gem.uses < 2 && g.s.gem.usedTurn !== st.turn) {
      st.pending = { k: 'ability', ab: 'gem', player: g.p, stage: 'ask', uid: m.c.uid, stz: g.i, cont: { k: 'attack', by: p } };
      return;
    }
    attackWindows(st, p);
  }
  function attackWindows(st, p) {
    if (openWindow(st, 'attack', { k: 'attack', by: p })) return;
    continueAttack(st);
  }
  function continueAttack(st) {
    const a = st.atk; st.atk = null;
    if (!a || a.negated || st.winner !== null) return;
    resolveCombat(st, a);
  }
  /** Un combate ya declarado: a = { p, z, target ('direct' o zona), vs }. */
  function resolveCombat(st, a) {
    const vs = a.vs, me = st.players[a.p], op = st.players[vs], at = me.mz[a.z];
    if (!at || !op.alive) return;
    const ad = mdef(at), atker = { p: a.p, uid: at.c.uid };
    if (a.target === 'direct') {
      if (zonesWith(op.mz).length) return;
      const dmg = atkOf(st, me, a.z);
      log(st, a.p, `${ad.name} inflige ${dmg} de daño directo`);
      lose(st, vs, dmg);
      return;
    }
    const dm = op.mz[a.target];
    if (!dm) return;
    const dd = mdef(dm), defender = { p: vs, uid: dm.c.uid };
    if (dm.down) { dm.down = false; log(st, vs, `se revela: ${dd.name}`); }
    let A = atkOf(st, me, a.z);
    // Espada del Rey Arruinado: +500 ATK al atacante y -500 DEF al objetivo sólo durante este combate
    const sword = me.st.some(s => s && !s.down && s.equipTo === a.z && def(s.c).sword);
    const swordN = sword ? me.st.filter(s => s && !s.down && s.equipTo === a.z && def(s.c).sword).reduce((n, s) => n + def(s.c).sword, 0) : 0;
    if (swordN) { A += swordN; log(st, a.p, `${ad.name}: la espada roba ${swordN} de DEF y suma ${swordN} de ATK`); }
    // Explosión del Creeper: si él (o su rival) tiene la habilidad lista, el daño se calcula igual que siempre
    // y después los dos monstruos son desterrados (no importa quién ganara el combate)
    const boom = boomReady(st, at) || boomReady(st, dm);
    const boomName = boomReady(st, at) ? ad.name : dd.name;
    const shielded = has(st, dm, 'escudo') && shieldOf(dm) > 0;
    const kill = (pl, z, nm, by) => { if (!boom) { if (destroyMonster(st, pl, z, { src: 'combat', by })) log(st, -1, `${nm} es destruido`); } };
    if (dm.pos === 'atk') {
      const B = atkOf(st, op, a.target);
      if (A > B) { if (!shielded) { kill(vs, a.target, dd.name, atker); lose(st, vs, A - B); } }
      else if (A === B) { if (!boom) { destroyMonster(st, a.p, a.z, { src: 'combat', by: defender }); if (!shielded) destroyMonster(st, vs, a.target, { src: 'combat', by: atker }); log(st, -1, shielded ? `${ad.name} es destruido` : 'Los dos monstruos son destruidos'); } }
      else { kill(a.p, a.z, ad.name, defender); lose(st, a.p, B - A); }
    } else {
      const B = Math.max(0, defOf(st, op, a.target) - swordN);
      if (A > B) { if (!shielded) kill(vs, a.target, dd.name, atker); }
      else if (A < B) { lose(st, a.p, B - A); log(st, -1, 'El ataque rebota'); }
      else log(st, -1, 'Nadie sufre daño');
    }
    if (shielded && op.mz[a.target] === dm) {
      const left = Math.max(0, shieldOf(dm) - A);
      uOf(dm).sh = left;
      log(st, vs, left > 0 ? `El escudo de ${dd.name} recibe ${A} de daño (${left}/${SHIELD_MAX})` : `El escudo de ${dd.name} se destruye`);
    }
    if (boom) {
      const names = [];
      if (me.mz[a.z] === at) { at.c.spent = at.c.spent || has(st, at, 'boom'); names.push(ad.name); banishMonster(st, a.p, a.z); }
      if (op.mz[a.target] === dm) { dm.c.spent = dm.c.spent || has(st, dm, 'boom'); names.push(dd.name); banishMonster(st, vs, a.target); }
      log(st, -1, `¡${boomName} explota! ${names.join(' y ')} ${names.length > 1 ? 'son desterrados' : 'es desterrado'}`);
    }
  }

  // ---------------- fin de turno y temporizadores ----------------
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
  /** Al empezar un turno: fin del dominio de Sukuna y cuenta atrás de Karma. */
  function timers(st) {
    if (st.domain && st.turn - st.domain.t0 - 1 >= 2) { st.domain = null; log(st, -1, 'El dominio de Sukuna termina'); }
    for (let p = 0; p < st.n; p++) {
      const P = st.players[p];
      if (!P.alive) continue;
      for (let i = 0; i < ZONES; i++) {
        const s = P.st[i];
        if (!s || !s.karma || s.karma.phase !== 'foe' || st.turn - s.karma.t0 - 1 < 3 || st.domain) continue;
        const kz = s.karma;
        const foe = slotByUid(st, kz.foeP, kz.foeUid);
        P.st[i] = null; P.grave.push(s.c);
        log(st, p, 'Karma se cumple');
        if (foe) { log(st, kz.foeP, `${mdef(foe.m).name} muere por Karma`); destroyMonster(st, foe.p, foe.z, { src: 'spell' }); }
        const AP = st.players[kz.allyOwner != null ? kz.allyOwner : p], inst = AP.grave.find(c => c.uid === kz.allyUid);
        if (inst && AP.alive) { if (reviveInst(st, kz.allyOwner != null ? kz.allyOwner : p, inst) < 0) log(st, p, 'No hay espacio para revivir al aliado'); }
      }
    }
  }
  /** Deja limpios los vínculos que se rompieron (objetivo de la Gema o de Karma fuera del campo, dominio sin Sukuna). */
  function sweep(st) {
    for (let p = 0; p < st.n; p++) {
      const P = st.players[p];
      for (let i = 0; i < ZONES; i++) {
        const s = P.st[i];
        if (!s) continue;
        if (s.gem && !findByUid(st, s.gem.uid)) { P.st[i] = null; P.grave.push(s.c); log(st, p, 'La Gema de la Mente pierde su objetivo y se destruye'); }
        else if (s.karma && s.karma.phase === 'foe' && !findByUid(st, s.karma.foeUid)) { P.st[i] = null; P.grave.push(s.c); log(st, p, 'Karma termina: el enemigo dejó el campo'); }
      }
    }
    if (st.domain && !findByUid(st, st.domain.uid)) { st.domain = null; log(st, -1, 'El dominio termina'); }
  }
  /** Primer turno (de la partida) en que se puede atacar: tras la primera ronda si hay más de dos. */
  const canAttackNow = st => st.turn > (st.n > 2 ? st.n : 1);
  /** Deja la partida en un estado jugable tras una acción o una baja: salta turnos y respuestas de quien ya no está. */
  function settle(st) {
    for (let guard = 0; st.winner === null && guard < 16; guard++) {
      const pd = st.pending;
      if (pd && !st.players[pd.player].alive) {
        st.pending = null;
        if (pd.k === 'respond' || pd.cont) afterRespond(st, pd.cont);
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

  /** Tipos distintos de los personajes boca arriba de todos los campos (Shang Tsung pide 3). */
  function typesOnField(st) {
    const s = new Set();
    for (const P of st.players) for (const m of P.mz) if (m && !m.down) s.add(mdef(m).type);
    return s.size;
  }
  /** Turnos completos que pasaron desde que esta forma está en el campo. */
  const turnsOn = (st, m) => st.turn - Math.max(m.summonedTurn, m.since || 0) - 1;
  /** Cartas de la mano a las que puede transformarse este monstruo (índices) y turnos que debe esperar. */
  function xformCands(st, p, z) {
    const P = st.players[p], m = P.mz[z], d = mdef(m), out = [];
    if (m.copy || !d.xform) return out;
    P.hand.forEach((c, i) => {
      const t = def(c);
      if (t.kind !== 'monster' || c.id === m.c.id) return;
      let wait = -1;
      if (d.xform.to) { if (c.id === d.xform.to) wait = d.xform.wait; }
      else if (d.xform.family && t.name.startsWith(d.xform.family)) wait = Math.ceil(Math.abs(t.level - d.level) / 2);
      if (wait < 0 || turnsOn(st, m) < wait) return;
      if (spot(P, t, [z]) < 0 && !(t.wide && titanAnchor(P, z, [z]) >= 0)) return;
      out.push(i);
    });
    return out;
  }
  /** Poderes de los monstruos del jugador: [{ t:'power', zone, pw, ... }]. */
  function powerActs(st, p) {
    const P = st.players[p], out = [], fl = foes(st, p);
    P.mz.forEach((m, z) => {
      if (!m || m.down) return;
      const ab = abil(st, m), u = uOf(m);
      const push = o => out.push(Object.assign({ t: 'power', zone: z }, o));
      if (ab.includes('canon') && canAttackNow(st)) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= 7) push({ pw: 'canon', target: { vs: e, z: tz } }); }
      if (ab.includes('absorb') && !u.absorb) {
        for (let q = 0; q < st.n; q++) for (const tz of zonesWith(st.players[q].mz)) {
          const tm = st.players[q].mz[tz];
          if ((q === p && tz === z) || tm.down || !st.players[q].alive || lvl(tm) > lvl(m)) continue;
          push({ pw: 'absorb', target: { vs: q, z: tz } });
        }
      }
      if (ab.includes('furia') && u.kills > 0 && !u.furia) push({ pw: 'furia' });
      if (ab.includes('bigbang') && !u.bb) push({ pw: 'bigbang' });
      if (ab.includes('relicario') && !u.relic && !st.domain) push({ pw: 'relicario' });
      if (ab.includes('desmantelar') && !u.desm) for (const e of fl) for (const tz of zonesWith(st.players[e].st)) push({ pw: 'desmantelar', target: { vs: e, z: tz } });
      if (ab.includes('bite') && !m.copy && !u.bite && P.lp > 500) {
        P.hand.forEach((c, i) => { if (c.id === 'c_titan' && titanAnchor(P, z, [z]) >= 0) push({ pw: 'bite', hand: i }); });
      }
      for (const i of xformCands(st, p, z)) push({ pw: 'xform', hand: i });
      if (!st.domain || lvl(m) >= 10) {
        // Shang Tsung: puede transformarse una vez por turno en cualquier otro personaje del juego
        const cd = def(m.c);
        if (cd.ab && cd.ab.includes('copy') && !m.noCopy && m.copyTurn !== st.turn) {
          for (const c of C().all()) if (c.kind === 'monster' && c.id !== m.c.id && c.id !== m.copy && !c.test) push({ pw: 'copy', id: c.id });
        }
      }
    });
    return out;
  }
  /** Poderes de las magias continuas (Gema de la Mente y Tormenta Eléctrica). */
  function spowerActs(st, p) {
    const P = st.players[p], out = [];
    if (st.domain) return out;
    P.st.forEach((s, z) => {
      if (!s || s.down) return;
      if (s.gem && s.gem.uses < 2 && s.gem.usedTurn !== st.turn) {
        const tg = findByUid(st, s.gem.uid);
        if (!tg || tg.m.down) return;
        out.push({ t: 'spow', zone: z, pw: 'gempos' });
        if (tg.m.pos === 'atk') {
          for (let q = 0; q < st.n; q++) {
            if (st.team[q] !== st.team[tg.p] || !st.players[q].alive) continue;
            for (const tz of zonesWith(st.players[q].mz)) if (!(q === tg.p && tz === tg.z)) out.push({ t: 'spow', zone: z, pw: 'gematk', target: { vs: q, z: tz } });
          }
        }
      }
      if (s.storm && s.storm.usedTurn !== st.turn) {
        const fl = foes(st, p);
        P.hand.forEach((c, i) => {
          const cd = def(c);
          if (cd.kind === 'monster') {
            for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= cd.level) out.push({ t: 'spow', zone: z, pw: 'storm1', hand: i, target: { vs: e, z: tz } }); }
          } else {
            for (const e of fl) for (const tz of zonesWith(st.players[e].st)) out.push({ t: 'spow', zone: z, pw: 'storm2', hand: i, target: { vs: e, z: tz } });
          }
        });
      }
    });
    return out;
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
        if (pd.ab === 'steal') { for (const a of pd.opts) out.push({ t: 'ability', pick: a }); out.push({ t: 'ability', use: false }); }
        else if (pd.ab === 'karma') { for (const c of pd.cands) out.push({ t: 'ability', vs: c.vs, z: c.z }); }
        else if (pd.stage === 'ask') { out.push({ t: 'ability', use: true }); out.push({ t: 'ability', use: false }); }
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
          if (d.sp) {                                    // sólo invocación especial (Shang Tsung)
            if (d.sp === 'types3' && typesOnField(st) >= 3 && spot(P, d) >= 0) out.push({ t: 'special', hand: i });
            return;
          }
          if (P.normalUsed) return;
          const need = C().tributesFor(d.level);
          if (need > occupied.length) return;
          for (const tr of combos(occupied, need)) {
            if (spot(P, d, tr) < 0) continue;
            out.push({ t: 'summon', hand: i, tributes: tr });
            out.push({ t: 'set', hand: i, tributes: tr });
          }
        } else {
          if (d.kind === 'spell' && !st.domain) {
            const tg = spellTargets(st, p, card);
            const needsZone = !!PERM[d.fx];
            if (tg.length && (!needsZone || freeCount(P.st) > 0)) for (const t of tg) out.push(t ? { t: 'activate', hand: i, target: t } : { t: 'activate', hand: i });
          }
          if (freeCount(P.st) > 0) out.push({ t: 'setst', hand: i });
        }
      });
      if (!st.domain) P.st.forEach((s, z) => {
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
      out.push(...powerActs(st, p), ...spowerActs(st, p));
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
      out.push(...powerActs(st, p).filter(a => ['furia', 'bigbang', 'canon', 'relicario'].includes(a.pw)));
      out.push({ t: 'endTurn' });
    }
    return out;
  }

  // ---------------- poderes ----------------
  function doPower(st, p, a) {
    const P = st.players[p], m = P.mz[a.zone], u = uOf(m), nm = mdef(m).name;
    const ctx = { src: 'power', by: { p, uid: m.c.uid } };
    switch (a.pw) {
      case 'canon': {
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        log(st, p, `${nm} usa Cañón Espiritual Final contra ${mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        destroyMonster(st, e, a.target.z, ctx);
        break;
      }
      case 'absorb': {
        const q = a.target.vs, tz = a.target.z, tm = st.players[q].mz[tz], td = mdef(tm);
        const atk = atkOf(st, st.players[q], tz), df = defOf(st, st.players[q], tz);
        const give = Array.from(new Set(rawAbil(tm).filter(x => GIVE.includes(x))));
        const link = tm.link || [];
        log(st, p, `${nm} absorbe a ${td.name}`);
        if (multi(st)) st.log[st.log.length - 1].q = q;
        takeOff(st, q, tz, 'absorb');
        if (tm.abs) releaseAbsorbed(st, tm);
        u.absorb = true;
        m.abs = { c: tm.c, link, owner: q, atk, def: df };
        m.bonus = m.bonus || { atk: 0, def: 0 };
        m.bonus.atk += Math.floor(atk / 2); m.bonus.def += Math.floor(df / 2);
        m.ext = m.ext || [];
        m.extFrom = m.extFrom || {};
        for (const g of give) if (!m.ext.includes(g) && !(mdef(m).ab || []).includes(g)) { m.ext.push(g); m.extFrom[g] = td.name; }
        log(st, p, `${nm} obtiene +${Math.floor(atk / 2)} ATK y +${Math.floor(df / 2)} DEF${give.length ? ' y su habilidad' : ''}`);
        break;
      }
      case 'furia':
        u.furia = true; m.fur = st.turn;
        log(st, p, `${nm} usa Furia de Esparta: +700 ATK y +700 DEF hasta el final del turno`);
        break;
      case 'bigbang': {
        u.bb = true;
        log(st, p, `${nm} usa Big Bang`);
        for (const e of foes(st, p)) for (let tz = 0; tz < ZONES; tz++) {
          const tm = st.players[e].mz[tz];
          if (tm && atkOf(st, st.players[e], tz) < 2000) destroyMonster(st, e, tz, ctx);
        }
        break;
      }
      case 'relicario':
        u.relic = true;
        st.domain = { p, uid: m.c.uid, t0: st.turn };
        log(st, p, `${nm} activa Relicario Demoníaco: el campo es su dominio`);
        break;
      case 'desmantelar': {
        u.desm = true;
        const e = a.target.vs;
        log(st, p, `${nm} usa Desmantelar`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        removeST(st, e, a.target.z);
        break;
      }
      case 'bite': {
        const ti = a.hand, anchor = titanAnchor(P, a.zone, [a.zone]);
        u.bite = true;
        log(st, p, `${nm} se muerde la mano y pierde 500 PV`);
        lose(st, p, 500);
        if (st.winner !== null || !P.alive) break;
        transformInto(st, p, a.zone, ti, anchor);
        break;
      }
      case 'xform': transformInto(st, p, a.zone, a.hand, null); break;
      case 'copy': {
        const nd = C().get(a.id);
        if (m.abs) releaseAbsorbed(st, m);
        m.bonus = null; m.ext = []; m.extFrom = null;
        m.copy = a.id; m.copyTurn = st.turn;
        log(st, p, `${def(m.c).name} se transforma en ${nd.name}`);
        break;
      }
    }
  }
  /** Transformación con vínculo: la carta de la mano ocupa el sitio del monstruo, que queda vinculado a ella. */
  function transformInto(st, p, z, hi, anchor) {
    const P = st.players[p], old = P.mz[z], oldName = mdef(old).name;
    const inst = P.hand.splice(hi, 1)[0], nd = def(inst);
    inst.spent = false;
    const link = [old.c].concat(old.link || []);
    let nz = z;
    if (nd.wide) { nz = anchor != null && anchor >= 0 ? anchor : titanAnchor(P, z, [z]); }
    P.mz[z] = null;
    P.mz[nz] = mkSlot(st, inst, { pos: old.pos, down: false, summonedTurn: old.summonedTurn, attacked: old.attacked, moved: old.moved, atkMod: old.atkMod || 0, link, since: st.turn, wide: !!nd.wide });
    // los equipos siguen a la nueva forma
    for (const s of P.st) if (s && !s.down && s.equipTo === z) { s.equipTo = nz; if (s.karma && s.karma.phase === 'ally') s.karma.allyUid = inst.uid; }
    if (st.domain && st.domain.uid === old.c.uid) st.domain = null;
    log(st, p, `${oldName} se transforma en ${nd.name}`);
  }
  function doSpower(st, p, a) {
    const P = st.players[p], s = P.st[a.zone], nm = def(s.c).name;
    if (a.pw === 'storm1' || a.pw === 'storm2') {
      const e = a.target.vs, inst = P.hand.splice(a.hand, 1)[0];
      s.storm.usedTurn = st.turn;
      P.grave.push(inst);
      log(st, p, `usa ${nm}: sacrifica ${def(inst).name}`);
      if (multi(st)) st.log[st.log.length - 1].q = e;
      if (a.pw === 'storm1') {
        const tm = st.players[e].mz[a.target.z];
        if (tm) { log(st, e, `${mdef(tm).name} es asesinado`); destroyMonster(st, e, a.target.z, { src: 'spell' }); }
      } else if (st.players[e].st[a.target.z]) { log(st, e, 'una carta de magia/trampa es destruida'); removeST(st, e, a.target.z); }
      return;
    }
    // Gema de la Mente
    const g = s.gem, tg = findByUid(st, g.uid);
    g.uses++; g.usedTurn = st.turn;
    if (a.pw === 'gempos') {
      tg.m.pos = tg.m.pos === 'atk' ? 'def' : 'atk';
      log(st, p, `${nm}: ${mdef(tg.m).name} cambia a ${tg.m.pos === 'atk' ? 'ataque' : 'defensa'}`);
    } else if (a.pw === 'gematk') {
      const t2 = st.players[a.target.vs].mz[a.target.z];
      log(st, p, `${nm}: ${mdef(tg.m).name} es obligado a atacar a ${mdef(t2).name}`);
      resolveCombat(st, { p: tg.p, z: tg.z, target: a.target.z, vs: a.target.vs });
    }
    if (g.uses >= 2 && P.st[a.zone] === s) { P.st[a.zone] = null; P.grave.push(s.c); log(st, p, 'La Gema de la Mente se destruye tras su segundo uso'); }
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
      case 'special': { const inst = P.hand.splice(a.hand, 1)[0]; specialSummon(st, p, inst, 'atk'); break; }
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
        log(st, p, `voltea a ${mdef(m).name} (ATK ${atkOf(st, P, a.zone)})`);
        st.summon = { p, z: a.zone };
        if (!openWindow(st, 'summon', { k: 'summon', by: p })) st.summon = null;
        break;
      }
      case 'pos': {
        const m = P.mz[a.zone];
        m.pos = m.pos === 'atk' ? 'def' : 'atk'; m.moved = true;
        log(st, p, `${mdef(m).name} cambia a ${m.pos === 'atk' ? 'ataque' : 'defensa'}`);
        break;
      }
      case 'power': doPower(st, p, a); break;
      case 'spow': doSpower(st, p, a); break;
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
          const c = P.grave.find(x => x.uid === a.uid);
          if (!c || reviveInst(st, p, c) < 0) { /* sin sitio: se queda en el cementerio */ }
        }
        break;
      }
      case 'ability': abilityAnswer(st, p, a); break;
      case 'discard': {
        const c = P.hand.splice(a.hand, 1)[0];
        P.grave.push(c);
        log(st, p, 'descarta una carta');
        if (P.hand.length <= HAND_MAX) { st.pending = null; finishTurn(st); }
        break;
      }
    }
    sweep(st);
    runTriggers(st);
    settle(st);
    return { ok: true };
  }
  /** Respuesta a una habilidad que preguntó (espinaca de Popeye, robo de Kratos, Titán, Karma, Gema). */
  function abilityAnswer(st, p, a) {
    const pd = st.pending; st.pending = null;
    const P = st.players[p];
    if (pd.ab === 'gem') {
      const s = P.st[pd.stz];
      if (a.use && s && s.gem) {
        s.gem.uses++; s.gem.usedTurn = st.turn;
        if (st.atk) st.atk.negated = true;
        log(st, p, 'La Gema de la Mente cancela el ataque');
        if (s.gem.uses >= 2) { P.st[pd.stz] = null; P.grave.push(s.c); log(st, p, 'La Gema de la Mente se destruye tras su segundo uso'); }
        if (st.atk) { st.atk = null; }
        return;
      }
      attackWindows(st, pd.cont.by);
      return;
    }
    if (pd.ab === 'steal') {
      if (a.use === false) { log(st, p, 'decide no robar su habilidad'); return; }
      const kr = slotByUid(st, p, pd.uid);
      if (!kr) return;
      kr.m.ext = kr.m.ext || []; kr.m.ext.push(a.pick);
      kr.m.extFrom = kr.m.extFrom || {}; kr.m.extFrom[a.pick] = pd.from || null;
      const ku = uOf(kr.m); ku.stolen = (ku.stolen || 0) + 1;
      log(st, p, `${mdef(kr.m).name} roba la habilidad de ${pd.from}`);
      return;
    }
    if (pd.ab === 'titan') {
      if (!a.use) { log(st, p, 'decide no invocar a Titán Martillo'); return; }
      const li = P.grave.findIndex(c => c.uid === pd.uid), ti = handIdx(P, 'c_titan');
      const anchor = titanAnchor(P, pd.z);
      if (li < 0 || ti < 0 || anchor < 0) return;
      const lara = P.grave.splice(li, 1)[0], inst = P.hand.splice(ti, 1)[0];
      inst.spent = false;
      P.mz[anchor] = mkSlot(st, inst, { pos: 'atk', link: [lara], wide: true, since: st.turn, attacked: true });
      log(st, p, `Lara Tybur muere y se invoca especialmente a ${def(inst).name}`);
      return;
    }
    if (pd.ab === 'karma') {
      const s = P.st[pd.stz], tm = st.players[a.vs] && st.players[a.vs].mz[a.z];
      if (!s || !s.karma) return;
      if (!tm) { removeST(st, p, pd.stz); return; }
      s.karma.phase = 'foe'; s.karma.foeP = a.vs; s.karma.foeUid = tm.c.uid; s.karma.t0 = st.turn; s.karma.allyOwner = p;
      log(st, p, `Karma se equipa a ${tm.down ? 'un monstruo boca abajo' : mdef(tm).name}: cuenta atrás de 3 turnos`);
      if (multi(st)) st.log[st.log.length - 1].q = a.vs;
      return;
    }
    // Popeye: ¡A comer espinaca!
    if (pd.stage === 'ask') {
      const i = P.grave.findIndex(c => c.uid === pd.uid), z = i >= 0 ? spot(P, def(P.grave[i])) : -1;
      if (!a.use || i < 0 || z < 0) { if (!a.use) log(st, p, 'decide no usar la habilidad'); return; }
      const c = P.grave.splice(i, 1)[0];
      c.spent = true;
      P.mz[z] = mkSlot(st, c, { pos: 'atk', attacked: true, base: { atk: 1500, def: 1500 }, wide: !!def(c).wide });
      log(st, p, `¡${def(c).name} come espinaca!`);
      log(st, p, `${def(c).name} revive con 1500 ATK y 1500 DEF`);
      onRevive(st, p, z);
      st.pending = { k: 'ability', ab: 'spinach', player: p, uid: c.uid, stage: 'pos', zone: z };
    } else {
      const m = P.mz[pd.zone];
      if (m) { m.pos = a.pos; log(st, p, `${mdef(m).name} queda en ${a.pos === 'atk' ? 'ataque' : 'defensa'}`); }
    }
  }

  // ---------------- vistas (información oculta tapada) ----------------
  /** Estado de uso de una habilidad de un monstruo: 'used' (gastada), 'ready' (disponible) o 'passive' (siempre activa). */
  function useState(m, id) {
    const u = uOf(m);
    if (id === 'bigbang') return u.bb ? 'used' : 'ready';
    if (id === 'relicario') return u.relic ? 'used' : 'ready';
    if (id === 'desmantelar') return u.desm ? 'used' : 'ready';
    if (id === 'absorb') return u.absorb ? 'used' : 'ready';
    if (id === 'furia') return u.furia ? 'used' : 'ready';
    if (id === 'boom' || id === 'spinach') return m.c.spent ? 'used' : 'ready';
    if (id === 'canon') return 'ready';
    return 'passive';
  }
  function slotView(st, P, s, z, own) {
    if (!s) return null;
    if (s.down && !own) return { down: true, pos: s.pos, c: null, atk: 0, def: 0, equipTo: null };
    const v = { down: !!s.down, pos: s.pos, c: { uid: s.c.uid, id: eid(s) }, summonedTurn: s.summonedTurn, attacked: !!s.attacked, moved: !!s.moved };
    if (s.copy) v.real = s.c.id;
    if (def(s.c).kind === 'monster') { v.atk = atkOf(st, P, z); v.def = defOf(st, P, z); }
    if (s.wide) v.wide = true;
    const ab = abil(st, s);
    if (ab.includes('escudo')) v.shield = shieldOf(s);
    if (s.link && s.link.length) v.link = s.link.map(c => c.id);
    if (s.ext && s.ext.length) {
      v.ext = s.ext.slice();
      v.extInfo = s.ext.map(id => ({ id, from: (s.extFrom || {})[id] || null, state: useState(s, id) }));
    }
    const cap = mdef(s).ab && mdef(s).ab.includes('robar2') ? 2 : mdef(s).ab && mdef(s).ab.includes('robar1') ? 1 : 0;
    if (cap) { v.stealCap = cap; v.stealN = (uOf(s).stolen || 0); }
    if (s.abs) v.absorbed = s.abs.c.id;
    if (s.fur && s.fur === st.turn) v.fury = true;
    if (st.domain && st.domain.uid === s.c.uid) v.domain = true;
    if (st.domain && lvl(s) < 10 && (mdef(s).ab || []).length) v.muted = true;
    const u = uOf(s);
    if (u.kills) v.kills = u.kills;
    // Karma puesta sobre este monstruo (de cualquiera): cuenta atrás
    for (let q = 0; q < st.n; q++) for (const k of st.players[q].st) {
      if (k && k.karma && k.karma.phase === 'foe' && k.karma.foeUid === s.c.uid) v.karma = { left: Math.max(0, 3 - (st.turn - k.karma.t0 - 1)), owner: q };
    }
    const gm = gemOf(st, s.c.uid);
    if (gm) v.gem = { owner: gm.p, left: 2 - gm.s.gem.uses };
    return v;
  }
  function stView(s, own, st) {
    if (!s) return null;
    if (s.down && !own) return { down: true, c: null };
    const v = { down: !!s.down, c: { uid: s.c.uid, id: s.c.id }, setTurn: s.setTurn, equipTo: s.equipTo };
    if (s.gem) v.gem = { left: 2 - s.gem.uses, ready: s.gem.usedTurn !== st.turn };
    if (s.storm) v.storm = { ready: s.storm.usedTurn !== st.turn };
    if (s.karma) v.karma = { phase: s.karma.phase, left: s.karma.phase === 'foe' ? Math.max(0, 3 - (st.turn - s.karma.t0 - 1)) : null };
    return v;
  }
  function playerView(st, p, own) {
    const P = st.players[p];
    return {
      seat: p, team: st.team[p], alive: P.alive, lp: P.lp, deckCount: P.deck.length, normalUsed: P.normalUsed,
      hand: own ? P.hand.map(i => ({ uid: i.uid, id: i.id })) : P.hand.map(() => null),
      handCount: P.hand.length,
      grave: P.grave.map(i => ({ uid: i.uid, id: i.id })),
      banish: P.banish.map(i => ({ uid: i.uid, id: i.id })),
      mz: P.mz.map((s, z) => slotView(st, P, s, z, own)),
      shadow: P.mz.map((s, z) => shadowOf(P, z)),
      st: P.st.map(s => stView(s, own, st))
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
        if (pd.k === 'ability') {
          pending.ab = pd.ab; pending.stage = pd.stage;
          const P = st.players[seat], all = P.grave.concat(P.mz.filter(Boolean).map(s => s.c), P.st.filter(Boolean).map(s => s.c));
          pending.card = { uid: pd.uid, id: (all.find(c => c.uid === pd.uid) || {}).id };
          if (pd.opts) { pending.opts = pd.opts.slice(); pending.from = pd.from; }
          if (pd.cands) pending.cands = pd.cands.map(c => ({ vs: c.vs, z: c.z }));
        }
        if (pd.k === 'discard') pending.excess = st.players[seat].hand.length - HAND_MAX;
      } else if (pd.k === 'respond') pending.trigger = pd.trigger;
      else if (pd.k === 'ability') pending.ab = pd.ab;
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
      domain: st.domain ? { seat: st.domain.p, left: Math.max(0, 2 - (st.turn - st.domain.t0 - 1)) } : null,
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
    for (const s of P.mz) if (s) n += 1 + (s.link ? s.link.length : 0);
    for (const s of P.st) if (s) n++;
    if (st.chain && st.chain.p === p) n++;
    // lo absorbido por Cell cuenta para su dueño original
    for (const Q of st.players) for (const s of Q.mz) if (s && s.abs && s.abs.owner === p) n += 1 + (s.abs.link ? s.abs.link.length : 0);
    return n;
  }

  /** Un jugador se rinde (o se desconecta). */
  function resign(st, p, why) {
    if (st.winner !== null || !st.players[p].alive) return;
    eliminate(st, p, why || 'Se rindió.');
    checkWin(st);
    sweep(st);
    settle(st);
  }

  D.Engine = { newGame, actor, legal, apply, view, resign, countCards, foes, START_LP, HAND_MAX, ZONES, GIVE, SHIELD_MAX };
  if (!isBrowser) module.exports = D.Engine;
})();
