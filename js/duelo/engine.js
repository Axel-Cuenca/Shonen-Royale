/* ============ duelo/engine.js — reglas de Shonen Royale ============
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
 *   · «turno» = una RONDA: pasa cuando todos los jugadores han jugado (st.round; st.turn cuenta el turno de cada jugador). Las duraciones («durante 3 turnos»…) cuentan rondas completas con elapsed()
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
  /** Habilidades que Sylas puede robar y Venom aprender (las que funcionan en cualquier personaje que las tenga). */
  const STEALABLE = GIVE.concat(['furia', 'zenitsu1', 'zenitsu2', 'gyomei1', 'gyomei2', 'gyomei3', 'patriarca', 'kaioken', 'jogodom', 'llama', 'sentido', 'telar', 'corrupt', 'asimila', 'espada', 'muerte',
    'regenx', 'resis', 'punos', 'toge', 'semilla', 'kurama', 'hiraishin']);
  const SHIELD_MAX = 3000;
  const SUSANO_SH = 2300, SHEN_SH = 1000, SIX_TURNS = 3;

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
    return { alive: true, lp: START_LP, deck: [], hand: [], grave: [], banish: [], mz: new Array(ZONES).fill(null), st: new Array(ZONES).fill(null), normalUsed: false, sealed: [] };
  }

  // ---------------- el monstruo en el campo ----------------
  /** Identidad con la que actúa: la copia de Shang Tsung, la forma de Kayn o su propia carta. */
  const eid = m => m.copy || m.form || m.c.id;
  const mdef = m => C().get(eid(m));
  const lvl = m => mdef(m).level;
  /** Estado de uso de las habilidades de la forma actual (cada forma lleva el suyo). */
  function uOf(m) { const k = eid(m), b = m.uBy || (m.uBy = {}); return b[k] || (b[k] = {}); }
  /** Todas las habilidades que tiene la carta, aunque estén apagadas (para robarlas o absorberlas). La fusión de Pothala suma las del compañero. */
  const rawAbil = m => { const d = mdef(m); let a = (d.ab || []).concat(m.ext || []); if (m.fused) a = a.concat(mdef(m.fused.b).ab || [], m.fused.b.ext || []); return a; };
  /** Habilidades que puede usar ahora (los dominios apagan las de los personajes de pocas estrellas; las selladas por Telarañas no cuentan). */
  function abil(st, m) {
    if (!m) return [];
    if (st.domain && lvl(m) < (st.domain.min || 10) && st.domain.uid !== m.c.uid) return [];
    if (m.price) return [];                                                  // Guantelete del Infinito: el precio del poder
    let a = rawAbil(m);
    if (m.sealed && m.sealed.length) a = a.filter(x => !m.sealed.some(q => q.ab === x));
    if (m.spentAb && m.spentAb.length) a = a.filter(x => !m.spentAb.includes(x));      // X: habilidades consumidas para siempre
    return (a.includes('gogres') || m.camu) ? a.concat('rikaprot') : a;      // Rengar: Camuflaje, igual de inmune a magias y trampas
    // Gogeta: Resistencia absoluta = inmune a las magias y trampas
  }
  const has = (st, m, id) => abil(st, m).includes(id);
  // ---------------- tanda 6 (05-11-2026): utilidades compartidas ----------------
  /** Criaturas de tinta de Sai: fichas, no cartas (no van a ninguna pila, no se cuentan, no se sacrifican). */
  const isInk = m => !!m && !!m.c && !!(C().get(m.c.id) || {}).ink;
  /** Soldados de las sombras: Igris, Beru, Bellion (se invoquen como se invoquen) y lo que levanta Sung Jin-Woo. */
  const SOLDIER_IDS = ['c_igris', 'c_beru', 'c_bellion'];
  const isSoldier = m => !!m && !m.down && (!!m.shadow || SOLDIER_IDS.includes(m.c.id));
  const soldiersOf = P => P.mz.filter(isSoldier).length;
  /** Hay un Sung Jin-Woo (o su Monarca) boca arriba en el campo de q. */
  const sungOn = (st, q) => st.players[q].mz.some(x => x && !x.down && has(st, x, 'sjdom'));
  /** Dominio de las sombras: un efecto de un rival no puede controlar, robar ni absorber a este soldado. */
  const shadowSafe = (st, byP, q, z) => { const m = st.players[q].mz[z]; return !!m && st.team[byP] !== st.team[q] && isSoldier(m) && sungOn(st, q); };
  /** Cartas de equipo activas en la casilla z con una marca (los dominios que anulan los equipos las apagan). */
  const eqWith = (st, P, z, key) => (stOff(st) ? [] : P.st.filter(s => s && !s.down && s.equipTo === z && def(s.c)[key]));
  /** Restricciones temporales (Posesión de sombras, Águila de tinta, Tsukuyomi) y petrificación de Galand. k: 'atk' | 'ab'. */
  const blocked = (m, k) => !!m && (!!m.petri || (m.binds || []).some(b => b[k]));
  /** Hay un personaje enemigo de p con Anti-Magia Absoluta boca arriba. */
  const antiAbs = (st, p) => st.players.some((Q, q) => Q.alive && st.team[q] !== st.team[p] && Q.mz.some(x => x && !x.down && has(st, x, 'antiabs')));
  /** Dominios de Jujutsu Kaisen (05-11-2026): se puede abrir uno si no hay ninguno, o si gana el choque al que ya está activo:
   *  más estrellas, o las mismas (gana el segundo en activarse). Con menos estrellas no se ofrece. */
  const DOM_AB = ['relicario', 'jogodom', 'yutadom', 'higudom', 'hakdom'];
  const DOM_NAME = { relicario: 'Relicario Demoníaco', dominio: 'Ataúd de la Montaña de Hierro', ydominio: 'Amor Mutuo y Verdadero', higudom: 'Sentencia Mortal', hakdom: 'Apuesta Mortal' };
  function domLv(st) {
    if (!st.domain) return 0;
    if (st.domain.lv != null) return st.domain.lv;
    const f = findByUid(st, st.domain.uid), fm = f && (f.m || f);
    return fm && fm.c ? lvl(fm) : 0;
  }
  function domainOk(st, m) { return !st.domain || (st.domain.uid !== m.c.uid && lvl(m) >= domLv(st)); }
  /** Abre el dominio de m; si ya había otro, ése queda anulado. */
  function openDomain(st, p, m, o, pw) {
    const nm = mdef(m).name;
    if (st.domain) {
      const old = st.domain, f = findByUid(st, old.uid), om = f && (f.m || f), on = om && om.c ? mdef(om).name : 'el rival';
      log(st, p, `Choque de dominios: ${nm} (${lvl(m)}★) ${lvl(m) > domLv(st) ? 'tiene más estrellas' : 'tiene las mismas estrellas y es el último en abrirlo'}; el dominio de ${on} queda anulado`);
    }
    st.domain = Object.assign({ p, uid: m.c.uid, t0: st.turn, lv: lvl(m), dn: DOM_NAME[pw] }, o);
  }
  /** Dominio de Yuta: las magias y trampas que ya estaban en el campo quedan desactivadas mientras dure. */
  const stOff = st => !!(st.domain && st.domain.noST);
  /** Galio: Campo de silencio. Mientras haya un Galio boca arriba en el campo, nadie activa magias. */
  const galioOn = st => st.players.some(P => P.alive && P.mz.some(m => m && !m.down && abil(st, m).includes('galsil')));
  const spellsOff = st => !!st.domain || galioOn(st);
  /** Las habilidades de personaje (no las magias ni las trampas) que eligen objetivo: Galio y Goku Ultra Instinto son inmunes a ellas (salvo Púrpura). */
  let abMode = false;
  /** Capa de Invisibilidad / Minions equipados a la casilla z del jugador P. */
  const cloakOn = (P, z) => P.st.some(s => s && !s.down && s.equipTo === z && def(s.c).cloak);
  const minionsOf = (P, z) => P.st.find(s => s && !s.down && s.equipTo === z && s.min);
  function abImmune(st, byP, q, m, o) {
    if (!m || m.down || (o && o.purple)) return false;
    if (st.team[byP] !== st.team[q] && cloakOn(st.players[q], st.players[q].mz.indexOf(m))) return true;      // Capa de Invisibilidad: los personajes enemigos no la eligen
    const ab = abil(st, m);
    return ab.includes('galres') || (ab.includes('uivel') && st.team[byP] !== st.team[q]);
  }
  const isYuta = m => !!m && !m.down && m.c.id === 'c_yuta' && !m.copy;

  function mkSlot(st, inst, o) {
    const m = Object.assign({ c: inst, pos: 'atk', down: false, summonedTurn: st.turn, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (def(inst).huge) m.huge = true;
    if (inst.id === 'c_kayn' && !m.kn) m.kn = { rh: false, sh: false };      // transformaciones de Kayn desbloqueadas
    if (inst.keep && inst.keep.length) {                                      // Sylas y Venom conservan lo que aprendieron durante toda la partida
      m.ext = (m.ext || []).slice(); m.extFrom = Object.assign({}, m.extFrom);
      for (const k of inst.keep) if (!m.ext.includes(k.id) && !(C().get(inst.id).ab || []).includes(k.id)) { m.ext.push(k.id); m.extFrom[k.id] = k.from || null; }
    }
    return m;
  }
  /** Ataques que lleva declarados este turno (los que entran ya «atacados» cuentan como agotados). */
  const atkCount = m => (!m.attacked ? 0 : (m.atkN != null ? m.atkN : 9));
  /** Ataques que puede declarar por turno: 1; 2 con Uno, Dos o como Asesino Sombra. */
  const maxAttacks = (st, m) => {
    let n = (m.uno === st.turn) || m.form === 'c_kayn_sombra' ? 2 : 1;
    if (m.liu === st.turn) n = Math.max(n, 3);
    if (escStage(st, m).k === 'mediodia') { const f = findByUid(st, m.c.uid); if (f) { const hit = m.escHit && m.escHit.t === st.turn ? m.escHit.u : []; n = Math.max(n, hit.length + foes(st, f.p).reduce((c, e) => c + zonesWith(st.players[e].mz).filter(z => !isInk(st.players[e].mz[z]) && !hit.includes(st.players[e].mz[z].c.uid)).length, 0)); } }      // Escanor al Mediodía: un ataque contra cada enemigo                                     // Liu Kang: Patadas Continuas
    if (m.xtra && m.xtra.t === st.turn) n += m.xtra.n;                             // ataques extra (Beru, Critical Over, Espada Orgánica)
    if (rawAbil(m).includes('sjpoder')) { const f = findByUid(st, m.c.uid); if (f && soldiersOf(st.players[f.p]) >= 2) n++; }      // Poder del Monarca
    return n;
  };
  const canAttackSlot = (st, m) => !!m && !m.down && m.pos === 'atk' && atkCount(m) < maxAttacks(st, m) && !m.promesa && !m.god && !m.snake && !m.gr && !(m.canal && m.canal.t === st.turn) && !blocked(m, 'atk') && !mdef(m).noAtk;      // Freezer: mientras canaliza no ataca
  const slotByUid = (st, p, uid) => { const P = st.players[p]; for (let z = 0; z < ZONES; z++) if (P.mz[z] && P.mz[z].c.uid === uid) return { p, z, m: P.mz[z] }; return null; };
  function findByUid(st, uid) { for (let p = 0; p < st.n; p++) { const r = slotByUid(st, p, uid); if (r) return r; } return null; }

  // ---------------- zonas de monstruo (Titán Martillo ocupa 2) ----------------
  /** Qué zonas están ocupadas; `free` = zonas que se van a vaciar (tributos). */
  function occ(P, free) {
    const o = new Array(ZONES).fill(false);
    P.mz.forEach((m, z) => { if (m && !(free && free.includes(z))) { o[z] = true; if (m.wide && z + 1 < ZONES) o[z + 1] = true; if (m.huge) for (let k = z + 1; k < ZONES; k++) o[k] = true; } });
    for (const z of (P.sealed || [])) o[z] = true;                       // la zona que Pothala reserva para la fusión
    return o;
  }
  /** Primera zona donde cabe esa carta (la de la izquierda si ocupa dos), o -1. */
  function spot(P, d, free) {
    const o = occ(P, free);
    if (d.huge) return o.some(x => x) ? -1 : 0;                           // Titán Colosal: necesita las 3 zonas libres
    if (d.wide) { for (let a = 0; a + 1 < ZONES; a++) if (!o[a] && !o[a + 1]) return a; return -1; }
    return o.indexOf(false);
  }
  const freeN = P => occ(P).filter(x => !x).length;
  const shadowOf = (P, z) => (z > 0 && P.mz[z - 1] && P.mz[z - 1].wide ? z - 1 : (z === 2 && P.mz[0] && P.mz[0].huge ? 0 : -1));
  /** Quién invoca a qué Titán en su lugar (Lara → Titán Martillo; Eren → Titán de Ataque). */
  const TITAN_OF = { c_lara: 'c_titan', c_eren: 'c_titan_ataque', c_armin: 'c_titan_colosal', c_bruce_banner: 'c_hulk' };
  /** Sasuke Chico (Sharingan): ¿evade ahora un efecto enemigo que lo elige? Gasta un uso (1 por turno, 3 por invocación). */
  /** Megumi: Conejos evade un ataque, una habilidad o una magia/trampa que vaya a afectarlo (una vez por invocación; nunca Púrpura). */
  function conejosEvade(st, q, z, pw) {
    const m = st.players[q] && st.players[q].mz[z];
    if (!m || m.down || !has(st, m, 'dsombras') || pw === 'purpura') return false;
    const uc = uOf(m);
    if (uc.dsCnj) return false;
    uc.dsCnj = true; dsUse(m, 'conejos');
    log(st, q, `${mdef(m).name} usa Conejos: evade el efecto`);
    return true;
  }
  function sharinganEvade(st, q, z, pw) {
    const m = st.players[q] && st.players[q].mz[z];
    if (conejosEvade(st, q, z, pw)) return true;
    if (!m || m.down || !has(st, m, 'sharingan')) return false;
    const u = uOf(m);
    if ((u.shN || 0) >= 3 || u.shT === st.turn) return false;
    u.shN = (u.shN || 0) + 1; u.shT = st.turn;
    log(st, q, `${mdef(m).name} usa Sharingan: evade el efecto (${u.shN}/3)`);
    return true;
  }
  /** Tobi (Kamui — Intangibilidad): esquiva automáticamente un ataque o una habilidad enemiga; una vez cada 2 turnos (rondas). */
  function tobiEvade(st, q, z) {
    const m = st.players[q] && st.players[q].mz[z];
    if (!m || m.down || !has(st, m, 'tobikamui') || blocked(m, 'ab')) return false;
    const u = uOf(m);
    if (u.tobT0 != null && elapsed(st, u.tobT0) < 1) return false;      // la usó en esta ronda o en la anterior (una vez cada 2 rondas)
    u.tobT0 = st.turn;
    log(st, q, `${mdef(m).name} usa Kamui: se vuelve intangible y esquiva el efecto`);
    return true;
  }
  /** Opciones para proteger a Sung Jin-Woo (q, z) de un efecto de `byP`: cambiar de casilla con un soldado o que Igris intercepte. */
  function shadowOpts(st, q, z, byP) {
    const Q = st.players[q], m = Q.mz[z], out = [];
    if (!m || m.down || st.team[byP] === st.team[q]) return out;
    if (has(st, m, 'sjswap') && !blocked(m, 'ab') && uOf(m).swT !== st.turn) Q.mz.forEach((x, i) => { if (i !== z && isSoldier(x) && !x.wide && !m.wide) out.push('swap:' + i); });
    if (has(st, m, 'sjdom')) Q.mz.forEach((x, i) => { if (i !== z && x && !x.down && x.bySung && has(st, x, 'igrisprot') && uOf(x).ipT !== st.turn) out.push('igris:' + i); });
    return out;
  }
  /** Aplica la protección elegida. Devuelve la nueva casilla objetivo (la del soldado) o -1. */
  function shadowDo(st, q, z, pick) {
    const Q = st.players[q], [mode, s] = String(pick).split(':'), i = +s, m = Q.mz[z], x = Q.mz[i];
    if (!m || !x) return -1;
    if (mode === 'swap') {
      uOf(m).swT = st.turn;
      Q.mz[z] = x; Q.mz[i] = m;
      for (const sl of Q.st) if (sl && sl.equipTo === z) sl.equipTo = i; else if (sl && sl.equipTo === i) sl.equipTo = z;
      log(st, q, `Intercambio de sombras: ${mdef(m).name} cambia de casilla con ${mdef(x).name}, que recibe el efecto`);
      return z;
    }
    uOf(x).ipT = st.turn;
    log(st, q, `Caballero Protector: ${mdef(x).name} se interpone y recibe el efecto en lugar de ${mdef(m).name}`);
    return i;
  }
  /** Bulma de algún aliado de la víctima que todavía puede sacrificarse (una vez por duelo). */
  function bulmaFor(st, v) {
    const vm = st.players[v.p].mz[v.z];
    if (!vm || has(st, vm, 'bulmasav')) return null;
    for (let q = 0; q < st.n; q++) {
      if (!st.players[q].alive || st.team[q] !== st.team[v.p]) continue;
      const z = st.players[q].mz.findIndex(x => x && !x.down && has(st, x, 'bulmasav') && !x.c.bmU);
      if (z >= 0) return { q, z };
    }
    return null;
  }
  /** Megumi: anota qué técnicas de Diez Sombras ha usado en esta invocación (distintas). */
  /** Megumi: máximo 2 técnicas activas por turno (los Conejos son automáticos y no cuentan). */
  function dsTick(st, u) { if (u.dsTT !== st.turn) { u.dsTT = st.turn; u.dsTn = 0; } u.dsTn++; }
  function dsUse(m, k) { const u = uOf(m); u.dsU = u.dsU || []; if (!u.dsU.includes(k)) u.dsU.push(k); }
  /** Dónde entra la forma transformada: los gigantes ocupan 2/3 zonas; Hulk entra en la casilla de Bruce. */
  function formAnchor(P, z, tid) { const hd = def({ id: tid }); return (hd.wide || hd.huge) ? titanAnchor(P, z, undefined, hd.huge) : (!P.mz[z] ? z : spot(P, hd)); }
  /** Dónde cabe un Titán que debe cubrir la zona z (la de Lara Tybur o Eren). */
  function titanAnchor(P, z, free, huge) {
    const o = occ(P, free);
    if (huge) return o.some(x => x) ? -1 : 0;
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

  /** Ronda a la que pertenece el turno numerado t (si no se guardó, se calcula por el número de jugadores). */
  function roundAt(st, t) { return st.rmap && st.rmap[t] != null ? st.rmap[t] : Math.max(1, Math.ceil(t / st.n)); }
  function curRound(st) { return roundAt(st, st.turn); }
  /** Rondas completas que pasaron desde el turno numerado t0 (no cuenta la ronda en que empezó). */
  function elapsed(st, t0) { return curRound(st) - roundAt(st, t0) - 1; }

  function startTurn(st) {
    st.turn++;
    // ronda = todos los jugadores han jugado su turno; el contador que se ve y las duraciones cuentan rondas
    const rel = (st.current - st.first + st.n) % st.n;
    const prev = st.turn === 1 ? 0 : roundAt(st, st.turn - 1);
    st.round = st.turn === 1 ? 1 : (st.lastRel != null && rel <= st.lastRel ? prev + 1 : prev);
    st.lastRel = rel;
    (st.rmap = st.rmap || [])[st.turn] = st.round;
    const P = st.players[st.current];
    P.normalUsed = false;
    P.snaps = (P.snaps || []).concat([JSON.stringify({ mz: P.mz, st: P.st })]).slice(-2);      // historial del campo propio al empezar cada turno propio (Gema del Tiempo)
    for (const s of P.mz) if (s) { s.attacked = false; s.moved = false; s.atkMod = 0; s.atkN = 0; s.hira = 0; }
    for (const s of P.mz) if (s && s.astaW && ++s.astaW.n > 1) delete s.astaW;      // Forma Negra: hasta el final de tu siguiente turno
    for (const Q of st.players) for (const s of Q.mz) if (s && s.pub === st.current) delete s.pub;      // Publicidad engañosa: hasta el siguiente turno de quien la usó
    st.phase = 'main';
    log(st, st.current, `Turno ${st.round}`);
    if (st.turn > 1) drawCards(st, st.current, 1);
    if (st.vret && st.vret.length) {                 // Voldemort vuelve en el siguiente turno de su jugador
      const keep = [];
      for (const r of st.vret) {
        if (r.p !== st.current || r.t0 >= st.turn) { keep.push(r); continue; }
        const Pp = st.players[r.p], gi = Pp.grave.find(c => c.uid === r.uid);
        if (!gi || !Pp.alive) continue;
        if (reviveInst(st, r.p, gi) < 0) { keep.push(r); continue; }
        log(st, r.p, `${def(gi).name} regresa (Inmortalidad)`);
      }
      st.vret = keep;
    }
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
    for (let z = 0; z < ZONES; z++) {
      const s = P.st[z];
      if (s) {
        if (s.prison) {
          const pr = s.prison, O = st.players[pr.owner], pm = pr.m, nm = mdef(pm).name;
          const fz = O.alive ? spot(O, mdef(pm)) : -1;
          if (fz >= 0) {                                   // su dueño sigue vivo y tiene sitio: el personaje sellado vuelve a su campo
            O.mz[fz] = pm;
            for (const q of O.st) if (q && q.held === pm.c.uid) { q.equipTo = fz; delete q.held; }
            log(st, pr.owner, `${nm} sale de Gokumonkyo y vuelve al campo de su dueño`);
          } else {                                         // sin sitio (o su dueño también está fuera): va al cementerio de su dueño
            O.grave.push(pm.c); for (const l of (pm.link || [])) st.players[l.by != null ? l.by : pr.owner].grave.push(l);
            const ab = pm.abs; if (ab) { const AO = st.players[ab.owner]; AO.grave.push(ab.c); for (const l of (ab.link || [])) AO.grave.push(l); }      // lo que tenía absorbido el personaje sellado vuelve a su dueño
            if (O.alive) {
              O.st.forEach((q, qi) => { if (q && q.held === pm.c.uid) removeST(st, pr.owner, qi); });      // su equipo en espera lo acompaña
              log(st, pr.owner, `${nm} sale de Gokumonkyo, pero no hay sitio en el campo de su dueño: va al cementerio`);
            }
          }
        }
        P.grave.push(s.c); P.st[z] = null;
      }
    }
    P.sealed = [];
    if (st.limbo) st.limbo = st.limbo.filter(e => {      // quien estaba fuera del campo va al cementerio de su dueño
      if (e.p !== p) return true;
      const O = st.players[e.m.owner != null ? e.m.owner : p];
      O.grave.push(e.m.c); for (const l of (e.m.link || [])) st.players[l.by != null ? l.by : (e.m.owner != null ? e.m.owner : p)].grave.push(l);
      return false;
    });
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
  /** Pierde PV. cost = true: es un coste o un daño que el propio jugador se hace (no lo frenan Kuriboh ni el Minion: no es daño recibido). */
  function lose(st, p, n, cost) {
    const P = st.players[p];
    if (!P.alive) return;
    if (!cost && st.minShield === p && n > 0) { st.minShield = null; log(st, p, 'El Minion absorbe todo el daño del combate'); return; }
    if (!cost && P.imm === st.turn && n > 0) { log(st, p, 'Kuriboh lo protege: no recibe daño este turno'); return; }      // Kuriboh: inmune a todo daño el resto del turno
    P.lp = Math.max(0, P.lp - Math.max(0, n));
    checkWin(st);
  }
  function heal(st, p, n) { st.players[p].lp += n; }

  // ---------------- stats en el campo ----------------
  function equipBonus(P, z, key, st) {
    const m = P.mz[z];
    let n = 0;
    if (st && stOff(st)) return 0;
    for (const s of P.st) if (s && !s.down && s.equipTo === z) {
      if (m && m.stripEq && m.stripEq.includes(s.c.uid)) continue;           // Anulación de aumentos: ese equipo ya no le da nada
      const d = def(s.c), k = key === 'eAtk' ? 'atk' : 'def';
      n += (d.eType && m && mdef(m).type === d.eType.type) ? d.eType[k] : (d[key] || 0);
      if (s.ring) n += s.ring[k];                                          // Anillo Único: según las estrellas del portador al equiparlo
      if (s.susano && s.susano.awake && s.susano.sh > 0) n += 400;         // Susano despierto
    }
    return n;
  }
  const isSolo = P => P.mz.filter(Boolean).length === 1;
  /** Modificadores de la invocación actual (tanda 2): [{ k, atk, def, t0, n }]; n = turnos completos que duran (0 = toda la invocación). */
  const modSum = (m, key) => (m.mods || []).reduce((n, x) => n + (x[key] || 0), 0);
  function addMod(st, m, k, atk, def, n) { if (m && (atk < 0 || def < 0) && m.c && rawAbil(m).includes('vimm')) return {}; const e = { k, atk: atk || 0, def: def || 0, t0: st.turn, n: n || 0 }; (m.mods = m.mods || []).push(e); return e; }
  const dropMods = (m, k) => { if (m.mods) m.mods = m.mods.filter(x => x.k !== k); };
  /** Gema del Poder: duplica los usos y los aumentos de las habilidades. */
  const gemOn = (P, z) => P.st.some(s => s && !s.down && s.equipTo === z && def(s.c).pgem);
  const gx = (P, z) => (gemOn(P, z) ? 2 : 1);
  /** Usos de una habilidad «una vez por invocación»: con la Gema se puede una segunda vez. */
  const canOnce = (P, z, u, key) => !u[key] || (gx(P, z) > 1 && !u[key + '2']);
  const markOnce = (u, key) => { if (u[key]) u[key + '2'] = true; else u[key] = true; };
  /** Aumentos de habilidades que dependen del momento (iguales para ATK y DEF). */
  function passiveBonus(st, P, z) {
    const m = P.mz[z];
    let n = 0;
    const ab = abil(st, m);
    if (isSolo(P)) { if (ab.includes('instinto')) n += 400; if (ab.includes('sangre')) n += 800; }
    if (st.domain && st.domain.uid === m.c.uid) n += 500 * (st.domain.x || 1);
    if (ab.includes('warsed')) { const o = combatFoe(st, m); if (o && !o.down && lvl(o) > lvl(m)) n += 500; }      // Warwick: Sed insaciable
    if (m.fur && m.fur === st.turn) n += 700 * (m.furX || 1);
    if (m.cFury && m.cFury === st.turn) n += 700;                       // Furia copiada por Shang Tsung: dura lo mismo que en el original
    if (m.cDom && st.domain && st.domain.uid === m.cDom) n += 500;      // dominio copiado: dura mientras dure el dominio
    if (ab.includes('thanosp')) n += 500 * thanosGems(st, P, z);        // Thanos: +500 por gema equipada
    if (has(st, m, 'rikavinc')) n += rikaState(st).bonus;               // Rika feliz: Yuta o el Anillo de la Promesa
    if (isSoldier(m) && P.mz.some(x => x && !x.down && x.bySung && has(st, x, 'belleal'))) n += 300;      // Bellion: Lealtad al Monarca
    return n;
  }
  /** Gemas que lleva Thanos: equipadas a él (también las robadas) o puestas por su dueño (Gema de la Mente). */
  function thanosGems(st, P, z) {
    if (stOff(st)) return 0;
    let n = (P.mz[z] && P.mz[z].gemsIdle ? P.mz[z].gemsIdle.length : 0);      // las gemas robadas que lleva consigo (no ocupan zona)
    for (const s of P.st) {
      if (!s) continue;
      const d = def(s.c);
      if (!/^Gema/.test(d.name)) continue;
      if (s.equipTo === z && (!s.down || s.stolen)) n++;
      else if (s.equipTo == null && !s.down && d.kind === 'spell' && (d.fx === 'gem' || d.fx === 'alma')) n++;
    }
    return n;
  }
  /** Estado de Rika Orimoto: feliz si hay un Yuta Okkotsu boca arriba en el campo o el Anillo de la Promesa (activo) en su portador original. */
  function rikaState(st) {
    let yuta = false, ring = false, ringYuta = false;
    for (const P of st.players) {
      if (!P.alive) continue;
      for (const m of P.mz) if (isYuta(m)) yuta = true;
      if (stOff(st)) continue;
      for (const s of P.st) {
        if (!s || s.down || !s.promise || s.equipTo == null) continue;
        const bm = P.mz[s.equipTo];
        if (!bm || bm.c.uid !== s.bearer) continue;                       // el anillo sólo funciona en su portador original
        ring = true;
        if (isYuta(bm)) ringYuta = true;
      }
    }
    return { yuta, ring, ringYuta, happy: yuta || ring, bonus: ringYuta ? 1200 : (yuta || ring) ? 700 : 0 };
  }
  // m.base: valores propios de esta aparición en el campo (p. ej. Popeye revivido con 1500/1500)
  const baseOf = m => ((m.copy || m.form) ? mdef(m) : (m.base || def(m.c)));
  /** Combate en curso: el otro personaje del enfrentamiento de `m` (atacante u objetivo), o null. */
  function combatFoe(st, m) {
    const cb = st.atk || st.cmb;
    if (!cb || cb.target === 'direct' || (cb.turn != null && cb.turn !== st.turn)) return null;
    const att = st.players[cb.p] && st.players[cb.p].mz[cb.z], dfn = st.players[cb.vs] && st.players[cb.vs].mz[cb.target];
    return att === m ? (dfn || null) : dfn === m ? (att || null) : null;
  }
  let wdIn = false;      // evita la recursión entre dos Instintos depredadores
  /** Rengar, Emoción de la Cacería: durante ese ataque se ignoran las bonificaciones (sin quitarlas) de la presa. */
  /** Escanor, Sunshine: etapa según las rondas desde su invocación (Amanecer · Mediodía 3 turnos desde el segundo turno de su controlador · Atardecer). */
  function escStage(st, m) {
    if (!m || !rawAbil(m).includes('escsun') || m.down) return { k: null, atk: 0 };
    const e = elapsed(st, m.summonedTurn || 0);
    if (e < 1) return { k: 'amanecer', atk: 0, left: 1 - e };
    if (e < 4) return { k: 'mediodia', atk: 800, left: 4 - e };
    return { k: 'atardecer', atk: 0, left: 0 };
  }
  const ignBase = (st, m, key) => {
    const b = baseOf(m), neg = (m.mods || []).reduce((n, x) => n + Math.min(0, x[key] || 0), 0);
    return Math.max(0, (key === 'atk' ? Math.min(0, m.atkMod || 0) : 0) + (m.price ? Math.floor(b[key] / 2) : b[key]) + neg + (key === 'atk' ? escStage(st, m).atk : 0));
  };
  function atkOf(st, P, z) {
    const m = P.mz[z];
    if (m.exh) return 0;
    if (st.ign && st.ign.includes(m) && !m.fused) return ignBase(st, m, 'atk');                                                  // Kaioken x10: agotado
    if (m.fused) return Math.max(0, m.fused.atk + (m.atkMod || 0) + modSum(m, 'atk'));
    const b = baseOf(m);
    let v = Math.max(0, (m.price ? Math.floor(b.atk / 2) : b.atk) + (m.atkMod || 0) + (m.bonus ? m.bonus.atk : 0) + modSum(m, 'atk') + equipBonus(P, z, 'eAtk', st) + passiveBonus(st, P, z) + escStage(st, m).atk);
    if (!m.down && has(st, m, 'sjpoder')) v += 200 * soldiersOf(P);                                  // Poder del Monarca
    if (st.domain && st.domain.uid === m.c.uid && st.domain.higu && st.domain.higu.sword) v += 2000;      // Higuruma: Espada del Verdugo
    if (!m.down && !wdIn && (abil(st, m).includes('wardep') || abil(st, m).includes('igrisesp'))) {             // Warwick: Instinto depredador (+500 ATK si combate, atacando o atacado, contra alguien con más ATK)
      const cb = st.atk || st.cmb, o = combatFoe(st, m);
      if (o && cb) {
        const att = st.players[cb.p].mz[cb.z] === m, fp = att ? cb.vs : cb.p, fz = att ? cb.target : cb.z;
        wdIn = true;
        let fa;
        try { fa = atkOf(st, st.players[fp], fz); } finally { wdIn = false; }
        if (fa > v) return v + 500;
      }
    }
    return v;
  }
  function defOf(st, P, z) {
    const m = P.mz[z];
    if (m.exh) return 0;
    if (m.fused) return Math.max(0, m.fused.def + modSum(m, 'def'));
    if (st.ign && st.ign.includes(m)) return ignBase(st, m, 'def');
    if (m.defFix != null) return m.defFix;                               // Beru: Regeneración de sombras (500 de DEF exactos)
    const b = baseOf(m);
    return Math.max(0, (m.price ? Math.floor(b.def / 2) : b.def) + (m.bonus ? m.bonus.def : 0) + modSum(m, 'def') + equipBonus(P, z, 'eDef', st) + passiveBonus(st, P, z));
  }
  const shieldOf = m => { const u = uOf(m); if (u.sh == null) u.sh = SHIELD_MAX; return u.sh; };
  /** Escudo que recibe los ataques ahora mismo: el de Shen, el de Susano o el de Vegeta Blue (por ese orden). */
  function shieldInfo(st, P, z) {
    const m = P.mz[z];
    if (!m) return null;
    if (m.shen && m.shen.sh > 0) return { kind: 'shen', cur: m.shen.sh, max: SHEN_SH, set: v => { m.shen.sh = v; } };
    if (!stOff(st)) for (const s of P.st) if (s && !s.down && s.equipTo === z && s.susano && s.susano.awake && s.susano.sh > 0) return { kind: 'susano', cur: s.susano.sh, max: SUSANO_SH, slot: s, set: v => { s.susano.sh = v; } };
    if (has(st, m, 'escudo') && shieldOf(m) > 0) return { kind: 'vegeta', cur: shieldOf(m), max: SHIELD_MAX, set: v => { uOf(m).sh = v; } };
    return null;
  }

  /** Saca el monstruo de la zona: sus equipos se destruyen (salvo Karma, que se encarga de sí misma). */
  function takeOff(st, p, z, how) {
    const P = st.players[p], m = P.mz[z];
    if (!m) return null;
    P.mz[z] = null;
    for (let i = 0; i < ZONES; i++) {
      const s = P.st[i];
      if (!s || s.down || (s.equipTo !== z && !(m.fused && s.equipTo === m.fused.zb))) continue;
      if (how === 'seal' && s.equipTo === z) { s.held = m.c.uid; s.equipTo = null; continue; }      // Gokumonkyo: el equipo espera con su portador
      if (s.karma && s.karma.phase === 'ally' && how === 'grave') {          // el aliado murió: Karma pasa a un enemigo
        s.equipTo = null; s.karma.phase = 'transfer';
        st.trig.push({ k: 'karma', p, stz: i, uid: s.c.uid });
      } else { P.grave.push(s.c); P.st[i] = null; }
    }
    if (st.domain && st.domain.uid === m.c.uid) { st.domain = null; log(st, -1, 'El dominio termina'); }
    if (m.god !== undefined || (m.c && rawAbil(m).includes('dios'))) for (const Q of st.players) for (const x of Q.mz) if (x && x.god && x.god.uid === m.c.uid) { x.god = null; log(st, -1, `${mdef(x).name} se libera del campo de energía divina`); }
    if (m.c && rawAbil(m).includes('dsombras')) for (const Q of st.players) for (const x of Q.mz) if (x && x.snake && x.snake.uid === m.c.uid) { x.snake = null; log(st, -1, `${mdef(x).name} se libera de la Serpiente`); }
    if (m.fused) P.sealed = (P.sealed || []).filter(x => x !== m.fused.zb);     // la entidad fusionada deja el campo: se libera la zona reservada
    return m;
  }
  /** Un monstruo sale del campo (destruido, tributado o desterrado): él y las cartas vinculadas van al mismo sitio (el de su dueño).
   *  Si va al cementerio cuenta como una muerte (o si o.death: Mahoraga destierra a lo que mata). */
  function removeMonster(st, p, z, how, o) {
    const P = st.players[p];
    // Guerrero del Infinito: quien tiene los Seis Ojos no puede ser desterrado por nada (cartas, habilidades, explosiones), salvo por la Púrpura (o.purple).
    if (how === 'banish' && P.mz[z] && P.mz[z].six && !(o && o.purple)) { log(st, p, `${mdef(P.mz[z]).name} no puede ser desterrado: los Seis Ojos lo protegen`); return null; }
    if (P.mz[z] && isInk(P.mz[z])) { const t = takeOff(st, p, z, 'ink'); for (const l of (t.link || [])) st.players[l.by != null ? l.by : p].grave.push(l); log(st, p, `${mdef(t).name} se deshace en tinta`); return t; }      // ficha de tinta: no va a ninguna pila
    const m = takeOff(st, p, z, how || 'grave');
    if (!m) return null;
    if (how === 'grave' || how === 'banish') allyGone(st, p, m);
    const O = st.players[m.owner != null ? m.owner : p];                 // un personaje corrompido vuelve a la zona de su dueño original
    const dest = how === 'banish' || m.ghost ? O.banish : O.grave;
    dest.push(m.c);
    for (const l of (m.link || [])) { const LO = l.by != null ? st.players[l.by] : O; (how === 'banish' ? LO.banish : LO.grave).push(l); }      // lo equipado vuelve a quien lo puso
    if (m.abs) releaseAbsorbed(st, m);
    if (m.fused && m.fused.b && m.fused.b.abs) releaseAbsorbed(st, m.fused.b);      // la entidad fusionada se va con un Cell que llevaba algo absorbido: se libera
    if ((how === 'grave' || (o && o.death)) && P.alive) onDeath(st, p, m, how || 'grave');
    return m;
  }
  /** Un personaje vuelve a la mano de su dueño (Mr. Satan, Igris): lo equipado o vinculado va al cementerio de quien lo puso. */
  function toHandM(st, p, z) {
    const m = takeOff(st, p, z, 'hand');
    if (!m) return null;
    const O = st.players[m.owner != null ? m.owner : p];
    if (m.ghost) O.banish.push(m.c); else { O.hand.push(m.c); m.c.spent = false; }
    for (const l of (m.link || [])) (l.by != null ? st.players[l.by] : O).grave.push(l);
    if (m.abs) releaseAbsorbed(st, m);
    return m;
  }
  /** Un personaje sale del campo muerto o desterrado: la familia Asta lo nota (Forma Negra y Unión Demoníaca). */
  function allyGone(st, p, m) {
    for (let q = 0; q < st.n; q++) {
      if (!st.players[q].alive || st.team[q] !== st.team[p]) continue;
      for (const x of st.players[q].mz) {
        if (!x || x.down || x === m) continue;
        const ra = rawAbil(x);
        if (ra.includes('astaneg') && x.c.id === 'c_asta') x.astaW = { n: 0 };                     // Forma Negra disponible hasta el final de tu siguiente turno
        if (ra.includes('astauni') && x.c.id === 'c_asta_negra') x.astaK = (x.astaK || 0) + 1;     // Unión Demoníaca: 2 muertes más
      }
    }
  }
  // ---------- fuera del campo por un tiempo (Mafuba, Dimensión Kamui, la trampa Kamui) ----------
  /** Saca al personaje del campo sin destruirlo: conserva todo y sus equipos esperan (como en Gokumonkyo).
   *  kind: 'rounds' (vuelve cuando pasan n rondas), 'end' (al terminar el siguiente turno de su controlador), 'start' (al empezar su siguiente turno). */
  function toLimbo(st, p, z, kind, n, why) {
    const P = st.players[p], m0 = P.mz[z];
    if (!m0) return false;
    if (m0.fused) unfuse(st, p, z);
    const nm = mdef(m0).name, m = takeOff(st, p, z, 'seal');
    (st.limbo = st.limbo || []).push({ p, m, t0: st.turn, kind, n: n || 0, why: why || '' });
    log(st, p, `${m.down ? 'Un personaje boca abajo' : nm} sale del campo${why ? ' (' + why + ')' : ''}`);
    return true;
  }
  /** Intenta devolver al campo a quien esté fuera; sin sitio, espera. */
  function limboBack(st, e) {
    const P = st.players[e.p];
    if (!P.alive) return true;
    const z = spot(P, mdef(e.m));
    if (z < 0) { if (!e.wait) { e.wait = true; log(st, e.p, `${mdef(e.m).name} no tiene sitio para volver: espera`); } return false; }
    P.mz[z] = e.m; e.m.attacked = false; e.m.atkN = 0; e.m.moved = false;
    for (const s of P.st) if (s && s.held === e.m.c.uid) { s.equipTo = z; delete s.held; }
    log(st, e.p, `${mdef(e.m).name} vuelve al campo`);
    if (e.sala) { e.m.sc = 2; log(st, e.p, `${mdef(e.m).name} sale entrenado de la Sala del Espíritu y el Tiempo: 2 contadores de entrenamiento`); }
    return true;
  }
  /** Cuándo vuelve cada uno: hook = 'start' (empieza el turno de st.current) o 'end' (termina). */
  function limboTick(st, hook) {
    if (!st.limbo || !st.limbo.length) return;
    st.limbo = st.limbo.filter(e => {
      const due = e.kind === 'rounds' ? hook === 'start' && elapsed(st, e.t0) >= e.n
        : e.kind === 'start' ? hook === 'start' && st.current === e.p && st.turn > e.t0
          : hook === 'end' && st.current === e.p && st.turn > e.t0;
      return !((due || e.wait) && limboBack(st, e));
    });
  }
  /** Galand: Mandamiento de la Verdad. El personaje (q, z) esquivó o anuló el ataque `a` de Galand: queda petrificado. */
  function galandHit(st, a, q, z) {
    const at = a && st.players[a.p] && st.players[a.p].mz[a.z], m = st.players[q] && st.players[q].mz[z];
    if (!at || !m || st.team[q] === st.team[a.p] || !has(st, at, 'galverdad') || m.petri) return;
    m.petri = true;
    log(st, q, `Mandamiento de la Verdad: ${mdef(m).name} queda petrificado (no ataca ni usa habilidades el resto de su invocación)`);
  }
  /** Una muerte real (cementerio, o desterrado por Mahoraga): La Muerte crece, la Bestia despierta, Susano despierta. */
  function onDeath(st, p, m, how) {
    const nm = mdef(m).name, type = mdef(m).type;
    const dab = m.c ? rawAbil(m) : [];
    const domOff = !!(m.c && st.domain && lvl(m) < (st.domain.min || 10) && st.domain.uid !== m.c.uid);      // un dominio activo apaga sus habilidades (también al morir)
    if (dab.includes('kuriboh') && !domOff) {                  // Kuriboh: su jugador es inmune a todo daño el resto del turno
      st.players[p].imm = st.turn;
      log(st, p, `${nm} protege a su jugador: no recibirá daño el resto del turno`);
    }
    if (dab.includes('inmort') && how === 'grave' && m.c && (m.c.imm || 0) < 2) {      // Voldemort: Inmortalidad (2 regresos)
      m.c.imm = (m.c.imm || 0) + 1;
      (st.vret = st.vret || []).push({ p: m.owner != null ? m.owner : p, uid: m.c.uid, t0: st.turn });
      log(st, p, `${nm} volverá en el próximo turno de su jugador (${m.c.imm}/2)`);
    }
    if (dab.includes('superv') && how === 'grave' && m.c && !m.c.rev) st.trig.push({ k: 'superv', p: m.owner != null ? m.owner : p, uid: m.c.uid });      // Cell Perfecto: Supervivencia Saiyan
    if (dab.includes('kuribomo') && !domOff) st.trig.push({ k: 'kuribomo', p, nm });
    for (let q = 0; q < st.n; q++) {
      const Q = st.players[q];
      if (!Q.alive) continue;
      for (let z = 0; z < ZONES; z++) {
        const lm = Q.mz[z];
        if (lm && !lm.down && lm.c.uid !== m.c.uid && has(st, lm, 'odincarga')) {      // Odin: una carga de vida por cada muerte en el campo
          const uo = uOf(lm); uo.odc = (uo.odc || 0) + gx(Q, z);
          log(st, q, `${mdef(lm).name} obtiene una carga de vida por la muerte de ${nm} (${uo.odc})`);
        }
        if (lm && !lm.down && lm.c.uid !== m.c.uid && has(st, lm, 'muerte')) {
          addMod(st, lm, 'muerte', 300 * gx(Q, z), 0, 0);
          log(st, q, `${mdef(lm).name} gana ${300 * gx(Q, z)} ATK por la muerte de ${nm}`);
        }
      }
      for (let i = 0; i < ZONES; i++) {
        const s = Q.st[i];
        if (!s || s.down || stOff(st)) continue;
        if (s.beast && !s.beast.done && st.team[p] === st.team[q] && s.equipTo != null) {      // El Despertar de la Bestia
          const ch = Q.mz[s.equipTo];
          if (ch && ch.c.uid !== m.c.uid) {
            addMod(st, ch, 'bestia', 800, 800, 0);
            log(st, q, `¡${mdef(ch).name} despierta! +800 ATK y +800 DEF por la muerte de ${nm}`);
            s.beast.done = true;
            Q.st[i] = null; Q.grave.push(s.c);
            log(st, q, 'El Despertar de la Bestia va al cementerio');
          }
        }
        if (s.susano && !s.susano.awake && how === 'grave' && s.equipTo != null) {             // Susano despierta con la muerte de otro del mismo tipo
          const ch = Q.mz[s.equipTo];
          if (ch && ch.c.uid !== m.c.uid && mdef(ch).type === type) {
            s.susano.awake = true; s.susano.sh = SUSANO_SH;
            log(st, q, `¡Susano despierta en ${mdef(ch).name}! Escudo de ${SUSANO_SH} y +400 ATK/DEF`);
          }
        }
      }
    }
  }
  /** Alguien se salvó de una muerte que iba a ocurrir: quien tenga La Muerte en la mano puede invocarla. */
  function noteSaved(st, nm) {
    for (let q = 0; q < st.n; q++) if (st.players[q].alive) st.trig.push({ k: 'muerte', p: q, nm });
  }
  const banishMonster = (st, p, z) => removeMonster(st, p, z, 'banish');
  function removeST(st, p, z) {
    const P = st.players[p], s = P.st[z];
    if (!s || s.prison) return;                          // Gokumonkyo no se puede quitar
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
  /** Yoriichi es inmune a los efectos enemigos mientras ataca en el turno de su controlador (no al combate). */
  const yoriFast = (st, p, z) => { const m = st.players[p].mz[z]; return !!m && !!st.atk && st.atk.p === p && st.atk.z === z && st.current === p && (has(st, m, 'yoriichi') || m.kzwater === st.turn); };      // Yoriichi y la máscara de Agua de Kakuzu: sin efectos enemigos durante su ataque
  /** Destruir un monstruo. ctx = { src: 'combat'|'spell'|'trap'|'power'|'mark', by: {p, uid}, bp: jugador que causa el efecto, ignoreSix }. Devuelve true si salió del campo. */
  // ---------- Kakuzu: corazones (por copia de la carta; los conserva aunque salga del campo) ----------
  const KZ_H = 2;
  const heartsOf = m => (m.c.kzh == null ? KZ_H : m.c.kzh);
  /** Gasta un corazón de Kakuzu (máx. 1 por turno entre Cinco Corazones e Hilos de Costura). true = se evitó la destrucción. */
  function kzSpend(st, k, why) {
    const km = k.m;
    if (heartsOf(km) <= 0 || km.c.kzT === st.turn) return false;
    km.c.kzh = heartsOf(km) - 1; km.c.kzT = st.turn;
    log(st, k.p, `${mdef(km).name}: ${why} (le quedan ${km.c.kzh} corazón(es) adicional(es))`);
    if (km.c.kzh === 0) {
      addMod(st, km, 'kzult', 600, 0, 0);
      km.xtra = { t: st.turn, n: (km.xtra && km.xtra.t === st.turn ? km.xtra.n : 0) + 1 };
      log(st, k.p, `${mdef(km).name}: Último Corazón, +600 ATK y un ataque adicional este turno`);
    }
    return true;
  }
  /** Hakari: cada vida extra evita una destrucción. */
  function hakSave(st, p, m) {
    if (m.sres) { m.sres = false; log(st, p, `${mdef(m).name}: Resistencia extrema evita su destrucción`); return true; }
    if (!m.hl || m.hl <= 0) return false;
    m.hl--;
    log(st, p, `${mdef(m).name}: una vida extra evita su destrucción (le quedan ${m.hl})`);
    return true;
  }
  function kzSave(st, p, z, m) {
    if (hakSave(st, p, m)) return true;
    if (rawAbil(m).includes('kzcor') && !m.down && !blocked(m, 'ab')) { const r = kzSpend(st, { p, m }, 'Cinco Corazones evita su destrucción'); if (r) return true; }
    for (let q = 0; q < st.n; q++) {
      if (!st.players[q].alive || st.team[q] !== st.team[p]) continue;
      for (const x of st.players[q].mz) if (x && x !== m && !x.down && has(st, x, 'kzhilos') && !blocked(x, 'ab') && kzSpend(st, { p: q, m: x }, `Hilos de Costura salvan a ${mdef(m).name}`)) return true;
    }
    return false;
  }
  function destroyMonster(st, p, z, ctx) {
    ctx = ctx || { src: 'effect' };
    const P = st.players[p], m = P.mz[z];
    if (!m) return false;
    const ab = abil(st, m), nm = mdef(m).name;
    const fromCard = ctx.src === 'spell' || ctx.src === 'trap';
    if (m.gres && ctx.src === 'spell') { log(st, p, `${nm} resiste la magia enemiga: no puede destruirlo`); return false; }
    if (!ctx.all && (ctx.src === 'spell' || ctx.src === 'trap' || ctx.src === 'power') && escStage(st, m).k === 'amanecer') { log(st, p, `${nm} está en el Amanecer: ningún efecto que lo elija puede destruirlo`); return false; }
    if (m.six && !ctx.ignoreSix && ctx.src !== 'mark') { log(st, p, `${nm} es intocable: los Seis Ojos lo protegen`); return false; }
    if (ctx.src === 'combat' && ab.includes('gogres')) {      // Gogeta: sólo lo derrota el ataque de un enemigo con más de 2800 ATK
      const ak = ctx.defn && ctx.by ? slotByUid(st, ctx.by.p, ctx.by.uid) : null;
      if (!ak || atkOf(st, st.players[ak.p], ak.z) <= 2800) { log(st, p, `${nm} resiste el combate: sólo lo derrota un ataque con más de 2800 ATK`); noteSaved(st, nm); return false; }
    }
    if (cloakOn(P, z) && ctx.src !== 'spell') { log(st, p, `${nm} es invisible: sólo las cartas mágicas pueden destruirlo`); return false; }      // Capa de Invisibilidad
    if (!(ctx.src === 'mark') && kzSave(st, p, z, m)) return false;
    {   // Minions: Sacrificio protector (no ante magias)
      const ms = ctx.src !== 'spell' ? minionsOf(P, z) : null;
      if (ms && (ctx.src === 'combat' || ctx.src === 'trap' || ctx.src === 'power')) {
        if (ms.min.n > 0) {
          ms.min.n--;
          log(st, p, `Un Minion se sacrifica por ${nm} (${ms.min.n} restantes): ${nm} sobrevive y no hay daño`);
          if (ctx.src === 'combat') st.minShield = p;
          noteSaved(st, nm);
          return false;
        }
      }
    }
    if (fromCard && ab.includes('rikaprot')) { log(st, p, `${nm} es inmune: las magias y trampas no la afectan`); return false; }
    if (ctx.src !== 'combat' && ctx.src !== 'mark' && ctx.bp != null && st.team[ctx.bp] !== st.team[p] && yoriFast(st, p, z)) {
      log(st, p, `${nm} es demasiado rápido: el efecto no lo alcanza`);
      return false;
    }
    if ((fromCard && (ab.includes('regen5') || ab.includes('regen60'))) || (ctx.src === 'power' && ab.includes('regen60'))) {
      log(st, p, `${nm} es inmune: ${ctx.src === 'power' ? 'la habilidad' : 'la carta'} no le afecta`);
      noteSaved(st, nm);
      return false;
    }
    if ((ctx.src === 'combat' || ctx.src === 'power') && ab.includes('regenx')) {          // Deadpool: Regeneración extrema
      log(st, p, `${nm} se regenera: ${ctx.src === 'power' ? 'las habilidades' : 'el combate'} no pueden destruirlo`);
      noteSaved(st, nm);
      return false;
    }
    if (ctx.src === 'power' && ctx.pw !== 'purpura' && (ab.includes('galres') || (ab.includes('uivel') && ctx.bp != null && st.team[ctx.bp] !== st.team[p]))) {
      log(st, p, `${nm} es inmune: la habilidad no le afecta`);
      noteSaved(st, nm);
      return false;
    }
    if (ctx.src === 'combat' && ab.includes('mantok')) {                                   // Naruto Chico de Una Cola: no muere por combate
      log(st, p, `${nm} resiste el combate gracias al Manto del Kyuubi`);
      noteSaved(st, nm);
      return false;
    }
    if (m.manto && ctx.src !== 'mark') {                                                   // Naruto Chico: el manto recibe el golpe mortal
      m.manto = false; dropMods(m, 'manto');
      log(st, p, `El manto de Kyuubi de ${nm} se destruye en su lugar: ${nm} se salva`);
      noteSaved(st, nm);
      return false;
    }
    if (fromCard && ab.includes('escudo') && shieldOf(m) > 0) {
      uOf(m).sh = 0;
      log(st, p, `El escudo de ${nm} absorbe el efecto y se destruye`);
      noteSaved(st, nm);
      return false;
    }
    if (ctx.src === 'combat' && ctx.defn && m.av && m.av.on && m.av.uid != null) { avDies(st, p, z, m); return false; }     // Anti-Venom muere en su lugar
    if (ctx.src !== 'mark') {
      if (m.jk && equipDies(st, p, m, 'jk')) return false;                                        // Jake se destruye en su lugar
      if (m.sym && equipDies(st, p, m, 'sym')) return false;                                      // Venom se destruye en su lugar
      const gi = P.st.findIndex(q => q && !q.down && q.equipTo === z && def(q.c).pgem);          // Gema del Poder: se sacrifica en su lugar
      if (gi >= 0) { removeST(st, p, gi); log(st, p, `La Gema del Poder se sacrifica: ${nm} se salva`); noteSaved(st, nm); return false; }
      if (ab.includes('resis')) {                                                                 // Titán de Ataque: Resistencia titánica (2 vidas)
        const tu = uOf(m);
        if (tu.vidas == null) tu.vidas = 2;
        if (tu.vidas > 0) { tu.vidas--; log(st, p, `${nm} resiste la muerte (Resistencia titánica): le quedan ${tu.vidas} de 2 vidas`); noteSaved(st, nm); return false; }
      }
      if (ab.includes('asimila')) {                                                               // Mahoraga: la primera muerte de cada turno la regenera
        const u = uOf(m);
        if (u.asTurn !== st.turn) { u.asTurn = st.turn; log(st, p, `${nm} se adapta a la muerte y se regenera (Asimilación)`); noteSaved(st, nm); return false; }
      }
    }
    {   // ----- tanda 6 -----
      const foeBy = ctx.bp != null ? st.team[ctx.bp] !== st.team[p] : !!(ctx.by && st.team[ctx.by.p] !== st.team[p]);
      if (ctx.src === 'power' && foeBy && ab.includes('astaprot') && !uOf(m).astaPr) {                  // Asta Unión Demoníaca
        uOf(m).astaPr = true; log(st, p, `${nm} usa la Protección de la forma negra: la habilidad no lo destruye`); noteSaved(st, nm); return false;
      }
      if (ctx.src === 'power' && foeBy) {                                                                   // Elizabeth: Barrera de la Diosa
        for (let q = 0; q < st.n; q++) {
          if (!st.players[q].alive || st.team[q] !== st.team[p]) continue;
          const el = st.players[q].mz.find(x => x && !x.down && has(st, x, 'elizbar') && uOf(x).ebT !== st.turn);
          if (el) { uOf(el).ebT = st.turn; log(st, q, `${mdef(el).name} usa la Barrera de la Diosa: ${nm} no es destruido`); noteSaved(st, nm); return false; }
        }
      }
      if (m.bySung && ab.includes('beruregen') && !uOf(m).beruR && foeBy && (ctx.src === 'combat' || ctx.src === 'power')) {      // Beru: Regeneración de sombras
        uOf(m).beruR = true; m.defFix = 500; log(st, p, `${nm} se regenera en las sombras: sobrevive con 500 de DEF`); noteSaved(st, nm); return false;
      }
      if (isSoldier(m) && ctx.src !== 'combat' && foeBy && !ab.includes('belmar')) {                      // Bellion: Gran Mariscal
        const bz = P.mz.findIndex(x => x && x !== m && !x.down && has(st, x, 'belmar') && uOf(x).bmT !== st.turn);
        if (bz >= 0) {
          uOf(P.mz[bz]).bmT = st.turn;
          log(st, p, `Gran Mariscal: ${mdef(P.mz[bz]).name} recibe la destrucción en lugar de ${nm}`);
          noteSaved(st, nm);
          destroyMonster(st, p, bz, ctx);
          return false;
        }
      }
      if (ab.includes('sjsac') && ctx.src !== 'mark') {                                                    // Sung Jin-Woo: Sacrificio de las sombras
        let sz = -1;
        P.mz.forEach((x, i) => { if (x && x !== m && isSoldier(x) && (sz < 0 || atkOf(st, P, i) < atkOf(st, P, sz))) sz = i; });
        if (sz >= 0) {
          const sn = mdef(P.mz[sz]).name;
          removeMonster(st, p, sz, 'grave');
          log(st, p, `Sacrificio de las sombras: ${sn} se sacrifica y ${nm} se salva`);
          noteSaved(st, nm);
          return false;
        }
      }
      if (ctx.src === 'combat' && ctx.by && st.team[ctx.by.p] !== st.team[p] && ab.includes('satanplan')) {      // Mr. Satan: ¡Esto estaba planeado!
        if (rnd(st) < 0.5) {
          toHandM(st, p, z);
          log(st, p, `¡Esto estaba planeado! ${nm} escapa y vuelve a la mano`);
          noteSaved(st, nm);
          return false;
        }
        log(st, p, `¡Esto estaba planeado! ${nm} intenta escapar, pero no lo consigue`);
      }
      if (m.bySung && ab.includes('igrishon') && !m.c.igH && sungOn(st, p)) {                             // Igris: Honor del Caballero
        m.c.igH = true;
        const t = toHandM(st, p, z);
        log(st, p, `Honor del Caballero: ${nm} vuelve a la mano en vez de ir al cementerio`);
        allyGone(st, p, t);
        const k0 = ctx.by ? slotByUid(st, ctx.by.p, ctx.by.uid) : null;
        if (k0) { const ku = uOf(k0.m); ku.kills = (ku.kills || 0) + 1; }
        return true;
      }
    }
    if (m.copy) { revertCopy(st, m, p); return false; }
    const victimAbs = rawAbil(m), victimPos = m.pos;
    const killer = ctx.by ? slotByUid(st, ctx.by.p, ctx.by.uid) : null;
    const banish = !!m.ghost || (!!killer && ctx.src !== 'mark' && abil(st, killer.m).includes('espada'));       // Espada de Exterminio
    removeMonster(st, p, z, banish ? 'banish' : 'grave', { death: true });
    if (banish) log(st, p, m.ghost ? `${nm} es desterrado` : `${nm} es desterrado por la Espada de Exterminio`);
    if (ab.includes('spinach') && !m.c.spent && !banish) st.trig.push({ k: 'spinach', p, uid: m.c.uid });
    if (m.c && TITAN_OF[m.c.id] && !m.copy && !banish) st.trig.push({ k: 'titan', p, uid: m.c.uid, z, tid: TITAN_OF[m.c.id], nm });
    if (ab.includes('elizpod') && !banish) st.trig.push({ k: 'eliz', p: m.owner != null ? m.owner : p });      // Elizabeth: Poder de la Diosa
    for (let q = 0; q < st.n; q++) {                                                                     // Sung Jin-Woo: Ejército de las sombras
      if (!st.players[q].alive || st.team[q] === st.team[p]) continue;
      for (const x of st.players[q].mz) if (x && !x.down && has(st, x, 'sjarmy')) { x.sjc = (x.sjc || 0) + 1; log(st, q, `${mdef(x).name} obtiene una carga de sombra (${x.sjc})`); }
    }
    if (st.domain && st.domain.higu && killer && st.team[killer.p] !== st.team[st.domain.p] && !st.domain.higu.sword) {      // Higuruma: Juicio de la corte
      st.domain.higu.k++;
      if (st.domain.higu.k >= 4) { st.domain.higu.sword = true; log(st, st.domain.p, 'Juicio de la corte: la Maldición Juez le entrega a Higuruma la Espada del Verdugo (+2000 ATK)'); }
      else log(st, st.domain.p, `Juicio de la corte: los enemigos llevan ${st.domain.higu.k} de 4 asesinatos dentro del dominio`);
    }
    if (killer && ctx.src === 'combat') {
      const kmm = killer.m;
      if ((kmm.mods || []).some(x => x.k === 'kame')) {                                                  // Kamehameha: también la magia de detrás
        const S = st.players[p].st[z];
        if (S && def(S.c).kind === 'spell' && !S.prison) { log(st, killer.p, `El Kamehameha atraviesa y destruye ${S.down ? 'la carta mágica boca abajo' : def(S.c).name} de detrás`); removeST(st, p, z); }
      }
      if ((kmm.mods || []).some(x => x.k === 'caza')) { addMod(st, kmm, 'cazap', 400, 0, 0); log(st, killer.p, `Caza Implacable: ${mdef(kmm).name} conserva los +400 ATK para siempre`); }
      if (has(st, kmm, 'galco')) { const gu = uOf(kmm); gu.gco = (gu.gco || 0) + 1; log(st, killer.p, `Critical Over: ${mdef(kmm).name} acumula una carga (${gu.gco})`); }
      if (has(st, kmm, 'belorg') && uOf(kmm).boT !== st.turn) {                                          // Bellion: Espada Orgánica
        uOf(kmm).boT = st.turn; kmm.orgT = st.turn;
        kmm.xtra = { t: st.turn, n: (kmm.xtra && kmm.xtra.t === st.turn ? kmm.xtra.n : 0) + 1 };
        log(st, killer.p, `Espada Orgánica: ${mdef(kmm).name} puede atacar a otro personaje enemigo`);
      }
    }
    if (killer) {
      const ku = uOf(killer.m);
      ku.kills = (ku.kills || 0) + 1;
      const cbk = st.atk || st.cmb;
      if (!(cbk && cbk.p === killer.p && st.players[killer.p].mz[cbk.z] === killer.m)) ferocidad(st, killer.p, killer.m, 'mata');      // si ya sumó por declarar este ataque, el combate no da una segunda carga
      onKill(st, killer, { p, name: nm, pos: victimPos, abs: victimAbs }, ctx);
      const vinst = st.team[killer.p] !== st.team[p] ? venomOf(killer.m) : null;                 // Venom, o su portador, destruye a un enemigo
      if (vinst) {
        const known = (vinst.keep || []).map(k => k.id).concat(def(vinst).ab || []);
        const vo = Array.from(new Set(victimAbs.filter(a => STEALABLE.includes(a) && !known.includes(a))));
        if (vo.length) st.trig.push({ k: 'vlearn', p: killer.p, vuid: vinst.uid, from: nm, opts: vo });
      }
      const kab = abil(st, killer.m);
      const cap = kab.includes('robar2') ? 2 : kab.includes('robar1') ? 1 : 0;
      const opts = victimAbs.filter(a => GIVE.includes(a) && !(killer.m.ext || []).includes(a) && !(mdef(killer.m).ab || []).includes(a));
      if (cap && (ku.stolen || 0) < cap && opts.length) st.trig.push({ k: 'steal', p: killer.p, uid: killer.m.c.uid, from: nm, opts: Array.from(new Set(opts)) });
    }
    return true;
  }
  /** Anti-Venom: si atacan a su anfitrión y éste iba a ser destruido, muere Anti-Venom (va al cementerio) y el anfitrión queda normal. */
  function avDies(st, p, z, m) {
    const av = m.av, i = (m.link || []).findIndex(c => c.uid === av.uid);
    const inst = i >= 0 ? m.link.splice(i, 1)[0] : null;
    dropMods(m, 'av-base'); dropMods(m, 'av-atk'); m.av = null;
    const nm = mdef(m).name;
    if (!inst) return;
    const O = st.players[inst.by != null ? inst.by : (m.owner != null ? m.owner : p)];
    O.grave.push(inst);
    log(st, p, `${def(inst).name} muere en lugar de ${nm}: ${nm} se salva y queda normal`);
    st.log[st.log.length - 1].avd = 1;
    noteSaved(st, nm);
    onDeath(st, p, { c: inst }, 'grave');
  }
  /** Jake o Venom equipados protegen a su portador: se destruyen en su lugar (una vez por destrucción) y su bonificación se quita al instante. */
  /** Simbiosis: Venom puede estar acoplado todo el tiempo a un personaje de Marvel; a cualquier otro sólo 2 turnos (rondas). */
  const SYM_TURNS = 2;
  /** Simbiontes que se acoplan a un aliado: bonificación [ATK, DEF] (la mitad de sus estadísticas). */
  const SYMB = { c_venom: [700, 650], c_carnage: [650, 650] };
  const symLeft = (st, m) => (!m.sym || mdef(m).type === 'marvel' ? null : Math.max(0, SYM_TURNS - Math.max(0, elapsed(st, m.sym.t0 != null ? m.sym.t0 : st.turn))));
  /** Venom se separa de su anfitrión y sale al campo como personaje normal (necesita una zona libre; si no la hay, espera). Tras separarse, no puede acoplarse otra vez hasta su siguiente turno. */
  function venomSeparate(st, p, z) {
    const P = st.players[p], h = P.mz[z];
    if (!h || !h.sym) return false;
    const i = (h.link || []).findIndex(c => c.uid === h.sym.uid);
    if (i < 0) { h.sym = null; dropMods(h, 'venom'); return false; }
    const inst = h.link[i], d = def(inst), nz = spot(P, d);
    if (nz < 0) return false;
    h.link.splice(i, 1); if (!h.link.length) delete h.link;
    dropMods(h, 'venom'); h.sym = null;
    inst.spent = false;
    P.mz[nz] = mkSlot(st, inst, { pos: 'atk' });
    P.symT = st.turn;
    log(st, p, `${def(inst).name} se separa de ${mdef(h).name} y sale como personaje normal: no podrá acoplarse de nuevo hasta su siguiente turno`);
    return true;
  }
  function equipDies(st, p, m, key) {
    const eq = m[key], i = (m.link || []).findIndex(c => c.uid === eq.uid);
    if (i < 0) { m[key] = null; return false; }
    const inst = m.link.splice(i, 1)[0];
    if (!m.link.length) delete m.link;
    dropMods(m, key === 'jk' ? 'jake' : 'venom'); m[key] = null;
    const nm = mdef(m).name, O = st.players[inst.by != null ? inst.by : (m.owner != null ? m.owner : p)];      // la carta equipada vuelve a quien la puso
    O.grave.push(inst);
    log(st, p, `${def(inst).name} se destruye en lugar de ${nm}: ${nm} se salva y pierde su bonificación`);
    st.log[st.log.length - 1].avd = 1;
    noteSaved(st, nm);
    onDeath(st, p, { c: inst }, 'grave');
    return true;
  }
  /** La carta de Venom que cuenta para este personaje: él mismo (si es Venom) o el Venom que lleva equipado. */
  function venomOf(m) {
    if (m.sym) { const v = (m.link || []).find(c => c.uid === m.sym.uid); return v && v.id === 'c_venom' ? v : null; }
    return m.c.id === 'c_venom' && !m.copy ? m.c : null;
  }
  /** Efectos de «asesinar»: Kayn desbloquea y crece, Anti-Venom ofrece evolucionar. */
  function onKill(st, killer, victim, ctx) {
    const km = killer.m, P = st.players[killer.p], kab = abil(st, km), kn = km.kn;
    if (ctx.src === 'combat' && kab.includes('sed') && st.cmb && st.cmb.p === killer.p && st.players[killer.p].mz[st.cmb.z] === km && !km.sed) {      // Carnage: Sed de sangre
      const gS = gx(P, st.cmb.z);
      addMod(st, km, 'sed', 400 * gS, 0, 0);
      km.sed = { t: st.turn, fresh: true };
      if (km.sedN !== st.turn) { km.sedN = st.turn; km.atkN = Math.max(0, (km.atkN || 1) - 1); log(st, killer.p, `Sed de sangre: ${mdef(km).name} gana +${400 * gS} ATK y puede atacar otra vez`); }
      else log(st, killer.p, `Sed de sangre: ${mdef(km).name} gana +${400 * gS} ATK`);
    }
    if (ctx.src === 'combat' && kab.includes('cazador')) {      // Dante: Cazador de demonios
      const ud = uOf(km); ud.dk = (ud.dk || 0) + 1;
      const own = rawAbil(km), opts = ['atk', 'def'].concat((km.c.id === 'c_dante_dt' ? Array.from(new Set((victim.abs || []).filter(x => STEALABLE.includes(x) && !own.includes(x)))) : []));      // sólo Devil Trigger absorbe habilidades
      st.trig.push({ k: 'dante', p: killer.p, uid: km.c.uid, from: victim.name, opts });
    }
    if (ctx.src === 'combat' && kab.includes('marcamal') && !uOf(km).marca2) st.trig.push({ k: 'marcamal', p: killer.p, uid: km.c.uid });
    if (ctx.src === 'combat') { const ms = minionsOf(P, killer.z); if (ms) { ms.min.n++; log(st, killer.p, `Un Minion se une al ejército de ${mdef(km).name} (${ms.min.n})`); } }
    if (ctx.src === 'combat' && kab.includes('warsangre')) { heal(st, killer.p, 500); log(st, killer.p, `${mdef(km).name} recupera 500 PV (Sed de sangre)`); }
    if (ctx.src === 'combat' && km.c.id === 'c_kayn') {
      const f = km.form;
      if (!f) { if (!kn.rh) { kn.rh = true; log(st, killer.p, 'Kayn desbloquea la transformación en Rhaast'); } }
      else if (f === 'c_kayn_rhaast') { addMod(st, km, 'rhaastk', 300, 300, 0); log(st, killer.p, 'Rhaast se fortalece por el asesinato: +300 ATK y +300 DEF'); }
      else if (f === 'c_kayn_sombra' && km.pos === 'atk' && victim.pos === 'def') { addMod(st, km, 'sombra', 300, 0, 0); log(st, killer.p, 'Asesino Sombra gana 300 ATK'); }
    }
    if (km.av && (ctx.src === 'combat' || ctx.src === 'power') && km.av.on) {
      const av = km.av;
      if (!av.choice) st.trig.push({ k: 'avchoice', p: killer.p, uid: km.c.uid });
      else if (av.choice === 'atk' && av.n < 3 && av.turn !== st.turn) {
        av.n++; av.turn = st.turn;
        addMod(st, km, 'av-atk', 400 * gx(P, killer.z), 400 * gx(P, killer.z), 0);
        log(st, killer.p, `Adaptación Ofensiva: ${mdef(km).name} gana +${400 * gx(P, killer.z)} ATK y DEF (${av.n}/3)`);
      }
    }
  }
  /** Shang Tsung transformado es derrotado: no muere, pierde la transformación y ya no puede volver a transformarse. */
  function revertCopy(st, m, p) {
    const was = mdef(m).name;
    m.copy = null; m.noCopy = true; m.bonus = null; m.ext = []; m.extFrom = null; m.cFury = null; m.cDom = null;
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
        const inst = P.grave.find(c => c.uid === t.uid), tid = t.tid || 'c_titan', ti = handIdx(P, tid);
        if (!inst || ti < 0) continue;
        if (formAnchor(P, t.z, tid) < 0) { log(st, t.p, `No hay espacio para ${def({ id: tid }).name}`); continue; }
        st.pending = { k: 'ability', ab: 'titan', player: t.p, uid: t.uid, stage: 'ask', z: t.z, id: tid, nm: t.nm || def(inst).name };
      } else if (t.k === 'superv') {                    // Cell Perfecto revive una vez por carta si cae al cementerio
        const gi = P.grave.find(c => c.uid === t.uid);
        if (!gi || gi.rev) continue;
        gi.rev = true;
        log(st, t.p, `${def(gi).name} revive con Supervivencia Saiyan`);
        reviveInst(st, t.p, gi);
      } else if (t.k === 'dante') {                     // elige la recompensa por el asesinato
        const dk = slotByUid(st, t.p, t.uid);
        if (!dk || dk.m.down) continue;
        const own = rawAbil(dk.m);
        st.pending = { k: 'ability', ab: 'dante', player: t.p, uid: t.uid, stage: 'ask', from: t.from, opts: t.opts.filter(o => o === 'atk' || o === 'def' || !own.includes(o)), n: dk.m.c.id === 'c_dante_dt' ? 400 : 300 };
      } else if (t.k === 'marcamal') {                  // Sasuke Chico: Marca de maldición tras vencer en combate
        const sk = slotByUid(st, t.p, t.uid);
        if (!sk || sk.m.down || uOf(sk.m).marca2) continue;
        const opts = ['stat'];
        if (handIdx(P, 'c_sasuke_marca') >= 0) opts.push('form');
        st.pending = { k: 'ability', ab: 'marcamal', player: t.p, uid: t.uid, stage: 'ask', opts };
      } else if (t.k === 'kuribomo') {                  // Kuriboh Mago Oscuro: se lleva consigo a un personaje enemigo
        const cands = [];
        for (const e of foes(st, t.p)) for (const z of zonesWith(st.players[e].mz)) if (canTarget(st, t.p, e, z)) cands.push({ vs: e, z });
        if (!cands.length) continue;
        st.pending = { k: 'ability', ab: 'kuribomo', player: t.p, stage: 'target', nm: t.nm, cands };
      } else if (t.k === 'karma') {
        const s = P.st[t.stz];
        if (!s || !s.karma || s.c.uid !== t.uid) continue;
        const cands = [];
        for (const e of foes(st, t.p)) for (const z of zonesWith(st.players[e].mz)) if (canTarget(st, t.p, e, z)) cands.push({ vs: e, z });
        if (!cands.length) { removeST(st, t.p, t.stz); log(st, t.p, 'Karma se destruye: no hay enemigos'); continue; }
        st.pending = { k: 'ability', ab: 'karma', player: t.p, uid: t.uid, stage: 'foe', stz: t.stz, cands };
      } else if (t.k === 'mahoraga') {                  // invocación especial reactiva: el rival invocó a un personaje de 10★ o más
        const hv = findByUid(st, t.uid), hi = handIdx(P, 'c_mahoraga');
        if (!hv || hv.m.down || lvl(hv.m) < 10 || hi < 0 || spot(P, def(P.hand[hi])) < 0) continue;
        st.pending = { k: 'ability', ab: 'mahoraga', player: t.p, uid: P.hand[hi].uid, stage: 'ask', nm: mdef(hv.m).name };
      } else if (t.k === 'gravrew') {                   // Cámara de Gravedad: elige la recompensa
        const g = slotByUid(st, t.p, t.uid);
        if (!g || !g.m.gr || g.m.gr.n < 2) continue;
        st.pending = { k: 'ability', ab: 'gravrew', player: t.p, uid: t.uid, stage: 'ask', nm: mdef(g.m).name, opts: ['vel', 'res', 'pod'] };
      } else if (t.k === 'muerte') {                    // La Muerte aparece cuando alguien se salva de morir
        const hi = handIdx(P, 'c_la_muerte');
        if (hi < 0 || spot(P, def(P.hand[hi])) < 0 || P.mz.some(m => m && m.c.id === 'c_la_muerte')) continue;
        st.pending = { k: 'ability', ab: 'muerte', player: t.p, uid: P.hand[hi].uid, stage: 'ask', nm: t.nm };
      } else if (t.k === 'yutalearn') {                 // Copia de Técnicas: Yuta puede aprender la habilidad que acaba de ver
        const y = slotByUid(st, t.p, t.uid);
        if (!y || !isYuta(y.m) || !has(st, y.m, 'copia')) continue;
        const u = uOf(y.m);
        if (u.lrnT === st.turn || (u.learned || []).length >= 3 || (u.learned || []).includes(t.id) || rawAbil(y.m).includes(t.id)) continue;
        st.pending = { k: 'ability', ab: 'yutalearn', player: t.p, uid: t.uid, stage: 'ask', id: t.id, nm: (C().AB[t.id] || [t.id])[0], from: t.from };
      } else if (t.k === 'vlearn') {                    // Absorción de habilidades de Venom
        const vi = findVenom(st, t.p, t.vuid);
        if (!vi) continue;
        const known = (vi.keep || []).map(k => k.id).concat(def(vi).ab || []);
        const opts = t.opts.filter(a => !known.includes(a));
        if (!opts.length) continue;
        st.pending = { k: 'ability', ab: 'vlearn', player: t.p, uid: t.vuid, stage: 'ask', from: t.from, opts };
      } else if (t.k === 'eliz') {                        // Elizabeth: Poder de la Diosa
        const c = P.grave.filter(i => def(i).kind === 'monster' && def(i).level <= 6 && i.id !== 'c_elizabeth');
        if (!c.length) continue;
        st.pending = { k: 'pick', player: t.p, zone: 'grave', cands: c.map(i => i.uid), cont: 'eliz' };
      } else if (t.k === 'tobimm') {                      // Tobi: Maestro de la manipulación
        const tb = slotByUid(st, t.p, t.uid);
        if (!tb || tb.m.down) continue;
        const cands = foeChars(st, t.p);
        if (!cands.length) continue;
        st.pending = { k: 'ability', ab: 'tobimm', player: t.p, uid: t.uid, stage: 'target', cands };
      } else if (t.k === 'avchoice') {                  // Evolución Adaptativa: elige una sola vez
        const hv = slotByUid(st, t.p, t.uid);
        if (!hv || !hv.m.av || !hv.m.av.on || hv.m.av.choice) continue;
        st.pending = { k: 'ability', ab: 'avchoice', player: t.p, uid: t.uid, stage: 'choice' };
      }
    }
  }
  /** La carta de Venom (en el campo o equipada a un aliado) del jugador p. */
  function findVenom(st, p, uid) {
    for (const m of st.players[p].mz) {
      if (!m) continue;
      if (m.c.uid === uid) return m.c;
      const l = (m.link || []).find(c => c.uid === uid);
      if (l) return l;
    }
    return null;
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
    entered(st, p, z);
    return z;
  }
  /** «Sangre Saiyan»: al ser revivido vuelve con +500 ATK y +500 DEF durante esa invocación. */
  function onRevive(st, p, z) {
    const m = st.players[p].mz[z];
    if (m && has(st, m, 'saiyan6')) {
      m.bonus = m.bonus || { atk: 0, def: 0 };
      m.bonus.atk += 600; m.bonus.def += 600;
      log(st, p, `${mdef(m).name}: Sangre Saiyan (+600 ATK y +600 DEF)`);
    }
    if (m && has(st, m, 'saiyan')) {
      m.bonus = m.bonus || { atk: 0, def: 0 };
      m.bonus.atk += 500; m.bonus.def += 500;
      log(st, p, `${mdef(m).name}: Sangre Saiyan (+500 ATK y +500 DEF)`);
    }
  }
  const boomReady = (st, m) => !!m && has(st, m, 'boom') && !m.c.spent;

  /** Anillo Único: bonificación y plazo de corrupción según las estrellas del portador al equiparlo. */
  function ringFor(st, bm) {
    const stars = mdef(bm).level, t0 = st.turn;
    if (bm.c.id === 'c_sauron') return { atk: 1000, def: 1000, n: 0, sauron: true, stars, t0 };
    if (stars <= 4) return { atk: 500, def: 500, n: 2, stars, t0 };
    if (stars <= 6) return { atk: 600, def: 600, n: 3, stars, t0 };
    return { atk: 700, def: 700, n: 5, stars, t0 };
  }
  /** Sauron vuelve del cementerio cada vez que se activa una magia de equipamiento sobre un personaje del campo. */
  function sauronReturn(st) {
    for (let q = 0; q < st.n; q++) {
      const Q = st.players[q];
      if (!Q.alive) continue;
      const inst = Q.grave.find(c => c.id === 'c_sauron');
      if (!inst || spot(Q, def(inst)) < 0) continue;
      log(st, q, 'El Regreso del Señor Oscuro: Sauron vuelve del cementerio');
      reviveInst(st, q, inst);
    }
  }
  /** Un monstruo entró al campo boca arriba: Guerrero del Infinito le da los Seis Ojos y Mahoraga puede responder desde la mano rival. */
  function entered(st, p, z) {
    const P = st.players[p], m = P.mz[z];
    if (!m || m.down) return;
    const gs = P.st.findIndex(s => s && !s.down && s.guerrero && s.guerrero.waiting);
    if (gs >= 0) {
      const s = P.st[gs];
      s.guerrero.waiting = false; s.equipTo = z;
      m.six = { t0: st.turn };
      log(st, p, `${mdef(m).name} recibe los Seis Ojos durante 3 turnos`);
    }
    if (has(st, m, 'tobimm')) st.trig.push({ k: 'tobimm', p, uid: m.c.uid });      // Tobi: Maestro de la manipulación
    mahoragaCall(st, p, m);
  }
  /** General Mahoraga: un personaje de 10★ o más acaba de llegar boca arriba al campo de p (invocación normal, especial,
   *  volteo o transformación). Cada rival con Mahoraga en la mano puede responder invocándolo desde allí. Nunca por
   *  invocaciones propias ni de compañeros, y una sola pregunta por jugador y por llegada. */
  function mahoragaCall(st, p, m) {
    if (!m || m.down || lvl(m) < 10) return;
    for (const e of foes(st, p)) {
      if (!st.players[e].alive || !st.players[e].hand.some(c => c.id === 'c_mahoraga')) continue;
      if ((st.trig || []).some(t => t.k === 'mahoraga' && t.p === e && t.uid === m.c.uid)) continue;
      (st.trig = st.trig || []).push({ k: 'mahoraga', p: e, uid: m.c.uid, by: p });
    }
  }
  // ---------------- magias ----------------
  const monsterCands = (P, f) => P.deck.filter(i => def(i).kind === 'monster' && f(def(i)));
  /** Zonas de monstruos rivales con carta boca arriba. */
  function zoneTargetsUp(st, p) {
    const out = [];
    for (const e of foes(st, p)) for (const z of zonesWith(st.players[e].mz)) if (!st.players[e].mz[z].down && canTarget(st, p, e, z) && !rikaUp(st, st.players[e].mz[z]) && !shadowSafe(st, p, e, z) && !isInk(st.players[e].mz[z])) out.push(multi(st) ? { vs: e, z } : { z });
    return out;
  }
  /** Rika Orimoto (Protección Absoluta): las magias y trampas no pueden elegirla ni afectarla. */
  const rikaOwn = (st, P) => zonesUp(P).filter(z => !has(st, P.mz[z], 'rikaprot') && !isInk(P.mz[z]));
  const rikaUp = (st, m) => !!m && !m.down && has(st, m, 'rikaprot');
  const PERM = { equip: 1, karma: 1, gem: 1, storm: 1, gokumon: 1, guerrero: 1, alma: 1 };
  /** Gema del Tiempo: hay una instantánea del campo propio de hace un turno propio. */
  const canRewind = (st, p) => st.current === p && !!(st.players[p].snaps && st.players[p].snaps.length >= 2);
  /** Restaura SOLO el campo propio (monstruos y magias/trampas) al estado que tenía al empezar su turno anterior.
   *  Las cartas se buscan por uid en su mano, mazo, cementerio, destierro o campo: nada se duplica ni se inventa.
   *  Lo que no se puede reconstruir (cartas que ya no son suyas, cartas rivales en su campo, fusiones, absorbidos, sellados, Karma y
   *  Gema de la Mente) se deja tal cual; las cartas que tenía en el campo y no estaban entonces vuelven a la mano. */
  function rewindField(st, p) {
    const P = st.players[p], snap = JSON.parse(P.snaps[0]);
    const lockedMz = s => s && ((s.owner != null && s.owner !== p) || s.abs || s.fused || (s.gemsIdle && s.gemsIdle.length));      // Thanos con gemas robadas guardadas tampoco se toca
    const lockedSt = s => s && (s.prison || s.gem || s.karma || s.c.id === 'c_gema_tiempo');      // ninguna Gema del Tiempo vuelve del cementerio (la usada se queda en él)
    const pool = {};
    const grab = (s) => { pool[s.c.uid] = s.c; for (const c of (s.link || [])) pool[c.uid] = c; };
    P.mz.forEach((s, z) => { if (s && !lockedMz(s)) { grab(s); P.mz[z] = null; } });
    P.st.forEach((s, z) => { if (s && !lockedSt(s)) { grab(s); P.st[z] = null; } });
    const find = (uid) => {
      if (pool[uid]) { const c = pool[uid]; delete pool[uid]; return c; }
      for (const k of ['hand', 'grave', 'banish', 'deck']) { const i = P[k].findIndex(c => c.uid === uid); if (i >= 0) return P[k].splice(i, 1)[0]; }
      return null;
    };
    const has = (uid) => !!pool[uid] || ['hand', 'grave', 'banish', 'deck'].some(k => P[k].some(c => c.uid === uid));
    const claimed = new Set();
    const restore = (s) => {
      const uids = [s.c.uid].concat((s.link || []).map(c => c.uid));
      if (uids.some(u => claimed.has(u) || !has(u))) return null;
      uids.forEach(u => claimed.add(u));
      s.c = find(s.c.uid);
      if (s.link) s.link = s.link.map(c => find(c.uid));
      return s;
    };
    let back = 0;
    snap.mz.forEach((s, z) => {
      if (!s || lockedMz(s) || P.mz[z] || s.c.id === undefined) return;
      const o = occ(P);
      if (o[z] || (s.wide && (z + 1 >= ZONES || o[z + 1])) || (s.huge && (z !== 0 || o[1] || o[2]))) return;
      const r = restore(s);
      if (r) { Object.assign(r, { attacked: false, moved: false, atkMod: 0, atkN: 0, hira: 0 }); P.mz[z] = r; back++; }      // como al empezar un turno: puede volver a atacar y moverse
    });
    snap.st.forEach((s, z) => {
      if (!s || lockedSt(s) || P.st[z]) return;
      const r = restore(s);
      if (r) { P.st[z] = r; back++; }
    });
    for (const uid of Object.keys(pool)) P.hand.push(pool[uid]);       // lo que estaba en el campo y entonces no: vuelve a la mano
    log(st, p, `La Gema del Tiempo retrocede un turno: su campo vuelve a como estaba al empezar su turno anterior`);
    return back;
  }
  const FX = {
    tiempo: {
      targets: (st, p) => (canRewind(st, p) ? [null] : []),
      resolve: (st, p) => { rewindField(st, p); }
    },
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
    // Gema del Alma: magia continua (la lógica está en almaCollect / spowerActs)
    alma: {
      targets: () => [null],
      resolve: () => { /* se coloca en continueSpell */ }
    },
    // Selección de magia: agrega una magia del mazo a la mano
    searchSpell: {
      targets: (st, p) => st.players[p].deck.some(i => def(i).kind === 'spell') ? [null] : [],
      resolve: (st, p) => {
        const c = st.players[p].deck.filter(i => def(i).kind === 'spell');
        if (c.length) st.pending = { k: 'pick', player: p, zone: 'deck', cands: c.map(i => i.uid), cont: 'searchSpell' };
      }
    },
    // Invitación: invoca especialmente desde el mazo un personaje de hasta 4 estrellas
    invite: {
      targets: (st, p, d) => inviteCands(st, p, d).length ? [null] : [],
      resolve: (st, p, d) => {
        const c = inviteCands(st, p, d);
        if (c.length) st.pending = { k: 'pick', player: p, zone: 'deck', cands: c.map(i => i.uid), cont: 'invite' };
      }
    },
    // Mark 1: Iron Man +1000 ATK; otros Marvel +700; el resto +400 (sólo ATK, este turno)
    mark1: {
      targets: (st, p) => rikaOwn(st, st.players[p]).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        const dm = mdef(m), n = (m.c.id === 'c_tony_armadura' || dm.name === 'Iron Man') ? 1000 : dm.type === 'marvel' ? 700 : 400;
        m.atkMod = (m.atkMod || 0) + n;
        log(st, p, `${dm.name} gana ${n} ATK este turno`);
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
    // Cámara de Gravedad: un aliado entrena 2 turnos (no ataca ni cambia de posición) y elige una recompensa
    gravedad: {
      targets: (st, p) => rikaOwn(st, st.players[p]).filter(z => !st.players[p].mz[z].gr).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        m.gr = { n: 0, t0: st.turn };
        log(st, p, `${mdef(m).name} empieza el Entrenamiento de Gravedad (no ataca ni cambia de posición hasta terminarlo)`);
      }
    },
    // Sala del Espíritu y el Tiempo: un aliado sale del campo 2 turnos y vuelve con 2 contadores de entrenamiento
    sala: {
      targets: (st, p) => rikaOwn(st, st.players[p]).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        if (toLimbo(st, p, t.z, 'rounds', 2, 'Sala del Espíritu y el Tiempo')) st.limbo[st.limbo.length - 1].sala = true;
      }
    },
    // Edo Tensei: sacrificas a un personaje tuyo del campo y revives a uno de tu cementerio (puede ser el sacrificado)
    edo: {
      targets: (st, p) => {
        const P = st.players[p], out = [];
        P.mz.forEach((m, z) => {
          if (!m || isInk(m) || (m.owner != null && m.owner !== p)) return;      // fichas de tinta y personajes corrompidos no se sacrifican
          const gone = m.c;
          const cands = P.grave.filter(i => def(i).kind === 'monster' && !def(i).hidden && spot(P, def(i), [z]) >= 0).map(i => i.uid);
          if (gone && def(gone).kind === 'monster' && !def(gone).hidden && spot(P, def(gone), [z]) >= 0) cands.push(gone.uid);
          for (const u of cands) out.push({ z, u });
        });
        return out;
      },
      resolve: (st, p, d, t) => {
        const P = st.players[p], m = t && P.mz[t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        const nm = mdef(m).name;
        log(st, p, `Edo Tensei: sacrifica a ${nm}`);
        removeMonster(st, p, t.z, 'grave');
        const c = P.grave.find(x => x.uid === t.u);
        if (!c || reviveInst(st, p, c) < 0) log(st, p, 'Edo Tensei: no revive a nadie');
      }
    },
    destroyOne: {
      targets: (st, p, d) => st.players[p].lp > d.self ? zoneTargets(st, p, 'mz') : [],
      resolve: (st, p, d, t) => {
        const e = foeOf(st, p, t), o = st.players[e];
        if (!t || !o.mz[t.z]) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, `destruye a ${mdef(o.mz[t.z]).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        destroyMonster(st, e, t.z, { src: 'spell', bp: p });
        lose(st, p, d.self, true);
      }
    },
    destroyAll: {
      targets: st => st.players.some(P => zonesWith(P.mz).length) ? [null] : [],
      resolve: (st, caster) => {
        for (let p = 0; p < st.n; p++) for (let z = 0; z < ZONES; z++) destroyMonster(st, p, z, { src: 'spell', bp: caster, all: true });
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
      targets: (st, p) => rikaOwn(st, st.players[p]).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        m.atkMod = (m.atkMod || 0) + d.n;
        log(st, p, `${mdef(m).name} gana ${d.n} ATK este turno`);
      }
    },
    equip: {
      targets: (st, p, d) => rikaOwn(st, st.players[p]).filter(z => lvl(st.players[p].mz[z]) >= (d.minStars || 0)).map(z => ({ z })),
      resolve: () => { /* se coloca en continueSpell */ }
    },
    karma: {
      targets: (st, p) => rikaOwn(st, st.players[p]).map(z => ({ z })),
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
    // ---------- tanda 4 ----------
    // Kaioken: +400 ATK/DEF 3 turnos a un aliado; se puede llevar a x10 una vez (ver doPower 'kaiox10')
    kaiosp: {
      targets: (st, p) => rikaOwn(st, st.players[p]).filter(z => !(st.players[p].mz[z].mods || []).some(x => x.k === 'kaiospell')).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m || m.down) { log(st, p, 'no tiene objetivo'); return; }
        addMod(st, m, 'kaiospell', 400, 400, 3); m.ksp = { t0: st.turn, x: 0 };
        log(st, p, `${mdef(m).name} recibe el Kaioken: +400 ATK y +400 DEF durante 3 turnos`);
      }
    },
    // Botiquín: quita los estados negativos de un personaje del campo, tuyo o rival
    botiquin: {
      targets: (st, p) => {
        const out = [];
        for (let q = 0; q < st.n; q++) {
          if (!st.players[q].alive) continue;
          for (const z of zonesWith(st.players[q].mz)) { const m = st.players[q].mz[z]; if (!m.down && canTarget(st, p, q, z) && !rikaUp(st, m)) out.push({ vs: q, z }); }
        }
        return out;
      },
      resolve: (st, p, d, t) => {
        const q = t && t.vs != null ? t.vs : p, m = st.players[q].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        const nmB = mdef(m).name, names = seedList(st, q, t.z, true, true);
        log(st, p, `Botiquín: ${nmB} ${names.length ? 'se libera de ' + names.join(', ') : 'no tenía estados negativos'}`);
        if (multi(st)) st.log[st.log.length - 1].q = q;
      }
    },
    // Death Note: el personaje enemigo muere durante el turno de su dueño
    deathnote: {
      targets: (st, p) => zoneTargets(st, p, 'mz'),
      resolve: (st, p, d, t) => {
        const e = foeOf(st, p, t), m = st.players[e].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        m.dn = { by: p };
        log(st, p, `${m.down ? 'Un personaje boca abajo' : mdef(m).name} queda sentenciado: morirá durante el turno de su dueño`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
      }
    },
    // Ataque de Ultratumba: un personaje de cualquier cementerio ataca como si estuviera en tu campo y se destierra
    ultratumba: {
      targets: (st, p) => {
        const P = st.players[p], out = [], tg = [];
        for (const e of foes(st, p)) {
          const O = st.players[e], all = zonesWith(O.mz);
          if (!all.length) { tg.push({ vs: e, tz: 'direct' }); continue; }
          for (const z of all) if (canTarget(st, p, e, z)) tg.push({ vs: e, tz: z });
        }
        if (!tg.length) return out;
        for (let g = 0; g < st.n; g++) for (const c of st.players[g].grave) {
          const cd = def(c);
          if (cd.kind !== 'monster' || spot(P, cd) < 0) continue;
          for (const x of tg) out.push({ g, u: c.uid, vs: x.vs, tz: x.tz });
        }
        return out;
      },
      resolve: (st, p, d, t) => {
        const G = st.players[t.g], P = st.players[p], E = st.players[t.vs], i = G.grave.findIndex(c => c.uid === t.u);
        if (i < 0 || !E || !E.alive) { log(st, p, 'no tiene objetivo'); return; }
        const inst = G.grave[i], cd = def(inst), z = spot(P, cd);
        if (z < 0) { log(st, p, 'no hay espacio para el atacante'); return; }
        if (t.tz !== 'direct' && !E.mz[t.tz]) { log(st, p, 'su objetivo ya no está en el campo'); return; }
        if (t.tz === 'direct' && zonesWith(E.mz).length) { log(st, p, 'ya no puede atacar directamente'); return; }
        G.grave.splice(i, 1);
        const o = { pos: 'atk', ghost: true, wide: !!cd.wide };
        if (t.g !== p) o.owner = t.g;
        P.mz[z] = mkSlot(st, inst, o);
        log(st, p, `Ataque de Ultratumba: ${cd.name} vuelve del más allá para atacar`);
        if (multi(st)) st.log[st.log.length - 1].q = t.g;
        declareAttack(st, p, z, t.tz, t.vs);
      }
    },
    // ---------- tanda 6 ----------
    // Mafuba: encierra a un personaje enemigo 2 turnos fuera del campo
    mafuba: {
      targets: (st, p) => zoneTargets(st, p, 'mz').filter(t => !isInk(st.players[foeOf(st, p, t)].mz[t.z])),
      resolve: (st, p, d, t) => {
        const e = foeOf(st, p, t), m = st.players[e].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        log(st, p, `Mafuba encierra a ${m.down ? 'un personaje boca abajo' : mdef(m).name} en un recipiente durante 2 turnos`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        toLimbo(st, e, t.z, 'rounds', 2, 'Mafuba');
      }
    },
    // ---------- tanda 2 ----------
    // Uno, Dos: un personaje tuyo puede atacar hasta 2 veces este turno
    uno: {
      targets: (st, p) => rikaOwn(st, st.players[p]).map(z => ({ z })),
      resolve: (st, p, d, t) => {
        const m = st.players[p].mz[t && t.z];
        if (!m) { log(st, p, 'no tiene objetivo'); return; }
        m.uno = st.turn;
        log(st, p, `${mdef(m).name} podrá atacar hasta 2 veces este turno`);
      }
    },
    // Caña de Pescar de Gon: un personaje tuyo desterrado vuelve a tu mano
    cana: {
      targets: (st, p) => st.players[p].banish.filter(i => def(i).kind === 'monster').map(i => ({ u: i.uid })),
      resolve: (st, p, d, t) => {
        const P = st.players[p], i = P.banish.findIndex(c => c.uid === (t && t.u));
        if (i < 0) { log(st, p, 'no tiene objetivo'); return; }
        const inst = P.banish.splice(i, 1)[0];
        inst.spent = false;
        P.hand.push(inst);
        log(st, p, `pesca a ${def(inst).name} del destierro: vuelve a su mano`);
      }
    },
    // Esferas del Dragón: un deseo a elegir
    esferas: {
      targets: (st, p) => {
        const P = st.players[p], out = [];
        P.grave.forEach(i => { const c = def(i); if (c.kind === 'monster' && c.level <= 7 && spot(P, c) >= 0) out.push({ wish: 'revive', u: i.uid }); });
        out.push({ wish: 'heal' });
        P.hand.forEach(i => { const c = def(i); if (c.kind === 'monster' && !c.sp && c.level <= 7 && spot(P, c) >= 0) out.push({ wish: 'summon', u: i.uid }); });
        return out;
      },
      resolve: (st, p, d, t) => {
        const P = st.players[p];
        if (t && t.wish === 'heal') { heal(st, p, 1500); log(st, p, 'pide el deseo de recuperar vida: +1500 PV'); return; }
        if (t && t.wish === 'revive') {
          const inst = P.grave.find(c => c.uid === t.u);
          if (!inst || def(inst).level > 7) { log(st, p, 'no tiene objetivo'); return; }
          log(st, p, 'pide el deseo de revivir a un personaje');
          if (reviveInst(st, p, inst) < 0) log(st, p, 'no hay espacio en el campo');
          return;
        }
        if (t && t.wish === 'summon') {
          const i = P.hand.findIndex(c => c.uid === t.u);
          if (i < 0 || def(P.hand[i]).level > 7 || spot(P, def(P.hand[i])) < 0) { log(st, p, 'no tiene objetivo'); return; }
          log(st, p, 'pide el deseo de invocar a un personaje');
          specialSummon(st, p, P.hand.splice(i, 1)[0], 'atk');
        }
      }
    },
    // Voto Vinculante: sacrifica estadísticas de un aliado por una estadística o habilidad de un enemigo (queda toda la invocación)
    voto: {
      targets: (st, p) => {
        const P = st.players[p], out = [];
        for (const z of rikaOwn(st, P)) {
          if (P.mz[z].wide) continue;
          for (const e of foeChars(st, p)) {
            const tm = st.players[e.vs].mz[e.z];
            if (tm.down || rikaUp(st, tm)) continue;
            out.push({ z, vs: e.vs, ez: e.z, mode: 1 }, { z, vs: e.vs, ez: e.z, mode: 2 });
            for (const ab of Array.from(new Set(rawAbil(tm)))) if (!abil(st, P.mz[z]).includes(ab)) out.push({ z, vs: e.vs, ez: e.z, mode: 3, ab });
          }
        }
        return out;
      },
      resolve: (st, p, d, t) => {
        const P = st.players[p], m = P.mz[t && t.z], E = st.players[t && t.vs], tm = E && E.mz[t.ez];
        if (!m || !tm || tm.down || !canTarget(st, p, t.vs, t.ez)) { log(st, p, 'no tiene objetivo'); return; }
        const aN = atkOf(st, P, t.z), dN = defOf(st, P, t.z), eA = atkOf(st, E, t.ez), eD = defOf(st, E, t.ez), nm = mdef(m).name;
        if (t.mode === 1) { addMod(st, m, 'voto', eA - aN, -dN, 0); log(st, p, `${nm} sacrifica su DEF y copia el ATK de ${mdef(tm).name}: ${eA} ATK / 0 DEF`); }
        else if (t.mode === 2) { addMod(st, m, 'voto', -aN, eD - dN, 0); log(st, p, `${nm} sacrifica su ATK y copia la DEF de ${mdef(tm).name}: 0 ATK / ${eD} DEF`); }
        else {
          if (!rawAbil(tm).includes(t.ab)) { log(st, p, 'no tiene objetivo'); return; }
          addMod(st, m, 'voto', -aN, -dN, 0);
          m.ext = (m.ext || []).concat([t.ab]); m.extFrom = Object.assign({}, m.extFrom); m.extFrom[t.ab] = mdef(tm).name;
          const ar = C().AB[t.ab];
          log(st, p, `${nm} sacrifica su ATK y DEF y copia ${ar ? ar[0] : t.ab} de ${mdef(tm).name}`);
        }
        if (multi(st)) st.log[st.log.length - 1].q = t.vs;
      }
    },
    // Pothala: fusiona a dos personajes tuyos durante 2 turnos completos
    pothala: {
      targets: (st, p) => {
        const P = st.players[p], zs = rikaOwn(st, P).filter(z => !P.mz[z].wide && !P.mz[z].fused), out = [];
        for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) out.push({ z: zs[i], z2: zs[j] });
        return out;
      },
      resolve: (st, p, d, t) => {
        const P = st.players[p], A = P.mz[t && t.z], B = P.mz[t && t.z2];
        if (!A || !B || A.down || B.down || A.fused || B.fused) { log(st, p, 'no tiene objetivo'); return; }
        const atk = atkOf(st, P, t.z) + atkOf(st, P, t.z2), df = defOf(st, P, t.z) + defOf(st, P, t.z2);
        A.fused = { zb: t.z2, t0: st.turn, b: B, atk, def: df, from: [atkOf(st, P, t.z), atkOf(st, P, t.z2), defOf(st, P, t.z), defOf(st, P, t.z2)] };
        const bo = B.owner != null ? B.owner : p;      // cada carta unida cuenta para su dueño (A puede estar corrompido)
        B.c.by = bo; for (const l of (B.link || [])) if (l.by == null) l.by = bo;
        A.link = (A.link || []).concat([B.c], B.link || []);
        P.mz[t.z2] = null; P.sealed = (P.sealed || []).concat([t.z2]);
        log(st, p, `${mdef(A).name} y ${mdef(B).name} se fusionan: ${atk} ATK / ${df} DEF durante 2 turnos`);
      }
    },
    // Gokumonkyo (continua) y Guerrero del Infinito (continua): se colocan en continueSpell
    gokumon: {
      targets: (st, p) => { const out = []; for (const e of foes(st, p)) for (const z of zonesWith(st.players[e].mz)) out.push(multi(st) ? { vs: e, z } : { z }); return out; },
      resolve: () => { /* se coloca en continueSpell */ }
    },
    guerrero: {
      targets: (st, p) => (st.players[p].lp >= 2000 ? [null] : []),
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
    entered(st, p, z);
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
    for (const e of foes(st, p)) for (const z of zonesWith(st.players[e][area])) {
      if (area === 'mz' ? (!canTarget(st, p, e, z) || rikaUp(st, st.players[e].mz[z]) || st.players[e].mz[z].gres) : st.players[e].st[z].prison) continue;      // Seis Ojos, Spider-Man y Gokumonkyo no se eligen
      out.push(multi(st) ? { vs: e, z } : { z });
    }
    return out;
  }
  function zonesWith(arr) { const r = []; arr.forEach((s, i) => { if (s) r.push(i); }); return r; }
  function zonesUp(P) { const r = []; P.mz.forEach((s, i) => { if (s && !s.down) r.push(i); }); return r; }
  function inviteCands(st, p, d) {
    const P = st.players[p];
    return P.deck.filter(i => { const c = def(i); return c.kind === 'monster' && !c.sp && c.level <= (d.max || 4) && spot(P, c) >= 0; });
  }
  function searchCands(st, p, d) {
    return monsterCands(st.players[p], c => (d.max == null || c.level <= d.max) && (d.min == null || c.level >= d.min));
  }
  /** Lista de objetivos posibles para activar esta magia ([] = no se puede; [null] = sin objetivo). */
  function spellTargets(st, p, card) {
    const d = def(card), fx = FX[d.fx];
    return fx ? fx.targets(st, p, d) : [];
  }

  // ---------------- reacciones: Shen, Total Counter de Meliodas ----------------
  /** Asiento del equipo de `victimP` que puede invocar a Shen desde la mano ahora mismo, o -1. */
  function shenOwner(st, victimP) {
    for (let i = 0; i < st.n; i++) {
      const q = (victimP + i) % st.n, Q = st.players[q];
      if (!Q.alive || st.team[q] !== st.team[victimP]) continue;
      const hi = handIdx(Q, 'c_shen');
      if (hi >= 0 && spot(Q, def(Q.hand[hi])) >= 0) return q;
    }
    return -1;
  }
  /** Protección del Ojo del Crepúsculo: Shen entra de la mano, cancela el efecto y protege al aliado (el jugador lo decide antes).
   *  Devuelve true si interceptó (el efecto queda cancelado); false si no pudo invocarse. */
  function shenAuto(st, pd) {
    const v = pd.victim, V = st.players[v.p].mz[v.z];
    if (!V || V.shen || !st.players[pd.player].alive) return false;
    const vn = mdef(V).name;
    const src = pd.ch ? `la magia ${def(pd.ch.inst).name}` : `el ataque de ${(() => { const am = st.players[pd.a.p].mz[pd.a.z]; return am ? mdef(am).name : 'un enemigo'; })()}`;
    if (summonFromHand(st, pd.player, 'c_shen', 'Protección del Ojo del Crepúsculo: invoca especialmente a') < 0) return false;
    V.shen = { sh: SHEN_SH };
    log(st, pd.player, `Protección del Ojo del Crepúsculo — Shen intercepta ${src}: ${vn} iba a morir y queda protegido con un escudo de ${SHEN_SH}`);
    st.log[st.log.length - 1].int = 1;
    if (pd.ch) st.players[pd.ch.p].grave.push(pd.ch.inst);
    return true;
  }
  /** Saca una carta de la mano al campo (invocación especial que no gasta la normal ni abre ventana). */
  function summonFromHand(st, q, id, why) {
    const Q = st.players[q], hi = handIdx(Q, id);
    if (hi < 0) return -1;
    const d = def(Q.hand[hi]), z = spot(Q, d);
    if (z < 0) return -1;
    const inst = Q.hand.splice(hi, 1)[0];
    inst.spent = false;
    Q.mz[z] = mkSlot(st, inst, { pos: 'atk', wide: !!d.wide });
    log(st, q, `${why || 'invoca especialmente a'} ${d.name}`);
    entered(st, q, z);
    return z;
  }
  const HOSTILE = { destroyOne: 1, destroyST: 1, burn: 1 };
  const HOSTILE_SKIP = {};
  /** Magias que eligen a un personaje ENEMIGO aunque el objetivo no diga de quién (en 1 contra 1 va sin `vs`). */
  const FOE_TGT = Object.assign({ deathnote: 1, mafuba: 1 }, HOSTILE);
  /** Trampas que se pueden devolver con Total Counter / interceptar con Rika. */
  const HOSTILE_TRAP = { destroyAttacker: 1, destroySummoned: 1, mirror: 1, infarto: 1 };
  /** Habilidades hostiles que Total Counter puede devolver. */
  const REFL_POW = ['canon', 'desmantelar', 'telar', 'rojo', 'azul', 'avpred', 'genki', 'supernova'];      // Púrpura NO se puede devolver (27-10-2026)
  /** Habilidad (id) que corresponde a cada poder, para que Yuta pueda aprenderlas. */
  const PW_AB = { canon: 'canon', absorb: 'absorb', furia: 'furia', bigbang: 'bigbang', relicario: 'relicario', desmantelar: 'desmantelar', agujero: 'agujero', bigbang1: 'bigbang1', cuerno: 'cuerno', maquina: 'dexter', brillo: 'brillo', dtrig: 'cazador', dios: 'dios', avada: 'avada', chidori: 'chidori', canal: 'canal', supernova: 'canal', conc: 'zenitsu2', conc2: 'gyomei2', marca: 'gyomei3', desp: 'patriarca', kaioken: 'kaioken', teach: 'maestro', dominio: 'jogodom', llama: 'llama', telar: 'telar', corromper: 'corrupt' };
  const POWER_IDS = Array.from(new Set(Object.values(PW_AB)));
  /** Total Counter: un Meliodas boca arriba de un rival del que actúa (y, si se indica, del equipo de la víctima) que aún no lo usó este turno: { q, z } o null. */
  function meliFor(st, byP, victimP) {
    for (const q of foes(st, byP)) {
      if (victimP != null && st.team[q] !== st.team[victimP]) continue;
      const z = st.players[q].mz.findIndex(m => m && !m.down && has(st, m, 'counter') && uOf(m).cT !== st.turn);
      if (z >= 0) return { q, z };
    }
    return null;
  }
  const meliUse = (st, q, z) => { const m = st.players[q].mz[z]; if (m) uOf(m).cT = st.turn; };
  /** Rika Orimoto de un Yuta del equipo de la víctima que aún puede interceptar: { q, z } o null. */
  function rikaGuard(st, victimP) {
    for (let i = 0; i < st.n; i++) {
      const q = (victimP + i) % st.n, Q = st.players[q];
      if (!Q.alive || st.team[q] !== st.team[victimP]) continue;
      for (let z = 0; z < ZONES; z++) {
        const m = Q.mz[z];
        if (!m || m.down || !has(st, m, 'rikaint')) continue;
        const u = uOf(m), g = gx(Q, z);
        if ((u.rk || 0) >= 2 * g || (u.rkT === st.turn && (u.rkTn || 0) >= g)) continue;
        return { q, z };
      }
    }
    return null;
  }
  /** Rika intercepta: gasta un uso y deja constancia (turno, aliado protegido y efecto). */
  function rikaSpend(st, q, z, ally, fx) {
    const m = st.players[q].mz[z], u = uOf(m);
    u.rk = (u.rk || 0) + 1; u.rkTn = u.rkT === st.turn ? (u.rkTn || 0) + 1 : 1; u.rkT = st.turn;
    u.rkLast = { t: st.turn, ally, fx };
    log(st, q, `Rika Orimoto intercepta ${fx} y protege a ${ally} (${Math.max(0, 2 * gx(st.players[q], z) - u.rk)}/${2 * gx(st.players[q], z)} usos)`);
    st.log[st.log.length - 1].int = 1;
  }
  /** ¿Alguien puede intervenir antes de que esta magia se resuelva? Devuelve el pending a abrir. */
  function spellGuard(st, ch) {
    const d = def(ch.inst), t = ch.target, done = ch.done || [];
    if ((d.fx === 'destroyOne' || d.fx === 'deathnote') && t && !done.includes('uidef')) {      // Goku Ultra Instinto: Defensa instintiva
      const vp = foeOf(st, ch.p, t), vm = st.players[vp].mz[t.z];
      const g = vm && st.team[vp] !== st.team[ch.p] ? uiGuard(st, vp) : null;
      if (g) return { k: 'ability', ab: 'uidef', kind: 'spell', player: g.q, zy: g.z, stage: 'ask', ch, victim: { p: vp, z: t.z }, nm: mdef(vm).name };
    }
    if (!HOSTILE[d.fx]) return null;
    if (d.fx === 'destroyOne' && t && !done.includes('shen')) {
      const vp = foeOf(st, ch.p, t), vm = st.players[vp].mz[t.z];
      const q = vm ? shenOwner(st, vp) : -1;
      if (q >= 0 && st.team[vp] !== st.team[ch.p]) {
        const pd = { k: 'ability', ab: 'shen', player: q, stage: 'ask', ch, victim: { p: vp, z: t.z }, nm: mdef(vm).name };
        return pd;
      }
    }
    if (!done.includes('meli')) {
      const mm = meliFor(st, ch.p, null);
      if (mm) return { k: 'ability', ab: 'meliodas', kind: 'spell', player: mm.q, mz: mm.z, stage: 'ask', ch, nm: d.name };
    }
    if (d.fx === 'destroyOne' && t && !done.includes('rika')) {
      const vp = foeOf(st, ch.p, t), vm = st.players[vp].mz[t.z];
      const r = vm && st.team[vp] !== st.team[ch.p] && !has(st, vm, 'rikaprot') ? rikaGuard(st, vp) : null;
      if (r) return { k: 'ability', ab: 'rika', kind: 'spell', player: r.q, zy: r.z, stage: 'ask', ch, victim: { p: vp, z: t.z }, nm: mdef(vm).name };
    }
    return null;
  }
  /** Total Counter: el efecto de la magia enemiga se devuelve contra su dueño; quien lo devuelve elige el objetivo. */
  function reflectSpell(st, q, ch, vs, z) {
    const d = def(ch.inst), C = st.players[ch.p];
    C.grave.push(ch.inst);
    if (d.fx === 'destroyOne') {
      const m = st.players[vs].mz[z];
      log(st, q, `Total Counter: ${d.name} se devuelve${m ? ' y destruye a ' + mdef(m).name : ''}`);
      if (multi(st)) st.log[st.log.length - 1].q = vs;
      if (m) destroyMonster(st, vs, z, { src: 'spell', bp: q });
      lose(st, ch.p, d.self, true);
    } else if (d.fx === 'destroyST') {
      log(st, q, `Total Counter: ${d.name} se devuelve y destruye una carta de magia/trampa de su dueño`);
      if (multi(st)) st.log[st.log.length - 1].q = vs;
      removeST(st, vs, z);
    } else if (d.fx === 'burn') {
      log(st, q, `Total Counter: ${d.name} se devuelve (${d.n} de daño directo)`);
      if (multi(st)) st.log[st.log.length - 1].q = ch.p;
      lose(st, ch.p, d.n);
    }
  }
  /** Personajes (o cartas de magia/trampa) del equipo de `user` que quien devuelve el poder puede elegir como objetivo. */
  function powerReflectCands(st, q, user, a) {
    const out = [];
    for (let i = 0; i < st.n; i++) {
      if (!st.players[i].alive || st.team[i] !== st.team[user]) continue;
      const P = st.players[i];
      if (a.pw === 'desmantelar' || a.pw === 'avpred') { for (const z of zonesWith(P.st)) if (!P.st[z].prison) out.push({ vs: i, z }); continue; }
      for (const z of zonesWith(P.mz)) {
        const tm = P.mz[z];
        if (!canTarget(st, q, i, z, a.pw === 'purpura' ? { ignoreSix: true } : undefined)) continue;      // la Púrpura sí alcanza a quien tiene los Seis Ojos
        if (a.pw === 'telar' && (tm.down || !rawAbil(tm).includes(a.ab) || (tm.sealed || []).some(x => x.ab === a.ab))) continue;
        out.push(a.pw === 'purpura' ? { vs: i, z, area: 'mz' } : { vs: i, z });
      }
    }
    return out;
  }
  /** La habilidad hostil se devuelve: el mismo efecto cae sobre el equipo de quien la usó (y gasta su uso). */
  function powerReflect(st, q, user, a, tgt) {
    const U = st.players[user], m = U.mz[a.zone];
    if (!m) return;
    const nm = mdef(m).name, u = uOf(m);
    blockPw(st, user, a);
    log(st, q, `Total Counter: la habilidad de ${nm} se devuelve contra su dueño`);
    if (multi(st)) st.log[st.log.length - 1].q = user;
    if (a.pw === 'azul') {
      u.azul = true;
      log(st, user, 'Azul se vuelve contra su dueño: sus magias y trampas son destruidas');
      for (let i = 0; i < st.n; i++) if (st.team[i] === st.team[user]) for (const z of zonesWith(st.players[i].st)) if (!st.players[i].st[z].prison) removeST(st, i, z);
    } else if (a.pw === 'supernova') {
      u.canal = null; m.canal = null;
      log(st, user, 'La Supernova se vuelve contra su dueño: destruye a sus personajes de hasta 7★ y todas sus magias y trampas');
      for (let i = 0; i < st.n; i++) if (st.team[i] === st.team[user]) {
        for (let tz = 0; tz < ZONES; tz++) { const tm = st.players[i].mz[tz]; if (tm && lvl(tm) <= 7) destroyMonster(st, i, tz, { src: 'power', by: { p: user, uid: m.c.uid }, bp: q }); }
        for (let sz = 0; sz < ZONES; sz++) removeST(st, i, sz);
      }
    } else if (a.pw === 'genki') {
      markOnce(u, 'gen');
      log(st, user, `${nm} es alcanzado por su propia Genkidama`);
      genkidama(st, user, m, { src: 'power', by: { p: user, uid: m.c.uid }, bp: user }, [user].concat(allyTeam(st, user)));
    } else doPower(st, user, Object.assign({}, a, { target: tgt }));
  }
  const allyTeam = (st, p) => { const r = []; for (let i = 0; i < st.n; i++) if (i !== p && st.players[i].alive && st.team[i] === st.team[p]) r.push(i); return r; };
  /** ¿Total Counter o Rika pueden intervenir en este poder? Devuelve el pending a abrir (o null). */
  function powerGuard(st, p, a, done) {
    done = done || [];
    const U = st.players[p], m = U.mz[a.zone];
    if (!m) return null;
    if (REFL_POW.includes(a.pw) && !done.includes('meli')) {
      const victims = a.target ? [a.target.vs] : foes(st, p);
      for (const v of victims) {
        if (st.team[v] === st.team[p]) continue;
        const mm = meliFor(st, p, v);
        if (mm) return { k: 'ability', ab: 'meliodas', kind: 'power', player: mm.q, mz: mm.z, stage: 'ask', pp: p, pa: a, nm: mdef(m).name };
      }
    }
    if ((a.pw === 'canon' || a.pw === 'tm') && a.target && !done.includes('rika')) {
      const v = a.target.vs, vm = st.players[v].mz[a.target.z];
      const r = vm && st.team[v] !== st.team[p] ? rikaGuard(st, v) : null;
      if (r) return { k: 'ability', ab: 'rika', kind: 'power', player: r.q, zy: r.z, stage: 'ask', pp: p, pa: a, victim: { p: v, z: a.target.z }, nm: mdef(vm).name };
    }
    return null;
  }
  /** Ejecuta un poder pasando por Total Counter y Rika. */
  /** Esencia de las Sombras (2026-11-12): marca VISUAL de lo que Sung Jin-Woo trae al campo (tono azul oscuro). No cambia ninguna estadística ni regla
   *  (a diferencia de `bySung`/`shadow`). Vive en la casilla: si el personaje sale y vuelve por otro medio, no la lleva. Los que ya tienen ilustración
   *  propia de soldado (`imgSung`: Igris, Beru) no se tiñen. Toda habilidad de Sung que traiga un personaje debe llamar a esta función. */
  function shadeEssence(m) { if (m && !mdef(m).imgSung) m.shade = true; }
  /** Titán Colosal entra por Armin: destruye a todos los demás personajes del campo de 10★ o menos. No se puede cancelar. */
  function colosalBlast(st, p, cz) {
    const C0 = st.players[p].mz[cz];
    if (!C0) return;
    log(st, p, 'Titán Colosal: ¡explosión de transformación! Destruye a todos los personajes de 10★ o menos');
    for (let q = 0; q < st.n; q++) for (let tz = 0; tz < ZONES; tz++) {
      const tm = st.players[q].mz[tz];
      if (!tm || tm === C0 || lvl(tm) > 10) continue;
      destroyMonster(st, q, tz, { src: 'effect', bp: p });
    }
  }
  function runPower(st, p, a, done) {
    done = done || [];
    if (st.players[p].mz[a.zone]) {
      if (!a.xd && nextWindow(st, 'power', { k: 'power', by: p, pa: a }, foes(st, p))) return;      // X puede cancelar la habilidad
      if (!a.gd && powerReality(st, p, a)) return;                                                   // Gema de la Realidad
    }
    const t6 = a.target, um6 = st.players[p].mz[a.zone];
    if (um6 && !done.includes('shika')) {                                               // Shikamaru: Estratega brillante
      for (const q of foes(st, p)) {
        const sz = st.players[q].mz.findIndex(x => x && !x.down && has(st, x, 'shikaestr') && !blocked(x, 'ab') && uOf(x).seT !== st.turn);
        if (sz >= 0) { st.pending = { k: 'ability', ab: 'shikaestr', kind: 'power', player: q, zy: sz, stage: 'ask', pp: p, pa: a, done, nm: mdef(um6).name }; return; }
      }
    }
    if (um6 && t6 && t6.vs != null && t6.z != null && t6.area !== 'st' && st.team[t6.vs] !== st.team[p]) {
      if (!done.includes('anti')) { const am = antiFor(st, p, { p: t6.vs, z: t6.z }, false); if (am) { st.pending = { k: 'ability', ab: 'antimag', kind: 'power', player: am.q, zy: am.z, stz: am.stz, stage: 'ask', pp: p, pa: a, done, nm: PWL[a.pw] || a.pw }; return; } }
      if (!done.includes('shr')) { const o = shadowOpts(st, t6.vs, t6.z, p); if (o.length) { st.pending = { k: 'ability', ab: 'shadowred', kind: 'power', player: t6.vs, stage: 'ask', pp: p, pa: a, done, opts: o, nm: PWL[a.pw] || a.pw }; return; } }
      if (st.players[t6.vs].mz[t6.z] && tobiEvade(st, t6.vs, t6.z)) { blockPw(st, p, a); return; }      // Tobi: Kamui
    }
    const gd = powerGuard(st, p, a, done);
    if (gd) { st.pending = gd; return; }
    if (a.target && a.target.vs != null && a.target.z != null && st.team[a.target.vs] !== st.team[p] && !['desmantelar', 'agujero', 'avpred'].includes(a.pw) && a.target.area !== 'st' && sharinganEvade(st, a.target.vs, a.target.z, a.pw)) { blockPw(st, p, a); return; }      // Sasuke Chico y Megumi (Conejos)
    const m = st.players[p].mz[a.zone], nmU = m ? mdef(m).name : '', yutaU = isYuta(m);
    doPower(st, p, a);
    if (m && m.sdomOn === st.turn && !m.sdomUsed && !/^sala/.test(a.pw)) {      // Dominio de combate: una habilidad adicional este turno (se renueva el «una vez por turno»)
      m.sdomUsed = true;
      const u2 = uOf(m); for (const k of Object.keys(u2)) if (/T$/.test(k) && u2[k] === st.turn) delete u2[k];
      log(st, p, `${nmU}: Dominio de combate permite una habilidad adicional`);
    }
    const idn = PW_AB[a.pw];
    if (idn && !yutaU && !(a.pw === 'corromper' && a.ring)) {      // Copia de Técnicas: cualquier Yuta en el campo puede aprenderla
      for (let q = 0; q < st.n; q++) {
        if (!st.players[q].alive) continue;
        for (const y of st.players[q].mz) if (isYuta(y) && has(st, y, 'copia')) st.trig.push({ k: 'yutalearn', p: q, uid: y.c.uid, id: idn, from: nmU });
      }
    }
  }
  /** Tras elegir una trampa: Total Counter y Rika pueden intervenir antes de que haga efecto. */
  /** Near, Estrategia de N: ¿puede Near (de un rival de resp) actuar sobre la trampa s que resp acaba de activar? */
  function nearFor(st, resp, s) {
    if (!s || !s.inv) return null;
    for (let q = 0; q < st.n; q++) {
      if (!st.players[q].alive || st.team[q] === st.team[resp]) continue;
      for (let z = 0; z < ZONES; z++) {
        const m = st.players[q].mz[z];
        if (m && !m.down && m.c.uid === s.inv.by && has(st, m, 'nearn') && !blocked(m, 'ab') && uOf(m).nsT !== st.turn) return { q, z };
      }
    }
    return null;
  }
  /** Objetivos alternativos de una trampa con elección (Manipulación). */
  function trapAlts(st, resp, d, pd) {
    const os = d.fx === 'realidad' ? realityOpts(st, resp, pd.trigger, pd.cont) : d.fx === 'fullcounter' ? fcOpts(st, resp, pd.trigger, pd.cont) : d.fx === 'kyoka' ? kyokaOpts(st, resp, pd.cont) : [];
    const cur = pd.opt;
    return os.filter(o => o && o.vs != null && !(cur && cur.vs === o.vs && cur.z === o.z)).map(o => ({ vs: o.vs, z: o.z }));
  }
  function trapResolve(st, resp, d, pd, done, invTeam) {
    const vict = (d.fx === 'destroyAttacker' || d.fx === 'mirror') && st.atk ? st.atk.p : ((d.fx === 'destroySummoned' || d.fx === 'infarto') && st.summon ? st.summon.p : null);
    if (!done.includes('gema')) {                        // Gema de la Realidad: invierte la destrucción o la reducción de estadísticas
      if (DEST_TRAP[d.fx] && vict != null && st.team[vict] !== st.team[resp]) {
        const vz = d.fx === 'destroyAttacker' ? st.atk.z : st.summon.z, vm = st.players[vict].mz[vz];
        if (vm && realityWindow(st, 'destroy', resp, vict, { k: 'gtrap', tp: resp, tid: d.id, rp: pd, done, vic: { p: vict, z: vz } }, `${d.name} va a destruir a ${mdef(vm).name}`)) return;
      }
      if (d.fx === 'ola') for (const e of foes(st, resp)) {
        if (zonesWith(st.players[e].mz).length && realityWindow(st, 'reduce', resp, e, { k: 'gtrap', tp: resp, tid: d.id, rp: pd, done }, 'Ola de Fuego: −500 ATK y −500 DEF a tus personajes')) return;
      }
    }
    if (vict != null && st.team[vict] !== st.team[resp]) {
      if (HOSTILE_TRAP[d.fx] && !done.includes('meli')) {
        const mm = meliFor(st, resp, vict);
        if (mm) { st.pending = { k: 'ability', ab: 'meliodas', kind: 'trap', player: mm.q, mz: mm.z, stage: 'ask', tp: resp, tid: d.id, rp: pd, done, nm: d.name }; return; }
      }
      if ((d.fx === 'destroyAttacker' || d.fx === 'destroySummoned' || d.fx === 'infarto') && !done.includes('rika')) {
        const vz = d.fx === 'destroyAttacker' ? st.atk.z : st.summon.z, vm = st.players[vict].mz[vz];
        const r = vm && !has(st, vm, 'rikaprot') ? rikaGuard(st, vict) : null;        // la propia Rika ya es inmune a las trampas
        if (r) { st.pending = { k: 'ability', ab: 'rika', kind: 'trap', player: r.q, zy: r.z, stage: 'ask', tp: resp, tid: d.id, rp: pd, done, victim: { p: vict, z: vz }, nm: mdef(vm).name }; return; }
      }
      if ((d.fx === 'destroyAttacker' || d.fx === 'destroySummoned' || d.fx === 'infarto') && !done.includes('uidef')) {      // Goku Ultra Instinto: Defensa instintiva
        const vz = d.fx === 'destroyAttacker' ? st.atk.z : st.summon.z, vm = st.players[vict].mz[vz];
        const g = vm ? uiGuard(st, vict) : null;
        if (g) { st.pending = { k: 'ability', ab: 'uidef', kind: 'trap', player: g.q, zy: g.z, stage: 'ask', tp: resp, tid: d.id, rp: pd, done, victim: { p: vict, z: vz }, nm: mdef(vm).name }; return; }
      }
    }
    if (vict != null && st.team[vict] !== st.team[resp] && HOSTILE_TRAP[d.fx]) {      // Sasuke Chico (Sharingan)
      const vz = (d.fx === 'destroyAttacker' || d.fx === 'mirror') ? (st.atk && st.atk.z) : (st.summon && st.summon.z);
      if (vz != null && sharinganEvade(st, vict, vz)) { respondRest(st, pd); return; }
    }
    applyTrap(st, resp, d, pd, invTeam);
    respondRest(st, pd);
  }
  function respondRest(st, pd) {
    if (st.winner !== null) return;
    const more = !(pd.trigger === 'spell' && st.chain && st.chain.negated) && !(pd.cont && (pd.cont.cancel || pd.cont.invert)) && pd.rest && pd.rest.length && nextWindow(st, pd.trigger, pd.cont, pd.rest);
    if (!more) afterRespond(st, pd.cont);
  }
  /** Candidatos del Total Counter (null = se devuelve sin elegir objetivo). */
  function meliCands(st, q, pd) {
    const k = pd.kind || 'spell';
    if (k === 'spell') {
      const d = def(pd.ch.inst);
      if (d.fx === 'burn') return null;
      const cands = [];
      if (d.fx === 'destroyOne') { const Cp = st.players[pd.ch.p]; zonesWith(Cp.mz).forEach(z => { if (canTarget(st, q, pd.ch.p, z)) cands.push({ vs: pd.ch.p, z }); }); }
      else for (const z of zonesWith(st.players[pd.ch.p].st)) if (!st.players[pd.ch.p].st[z].prison) cands.push({ vs: pd.ch.p, z });
      return cands;
    }
    if (k === 'trap') {
      if (pd.tid && C().get(pd.tid).fx === 'mirror') return null;
      const cands = [];
      for (const z of zonesWith(st.players[pd.tp].mz)) if (canTarget(st, q, pd.tp, z)) cands.push({ vs: pd.tp, z });
      return cands;
    }
    if (k === 'power') {
      if (pd.pa.pw === 'azul' || pd.pa.pw === 'genki' || pd.pa.pw === 'supernova') return null;
      return powerReflectCands(st, q, pd.pp, pd.pa);
    }
    if (k === 'attack') {
      const a = pd.a, cands = [];
      for (let i = 0; i < st.n; i++) {
        if (!st.players[i].alive || st.team[i] !== st.team[a.p]) continue;
        for (const z of zonesWith(st.players[i].mz)) if (!(i === a.p && z === a.z) && !st.players[i].mz[z].six && canTarget(st, q, i, z)) cands.push({ vs: i, z });
      }
      return cands.length ? cands : null;
    }
    return [];
  }
  function meliDecline(st, pd) {
    const k = pd.kind || 'spell';
    if (k === 'spell') { pd.ch.done = (pd.ch.done || []).concat('meli'); st.chain = pd.ch; continueSpell(st); }
    else if (k === 'trap') trapResolve(st, pd.tp, C().get(pd.tid), pd.rp, (pd.done || []).concat('meli'));
    else if (k === 'power') runPower(st, pd.pp, pd.pa, ['meli']);
    else if (k === 'attack') { st.atk = Object.assign({}, pd.a, { meli: true }); continueAttack(st); }
  }
  function meliApply(st, q, pd, tgt) {
    const k = pd.kind || 'spell';
    meliUse(st, q, pd.mz);
    if (k === 'spell') { reflectSpell(st, q, pd.ch, tgt ? tgt.vs : pd.ch.p, tgt ? tgt.z : 0); return; }
    if (k === 'trap') {
      const d = C().get(pd.tid);
      if (d.fx === 'mirror') { log(st, q, `Total Counter: ${d.name} se devuelve (800 de daño directo)`); lose(st, pd.tp, 800); }
      else {
        const m = st.players[tgt.vs].mz[tgt.z];
        log(st, q, `Total Counter: ${d.name} se devuelve${m ? ' y destruye a ' + mdef(m).name : ''}`);
        if (multi(st)) st.log[st.log.length - 1].q = tgt.vs;
        if (m) destroyMonster(st, tgt.vs, tgt.z, { src: 'trap', bp: q });
      }
      respondRest(st, pd.rp);
      return;
    }
    if (k === 'power') { powerReflect(st, q, pd.pp, pd.pa, tgt); return; }
    if (k === 'attack') {
      const a = pd.a, at = st.players[a.p].mz[a.z];
      if (!at) return;
      galandHit(st, a, q, pd.mz);
      const nm = mdef(at).name;
      if (!tgt) {
        const dmg = atkOf(st, st.players[a.p], a.z);
        log(st, q, `Total Counter: el ataque de ${nm} se devuelve (${dmg} de daño directo a su dueño)`);
        if (multi(st)) st.log[st.log.length - 1].q = a.p;
        lose(st, a.p, dmg);
        atkDone(st, a);
        return;
      }
      const tm = st.players[tgt.vs].mz[tgt.z];
      log(st, q, `Total Counter: el ataque de ${nm} se devuelve contra ${tm.down ? 'un personaje boca abajo' : mdef(tm).name}`);
      if (multi(st)) st.log[st.log.length - 1].q = tgt.vs;
      st.atk = { p: a.p, z: a.z, target: tgt.z, vs: tgt.vs, negated: false, meli: true };
      continueAttack(st);
    }
  }
  /** Cálculo previo del combate: quién va a morir (sin espadas, escudos ni regeneraciones). */
  function combatDeaths(st, a) {
    if (a.target === 'direct') return [];
    const me = st.players[a.p], op = st.players[a.vs], at = me.mz[a.z], dm = op.mz[a.target];
    if (!at || !dm || shieldInfo(st, op, a.target) || boomReady(st, at) || boomReady(st, dm)) return [];
    const A = atkOf(st, me, a.z), out = [];
    if (dm.pos === 'atk') {
      const B = atkOf(st, op, a.target);
      if (A >= B) out.push({ p: a.vs, z: a.target });
      if (A <= B) out.push({ p: a.p, z: a.z });
    } else if (A > defOf(st, op, a.target)) out.push({ p: a.vs, z: a.target });
    return out;
  }

  function startSpell(st, p, from, idx, target) {
    const P = st.players[p];
    let inst;
    if (from === 'hand') inst = P.hand.splice(idx, 1)[0];
    else { inst = P.st[idx].c; P.st[idx] = null; }
    st.chain = { p, inst, target, negated: false, unstop: !!def(inst).unstop };
    log(st, p, `activa ${def(inst).name}`);
    if (def(inst).cost) { lose(st, p, def(inst).cost, true); if (st.winner !== null) return; }      // Guerrero del Infinito: los PV no se recuperan aunque la anulen
    if (gloveOffer(st, p)) return;
    if (openWindow(st, 'spell', { k: 'spell', by: p })) return;
    continueSpell(st);
  }
  // ---------------- Guantelete del Infinito ----------------
  const isGem = d => /^Gema/.test(d.name) && ((d.kind === 'spell' && (d.fx === 'equip' || d.fx === 'gem' || d.fx === 'tiempo' || d.fx === 'alma')) || (d.kind === 'trap' && d.fx === 'realidad'));      // la Gema de la Realidad es trampa: se roba al activarla
  /** Un portador del Guantelete (de un rival de p) que puede robar la gema que p acaba de activar, o null. */
  function gloveFor(st, p, d) {
    if (!isGem(d) || stOff(st) || st.domain) return null;
    for (const q of foes(st, p)) {
      const Q = st.players[q], free = firstFree(Q.st) >= 0;
      const okGlove = d.fx === 'tiempo' ? !!(Q.snaps && Q.snaps.length >= 2) : free;      // la Gema del Tiempo robada con el Guantelete retrocede el campo del ladrón: necesita su instantánea
      if (okGlove) for (let i = 0; i < ZONES; i++) {
        const s = Q.st[i];
        if (!s || s.down || !s.glove || s.equipTo == null) continue;
        const bm = Q.mz[s.equipTo];
        if (!bm || bm.down || lvl(bm) < 4 || has(st, bm, 'rikaprot')) continue;
        if (d.fx === 'gem' && !zoneTargetsUp(st, q).length) continue;
        return { q, bz: s.equipTo, stz: i };
      }
      if (free || d.fx === 'gem' || d.fx === 'tiempo') for (let z = 0; z < ZONES; z++) {            // Thanos lleva el Guantelete incorporado: la gema queda en él (sin ocupar zona) y la usa como habilidad cuando quiera
        const bm = Q.mz[z];
        if (!bm || bm.down || !has(st, bm, 'thanosg') || has(st, bm, 'rikaprot')) continue;
        return { q, bz: z, stz: -1, thanos: true };
      }
    }
    return null;
  }
  /** Gema de la Realidad (trampa) recién activada: el portador rival puede robarla en vez de dejar que haga efecto. */
  function gloveTrapOffer(st, p, d, s, pd) {
    const g = gloveFor(st, p, d);
    if (!g) return false;
    const bm = st.players[g.q].mz[g.bz], stars = lvl(bm);
    st.pending = { k: 'ability', ab: 'glove', player: g.q, stage: 'ask', ch: null, trap: { c: s.c, rp: pd, d, by: p }, by: p, bz: g.bz, uid: s.c.uid, nm: d.name,
      info: { bearer: mdef(bm).name, stars, trap: true, pen: stars <= 5 ? 'Al usarla, ' + mdef(bm).name + ' pierde la mitad de su ATK y DEF base y sus habilidades.' : 'Sin penalización: ' + mdef(bm).name + ' es de 6★ o más.' } };
    return true;
  }
  /** Ofrece el robo antes de que la gema se resuelva. true = hay que esperar la respuesta. */
  function gloveOffer(st, p) {
    const ch = st.chain;
    if (!ch || ch.glove) return false;
    const d = def(ch.inst), g = gloveFor(st, p, d);
    if (!g) return false;
    ch.glove = true;                                      // una gema sólo activa el robo una vez
    const bm = st.players[g.q].mz[g.bz], stars = lvl(bm);
    st.chain = null;
    st.pending = { k: 'ability', ab: 'glove', player: g.q, stage: 'ask', ch, by: p, bz: g.bz, uid: ch.inst.uid, nm: d.name,
      info: { bearer: mdef(bm).name, stars, thanos: !!g.thanos, idle: !!g.thanos, pen: stars <= 5 ? 'Al usarla, ' + mdef(bm).name + ' pierde la mitad de su ATK y DEF base y sus habilidades.' : 'Sin penalización: ' + mdef(bm).name + ' es de 6★ o más.' } };
    return true;
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
      if (d.fx === 'equip' || d.fx === 'karma') okp = okp && !!P.mz[tz] && !has(st, P.mz[tz], 'rikaprot') && lvl(P.mz[tz]) >= (d.minStars || 0);
      if (d.fx === 'equip' && okp && d.glove) slot.glove = {};
      if (d.fx === 'equip' && okp && d.minions) slot.min = { n: 0 };
      if (ch.stolen) { slot.stolen = true; if (tz == null) slot.equipTo = ch.stolen.bz; }
      if (d.fx === 'karma' && okp) slot.karma = { phase: 'ally', owner: ch.p, allyUid: P.mz[tz].c.uid };
      if (d.fx === 'equip' && okp) {
        const bm = P.mz[tz];
        if (d.promise) { slot.promise = true; slot.bearer = bm.c.uid; }
        if (d.ring1) slot.ring = ringFor(st, bm);
        if (d.susano) slot.susano = { awake: false, sh: 0 };
        if (d.beast) slot.beast = { done: false };
      }
      if (d.fx === 'gem') {
        const tv = foeOf(st, ch.p, t), tm = st.players[tv].mz[t && t.z];
        okp = okp && !!tm && !tm.down && !has(st, tm, 'rikaprot');
        if (okp) slot.gem = { vs: tv, uid: tm.c.uid, uses: 0, usedTurn: -1 };
      }
      if (d.fx === 'storm') slot.storm = { usedTurn: -1 };
      if (d.fx === 'alma') slot.alma = { t0: st.turn, eff: [], usedTurn: -1 };
      if (d.fx === 'guerrero') slot.guerrero = { waiting: true };
      let prisoner = null, pe = null;
      if (d.fx === 'gokumon') {
        pe = foeOf(st, ch.p, t);
        prisoner = st.players[pe].mz[t && t.z];
        // se vuelve a comprobar quién controla al objetivo: el que tiene en su campo manda; debe ser de un rival vivo, nunca un aliado
        okp = okp && !!prisoner && foes(st, ch.p).includes(pe);
      }
      if (!okp) { P.grave.push(ch.inst); log(st, ch.p, `${d.name} no tiene objetivo`); return; }
      if (d.fx === 'gokumon') {                          // Prisión Absoluta: nada impide el sellado
        if (prisoner.fused) unfuse(st, pe, t.z);
        const nmP = mdef(prisoner).name, zz = t.z, E = st.players[pe];
        const m = takeOff(st, pe, zz, 'seal');
        slot.prison = { owner: m.owner != null ? m.owner : pe, m, t0: st.turn };
        P.st[z] = slot;
        log(st, ch.p, `Gokumonkyo sella a ${nmP} durante 5 turnos`);
        if (multi(st)) st.log[st.log.length - 1].q = pe;
        return;
      }
      P.st[z] = slot;
      if (ch.stolen) {                                   // Precio del poder: 4-5★ pierden la mitad de su ATK/DEF base y sus habilidades
        const bm = P.mz[ch.stolen.bz];
        if (bm && lvl(bm) <= 5 && !bm.price) { bm.price = true; log(st, ch.p, `Precio del poder: ${mdef(bm).name} pierde la mitad de su ATK y DEF base y sus habilidades`); }
      }
      if (d.fx === 'equip') log(st, ch.p, `equipa ${mdef(P.mz[tz]).name}`);
      else if (d.fx === 'karma') log(st, ch.p, `equipa Karma a ${mdef(P.mz[tz]).name}`);
      else if (d.fx === 'gem') log(st, ch.p, `controla la mente de ${mdef(st.players[slot.gem.vs].mz[t.z]).name}`);
      else if (d.fx === 'guerrero') log(st, ch.p, 'espera al próximo personaje que entre en su campo');
      if (d.sub === 'equip') sauronReturn(st);          // El Regreso del Señor Oscuro
      return;
    }
    if (d.fx === 'destroyOne' && ch.target && !(ch.done || []).includes('gema')) {      // Gema de la Realidad: invierte la destrucción
      const vp = foeOf(st, ch.p, ch.target), vm = st.players[vp].mz[ch.target.z];
      if (vm && st.team[vp] !== st.team[ch.p] && realityWindow(st, 'destroy', ch.p, vp, { k: 'gspell', ch, vic: { p: vp, z: ch.target.z } }, `${d.name} va a destruir a ${mdef(vm).name}`)) return;
    }
    {   // Goku Dios Super Saiyajin (Repulsión divina): destruye la magia rival que lo elija a él o a un aliado como objetivo
      const t = ch.target;
      if (t && t.z != null && d.fx !== 'destroyST' && !HOSTILE_SKIP[d.fx]) {
        const tp = t.vs != null ? t.vs : (FOE_TGT[d.fx] ? foeOf(st, ch.p, t) : ch.p);
        if (st.team[tp] !== st.team[ch.p] && st.players[tp].mz[t.z]) {
          for (let q = 0; q < st.n; q++) {
            if (!st.players[q].alive || st.team[q] !== st.team[tp]) continue;
            const gm = st.players[q].mz.find(m => m && !m.down && has(st, m, 'repulsion'));
            if (!gm) continue;
            log(st, q, `${mdef(gm).name} usa Repulsión divina: destruye ${d.name} y su efecto no se resuelve`);
            P.grave.push(ch.inst); lose(st, ch.p, d.self || 0, true);
            return;
          }
        }
      }
    }
    {   // Sasuke Chico (Sharingan): evade la magia que lo elige como objetivo
      const t = ch.target;
      if (t && t.z != null && d.fx !== 'destroyST') {
        const tp = t.vs != null ? t.vs : (FOE_TGT[d.fx] ? foeOf(st, ch.p, t) : ch.p);
        if (st.team[tp] !== st.team[ch.p] && sharinganEvade(st, tp, t.z)) { P.grave.push(ch.inst); lose(st, ch.p, d.self || 0, true); return; }
      }
    }
    if (!(ch.done || []).includes('anti')) {                                            // Espada de la antimagia (Asta)
      const v = spellVictim(st, ch), goku = d.fx === 'gokumon', am = v ? antiFor(st, ch.p, v, goku) : null;
      if (am) { st.pending = { k: 'ability', ab: 'antimag', kind: 'spell', player: am.q, zy: am.z, stz: am.stz, stage: 'ask', ch, nm: d.name }; return; }
    }
    if (!(ch.done || []).includes('shr')) {                                             // Sung Jin-Woo: Intercambio de sombras / Caballero Protector
      const v = spellVictim(st, ch), o = v ? shadowOpts(st, v.p, v.z, ch.p) : [];
      if (o.length) { ch.done = (ch.done || []).concat('shr'); st.pending = { k: 'ability', ab: 'shadowred', kind: 'spell', player: v.p, stage: 'ask', ch, vz: v.z, opts: o, nm: d.name }; return; }
    }
    const gd = spellGuard(st, ch);
    if (gd) { st.pending = gd; return; }
    (d.banish ? P.banish : P.grave).push(ch.inst);
    if (ch.stolen) {                                   // gema robada que no se queda en el campo (Gema del Tiempo): también cobra el precio del poder
      const bm = P.mz[ch.stolen.bz];
      if (bm && lvl(bm) <= 5 && !bm.price) { bm.price = true; log(st, ch.p, `Precio del poder: ${mdef(bm).name} pierde la mitad de su ATK y DEF base y sus habilidades`); }
    }
    almaCollect(st, ch, d);
    FX[d.fx].resolve(st, ch.p, d, ch.target);
  }
  /** Gema del Alma: guarda el efecto de cada magia enemiga usada sobre un personaje. */
  function almaCollect(st, ch, d) {
    const t = ch.target;
    if (!t || t.z == null || d.fx === 'destroyST' || PERM[d.fx] || !FX[d.fx]) return;
    for (let q = 0; q < st.n; q++) {
      if (!st.players[q].alive || st.team[q] === st.team[ch.p] || stOff(st)) continue;
      for (const s of st.players[q].st) if (s && !s.down && s.alma) { s.alma.eff.push(d.id); log(st, q, `La Gema del Alma guarda el efecto de ${d.name}`); }
    }
  }

  // ---------------- trampas y ventanas de respuesta ----------------
  function trapCands(st, resp, trigger, cont) {
    const R = st.players[resp], r = [];
    if (st.domain) return r;                             // dentro del dominio nadie activa trampas
    R.st.forEach((s, z) => {
      if (!s || !s.down || s.setTurn >= st.turn) return;
      const d = def(s.c);
      if (d.kind !== 'trap' || !(d.trigger === trigger || (d.triggers && d.triggers.includes(trigger)))) return;
      if (trigger === 'spell' && st.chain && st.chain.unstop && d.fx !== 'xcancel') return;      // Gokumonkyo no se puede anular… salvo con la X
      if (trigger === 'attack' && !st.atk) return;
      if (trigger === 'spell' && !st.chain) return;
      if (trigger === 'summon' && !(st.summon && st.players[st.summon.p].mz[st.summon.z])) return;
      if (trigger === 'summon' && d.maxLevel && lvl(st.players[st.summon.p].mz[st.summon.z]) > d.maxLevel) return;      // Infarto Inesperado: sólo 4★ o menos
      if (d.fx === 'realidad' && (!realityOpts(st, resp, trigger, cont).length || (cont && cont.kOnly))) return;          // no se activa si no puede resolverse
      if (d.fx === 'fullcounter' && !fcOpts(st, resp, trigger, cont).length) return;                                       // Full Counter: necesita un objetivo rival válido
      if (d.fx === 'kyoka' && !kyokaOpts(st, resp, cont).length) return;
      if (d.fx === 'kamui' && !(cont && cont.vic && st.players[cont.vic.p].mz[cont.vic.z] && st.team[cont.vic.p] === st.team[resp])) return;
      if ((d.fx === 'unico' || d.fx === 'tsukuyomi') && !(st.atk && st.atk.target !== 'direct' && st.players[st.atk.vs].mz[st.atk.target])) return;
      r.push(z);
    });
    return r;
  }
  /** Gema de la Realidad: opciones de cada efecto ([null] = sin elección; [] = no se puede activar). */
  function realityOpts(st, resp, trigger, cont) {
    const out = [];
    if (trigger === 'reduce') return cont && cont.info ? [null] : out;
    if (trigger === 'attack') {            // un enemigo ataca a un aliado: se redirige a un personaje del campo del atacante
      const a = st.atk;
      if (!a || a.target === 'direct' || st.team[a.vs] === st.team[a.p] || !st.players[a.vs].mz[a.target]) return out;
      for (let q = 0; q < st.n; q++) {
        if (!st.players[q].alive || st.team[q] !== st.team[a.p]) continue;
        for (const z of zonesWith(st.players[q].mz)) {
          if ((q === a.p && z === a.z) || (q === a.vs && z === a.target) || st.players[q].mz[z].six || !canTarget(st, resp, q, z)) continue;
          out.push({ vs: q, z });
        }
      }
      return out;
    }
    if (trigger === 'destroy') {           // se destruye en su lugar a un personaje rival
      for (const e of foes(st, resp)) for (const z of zonesWith(st.players[e].mz)) if (canTarget(st, resp, e, z)) out.push({ vs: e, z });
    }
    return out;
  }
  // ---------- tanda 6: a quién apunta cada cosa ----------
  /** Personaje al que apunta una magia: { p, z } o null. */
  function spellVictim(st, ch) {
    const d = def(ch.inst), t = ch.target;
    if (!t) return null;
    if (d.fx === 'voto') return t.vs != null && t.ez != null ? { p: t.vs, z: t.ez } : null;
    if (t.z == null || t.area === 'st' || d.fx === 'destroyST' || d.fx === 'pothala' || d.fx === 'cana' || d.fx === 'special' || d.fx === 'esferas' || d.fx === 'ultratumba') return null;
    const p = t.vs != null ? t.vs : ((FOE_TGT[d.fx] || d.fx === 'gem' || d.fx === 'gokumon' || d.fx === 'mafuba') ? foeOf(st, ch.p, t) : ch.p);
    return st.players[p] && st.players[p].mz[t.z] ? { p, z: t.z } : null;
  }
  /** Magias y habilidades hostiles de un solo objetivo que Full Counter puede devolver. */
  const FC_SPELL = { destroyOne: 1, deathnote: 1, mafuba: 1 };
  const FC_POW = ['canon', 'tm', 'td', 'tq', 'bigbang1', 'cuerno', 'avada', 'brillo', 'dios', 'rojo', 'dsserp', 'misadn', 'shikasomb', 'tobidim', 'tinta'];
  /** ¿Puede la habilidad `a` de `user` caer sobre el personaje (q, z)? (las mismas condiciones que al elegirla). */
  function powValid(st, user, a, q, z) {
    const tm = st.players[q] && st.players[q].mz[z], um = st.players[user].mz[a.zone];
    if (!tm || !um || (q === user && z === a.zone) || isInk(tm) || !canTarget(st, user, q, z, { ab: true })) return false;
    if (['canon', 'td', 'bigbang1', 'cuerno', 'brillo', 'rojo'].includes(a.pw) && tm.down) return false;
    if (a.pw === 'canon' && lvl(tm) > 7) return false;
    if ((a.pw === 'tm' || a.pw === 'cuerno') && lvl(tm) > 4) return false;
    if (a.pw === 'bigbang1' && lvl(tm) > lvl(um)) return false;
    if (a.pw === 'brillo' && (lvl(tm) > 11 || tm.bri)) return false;
    if (a.pw === 'dios' && (tm.god || rawAbil(tm).includes('vimm'))) return false;
    if (a.pw === 'dsserp' && tm.snake) return false;
    if (a.pw === 'misadn' && tm.dn) return false;
    if (a.pw === 'tinta' && a.opt === 'leon') return false;
    return true;
  }
  /** Full Counter: objetivos rivales a los que se puede devolver el efecto. [] = no se puede activar. */
  function fcOpts(st, resp, trigger, cont) {
    const out = [], team = q => st.team[q];
    const rivals = src => { const r = []; for (let q = 0; q < st.n; q++) if (st.players[q].alive && team(q) === team(src)) for (const z of zonesWith(st.players[q].mz)) r.push({ vs: q, z }); return r; };
    if (trigger === 'attack') {
      const a = st.atk;
      if (!a || a.target === 'direct' || team(a.vs) !== team(resp) || team(a.p) === team(resp) || !st.players[a.vs].mz[a.target]) return out;
      for (const c of rivals(a.p)) { const tm = st.players[c.vs].mz[c.z]; if (!(c.vs === a.p && c.z === a.z) && !tm.six && !isInk(tm) && canTarget(st, resp, c.vs, c.z)) out.push(c); }
      return out;
    }
    if (trigger === 'spell') {
      const ch = st.chain, v = ch && spellVictim(st, ch);
      if (!v || !FC_SPELL[def(ch.inst).fx] || team(v.p) !== team(resp) || team(ch.p) === team(resp)) return out;
      for (const c of rivals(ch.p)) { const tm = st.players[c.vs].mz[c.z]; if (!isInk(tm) && !rikaUp(st, tm) && canTarget(st, resp, c.vs, c.z)) out.push(c); }
      return out;
    }
    if (trigger === 'power') {
      const pa = cont && cont.pa, t = pa && pa.target;
      if (!pa || !t || t.vs == null || t.z == null || t.area === 'st' || !FC_POW.includes(pa.pw) || team(t.vs) !== team(resp) || team(cont.by) === team(resp)) return out;
      for (const c of rivals(cont.by)) if (powValid(st, cont.by, pa, c.vs, c.z)) out.push(c);
      return out;
    }
    if (trigger === 'trap' && cont && cont.k === 'trapAct') {
      const d = C().get(cont.tid);
      const v = d.fx === 'destroyAttacker' && st.atk ? { p: st.atk.p, z: st.atk.z } : (d.fx === 'destroySummoned' || d.fx === 'infarto') && st.summon ? st.summon : null;
      if (!v || team(v.p) !== team(resp) || team(cont.by) === team(resp)) return out;
      for (const c of rivals(cont.by)) { const tm = st.players[c.vs].mz[c.z]; if (!isInk(tm) && !rikaUp(st, tm) && canTarget(st, resp, c.vs, c.z)) out.push(c); }
    }
    return out;
  }
  /** Kyoka Suigetsu: otro personaje del campo (de cualquiera) que pueda recibir la habilidad enemiga. */
  function kyokaOpts(st, resp, cont) {
    const out = [], pa = cont && cont.pa, t = pa && pa.target;
    if (!pa || cont.k !== 'power' || !t || t.vs == null || t.z == null || t.area === 'st' || st.team[t.vs] !== st.team[resp] || st.team[cont.by] === st.team[resp]) return out;
    for (let q = 0; q < st.n; q++) if (st.players[q].alive) for (const z of zonesWith(st.players[q].mz)) if (!(q === t.vs && z === t.z) && powValid(st, cont.by, pa, q, z)) out.push({ vs: q, z });
    return out;
  }
  /** Espada de la antimagia: quién puede anular ahora un efecto que apunta a (v.p, v.z). Gokumonkyo: toda la familia Asta, apunte a quien apunte. */
  function antiFor(st, byP, v, goku) {
    if (!v || (st.team[v.p] === st.team[byP] && !goku)) return null;
    for (let i = 0; i < st.n; i++) {
      const q = (v.p + i) % st.n, Q = st.players[q];
      if (!Q.alive || q === byP || (!goku && st.team[q] !== st.team[v.p])) continue;
      if (goku && st.team[q] === st.team[byP]) continue;
      for (let z = 0; z < ZONES; z++) {
        const m = Q.mz[z];
        if (m && !m.down && has(st, m, 'antimagia') && !blocked(m, 'ab') && uOf(m).amT !== st.turn && (!goku || mdef(m).fam === 'Asta')) return { q, z };
      }
    }
    if (!goku) { const Pv = st.players[v.p], s = eqWith(st, Pv, v.z, 'antimag').find(x => x.amT !== st.turn); if (s) return { q: v.p, z: v.z, stz: Pv.st.indexOf(s) }; }
    return null;
  }
  /** Ventana de la Gema de la Realidad para el equipo de `vp` (la víctima) ante un efecto de `srcP`. */
  function realityWindow(st, trig, srcP, vp, cont, txt) {
    cont.by = srcP; cont.info = { src: srcP, vp, txt: txt || '' };
    const list = [];
    for (let i = 0; i < st.n; i++) { const q = (vp + i) % st.n; if (st.players[q].alive && st.team[q] === st.team[vp]) list.push(q); }
    return nextWindow(st, trig, cont, list);
  }
  /** Quién puede responder: en un ataque, el atacado; si no, los rivales del que actúa por orden de turno. */
  function responders(st, trigger, by) {
    if (trigger === 'attack' && st.atk && st.atk.vs != null) return st.team[st.atk.vs] === st.team[st.atk.p] ? [] : [st.atk.vs];
    return foes(st, by);
  }
  function nextWindow(st, trigger, cont, list) {
    for (let i = 0; i < list.length; i++) {
      const resp = list[i];
      if (!st.players[resp].alive) continue;
      const cands = trapCands(st, resp, trigger, cont);
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
  function applyTrap(st, resp, d, pd, invTeam) {
    switch (d.fx) {
      case 'ola': {                       // Ola de Fuego: todos los personajes rivales pierden 500 ATK y DEF (o los ganan, si la Gema de la Realidad lo invierte)
        for (let q = 0; q < st.n; q++) {
          if (!st.players[q].alive || st.team[q] === st.team[resp]) continue;
          const inv = invTeam != null && st.team[q] === invTeam;
          st.players[q].mz.forEach(m => { if (m && !m.six && !has(st, m, 'rikaprot')) addMod(st, m, 'ola', inv ? 500 : -500, inv ? 500 : -500, 0); });
        }
        log(st, resp, invTeam != null ? 'Ola de Fuego: la reducción se convierte en un aumento de +500 ATK y +500 DEF' : 'Ola de Fuego: todos los personajes rivales pierden 500 ATK y 500 DEF');
        break;
      }
      case 'xcancel':                     // X: Cancelación absoluta
        if (pd && pd.trigger === 'spell') { if (st.chain) { st.chain.negated = true; log(st, resp, 'X cancela la magia: queda destruida'); } }
        else if (pd && pd.cont) { pd.cont.cancel = true; log(st, resp, pd.trigger === 'trap' ? 'X cancela la trampa: queda destruida' : (pd.cont.pa && pd.cont.pa.pw === 'kform' ? 'X cancela la habilidad: no se puede volver a usar este turno' : pd.cont.k === 'boom' ? 'X cancela la Explosión del Creeper' : 'X cancela la habilidad: queda consumida para siempre')); }
        break;
      case 'realidad': {                  // Gema de la Realidad
        const o = pd && pd.opt, tm = o && st.players[o.vs] && st.players[o.vs].mz[o.z];
        if (pd.trigger === 'attack') {
          if (!st.atk || !tm) break;
          st.atk.vs = o.vs; st.atk.target = o.z;
          log(st, resp, `Gema de la Realidad: el ataque se redirige contra ${tm.down ? 'un personaje boca abajo' : mdef(tm).name}`);
        } else if (pd.trigger === 'destroy') {
          pd.cont.cancel = true;
          log(st, resp, `Gema de la Realidad: el aliado se salva y, en su lugar, es destruido ${tm ? mdef(tm).name : 'un enemigo'}`);
          if (tm) destroyMonster(st, o.vs, o.z, { src: 'trap', bp: resp });
        } else if (pd.trigger === 'reduce') {
          pd.cont.invert = true;
          log(st, resp, 'Gema de la Realidad: la reducción de estadísticas se convierte en un aumento igual');
        }
        break;
      }
      case 'infarto': {
        const s = st.summon, m = s && st.players[s.p].mz[s.z];
        if (m) { log(st, resp, `provoca un infarto a ${mdef(m).name}`); destroyMonster(st, s.p, s.z, { src: 'trap', bp: resp }); }
        break;
      }
      case 'negateAttack': if (st.atk) st.atk.negated = true; log(st, resp, 'el ataque es negado'); break;
      // ----- tanda 6 -----
      case 'unico': {                     // El Único: 100 por encima del ATK del atacante durante este combate
        const a = st.atk, at = a && st.players[a.p].mz[a.z], dm = a && st.players[a.vs].mz[a.target];
        if (!at || !dm) break;
        const A = atkOf(st, st.players[a.p], a.z), useAtk = dm.pos === 'atk' && !dm.down, cur = useAtk ? atkOf(st, st.players[a.vs], a.target) : defOf(st, st.players[a.vs], a.target), dlt = Math.max(0, A + 100 - cur);
        addMod(st, dm, 'unico', useAtk ? dlt : 0, useAtk ? 0 : dlt, 0);
        log(st, resp, `El Único: ${dm.down ? 'tu personaje' : mdef(dm).name} queda con ${A + 100} de ${useAtk ? 'ATK' : 'DEF'} durante este combate`);
        break;
      }
      case 'tsukuyomi': {
        const a = st.atk, at = a && st.players[a.p].mz[a.z];
        if (!a) break;
        a.negated = true;
        if (at) (at.binds = at.binds || []).push({ atk: true, n: 2, t0: st.turn, nm: 'el Tsukuyomi' });
        log(st, resp, `Tsukuyomi: ${at ? mdef(at).name : 'el atacante'} queda atrapado en la ilusión; su ataque se cancela y no podrá atacar en sus 2 turnos siguientes`);
        break;
      }
      case 'kamui': {
        const v = pd && pd.cont && pd.cont.vic;
        if (!v || !st.players[v.p].mz[v.z]) break;
        pd.cont.cancel = true; pd.cont.kamui = true;
        toLimbo(st, v.p, v.z, 'start', 0, 'Kamui: otra dimensión');
        break;
      }
      case 'fullcounter': case 'kyoka': {
        const o = pd && pd.opt, tm = o && st.players[o.vs] && st.players[o.vs].mz[o.z];
        if (!tm) break;
        const who = tm.down ? 'un personaje boca abajo' : mdef(tm).name, lb = d.fx === 'kyoka' ? 'Kyoka Suigetsu' : 'Full Counter';
        if (pd.trigger === 'attack' && st.atk) { st.atk.vs = o.vs; st.atk.target = o.z; log(st, resp, `${lb}: el ataque se devuelve contra ${who}`); }
        else if (pd.trigger === 'spell' && st.chain) { st.chain.target = { vs: o.vs, z: o.z }; log(st, resp, `${lb}: la magia se devuelve contra ${who}`); }
        else if (pd.trigger === 'power' && pd.cont && pd.cont.pa) { pd.cont.pa.target = { vs: o.vs, z: o.z }; log(st, resp, `${lb}: la habilidad ahora apunta a ${who}`); }
        else if (pd.trigger === 'trap' && pd.cont) { pd.cont.redirect = { vs: o.vs, z: o.z }; log(st, resp, `${lb}: la trampa se devuelve contra ${who}`); }
        if (multi(st)) st.log[st.log.length - 1].q = o.vs;
        break;
      }
      case 'destroyAttacker':
        if (st.atk) {
          const a = st.atk;
          if (st.players[a.p].mz[a.z]) { log(st, resp, `destruye a ${mdef(st.players[a.p].mz[a.z]).name}`); destroyMonster(st, a.p, a.z, { src: 'trap', bp: resp }); }
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
          if (m) { log(st, resp, `destruye a ${mdef(m).name}`); destroyMonster(st, s.p, s.z, { src: 'trap', bp: resp }); }
        }
        break;
    }
  }
  function afterRespond(st, cont) {
    if (cont.k === 'attack') continueAttack(st);
    else if (cont.k === 'kcombat') { if (cont.kamui) atkDone(st, cont.a); else { st.atk = cont.a; continueAttack(st); } }      // trampa Kamui ante un combate
    else if (cont.k === 'boom') {                      // X pudo cancelar la Explosión del Creeper: el combate sigue normal
      const m = st.players[cont.cr.p].mz[cont.cr.z];
      if (cont.cancel && m && m.c.uid === cont.uid) { m.c.spent = true; log(st, cont.cr.p, `La Explosión de ${mdef(m).name} es cancelada: el combate se resuelve con normalidad`); }
      st.atk = cont.a; continueAttack(st);
    }
    else if (cont.k === 'spell') continueSpell(st);
    else if (cont.k === 'summon') st.summon = null;
    else if (cont.k === 'trapAct') {                    // X pudo cancelar una trampa antes de que se resolviera
      const d = C().get(cont.tid);
      if (cont.cancel) { log(st, cont.by, `${d.name} es cancelada y destruida`); respondRest(st, cont.rp); }
      else if (cont.redirect) {                         // Full Counter: la trampa destruye al personaje rival elegido
        const o = cont.redirect, tm = st.players[o.vs].mz[o.z];
        if (tm) destroyMonster(st, o.vs, o.z, { src: 'trap', bp: cont.by });
        if (d.fx === 'destroyAttacker' && st.atk) st.atk.negated = true;
        respondRest(st, cont.rp);
      }
      else trapResolve(st, cont.by, d, cont.rp, []);
    } else if (cont.k === 'power') {                    // X pudo cancelar una habilidad
      if (cont.cancel) cancelPower(st, cont.by, cont.pa);
      else runPower(st, cont.by, Object.assign({}, cont.pa, { xd: 1 }));
    } else if (cont.k === 'gspell') {                   // Gema de la Realidad ante una magia que destruye
      const ch = cont.ch, P = st.players[ch.p];
      ch.done = (ch.done || []).concat('gema');
      if (cont.cancel) { P.grave.push(ch.inst); log(st, ch.p, `${def(ch.inst).name} fue sustituida por la Gema de la Realidad`); return; }
      st.chain = ch; continueSpell(st);
    } else if (cont.k === 'gpower') {                   // ... ante una habilidad que destruye o reduce
      const a2 = Object.assign({}, cont.pa, { gd: 1 });
      if (cont.cancel) spendPower(st, cont.by, cont.pa);
      else { if (cont.invert) a2.inv = 1; runPower(st, cont.by, a2); }
    } else if (cont.k === 'gtrap') {                    // ... ante una trampa
      const d = C().get(cont.tid);
      if (cont.cancel) { if (d.fx === 'destroyAttacker' && st.atk) st.atk.negated = true; respondRest(st, cont.rp); }
      else trapResolve(st, cont.tp, d, cont.rp, (cont.done || []).concat('gema'), cont.invert ? st.team[cont.info.vp] : null);
    }
  }
  const DEST_TRAP = { destroyAttacker: 1, destroySummoned: 1, infarto: 1 };
  const PW_DEST = ['canon', 'tm'], PW_RED = ['rojo', 'td'], PW_KAMUI = ['bigbang1', 'cuerno'];
  /** Gema de la Realidad ante un poder que destruye o reduce a un personaje rival de otro equipo. true = se abrió una ventana. */
  function powerReality(st, p, a) {
    const t = a.target;
    if (!t || t.vs == null || st.team[t.vs] === st.team[p]) return false;
    const vm = st.players[t.vs].mz[t.z], um = st.players[p].mz[a.zone];
    if (!vm || !um) return false;
    const txt = `${mdef(um).name} usa ${PWL[a.pw] || a.pw} sobre ${mdef(vm).name}`;
    if (PW_DEST.includes(a.pw)) return realityWindow(st, 'destroy', p, t.vs, { k: 'gpower', pa: a, vic: { p: t.vs, z: t.z } }, txt);
    if (PW_KAMUI.includes(a.pw)) return realityWindow(st, 'destroy', p, t.vs, { k: 'gpower', pa: a, vic: { p: t.vs, z: t.z }, kOnly: 1 }, txt);      // sólo la trampa Kamui
    if (PW_RED.includes(a.pw) || (a.pw === 'tinta' && a.opt === 'serp')) return realityWindow(st, 'reduce', p, t.vs, { k: 'gpower', pa: a }, txt);
    return false;
  }
  const PWL = { majinex: 'Explosión final', armin: 'Transformación en Titán Colosal', manto: 'Manto de Kyuubi', rasengan: 'Rasengan', kaiox10: 'Kaioken x10', odinvida: 'Cargas de vida', odinrev: 'Revelación divina', odinbend: 'Bendición de poder', tgmente: 'Gema de la Mente', tgtiempo: 'Gema del Tiempo', tq: '¡Quieto!', td: '¡Debilítate!', tm: '¡Muere!', rojo: 'Rojo', azul: 'Azul', purpura: 'Púrpura', xform: 'Transformación', kform: 'Transformación', avpred: 'Depredador de Magia', kaioken6: 'Kaio-ken', genki: 'Genkidama', ydominio: 'Amor Mutuo y Verdadero', dominio: 'Ataúd de la Montaña de Hierro', marca: 'Marca de Cazador', conc: 'Respiración de Concentración Total', conc2: 'Respiración de Concentración Total', desp: 'Despertar del Poder Oculto', teach: 'Maestro de las Artes', eren: 'Transformación en Titán de Ataque', punos: 'Endurecimiento de los puños', semilla: 'Semilla del Hermitaño', armadura: 'Armadura de Iron Man', jkmove: 'Transformación en equipo', simb: 'Simbiosis', robo: 'Robo de habilidades', kurama: 'Chakra de Kurama', dslobos: 'Lobos', dsnue: 'Nue', dselef: 'Elefante', dssapo: 'Sapo', dsserp: 'Serpiente', dsmaho: 'Invocación del General Mahoraga',
    astaneg: 'Transformación en Asta Forma Negra', astauni: 'Transformación en Asta Unión Demoníaca', astacausa: 'Espada Destructora de Causas', sjarmy: 'Ejército de las sombras', sjigris: 'Caballero de las sombras: Igris', sjberu: 'Beru, el Rey Hormiga', sjbellion: 'Bellion, Gran Mariscal', sjmon: 'Monarca de las Sombras', kameha: 'Kamehameha', bulmagen: 'Genio científico', satanpub: 'Publicidad engañosa', elizluz: 'Luz purificadora', galco: 'Critical Over', galcaza: 'Caza Implacable', higudom: 'Sentencia Mortal', tobidim: 'Dimensión Kamui', tinta: 'Súper Bestias de Tinta', shikasomb: 'Posesión de sombras', liukang: 'Patadas Continuas', misaojos: 'Ojos de Shinigami', misadn: 'Portadora de la Death Note', katana: 'Katana de la Antimagia', kaisel: 'Montura de las Sombras', kaiselvuelo: 'Vuelo Dracónico', rsalv: 'Salvajismo', rrug: 'Rugido de Batalla', rcam: 'Camuflaje', rred: 'Bola de Red', rcaza: 'Emoción de la Cacería', salaf: 'Entrenamiento físico', salar: 'Resistencia extrema', salad: 'Dominio de combate', nearmira: 'Sucesor de L', hakdom: 'Expansión de Dominio: Apuesta Mortal', hruleta: 'Girar la ruleta', kzfuego: 'Máscara de Fuego', kzviento: 'Máscara de Viento', kzrayo: 'Máscara de Rayo', kzagua: 'Máscara de Agua' };
  /** Habilidad (id) a la que pertenece cada poder, para que X la consuma. */
  const PW_ABID = Object.assign({}, PW_AB, { eren: 'transtitan', punos: 'punos', semilla: 'semilla', armadura: 'tonyarm', jkmove: 'jake', simb: 'symb', robo: 'sylas', kurama: 'kurama', ydominio: 'yutadom', bite: 'bite', copy: 'copy', majinex: 'majinex', armin: 'armin', manto: 'manto', rasengan: 'rasengan', odinvida: 'odincarga', odinrev: 'odinrev', odinbend: 'odinbend', astacausa: 'astacausa', sjarmy: 'sjarmy', sjigris: 'sjigris', sjberu: 'sjberu', sjbellion: 'sjbellion', kameha: 'kameha', bulmagen: 'bulmagen', satanpub: 'satanpub', elizluz: 'elizluz', galco: 'galco', galcaza: 'galcaza', higudom: 'higudom', tobidim: 'tobidim', tinta: 'tinta', shikasomb: 'shikasomb', liukang: 'liukang', misaojos: 'misaojos', misadn: 'misadn', kaisel: 'sjdom', kaiselvuelo: 'kaivuelo', rsalv: 'rengarmax', rrug: 'rengarmax', rcam: 'rengarmax', rred: 'rengarmax', rcaza: 'rengarcaza', salaf: 'saladum', salar: 'saladum', salad: 'saladum', nearmira: 'nearmira', hakdom: 'hakdom', hruleta: 'hakdom', kzfuego: 'kzmask', kzviento: 'kzmask', kzrayo: 'kzmask', kzagua: 'kzmask' });
  const PW_FLAG = { tq: 'tq', td: 'td', tm: 'tm', rojo: 'rojo', azul: 'azul', purpura: 'purpura', kaioken6: 'kk6', genki: 'gen', canon: 'canon' };
  /** Marca el poder como gastado: lo que habría gastado su uso normal. (X: para siempre, esa instancia del personaje.) */
  function consumePower(st, p, a, forever) {
    const m = st.players[p].mz[a.zone];
    if (!m) return;
    const u = uOf(m);
    if (PW_FLAG[a.pw]) { u[PW_FLAG[a.pw]] = true; if (a.pw === 'tq' || a.pw === 'td' || a.pw === 'tm') u.tgR = curRound(st); if (!forever) return; if (a.pw !== 'canon') return; }
    const id = PW_ABID[a.pw];
    if (forever && id && !(m.spentAb || []).includes(id)) m.spentAb = (m.spentAb || []).concat([id]);
  }
  /** Una habilidad evadida, cancelada o sustituida no se puede volver a intentar en el mismo turno. */
  function blockPw(st, p, a) {
    const m = st.players[p] && st.players[p].mz[a.zone];
    if (!m) return;
    m.cx = Object.assign({}, m.cx);
    m.cx[a.pw] = st.turn;
  }
  function spendPower(st, p, a) {
    const m = st.players[p].mz[a.zone];
    if (!m) return;
    blockPw(st, p, a);
    consumePower(st, p, a, false);
    log(st, p, `${mdef(m).name} usa ${PWL[a.pw] || a.pw}: el efecto fue sustituido`);
  }
  /** X cancela una habilidad: no se resuelve y esa habilidad de esa invocación queda consumida para siempre. */
  function cancelPower(st, p, a) {
    const m = st.players[p].mz[a.zone];
    if (!m) return;
    blockPw(st, p, a);
    const id = PW_ABID[a.pw], nmA = PWL[a.pw] || (id && (C().AB[id] || [])[0]) || a.pw;
    consumePower(st, p, a, true);
    const forever = !!(PW_FLAG[a.pw] || id);      // la transformación de Kayn sólo se pierde ese turno (decisión del dueño, 04-11-2026)
    log(st, p, `La habilidad ${nmA} de ${mdef(m).name} es cancelada y ${forever ? 'queda consumida para siempre' : 'no se puede volver a usar este turno'}`);
    st.log[st.log.length - 1].xc = 1;
  }

  // ---------------- invocar ----------------
  /** Anti-Venom se acopla al anfitrión: +1000/+1000 y sus habilidades; la carta queda vinculada a él. */
  function coupleAV(st, p, hi, hz, tributes) {
    const P = st.players[p], inst = P.hand.splice(hi, 1)[0];
    inst.spent = false; inst.by = p;
    for (const z of tributes) removeMonster(st, p, z, 'grave');
    const h = P.mz[hz], g = gx(P, hz);
    h.link = (h.link || []).concat([inst]);
    h.av = { on: true, choice: null, n: 0, turn: -1, tn: 0, uid: inst.uid };
    addMod(st, h, 'av-base', 1000 * g, 1000 * g, 0);
    P.normalUsed = true;
    if (tributes.length) log(st, p, `ofrece ${tributes.length} tributo${tributes.length > 1 ? 's' : ''}`);
    log(st, p, `${def(inst).name} se acopla a ${mdef(h).name} (+${1000 * g} ATK y DEF)`);
    st.log[st.log.length - 1].cp = 1;
  }
  /** Jake (espada o escudo) o Venom (Simbiosis) se equipan desde la mano a un aliado: no ocupan zona y siguen su destino. */
  function attachCard(st, p, hi, hz, mode) {
    const P = st.players[p], inst = P.hand.splice(hi, 1)[0], h = P.mz[hz], g = gx(P, hz), hn = mdef(h).name;
    inst.spent = false; inst.by = p;      // quién puso la carta (para contar las cartas de cada jugador si el anfitrión está corrompido)
    h.link = (h.link || []).concat([inst]);
    if (mode === 'venom') {
      const sb = SYMB[inst.id] || SYMB.c_venom;
      h.sym = { uid: inst.uid, t0: st.turn }; P.symT = st.turn;
      addMod(st, h, 'venom', sb[0] * g, sb[1] * g, 0);      // sólo la mitad de las estadísticas del simbionte
      log(st, p, `equipa a ${def(inst).name} en ${hn} (+${sb[0] * g} ATK y +${sb[1] * g} DEF)`);
    } else {
      h.jk = { uid: inst.uid, mode };
      addMod(st, h, 'jake', mode === 'sword' ? 600 * g : 0, mode === 'shield' ? 500 * g : 0, 0);
      log(st, p, `equipa a Jake el Perro en ${hn} como ${mode === 'sword' ? 'espada (+' + 600 * g + ' ATK)' : 'escudo (+' + 500 * g + ' DEF)'}`);
    }
  }
  function placeMonster(st, p, handIdx, tributes, faceDown, inv) {
    const P = st.players[p];
    const inst = P.hand.splice(handIdx, 1)[0];
    inst.spent = false;
    for (const z of tributes) removeMonster(st, p, z, 'grave');
    if (inv) {                                         // Reyna Flama: invocada en el campo del rival, que pasa a controlarla
      const E2 = st.players[inv.vs];
      if (occ(E2)[inv.fz]) {                          // la casilla se ocupó (p. ej. Cell liberó lo que tenía absorbido): otra libre o vuelve a la mano
        const oe = occ(E2), nf = oe.findIndex(x => !x);
        if (nf < 0) { P.hand.splice(Math.min(handIdx, P.hand.length), 0, inst); log(st, p, `no queda espacio rival para ${def(inst).name}: vuelve a la mano`); return; }
        inv = { vs: inv.vs, fz: nf };
      }
      E2.mz[inv.fz] = mkSlot(st, inst, { pos: 'atk', owner: p });
      P.normalUsed = true;
      if (tributes.length) log(st, p, `ofrece ${tributes.length} tributo${tributes.length > 1 ? 's' : ''}`);
      log(st, p, `invoca a ${def(inst).name} (ATK ${atkOf(st, E2, inv.fz)}) en el campo de ${multi(st) ? 'otro jugador' : 'su rival'}`);
      if (multi(st)) st.log[st.log.length - 1].q = inv.vs;
      entered(st, inv.vs, inv.fz);
      return;
    }
    const d = def(inst), z = spot(P, d);
    if (z < 0) { P.hand.splice(Math.min(handIdx, P.hand.length), 0, inst); log(st, p, `no queda espacio para ${d.name}: vuelve a la mano`); return; }      // p. ej. lo que Cell tenía absorbido volvió a su casilla
    P.mz[z] = mkSlot(st, inst, { pos: faceDown ? 'def' : 'atk', down: !!faceDown, wide: !!d.wide });
    P.normalUsed = true;
    if (tributes.length) log(st, p, `ofrece ${tributes.length} tributo${tributes.length > 1 ? 's' : ''}`);
    if (faceDown) { log(st, p, 'coloca un monstruo boca abajo'); return; }
    log(st, p, `invoca a ${d.name} (ATK ${atkOf(st, P, z)})`);
    entered(st, p, z);
    st.summon = { p, z };
    if (openWindow(st, 'summon', { k: 'summon', by: p })) return;
    st.summon = null;
  }

  // ---------------- batalla ----------------
  const gemOf = (st, uid) => {
    for (let p = 0; p < st.n; p++) { const P = st.players[p]; for (let i = 0; i < ZONES; i++) { const s = P.st[i]; if (s && s.gem && s.gem.uid === uid) return { p, i, s }; } }
    return null;
  };
  /** Posturas (Respiración de la Roca, Respiración Solar…) y el rayo de Zenitsu: se obtienen al declararse un ataque contra otro personaje. */
  function onDeclare(st, p, z, vs, tz) {
    const stage = (q, zz, isAtk) => {
      const P = st.players[q], m = P.mz[zz];
      if (!m) return;
      const u = uOf(m), g = gx(P, zz);
      if (has(st, m, 'gyomei1') && (u.rock || 0) < 4) { u.rock = (u.rock || 0) + 1; addMod(st, m, 'roca', 200 * g, 200 * g, 0); log(st, q, `${mdef(m).name}: postura de la Roca ${u.rock}/4 (+${200 * g} ATK y DEF)`); }
      if (has(st, m, 'yoriichi') && (u.sun || 0) < 13) { u.sun = (u.sun || 0) + 1; addMod(st, m, 'sol', 300 * g, 300 * g, 0); log(st, q, `${mdef(m).name}: postura solar ${u.sun}/13 (+${300 * g} ATK y DEF)`); }
      if (isAtk && has(st, m, 'zenitsu1')) { u.rayo = (u.rayo || 0) + 1; addMod(st, m, 'rayo', 200 * g, 200 * g, 0); log(st, q, `${mdef(m).name}: Primera Postura del Rayo (+${200 * g} ATK y DEF)`); }
    };
    stage(p, z, true);
    stage(vs, tz, false);
  }
  /** Rengar: Depredador Salvaje, 1 punto de ferocidad por declarar un ataque o destruir a un enemigo (máx. 4; un combate no da 2). */
  function ferocidad(st, p, m, why) {
    if (!m || m.down || !has(st, m, 'rengarfer')) return;
    const u = uOf(m);
    if ((u.fer || 0) >= 4) return;
    u.fer = (u.fer || 0) + 1;
    log(st, p, `${mdef(m).name}: Depredador Salvaje, ${why === 'ataca' ? 'ataca' : 'destruye a un enemigo'} y acumula ferocidad (${u.fer}/4)`);
  }
  function declareAttack(st, p, z, target, vs, extra) {
    const m = st.players[p].mz[z];
    m.atkN = atkCount(m) + 1; m.attacked = true;
    if (vs == null) vs = foeOf(st, p, null);
    st.atk = { p, z, target, vs, negated: false };
    if (extra && extra.length) st.atk.extra = extra;      // Puño del Dragón: otras casillas atravesadas en el mismo ataque
    log(st, p, target === 'direct' ? `${mdef(m).name} ataca directamente` : `${mdef(m).name} ataca`);
    if (multi(st)) st.log[st.log.length - 1].q = vs;
    ferocidad(st, p, m, 'ataca');
    if (target !== 'direct' && escStage(st, m).k === 'mediodia' && st.players[vs].mz[target]) { if (!m.escHit || m.escHit.t !== st.turn) m.escHit = { t: st.turn, u: [] }; m.escHit.u.push(st.players[vs].mz[target].c.uid); }
    const entry = st.log[st.log.length - 1];
    if (target !== 'direct' && st.players[vs].mz[target]) onDeclare(st, p, z, vs, target);
    if (target !== 'direct' && has(st, m, 'inopost')) {      // Inosuke: Postura de la Bestia, +200/+200 por cada ataque que declara contra un personaje (no directo), hasta 11 veces por duelo
      const k = st.ino || (st.ino = {}), n = k[m.c.uid] | 0;
      if (n < 11) { const g = gx(st.players[p], z); k[m.c.uid] = n + 1; addMod(st, m, 'bestia', 200 * g, 200 * g, 0); log(st, p, `${mdef(m).name}: Postura de la Bestia ${n + 1}/11 (+${200 * g} ATK y DEF)`); }
    }
    {   // datos públicos del ataque para el aviso «versus» de la pantalla (un objetivo boca abajo no se revela)
      const dm0 = target === 'direct' ? null : st.players[vs].mz[target], up = dm0 && !dm0.down;
      entry.a = { z, tg: target, vs, ci: m.c.id, at: atkOf(st, st.players[p], z),
        ti: up ? dm0.c.id : null, tpos: dm0 ? dm0.pos : null, tv: up ? (dm0.pos === 'atk' ? atkOf(st, st.players[vs], target) : defOf(st, st.players[vs], target)) : null };
    }
    if (target !== 'direct' && st.players[vs].mz[target] && has(st, m, 'hiraishin')) {      // Hiraishin: marca la casilla y da derecho a un ataque extra
      st.marks = st.marks || [];
      if (!st.marks.some(k => k.by === p && k.vs === vs && k.z === target)) st.marks.push({ by: p, vs, z: target });
      m.hira = (m.hira || 0) + 1;
      log(st, p, `Hiraishin: deja una marca en la casilla ${target + 1}`);
      if (multi(st)) st.log[st.log.length - 1].q = vs;
    }
    // Gema de la Mente: quien controla la mente del atacante puede cancelar el ataque
    const g = !st.domain && gemOf(st, m.c.uid);
    if (g && st.players[g.p].alive && g.s.gem.uses < 2 && g.s.gem.usedTurn !== st.turn && !yoriFast(st, p, z)) {
      st.pending = { k: 'ability', ab: 'gem', player: g.p, stage: 'ask', uid: m.c.uid, stz: g.i, cont: { k: 'attack', by: p } };
      return;
    }
    togeWindow(st, p);
  }
  /** Toge Inumaki (¡Quieto!): al atacar a él o a un aliado, puede cambiar la posición del atacante y cancelar el ataque. */
  function togeWindow(st, p) {
    const a = st.atk, at = a && st.players[a.p].mz[a.z];
    if (a && at && a.target !== 'direct' && st.team[a.vs] !== st.team[a.p] && at.pos === 'atk' && !at.down && !yoriFast(st, a.p, a.z)) {
      for (let i = 0; i < st.n; i++) {
        const q = (a.vs + i) % st.n, Q = st.players[q];
        if (!Q.alive || st.team[q] !== st.team[a.vs]) continue;
        for (let z = 0; z < ZONES; z++) {
          const m = Q.mz[z];
          if (!m || m.down || !has(st, m, 'toge')) continue;
          const u = uOf(m);
          if (u.tq || u.tgR === curRound(st) || !canTarget(st, q, a.p, a.z)) continue;
          st.pending = { k: 'ability', ab: 'toge', player: q, stage: 'ask', uid: m.c.uid, nm: mdef(at).name, cont: { k: 'attack', by: p } };
          return;
        }
      }
    }
    attackWindows(st, p);
  }
  /** Fin de un ataque (se resolvió, se canceló o se interceptó): el Endurecimiento de los puños se gasta. */
  function atkDone(st, a) {
    st.cmb = null; st.minShield = null;
    const m = a && st.players[a.p] && st.players[a.p].mz[a.z];
    if (m && m.sed) { if (m.sed.fresh) m.sed.fresh = false; else { dropMods(m, 'sed'); m.sed = null; } }      // el +400 de Sed de sangre sólo vale para el ataque siguiente
    if (m && m.mods && m.mods.some(x => x.k === 'punos')) { dropMods(m, 'punos'); log(st, a.p, `${mdef(m).name} gasta su Endurecimiento de los puños`); }
    if (m && m.mods && m.mods.some(x => x.k === 'chi')) { dropMods(m, 'chi'); log(st, a.p, `${mdef(m).name} gasta su Chidori`); }
    if (m && m.mods && m.mods.some(x => x.k === 'ras')) { dropMods(m, 'ras'); log(st, a.p, `${mdef(m).name} gasta su Rasengan`); }
    if (m && m.mods && m.mods.some(x => x.k === 'kame')) { dropMods(m, 'kame'); log(st, a.p, `${mdef(m).name} gasta su Kamehameha`); }
    if (m && m.mods && m.mods.some(x => x.k === 'caza')) dropMods(m, 'caza');
    if (m && m.mods && m.mods.some(x => x.k === 'kzviento')) dropMods(m, 'kzviento');
    for (const Q of st.players) for (const x of Q.mz) if (x && x.mods && x.mods.some(y => y.k === 'unico')) dropMods(x, 'unico');      // El Único: sólo ese combate
    if (m && m.ghost) { log(st, a.p, `${mdef(m).name} es desterrado tras el ataque`); removeMonster(st, a.p, a.z, 'banish'); }
  }
  /** Ataque Hiraishin extra: contra una casilla marcada, sin ventana de respuesta para nadie. */
  function hiraAttack(st, p, a) {
    const me = st.players[p], m = me.mz[a.zone], vs = a.vs != null ? a.vs : foeOf(st, p, null);
    m.hira = Math.max(0, (m.hira || 0) - 1);
    log(st, p, `${mdef(m).name} ataca con Hiraishin (nadie puede responder)`);
    const entry = st.log[st.log.length - 1];
    if (multi(st)) entry.q = vs;
    const dm0 = st.players[vs].mz[a.target], up = dm0 && !dm0.down;
    entry.a = { z: a.zone, tg: a.target, vs, ci: m.c.id, at: atkOf(st, me, a.zone), ti: up ? dm0.c.id : null, tpos: dm0 ? dm0.pos : null, tv: up ? (dm0.pos === 'atk' ? atkOf(st, st.players[vs], a.target) : defOf(st, st.players[vs], a.target)) : null, hira: 1 };
    resolveCombat(st, { p, z: a.zone, target: a.target, vs });
  }
  /** Goku Ultra Instinto: Contraataque instintivo. Cuando un enemigo ataca a Goku Ultra Instinto o a un aliado, puede intervenir. */
  function uiCounter(st, p) {
    const a = st.atk, at = a && st.players[a.p].mz[a.z];
    if (!a || a.uiDone || !at || at.down || a.target === 'direct' || st.team[a.vs] === st.team[a.p] || !st.players[a.vs].mz[a.target]) return false;
    for (let i = 0; i < st.n; i++) {
      const q = (a.vs + i) % st.n, Q = st.players[q];
      if (!Q.alive || st.team[q] !== st.team[a.vs]) continue;
      for (let z = 0; z < ZONES; z++) {
        const m = Q.mz[z];
        if (!m || m.down || !has(st, m, 'uicont') || uOf(m).ucT === st.turn) continue;
        st.pending = { k: 'ability', ab: 'uicont', player: q, zy: z, stage: 'ask', uid: m.c.uid, nm: mdef(at).name, cont: { k: 'attack', by: p } };
        return true;
      }
    }
    return false;
  }
  /** Goku Ultra Instinto (Defensa instintiva): un Goku UI aliado de la víctima que aún no la usó este turno: { q, z } o null. */
  function uiGuard(st, victimP) {
    for (let i = 0; i < st.n; i++) {
      const q = (victimP + i) % st.n, Q = st.players[q];
      if (!Q.alive || st.team[q] !== st.team[victimP]) continue;
      for (let z = 0; z < ZONES; z++) {
        const m = Q.mz[z];
        if (m && !m.down && has(st, m, 'uidef') && uOf(m).udT !== st.turn) return { q, z };
      }
    }
    return null;
  }
  /** Galio (Protección heroica): un Galio aliado (no la propia víctima) con usos disponibles: { q, z } o null. */
  function galioGuard(st, victimP, vz) {
    for (let i = 0; i < st.n; i++) {
      const q = (victimP + i) % st.n, Q = st.players[q];
      if (!Q.alive || st.team[q] !== st.team[victimP]) continue;
      for (let z = 0; z < ZONES; z++) {
        const m = Q.mz[z];
        if (!m || m.down || !has(st, m, 'galprot') || (q === victimP && z === vz)) continue;
        const u = uOf(m), g = gx(Q, z);
        if ((u.gp || 0) >= 2 * g || (u.gpT === st.turn && (u.gpN || 0) >= g)) continue;
        return { q, z };
      }
    }
    return null;
  }
  function attackWindows(st, p) {
    {   // Escanor, ¿Quién decidió eso?: si lo desafía un enemigo con más ATK, duelo individual (sin habilidades, ayuda ni magias)
      const a = st.atk, at = a && st.players[a.p].mz[a.z], dm = a && a.target !== 'direct' ? st.players[a.vs].mz[a.target] : null;
      if (at && dm && !dm.down && st.team[a.vs] !== st.team[a.p] && has(st, dm, 'escduelo') && atkOf(st, st.players[a.p], a.z) > atkOf(st, st.players[a.vs], a.target)) {
        a.duel = true; a.meli = true; a.boomX = 1; a.shR = 1;
        log(st, a.vs, `${mdef(dm).name}: ¿Quién decidió eso? Acepta el desafío`);
        return continueAttack(st);
      }
    }
    {   const a = st.atk, at = a && st.players[a.p].mz[a.z];
      if (at && at.kzwater === st.turn && st.current === a.p) { a.meli = true; a.boomX = 1; a.shR = 1; return continueAttack(st); }      // Kakuzu, máscara de Agua: ni magias, trampas ni habilidades enemigas durante este ataque
    }
    if (uiCounter(st, p)) return;
    { const a2 = st.atk, at2 = a2 && st.players[a2.p].mz[a2.z]; if (at2 && at2.gv && st.current === a2.p) return continueAttack(st); }      // Cámara de Gravedad (Velocidad): las trampas enemigas no afectan sus ataques
    if (openWindow(st, 'attack', { k: 'attack', by: p })) return;
    continueAttack(st);
  }
  function continueAttack(st) {
    const a = st.atk; st.atk = null;
    st.cmb = a ? { p: a.p, z: a.z, target: a.target, vs: a.vs, turn: st.turn } : null;      // el combate sigue en curso (bonos de Warwick)
    if (!a || a.negated || st.winner !== null) { if (a) atkDone(st, a); return; }
    const at0 = st.players[a.p].mz[a.z];
    if (at0 && a.target !== 'direct' && st.team[a.vs] !== st.team[a.p] && conejosEvade(st, a.vs, a.target)) { galandHit(st, a, a.vs, a.target); atkDone(st, a); return; }      // Megumi evade el ataque
    if (at0 && a.target !== 'direct' && st.team[a.vs] !== st.team[a.p] && tobiEvade(st, a.vs, a.target)) { galandHit(st, a, a.vs, a.target); atkDone(st, a); return; }        // Tobi: Kamui
    if (!a.meli && at0 && st.team[a.vs] !== st.team[a.p] && !(st.current === a.p && (has(st, at0, 'yoriichi') || at0.kzwater === st.turn))) {      // Total Counter (Yoriichi es inmune a las habilidades enemigas en sus ataques)
      const mm = meliFor(st, a.p, a.vs);
      if (mm) { st.pending = { k: 'ability', ab: 'meliodas', kind: 'attack', player: mm.q, mz: mm.z, stage: 'ask', a, nm: mdef(at0).name }; return; }
    }
    if (!a.boomX && at0 && a.target !== 'direct') {      // Explosión del Creeper: la X del rival puede cancelarla antes del combate
      const dm0 = st.players[a.vs].mz[a.target];
      const cr = boomReady(st, at0) ? { p: a.p, z: a.z } : boomReady(st, dm0) ? { p: a.vs, z: a.target } : null;
      if (cr) { a.boomX = 1; if (nextWindow(st, 'power', { k: 'boom', by: cr.p, a, cr, uid: st.players[cr.p].mz[cr.z].c.uid, info: { boom: 1, txt: `${mdef(st.players[cr.p].mz[cr.z]).name} va a explotar al terminar el combate: los dos personajes serían desterrados.` } }, foes(st, cr.p))) return; }
    }
    if (a.strip && !a.stripped && at0 && a.target !== 'direct' && st.players[a.vs].mz[a.target]) { a.stripped = 1; stripBoosts(st, a.p, a.vs, a.target); }      // Anulación de aumentos
    if (!a.shR && at0 && a.target !== 'direct' && st.team[a.vs] !== st.team[a.p]) {        // Sung Jin-Woo: Intercambio de sombras / Igris: Caballero Protector
      const o = shadowOpts(st, a.vs, a.target, a.p);
      if (o.length) { a.shR = 1; st.pending = { k: 'ability', ab: 'shadowred', kind: 'attack', player: a.vs, stage: 'ask', a, opts: o, nm: mdef(st.players[a.vs].mz[a.target]).name }; return; }
    }
    const deaths = combatDeaths(st, a);
    if (!a.noBulma) for (const v of deaths) {                                                // Bulma: Inventora de emergencia
      if (st.team[v.p] === st.team[a.p]) continue;
      const b = bulmaFor(st, v);
      if (b) { st.pending = { k: 'ability', ab: 'bulma', player: b.q, zy: b.z, stage: 'ask', a, victim: v, nm: mdef(st.players[v.p].mz[v.z]).name }; return; }
    }
    if (!a.noShen) {
      for (const v of deaths) {
        if (st.team[v.p] === st.team[a.p]) continue;      // sólo cuenta el golpe ENEMIGO: si muere el propio atacante, Shen no interviene
        const q = shenOwner(st, v.p);
        if (q >= 0) {
          const pd = { k: 'ability', ab: 'shen', player: q, stage: 'ask', a, victim: v, nm: mdef(st.players[v.p].mz[v.z]).name };
          st.pending = pd; return;
        }
      }
    }
    if (!a.noRika) {
      for (const v of deaths) {
        if (v.p === a.p && v.z === a.z) continue;      // el propio atacante no es el «objetivo» del ataque: Rika no lo protege
        const r = rikaGuard(st, v.p);
        if (r) { st.pending = { k: 'ability', ab: 'rika', kind: 'attack', player: r.q, zy: r.z, stage: 'ask', a, victim: v, nm: mdef(st.players[v.p].mz[v.z]).name }; return; }
      }
    }
    if (!a.noGalio) {
      for (const v of deaths) {
        if (v.p === a.p && v.z === a.z) continue;
        if (st.team[v.p] === st.team[a.p]) continue;
        const r = galioGuard(st, v.p, v.z);
        if (r) { st.pending = { k: 'ability', ab: 'galio', player: r.q, zy: r.z, stage: 'ask', a, victim: v, nm: mdef(st.players[v.p].mz[v.z]).name }; return; }
      }
    }
    if (!a.kmX) {                                                                              // trampa Kamui: el aliado que iba a morir sale del campo
      a.kmX = 1;
      for (const v of deaths) {
        if (st.team[v.p] === st.team[a.p]) continue;
        const vm = st.players[v.p].mz[v.z], list = [];
        for (let i = 0; i < st.n; i++) { const q = (v.p + i) % st.n; if (st.players[q].alive && st.team[q] === st.team[v.p]) list.push(q); }
        if (vm && nextWindow(st, 'destroy', { k: 'kcombat', by: a.p, a, vic: v, kOnly: 1, info: { src: a.p, vp: v.p, txt: `El ataque de ${mdef(at0).name} va a destruir a ${vm.down ? 'un personaje boca abajo' : mdef(vm).name}` } }, list)) return;
      }
    }
    resolveCombat(st, a);
    if (a.extra) for (const ex of a.extra) {      // Puño del Dragón: el mismo ataque atraviesa y golpea las demás casillas elegidas
      if (st.winner !== null || st.players[a.p].mz[a.z] !== at0) break;
      const T = st.players[ex.vs];
      if (!T || !T.alive || !T.mz[ex.z]) continue;
      if (conejosEvade(st, ex.vs, ex.z)) continue;
      log(st, a.p, `${mdef(at0).name} atraviesa y golpea la casilla ${ex.z + 1}${multi(st) ? ' de ' + (T.name || 'un rival') : ''}`);
      if (multi(st)) st.log[st.log.length - 1].q = ex.vs;
      resolveCombat(st, { p: a.p, z: a.z, target: ex.z, vs: ex.vs });
    }
    atkDone(st, a);
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
      if (at.c.id === 'c_kayn' && at.kn && !at.kn.sh && dmg > 0) { at.kn.sh = true; log(st, a.p, 'Kayn desbloquea la transformación en Asesino Sombra'); }
      return;
    }
    const dm = op.mz[a.target];
    if (!dm) return;
    if (at.prey && !at.fly && at.prey.vs === vs && at.prey.uid === dm.c.uid) {      // Rengar: su primer ataque contra la presa ignora sus bonificaciones
      st.ign = [dm]; at.prey = null;
      log(st, a.p, `${mdef(at).name} cae sobre su presa: ignora todas las bonificaciones de ${mdef(dm).name} en este ataque`);
    }
    if (at.gpow && !st.ign) st.ign = [dm];
    if (a.duel) { st.ign = [at, dm]; log(st, -1, `Duelo individual: ${mdef(at).name} y ${mdef(dm).name} combaten sin ayuda de habilidades, aliados ni magias`); }
    try { resolveCombat2(st, a, me, op, at, dm, vs); } finally { st.ign = null; }
  }
  function resolveCombat2(st, a, me, op, at, dm, vs) {
    const ad = mdef(at), atker = { p: a.p, uid: at.c.uid };
    const dd = mdef(dm), defender = { p: vs, uid: dm.c.uid };
    if (dm.down) { dm.down = false; log(st, vs, `se revela: ${dd.name}`); st.log[st.log.length - 1].rv = { vs, z: a.target, ti: dm.c.id, tpos: dm.pos }; }   // lo que se ve en el aviso «versus»
    let A = atkOf(st, me, a.z);
    // Espada del Rey Arruinado: +500 ATK al atacante y -500 DEF al objetivo sólo durante este combate
    const sword = me.st.some(s => s && !s.down && s.equipTo === a.z && def(s.c).sword);
    const swordN = sword ? me.st.filter(s => s && !s.down && s.equipTo === a.z && def(s.c).sword).reduce((n, s) => n + def(s.c).sword, 0) : 0;
    if (swordN) { A += swordN; log(st, a.p, `${ad.name}: la espada roba ${swordN} de DEF y suma ${swordN} de ATK`); }
    // Explosión del Creeper: si él (o su rival) tiene la habilidad lista, el daño se calcula igual que siempre
    // y después los dos monstruos son desterrados (no importa quién ganara el combate)
    const boom = boomReady(st, at) || boomReady(st, dm);
    const boomName = boomReady(st, at) ? ad.name : dd.name;
    const shd = shieldInfo(st, op, a.target), shielded = !!shd;
    const kill = (pl, z, nm, by, defn) => { if (!boom) { if (destroyMonster(st, pl, z, { src: 'combat', by, defn })) log(st, -1, `${nm} es destruido`); } };
    // Escudo Blue Evolution activo: el combate se resuelve sólo contra el escudo. El ATK/DEF de Vegeta no cuentan,
    // nadie sufre daño de diferencia y lo que sobre no pasa a Vegeta.
    if (shielded) { /* se resuelve más abajo */ }
    else if (dm.pos === 'atk') {
      const B = atkOf(st, op, a.target);
      if (A > B) { if (!shielded) { kill(vs, a.target, dd.name, atker, true); lose(st, vs, A - B); } }
      else if (A === B) { if (!boom) { destroyMonster(st, a.p, a.z, { src: 'combat', by: defender }); if (!shielded) destroyMonster(st, vs, a.target, { src: 'combat', by: atker, defn: true }); log(st, -1, shielded ? `${ad.name} es destruido` : 'Los dos monstruos son destruidos'); } }
      else { kill(a.p, a.z, ad.name, defender); lose(st, a.p, B - A); }
    } else {
      const B = Math.max(0, defOf(st, op, a.target) - swordN);
      if (A > B) {
        const T = atkOf(st, op, a.target), tres = has(st, dm, 'resis');       // Titán de Ataque en defensa: aunque sobreviva, su dueño pierde la diferencia de ATK
        if (!shielded) kill(vs, a.target, dd.name, atker, true);
        if (!shielded && !boom && op.mz[a.target] === dm && tres && A > T) { log(st, vs, `${dd.name} resiste el golpe, pero su dueño pierde ${A - T} PV por la diferencia de ATK`); lose(st, vs, A - T); }
      }
      else if (A < B) { lose(st, a.p, B - A); log(st, -1, 'El ataque rebota'); }
      else log(st, -1, 'Nadie sufre daño');
    }
    if (shielded && op.mz[a.target] === dm) {
      const left = Math.max(0, shd.cur - A);
      shd.set(left);
      log(st, vs, left > 0 ? `El escudo de ${dd.name} recibe ${A} de daño (${left}/${shd.max})` : `El escudo de ${dd.name} se destruye`);
      if (!left) shieldBroken(st, vs, a.target, shd);
    }
    if (boom) {
      const names = [];
      if (me.mz[a.z] === at) { at.c.spent = at.c.spent || has(st, at, 'boom'); if (banishMonster(st, a.p, a.z)) names.push(ad.name); }
      if (op.mz[a.target] === dm) { dm.c.spent = dm.c.spent || has(st, dm, 'boom'); if (banishMonster(st, vs, a.target)) names.push(dd.name); }
      if (names.length) log(st, -1, `¡${boomName} explota! ${names.join(' y ')} ${names.length > 1 ? 'son desterrados' : 'es desterrado'}`);
      else log(st, -1, `¡${boomName} explota! Nadie es desterrado`);
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
    for (const s of P.mz) if (s) { s.atkMod = 0; if (s.sed) { dropMods(s, 'sed'); s.sed = null; } dropMods(s, 'lobos'); }
    for (const s of P.mz) {                                      // Kaioken x10: al terminar el turno se pierden los bonos y llega el agotamiento
      if (!s) continue;
      if (s.ksp && s.ksp.x === st.turn) { dropMods(s, 'kaiospell'); dropMods(s, 'kaiox10'); s.ksp = null; s.exh = { t: st.turn }; log(st, st.current, `${mdef(s).name} queda agotado: 0 ATK y 0 DEF hasta el final de su siguiente turno`); }
      else if (s.exh && s.exh.t !== st.turn) { s.exh = null; log(st, st.current, `${mdef(s).name} se recupera del agotamiento`); }
    }
    for (const s of P.mz) if (s && !s.down && s.owner != null && s.owner !== st.current && rawAbil(s).includes('invasion')) {      // Reina Flama: quema a quien la controla
      log(st, st.current, `${mdef(s).name} le quema 500 PV a su controlador`);
      lose(st, st.current, 500);
      if (st.winner !== null) return;
    }
    for (const s of P.mz) if (s && s.canal && s.canal.t === st.turn && !s.canal.ready) { s.canal.ready = true; log(st, st.current, `${mdef(s).name} completa su canalización: la Supernova estará lista en su próximo turno`); }
    for (const s of P.mz) if (s && !s.down && s.summonedTurn !== st.turn && rawAbil(s).includes('dexter')) {            // Dexter: cada turno propio completo prepara la máquina del tiempo
      s.dex = (s.dex || 0) + 1;
      log(st, st.current, `${mdef(s).name} prepara su máquina del tiempo (${Math.min(s.dex, 2)}/2)`);
    }
    for (const s of P.mz) if (s && !s.down && s.summonedTurn !== st.turn && rawAbil(s).includes('tonyarm')) {            // Tony Stark: cada turno propio completo en el campo da un material
      const tn = s.tony || (s.tony = { mat: 0, arm: 0, t: -1 });
      tn.mat++;
      log(st, st.current, `${mdef(s).name} reúne materiales para su armadura (${tn.mat})`);
    }
    for (let z = 0; z < ZONES; z++) if (P.mz[z] && isInk(P.mz[z])) removeMonster(st, st.current, z, 'ink');      // las criaturas de tinta desaparecen
    for (const s of P.mz) {                                                    // restricciones que duraban este turno del controlador
      if (!s) continue;
      if (s.binds && s.binds.length) {
        s.binds = s.binds.filter(b => { if (st.turn > b.t0) b.n--; if (b.n <= 0) { log(st, st.current, `${mdef(s).name} se libera de ${b.nm}`); return false; } return true; });
        if (!s.binds.length) delete s.binds;
      }
      if (s.tobiNA && st.turn > s.tobiNA.t) delete s.tobiNA;
    }
    limboTick(st, 'end');
    st.current = nextAlive(st, st.current);
    startTurn(st);
  }
  /** Al empezar un turno: fin del dominio de Sukuna y cuenta atrás de Karma. */
  function timers(st) {
    if (st.domain && elapsed(st, st.domain.t0) >= 2) { log(st, -1, `El dominio ${st.domain.nm || 'de Sukuna'} termina`); st.domain = null; }
    for (const m of st.players[st.current].mz) if (m && !m.down && rawAbil(m).includes('regenn') && m.mods && m.mods.some(x => (x.atk < 0 || x.def < 0) && x.t0 !== st.turn)) {
      m.mods = m.mods.filter(x => !((x.atk < 0 || x.def < 0) && x.t0 !== st.turn));
      log(st, st.current, `${mdef(m).name} se regenera (Regeneración Namekusein): vuelve a su estado normal`);
    }
    { const cp = st.players[st.current];      // Gogeta: Brillo explota en el turno del controlador
      for (let z = 0; z < ZONES; z++) {
        const bm = cp.mz[z];
        if (!bm || !bm.bri || bm.bri.t0 === st.turn) continue;
        const by = bm.bri.by, bn = mdef(bm).name;
        bm.bri = null;
        log(st, by, `¡El Brillo explota dentro de ${bn}!`);
        for (const zz of [z - 1, z, z + 1]) if (zz >= 0 && zz < ZONES && cp.mz[zz]) destroyMonster(st, st.current, zz, { src: 'power', bp: by });
      } }
    for (const gm of st.players[st.current].mz) {      // Cámara de Gravedad / Sala del Espíritu
      if (gm && gm.gr && gm.gr.t0 !== st.turn && gm.gr.n < 2) { gm.gr.n++; log(st, st.current, `${mdef(gm).name}: contador de entrenamiento ${gm.gr.n}/2`); }
      if (gm && gm.gr && gm.gr.n >= 2) st.trig.push({ k: 'gravrew', p: st.current, uid: gm.c.uid });
      if (gm && gm.sdom && gm.sdom.t0 !== st.turn) { gm.sdomOn = st.turn; gm.sdom = null; }
    }
    for (const fm of st.players[st.current].mz) if (fm && fm.fly) { fm.fly = null; delete fm.fly; }      // la protección de Kaisel / el escondite de Rengar termina al empezar el turno de su controlador
    expireMods(st);
    limboTick(st, 'start');
    for (const s of st.players[st.current].mz) {                               // Mr. Satan: El gran salvador
      if (!s || s.down || s.satanH || !has(st, s, 'satansalv') || elapsed(st, s.summonedTurn) < 3) continue;
      s.satanH = true; heal(st, st.current, 500);
      log(st, st.current, `El gran salvador: el público aclama a ${mdef(s).name} y su jugador recupera 500 PV`);
    }
    for (const Q of st.players) for (let i = 0; i < ZONES; i++) { const s = Q.st[i]; if (s && s.alma && elapsed(st, s.alma.t0) >= 5) { Q.st[i] = null; Q.grave.push(s.c); log(st, -1, 'La Gema del Alma se agota y va al cementerio'); } }
    prisons(st);
    corruptions(st);
    for (let p = 0; p < st.n; p++) {
      const P = st.players[p];
      if (!P.alive) continue;
      if (p === st.current) for (let z = 0; z < ZONES; z++) {      // Simbiosis: con un anfitrión que no es de Marvel dura 2 turnos
        const hm = P.mz[z];
        if (hm && hm.sym && symLeft(st, hm) === 0) venomSeparate(st, p, z);
      }
      if (p === st.current) for (let z = 0; z < ZONES; z++) {      // Carnage: Regeneración simbionte (los efectos negativos se quitan 1 turno después; lo que destruye no se puede evitar)
        const rm = P.mz[z];
        if (!rm || rm.down || !rawAbil(rm).includes('regsim')) continue;
        if (rm.rg != null && rm.rg !== st.turn) { rm.rg = null; const got = seedList(st, p, z, true, true); if (got.length) log(st, p, `Regeneración simbionte: ${mdef(rm).name} se regenera y vuelve a la normalidad (${got.join(', ')})`); }
        else if (rm.rg == null && seedList(st, p, z, false, true).length) { rm.rg = st.turn; log(st, p, `${mdef(rm).name} empieza a regenerarse`); }
      }
      if (p === st.current) for (let z = 0; z < ZONES; z++) {      // Death Note: la sentencia se cumple durante el turno de su dueño
        const dm = P.mz[z];
        if (!dm || !dm.dn) continue;
        const by = dm.dn.by; dm.dn = null;
        log(st, p, `${dm.down ? 'Un personaje boca abajo' : mdef(dm).name} muere: la Death Note se cumple`);
        destroyMonster(st, p, z, { src: 'spell', bp: by });
      }
      for (let i = 0; i < ZONES; i++) {      // Anillo Único: el portador sucumbe a la corrupción
        const s = P.st[i];
        if (!s || !s.ring || s.ring.sauron || elapsed(st, s.ring.t0) < s.ring.n || s.equipTo == null) continue;
        const bm = P.mz[s.equipTo];
        if (!bm) continue;
        log(st, p, `${mdef(bm).name} sucumbe a la corrupción del Anillo Único`);
        removeMonster(st, p, s.equipTo, 'grave');
        if (P.st[i] === s) { P.st[i] = null; P.grave.push(s.c); }
      }
      for (let i = 0; i < ZONES; i++) {
        const s = P.st[i];
        if (!s || !s.karma || s.karma.phase !== 'foe' || elapsed(st, s.karma.t0) < 3 || st.domain) continue;
        const kz = s.karma;
        const foe = slotByUid(st, kz.foeP, kz.foeUid);
        P.st[i] = null; P.grave.push(s.c);
        log(st, p, 'Karma se cumple');
        if (foe) { log(st, kz.foeP, `${mdef(foe.m).name} muere por Karma`); destroyMonster(st, foe.p, foe.z, { src: 'spell', bp: p }); }
        const AP = st.players[kz.allyOwner != null ? kz.allyOwner : p], inst = AP.grave.find(c => c.uid === kz.allyUid);
        if (inst && AP.alive) { if (reviveInst(st, kz.allyOwner != null ? kz.allyOwner : p, inst) < 0) log(st, p, 'No hay espacio para revivir al aliado'); }
      }
    }
  }
  const MODNAME = { kaiospell: 'el Kaioken', kurama: 'el Chakra de Kurama', kaioken: 'Kaio-ken', conc: 'la Respiración de Concentración Total', marca: 'la Marca de Cazador', kk6: 'Kaio-ken' };
  /** Fin de los efectos con duración: modificadores, Seis Ojos y fusión de Pothala. */
  function expireMods(st) {
    for (let p = 0; p < st.n; p++) {
      const P = st.players[p];
      for (let z = 0; z < ZONES; z++) {
        const m = P.mz[z];
        if (!m) continue;
        if (m.mods && m.mods.length) {
          const gone = m.mods.filter(x => x.n && elapsed(st, x.t0) >= x.n);
          if (gone.length) {
            m.mods = m.mods.filter(x => !gone.includes(x));
            let died = false;
            for (const x of gone) {
              if (x.die) { log(st, p, `${mdef(m).name} muere: la Marca de Cazador se cumple`); removeMonster(st, p, z, 'grave'); died = true; break; }
              log(st, p, `${mdef(m).name} pierde ${MODNAME[x.k] || x.k}`);
            }
            if (died) continue;
          }
        }
        const m2 = P.mz[z];
        if (m2 && m2.six && elapsed(st, m2.six.t0) >= SIX_TURNS) endSix(st, p, z);
        if (m2 && m2.fused && elapsed(st, m2.fused.t0) >= 2) unfuse(st, p, z);
      }
    }
  }
  function endSix(st, p, z) {
    const P = st.players[p], m = P.mz[z];
    m.six = null;
    log(st, p, `Los Seis Ojos de ${mdef(m).name} se apagan`);
    P.st.forEach((s, i) => { if (s && s.guerrero && s.equipTo === z) { P.st[i] = null; P.grave.push(s.c); } });
  }
  /** Pothala termina: los dos personajes vuelven a sus zonas. */
  function unfuse(st, p, z) {
    const P = st.players[p], m = P.mz[z], f = m.fused, zb = f.zb;
    m.fused = null;
    const bu = new Set([f.b.c.uid].concat((f.b.link || []).map(c => c.uid)));
    m.link = (m.link || []).filter(c => !bu.has(c.uid));
    if (!m.link.length) delete m.link;
    P.sealed = (P.sealed || []).filter(x => x !== zb);
    P.mz[zb] = f.b;
    log(st, p, `La fusión termina: ${mdef(m).name} y ${mdef(f.b).name} se separan`);
  }
  /** Gokumonkyo: a los 5 turnos el personaje vuelve a su zona (si no hay sitio espera) y la carta va al cementerio. */
  function prisons(st) {
    for (let p = 0; p < st.n; p++) {
      const P = st.players[p];
      for (let i = 0; i < ZONES; i++) {
        const s = P.st[i];
        if (!s || !s.prison || elapsed(st, s.prison.t0) < 5) continue;
        const pr = s.prison, O = st.players[pr.owner], pm = pr.m, nm = mdef(pm).name;
        const z = O.alive ? spot(O, mdef(pm)) : -1;
        if (z < 0) { if (O.alive) pr.wait = true; continue; }
        O.mz[z] = pm;
        for (const q of O.st) if (q && q.held === pm.c.uid) { q.equipTo = z; delete q.held; }
        P.st[i] = null; P.grave.push(s.c);
        log(st, pr.owner, `${nm} sale de Gokumonkyo y vuelve al campo`);
      }
    }
  }
  /** Sauron: el personaje elegido pasa a su campo cuando llega el siguiente turno de su controlador. */
  function corruptions(st) {
    if (!st.corrupt || !st.corrupt.length) return;
    const keep = [];
    for (const c of st.corrupt) {
      if (st.current !== c.holder || st.turn <= c.t0) { keep.push(c); continue; }
      const v = slotByUid(st, c.from, c.uid), H = st.players[c.holder];
      if (v) delete v.m.promesa;
      if (!v || !H.alive) { log(st, c.holder, 'La corrupción se cancela: el objetivo ya no está'); continue; }
      const nm = mdef(v.m).name, nz = spot(H, mdef(v.m));
      if (nz < 0) { log(st, c.holder, `La corrupción de ${nm} se cancela: no hay espacio en su campo`); continue; }
      const m = takeOff(st, c.from, v.z, 'steal');
      if (m.owner == null) m.owner = c.from;
      m.attacked = true; m.atkN = 9;
      H.mz[nz] = m;
      log(st, c.holder, `${nm} es corrompido y pasa a servir a ${st.players[c.holder] ? 'su nuevo dueño' : ''}`);
      st.log[st.log.length - 1].q = c.from;
    }
    st.corrupt = keep;
  }
  /** Deja limpios los vínculos que se rompieron (objetivo de la Gema o de Karma fuera del campo, dominio sin Sukuna). */
  function sweep(st) {
    for (const P of st.players) for (const k of ['grave', 'banish', 'hand', 'deck']) if (P[k] && P[k].some(c => c && c.virt)) P[k] = P[k].filter(c => !(c && c.virt));      // efecto liberado por la Gema del Alma
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
    for (let p = 0; p < st.n; p++) {                    // Guantelete: sin gema robada equipada, el portador recupera su poder y sus habilidades
      const P = st.players[p];
      P.mz.forEach(m => { if (m && m.price && !P.st.some(s => s && s.stolen && s.equipTo != null && P.mz[s.equipTo] === m)) { m.price = false; log(st, p, `${mdef(m).name} recupera su poder y sus habilidades`); } });
    }
    for (let p = 0; p < st.n; p++) for (const m of st.players[p].mz) {       // Telarañas: si Spider-Man se va, se liberan las habilidades
      if (m && m.sealed && m.sealed.length) { m.sealed = m.sealed.filter(x => findByUid(st, x.by)); if (!m.sealed.length) delete m.sealed; }
    }
  }
  /** Primer turno (de la partida) en que se puede atacar: siempre tras la primera ronda completa (en un duelo, tras el turno 2). */
  const canAttackNow = st => st.turn > st.n;
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
  const turnsOn = (st, m) => elapsed(st, Math.max(m.summonedTurn, m.since || 0));
  /** Cartas de la mano a las que puede transformarse este monstruo (índices) y turnos que debe esperar. */
  function xformCands(st, p, z) {
    const P = st.players[p], m = P.mz[z], d = mdef(m), out = [];
    if (m.copy || !d.xform) return out;
    P.hand.forEach((c, i) => {
      const t = def(c);
      if (t.kind !== 'monster' || c.id === m.c.id) return;
      let wait = -1;
      if (d.xform.to) { if (c.id === d.xform.to) wait = d.xform.wait; }
      else if (d.xform.family && (t.fam === d.xform.family || t.name.startsWith(d.xform.family))) wait = Math.ceil(Math.abs(t.level - d.level) / 2);
      if (wait < 0 || turnsOn(st, m) < wait) return;
      if (t.xfromLv && !(d.level === t.xfromLv && d.fam === t.fam)) return;      // Majin Vegeta: sólo desde un Vegeta de 4★
      if (spot(P, t, [z]) < 0 && !(t.wide && titanAnchor(P, z, [z], t.huge) >= 0)) return;
      out.push(i);
    });
    return out;
  }
  // ---------------- elegir objetivos ----------------
  /** ¿Puede un efecto del jugador byP elegir como objetivo al monstruo (q, z)? Los Seis Ojos no se pueden elegir; Spider-Man no, si lo elige un rival. */
  function canTarget(st, byP, q, z, o) {
    const m = st.players[q].mz[z];
    if (!m || isInk(m)) return false;      // las bestias de tinta de Sai no se eligen con nada (no son cartas: no se absorben, roban ni encierran)
    if (m.six && !(o && o.ignoreSix)) return false;
    if (st.team[byP] !== st.team[q] && has(st, m, 'sentido')) return false;
    if (m.god && st.team[byP] !== st.team[m.god.p]) return false;      // Poder de Dios: sólo interactúa el equipo de Vegeta Dios
    if ((abMode || (o && o.ab)) && abImmune(st, byP, q, m, o)) return false;
    if ((abMode || (o && o.ab)) && m.pub != null && st.team[byP] !== st.team[q]) return false;      // Mr. Satan: Publicidad engañosa
    return true;
  }
  /** Personajes enemigos (de los rivales de p) que p puede elegir: [{vs, z}]. */
  function foeChars(st, p, o) {
    const out = [];
    for (const e of foes(st, p)) for (const z of zonesWith(st.players[e].mz)) if (canTarget(st, p, e, z, o)) out.push({ vs: e, z });
    return out;
  }
  /** Personajes aliados (mismo equipo, también el propio): [{vs, z}]. */
  function allyChars(st, p) {
    const out = [];
    for (let q = 0; q < st.n; q++) if (st.players[q].alive && st.team[q] === st.team[p]) for (const z of zonesWith(st.players[q].mz)) out.push({ vs: q, z });
    return out;
  }
  /** Cartas de magia/trampa de los rivales que se pueden destruir (Gokumonkyo es indestructible). */
  function foeSTs(st, p) {
    const out = [];
    for (const e of foes(st, p)) for (const z of zonesWith(st.players[e].st)) if (!st.players[e].st[z].prison) out.push({ vs: e, z });
    return out;
  }
  const ringOf = (P, z) => P.st.find(s => s && !s.down && s.equipTo === z && s.ring);
  /** Habilidades activables de los personajes boca arriba del campo (aliados o enemigos) que Yuta puede usar dentro de su dominio. */
  function borrowable(st, y, have) {
    const out = [];
    for (const Q of st.players) {
      if (!Q.alive) continue;
      for (const m of Q.mz) {
        if (!m || m.down || m === y) continue;
        for (const x of rawAbil(m)) if (POWER_IDS.includes(x) && !have.includes(x) && !out.includes(x) && !(m.sealed || []).some(q => q.ab === x)) out.push(x);
      }
    }
    return out;
  }
  /** ¿Puede m atacar al personaje (e, tz)? Seis Ojos, Capa, Poder de Dios, criaturas de tinta, Mr. Satan y Tobi. */
  function atkOk(st, m, e, tz) {
    const tm = st.players[e].mz[tz];
    if (!tm || tm.six || cloakOn(st.players[e], tz) || isInk(tm)) return false;
    if (tm.god && st.team[st.players.findIndex(Q => Q.mz.includes(m))] !== st.team[tm.god.p]) return false;
    if (!tm.down && has(st, tm, 'satancamp') && lvl(m) >= 7) return false;                // Mr. Satan: ¡Soy el campeón mundial!
    if (m.tobiNA && m.tobiNA.uid === tm.c.uid) return false;                               // Tobi: Maestro de la manipulación
    if (tm.fly) return false;                                                              // Kaisel (Vuelo Dracónico) / Rengar (Emoción de la Cacería): no se puede elegir como objetivo de ataques
    return true;
  }
  /** El atacante de la casilla z puede quitar aumentos (familia Asta o Espada Destructora de Demonios). */
  const canStrip = (st, P, z) => { const m = P.mz[z]; return !!m && (has(st, m, 'astastrip') || eqWith(st, P, z, 'demonios').length > 0); };
  /** El personaje (e, tz) tiene algún aumento que se le pueda quitar. */
  function boosted(st, e, tz) {
    const E = st.players[e], m = E.mz[tz];
    if (!m || m.down) return false;
    if ((m.mods || []).some(x => x.atk > 0 || x.def > 0) || (m.atkMod || 0) > 0 || (m.bonus && (m.bonus.atk > 0 || m.bonus.def > 0))) return true;
    return equipBonus(E, tz, 'eAtk', st) > 0 || equipBonus(E, tz, 'eDef', st) > 0;
  }
  /** Anulación de aumentos: quita los aumentos de ATK/DEF de cartas, habilidades y efectos (no las reducciones ni la base); no vuelven. */
  function stripBoosts(st, p, e, tz) {
    const E = st.players[e], m = E.mz[tz];
    if (!m) return;
    const nm = mdef(m).name;
    m.mods = (m.mods || []).map(x => Object.assign({}, x, { atk: Math.min(0, x.atk || 0), def: Math.min(0, x.def || 0) })).filter(x => x.atk < 0 || x.def < 0);
    if (!m.mods.length) delete m.mods;
    if ((m.atkMod || 0) > 0) m.atkMod = 0;
    if (m.bonus) m.bonus = { atk: Math.min(0, m.bonus.atk), def: Math.min(0, m.bonus.def) };
    for (const s of E.st) if (s && !s.down && s.equipTo === tz && def(s.c).kind === 'spell') m.stripEq = (m.stripEq || []).concat([s.c.uid]);
    log(st, p, `Anulación de aumentos: ${nm} pierde todos sus aumentos de ATK y DEF`);
  }
  /** Rika Orimoto sin Yuta ni Anillo: ataques que debe hacer (a cualquier personaje del campo, o directo si no hay ninguno). [] = no está obligada. */
  function rikaOptions(st, p, z) {
    const P = st.players[p], mu = multi(st), out = [];
    let chars = 0;
    for (let q = 0; q < st.n; q++) {
      if (!st.players[q].alive) continue;
      for (const tz of zonesWith(st.players[q].mz)) {
        if ((q === p && tz === z) || st.players[q].mz[tz].six) continue;
        chars++;
        const foe = st.team[q] !== st.team[p];
        out.push(foe && !mu ? { t: 'attack', zone: z, target: tz } : { t: 'attack', zone: z, vs: q, target: tz });
      }
    }
    if (chars) return out;
    for (const e of foes(st, p)) if (!zonesWith(st.players[e].mz).length) out.push(mu ? { t: 'attack', zone: z, vs: e, target: 'direct' } : { t: 'attack', zone: z, target: 'direct' });
    return out;
  }
  /** Zonas de Rika que deben atacar este turno (Maldición Incontrolable). */
  function forcedRika(st, p) {
    const P = st.players[p], out = [];
    if (st.current !== p || st.pending || !canAttackNow(st) || rikaState(st).happy) return out;
    P.mz.forEach((m, z) => { if (m && !m.down && has(st, m, 'rikamal') && canAttackSlot(st, m) && rikaOptions(st, p, z).length) out.push(z); });
    return out;
  }
  /** Poderes de los monstruos del jugador: [{ t:'power', zone, pw, ... }]. */
  function powerActs(st, p) {
    abMode = true;
    try { return powerActs0(st, p); } finally { abMode = false; }
  }
  function powerActs0(st, p) {
    const P = st.players[p], out = [], fl = foes(st, p);
    if (antiAbs(st, p)) return out;                       // Asta Unión Demoníaca: Anti-Magia Absoluta
    P.mz.forEach((m, z) => {
      if (!m || m.down || m.god || m.snake) return;      // atrapado por Vegeta Dios o inmovilizado por la Serpiente: no usa habilidades
      if (blocked(m, 'ab')) return;                       // Posesión de sombras / petrificado por Galand
      let ab = abil(st, m);
      const u = uOf(m), g = gx(P, z);
      if (isYuta(m) && st.domain && st.domain.uid === m.c.uid) ab = ab.concat(borrowable(st, m, ab));      // Amor Mutuo y Verdadero: las habilidades de los personajes boca arriba
      if (st.domain && !m.price && domainOk(st, m)) for (const x of rawAbil(m)) if (DOM_AB.includes(x) && !ab.includes(x) && !(m.sealed || []).some(q => q.ab === x) && !(m.spentAb || []).includes(x)) ab = ab.concat(x);      // abrir un dominio que gana el choque no lo apaga el dominio activo
      const push = o => out.push(Object.assign({ t: 'power', zone: z }, o));
      if (ab.includes('yutadom') && !u.ydom && domainOk(st, m)) push({ pw: 'ydominio' });      // una sola vez por invocación de Yuta (también con la Gema)
      if (ab.includes('canon') && !u.canon && canAttackNow(st)) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= 7 && canTarget(st, p, e, tz)) push({ pw: 'canon', target: { vs: e, z: tz } }); }
      if ((ab.includes('absorb') || ab.includes('absorbp')) && canOnce(P, z, u, 'absorb') && !m.abs) {      // con la Gema se podría absorber otra vez: sólo si ya liberó lo absorbido
        for (let q = 0; q < st.n; q++) for (const tz of zonesWith(st.players[q].mz)) {
          const tm = st.players[q].mz[tz];
          if ((q === p && tz === z) || tm.down || !st.players[q].alive || lvl(tm) > lvl(m) || !canTarget(st, p, q, tz) || shadowSafe(st, p, q, tz)) continue;
          push({ pw: 'absorb', target: { vs: q, z: tz } });
        }
      }
      if (ab.includes('furia') && u.kills > 0 && canOnce(P, z, u, 'furia')) push({ pw: 'furia' });
      if (ab.includes('bigbang') && canOnce(P, z, u, 'bb')) push({ pw: 'bigbang' });
      if (ab.includes('relicario') && canOnce(P, z, u, 'relic') && domainOk(st, m)) push({ pw: 'relicario' });
      if (ab.includes('desmantelar') && canOnce(P, z, u, 'desm')) for (const t of foeSTs(st, p)) push({ pw: 'desmantelar', target: t });
      if (ab.includes('dexter') && (m.dex || 0) >= 2 && P.grave.some(c => def(c).kind === 'monster' && spot(P, def(c)) >= 0)) push({ pw: 'maquina' });
      if (ab.includes('dios') && canOnce(P, z, u, 'dios')) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.god && !rawAbil(tm).includes('vimm') && canTarget(st, p, e, tz)) push({ pw: 'dios', target: { vs: e, z: tz } }); }
      if (ab.includes('chidori') && u.chiT !== st.turn && !(m.mods || []).some(x => x.k === 'chi') && canAttackSlot(st, m)) push({ pw: 'chidori' });
      if (m.c.id === 'c_cell' && m.abs && [5, 6].includes(lvl({ c: m.abs.c })) && !m.copy) P.hand.forEach((c, i) => { if (c.id === 'c_cell_perfecto') push({ pw: 'cellperf', hand: i }); });
      if (ab.includes('avada') && u.avT !== st.turn) for (let q = 0; q < st.n; q++) for (const tz of zonesWith(st.players[q].mz)) { if (q === p && tz === z) continue; if (st.players[q].alive && canTarget(st, p, q, tz)) push({ pw: 'avada', target: { vs: q, z: tz } }); }
      if (ab.includes('cazador') && m.c.id === 'c_dante' && (u.dk || 0) >= 3) P.hand.forEach((c, i) => { if (c.id === 'c_dante_dt') push({ pw: 'dtrig', hand: i }); });
      if (ab.includes('brillo') && !u.bri && !m.fused) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= 11 && !tm.bri && canTarget(st, p, e, tz)) push({ pw: 'brillo', target: { vs: e, z: tz } }); }
      if (ab.includes('canal') && !m.canal && !m.attacked && m.pos === 'atk') push({ pw: 'canal' });                                  // Freezer: canalización de un turno completo
      if (ab.includes('canal') && m.canal && m.canal.ready && m.canal.t !== st.turn) push({ pw: 'supernova' });
      if (ab.includes('cuerno') && canOnce(P, z, u, 'cuer')) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= 4 && canTarget(st, p, e, tz)) push({ pw: 'cuerno', target: { vs: e, z: tz } }); }
      if (ab.includes('agujero') && u.agT !== st.turn) for (const t of foeSTs(st, p)) push({ pw: 'agujero', target: t });      // Bugs Bunny: una vez por turno, aunque la carta esté boca abajo
      if (ab.includes('bigbang1') && canOnce(P, z, u, 'bb1')) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= lvl(m) && canTarget(st, p, e, tz)) push({ pw: 'bigbang1', target: { vs: e, z: tz } }); }
      if (ab.includes('bite') && !m.copy && canOnce(P, z, u, 'bite') && P.lp > 500) {
        P.hand.forEach((c, i) => { if (c.id === 'c_titan' && titanAnchor(P, z, [z]) >= 0) push({ pw: 'bite', hand: i }); });
      }
      for (const i of xformCands(st, p, z)) push({ pw: 'xform', hand: i });
      if (!st.domain || lvl(m) >= (st.domain.min || 10)) {
        // Shang Tsung: una vez por turno puede transformarse en un personaje que esté ahora en el campo (boca arriba)
        const cd = def(m.c);
        if (cd.ab && cd.ab.includes('copy') && !m.noCopy && m.copyTurn !== st.turn) {
          for (let q = 0; q < st.n; q++) {
            if (!st.players[q].alive) continue;
            for (const tz of zonesWith(st.players[q].mz)) {
              const tm = st.players[q].mz[tz];
              if ((q === p && tz === z) || tm.down || mdef(tm).wide || eid(tm) === m.c.id || eid(tm) === m.copy || !canTarget(st, p, q, tz)) continue;
              push({ pw: 'copy', target: { vs: q, z: tz } });
            }
          }
        }
      }
      // ----- tanda 2 -----
      if (ab.includes('zenitsu2') && canOnce(P, z, u, 'conc')) push({ pw: 'conc' });
      if (ab.includes('gyomei2') && canOnce(P, z, u, 'conc2')) push({ pw: 'conc2' });
      if (ab.includes('gyomei3') && canOnce(P, z, u, 'marca')) push({ pw: 'marca' });
      if (ab.includes('patriarca') && (u.pat || 0) < 3 * g && (u.patT !== st.turn || (u.patTn || 0) < g)) for (const t of allyChars(st, p)) if (!(t.vs === p && t.z === z)) push({ pw: 'desp', target: t });      // nunca sobre sí mismo
      // ----- Megumi: Diez Sombras -----
      if (ab.includes('dsombras')) {
        const dsOk = u.dsTT !== st.turn || (u.dsTn || 0) < 2;      // máximo 2 técnicas por turno
        if (dsOk && !u.dsLo) push({ pw: 'dslobos' });
        if (dsOk && !u.dsNu) for (const e of fl) zonesWith(st.players[e].st).forEach(tz => { const sx = st.players[e].st[tz]; if (sx.down && !sx.prison && !(P.nue || []).some(n => n.uid === sx.c.uid)) push({ pw: 'dsnue', target: { vs: e, z: tz, area: 'st' } }); });
        if (dsOk && !u.dsEle) for (const e of fl) for (const tz of zonesWith(st.players[e].st)) if (!st.players[e].st[tz].prison) push({ pw: 'dselef', target: { vs: e, z: tz, area: 'st' } });
        if (dsOk && !u.dsSap) for (const e of fl) for (const tz of zonesWith(st.players[e].st)) if (!st.players[e].st[tz].prison) push({ pw: 'dssapo', target: { vs: e, z: tz, area: 'st' } });
        if (dsOk && !u.dsSer) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) if (!st.players[e].mz[tz].snake && canTarget(st, p, e, tz)) push({ pw: 'dsserp', target: { vs: e, z: tz } });
        if ((u.dsU || []).length >= 2 && P.hand.some(c => c.id === 'c_mahoraga')) push({ pw: 'dsmaho' });
      }
      // ----- Odin -----
      if (ab.includes('odincarga') && (u.odc || 0) >= 3) P.grave.forEach(i => { const cd = def(i); if (cd.kind === 'monster' && spot(P, cd) >= 0) push({ pw: 'odinvida', u: i.uid }); });
      if (ab.includes('odinrev') && (u.orevT !== st.turn || (u.orevN || 0) < g)) for (const e of fl) {
        const Q = st.players[e];
        for (const tz of zonesWith(Q.mz)) if (Q.mz[tz].down && canTarget(st, p, e, tz)) push({ pw: 'odinrev', target: { vs: e, z: tz, area: 'mz' } });
        for (const tz of zonesWith(Q.st)) if (Q.st[tz].down && !Q.st[tz].prison) push({ pw: 'odinrev', target: { vs: e, z: tz, area: 'st' } });
      }
      if (ab.includes('odinbend') && (u.odb || 0) < 3 * g && (u.odbT !== st.turn || (u.odbTn || 0) < g)) for (const t of allyChars(st, p)) if (!(t.vs === p && t.z === z)) push({ pw: 'odinbend', target: t });
      if (ab.includes('kaioken') && canOnce(P, z, u, 'kk')) push({ pw: 'kaioken' });
      if (m.learn && m.learn.kaioken && !u.kk6) push({ pw: 'kaioken6' });
      if (m.learn && m.learn.genki && !u.gen && fl.some(e => zonesWith(st.players[e].mz).length)) push({ pw: 'genki' });
      if (ab.includes('maestro') && u.tTurn !== st.turn) {
        for (const sk of ['kaioken', 'genki']) if (!u['t_' + sk]) for (const t of allyChars(st, p)) if (!(t.vs === p && t.z === z) && !(st.players[t.vs].mz[t.z].learn || {})[sk]) push({ pw: 'teach', skill: sk, target: t });
      }
      if (ab.includes('jogodom') && canOnce(P, z, u, 'dom') && domainOk(st, m)) push({ pw: 'dominio' });
      if (ab.includes('llama') && (u.kills || 0) > 0 && canOnce(P, z, u, 'llama')) push({ pw: 'llama' });
      if (m.c.id === 'c_kayn' && !m.form && m.kn) {
        if (m.kn.rh) push({ pw: 'kform', form: 'c_kayn_rhaast' });
        if (m.kn.sh) push({ pw: 'kform', form: 'c_kayn_sombra' });
      }
      if (ab.includes('telar') && (u.web || 0) < 2 * g && (u.webT !== st.turn || (u.webTn || 0) < g)) {
        for (const t of foeChars(st, p)) {
          const tm = st.players[t.vs].mz[t.z];
          if (tm.down) continue;
          for (const x of Array.from(new Set(rawAbil(tm)))) if (!(tm.sealed || []).some(q => q.ab === x)) push({ pw: 'telar', target: t, ab: x });
        }
      }
      {   // Sauron, o quien lleve el Anillo Único siendo de 7★ o más: corromper a un personaje enemigo de menos estrellas
        const rg = ringOf(P, z), viaRing = !!rg && rg.ring.stars >= 7 && !rg.ring.sauron && !rg.ring.promesaUsed;
        const sau = ab.includes('corrupt') && (u.corrT == null || curRound(st) - roundAt(st, u.corrT) >= 3);
        if (sau || viaRing) {
          for (const t of foeChars(st, p)) {
            const tm = st.players[t.vs].mz[t.z];
            if (lvl(tm) < (sau ? lvl(m) : 7) && !tm.promesa && !shadowSafe(st, p, t.vs, t.z)) push(Object.assign({ pw: 'corromper', target: t }, sau ? {} : { ring: true }));
          }
        }
      }
      if (m.six) {
        if (!u.rojo && !u.purpura) for (const t of foeChars(st, p)) push({ pw: 'rojo', target: t });
        if (!u.azul && !u.purpura && foeSTs(st, p).length) push({ pw: 'azul' });
        if (!u.rojo && !u.azul && !u.purpura) {
          for (const e of fl) {
            for (const tz of zonesWith(st.players[e].mz)) push({ pw: 'purpura', target: { vs: e, z: tz, area: 'mz' } });
            for (const tz of zonesWith(st.players[e].st)) if (!st.players[e].st[tz].prison) push({ pw: 'purpura', target: { vs: e, z: tz, area: 'st' } });
          }
        }
      }
      if (m.av && m.av.on && m.av.choice === 'mag' && m.av.n < 3 * g && (m.av.turn !== st.turn || (m.av.tn || 0) < g)) for (const t of foeSTs(st, p)) push({ pw: 'avpred', target: t });
      // ----- tanda 3 (27-10-2026) -----
      if (ab.includes('transtitan') && !m.copy && canOnce(P, z, u, 'bite') && P.lp > 500 && titanAnchor(P, z, [z]) >= 0) P.hand.forEach((c, i) => { if (c.id === 'c_titan_ataque') push({ pw: 'eren', hand: i }); });      // como Lara: el Titán ocupa su lugar
      if (ab.includes('punos') && (u.pn || 0) < 2 * g && u.pnT !== st.turn && !(m.mods || []).some(x => x.k === 'punos')) push({ pw: 'punos' });
      if (ab.includes('toge') && u.tgR !== curRound(st)) {         // una sola orden por turno; cada una una vez por invocación
        for (const t of foeChars(st, p)) {
          const tm = st.players[t.vs].mz[t.z];
          if (!u.tq) push({ pw: 'tq', target: t });
          if (tm.down) continue;
          if (!u.td) push({ pw: 'td', target: t });
          if (!u.tm && lvl(tm) <= 4) push({ pw: 'tm', target: t });
        }
      }
      if (ab.includes('semilla') && (u.sdT !== st.turn || (u.sdN || 0) < g)) for (const t of allyChars(st, p)) if (seedList(st, t.vs, t.z, false).length) push({ pw: 'semilla', target: t });
      if (ab.includes('tonyarm') && m.tony && m.tony.mat > 0 && m.tony.t !== st.turn) push({ pw: 'armadura' });
      if (m.jk) for (const mode of ['sword', 'shield']) for (const tz of zonesUp(P)) {      // Jake: cambiar de modo o de aliado sin acumular bonificaciones
        const T = P.mz[tz];
        if (T.fused || isInk(T) || (tz === z && m.jk.mode === mode) || (tz !== z && T.jk)) continue;
        push({ pw: 'jkmove', mode, target: { vs: p, z: tz } });
      }
      if (ab.includes('symb') && SYMB[m.c.id] && !m.copy && P.symT !== st.turn && !(m.link && m.link.length) && !m.abs && !m.fused && !m.wide) {
        for (const tz of zonesUp(P)) { const T = P.mz[tz]; if (tz !== z && !T.sym && !T.fused && !isInk(T)) push({ pw: 'simb', target: { vs: p, z: tz } }); }
      }
      if (ab.includes('sylas') && (u.syT !== st.turn || (u.syN || 0) < g)) {
        for (const t of foeChars(st, p)) {
          const tm = st.players[t.vs].mz[t.z];
          if (tm.down) continue;
          for (const x of Array.from(new Set(rawAbil(tm)))) if (STEALABLE.includes(x) && !rawAbil(m).includes(x) && !(tm.sealed || []).some(q => q.ab === x)) push({ pw: 'robo', target: t, ab: x });
        }
      }
      if (m.gemsIdle && m.gemsIdle.length && !spellsOff(st) && st.current === p) {      // Thanos: gemas robadas que lleva consigo, usadas como habilidad (sin ocupar zona)
        for (const gi of m.gemsIdle) {
          if (gi.fx === 'gem') { if (firstFree(P.st) >= 0) for (const c of zoneTargetsUp(st, p)) push({ pw: 'tgmente', gem: gi.uid, target: { vs: foeOf(st, p, c), z: c.z } }); }
          else if (gi.fx === 'tiempo' && canRewind(st, p)) push({ pw: 'tgtiempo', gem: gi.uid });
        }
      }
      if (ab.includes('kurama') && !u.kur && !(m.mods || []).some(x => x.k === 'kurama')) push({ pw: 'kurama' });      // una sola vez por invocación
      // ----- tanda 4 -----
      if (ab.includes('majinex') && canOnce(P, z, u, 'mj')) push({ pw: 'majinex' });
      if (ab.includes('armin') && !m.copy && canOnce(P, z, u, 'bite') && P.lp > 1000 && titanAnchor(P, z, [z], true) >= 0) P.hand.forEach((c, i) => { if (c.id === 'c_titan_colosal') push({ pw: 'armin', hand: i }); });
      if (ab.includes('manto') && !u.mt) {
        push({ pw: 'manto', opt: 'shield' });
        P.hand.forEach((c, i) => { if (c.id === 'c_naruto_kyuubi' && spot(P, def(c), [z]) >= 0) push({ pw: 'manto', opt: 'xform', hand: i }); });
      }
      if (ab.includes('rasengan') && canOnce(P, z, u, 'ras') && !(m.mods || []).some(x => x.k === 'ras')) push({ pw: 'rasengan' });
      if (m.ksp && !m.ksp.x && !m.exh && (m.mods || []).some(x => x.k === 'kaiospell')) push({ pw: 'kaiox10' });
      // ----- tanda 7 -----
      if (ab.includes('sjdom') && P.kaT !== st.turn) {            // Kaisel: Montura de las Sombras (con Sung Jin-Woo en el campo, desde la mano o el cementerio, sin gastar la invocación normal)
        for (const c of P.hand) if (c.id === 'c_kaisel' && spot(P, def(c)) >= 0) push({ pw: 'kaisel', from: 'hand', u: c.uid });
        for (const c of P.grave) if (c.id === 'c_kaisel' && spot(P, def(c)) >= 0) push({ pw: 'kaisel', from: 'grave', u: c.uid });
      }
      if (ab.includes('kaivuelo') && u.kvT !== st.turn) for (const t of allyChars(st, p)) if (!st.players[t.vs].mz[t.z].fly) push({ pw: 'kaiselvuelo', target: t });
      if (ab.includes('rengarmax') && (u.fer || 0) >= 2) {
        push({ pw: 'rsalv' });
        if (seedList(st, p, z, false, true).length) push({ pw: 'rrug' });
        if (!m.camu) push({ pw: 'rcam' });
        for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) if (canTarget(st, p, e, tz) && !blocked(st.players[e].mz[tz], 'atk')) push({ pw: 'rred', target: { vs: e, z: tz } });
      }
      if (ab.includes('rengarcaza') && !m.fly && (u.rcT0 == null || elapsed(st, u.rcT0) >= 2)) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && canTarget(st, p, e, tz)) push({ pw: 'rcaza', target: { vs: e, z: tz } }); }
      if (ab.includes('hakdom') && canOnce(P, z, u, 'hdm') && domainOk(st, m)) push({ pw: 'hakdom' });
      if (ab.includes('hakdom') && st.domain && st.domain.uid === m.c.uid && u.hrT !== st.turn) push({ pw: 'hruleta' });
      if ((m.sc || 0) >= 1) { push({ pw: 'salaf' }); if (!m.sres) push({ pw: 'salar' }); }
      if ((m.sc || 0) >= 2) push({ pw: 'salad' });
      if (ab.includes('nearmira') && u.nmT !== st.turn) {      // Sucesor de L: mira en privado una carta boca abajo rival
        const eyes = P.eyes || [];
        for (const e of fl) {
          for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (tm.down && !eyes.some(x => x.uid === tm.c.uid)) push({ pw: 'nearmira', target: { vs: e, z: tz } }); }
          st.players[e].st.forEach((sx, sz) => { if (sx && sx.down && !sx.prison && !eyes.some(x => x.uid === sx.c.uid)) push({ pw: 'nearmira', target: { vs: e, z: sz, area: 'st' } }); });
        }
      }
      if (ab.includes('kzmask') && u.kzmT !== st.turn) {
        for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) if (canTarget(st, p, e, tz)) push({ pw: 'kzfuego', target: { vs: e, z: tz } });
        push({ pw: 'kzviento' });
        for (const e of fl) for (const tz of zonesWith(st.players[e].st)) if (!st.players[e].st[tz].prison) push({ pw: 'kzrayo', target: { vs: e, z: tz, area: 'st' } });
        push({ pw: 'kzagua' });
      }
      // ----- tanda 6 -----
      const hand = id => P.hand.map((c, i) => (c.id === id ? i : -1)).filter(i => i >= 0);
      if (m.c.id === 'c_asta' && ab.includes('astaneg') && m.astaW) for (const i of hand('c_asta_negra').slice(0, 1)) if (spot(P, def(P.hand[i]), [z]) >= 0) push({ pw: 'astaneg', hand: i });
      if (m.c.id === 'c_asta_negra' && ab.includes('astauni') && (m.astaK || 0) >= 2) for (const i of hand('c_asta_union').slice(0, 1)) if (spot(P, def(P.hand[i]), [z]) >= 0) push({ pw: 'astauni', hand: i });
      if (ab.includes('astacausa') && !m.c.ecU && allyChars(st, p).some(t => negList(st, t.vs, t.z).length)) push({ pw: 'astacausa' });
      if (ab.includes('sjarmy') && (m.sjc || 0) >= 2) for (let g = 0; g < st.n; g++) for (const c of st.players[g].grave) { const cd = def(c); if (cd.kind === 'monster' && !cd.hidden && spot(P, cd) >= 0) push({ pw: 'sjarmy', g, u: c.uid }); }
      if (ab.includes('sjigris') && u.sjiT !== st.turn) {
        for (const i of hand('c_igris').slice(0, 1)) if (spot(P, def(P.hand[i])) >= 0) push({ pw: 'sjigris', from: 'hand', u: P.hand[i].uid });
        const dk = P.deck.find(c => c.id === 'c_igris'); if (dk && spot(P, def(dk)) >= 0) push({ pw: 'sjigris', from: 'deck', u: dk.uid });
      }
      for (const [k, id] of [['sjberu', 'c_beru'], ['sjbellion', 'c_bellion']]) if (ab.includes(k) && u[k + 'T'] !== st.turn) {
        for (const i of hand(id).slice(0, 1)) if (spot(P, def(P.hand[i])) >= 0) push({ pw: k, from: 'hand', u: P.hand[i].uid });
        const gr = P.grave.find(c => c.id === id); if (gr && spot(P, def(gr)) >= 0) push({ pw: k, from: 'grave', u: gr.uid });
      }
      if (m.c.id === 'c_sung' && ab.includes('sjmon') && soldiersOf(P) >= 2) for (const i of hand('c_sung_monarca').slice(0, 1)) if (spot(P, def(P.hand[i]), [z]) >= 0) push({ pw: 'sjmon', hand: i });
      if (ab.includes('kameha') && canOnce(P, z, u, 'kame') && !(m.mods || []).some(x => x.k === 'kame')) push({ pw: 'kameha' });
      if (ab.includes('bulmagen') && u.bgT !== st.turn && P.hand.length >= 1 && P.deck.some(c => def(c).kind === 'spell')) push({ pw: 'bulmagen' });
      if (ab.includes('satanpub') && u.spT !== st.turn) for (const t of allyChars(st, p)) if (!isInk(st.players[t.vs].mz[t.z])) push({ pw: 'satanpub', target: t });
      if (ab.includes('elizluz') && u.elT !== st.turn) for (const t of allyChars(st, p)) for (const k of negList(st, t.vs, t.z)) push({ pw: 'elizluz', target: t, k: k.k, nm: k.nm });
      if (ab.includes('galco') && (u.gco || 0) >= 2) push({ pw: 'galco' });
      if (ab.includes('galcaza') && u.gczT !== st.turn && !(m.mods || []).some(x => x.k === 'caza')) push({ pw: 'galcaza' });
      if (ab.includes('higudom') && canOnce(P, z, u, 'hdom') && domainOk(st, m)) push({ pw: 'higudom' });
      if (ab.includes('tobidim') && u.tdT !== st.turn) for (let q = 0; q < st.n; q++) if (st.players[q].alive) for (const tz of zonesWith(st.players[q].mz)) { const tm = st.players[q].mz[tz]; if ((q !== p || tz !== z) && !isInk(tm) && canTarget(st, p, q, tz)) push({ pw: 'tobidim', target: { vs: q, z: tz } }); }
      if (ab.includes('tinta') && u.tiT !== st.turn && spot(P, def({ id: 'c_tinta_leon' })) >= 0) {
        push({ pw: 'tinta', opt: 'leon' });
        for (const t of foeChars(st, p)) { push({ pw: 'tinta', opt: 'aguila', target: t }); push({ pw: 'tinta', opt: 'serp', target: t }); }
      }
      if (ab.includes('shikasomb') && u.ssT !== st.turn) for (const t of foeChars(st, p)) push({ pw: 'shikasomb', target: t });
      if (ab.includes('liukang') && !u.liu) push({ pw: 'liukang' });
      if (ab.includes('misaojos')) {
        const cap = P.mz.some(x => x && !x.down && /^Light Yagami/.test(mdef(x).name)) ? 2 : 1, used = u.moT === st.turn ? (u.moN || 0) : 0;
        if (used < cap) for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (tm.down && !(P.eyes || []).some(x => x.uid === tm.c.uid)) push({ pw: 'misaojos', target: { vs: e, z: tz } }); }
        if (used < cap) for (const e of fl) st.players[e].st.forEach((sx, sz) => { if (sx && sx.down && !(P.eyes || []).some(x => x.uid === sx.c.uid)) push({ pw: 'misaojos', target: { vs: e, z: sz, area: 'st' } }); });      // también magias y trampas boca abajo
      }
      if (ab.includes('misadn') && (u.mdR == null || curRound(st) - u.mdR >= 2)) for (const t of foeChars(st, p)) if (!st.players[t.vs].mz[t.z].dn) push({ pw: 'misadn', target: t });
      for (const s of eqWith(st, P, z, 'katana')) if (s.ktT !== st.turn) for (const t of foeChars(st, p)) {      // Katana de la Antimagia
        const tm = st.players[t.vs].mz[t.z];
        if (tm.down) continue;
        for (const x of Array.from(new Set(rawAbil(tm)))) if (!(tm.spentAb || []).includes(x)) push({ pw: 'katana', target: t, ab: x, stz: P.st.indexOf(s) });
      }
    });
    return out.filter(a => { const m = P.mz[a.zone]; return !(m && m.cx && m.cx[a.pw] === st.turn); });      // habilidad evadida o cancelada: no se repite este turno
  }
  const SEEDN = { rojo: 'Rojo', debil: '¡Debilítate!', ola: 'Ola de Fuego' };
  /** Semilla del Hermitaño: efectos negativos que se pueden quitar de un aliado (con doIt, los quita). Devuelve sus nombres. */
  function seedList(st, q, z, doIt, extra) {
    const m = st.players[q].mz[z], out = [];
    if (!m || m.down) return out;
    const neg = (m.mods || []).filter(x => (x.atk < 0 || x.def < 0) && x.k !== 'voto');
    for (const x of neg) out.push(SEEDN[x.k] || x.k);
    if (m.sealed && m.sealed.length) out.push('Telarañas');
    if (m.promesa) out.push('Promesa de Poder');
    if (extra && m.exh) out.push('Agotamiento');
    if (extra && m.dn) out.push('Death Note');
    if (extra && m.binds && m.binds.length) for (const b of m.binds) out.push(b.nm);      // tanda 6: restricciones temporales
    if (extra && m.petri) out.push('Petrificación');
    const foesT = (k) => st.team[k] !== st.team[q];
    const kar = [];
    for (let k = 0; k < st.n; k++) st.players[k].st.forEach((s, i) => {
      if (s && s.karma && s.karma.phase === 'foe' && s.karma.foeUid === m.c.uid && foesT(k)) { out.push('Karma'); kar.push([k, i]); }
    });
    const gm = gemOf(st, m.c.uid);
    if (gm && foesT(gm.p)) out.push('Gema de la Mente');
    if (!doIt) return out;
    m.mods = (m.mods || []).filter(x => !neg.includes(x));
    delete m.sealed;
    if (extra) { delete m.exh; delete m.dn; delete m.binds; delete m.petri; }
    if (m.promesa) { delete m.promesa; st.corrupt = (st.corrupt || []).filter(c => c.uid !== m.c.uid); }
    for (const [k, i] of kar) removeST(st, k, i);
    if (gm && foesT(gm.p)) removeST(st, gm.p, gm.i);
    return out;
  }
  /** Quita todos los efectos negativos de un personaje (Espada Destructora de Causas). Devuelve sus nombres. */
  const cleanse = (st, q, z) => seedList(st, q, z, true, true);
  /** Efectos negativos de un personaje, uno por uno (Luz purificadora de Elizabeth): [{ k, nm, rm }]. */
  function negList(st, q, z) {
    const m = st.players[q].mz[z], out = [];
    if (!m || m.down) return out;
    (m.mods || []).forEach((x, i) => { if ((x.atk < 0 || x.def < 0) && x.k !== 'voto') out.push({ k: 'mod' + i, nm: SEEDN[x.k] || 'una reducción de estadísticas', rm: () => { m.mods = m.mods.filter(y => y !== x); } }); });
    if (m.sealed && m.sealed.length) out.push({ k: 'sealed', nm: 'las Telarañas', rm: () => { delete m.sealed; } });
    if (m.promesa) out.push({ k: 'promesa', nm: 'la Promesa de Poder', rm: () => { delete m.promesa; st.corrupt = (st.corrupt || []).filter(c => c.uid !== m.c.uid); } });
    if (m.exh) out.push({ k: 'exh', nm: 'el agotamiento', rm: () => { delete m.exh; } });
    if (m.dn) out.push({ k: 'dn', nm: 'la Death Note', rm: () => { delete m.dn; } });
    if (m.snake) out.push({ k: 'snake', nm: 'la Serpiente', rm: () => { delete m.snake; } });
    if (m.petri) out.push({ k: 'petri', nm: 'la petrificación', rm: () => { delete m.petri; } });
    (m.binds || []).forEach((b, i) => out.push({ k: 'bind' + i, nm: b.nm, rm: () => { m.binds = m.binds.filter(y => y !== b); if (!m.binds.length) delete m.binds; } }));
    for (let k = 0; k < st.n; k++) st.players[k].st.forEach((s, i) => {
      if (s && s.karma && s.karma.phase === 'foe' && s.karma.foeUid === m.c.uid && st.team[k] !== st.team[q]) out.push({ k: 'karma', nm: 'Karma', rm: () => removeST(st, k, i) });
    });
    const gm = gemOf(st, m.c.uid);
    if (gm && st.team[gm.p] !== st.team[q]) out.push({ k: 'gem', nm: 'la Gema de la Mente', rm: () => removeST(st, gm.p, gm.i) });
    return out;
  }
  /** Poderes de las magias continuas (Gema de la Mente y Tormenta Eléctrica). */
  function spowerActs(st, p) {
    const P = st.players[p], out = [];
    if (spellsOff(st)) return out;
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
      if (s.alma && s.alma.usedTurn !== st.turn) {      // Gema del Alma: libera uno de los efectos guardados
        s.alma.eff.forEach((id, idx) => {
          const cd = C().get(id), fx = cd && FX[cd.fx];
          if (!fx) return;
          for (const t of fx.targets(st, p, cd)) out.push(t ? { t: 'spow', zone: z, pw: 'almaus', idx, target: t } : { t: 'spow', zone: z, pw: 'almaus', idx });
        });
      }
      if (s.storm && s.storm.usedTurn !== st.turn) {
        const fl = foes(st, p);
        P.hand.forEach((c, i) => {
          const cd = def(c);
          if (cd.kind === 'monster') {
            for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { const tm = st.players[e].mz[tz]; if (!tm.down && lvl(tm) <= cd.level && canTarget(st, p, e, tz)) out.push({ t: 'spow', zone: z, pw: 'storm1', hand: i, target: { vs: e, z: tz } }); }
          } else {
            for (const e of fl) for (const tz of zonesWith(st.players[e].st)) if (!st.players[e].st[tz].prison) out.push({ t: 'spow', zone: z, pw: 'storm2', hand: i, target: { vs: e, z: tz } });
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
        for (const z of pd.cands) {
          const rd = def(P.st[z].c), os = rd.fx === 'realidad' ? realityOpts(st, p, pd.trigger, pd.cont) : rd.fx === 'fullcounter' ? fcOpts(st, p, pd.trigger, pd.cont) : rd.fx === 'kyoka' ? kyokaOpts(st, p, pd.cont) : [null];
          for (const o of os) out.push(o ? { t: 'respond', activate: true, zone: z, opt: o } : { t: 'respond', activate: true, zone: z });
        }
      } else if (pd.k === 'pick') {
        for (const u of pd.cands) { out.push({ t: 'pick', uid: u }); if (pd.cont === 'invite') out.push({ t: 'pick', uid: u, pos: 'def' }); }      // Invitación: en ataque o en defensa
      } else if (pd.k === 'ability') {
        if (pd.ab === 'steal' || pd.ab === 'vlearn' || (pd.ab === 'near' && pd.stage === 'ask') || pd.ab === 'gravrew' || pd.ab === 'marcamal' || pd.ab === 'dante' || pd.ab === 'shadowred') { for (const a of pd.opts) out.push({ t: 'ability', pick: a }); out.push({ t: 'ability', use: false }); }
        else if (pd.ab === 'karma' || pd.stage === 'target' || pd.stage === 'glovetgt') { for (const c of pd.cands) out.push({ t: 'ability', vs: c.vs, z: c.z }); }
        else if (pd.ab === 'avchoice') { out.push({ t: 'ability', pick: 'atk' }); out.push({ t: 'ability', pick: 'mag' }); }
        else if (pd.stage === 'ask') { out.push({ t: 'ability', use: true }); out.push({ t: 'ability', use: false }); }
        else { out.push({ t: 'ability', pos: 'atk' }); out.push({ t: 'ability', pos: 'def' }); }
      } else if (pd.k === 'discard') {
        P.hand.forEach((_, i) => out.push({ t: 'discard', hand: i }));
      }
      return out;
    }
    if (st.phase === 'main') {
      const occupied = zonesWith(P.mz).filter(z => !P.mz[z].god && !isInk(P.mz[z]));      // Vegeta Dios: lo atrapado no se sacrifica
      P.hand.forEach((card, i) => {
        const d = def(card);
        if (d.kind === 'monster') {
          if (card.id === 'c_jake') zonesUp(P).forEach(hz => { const h = P.mz[hz]; if (!h.jk && !h.fused && !isInk(h)) for (const mode of ['sword', 'shield']) out.push({ t: 'attach', hand: i, host: hz, mode }); });
          if (SYMB[card.id] && P.symT !== st.turn) zonesUp(P).forEach(hz => { const h = P.mz[hz]; if (!h.sym && !h.fused && !isInk(h)) out.push({ t: 'attach', hand: i, host: hz, mode: 'venom' }); });
          if (card.id === 'c_gogeta') {                  // Fusión Saiyajin: Goku base + Vegeta base en el campo (quedan vinculados)
            for (const gz of zonesUp(P)) for (const vz of zonesUp(P)) {
              if (gz === vz || P.mz[gz].c.id !== 'c_goku' || P.mz[vz].c.id !== 'c_vegeta' || P.mz[gz].copy || P.mz[vz].copy) continue;
              if (spot(P, d, [gz, vz]) >= 0) out.push({ t: 'fusion', hand: i, gz, vz });
            }
          }
          if (d.couple) {                                // Anti-Venom: se acopla a un aliado (no ocupa casilla)
            if (P.normalUsed) return;
            const need = C().tributesFor(d.level);
            zonesUp(P).forEach(hz => {
              const h = P.mz[hz];
              if (h.av || h.fused || h.wide || isInk(h)) return;
              const others = occupied.filter(z => z !== hz);
              if (need > others.length) return;
              for (const tr of combos(others, need)) out.push({ t: 'couple', hand: i, host: hz, tributes: tr });
            });
            return;
          }
          if (d.sp) {                                    // sólo invocación especial (Shang Tsung)
            if (d.sp === 'types3' && typesOnField(st) >= 3 && spot(P, d) >= 0) out.push({ t: 'special', hand: i });
            return;
          }
          if (P.normalUsed) return;
          const need = C().tributesFor(d.level);
          if (need > occupied.length) return;
          if (d.invade) {                                // Reyna Flama: entra en un hueco vacío del campo ENEMIGO
            for (const tr of combos(occupied, need)) for (const e of foes(st, p)) {
              const oe = occ(st.players[e]);
              for (let fz = 0; fz < ZONES; fz++) if (!oe[fz]) out.push({ t: 'summon', hand: i, tributes: tr, vs: e, fz });
            }
            return;
          }
          for (const tr of combos(occupied, need)) {
            if (spot(P, d, tr) < 0) continue;
            out.push({ t: 'summon', hand: i, tributes: tr });
            out.push({ t: 'set', hand: i, tributes: tr });
          }
        } else {
          if (d.kind === 'spell' && !spellsOff(st)) {
            const tg = spellTargets(st, p, card);
            const needsZone = !!PERM[d.fx];
            if (tg.length && (!needsZone || freeCount(P.st) > 0)) for (const t of tg) out.push(t ? { t: 'activate', hand: i, target: t } : { t: 'activate', hand: i });
          }
          if (freeCount(P.st) > 0) out.push({ t: 'setst', hand: i });
        }
      });
      if (!spellsOff(st)) P.st.forEach((s, z) => {
        if (!s || !s.down) return;
        const d = def(s.c);
        if (d.kind !== 'spell') return;
        for (const t of spellTargets(st, p, s.c)) out.push(t ? { t: 'activateSet', zone: z, target: t } : { t: 'activateSet', zone: z });
      });
      P.mz.forEach((m, z) => {
        if (!m) return;
        if (m.snake) return;      // Serpiente de Megumi: no cambia de posición
        if (m.down && m.summonedTurn < st.turn) out.push({ t: 'flip', zone: z });
        if (!m.down && !m.moved && !m.attacked && m.summonedTurn < st.turn && !m.gr && !(m.binds || []).some(b => b.pos) && !(m.pos === 'atk' && has(st, m, 'rikamal') && !rikaState(st).happy)) out.push({ t: 'pos', zone: z });
      });
      out.push(...powerActs(st, p), ...spowerActs(st, p));
      if (canAttackNow(st) && P.mz.some(m => m && !m.down && m.pos === 'atk')) out.push({ t: 'toBattle' });
      if (!forcedRika(st, p).length) out.push({ t: 'endTurn' });
    } else if (st.phase === 'battle') {
      const mu = multi(st), fl = foes(st, p), fr = forcedRika(st, p);
      P.mz.forEach((m, z) => {
        if (!canAttackSlot(st, m)) return;
        if (fr.includes(z)) { out.push(...rikaOptions(st, p, z)); return; }       // Rika obligada: sólo sus objetivos (aliados o enemigos)
        const org = m.orgT === st.turn && atkCount(m) >= 1;      // Espada Orgánica: el ataque extra va contra otro personaje enemigo
        for (const e of fl) {
          const all = zonesWith(st.players[e].mz).filter(tz => !isInk(st.players[e].mz[tz])), targets = all.filter(tz => atkOk(st, m, e, tz) && !(m.escHit && m.escHit.t === st.turn && m.escHit.u.includes(st.players[e].mz[tz].c.uid)));
          if (!all.length) { if (!org) out.push(mu ? { t: 'attack', zone: z, vs: e, target: 'direct' } : { t: 'attack', zone: z, target: 'direct' }); }
          else for (const tz of targets) {
            const a0 = mu ? { t: 'attack', zone: z, vs: e, target: tz } : { t: 'attack', zone: z, target: tz };
            out.push(a0);
            if (canStrip(st, P, z) && boosted(st, e, tz)) out.push(Object.assign({}, a0, { strip: true }));      // Anulación de aumentos
          }
        }
        if (has(st, m, 'pdragon') && !uOf(m).pdr) {      // Puño del Dragón: 2 o 3 casillas en el mismo ataque (una vez por invocación, aunque haya Gema)
          const cands = [];
          for (const e of fl) for (const tz of zonesWith(st.players[e].mz)) { if (atkOk(st, m, e, tz)) cands.push({ vs: e, z: tz }); }
          const mk = c => mu ? { vs: c.vs, z: c.z } : { z: c.z };
          for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
            const base = c => mu ? { t: 'attack', zone: z, vs: c.vs, target: c.z } : { t: 'attack', zone: z, target: c.z };
            out.push(Object.assign(base(cands[i]), { dragon: [mk(cands[j])] }));
            for (let k = j + 1; k < cands.length; k++) out.push(Object.assign(base(cands[i]), { dragon: [mk(cands[j]), mk(cands[k])] }));
          }
        }
      });
      const hseen = new Set();
      P.mz.forEach((m, z) => {                       // Hiraishin: ataque extra contra una casilla marcada y ocupada por un rival
        if (!m || m.down || m.pos !== 'atk' || !(m.hira > 0) || !has(st, m, 'hiraishin')) return;
        for (const mk of (st.marks || [])) {
          if (mk.by !== p || !fl.includes(mk.vs)) continue;
          const E2 = st.players[mk.vs], tz = E2.mz[mk.z] ? mk.z : shadowOf(E2, mk.z);
          if (tz < 0 || !E2.mz[tz] || !atkOk(st, m, mk.vs, tz) || blocked(m, 'atk') || hseen.has(z + ':' + mk.vs + ':' + tz)) continue;
          hseen.add(z + ':' + mk.vs + ':' + tz);
          out.push(mu ? { t: 'attack', zone: z, vs: mk.vs, target: tz, hira: true } : { t: 'attack', zone: z, target: tz, hira: true });
        }
      });
      out.push(...powerActs(st, p).filter(a => ['furia', 'bigbang', 'canon', 'relicario', 'genki', 'punos', 'tq', 'td', 'tm', 'kurama', 'chidori', 'kameha', 'liukang', 'galco', 'galcaza'].includes(a.pw)));
      if (!fr.length) out.push({ t: 'endTurn' });
    }
    return out;
  }

  // ---------------- poderes ----------------
  function doPower(st, p, a) {
    const P = st.players[p], m = P.mz[a.zone], u = uOf(m), nm = mdef(m).name;
    const ctx = { src: 'power', by: { p, uid: m.c.uid }, bp: p, pw: a.pw }, g = gx(P, a.zone);
    if (a.target && a.target.vs != null && a.target.z != null && a.target.area !== 'st' && st.team[a.target.vs] !== st.team[p]) {      // Cámara de Gravedad: Sobreexigencia
      const tm = st.players[a.target.vs].mz[a.target.z];
      if (tm && tm.gr && tm.gr.n > 0) { tm.gr.n = 0; log(st, a.target.vs, `Sobreexigencia: ${mdef(tm).name} pierde sus contadores de entrenamiento`); }
    }
    switch (a.pw) {
      case 'canon': {
        if (u.canon) break;      // una sola vez por invocación
        u.canon = true;
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        log(st, p, `${nm} usa Cañón Espiritual Final contra ${mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        destroyMonster(st, e, a.target.z, ctx);
        break;
      }
      case 'absorb': {
        const q = a.target.vs, tz = a.target.z, tm = st.players[q].mz[tz], td = mdef(tm);
        const atk = atkOf(st, st.players[q], tz), df = defOf(st, st.players[q], tz);
        const perfect = rawAbil(m).includes('absorbp'), ratio = perfect ? 0.7 : 0.5;      // Cell Perfecto: 70 % y todas las habilidades
        const give = Array.from(new Set(rawAbil(tm).filter(x => perfect ? !['absorb', 'absorbp'].includes(x) : GIVE.includes(x))));
        const link = tm.link || [];
        log(st, p, `${nm} absorbe a ${td.name}`);
        if (multi(st)) st.log[st.log.length - 1].q = q;
        takeOff(st, q, tz, 'absorb');
        if (tm.abs) releaseAbsorbed(st, tm);
        markOnce(u, 'absorb');
        m.abs = { c: tm.c, link, owner: tm.owner != null ? tm.owner : q, atk, def: df };      // un personaje corrompido vuelve a su dueño original
        m.bonus = m.bonus || { atk: 0, def: 0 };
        m.bonus.atk += Math.floor(atk * ratio); m.bonus.def += Math.floor(df * ratio);
        m.ext = m.ext || [];
        m.extFrom = m.extFrom || {};
        for (const g of give) if (!m.ext.includes(g) && !(mdef(m).ab || []).includes(g)) { m.ext.push(g); m.extFrom[g] = td.name; }
        log(st, p, `${nm} obtiene +${Math.floor(atk * ratio)} ATK y +${Math.floor(df * ratio)} DEF${give.length ? ' y su habilidad' : ''}`);
        break;
      }
      case 'furia':
        markOnce(u, 'furia'); m.fur = st.turn; m.furX = g;
        log(st, p, `${nm} usa Furia de Esparta: +${700 * g} ATK y +${700 * g} DEF hasta el final del turno`);
        break;
      case 'bigbang': {
        markOnce(u, 'bb');
        log(st, p, `${nm} usa Big Bang`);
        for (const e of foes(st, p)) for (let tz = 0; tz < ZONES; tz++) {
          const tm = st.players[e].mz[tz];
          if (tm && atkOf(st, st.players[e], tz) < 2000) destroyMonster(st, e, tz, ctx);
        }
        break;
      }
      case 'dios': {
        markOnce(u, 'dios');
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        if (!tm) break;
        tm.god = { p, uid: m.c.uid };
        log(st, p, `${nm} usa Poder de Dios: atrapa a ${tm.down ? 'un personaje boca abajo' : mdef(tm).name} en su campo de energía divina`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        break;
      }
      case 'cellperf': {
        const r = m.abs, O = st.players[r.owner];
        O.grave.push(r.c); for (const l of (r.link || [])) O.grave.push(l);      // el absorbido va al cementerio de su dueño: no se conserva ni queda vinculado
        m.abs = null;
        log(st, p, `${def(r.c).name} va al cementerio de su dueño`);
        transformInto(st, p, a.zone, a.hand, null);
        break;
      }
      case 'dtrig': {
        const old = m, ob = old.bonus ? { atk: old.bonus.atk, def: old.bonus.def } : null, oe = (old.ext || []).slice(), of = Object.assign({}, old.extFrom), od = uOf(old).dk || 0;
        transformInto(st, p, a.zone, a.hand, null);
        const nm2 = P.mz[a.zone];
        if (nm2) { if (ob) nm2.bonus = ob; nm2.ext = oe; nm2.extFrom = of; }      // las mejoras y habilidades pasan íntegras a Devil Trigger
        break;
      }
      case 'brillo': {
        u.bri = true;
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        if (!tm) break;
        tm.bri = { by: p, t0: st.turn };
        log(st, p, `${nm} usa Brillo: se introduce en ${mdef(tm).name} y explotará en el turno de su controlador`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        break;
      }
      case 'avada': {
        u.avT = st.turn;
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        if (!tm) break;
        log(st, p, `${nm} usa Avada Kedavra contra ${tm.down ? 'un personaje boca abajo' : mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        removeMonster(st, e, a.target.z, 'banish', { death: true });
        break;
      }
      case 'chidori':
        u.chiT = st.turn; addMod(st, m, 'chi', 400 * g, 0, 0);
        log(st, p, `${nm} usa Chidori: +${400 * g} ATK en su próximo ataque`);
        break;
      case 'maquina': {
        const c = P.grave.filter(i => def(i).kind === 'monster' && spot(P, def(i)) >= 0);
        if (!c.length) break;
        m.dex = 0;
        log(st, p, `${nm} usa la Máquina del tiempo`);
        st.pending = { k: 'pick', player: p, zone: 'grave', cands: c.map(i => i.uid), cont: 'revive' };
        break;
      }
      case 'canal':
        m.canal = { t: st.turn, ready: false };
        log(st, p, `${nm} usa Canalización: concentra su energía y no puede atacar este turno`);
        break;
      case 'supernova': {
        m.canal = null;
        log(st, p, `${nm} usa Supernova`);
        for (const e of foes(st, p)) {
          for (let tz = 0; tz < ZONES; tz++) {
            const tm = st.players[e].mz[tz];
            if (tm && lvl(tm) <= 7) destroyMonster(st, e, tz, ctx);
          }
          for (let sz = 0; sz < ZONES; sz++) removeST(st, e, sz);
        }
        break;
      }
      case 'cuerno': {
        markOnce(u, 'cuer');
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        log(st, p, `${nm} usa Ataque de Cuerno contra ${tm ? mdef(tm).name : 'un personaje'}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (tm) destroyMonster(st, e, a.target.z, ctx);
        break;
      }
      case 'agujero': {
        u.agT = st.turn;
        const e = a.target.vs;
        log(st, p, `${nm} usa Agujero bajo tierra`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        removeST(st, e, a.target.z);
        break;
      }
      case 'bigbang1': {
        markOnce(u, 'bb1');
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        log(st, p, `${nm} usa Big Bang contra ${tm ? mdef(tm).name : 'un personaje'}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (tm) destroyMonster(st, e, a.target.z, ctx);
        break;
      }
      case 'relicario':
        if (!domainOk(st, m)) break;
        markOnce(u, 'relic');
        openDomain(st, p, m, { x: g }, 'relicario');
        log(st, p, `${nm} activa Relicario Demoníaco: el campo es su dominio`);
        break;
      case 'desmantelar': {
        markOnce(u, 'desm');
        const e = a.target.vs;
        log(st, p, `${nm} usa Desmantelar`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        removeST(st, e, a.target.z);
        break;
      }
      case 'bite': {
        const ti = a.hand, anchor = titanAnchor(P, a.zone, [a.zone]);
        markOnce(u, 'bite');
        log(st, p, `${nm} se muerde la mano y pierde 500 PV`);
        lose(st, p, 500, true);
        if (st.winner !== null || !P.alive) break;
        transformInto(st, p, a.zone, ti, anchor);
        break;
      }
      case 'conc': {
        markOnce(u, 'conc'); addMod(st, m, 'conc', 400 * g, 400 * g, 2);
        log(st, p, `${nm} usa Respiración de Concentración Total: +${400 * g} ATK y DEF durante 2 turnos`);
        break;
      }
      case 'conc2': {
        markOnce(u, 'conc2'); addMod(st, m, 'conc', 400 * g, 0, 2);
        log(st, p, `${nm} usa Respiración de Concentración Total: +${400 * g} ATK durante 2 turnos`);
        break;
      }
      case 'marca': {
        markOnce(u, 'marca'); addMod(st, m, 'marca', 500 * g, 500 * g, 3).die = true;
        log(st, p, `${nm} despierta la Marca de Cazador: +${500 * g} ATK y DEF, pero morirá en 3 turnos`);
        break;
      }
      case 'desp': {
        if (a.target.vs === p && a.target.z === a.zone) break;      // revalida: Gran Patriarca no puede potenciarse a sí mismo
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        u.pat = (u.pat || 0) + 1; u.patTn = u.patT === st.turn ? (u.patTn || 0) + 1 : 1; u.patT = st.turn;
        addMod(st, tm, 'desp', 700 * g, 700 * g, 0);
        log(st, p, `${nm} despierta el poder oculto de ${mdef(tm).name}: +${700 * g} ATK y DEF (${u.pat}/${3 * g})`);
        break;
      }
      case 'odinvida': {
        const inst = P.grave.find(c => c.uid === a.u);
        if (!inst || (u.odc || 0) < 3) break;
        u.odc -= 3;
        log(st, p, `${nm} gasta 3 cargas de vida para revivir a ${def(inst).name}`);
        if (reviveInst(st, p, inst) < 0) log(st, p, 'no hay espacio en el campo');
        break;
      }
      case 'dslobos': {
        u.dsLo = true; dsUse(m, 'lobos'); dsTick(st, u);
        addMod(st, m, 'lobos', 400 * g, 400 * g, 0);
        log(st, p, `${nm} usa Lobos: +${400 * g} ATK y +${400 * g} DEF este turno`);
        break;
      }
      case 'dsnue': {
        u.dsNu = true; dsUse(m, 'nue'); dsTick(st, u);
        const e = a.target.vs, sx = st.players[e].st[a.target.z];
        log(st, p, `${nm} usa Nue`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (sx && sx.down) { P.nue = (P.nue || []).filter(n => n.uid !== sx.c.uid).concat([{ uid: sx.c.uid, vs: e, z: a.target.z }]); }
        break;
      }
      case 'dselef': {
        u.dsEle = true; dsUse(m, 'elefante'); dsTick(st, u);
        const e = a.target.vs, sx = st.players[e].st[a.target.z];
        log(st, p, `${nm} lanza al Elefante contra ${sx && !sx.down ? def(sx.c).name : 'una carta de magia/trampa'}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (sx) removeST(st, e, a.target.z);
        break;
      }
      case 'dssapo': {
        u.dsSap = true; dsUse(m, 'sapo'); dsTick(st, u);
        const e = a.target.vs, sx = st.players[e].st[a.target.z];
        log(st, p, `${nm} usa Sapo`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (sx && !sx.prison) {
          st.players[e].st[a.target.z] = null;
          sx.c.spent = false; P.hand.push(sx.c);
          st.players[e].loan = (st.players[e].loan || 0) + 1; P.loan = (P.loan || 0) - 1;      // la carta robada sigue contando para su dueño
          log(st, p, `${nm} roba ${sx.down ? 'una carta de magia/trampa' : def(sx.c).name} y la lleva a su mano`);
        }
        break;
      }
      case 'dsserp': {
        u.dsSer = true; dsUse(m, 'serpiente'); dsTick(st, u);
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        log(st, p, `${nm} usa Serpiente`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (tm) { tm.snake = { uid: m.c.uid }; log(st, p, `${tm.down ? 'Un personaje boca abajo' : mdef(tm).name} queda inmovilizado hasta que ${nm} sea destruido`); }
        break;
      }
      case 'dsmaho': {
        const hi = handIdx(P, 'c_mahoraga');
        if (hi < 0 || (u.dsU || []).length < 2) break;
        const z0 = a.zone;
        log(st, p, `${nm} se sacrifica para invocar al General Mahoraga`);
        removeMonster(st, p, z0, 'grave');
        if (P.mz[z0] || st.winner !== null) break;
        const hi2 = handIdx(P, 'c_mahoraga');
        if (hi2 < 0) break;
        const inst = P.hand.splice(hi2, 1)[0]; inst.spent = false;
        P.mz[z0] = mkSlot(st, inst, { pos: 'atk' });
        log(st, p, 'invoca especialmente (Diez Sombras) a General Mahoraga');
        entered(st, p, z0);
        log(st, p, 'Diez Sombras: la diferencia de ATK entre ambos (1700) recae en su dueño');
        lose(st, p, 1700);
        break;
      }
      case 'odinrev': {
        u.orevN = u.orevT === st.turn ? (u.orevN || 0) + 1 : 1; u.orevT = st.turn;      // una vez por turno propio
        const e = a.target.vs, tz = a.target.z;
        log(st, p, `${nm} usa Revelación divina`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (a.target.area === 'st') { if (st.players[e].st[tz] && st.players[e].st[tz].down) { log(st, e, 'una carta de magia/trampa boca abajo es revelada y destruida'); removeST(st, e, tz); } }
        else { const tm = st.players[e].mz[tz]; if (tm && tm.down) { log(st, e, `${mdef(tm).name} es revelado y destruido`); destroyMonster(st, e, tz, ctx); } }
        break;
      }
      case 'odinbend': {
        if (a.target.vs === p && a.target.z === a.zone) break;      // no se bendice a sí mismo
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        if (!tm) break;
        u.odb = (u.odb || 0) + 1; u.odbTn = u.odbT === st.turn ? (u.odbTn || 0) + 1 : 1; u.odbT = st.turn;
        addMod(st, tm, 'bend', 600 * g, 600 * g, 0);
        log(st, p, `${nm} bendice a ${mdef(tm).name}: +${600 * g} ATK y DEF permanentes (${u.odb}/${3 * g})`);
        break;
      }
      case 'kaioken': {
        markOnce(u, 'kk'); addMod(st, m, 'kaioken', 400 * g, 400 * g, 3);
        log(st, p, `${nm} usa Kaio-ken: +${400 * g} ATK y DEF durante 3 turnos`);
        break;
      }
      case 'kaioken6': {
        u.kk6 = true; addMod(st, m, 'kaioken', 400 * g, 400 * g, 3);
        log(st, p, `${nm} usa Kaio-ken: +${400 * g} ATK y DEF durante 3 turnos`);
        break;
      }
      case 'genki': {
        u.gen = true;
        log(st, p, `${nm} lanza la Genkidama`);
        genkidama(st, p, m, ctx);
        break;
      }
      case 'teach': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        tm.learn = Object.assign({}, tm.learn); tm.learn[a.skill] = true;
        u['t_' + a.skill] = true; u.tTurn = st.turn;
        log(st, p, `${nm} enseña ${a.skill === 'kaioken' ? 'el Kaio-ken' : 'la Genkidama'} a ${mdef(tm).name}`);
        break;
      }
      case 'dominio': {
        if (!domainOk(st, m)) break;
        markOnce(u, 'dom');
        openDomain(st, p, m, { x: g, min: 7, nm: 'de Jogo' }, 'dominio');
        log(st, p, `${nm} activa el dominio Ataúd de la Montaña de Hierro`);
        break;
      }
      case 'ydominio': {
        if (u.ydom || !domainOk(st, m)) break;      // revalidado al resolver: nunca dos veces por invocación
        u.ydom = true;
        openDomain(st, p, m, { x: g, min: 11, nm: 'de Yuta', noST: true }, 'ydominio');
        log(st, p, `${nm} activa el dominio Amor Mutuo y Verdadero`);
        break;
      }
      case 'llama': {
        markOnce(u, 'llama');
        const n = u.kills || 0;
        addMod(st, m, 'llama', 200 * n * g, 200 * n * g, 0);
        log(st, p, `${nm} libera la Llama Infernal con ${n} asesinato${n > 1 ? 's' : ''}: +${200 * n * g} ATK y DEF`);
        break;
      }
      case 'kform': {
        const nd = C().get(a.form);
        if (m.form) break;      // una sola transformación por invocación: el bonus nunca se aplica dos veces
        m.form = a.form;
        if (a.form === 'c_kayn_rhaast') { addMod(st, m, 'rhaast', 300, 300, 0); log(st, p, `${nm} se transforma en ${nd.name}: +300 ATK y +300 DEF`); }
        else log(st, p, `${nm} se transforma en ${nd.name}`);
        break;
      }
      case 'telar': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        u.web = (u.web || 0) + 1; u.webTn = u.webT === st.turn ? (u.webTn || 0) + 1 : 1; u.webT = st.turn;
        tm.sealed = (tm.sealed || []).concat([{ ab: a.ab, by: m.c.uid }]);
        const ar = C().AB[a.ab];
        log(st, p, `${nm} sella con sus telarañas ${ar ? ar[0] : a.ab} de ${mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'corromper': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        u.corrT = st.turn;
        if (a.ring) { const rg = ringOf(P, a.zone); if (rg) rg.ring.promesaUsed = true; }
        tm.promesa = true;
        (st.corrupt = st.corrupt || []).push({ holder: p, from: tq, uid: tm.c.uid, t0: st.turn });
        log(st, p, `${nm} le hace una Promesa de Poder a ${mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'rojo': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z], sg = a.inv ? -1 : 1;
        u.rojo = true;
        addMod(st, tm, 'rojo', -1000 * sg, -1000 * sg, 0);
        log(st, p, `${nm} lanza Rojo: ${mdef(tm).name} ${a.inv ? 'gana' : 'pierde'} 1000 ATK y 1000 DEF`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'azul': {
        u.azul = true;
        log(st, p, `${nm} lanza Azul: las magias y trampas rivales son destruidas`);
        for (const t of foeSTs(st, p)) removeST(st, t.vs, t.z);
        break;
      }
      case 'purpura': {
        u.purpura = true;
        const tq = a.target.vs, T = st.players[tq];
        if (a.target.area === 'mz') {
          const tm = T.mz[a.target.z];
          log(st, p, `${nm} lanza Púrpura: ${mdef(tm).name} es desterrado${tm.six ? ' (ni los Seis Ojos lo protegen de la Púrpura)' : ''}`);
          if (multi(st)) st.log[st.log.length - 1].q = tq;
          removeMonster(st, tq, a.target.z, 'banish', { purple: true });
        } else {
          const s2 = T.st[a.target.z];
          if (!s2) break;      // la carta ya no está (la quitó otro efecto)
          log(st, p, `${nm} lanza Púrpura: una carta de magia/trampa es desterrada`);
          if (multi(st)) st.log[st.log.length - 1].q = tq;
          T.st[a.target.z] = null; T.banish.push(s2.c);
        }
        break;
      }
      case 'avpred': {
        const tq = a.target.vs;
        m.av.n++; m.av.tn = m.av.turn === st.turn ? (m.av.tn || 0) + 1 : 1; m.av.turn = st.turn;
        log(st, p, `${nm} devora una carta mágica o trampa rival (Depredador de Magia ${m.av.n}/${3 * g})`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        removeST(st, tq, a.target.z);
        break;
      }
      case 'xform': transformInto(st, p, a.zone, a.hand, null); break;
      // ----- tanda 4 -----
      case 'majinex': {
        markOnce(u, 'mj');
        const myStars = lvl(P.mz[a.zone]);
        log(st, p, `${nm} usa Explosión final: se destruye y arrastra a todos los personajes de ${myStars}★ o menos`);
        const hits = [];
        for (let q = 0; q < st.n; q++) for (let tz = 0; tz < ZONES; tz++) { const tm = st.players[q].mz[tz]; if (tm && !(q === p && tz === a.zone) && lvl(tm) <= myStars) hits.push([q, tz, tm]); }
        removeMonster(st, p, a.zone, 'grave');
        for (const [q, tz, tm] of hits) if (st.players[q].mz[tz] === tm) destroyMonster(st, q, tz, ctx);
        break;
      }
      case 'armin': {
        const inst = P.hand[a.hand], anchor = titanAnchor(P, a.zone, [a.zone], true);
        if (!inst || inst.id !== 'c_titan_colosal' || anchor < 0 || P.lp <= 1000) break;
        markOnce(u, 'bite');
        log(st, p, `${nm} paga 1000 PV por el poder del Titán Colosal`);
        lose(st, p, 1000, true);
        if (st.winner !== null || !P.alive) break;
        transformInto(st, p, a.zone, a.hand, anchor);
        colosalBlast(st, p, anchor);
        break;
      }
      case 'manto': {
        u.mt = true;
        if (a.opt === 'xform') {
          const inst = P.hand[a.hand];
          if (!inst || inst.id !== 'c_naruto_kyuubi') break;
          log(st, p, `${nm} activa el Manto de Kyuubi`);
          transformInto(st, p, a.zone, a.hand, null);
        } else {
          m.manto = true; addMod(st, m, 'manto', 300, 300, 0);
          log(st, p, `${nm} activa el Manto de Kyuubi: +300 ATK y +300 DEF, y un manto que recibirá el golpe mortal`);
        }
        break;
      }
      case 'rasengan':
        markOnce(u, 'ras'); addMod(st, m, 'ras', 400 * g, 0, 0);
        log(st, p, `${nm} usa Rasengan: +${400 * g} ATK en su próximo ataque`);
        break;
      case 'kaiox10':
        if (!m.ksp || m.ksp.x) break;
        m.ksp.x = st.turn; addMod(st, m, 'kaiox10', 400, 400, 0);
        log(st, p, `${nm} lleva el Kaioken al límite (x10): +400 ATK y DEF más, +800 en total, hasta el final del turno`);
        break;
      // ----- tanda 3 -----
      case 'eren': {
        const inst = P.hand[a.hand], anchor = titanAnchor(P, a.zone, [a.zone]);
        if (!inst || inst.id !== 'c_titan_ataque' || anchor < 0 || P.lp <= 500) break;
        markOnce(u, 'bite');
        log(st, p, `${nm} se muerde la mano y pierde 500 PV`);
        lose(st, p, 500, true);
        if (st.winner !== null || !P.alive) break;
        transformInto(st, p, a.zone, a.hand, anchor);      // Eren queda vinculado al Titán de Ataque (como Lara con el Titán Martillo)
        break;
      }
      case 'punos': {
        u.pn = (u.pn || 0) + 1; u.pnT = st.turn;
        addMod(st, m, 'punos', 700 * g, 0, 0);
        log(st, p, `${nm} usa Endurecimiento de los puños: +${700 * g} ATK en su próximo ataque (${u.pn}/${2 * g})`);
        break;
      }
      case 'tq': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        if (!tm || u.tq) break;
        u.tq = true; u.tgR = curRound(st);
        if (tm.down) { tm.down = false; log(st, p, `${nm} usa ¡Quieto!: ${mdef(tm).name} es revelado`); }
        else { tm.pos = tm.pos === 'atk' ? 'def' : 'atk'; log(st, p, `${nm} usa ¡Quieto!: ${mdef(tm).name} pasa a ${tm.pos === 'atk' ? 'ataque' : 'defensa'}`); }
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'td': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z], sg = a.inv ? -1 : 1;
        if (!tm || tm.down || u.td) break;
        u.td = true; u.tgR = curRound(st);
        addMod(st, tm, 'debil', -500 * sg, -500 * sg, 0);
        log(st, p, `${nm} usa ¡Debilítate!: ${mdef(tm).name} ${a.inv ? 'gana' : 'pierde'} 500 ATK y 500 DEF`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'tm': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        if (!tm || tm.down || lvl(tm) > 4 || u.tm) break;
        u.tm = true; u.tgR = curRound(st);
        log(st, p, `${nm} usa ¡Muere!: ${mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        destroyMonster(st, tq, a.target.z, ctx);
        break;
      }
      case 'semilla': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        if (!tm || tm.down) break;
        const got = seedList(st, tq, a.target.z, true);
        if (!got.length) break;
        u.sdN = u.sdT === st.turn ? (u.sdN || 0) + 1 : 1; u.sdT = st.turn;
        u.seedLast = { to: mdef(tm).name, what: got };
        log(st, p, `${nm} usa Semilla del Hermitaño: ${mdef(tm).name} se recupera (${got.join(', ')})`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'armadura': {
        const tn = m.tony;
        if (!tn || tn.mat < 1 || tn.t === st.turn) break;
        tn.mat--; tn.t = st.turn; tn.arm++;
        dropMods(m, 'armadura');
        const n = (1000 + 300 * (tn.arm - 1)) * g;
        addMod(st, m, 'armadura', n, n, 0);
        if (tn.arm === 1) { m.form = 'c_tony_armadura'; log(st, p, `${nm} usa Armadura de Iron Man: construye su primera armadura (+${1000 * g} ATK y DEF)`); }
        else log(st, p, `${nm} usa Armadura de Iron Man: mejora la armadura (+${300 * g} ATK y DEF; total +${n})`);
        break;
      }
      case 'jkmove': {
        const eq = m.jk, T = P.mz[a.target.z];
        if (!eq || !T || T.down || T.fused || (T !== m && T.jk)) break;
        const i = (m.link || []).findIndex(c => c.uid === eq.uid);
        if (i < 0) break;
        const inst = m.link.splice(i, 1)[0];
        if (!m.link.length) delete m.link;
        dropMods(m, 'jake'); m.jk = null;
        const gT = gx(P, a.target.z);
        T.link = (T.link || []).concat([inst]); T.jk = { uid: inst.uid, mode: a.mode };
        addMod(st, T, 'jake', a.mode === 'sword' ? 600 * gT : 0, a.mode === 'shield' ? 500 * gT : 0, 0);
        log(st, p, `Jake el Perro pasa a ${mdef(T).name} como ${a.mode === 'sword' ? 'espada (+' + 600 * gT + ' ATK)' : 'escudo (+' + 500 * gT + ' DEF)'}`);
        break;
      }
      case 'simb': {
        const T = P.mz[a.target.z];
        if (!T || T.sym || T.fused || P.symT === st.turn || (m.link && m.link.length) || m.abs || m.fused) break;
        const tg = gx(P, a.target.z), tn = mdef(T).name;
        const taken = takeOff(st, p, a.zone, 'attach');
        if (!taken) break;
        P.symT = st.turn;
        if (taken.c.by == null) taken.c.by = taken.owner != null ? taken.owner : p;      // la carta del simbionte sigue contando para su dueño aunque el anfitrión sea de otro
        T.link = (T.link || []).concat([taken.c]); T.sym = { uid: taken.c.uid, t0: st.turn };
        const sb = SYMB[taken.c.id] || SYMB.c_venom;
        addMod(st, T, 'venom', sb[0] * tg, sb[1] * tg, 0);
        log(st, p, `${nm} usa Simbiosis: se equipa a ${tn} (+${sb[0] * tg} ATK y +${sb[1] * tg} DEF)`);
        break;
      }
      case 'robo': {
        const tq = a.target.vs, tm = st.players[tq].mz[a.target.z];
        if (!tm || tm.down || !rawAbil(tm).includes(a.ab) || rawAbil(m).includes(a.ab) || !STEALABLE.includes(a.ab) || (tm.sealed || []).some(x => x.ab === a.ab)) break;      // sin nada que robar no gasta el uso
        u.syN = u.syT === st.turn ? (u.syN || 0) + 1 : 1; u.syT = st.turn;
        m.ext = (m.ext || []).concat([a.ab]); m.extFrom = Object.assign({}, m.extFrom); m.extFrom[a.ab] = mdef(tm).name;
        m.c.keep = (m.c.keep || []).concat([{ id: a.ab, from: mdef(tm).name }]);
        log(st, p, `${nm} usa Robo de habilidades: copia ${(C().AB[a.ab] || [a.ab])[0]} de ${mdef(tm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = tq;
        break;
      }
      case 'tgmente': case 'tgtiempo': {
        const gi = (m.gemsIdle || []).find(x => x.uid === a.gem), li = (m.link || []).findIndex(c => c.uid === a.gem);
        if (!gi || li < 0) break;
        const inst = m.link.splice(li, 1)[0]; if (!m.link.length) delete m.link;
        m.gemsIdle = m.gemsIdle.filter(x => x.uid !== a.gem); if (!m.gemsIdle.length) delete m.gemsIdle;
        const gnm = def(inst).name;
        if (a.pw === 'tgmente') {                        // Gema de la Mente robada: se elige a quién controla; pasa a ser una Mente normal en tu campo de magias
          const tm = st.players[a.target.vs].mz[a.target.z], z = firstFree(P.st);
          if (!tm || z < 0) { m.link = (m.link || []).concat([inst]); m.gemsIdle = (m.gemsIdle || []).concat([gi]); break; }
          P.st[z] = { c: inst, down: false, setTurn: st.turn, equipTo: a.zone, stolen: true, gem: { vs: a.target.vs, uid: tm.c.uid, uses: 0, usedTurn: -1 } };
          log(st, p, `${nm} usa ${gnm}: controla la mente de ${mdef(tm).name}`);
          if (multi(st)) st.log[st.log.length - 1].q = a.target.vs;
        } else {                                         // Gema del Tiempo robada: retrocede el campo y va al cementerio
          P.grave.push(inst);
          log(st, p, `${nm} usa ${gnm}`);
          rewindField(st, p);
        }
        break;
      }
      // ----- tanda 6 -----
      case 'astaneg': case 'astauni': case 'sjmon': {
        const carry = { sjc: m.sjc };
        delete m.astaW;
        transformInto(st, p, a.zone, a.hand, null);
        const nm2 = P.mz[a.zone];
        if (nm2 && carry.sjc) nm2.sjc = carry.sjc;      // las cargas de sombra pasan al Monarca
        break;
      }
      case 'astacausa': {
        m.c.ecU = true;
        const names = [];
        for (const t of allyChars(st, p)) { const got = cleanse(st, t.vs, t.z); if (got.length) names.push(mdef(st.players[t.vs].mz[t.z]).name); }
        log(st, p, `${nm} usa la Espada Destructora de Causas: ${names.length ? names.join(', ') + ' quedan libres de efectos negativos' : 'no había efectos negativos'}`);
        break;
      }
      case 'sjarmy': {
        const G = st.players[a.g], i = G ? G.grave.findIndex(c => c.uid === a.u) : -1;
        if (i < 0 || (m.sjc || 0) < 2) break;
        const inst = G.grave[i], cd = def(inst), zz = spot(P, cd);
        if (zz < 0) break;
        G.grave.splice(i, 1); inst.spent = false; m.sjc -= 2;
        const o = { pos: 'atk', wide: !!cd.wide, shadow: true };
        if (a.g !== p) o.owner = a.g;
        P.mz[zz] = mkSlot(st, inst, o);
        shadeEssence(P.mz[zz]);
        log(st, p, `${nm} usa Ejército de las sombras: ${cd.name} se alza como soldado de las sombras`);
        if (multi(st) && a.g !== p) st.log[st.log.length - 1].q = a.g;
        entered(st, p, zz);
        break;
      }
      case 'sjigris': case 'sjberu': case 'sjbellion': {
        u[a.pw === 'sjigris' ? 'sjiT' : a.pw + 'T'] = st.turn;
        const src = a.from === 'deck' ? P.deck : a.from === 'grave' ? P.grave : P.hand, i = src.findIndex(c => c.uid === a.u);
        if (i < 0 || spot(P, def(src[i])) < 0) break;
        const inst = src.splice(i, 1)[0];
        if (a.from === 'deck') shuffle(st, P.deck);
        log(st, p, `${nm} llama a ${def(inst).name}${a.from === 'grave' ? ' desde el cementerio' : a.from === 'deck' ? ' desde el mazo' : ''}`);
        const zz = specialSummon(st, p, inst, 'atk'), sm = P.mz[zz];
        if (sm && sm.c.uid === inst.uid) {
          sm.bySung = true; shadeEssence(sm);
          if (inst.id === 'c_igris') { addMod(st, sm, 'leal', 400, 400, 0); log(st, p, 'Lealtad al Monarca: Igris gana +400 ATK y +400 DEF'); }
          if (inst.id === 'c_beru') { addMod(st, sm, 'leal', 500, 0, 0); sm.xtra = { t: st.turn, n: 1 }; log(st, p, 'Lealtad al Monarca: Beru gana +500 ATK y un ataque extra este turno'); }
          if (inst.id === 'c_bellion') log(st, p, 'Lealtad al Monarca: tus soldados de las sombras ganan +300 ATK y +300 DEF mientras Bellion siga en el campo');
        }
        break;
      }
      case 'kaisel': {
        const src = a.from === 'grave' ? P.grave : P.hand, i = src.findIndex(c => c.uid === a.u);
        if (i < 0 || spot(P, def(src[i])) < 0) break;
        P.kaT = st.turn;
        const inst = src.splice(i, 1)[0];
        log(st, p, `${nm}: Montura de las Sombras, Kaisel acude${a.from === 'grave' ? ' desde el cementerio' : ''}`);
        specialSummon(st, p, inst, 'atk');
        break;
      }
      case 'kaiselvuelo': {
        const tp = a.target.vs, tm = st.players[tp].mz[a.target.z];
        if (!tm) break;
        u.kvT = st.turn;
        tm.fly = { t0: st.turn };
        log(st, p, `${nm} sube a ${tm.down ? 'un aliado' : mdef(tm).name} a su espalda: no se le puede atacar hasta el próximo turno de su controlador`);
        break;
      }
      case 'rsalv': u.fer -= 2; addMod(st, m, 'salv', 600 * 1, 0, 0); log(st, p, `${nm} usa Salvajismo: +600 ATK permanente (ferocidad ${u.fer})`); break;
      case 'rrug': {
        u.fer -= 2;
        const got = seedList(st, p, a.zone, true, true);
        log(st, p, `${nm} ruge: se libera de ${got.length ? got.join(', ') : 'todo efecto negativo'} (ferocidad ${u.fer})`);
        break;
      }
      case 'rcam': u.fer -= 2; m.camu = true; log(st, p, `${nm} se camufla: inmune a las magias y trampas enemigas (ferocidad ${u.fer})`); break;
      case 'rred': {
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        if (!tm) break;
        u.fer -= 2;
        (tm.binds = tm.binds || []).push({ atk: true, ab: true, pos: true, n: 3, t0: st.turn, nm: 'la Bola de Red' });
        log(st, p, `${nm} lanza la Bola de Red sobre ${tm.down ? 'un personaje boca abajo' : mdef(tm).name}: 3 turnos sin atacar, cambiar de posición ni usar habilidades (ferocidad ${u.fer})`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        break;
      }
      case 'rcaza': {
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        if (!tm) break;
        u.rcT0 = st.turn;
        m.fly = { t0: st.turn };
        m.prey = { vs: e, uid: tm.c.uid };
        log(st, p, `${nm} se oculta y elige a ${mdef(tm).name} como su presa`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        break;
      }
      case 'hakdom': {
        if (!domainOk(st, m)) break;
        markOnce(u, 'hdm');
        openDomain(st, p, m, { x: g, min: lvl(m), nm: 'de Hakari' }, 'hakdom');
        log(st, p, `${nm} expande su dominio: Apuesta Mortal`);
        break;
      }
      case 'hruleta': {
        if (!st.domain || st.domain.uid !== m.c.uid) break;
        u.hrT = st.turn;
        const r = rnd(st), n = r < 1 / 3 ? 1 : r < 2 / 3 ? 2 : 3;
        for (let i = 0; i < n; i++) addMod(st, m, 'hk', 500, 0, 2);
        m.hl = (m.hl || 0) + n;
        log(st, p, `${nm} gira la ruleta: ${n === 1 ? 'Sin premio' : n === 2 ? '¡Casi Jackpot!' : '¡¡JACKPOT!!'} (+${n} carga${n > 1 ? 's' : ''}: ${n} vida${n > 1 ? 's' : ''} extra y +${500 * n} ATK durante 2 turnos)`);
        st.log[st.log.length - 1].roul = n;
        break;
      }
      case 'salaf': m.sc -= 1; addMod(st, m, 'salaf', 800, 0, 0); log(st, p, `${nm}: Entrenamiento físico (+800 ATK permanente)`); break;
      case 'salar': m.sc -= 1; m.sres = true; log(st, p, `${nm}: Resistencia extrema (resistirá una destrucción)`); break;
      case 'salad': m.sc -= 2; m.sdom = { t0: st.turn }; log(st, p, `${nm}: Dominio de combate (podrá activar una habilidad adicional en su próximo turno)`); break;
      case 'nearmira': {
        u.nmT = st.turn;
        const e = a.target.vs, tc = a.target.area === 'st' ? st.players[e].st[a.target.z] : st.players[e].mz[a.target.z];
        if (!tc) break;
        P.eyes = (P.eyes || []).filter(x => x.uid !== tc.c.uid).concat([{ uid: tc.c.uid, vs: e }]);
        const isTrap = a.target.area === 'st' && def(tc.c).kind === 'trap';
        if (isTrap) tc.inv = { by: m.c.uid };
        log(st, p, `${nm} investiga en secreto una carta boca abajo${isTrap ? ' y le deja un contador de investigación' : ''}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        break;
      }
      case 'kzfuego': {
        u.kzmT = st.turn;
        const e = a.target.vs, tm = st.players[e].mz[a.target.z];
        if (!tm) break;
        addMod(st, tm, 'kzfuego', -400, 0, 0);
        log(st, p, `${nm} usa la máscara de Fuego: ${tm.down ? 'un personaje boca abajo' : mdef(tm).name} pierde 400 ATK`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        break;
      }
      case 'kzviento': u.kzmT = st.turn; addMod(st, m, 'kzviento', 500, 0, 0); log(st, p, `${nm} usa la máscara de Viento: +500 ATK durante su próximo combate`); break;
      case 'kzrayo': {
        u.kzmT = st.turn;
        const e = a.target.vs, sx = st.players[e].st[a.target.z];
        log(st, p, `${nm} usa la máscara de Rayo contra ${sx && !sx.down ? def(sx.c).name : 'una carta de magia/trampa'}`);
        if (multi(st)) st.log[st.log.length - 1].q = e;
        if (sx) removeST(st, e, a.target.z);
        break;
      }
      case 'kzagua': u.kzmT = st.turn; m.kzwater = st.turn; log(st, p, `${nm} usa la máscara de Agua: ningún efecto enemigo lo afecta en su ataque de este turno`); break;
      case 'kameha':
        markOnce(u, 'kame'); addMod(st, m, 'kame', 300, 0, 0);
        log(st, p, `${nm} usa Kamehameha: +300 ATK en su próximo ataque`);
        break;
      case 'bulmagen': {
        u.bgT = st.turn;
        const c = P.deck.filter(i => def(i).kind === 'spell');
        log(st, p, `${nm} usa Genio científico`);
        if (c.length) st.pending = { k: 'pick', player: p, zone: 'deck', cands: c.map(i => i.uid), cont: 'bulma' };
        break;
      }
      case 'satanpub': {
        u.spT = st.turn;
        const tm = st.players[a.target.vs].mz[a.target.z];
        if (tm) { tm.pub = p; log(st, p, `${nm} presume de haber derrotado a ${mdef(tm).name}: las habilidades enemigas no pueden elegirlo hasta tu siguiente turno`); }
        break;
      }
      case 'elizluz': {
        u.elT = st.turn;
        const it = negList(st, a.target.vs, a.target.z).find(x => x.k === a.k);
        if (it) { it.rm(); log(st, p, `${nm} usa Luz purificadora: ${mdef(st.players[a.target.vs].mz[a.target.z]).name} se libera de ${it.nm}`); }
        break;
      }
      case 'galco':
        u.gco = (u.gco || 0) - 2;
        m.xtra = { t: st.turn, n: (m.xtra && m.xtra.t === st.turn ? m.xtra.n : 0) + 1 };
        log(st, p, `${nm} usa Critical Over: gasta 2 cargas y puede atacar otra vez este turno`);
        break;
      case 'galcaza':
        u.gczT = st.turn; addMod(st, m, 'caza', 400, 0, 0);
        log(st, p, `${nm} usa Caza Implacable: +400 ATK en su próximo ataque`);
        break;
      case 'higudom': {
        if (!domainOk(st, m)) break;
        markOnce(u, 'hdom');
        openDomain(st, p, m, { x: g, min: lvl(m) + 1, nm: 'de Higuruma', noST: true, higu: { k: 0, sword: false } }, 'higudom');
        log(st, p, `${nm} activa el dominio Sentencia Mortal: las magias equipadas quedan anuladas`);
        break;
      }
      case 'tobidim': {
        u.tdT = st.turn;
        const q = a.target.vs, tm = st.players[q].mz[a.target.z];
        log(st, p, `${nm} usa Dimensión Kamui`);
        if (multi(st)) st.log[st.log.length - 1].q = q;
        if (tm) toLimbo(st, q, a.target.z, 'end', 0, 'Dimensión Kamui');
        break;
      }
      case 'tinta': {
        u.tiT = st.turn;
        const tid = a.opt === 'leon' ? 'c_tinta_leon' : a.opt === 'aguila' ? 'c_tinta_aguila' : 'c_tinta_serpiente', zz = spot(P, def({ id: tid }));
        if (zz < 0) break;
        P.mz[zz] = mkSlot(st, { uid: st.nextUid++, id: tid, virt: true }, { pos: 'atk' });
        log(st, p, `${nm} usa Súper Bestias de Tinta: crea ${def({ id: tid }).name}`);
        const tm = a.target && st.players[a.target.vs].mz[a.target.z];
        if (tm && a.opt === 'aguila') { (tm.binds = tm.binds || []).push({ atk: true, n: 1, t0: st.turn, nm: 'el Águila de tinta' }); log(st, p, `${tm.down ? 'Un personaje boca abajo' : mdef(tm).name} no podrá atacar en el siguiente turno de su controlador`); }
        if (tm && a.opt === 'serp') { const sg = a.inv ? 500 : -500; addMod(st, tm, 'serptinta', sg, 0, 2); log(st, p, a.inv ? `La Gema de la Realidad invierte la Serpiente de tinta: ${mdef(tm).name} gana 500 ATK durante 2 turnos` : `La Serpiente de tinta muerde a ${tm.down ? 'un personaje boca abajo' : mdef(tm).name}: −500 ATK durante 2 turnos`); }
        break;
      }
      case 'shikasomb': {
        u.ssT = st.turn;
        const tm = st.players[a.target.vs].mz[a.target.z];
        if (tm) { (tm.binds = tm.binds || []).push({ atk: true, ab: true, n: 1, t0: st.turn, nm: 'la Posesión de sombras' }); log(st, p, `${nm} usa Posesión de sombras: ${tm.down ? 'un personaje boca abajo' : mdef(tm).name} no podrá atacar ni usar habilidades en el siguiente turno de su controlador`); }
        if (multi(st)) st.log[st.log.length - 1].q = a.target.vs;
        break;
      }
      case 'liukang':
        u.liu = true; m.liu = st.turn;
        log(st, p, `${nm} usa Patadas Continuas: puede atacar hasta 3 veces este turno`);
        break;
      case 'misaojos': {
        u.moN = u.moT === st.turn ? (u.moN || 0) + 1 : 1; u.moT = st.turn;
        const tm = st.players[a.target.vs][a.target.area === 'st' ? 'st' : 'mz'][a.target.z];
        log(st, p, `${nm} usa los Ojos de Shinigami`);
        if (tm && tm.down) P.eyes = (P.eyes || []).filter(x => x.uid !== tm.c.uid).concat([{ uid: tm.c.uid, vs: a.target.vs }]);
        break;
      }
      case 'misadn': {
        u.mdR = curRound(st);
        const tm = st.players[a.target.vs].mz[a.target.z];
        if (tm) { tm.dn = { by: p }; log(st, p, `${nm} escribe en la Death Note: ${tm.down ? 'un personaje boca abajo' : mdef(tm).name} morirá durante el turno de su dueño`); }
        if (multi(st)) st.log[st.log.length - 1].q = a.target.vs;
        break;
      }
      case 'katana': {
        const s = P.st[a.stz], tm = st.players[a.target.vs].mz[a.target.z];
        if (s) s.ktT = st.turn;
        if (tm && !(tm.spentAb || []).includes(a.ab)) { tm.spentAb = (tm.spentAb || []).concat([a.ab]); log(st, p, `La Katana de la Antimagia de ${nm} destruye ${(C().AB[a.ab] || [a.ab])[0]} de ${mdef(tm).name} durante el resto de su invocación`); }
        if (multi(st)) st.log[st.log.length - 1].q = a.target.vs;
        break;
      }
      case 'kurama': {
        uOf(m).kur = true;
        addMod(st, m, 'kurama', 600 * g, 600 * g, 2);
        log(st, p, `${nm} usa Chakra de Kurama: +${600 * g} ATK y DEF durante 2 turnos`);
        break;
      }
      case 'copy': {
        // Copia el estado del objetivo en este momento: forma (nombre, tipo, estrellas, habilidades) y ATK/DEF finales.
        const q = a.target.vs, tz = a.target.z, PT = st.players[q], tm = PT.mz[tz], nd = mdef(tm), oldName = def(m.c).name;
        const fin = { atk: atkOf(st, PT, tz), def: defOf(st, PT, tz) };
        const tmpF = tm.fur === st.turn ? 700 : 0, tmpD = st.domain && st.domain.uid === tm.c.uid ? 500 : 0;   // lo temporal se copia aparte para que termine a su hora
        if (m.abs) releaseAbsorbed(st, m);
        m.bonus = null; m.cFury = null; m.cDom = null;
        m.ext = (tm.ext || []).slice(); m.extFrom = Object.assign({}, tm.extFrom || {});
        m.copy = nd.id; m.copyTurn = st.turn;
        const nat = { atk: atkOf(st, P, a.zone), def: defOf(st, P, a.zone) };      // lo que Shang ya tiene con esa forma (sus propios equipos, etc.)
        m.bonus = { atk: fin.atk - tmpF - tmpD - nat.atk, def: fin.def - tmpF - tmpD - nat.def };
        if (tmpF) m.cFury = st.turn;
        if (tmpD) m.cDom = st.domain.uid;
        log(st, p, `${oldName} se transforma en ${nd.name}`);
        if (multi(st)) st.log[st.log.length - 1].q = q;
        break;
      }
    }
  }
  /** Genkidama: 2500 de daño a cada personaje rival (no se elige objetivo); lo que no resiste, muere. */
  function genkidama(st, p, m, ctx, victims) {
    for (const e of (victims || foes(st, p))) for (let z = 0; z < ZONES; z++) {
      const E = st.players[e], tm = E.mz[z];
      if (!tm || tm.six) continue;
      const nmT = mdef(tm).name, sh = shieldInfo(st, E, z);
      if (sh) {
        const left = Math.max(0, sh.cur - 2500);
        sh.set(left);
        log(st, e, left > 0 ? `El escudo de ${nmT} recibe 2500 de daño (${left}/${sh.max})` : `El escudo de ${nmT} se destruye`);
        if (!left) shieldBroken(st, e, z, sh);
        continue;
      }
      const hold = tm.down || tm.pos === 'def' ? defOf(st, E, z) : atkOf(st, E, z);
      if (2500 >= hold && !(tm.pos === 'def' && 2500 === hold)) { if (destroyMonster(st, e, z, ctx)) log(st, -1, `${nmT} es destruido por la Genkidama`); }
      else log(st, e, `${nmT} resiste la Genkidama`);
    }
  }
  /** Un escudo llegó a cero: el de Susano sale del campo (con su armadura) y el de Shen desaparece. */
  function shieldBroken(st, p, z, sh) {
    const P = st.players[p], m = P.mz[z];
    if (sh.kind === 'susano') { const i = P.st.indexOf(sh.slot); if (i >= 0) { P.st[i] = null; P.grave.push(sh.slot.c); log(st, p, 'Susano se destruye'); } }
    else if (sh.kind === 'shen' && m) m.shen = null;
  }
  /** Transformación con vínculo: la carta de la mano ocupa el sitio del monstruo, que queda vinculado a ella. */
  function transformInto(st, p, z, hi, anchor) {
    const P = st.players[p], old = P.mz[z], oldName = mdef(old).name;
    const inst = P.hand.splice(hi, 1)[0], nd = def(inst);
    inst.spent = false;
    const link = [old.c].concat(old.link || []);
    let nz = z;
    if (nd.wide) { nz = anchor != null && anchor >= 0 ? anchor : titanAnchor(P, z, [z], nd.huge); }
    P.mz[z] = null;
    P.mz[nz] = mkSlot(st, inst, { pos: old.pos, down: false, summonedTurn: old.summonedTurn, attacked: old.attacked, atkN: old.atkN, moved: old.moved, atkMod: old.atkMod || 0, owner: old.owner, link, since: st.turn, wide: !!nd.wide });
    // los equipos siguen a la nueva forma
    for (const s of P.st) if (s && !s.down && s.equipTo === z) { s.equipTo = nz; if (s.bearer === old.c.uid) s.bearer = inst.uid; if (s.karma && s.karma.phase === 'ally') s.karma.allyUid = inst.uid; }
    if (st.domain && st.domain.uid === old.c.uid) st.domain = null;
    log(st, p, `${oldName} se transforma en ${nd.name}`);
    mahoragaCall(st, p, P.mz[nz]);      // llegar a 10★ o más transformándose también es invocar desde la mano
  }
  function doSpower(st, p, a) {
    const P = st.players[p], s = P.st[a.zone], nm = def(s.c).name;
    if (a.pw === 'almaus') {
      const id = s.alma.eff.splice(a.idx, 1)[0], cd = C().get(id);
      s.alma.usedTurn = st.turn;
      log(st, p, `usa ${nm}: libera el efecto de ${cd.name}`);
      // El efecto liberado se trata como si se usara esa magia: pasa por la X, Total Counter, Repulsión divina, Sharingan, Conejos, Rika, etc.
      // La carta es virtual (no existe en ningún mazo): sweep la quita de cementerios y destierros.
      st.chain = { p, inst: { uid: st.nextUid++, id, virt: true }, target: a.target || null, negated: false, unstop: !!cd.unstop, alma: true };
      if (openWindow(st, 'spell', { k: 'spell', by: p })) return;
      continueSpell(st);
      return;
    }
    if (a.pw === 'storm1' || a.pw === 'storm2') {
      const e = a.target.vs, inst = P.hand.splice(a.hand, 1)[0];
      s.storm.usedTurn = st.turn;
      P.grave.push(inst);
      log(st, p, `usa ${nm}: sacrifica ${def(inst).name}`);
      if (multi(st)) st.log[st.log.length - 1].q = e;
      if (a.pw === 'storm1') {
        const tm = st.players[e].mz[a.target.z];
        if (tm) { log(st, e, `${mdef(tm).name} es asesinado`); destroyMonster(st, e, a.target.z, { src: 'spell', bp: p }); }
      } else if (st.players[e].st[a.target.z]) { log(st, e, 'una carta de magia/trampa es destruida'); removeST(st, e, a.target.z); }
      // Un solo uso en toda su estancia en el campo: tras resolver, va al cementerio (una sola vez)
      if (P.st[a.zone] === s) { removeST(st, p, a.zone); log(st, p, `${nm} se envía al cementerio`); }
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
    st.seq = (st.seq || 0) + 1;   // cuenta cada acción hecha: reinicia el contador de inactividad del turno
    const P = st.players[p];
    switch (a.t) {
      case 'summon': placeMonster(st, p, a.hand, a.tributes, false, a.fz != null ? { vs: a.vs, fz: a.fz } : null); break;
      case 'set': placeMonster(st, p, a.hand, a.tributes, true); break;
      case 'couple': coupleAV(st, p, a.hand, a.host, a.tributes); break;
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
        mahoragaCall(st, p, m);
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
      case 'power': runPower(st, p, a); break;
      case 'spow': doSpower(st, p, a); break;
      case 'toBattle': {
        st.phase = 'battle'; log(st, p, 'pasa a la fase de batalla');
        if (P.mz.some((m, z) => m && eqWith(st, P, z, 'causas').length)) {        // Espada Destructora de Causas
          const names = [];
          for (const t of allyChars(st, p)) if (t.vs === p && cleanse(st, p, t.z).length) names.push(mdef(P.mz[t.z]).name);
          log(st, p, `La Espada Destructora de Causas purifica a tus personajes${names.length ? ': ' + names.join(', ') : ' (no había efectos negativos)'}`);
        }
        break;
      }
      case 'attack':
        if (a.hira) hiraAttack(st, p, a);
        else {
          if (a.dragon) { const dm = P.mz[a.zone]; uOf(dm).pdr = true; log(st, p, `${mdef(dm).name} usa Puño del Dragón: atraviesa ${a.dragon.length + 1} casillas en el mismo ataque`); }
          declareAttack(st, p, a.zone, a.target, a.vs, a.dragon && a.dragon.map(x => ({ vs: x.vs != null ? x.vs : foeOf(st, p, null), z: x.z })));
          if (a.strip && st.atk) st.atk.strip = true;
        }
        break;
      case 'fusion': {
        const inst = P.hand.splice(a.hand, 1)[0], g = P.mz[a.gz], v = P.mz[a.vz];
        const links = [g.c, v.c].concat(g.link || [], v.link || []);
        takeOff(st, p, a.gz, 'link'); takeOff(st, p, a.vz, 'link');
        log(st, p, 'Goku y Vegeta se fusionan');
        const z = specialSummon(st, p, inst, 'atk');
        if (P.mz[z]) P.mz[z].link = links;
        break;
      }
      case 'attach': attachCard(st, p, a.hand, a.host, a.mode); break;
      case 'endTurn': endTurn(st); break;
      case 'respond': {
        const pd = st.pending; st.pending = null;
        if (a.activate) {
          const s = P.st[a.zone], d = def(s.c);
          log(st, p, `activa la trampa ${d.name}`);
          P.st[a.zone] = null; P.grave.push(s.c);
          pd.opt = a.opt;
          if (s.inv) {      // Near: Estrategia de N
            const nn = nearFor(st, p, s);
            if (nn) { st.pending = { k: 'ability', ab: 'near', player: nn.q, nz: nn.z, stage: 'ask', tp: p, tid: d.id, rp: pd, nm: d.name, opts: ['prev'].concat(trapAlts(st, p, d, pd).length ? ['manip'] : []), uid: st.players[nn.q].mz[nn.z].c.uid }; break; }
          }
          if (d.fx === 'realidad' && gloveTrapOffer(st, p, d, s, pd)) break;
          if (nextWindow(st, 'trap', { k: 'trapAct', by: p, rp: pd, tid: d.id }, foes(st, p))) break;      // X puede cancelar la trampa
          trapResolve(st, p, d, pd, []);
        } else respondRest(st, pd);
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
        } else if (pd.cont === 'searchSpell') {
          const i = P.deck.findIndex(c => c.uid === a.uid);
          if (i >= 0) { const c = P.deck.splice(i, 1)[0]; P.hand.push(c); shuffle(st, P.deck); log(st, p, 'agrega una magia de su mazo a la mano'); }
        } else if (pd.cont === 'invite') {
          const i = P.deck.findIndex(c => c.uid === a.uid);
          if (i >= 0 && spot(P, def(P.deck[i])) >= 0) { const c = P.deck.splice(i, 1)[0]; shuffle(st, P.deck); specialSummon(st, p, c, a.pos === 'def' ? 'def' : 'atk'); }
        } else if (pd.cont === 'eliz') {
          const i = P.grave.findIndex(c => c.uid === a.uid);
          if (i >= 0) { const c = P.grave.splice(i, 1)[0]; c.spent = false; P.hand.push(c); log(st, p, `Poder de la Diosa: ${def(c).name} vuelve del cementerio a la mano`); }
        } else if (pd.cont === 'bulma') {
          const i = P.deck.findIndex(c => c.uid === a.uid);
          if (i >= 0) {
            const c = P.deck.splice(i, 1)[0]; P.hand.push(c); shuffle(st, P.deck);
            log(st, p, `Genio científico: muestra ${def(c).name} y la agrega a su mano`);
            const hs = P.hand.map(x => x.uid);
            if (hs.length) st.pending = { k: 'pick', player: p, zone: 'hand', cands: hs, cont: 'bulmabot' };
          }
        } else if (pd.cont === 'bulmabot') {
          const i = P.hand.findIndex(c => c.uid === a.uid);
          if (i >= 0) { const c = P.hand.splice(i, 1)[0]; P.deck.push(c); log(st, p, 'pone una carta de su mano al fondo del mazo'); }
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
    // ----- tanda 6 -----
    if (pd.ab === 'antimag') {                                 // Espada de la antimagia
      const am = P.mz[pd.zy], s = pd.stz != null ? P.st[pd.stz] : null;
      if (a.use && am && (s || has(st, am, 'antimagia'))) {
        if (s) s.amT = st.turn; else uOf(am).amT = st.turn;
        if (pd.kind === 'spell') { const ch = pd.ch; st.players[ch.p].grave.push(ch.inst); lose(st, ch.p, def(ch.inst).self || 0, true); log(st, p, `${mdef(am).name} usa la Espada de la antimagia: anula ${pd.nm}`); }
        else { blockPw(st, pd.pp, pd.pa); log(st, p, `${mdef(am).name} usa la Espada de la antimagia: anula ${pd.nm}; no se puede volver a usar este turno`); }
        return;
      }
      if (pd.kind === 'spell') { pd.ch.done = (pd.ch.done || []).concat('anti'); st.chain = pd.ch; continueSpell(st); }
      else runPower(st, pd.pp, pd.pa, (pd.done || []).concat('anti'));
      return;
    }
    if (pd.ab === 'shikaestr') {                               // Shikamaru: Estratega brillante
      const sk = P.mz[pd.zy], um = st.players[pd.pp].mz[pd.pa.zone];
      if (a.use && sk && um) { uOf(sk).seT = st.turn; um.atkMod = (um.atkMod || 0) - 400; log(st, p, `${mdef(sk).name} se anticipa (Estratega brillante): ${mdef(um).name} pierde 400 ATK hasta el final del turno`); }
      runPower(st, pd.pp, pd.pa, (pd.done || []).concat('shika'));
      return;
    }
    if (pd.ab === 'shadowred') {                               // Sung Jin-Woo / Igris
      const use = a.pick != null && pd.opts.includes(a.pick);
      if (pd.kind === 'attack') {
        const a0 = pd.a;
        if (use) { const sz = a0.target, nz = shadowDo(st, p, sz, a.pick); if (nz >= 0) { galandHit(st, a0, p, a.pick.startsWith('swap') ? +a.pick.split(':')[1] : sz); a0.target = nz; } }
        st.atk = a0; continueAttack(st);
      } else if (pd.kind === 'spell') {
        const ch = pd.ch;
        if (use) { const nz = shadowDo(st, p, pd.vz, a.pick); if (nz >= 0) { ch.target = Object.assign({}, ch.target, def(ch.inst).fx === 'voto' ? { ez: nz } : { z: nz }); } }
        st.chain = ch; continueSpell(st);
      } else {
        const pa = pd.pa;
        if (use) { const nz = shadowDo(st, p, pa.target.z, a.pick); if (nz >= 0) pa.target = Object.assign({}, pa.target, { z: nz }); }
        runPower(st, pd.pp, pa, (pd.done || []).concat('shr'));
      }
      return;
    }
    if (pd.ab === 'bulma') {                                   // Bulma: Inventora de emergencia
      const b = P.mz[pd.zy];
      if (a.use && b && has(st, b, 'bulmasav') && !b.c.bmU) {
        b.c.bmU = true;
        log(st, p, `${mdef(b).name} se sacrifica (Inventora de emergencia): ${pd.nm} se salva y el ataque se cancela`);
        removeMonster(st, p, pd.zy, 'grave');
        noteSaved(st, pd.nm);
        atkDone(st, pd.a);
        return;
      }
      st.atk = Object.assign({}, pd.a, { noBulma: true }); continueAttack(st);
      return;
    }
    if (pd.ab === 'tobimm') {                                  // Tobi: Maestro de la manipulación
      const c = (pd.cands || []).find(x => x.vs === a.vs && x.z === a.z), tm = c && st.players[c.vs].mz[c.z];
      if (!c) { st.pending = pd; return; }
      if (tm) { tm.tobiNA = { uid: pd.uid, t: st.turn }; log(st, p, `Maestro de la manipulación: ${tm.down ? 'un personaje boca abajo' : mdef(tm).name} no podrá atacar a Tobi en el siguiente turno de su controlador`); }
      return;
    }
    if (pd.ab === 'gem') {
      const s = P.st[pd.stz];
      if (a.use && s && s.gem) {
        s.gem.uses++; s.gem.usedTurn = st.turn;
        if (st.atk) st.atk.negated = true;
        log(st, p, 'La Gema de la Mente cancela el ataque');
        if (s.gem.uses >= 2) { P.st[pd.stz] = null; P.grave.push(s.c); log(st, p, 'La Gema de la Mente se destruye tras su segundo uso'); }
        if (st.atk) { const a0 = st.atk; st.atk = null; atkDone(st, a0); }
        return;
      }
      togeWindow(st, pd.cont.by);
      return;
    }
    if (pd.ab === 'uicont') {                                  // Goku Ultra Instinto: Contraataque instintivo
      const gm = slotByUid(st, p, pd.uid), a0 = st.atk, at = a0 && st.players[a0.p].mz[a0.z];
      if (a.use && gm && !gm.m.down && a0 && at) {
        uOf(gm.m).ucT = st.turn; galandHit(st, a0, p, gm.z);
        log(st, p, `${mdef(gm.m).name} interviene y responde en lugar del aliado: el ataque de ${mdef(at).name} se cancela`);
        st.atk = null; atkDone(st, a0);
        resolveCombat(st, { p, z: gm.z, target: a0.z, vs: a0.p });
        return;
      }
      if (a0) a0.uiDone = true;
      attackWindows(st, pd.cont.by);
      return;
    }
    if (pd.ab === 'gravrew') {
      const g = slotByUid(st, p, pd.uid), m = g && g.m;
      if (m && m.gr && ['vel', 'res', 'pod'].includes(a.pick)) {
        m.gr = null;
        if (a.pick === 'vel') { m.gv = true; log(st, p, `${mdef(m).name} termina el entrenamiento: Velocidad (sus ataques no son afectados por trampas)`); }
        else if (a.pick === 'res') { m.gres = true; log(st, p, `${mdef(m).name} termina el entrenamiento: Resistencia (inmune a las magias enemigas)`); }
        else { m.gpow = true; addMod(st, m, 'gpod', 900, 0, 0); log(st, p, `${mdef(m).name} termina el entrenamiento: Poder (+900 ATK y sus ataques ignoran las bonificaciones del enemigo)`); }
      }
      return;
    }
    if (pd.ab === 'near') {                                    // Estrategia de N: Previsión (cancela) o Manipulación (otro objetivo)
      const nm = P.mz[pd.nz], d = C().get(pd.tid);
      const go = pd2 => { if (nextWindow(st, 'trap', { k: 'trapAct', by: pd.tp, rp: pd.rp, tid: pd.tid, nearDone: true }, foes(st, pd.tp))) return; trapResolve(st, pd.tp, d, pd.rp, []); };
      if (pd.stage === 'target') {
        const c = (pd.cands || []).find(x => x.vs === a.vs && x.z === a.z);
        if (c && nm) { uOf(nm).nsT = st.turn; pd.rp.opt = { vs: c.vs, z: c.z }; log(st, p, `${mdef(nm).name} usa Manipulación: cambia el objetivo de ${pd.nm}`); }
        return go();
      }
      if (nm && a.pick === 'prev') {
        uOf(nm).nsT = st.turn;
        log(st, p, `${mdef(nm).name} usa Previsión: ${pd.nm} es cancelada`);
        respondRest(st, pd.rp);
        return;
      }
      if (nm && a.pick === 'manip') {
        const alts = trapAlts(st, pd.tp, d, pd.rp);
        if (alts.length) { st.pending = Object.assign({}, pd, { stage: 'target', cands: alts }); return; }
      }
      return go();
    }
    if (pd.ab === 'uidef') {                                   // Goku Ultra Instinto: Defensa instintiva
      const gm = P.mz[pd.zy], k = pd.kind;
      if (a.use && gm && has(st, gm, 'uidef')) {
        uOf(gm).udT = st.turn;
        log(st, p, `${mdef(gm).name} usa Defensa instintiva: destruye ${k === 'spell' ? 'la magia' : 'la trampa'} que iba a destruir a ${pd.nm}`);
        if (k === 'spell') { st.players[pd.ch.p].grave.push(pd.ch.inst); lose(st, pd.ch.p, def(pd.ch.inst).self || 0, true); }
        else respondRest(st, pd.rp);
        return;
      }
      if (k === 'spell') { pd.ch.done = (pd.ch.done || []).concat('uidef'); st.chain = pd.ch; continueSpell(st); }
      else trapResolve(st, pd.tp, C().get(pd.tid), pd.rp, (pd.done || []).concat('uidef'));
      return;
    }
    if (pd.ab === 'galio') {                                   // Galio: Protección heroica
      const gm = P.mz[pd.zy], vm = pd.victim ? st.players[pd.victim.p].mz[pd.victim.z] : null;
      if (a.use && gm && has(st, gm, 'galprot') && vm) {
        const u = uOf(gm), g = gx(P, pd.zy);
        u.gp = (u.gp || 0) + 1; u.gpN = u.gpT === st.turn ? (u.gpN || 0) + 1 : 1; u.gpT = st.turn; galandHit(st, pd.a, p, pd.zy);
        log(st, p, `${mdef(gm).name} usa Protección heroica: anula el ataque y protege a ${pd.nm} (${Math.max(0, 2 * g - u.gp)}/${2 * g} usos)`);
        atkDone(st, pd.a);
        return;
      }
      st.atk = Object.assign({}, pd.a, { noGalio: true });
      continueAttack(st);
      return;
    }
    if (pd.ab === 'toge') {                                    // ¡Quieto! como respuesta: el atacante pasa a defensa y el ataque se cancela
      const tg = slotByUid(st, p, pd.uid), a0 = st.atk, at = a0 && st.players[a0.p].mz[a0.z];
      if (a.use && tg && at && at.pos === 'atk' && !uOf(tg.m).tq) {
        const u = uOf(tg.m);
        u.tq = true; u.tgR = curRound(st); galandHit(st, a0, p, tg.z);
        at.pos = 'def'; at.moved = true;
        log(st, p, `${mdef(tg.m).name} usa ¡Quieto!: ${mdef(at).name} pasa a defensa y su ataque se cancela`);
        st.atk = null; atkDone(st, a0);
        return;
      }
      attackWindows(st, pd.cont.by);
      return;
    }
    if (pd.ab === 'glove' && pd.trap) {                        // Gema de la Realidad (trampa)
      const T = pd.trap, from = T.by, F = st.players[from], bm = P.mz[pd.bz], z = firstFree(P.st);
      const gi = F.grave.findIndex(x => x.uid === T.c.uid);
      if (a.use && bm && !bm.down && z >= 0 && gi >= 0) {
        F.grave.splice(gi, 1);
        P.st[z] = { c: T.c, down: true, setTurn: st.turn, equipTo: pd.bz, stolen: true };
        F.loan = (F.loan || 0) + 1; P.loan = (P.loan || 0) - 1;
        log(st, p, `El Guantelete del Infinito roba ${T.d.name} y la guarda boca abajo`);
        if (multi(st)) st.log[st.log.length - 1].q = from;
        if (lvl(bm) <= 5 && !bm.price) { bm.price = true; log(st, p, `Precio del poder: ${mdef(bm).name} pierde la mitad de su ATK y DEF base y sus habilidades`); }
        respondRest(st, T.rp);                                 // la activación se cancela
        return;
      }
      if (nextWindow(st, 'trap', { k: 'trapAct', by: from, rp: T.rp, tid: T.d.id }, foes(st, from))) return;
      trapResolve(st, from, T.d, T.rp, []);
      return;
    }
    if (pd.ab === 'glove') {                                   // Guantelete del Infinito: robar la gema que un rival acaba de activar
      const ch = pd.ch, d = def(ch.inst);
      if (pd.stage === 'glovetgt') {
        const c = pd.cands.find(x => x.vs === a.vs && x.z === a.z);
        if (!c) { st.pending = pd; return; }
        ch.target = { vs: c.vs, z: c.z };
        st.chain = ch; if (!openWindow(st, 'spell', { k: 'spell', by: ch.p })) continueSpell(st);
        return;
      }
      const bm = P.mz[pd.bz];
      if (a.use && bm && !bm.down && has(st, bm, 'thanosg') && (d.fx === 'gem' || d.fx === 'tiempo')) {
        const from = pd.by;      // Thanos: roba la gema (la activación del rival se cancela) y la lleva consigo, sin ocupar zona; la usa después como habilidad si quiere
        st.players[from].loan = (st.players[from].loan || 0) + 1; P.loan = (P.loan || 0) - 1;
        ch.inst.spent = false; ch.inst.by = p;
        bm.link = (bm.link || []).concat([ch.inst]);
        bm.gemsIdle = (bm.gemsIdle || []).concat([{ uid: ch.inst.uid, fx: d.fx }]);
        log(st, p, `${mdef(bm).name} roba ${d.name} y la lleva consigo: podrá usarla como habilidad`);
        if (multi(st)) st.log[st.log.length - 1].q = from;
        return;
      }
      if (a.use && bm && !bm.down && (d.fx === 'tiempo' || firstFree(P.st) >= 0)) {
        const from = pd.by;
        log(st, p, `El Guantelete del Infinito roba ${d.name} y la equipa a ${mdef(bm).name}`);
        if (multi(st)) st.log[st.log.length - 1].q = from;
        st.players[from].loan = (st.players[from].loan || 0) + 1; P.loan = (P.loan || 0) - 1;      // la carta robada sigue contando para su dueño
        ch.p = p; ch.stolen = { bz: pd.bz, from };
        if (d.fx === 'equip') ch.target = { z: pd.bz };
        if (d.fx === 'gem') {
          const cands = zoneTargetsUp(st, p).map(c => ({ vs: foeOf(st, p, c), z: c.z }));
          if (!cands.length) { P.grave.push(ch.inst); log(st, p, `${d.name} no tiene objetivo`); return; }
          st.pending = { k: 'ability', ab: 'glove', player: p, stage: 'glovetgt', ch, cands, nm: d.name };
          return;
        }
        st.chain = ch; if (!openWindow(st, 'spell', { k: 'spell', by: p })) continueSpell(st);
        return;
      }
      st.chain = ch;                                           // no la roba: la gema sigue su resolución normal
      if (!openWindow(st, 'spell', { k: 'spell', by: ch.p })) continueSpell(st);
      return;
    }
    if (pd.ab === 'vlearn') {                                  // Venom aprende una habilidad del enemigo destruido
      if (a.use === false) { log(st, p, 'Venom decide no aprender ninguna habilidad'); return; }
      const vi = findVenom(st, p, pd.uid);
      if (!vi || !pd.opts.includes(a.pick)) return;
      vi.keep = (vi.keep || []).concat([{ id: a.pick, from: pd.from }]);
      const vm = slotByUid(st, p, pd.uid);
      if (vm && !(vm.m.ext || []).includes(a.pick)) { vm.m.ext = (vm.m.ext || []).concat([a.pick]); vm.m.extFrom = Object.assign({}, vm.m.extFrom); vm.m.extFrom[a.pick] = pd.from; }
      log(st, p, `Venom absorbe ${(C().AB[a.pick] || [a.pick])[0]} de ${pd.from}: la conserva para siempre`);
      return;
    }
    if (pd.ab === 'mahoraga') {
      if (!a.use) { log(st, p, 'decide no invocar a General Mahoraga'); return; }
      if (summonFromHand(st, p, 'c_mahoraga', 'responde a la invocación e invoca especialmente a') < 0) log(st, p, 'No hay espacio para General Mahoraga');
      return;
    }
    if (pd.ab === 'muerte') {
      if (!a.use) { log(st, p, 'decide no invocar a La Muerte'); return; }
      if (P.mz.some(m => m && m.c.id === 'c_la_muerte') || summonFromHand(st, p, 'c_la_muerte', 'La Muerte aparece: invoca especialmente a') < 0) log(st, p, 'La Muerte no puede aparecer');
      return;
    }
    if (pd.ab === 'avchoice') {
      const hv = slotByUid(st, p, pd.uid), av = hv && hv.m.av;
      if (!av || av.choice) return;
      av.choice = a.pick === 'mag' ? 'mag' : 'atk';
      log(st, p, `${mdef(hv.m).name} evoluciona: ${av.choice === 'atk' ? 'Adaptación Ofensiva' : 'Depredador de Magia'}`);
      if (av.choice === 'atk') { av.n = 1; av.turn = st.turn; const g = gx(P, hv.z); addMod(st, hv.m, 'av-atk', 400 * g, 400 * g, 0); log(st, p, `Adaptación Ofensiva: +${400 * g} ATK y DEF (1/3)`); }
      return;
    }
    if (pd.ab === 'shen') {
      if (a.use && shenAuto(st, pd)) { if (pd.a) atkDone(st, pd.a); return; }      // el jugador decide: si acepta, Shen entra, cancela el efecto y protege
      if (pd.ch) { pd.ch.done = (pd.ch.done || []).concat('shen'); st.chain = pd.ch; continueSpell(st); }
      else { st.atk = Object.assign({}, pd.a, { noShen: true }); continueAttack(st); }
      return;
    }
    if (pd.ab === 'meliodas') {
      if (pd.stage === 'ask') {
        if (!a.use || (pd.kind === 'power' && pd.pa && pd.pa.pw === 'purpura')) { meliDecline(st, pd); return; }      // validado aquí: Púrpura nunca se refleja
        const cands = meliCands(st, p, pd);
        if (cands === null) { meliApply(st, p, pd, null); return; }
        if (!cands.length) { log(st, p, 'Total Counter no puede reflejar el efecto'); meliDecline(st, pd); return; }
        const k = pd.kind || 'spell', fx = k === 'spell' ? def(pd.ch.inst).fx : k === 'power' ? pd.pa.pw : '';
        st.pending = Object.assign({}, pd, { stage: 'target', cands, area: (fx === 'destroyST' || fx === 'desmantelar' || fx === 'avpred') ? 'st' : 'mz' });
        return;
      }
      if (!pd.cands.some(c => c.vs === a.vs && c.z === a.z)) { st.pending = pd; return; }
      const tgt = pd.cands.find(c => c.vs === a.vs && c.z === a.z);
      meliApply(st, p, pd, tgt);
      return;
    }
    if (pd.ab === 'rika') {
      const ym = P.mz[pd.zy], vm = pd.victim ? st.players[pd.victim.p].mz[pd.victim.z] : null;
      const k = pd.kind;
      if (a.use && ym && has(st, ym, 'rikaint') && vm) {
        const fxs = k === 'attack' ? 'el ataque' : k === 'spell' ? 'la magia' : k === 'trap' ? 'la trampa' : 'la habilidad';
        rikaSpend(st, p, pd.zy, pd.nm, fxs);
        if (k === 'spell') { st.players[pd.ch.p].grave.push(pd.ch.inst); lose(st, pd.ch.p, def(pd.ch.inst).self || 0, true); }
        else if (k === 'trap') { if (st.atk && C().get(pd.tid).fx === 'destroyAttacker') st.atk.negated = true; respondRest(st, pd.rp); }
        else if (k === 'attack' && pd.a) { galandHit(st, pd.a, p, pd.zy); atkDone(st, pd.a); }
        else if (k === 'power' && pd.pa) blockPw(st, pd.pp, pd.pa);
        return;
      }
      if (k === 'attack') { st.atk = Object.assign({}, pd.a, { noRika: true }); continueAttack(st); }
      else if (k === 'spell') { pd.ch.done = (pd.ch.done || []).concat('rika'); st.chain = pd.ch; continueSpell(st); }
      else if (k === 'trap') trapResolve(st, pd.tp, C().get(pd.tid), pd.rp, (pd.done || []).concat('rika'));
      else if (k === 'power') runPower(st, pd.pp, pd.pa, ['rika', 'meli']);
      return;
    }
    if (pd.ab === 'yutalearn') {
      const y = slotByUid(st, p, pd.uid);
      if (!a.use || !y) { if (!a.use) log(st, p, 'decide no aprender la habilidad'); return; }
      const u = uOf(y.m), nmA = (C().AB[pd.id] || [pd.id])[0];
      y.m.ext = (y.m.ext || []).concat([pd.id]); y.m.extFrom = Object.assign({}, y.m.extFrom); y.m.extFrom[pd.id] = pd.from;
      u.learned = (u.learned || []).concat([pd.id]); u.lrnT = st.turn;
      log(st, p, `Yuta Okkotsu aprende ${nmA} de ${pd.from} (${u.learned.length}/3)`);
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
      const tid = pd.id || 'c_titan';
      if (!a.use) { log(st, p, `decide no invocar a ${def({ id: tid }).name}`); return; }
      const li = P.grave.findIndex(c => c.uid === pd.uid), ti = handIdx(P, tid);
      const anchor = formAnchor(P, pd.z, tid);
      if (li < 0 || ti < 0 || anchor < 0) return;
      const lara = P.grave.splice(li, 1)[0], inst = P.hand.splice(ti, 1)[0];
      inst.spent = false;
      P.mz[anchor] = mkSlot(st, inst, { pos: 'atk', link: [lara], wide: !!def(inst).wide, since: st.turn, attacked: true });
      log(st, p, `${def(lara).name} muere y se invoca especialmente a ${def(inst).name}`);
      if (tid === 'c_titan_colosal') colosalBlast(st, p, anchor);
      return;
    }
    if (pd.ab === 'dante') {
      const dk = slotByUid(st, p, pd.uid);
      if (a.use === false || !a.pick || !dk) { log(st, p, 'decide no tomar ninguna recompensa'); return; }
      const m = dk.m, n = pd.n;
      m.bonus = m.bonus || { atk: 0, def: 0 };
      if (a.pick === 'atk') { m.bonus.atk += n; log(st, p, `${mdef(m).name} obtiene +${n} ATK (Cazador de demonios)`); }
      else if (a.pick === 'def') { m.bonus.def += n; log(st, p, `${mdef(m).name} obtiene +${n} DEF (Cazador de demonios)`); }
      else if (pd.opts.includes(a.pick)) {
        m.ext = (m.ext || []).slice(); m.extFrom = Object.assign({}, m.extFrom);
        if (!m.ext.includes(a.pick)) { m.ext.push(a.pick); m.extFrom[a.pick] = pd.from; }
        log(st, p, `${mdef(m).name} absorbe la habilidad de ${pd.from}`);
      }
      return;
    }
    if (pd.ab === 'marcamal') {
      if (a.use === false || !a.pick) { log(st, p, 'decide no despertar la marca de maldición'); return; }
      const sk = slotByUid(st, p, pd.uid);
      if (!sk) return;
      uOf(sk.m).marca2 = true;
      if (a.pick === 'form') {
        const hi = handIdx(P, 'c_sasuke_marca');
        if (hi < 0) return;
        log(st, p, `${mdef(sk.m).name} despierta la marca de maldición`);
        transformInto(st, p, sk.z, hi, null);
      } else {
        addMod(st, sk.m, 'marca2', 500, 500, 0);
        log(st, p, `${mdef(sk.m).name} despierta la marca de maldición: +500 ATK y +500 DEF`);
      }
      return;
    }
    if (pd.ab === 'kuribomo') {
      const c = pd.cands.find(x => x.vs === a.vs && x.z === a.z);
      if (!c) { st.pending = pd; return; }
      const tm = st.players[c.vs].mz[c.z];
      if (!tm) return;
      log(st, p, `${pd.nm} se lleva consigo a ${tm.down ? 'un monstruo boca abajo' : mdef(tm).name}`);
      if (multi(st)) st.log[st.log.length - 1].q = c.vs;
      destroyMonster(st, c.vs, c.z, { src: 'power', bp: p });
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
    if (id === 'bigbang1') return u.bb1 ? 'used' : 'ready';
    if (id === 'agujero') return 'ready';
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
    if (s.huge) v.huge = true;
    if (s.manto) v.manto = true;
    if (s.exh) v.exh = true;
    if (s.ksp && (s.mods || []).some(x => x.k === 'kaiospell')) v.ksp = { x: !!s.ksp.x };
    if (s.dn && !s.down) v.dn = true;
    const ab = abil(st, s);
    if (ab.includes('escudo')) v.shield = shieldOf(s);
    if (s.link && s.link.length) v.link = s.link.map(c => c.id);
    if (s.gemsIdle && s.gemsIdle.length) v.gems = s.gemsIdle.map(g => { const c = (s.link || []).find(x => x.uid === g.uid); return c ? c.id : null; }).filter(Boolean);
    if (s.ext && s.ext.length) {
      v.ext = s.ext.slice();
      v.extInfo = s.ext.map(id => ({ id, from: (s.extFrom || {})[id] || null, state: useState(s, id) }));
    }
    const cap = mdef(s).ab && mdef(s).ab.includes('robar2') ? 2 : mdef(s).ab && mdef(s).ab.includes('robar1') ? 1 : 0;
    if (cap) { v.stealCap = cap; v.stealN = (uOf(s).stolen || 0); }
    if (s.abs) v.absorbed = s.abs.c.id;
    if (s.fur && s.fur === st.turn) v.fury = true;
    if (st.domain && st.domain.uid === s.c.uid) v.domain = true;
    if (st.domain && lvl(s) < (st.domain.min || 10) && st.domain.uid !== s.c.uid && (mdef(s).ab || []).length) v.muted = true;
    const sh = shieldInfo(st, P, z);
    if (sh) v.sh = { kind: sh.kind, cur: sh.cur, max: sh.max };
    if (s.six) {
      v.six = Math.min(SIX_TURNS, Math.max(0, SIX_TURNS - (elapsed(st, s.six.t0))));
      const su = uOf(s); v.sixU = { rojo: !!su.rojo, azul: !!su.azul, purpura: !!su.purpura };      // técnicas de los Seis Ojos ya lanzadas
    }
    if (s.fused) v.fused = { b: s.fused.b.c.id, left: Math.min(2, Math.max(0, 2 - (elapsed(st, s.fused.t0)))) };
    if (s.mods && s.mods.length) v.mods = s.mods.map(x => ({ k: x.k, atk: x.atk, def: x.def, left: x.n ? Math.min(x.n, Math.max(0, x.n - (elapsed(st, x.t0)))) : null }));
    if (s.av && s.av.on) v.av = { choice: s.av.choice, n: s.av.n, turn: s.av.turn === st.turn };
    if (s.kn) v.kn = { rh: !!s.kn.rh, sh: !!s.kn.sh };
    if (s.form) v.form = s.form;
    if (s.sealed && s.sealed.length) v.sealedAb = s.sealed.map(x => x.ab);
    if (s.owner != null && s.owner !== st.players.indexOf(P)) v.owner = s.owner;
    if (s.promesa) v.promesa = true;
    if (s.snake) v.snake = true;
    if (s.learn) v.learn = Object.assign({}, s.learn);
    { const uu = uOf(s), yd = !!uu.ydom && abil(st, s).includes('yutadom');
      if (uu.canon || uu.kk6 || uu.gen || yd || (uu.pdr && abil(st, s).includes('pdragon'))) v.used = { canon: !!uu.canon, kk6: !!uu.kk6, gen: !!uu.gen, ydom: yd, pdr: !!uu.pdr && abil(st, s).includes('pdragon') }; }
    if (s.c.id === 'c_yuta') {          // Yuta: usos de Rika, habilidades aprendidas y dominio
      const yu = uOf(s), gg = gx(P, z);
      v.yuta = { rk: Math.max(0, 2 * gg - (yu.rk || 0)), rkMax: 2 * gg, rkTurn: yu.rkT === st.turn, rkNext: !(yu.rkT === st.turn && (yu.rkTn || 0) >= gg), rkLast: yu.rkLast || null, learned: (yu.learned || []).slice(), lrnTurn: yu.lrnT === st.turn, dom: !!(st.domain && st.domain.uid === s.c.uid) };
      if (v.yuta.dom) v.yuta.borrow = borrowable(st, s, abil(st, s));
    }
    if (s.c.id === 'c_rika') {          // Rika: feliz o bajo Maldición Incontrolable
      const rs = rikaState(st);
      v.rika = { happy: rs.happy, bonus: rs.bonus, yuta: rs.yuta, ring: rs.ring, ringYuta: rs.ringYuta, forced: !rs.happy && has(st, s, 'rikamal'), imm: has(st, s, 'rikaprot') };
    }

    const u = uOf(s);
    // ----- tanda 3 -----
    { const a3 = abil(st, s), g3 = gx(P, z);
      if (s.jk) v.jk = { mode: s.jk.mode };
      if (s.sym) { v.sym = true; v.symLeft = symLeft(st, s); }
      if (s.tony) v.tony = { mat: s.tony.mat, arm: s.tony.arm, can: s.tony.t !== st.turn };
      if (s.hira > 0) v.hira = s.hira;
      if (s.price) v.price = true;
      if (a3.includes('odincarga')) v.odin = { c: u.odc || 0, b: u.odb || 0, max: 3 * g3 };
      if (a3.includes('toge')) v.toge = { tq: !!u.tq, td: !!u.td, tm: !!u.tm, round: u.tgR === curRound(st) };
      if (a3.includes('punos')) v.pn = { n: u.pn || 0, max: 2 * g3, turn: u.pnT === st.turn };
      if (a3.includes('semilla')) v.seed = { turn: u.sdT === st.turn, n: u.sdT === st.turn ? (u.sdN || 0) : 0, max: g3, last: u.seedLast || null };
      if (a3.includes('sylas')) v.stealAll = { n: (s.c.keep || []).length, turn: u.syT === st.turn ? (u.syN || 0) : 0, max: g3 };
      if (s.c.id === 'c_venom' || (s.c.keep || []).length && !a3.includes('sylas')) v.learned = (s.c.keep || []).map(k => k.id);
      if (a3.includes('symb')) v.symb = { turn: P.symT === st.turn };
      if (s.c.keep && s.c.keep.length) v.keep = s.c.keep.map(k => ({ id: k.id, from: k.from })); }
    // ----- tanda 6 -----
    { const d6 = mdef(s);
      if (s.bySung && d6.imgSung) v.art = d6.imgSung;                                   // Igris y Beru invocados por Sung Jin-Woo
      if (st.domain && st.domain.uid === s.c.uid && st.domain.higu && st.domain.higu.sword && d6.imgDom) v.art = d6.imgDom;      // Higuruma con la Espada del Verdugo
      if (st.domain && st.domain.uid === s.c.uid && st.domain.higu) v.higu = { k: st.domain.higu.k, sword: !!st.domain.higu.sword };
      if (isInk(s)) v.ink = true;
      if (isSoldier(s)) v.soldier = true;
      if (s.bySung) v.bySung = true;
      if (s.shade) v.shade = true;                                                      // Esencia de las Sombras: tono azul (sólo visual)
      if (s.petri) v.petri = true;
      { const es = escStage(st, s); if (es.k) { v.esc = { k: es.k, left: es.left }; if (es.k === 'mediodia' && mdef(s).imgMed) v.art = mdef(s).imgMed; } }
      if (s.fly) v.fly = true;                                                          // Kaisel / Rengar: no se le puede atacar
      if (s.camu) v.camu = true;
      if (s.prey && own) v.prey = true;
      if (s.gr) v.gr = s.gr.n;
      if (s.gv) v.gv = true;
      if (s.gres) v.gres = true;
      if (s.gpow) v.gpow = true;
      if (s.sc) v.sc = s.sc;
      if (s.sres) v.sres = true;
      if (s.sdom || s.sdomOn === st.turn) v.sdom = true;
      if (rawAbil(s).includes('hakdom')) { v.hl = s.hl || 0; v.hk = (s.mods || []).filter(x => x.k === 'hk').map(x => Math.max(0, x.n - elapsed(st, x.t0))); }
      if (rawAbil(s).includes('kzcor')) { v.hearts = heartsOf(s); if (v.hearts === 1 && mdef(s).img1) v.art = mdef(s).img1; }
      if (rawAbil(s).includes('rengarfer')) v.fer = uOf(s).fer || 0;
      if (s.binds && s.binds.length) v.binds = s.binds.map(b => ({ nm: b.nm, atk: !!b.atk, ab: !!b.ab, n: b.n }));
      if (s.pub != null) v.pub = true;
      if (s.tobiNA) v.tobiNA = true;
      if (s.sjc) v.sjc = s.sjc;
      if (s.astaW) v.astaW = true;
      if (s.astaK) v.astaK = s.astaK;
      if (s.defFix != null) v.defFix = s.defFix;
      if (s.liu === st.turn) v.liu = true;
      if (s.spentAb && s.spentAb.length) v.spentAb = s.spentAb.slice();
      const u6 = uOf(s);
      if (u6.gco) v.gco = u6.gco;
      if (u6.astaPr) v.astaPr = true;
      if (s.c.ecU) v.ecU = true; }
    {   // contadores visibles en la ficha (cartelitos): [valor, máximo | null]. Sólo salen los que ya valen algo.
      const g9 = gx(P, z), cn = {}, rec = (k, n, max) => { if (n) cn[k] = [n, max]; };
      rec('rock', u.rock, 4); rec('sun', u.sun, 13); rec('rayo', u.rayo, null); rec('dk', u.dk, 3);
      rec('shN', u.shN, 3); rec('gp', u.gp, 2 * g9); rec('pat', u.pat, 3 * g9); rec('web', u.web, 2 * g9); rec('pn', u.pn, 2 * g9);
      rec('ino', st.ino && st.ino[s.c.uid], 11);
      if (rawAbil(s).includes('tobikamui') && u.tobT0 != null && elapsed(st, u.tobT0) < 1) cn.kam = [1, 1];
      if (rawAbil(s).includes('dsombras')) { rec('ds', (u.dsU || []).length, 6); if (u.dsTT === st.turn && u.dsTn) cn.dsT = [u.dsTn, 2]; }      // Megumi: técnicas distintas usadas y las de este turno
      if (rawAbil(s).includes('resis')) cn.vidas = [u.vidas == null ? 2 : Math.max(0, u.vidas), 2];      // vidas que le quedan (cuenta hacia atrás, también el 0)
      if (Object.keys(cn).length) v.cn = cn;
    }
    if (u.kills) v.kills = u.kills;
    if (u.rock) v.rock = u.rock;
    if (u.sun) v.sun = u.sun;
    // Karma puesta sobre este monstruo (de cualquiera): cuenta atrás
    for (let q = 0; q < st.n; q++) for (const k of st.players[q].st) {
      if (k && k.karma && k.karma.phase === 'foe' && k.karma.foeUid === s.c.uid) v.karma = { left: Math.max(0, 3 - (elapsed(st, k.karma.t0))), owner: q };
    }
    const gm = gemOf(st, s.c.uid);
    if (gm) v.gem = { owner: gm.p, left: 2 - gm.s.gem.uses };
    return v;
  }
  function stView(s, own, st) {
    if (!s) return null;
    if (s.down && !own) return { down: true, c: null };
    const v = { down: !!s.down, c: { uid: s.c.uid, id: s.c.id }, setTurn: s.setTurn, equipTo: s.equipTo };
    if (s.inv) v.inv = true;      // contador de investigación de Near
    if (s.gem) v.gem = { left: 2 - s.gem.uses, ready: s.gem.usedTurn !== st.turn };
    if (s.storm) v.storm = { ready: s.storm.usedTurn !== st.turn };
    if (s.karma) v.karma = { phase: s.karma.phase, left: s.karma.phase === 'foe' ? Math.max(0, 3 - (elapsed(st, s.karma.t0))) : null };
    if (s.ring) v.ring = { atk: s.ring.atk, stars: s.ring.stars, sauron: !!s.ring.sauron, left: s.ring.sauron ? null : Math.min(s.ring.n, Math.max(0, s.ring.n - (elapsed(st, s.ring.t0)))), promesa: !!s.ring.promesaUsed, can: s.ring.stars >= 7 };
    if (s.promise) { v.promise = true; const bh = findByUid(st, s.bearer); v.bearer = bh ? bh.m.c.id : null; v.bearerOn = !!(bh && s.equipTo != null); }
    if (s.susano) v.susano = { awake: !!s.susano.awake, sh: s.susano.sh, max: SUSANO_SH };
    if (s.beast) v.beast = { done: !!s.beast.done };
    if (s.min) v.min = { n: s.min.n };
    if (s.alma) v.alma = { left: Math.max(0, 5 - elapsed(st, s.alma.t0)), eff: s.alma.eff.slice(), ready: s.alma.usedTurn !== st.turn };
    if (s.guerrero) v.guerrero = { waiting: !!s.guerrero.waiting };
    if (s.prison) v.prison = { c: s.prison.m.c.id, left: Math.min(5, Math.max(0, 5 - (elapsed(st, s.prison.t0)))), owner: s.prison.owner };
    if (s.held) v.held = true;
    if (s.stolen) v.stolen = true;
    if (s.glove) v.glove = true;
    return v;
  }
  function playerView(st, p, own, peek) {
    const P = st.players[p];
    return {
      seat: p, team: st.team[p], alive: P.alive, lp: P.lp, deckCount: P.deck.length, normalUsed: P.normalUsed,
      hand: own ? P.hand.map(i => ({ uid: i.uid, id: i.id })) : P.hand.map(() => null),
      handCount: P.hand.length,
      grave: P.grave.map(i => ({ uid: i.uid, id: i.id })),
      banish: P.banish.map(i => ({ uid: i.uid, id: i.id })),
      mz: P.mz.map((s, z) => slotView(st, P, s, z, own || peek)),
      shadow: P.mz.map((s, z) => shadowOf(P, z)),
      st: P.st.map(s => stView(s, own || peek, st)),
      sealed: (P.sealed || []).slice(),
      limbo: (st.limbo || []).filter(e => e.p === p).map(e => ({ id: own || peek || !e.m.down ? eid(e.m) : null, why: e.why, wait: !!e.wait }))
    };
  }
  /** Lo que ve el jugador `seat`: su mano y sus cartas boca abajo, y nada del rival que esté oculto. */
  function view(st, seat, opts) {
    const pd = st.pending;
    let pending = null;
    if (pd) {
      pending = { k: pd.k, player: pd.player };
      if (pd.by != null) pending.by = pd.by;
      if (pd.player === seat) {
        if (pd.k === 'respond') { pending.trigger = pd.trigger; pending.cands = pd.cands.slice(); if (pd.cont && pd.cont.info) pending.info = pd.cont.info; }
        if (pd.k === 'pick') {
          pending.zone = pd.zone;
          const P = st.players[seat], src = pd.zone === 'deck' ? P.deck : pd.zone === 'hand' ? P.hand : P.grave;
          pending.cands = pd.cands.map(u => { const c = src.find(x => x.uid === u); return { uid: c.uid, id: c.id }; });
        }
        if (pd.k === 'ability') {
          pending.ab = pd.ab; pending.stage = pd.stage;
          if (pd.nm) pending.nm = pd.nm;
          if (pd.kind) pending.kind = pd.kind;
          if (pd.id) pending.id = pd.id;
          if (pd.from && !pd.opts) pending.from = pd.from;
          if (pd.victim) pending.victim = pd.victim;
          if (pd.area) pending.area = pd.area;
          const P = st.players[seat], all = P.hand.concat(P.grave, P.mz.filter(Boolean).map(s => s.c), P.st.filter(Boolean).map(s => s.c));
          pending.card = { uid: pd.uid, id: (all.find(c => c.uid === pd.uid) || {}).id };
          if (pd.opts) { pending.opts = pd.opts.slice(); pending.from = pd.from; }
          if (pd.cands) pending.cands = pd.cands.map(c => ({ vs: c.vs, z: c.z }));
          if (pd.info) pending.info = pd.info;
          if (pd.ch) pending.gem = { id: pd.ch.inst.id };
        }
        if (pd.k === 'discard') pending.excess = st.players[seat].hand.length - HAND_MAX;
      } else if (pd.k === 'respond') pending.trigger = pd.trigger;
      else if (pd.k === 'ability') pending.ab = pd.ab;
    }
    // Un jugador eliminado mira la partida como espectador: ve las manos y las cartas boca abajo de los que siguen
    const spec = (!st.players[seat].alive && st.winner === null) || !!(opts && opts.all);      // opts.all: campo de práctica, se ve todo
    const peek = st.players[seat].mz.some(m => m && !m.down && rawAbil(m).includes('detect'));      // Voldemort: Detección de mentiras (información privada)
    const players = st.players.map((_, i) => playerView(st, i, i === seat || spec, peek));
    { const nu = st.players[seat].nue;      // Megumi: Nue ve en privado una carta boca abajo
      if (nu && nu.length) {
        for (const n of nu.filter(n => { const sx = st.players[n.vs] && st.players[n.vs].st[n.z]; return sx && sx.down && sx.c.uid === n.uid; })) players[n.vs].st[n.z] = Object.assign(stView(st.players[n.vs].st[n.z], true, st), { peeked: true }); } }
    {   // Misa (Ojos de Shinigami) e Inosuke (Sentido del tacto): ven en privado personajes boca abajo
      const S0 = st.players[seat], tacto = S0.mz.some(m => m && !m.down && has(st, m, 'inotacto')), eyes = S0.eyes || [];
      const ojos = !stOff(st) && S0.st.some(x => x && !x.down && x.equipTo != null && def(x.c).eyesAll && S0.mz[x.equipTo]);      // Ojos de Shinigami: ve a TODOS los personajes enemigos boca abajo mientras el portador siga en el campo
      for (let q = 0; q < st.n; q++) {
        if (q === seat || st.team[q] === st.team[seat]) continue;
        st.players[q].mz.forEach((m, z) => { if (m && m.down && (tacto || ojos || eyes.some(e => e.uid === m.c.uid)) && players[q].mz[z] && !players[q].mz[z].c) players[q].mz[z] = Object.assign(slotView(st, st.players[q], m, z, true), { peeked: true }); });
        st.players[q].st.forEach((s, z) => { if (s && s.down && (tacto || eyes.some(e => e.uid === s.c.uid)) && players[q].st[z] && !players[q].st[z].c) players[q].st[z] = Object.assign(stView(s, true, st), { peeked: true }); });      // también magias y trampas boca abajo (Inosuke siempre; Misa, las que miró)
      }
    }
    const fl = foes(st, seat);
    const oppSeat = fl.length ? fl[0] : st.players.findIndex((P, i) => i !== seat && st.team[i] !== st.team[seat]);
    return {
      seat, n: st.n, mode: st.mode, team: st.team.slice(), rank: st.rank.slice(),
      seq: st.seq || 0, turn: st.turn, round: curRound(st), phase: st.phase, current: st.current, first: st.first,
      winner: st.winner, reason: st.reason, actor: actor(st),
      me: players[seat], opp: players[oppSeat], players,
      pending,
      domain: st.domain ? { seat: st.domain.p, left: Math.min(2, Math.max(0, 2 - (elapsed(st, st.domain.t0)))), nm: st.domain.nm || 'de Sukuna', dn: st.domain.dn || 'Relicario Demoníaco', noST: !!st.domain.noST, min: st.domain.min || 10 } : null,
      marks: (st.marks || []).map(k => ({ by: k.by, vs: k.vs, z: k.z })),
      chain: st.chain ? { p: st.chain.p, c: { uid: st.chain.inst.uid, id: st.chain.inst.id } } : null,
      atk: st.atk ? { p: st.atk.p, z: st.atk.z, target: st.atk.target, vs: st.atk.vs } : null,
      log: st.log.slice(-60),
      legal: legal(st, seat)
    };
  }

  /** Todas las cartas de un jugador (para comprobar que no se pierde ni se duplica ninguna). */
  function countCards(st, p) {
    const P = st.players[p];
    let n = P.deck.length + P.hand.length + P.grave.length + P.banish.length + (P.loan || 0);
    // cada personaje cuenta para su dueño original (corrompido: `owner`); lo que se le equipó (Jake, Venom, Anti-Venom) cuenta para quien lo puso (`by`)
    st.players.forEach((Q, qi) => {
      for (const s of Q.mz) {
        if (!s || (s.c && s.c.virt)) continue;      // las criaturas de tinta no son cartas
        const own = s.owner == null ? qi : s.owner;
        if (own === p) n++;
        for (const l of (s.link || [])) if ((l.by != null ? l.by : own) === p) n++;
      }
    });
    for (const s of P.st) if (s) n++;
    for (const Q of st.players) for (const s of Q.st) if (s && s.prison) { if (s.prison.owner === p) n++; for (const l of (s.prison.m.link || [])) if ((l.by != null ? l.by : s.prison.owner) === p) n++; }
    for (const e of (st.limbo || [])) {                                  // fuera del campo por un tiempo (Mafuba, Kamui)
      const own = e.m.owner != null ? e.m.owner : e.p;
      if (own === p) n++;
      for (const l of (e.m.link || [])) if ((l.by != null ? l.by : own) === p) n++;
      if (e.m.abs && e.m.abs.owner === p) n += 1 + (e.m.abs.link ? e.m.abs.link.length : 0);
    }
    if (st.chain && st.chain.p === p && !st.chain.inst.virt) n++;
    else if (st.pending && (st.pending.ab === 'glove' || st.pending.ab === 'uidef' || st.pending.ab === 'antimag' || st.pending.ab === 'shadowred') && st.pending.ch && st.pending.ch.p === p && !st.pending.ch.inst.virt && st.pending.stage !== 'done') n++;      // gema en la mano del Guantelete / magia a la espera de la Defensa instintiva de Goku UI
    // lo absorbido por Cell cuenta para su dueño original
    for (const Q of st.players) for (const s of Q.mz) if (s && s.abs && s.abs.owner === p) n += 1 + (s.abs.link ? s.abs.link.length : 0);
    for (const Q of st.players) for (const s of Q.mz) if (s && s.fused && s.fused.b && s.fused.b.abs && s.fused.b.abs.owner === p) n += 1 + (s.fused.b.abs.link ? s.fused.b.abs.link.length : 0);      // lo absorbido por el personaje que quedó fusionado
    for (const Q of st.players) for (const s of Q.st) if (s && s.prison && s.prison.m.abs && s.prison.m.abs.owner === p) n += 1 + (s.prison.m.abs.link ? s.prison.m.abs.link.length : 0);      // lo absorbido por un personaje sellado
    return n;
  }

  /** Se acabó el tiempo del turno: se rechaza lo que esté pendiente (responder, habilidades) y se pasa el turno al siguiente. */
  function timeoutTurn(st) {
    const turn0 = st.turn, cur0 = st.current;
    for (let i = 0; i < 12 && st.winner === null; i++) {
      if (st.turn !== turn0 || st.current !== cur0) break;
      const p = actor(st); if (p < 0) break;
      const L = legal(st, p);
      const a = L.find(x => x.t === 'respond' && !x.activate) || L.find(x => x.t === 'ability' && x.use === false) || L.find(x => x.t === 'endTurn') || L.find(x => x.t === 'toBattle') || L.find(x => x.t === 'attack') || L[0];
      if (!a || !apply(st, p, a).ok) break;
    }
  }

  /** Un jugador se rinde (o se desconecta). */
  function resign(st, p, why) {
    if (st.winner !== null || !st.players[p].alive) return;
    eliminate(st, p, why || 'Se rindió.');
    checkWin(st);
    sweep(st);
    settle(st);
  }

  /** CAMPO DE PRÁCTICA: herramientas que se saltan las reglas (sólo las usa match.practice; nunca en partidas de verdad).
   *  op = { k: 'give'|'place'|'lp'|'draw'|'move'|'refresh'|'turn', p, ... } → { ok, error? } */
  function sandbox(st, op) {
    if (!op || typeof op !== 'object' || st.winner !== null) return { ok: false, error: 'No se puede ahora.' };
    const p = op.p | 0, P = st.players[p];
    if (!P) return { ok: false, error: 'Lado no válido.' };
    const d = op.id ? C().get(op.id) : null;
    const ZN = ['hand', 'deck', 'grave', 'banish'];
    switch (op.k) {
      case 'give': {
        if (!d || !ZN.includes(op.to)) return { ok: false, error: 'Carta o destino no válidos.' };
        P[op.to][op.to === 'deck' ? 'unshift' : 'push']({ uid: st.nextUid++, id: d.id });
        log(st, p, `[Práctica] agrega ${d.name} a ${({ hand: 'la mano', deck: 'el mazo', grave: 'el cementerio', banish: 'los desterrados' })[op.to]}`);
        return { ok: true };
      }
      case 'place': {
        if (!d) return { ok: false, error: 'Carta no válida.' };
        const z = op.z | 0;
        if (z < 0 || z >= ZONES) return { ok: false, error: 'Zona no válida.' };
        if (d.kind === 'monster') {
          const o = occ(P);
          if (o[z] || (d.wide && (z + 1 >= ZONES || o[z + 1])) || (d.huge && (z !== 0 || o[1] || o[2]))) return { ok: false, error: 'No cabe en esa zona.' };
          const down = !!op.down, inst = { uid: st.nextUid++, id: d.id };
          P.mz[z] = mkSlot(st, inst, { pos: down ? 'def' : (op.pos === 'def' ? 'def' : 'atk'), down, wide: !!d.wide, summonedTurn: st.turn - 2 });
          log(st, p, `[Práctica] coloca ${down ? 'una carta boca abajo' : d.name} en el campo`);
          if (!down) entered(st, p, z);
        } else {
          if (P.st[z]) return { ok: false, error: 'Esa zona está ocupada.' };
          P.st[z] = { c: { uid: st.nextUid++, id: d.id }, down: true, setTurn: st.turn - 2, equipTo: null };
          log(st, p, '[Práctica] coloca una carta boca abajo');
        }
        sweep(st);
        return { ok: true };
      }
      case 'lp': {
        const n = Math.max(1, Math.min(99999, Math.floor(Number(op.lp)) || 0));
        P.lp = n; if (!P.alive) return { ok: false, error: 'Ese lado ya cayó.' };
        log(st, p, `[Práctica] sus PV pasan a ${n}`);
        return { ok: true };
      }
      case 'draw': drawCards(st, p, 1); log(st, p, '[Práctica] roba 1 carta'); return { ok: true };
      case 'move': {
        const z = op.z | 0, to = op.to;
        if (!['hand', 'deck', 'grave', 'banish'].includes(to)) return { ok: false, error: 'Destino no válido.' };
        if (op.area === 'hand') {
          const inst = P.hand[z]; if (!inst) return { ok: false, error: 'No hay nada ahí.' };
          if (to === 'hand') return { ok: false, error: 'Ya está en la mano.' };
          P.hand.splice(z, 1); P[to][to === 'deck' ? 'unshift' : 'push'](inst);
          log(st, p, `[Práctica] ${def(inst).name} se envía a ${({ deck: 'el mazo', grave: 'el cementerio', banish: 'los desterrados' })[to]}`);
          return { ok: true };
        }
        if (op.area === 'mz') {
          const m = P.mz[z]; if (!m) return { ok: false, error: 'No hay nada ahí.' };
          const nm = mdef(m).name;
          if (to === 'grave' || to === 'banish') removeMonster(st, p, z, to);
          else { const inst = m.c, links = m.link || []; P.mz[z] = null; for (const c of links) P.grave.push(c); P[to][to === 'deck' ? 'unshift' : 'push'](inst); }
          log(st, p, `[Práctica] ${nm} se envía a ${({ hand: 'la mano', deck: 'el mazo', grave: 'el cementerio', banish: 'los desterrados' })[to]}`);
        } else {
          const s = P.st[z]; if (!s) return { ok: false, error: 'No hay nada ahí.' };
          if (s.prison) return { ok: false, error: 'Esa carta guarda a un personaje sellado.' };
          P.st[z] = null; P[to][to === 'deck' ? 'unshift' : 'push'](s.c);
          log(st, p, `[Práctica] ${def(s.c).name} se envía a ${({ hand: 'la mano', deck: 'el mazo', grave: 'el cementerio', banish: 'los desterrados' })[to]}`);
        }
        sweep(st);
        return { ok: true };
      }
      case 'refresh': {          // el lado recupera su turno: invocación normal y ataques disponibles de nuevo
        P.normalUsed = false;
        for (const s of P.mz) if (s) { s.attacked = false; s.moved = false; s.atkMod = 0; s.atkN = 0; s.hira = 0; }
        st.phase = 'main'; st.pending = null;
        log(st, p, '[Práctica] recupera su invocación normal y sus ataques');
        return { ok: true };
      }
      case 'turn': {             // le da el turno a este lado sin avanzar el contador
        st.current = p; st.phase = 'main'; st.pending = null; P.normalUsed = false;
        for (const s of P.mz) if (s) { s.attacked = false; s.moved = false; s.atkMod = 0; s.atkN = 0; s.hira = 0; }
        log(st, p, '[Práctica] toma el control del turno');
        return { ok: true };
      }
    }
    return { ok: false, error: 'Acción desconocida.' };
  }
  D.Engine = { newGame, actor, legal, apply, view, resign, sandbox, timeoutTurn, countCards, foes, START_LP, HAND_MAX, ZONES, GIVE, SHIELD_MAX };
  if (!isBrowser) module.exports = D.Engine;
})();
