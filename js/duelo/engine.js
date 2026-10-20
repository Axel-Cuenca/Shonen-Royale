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
 *   · la tabla de tipos suma o resta ATK en combate (±500 / ±1000)
 *   · las trampas se colocan boca abajo y se activan al turno siguiente, como
 *     respuesta a un ataque, una magia o una invocación del rival
 *   · pierdes con 0 PV o si no puedes robar
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
    return { lp: START_LP, deck: [], hand: [], grave: [], mz: new Array(ZONES).fill(null), st: new Array(ZONES).fill(null), normalUsed: false };
  }

  // ---------------- partida nueva ----------------
  function newGame(decks, opts) {
    opts = opts || {};
    const st = {
      turn: 0, phase: 'main', current: 0, first: 0, nextUid: 1,
      seed: (opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff)) | 0,
      players: [mkPlayer(), mkPlayer()],
      pending: null, chain: null, atk: null, summon: null,
      winner: null, reason: '', log: [], logN: 0
    };
    for (let p = 0; p < 2; p++) {
      const P = st.players[p];
      P.deck = shuffle(st, decks[p].map(id => ({ uid: st.nextUid++, id })));
      for (let i = 0; i < START_HAND; i++) P.hand.push(P.deck.shift());
    }
    st.current = opts.first != null ? opts.first : (rnd(st) < 0.5 ? 0 : 1);
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

  function drawCards(st, p, n) {
    const P = st.players[p];
    for (let i = 0; i < n; i++) {
      if (!P.deck.length) { setWinner(st, 1 - p, 'No le quedan cartas para robar.'); return false; }
      P.hand.push(P.deck.shift());
    }
    return true;
  }

  function setWinner(st, w, reason) {
    if (st.winner !== null) return;
    st.winner = w; st.reason = reason; st.pending = null; st.chain = null; st.atk = null;
    log(st, -1, w === 'draw' ? 'Empate.' : 'Fin del duelo.');
  }
  function checkWin(st) {
    const a = st.players[0].lp <= 0, b = st.players[1].lp <= 0;
    if (a && b) setWinner(st, 'draw', 'Los dos llegaron a 0 PV.');
    else if (a) setWinner(st, 1, 'Se quedó sin PV.');
    else if (b) setWinner(st, 0, 'Se quedó sin PV.');
  }
  function lose(st, p, n) {
    const P = st.players[p];
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
  function atkOf(P, z) { const m = P.mz[z]; return Math.max(0, def(m.c).atk + (m.atkMod || 0) + equipBonus(P, z, 'eAtk')); }
  function defOf(P, z) { const m = P.mz[z]; return Math.max(0, def(m.c).def + equipBonus(P, z, 'eDef')); }

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
      targets: (st, p, d) => st.players[p].lp > d.self ? zonesWith(st.players[1 - p].mz).map(z => ({ z })) : [],
      resolve: (st, p, d, t) => {
        const o = st.players[1 - p];
        if (!t || !o.mz[t.z]) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, `destruye a ${def(o.mz[t.z].c).name}`);
        removeMonster(st, 1 - p, t.z);
        lose(st, p, d.self);
      }
    },
    destroyAll: {
      targets: st => (zonesWith(st.players[0].mz).length + zonesWith(st.players[1].mz).length) ? [null] : [],
      resolve: st => {
        for (let p = 0; p < 2; p++) for (let z = 0; z < ZONES; z++) removeMonster(st, p, z);
        log(st, -1, 'Todos los monstruos son destruidos');
      }
    },
    destroyST: {
      targets: (st, p) => zonesWith(st.players[1 - p].st).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const o = st.players[1 - p];
        if (!t || !o.st[t.z]) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, 'destruye una carta de magia/trampa del rival');
        removeST(st, 1 - p, t.z);
      }
    },
    burn: {
      targets: () => [null],
      resolve: (st, p, d) => { log(st, p, `inflige ${d.n} de daño directo`); lose(st, 1 - p, d.n); }
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
      if (trigger === 'summon' && !st.summon) return;
      r.push(z);
    });
    return r;
  }
  /** Abre una ventana para que el rival active una trampa. Devuelve true si hay que esperar su respuesta. */
  function openWindow(st, trigger, cont) {
    const resp = 1 - cont.by;
    const cands = trapCands(st, resp, trigger);
    if (!cands.length) return false;
    st.pending = { k: 'respond', player: resp, trigger, cands, cont };
    return true;
  }
  function applyTrap(st, resp, d) {
    switch (d.fx) {
      case 'negateAttack': if (st.atk) st.atk.negated = true; log(st, resp, 'el ataque es negado'); break;
      case 'destroyAttacker':
        if (st.atk) {
          const a = st.atk;
          if (st.players[a.p].mz[a.z]) { log(st, resp, `destruye a ${def(st.players[a.p].mz[a.z].c).name}`); removeMonster(st, a.p, a.z); }
          a.negated = true;
        }
        break;
      case 'mirror':
        if (st.atk) { st.atk.negated = true; log(st, resp, 'refleja el ataque: el rival pierde 800 PV'); lose(st, 1 - resp, 800); }
        break;
      case 'negateSpell': if (st.chain) st.chain.negated = true; break;
      case 'destroySummoned':
        if (st.summon) {
          const s = st.summon, m = st.players[s.p].mz[s.z];
          if (m) { log(st, resp, `destruye a ${def(m.c).name}`); removeMonster(st, s.p, s.z); }
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
  function declareAttack(st, p, z, target) {
    const m = st.players[p].mz[z];
    m.attacked = true;
    st.atk = { p, z, target, negated: false };
    log(st, p, target === 'direct' ? `${def(m.c).name} ataca directamente` : `${def(m.c).name} ataca`);
    if (openWindow(st, 'attack', { k: 'attack', by: p })) return;
    continueAttack(st);
  }
  function continueAttack(st) {
    const a = st.atk; st.atk = null;
    if (!a || a.negated || st.winner !== null) return;
    const me = st.players[a.p], op = st.players[1 - a.p], at = me.mz[a.z];
    if (!at) return;
    const ad = def(at.c);
    if (a.target === 'direct') {
      if (zonesWith(op.mz).length) return;
      const dmg = atkOf(me, a.z);
      log(st, a.p, `${ad.name} inflige ${dmg} de daño directo`);
      lose(st, 1 - a.p, dmg);
      return;
    }
    const dm = op.mz[a.target];
    if (!dm) return;
    const dd = def(dm.c);
    if (dm.down) { dm.down = false; log(st, 1 - a.p, `se revela: ${dd.name}`); }
    const bonus = C().typeBonus(ad.type, dd.types);
    let A = atkOf(me, a.z) + bonus;
    A = Math.max(0, A);
    if (bonus > 0) log(st, -1, `¡Es muy eficaz! ${ad.name} +${bonus} ATK`);
    else if (bonus < 0) log(st, -1, `No es muy eficaz… ${ad.name} ${bonus} ATK`);
    if (dm.pos === 'atk') {
      const B = atkOf(op, a.target);
      if (A > B) { removeMonster(st, 1 - a.p, a.target); log(st, -1, `${dd.name} es destruido`); lose(st, 1 - a.p, A - B); }
      else if (A === B) { removeMonster(st, a.p, a.z); removeMonster(st, 1 - a.p, a.target); log(st, -1, 'Los dos monstruos son destruidos'); }
      else { removeMonster(st, a.p, a.z); log(st, -1, `${ad.name} es destruido`); lose(st, a.p, B - A); }
    } else {
      const B = defOf(op, a.target);
      if (A > B) { removeMonster(st, 1 - a.p, a.target); log(st, -1, `${dd.name} es destruido`); }
      else if (A < B) { lose(st, a.p, B - A); log(st, -1, 'El ataque rebota'); }
      else log(st, -1, 'Nadie sufre daño');
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
    st.current = 1 - st.current;
    startTurn(st);
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
      if (st.turn > 1 && P.mz.some(m => m && !m.down && m.pos === 'atk')) out.push({ t: 'toBattle' });
      out.push({ t: 'endTurn' });
    } else if (st.phase === 'battle') {
      const O = st.players[1 - p], targets = zonesWith(O.mz);
      P.mz.forEach((m, z) => {
        if (!m || m.down || m.pos !== 'atk' || m.attacked) return;
        if (!targets.length) out.push({ t: 'attack', zone: z, target: 'direct' });
        else for (const tz of targets) out.push({ t: 'attack', zone: z, target: tz });
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
      case 'attack': declareAttack(st, p, a.zone, a.target); break;
      case 'endTurn': endTurn(st); break;
      case 'respond': {
        const pd = st.pending; st.pending = null;
        if (a.activate) {
          const s = P.st[a.zone], d = def(s.c);
          log(st, p, `activa la trampa ${d.name}`);
          applyTrap(st, p, d);
          P.st[a.zone] = null; P.grave.push(s.c);
        }
        if (st.winner === null) afterRespond(st, pd.cont);
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
          const z = firstFree(P.mz);
          if (z >= 0) {
            P.mz[z] = { c, pos: 'atk', down: false, summonedTurn: st.turn, attacked: false, moved: false, atkMod: 0 };
            log(st, p, `revive a ${def(c).name}`);
          } else P.grave.push(c);
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
      lp: P.lp, deckCount: P.deck.length, normalUsed: P.normalUsed,
      hand: own ? P.hand.map(i => ({ uid: i.uid, id: i.id })) : P.hand.map(() => null),
      handCount: P.hand.length,
      grave: P.grave.map(i => ({ uid: i.uid, id: i.id })),
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
      if (pd.player === seat) {
        if (pd.k === 'respond') { pending.trigger = pd.trigger; pending.cands = pd.cands.slice(); }
        if (pd.k === 'pick') {
          pending.zone = pd.zone;
          const P = st.players[seat], src = pd.zone === 'deck' ? P.deck : P.grave;
          pending.cands = pd.cands.map(u => { const c = src.find(x => x.uid === u); return { uid: c.uid, id: c.id }; });
        }
        if (pd.k === 'discard') pending.excess = st.players[seat].hand.length - HAND_MAX;
      } else if (pd.k === 'respond') pending.trigger = pd.trigger;
    }
    return {
      seat, turn: st.turn, phase: st.phase, current: st.current, first: st.first,
      winner: st.winner, reason: st.reason, actor: actor(st),
      me: playerView(st, seat, true), opp: playerView(st, 1 - seat, false),
      pending,
      chain: st.chain ? { p: st.chain.p, c: { uid: st.chain.inst.uid, id: st.chain.inst.id } } : null,
      atk: st.atk ? { p: st.atk.p, z: st.atk.z, target: st.atk.target } : null,
      log: st.log.slice(-60),
      legal: legal(st, seat)
    };
  }

  /** Todas las cartas de un jugador (para comprobar que no se pierde ni se duplica ninguna). */
  function countCards(st, p) {
    const P = st.players[p];
    let n = P.deck.length + P.hand.length + P.grave.length;
    for (const s of P.mz) if (s) n++;
    for (const s of P.st) if (s) n++;
    if (st.chain && st.chain.p === p) n++;
    return n;
  }

  /** Un jugador se rinde (o se desconecta). */
  function resign(st, p, why) { setWinner(st, 1 - p, why || 'Se rindió.'); }

  D.Engine = { newGame, actor, legal, apply, view, resign, countCards, START_LP, HAND_MAX, ZONES };
  if (!isBrowser) module.exports = D.Engine;
})();
