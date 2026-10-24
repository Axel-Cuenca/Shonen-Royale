/* ============ duelo/rank.js — ranking con rangos, peldaños y temporadas ============
 * Puntos de clasificación (PC) como en un juego competitivo: ganar suma y perder resta (Elo).
 * Rangos de 300 PC con 3 peldaños de 100 (I, II, III): Bronce · Plata · Oro · Platino · Diamante · Esmeralda,
 * y Gran Maestro desde 1800 PC. Temporada = un mes natural; al empezar una nueva hay reinicio PARCIAL
 * (lo que pasa de 300 PC se reduce a la mitad).
 *
 * Mi estado vive en store.rank (con los mazos, en la nube). La tabla pública es una copia en Firestore:
 *   ranks/{temporada}/p/{uid} = { name, pts, w, l, u }
 * que necesita las reglas de Firestore indicadas en CLAUDE.md. Si no están publicadas, el ranking sigue
 * funcionando en local y la tabla pública avisa de que aún no está activada.
 * Sin servidor propio no se puede verificar el resultado: las reglas limitan cuánto puede cambiar por escritura.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});

  const TIER_SIZE = 300, STEP = 100, GM = 1800, MAX_PTS = 5000;
  const TIERS = [
    { id: 'bronce', name: 'Bronce', color: '#cd7f32' },
    { id: 'plata', name: 'Plata', color: '#cfd8e8' },
    { id: 'oro', name: 'Oro', color: '#ffd84a' },
    { id: 'platino', name: 'Platino', color: '#7fe6ff' },
    { id: 'diamante', name: 'Diamante', color: '#6fa8ff' },
    { id: 'esmeralda', name: 'Esmeralda', color: '#3dffa0' },
    { id: 'gm', name: 'Gran Maestro', color: '#ff5a7a' }
  ];
  const ROMAN = ['I', 'II', 'III'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** Rango de unos puntos: { tier, step (0..2 o -1 en Gran Maestro), label, next (PC que faltan), pct (avance en el peldaño) }. */
  function tierOf(pts) {
    pts = Math.max(0, Math.floor(Number(pts) || 0));
    if (pts >= GM) return { tier: TIERS[6], step: -1, label: 'Gran Maestro', pts, from: GM, to: null, next: 0, pct: 100 };
    const t = Math.floor(pts / TIER_SIZE), step = Math.floor((pts % TIER_SIZE) / STEP), from = t * TIER_SIZE + step * STEP, to = from + STEP;
    return { tier: TIERS[t], step, label: TIERS[t].name + ' ' + ROMAN[step], pts, from, to, next: to - pts, pct: Math.round((pts - from) * 100 / STEP) };
  }

  // ---------------- temporada ----------------
  const seasonId = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const seasonName = id => { const [y, m] = String(id).split('-').map(Number); return 'Temporada de ' + MONTHS[(m || 1) - 1] + ' ' + y; };
  const daysLeft = (d) => { d = d || new Date(); const end = new Date(d.getFullYear(), d.getMonth() + 1, 1); return Math.max(0, Math.ceil((end - d) / 86400000)); };
  /** Reinicio parcial: lo que pasa de 300 PC se reduce a la mitad. */
  const softReset = pts => pts > TIER_SIZE ? TIER_SIZE + Math.floor((pts - TIER_SIZE) / 2) : pts;

  // ---------------- cálculo ----------------
  const expected = (me, opp) => 1 / (1 + Math.pow(10, (opp - me) / 400));
  /** Cambio de PC. me = mis PC · foes = PC de los rivales · S = resultado (1 gané, 0.5 empate, 0 perdí; en todos contra todos, según el puesto). */
  function delta(me, foes, S, K) {
    K = K || 40;
    const Ea = foes.length ? foes.reduce((a, o) => a + expected(me, o), 0) / foes.length : 0.5;
    let d = Math.round(K * (S - Ea));
    if (S > 0.5 && d < 8) d = 8;
    if (S < 0.5 && d > -8) d = -8;
    return Math.max(-45, Math.min(45, d));
  }
  /** Resultado de 0 a 1 por puesto: 1.º = 1 y último = 0. */
  const scoreOfPlace = (place, n) => n <= 1 ? 1 : (n - place) / (n - 1);

  let getStore = () => null, saveStore = () => { /* nada */ }, denied = false, lastErr = '';
  function init(get, save) { getStore = get; saveStore = save; }

  /** Mi estado, saneado y puesto al día con la temporada actual. */
  function state() {
    const s = getStore(); if (!s) return null;
    const r = s.rank && typeof s.rank === 'object' ? s.rank : (s.rank = {});
    const cur = seasonId();
    r.pts = Math.max(0, Math.min(MAX_PTS, Math.floor(Number(r.pts) || 0)));
    r.w = Math.max(0, Math.floor(Number(r.w) || 0)); r.l = Math.max(0, Math.floor(Number(r.l) || 0));
    r.best = Math.max(r.pts, Math.floor(Number(r.best) || 0));
    if (typeof r.season !== 'string' || !/^\d{4}-\d{2}$/.test(r.season)) { r.season = cur; }
    if (r.season !== cur) {                       // temporada nueva: reinicio parcial
      r.prev = { season: r.season, pts: r.pts, w: r.w, l: r.l, best: r.best };
      r.pending = (Array.isArray(r.pending) ? r.pending : []).filter(x => x && x.season !== r.season).concat([{ season: r.season, best: r.best, w: r.w, l: r.l }]).slice(-12);   // premios por cobrar
      r.pts = softReset(r.pts); r.w = 0; r.l = 0; r.best = r.pts; r.season = cur; r.pub = false;
      saveStore();
    }
    return r;
  }
  // ---------------- premios de fin de temporada ----------------
  /** Temporadas cerradas con premio por cobrar (saneadas): [{ season, best, w, l, tier, ok, games }]. */
  function pending() {
    const r = state(); if (!r || !Array.isArray(r.pending)) return [];
    const SE = D.Seasons; if (!SE) return [];
    r.pending = r.pending.filter(x => x && SE.valid(x.season) && x.season >= SE.FIRST && x.season < r.season);
    return r.pending.map(x => { const best = Math.max(0, Math.min(MAX_PTS, Math.floor(Number(x.best) || 0))), w = Math.max(0, Math.floor(Number(x.w) || 0)), l = Math.max(0, Math.floor(Number(x.l) || 0));
      return { season: x.season, best, w, l, games: w + l, ok: w + l >= SE.MIN_GAMES, tier: tierOf(best).tier.id }; });
  }
  /** Cobra todo lo pendiente. Devuelve [{ season, tier, coins, ids, ok, games }] (ok=false: pocas partidas, sin premio). */
  function claim() {
    const list = pending(); if (!list.length) return [];
    const SE = D.Seasons, out = [];
    let coins = 0; const ids = [];
    for (const x of list) {
      const rw = x.ok ? SE.reward(x.season, x.tier) : { coins: 0, ids: [] };
      coins += rw.coins; ids.push(...rw.ids);
      out.push({ season: x.season, tier: x.tier, coins: rw.coins, ids: rw.ids, ok: x.ok, games: x.games, best: x.best });
    }
    D.Shop.grant(coins, ids);
    state().pending = []; saveStore();
    return out;
  }
  const me = () => { const r = state(); return r ? tierOf(r.pts) : null; };

  /** Aplica el resultado de una partida. info = { S, foes:[PC], won } → { before, after, delta, rankUp, rankDown } */
  function apply(info) {
    const r = state(); if (!r) return null;
    const before = r.pts, bt = tierOf(before);
    const d = delta(before, (info.foes || []).map(x => Math.max(0, Math.min(MAX_PTS, Math.floor(Number(x)) || before))), info.S);
    r.pts = Math.max(0, Math.min(MAX_PTS, before + d));
    if (info.S > 0.5) r.w++; else if (info.S < 0.5) r.l++;
    r.best = Math.max(r.best || 0, r.pts);
    saveStore();
    publish();
    const at = tierOf(r.pts);
    return { before, after: r.pts, delta: r.pts - before, from: bt, to: at, rankUp: at.pts > before && (at.tier.id !== bt.tier.id || at.step !== bt.step), rankDown: at.pts < before && (at.tier.id !== bt.tier.id || at.step !== bt.step) };
  }

  // ---------------- tabla pública (Firestore) ----------------
  const fsOf = () => { try { const f = D.Account.firebase().fb; return D.Account.cloud && f ? f.firestore() : null; } catch (e) { return null; } };
  const uidOf = () => { try { const u = D.Account.user; return u && !u.guest ? u.uid : null; } catch (e) { return null; } };
  function col(fs, season) { return fs.collection('ranks').doc(season).collection('p'); }
  /** Copia mi puntuación en la tabla pública (mejor esfuerzo; si las reglas no están publicadas se avisa en la pantalla). */
  async function publish() {
    const fs = fsOf(), uid = uidOf(), r = state();
    if (!fs || !uid || !r || denied) return false;
    try {
      await col(fs, r.season).doc(uid).set({ name: String(D.Account.user.name || 'Jugador').slice(0, 24), pts: r.pts, w: r.w, l: r.l, u: Date.now() });
      r.pub = true; return true;
    } catch (e) { lastErr = e.code || e.message; if (e.code === 'permission-denied') denied = true; return false; }
  }
  /** Los mejores de la temporada actual. */
  async function top(limit) {
    const fs = fsOf(), r = state();
    if (!fs) return { ok: false, error: 'offline' };
    try {
      const snap = await col(fs, r.season).orderBy('pts', 'desc').limit(limit || 100).get();
      return { ok: true, rows: snap.docs.map(d => Object.assign({ uid: d.id }, d.data())) };
    } catch (e) { lastErr = e.code || e.message; return { ok: false, error: e.code === 'permission-denied' ? 'denied' : (e.code || 'error') }; }
  }

  D.Rank = { TIERS, ROMAN, TIER_SIZE, STEP, GM, tierOf, seasonId, seasonName, daysLeft, softReset, expected, delta, scoreOfPlace, init, state, me, apply, pending, claim, publish, top, get denied() { return denied; }, get lastErr() { return lastErr; } };
})();
