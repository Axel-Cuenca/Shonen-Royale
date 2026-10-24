/* ============ duelo/seasons.js — premios de fin de temporada (cosméticos exclusivos por rango) ============
 * Al cerrar cada temporada (un mes) se cobra el premio del MEJOR rango alcanzado, siempre que se hayan jugado
 * MIN_GAMES partidas con rango. El premio trae puntos ✦ y cosméticos que NO se compran ni salen de cajas:
 *   título (todos los rangos) · marco (desde Oro) · avatar (desde Platino).
 * Cada mes cambian solos (nombre, emoji y brillo) según TEMAS[mes]. Para dar a un mes un premio hecho a mano,
 * añade su entrada en ESPECIALES (más abajo) y listo. Ids: ti_sAAAA-MM-<rango> · fr_… · av_… (se crean al pedirlos).
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});

  const FIRST = '2026-10', MIN_GAMES = 5;
  const TIERS = ['bronce', 'plata', 'oro', 'platino', 'diamante', 'esmeralda', 'gm'];
  const TNAME = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', platino: 'Platino', diamante: 'Diamante', esmeralda: 'Esmeralda', gm: 'Gran Maestro' };
  const TCOLOR = { bronce: '#cd7f32', plata: '#cfd8e8', oro: '#ffd84a', platino: '#7fe6ff', diamante: '#6fa8ff', esmeralda: '#3dffa0', gm: '#ff5a7a' };
  const TRAR = { bronce: 'c', plata: 'c', oro: 'r', platino: 'e', diamante: 'e', esmeralda: 'l', gm: 'l' };
  const COINS = { bronce: 40, plata: 90, oro: 180, platino: 320, diamante: 520, esmeralda: 800, gm: 1200 };
  const FRAME_FROM = 2, AVATAR_FROM = 3;       // índices en TIERS: marco desde Oro, avatar desde Platino
  // tema del mes (enero..diciembre): nombre, emoji del avatar (rangos Platino/Diamante y Esmeralda/GM) y color del brillo
  const TEMAS = [
    { name: 'Escarcha', av: ['❄️', '🐺'], c: '#9fe8ff' }, { name: 'Cerezo', av: ['🌸', '🦢'], c: '#ff9ac8' },
    { name: 'Tormenta', av: ['⛈️', '🐲'], c: '#7fa8ff' }, { name: 'Primavera', av: ['🌷', '🦋'], c: '#7dffa0' },
    { name: 'Trueno', av: ['⚡', '🦁'], c: '#ffe14a' }, { name: 'Solsticio', av: ['☀️', '🔥'], c: '#ffb347' },
    { name: 'Océano', av: ['🌊', '🐙'], c: '#4fd6ff' }, { name: 'Dunas', av: ['🏜️', '🦂'], c: '#ffcf6b' },
    { name: 'Bosque', av: ['🍃', '🦉'], c: '#6fe38a' }, { name: 'Eclipse', av: ['🌑', '🦇'], c: '#b07bff' },
    { name: 'Niebla', av: ['🌫️', '👻'], c: '#c8d4e8' }, { name: 'Aurora', av: ['🌌', '🦄'], c: '#8affd7' }
  ];
  // Premios hechos a mano para un mes concreto (sustituyen al tema automático): 'AAAA-MM': { name, av: [emoji1, emoji2], c }
  const ESPECIALES = {};

  const valid = id => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(id));
  const nowId = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const theme = id => ESPECIALES[id] || TEMAS[Number(String(id).slice(5)) - 1];
  const label = id => theme(id).name + ' ' + id.slice(5) + '/' + id.slice(2, 4);

  const cache = new Map();
  /** Cosmético de temporada por su id (ti_s2026-10-oro…), o null. Sólo existen las temporadas desde FIRST hasta hoy. */
  function item(id) {
    id = String(id); if (cache.has(id)) return cache.get(id);
    const m = /^(ti|fr|av)_s(\d{4}-\d{2})-(bronce|plata|oro|platino|diamante|esmeralda|gm)$/.exec(id);
    let it = null;
    if (m && valid(m[2]) && m[2] >= FIRST && m[2] <= nowId()) {
      const cat = m[1], sid = m[2], t = m[3], ti = TIERS.indexOf(t), th = theme(sid), nm = TNAME[t];
      const need = cat === 'fr' ? FRAME_FROM : cat === 'av' ? AVATAR_FROM : 0;
      if (ti >= need) {
        it = { id, cat, rar: TRAR[t], price: 0, excl: true, season: sid, tier: t };
        if (cat === 'ti') { it.name = 'Título ' + nm + ' · ' + label(sid); it.text = nm + ' · ' + label(sid); }
        if (cat === 'av') { it.name = 'Avatar ' + th.name + ' (' + nm + ')'; it.emoji = th.av[ti >= 5 ? 1 : 0]; }
        if (cat === 'fr') {
          it.name = 'Marco ' + nm + ' · ' + th.name; it.sw = TCOLOR[t];
          try { // el CSS de cada marco se crea al momento (borde del rango + brillo del tema)
            let st = document.getElementById('seasonFrames'); if (!st) { st = document.createElement('style'); st.id = 'seasonFrames'; document.head.append(st); }
            st.append(`.fr-s${sid}-${t}{border-color:${TCOLOR[t]} !important;box-shadow:0 0 .7em ${th.c},inset 0 0 .45em ${th.c}88;}`);
          } catch (e) { /* sin documento (pruebas) */ }
        }
      }
    }
    cache.set(id, it); return it;
  }
  const idsOf = (sid, t) => { const ti = TIERS.indexOf(t); return ['ti', ...(ti >= FRAME_FROM ? ['fr'] : []), ...(ti >= AVATAR_FROM ? ['av'] : [])].map(c => c + '_s' + sid + '-' + t); };
  /** Premio de una temporada para un mejor rango: { coins, ids:[…] }. */
  const reward = (sid, t) => TIERS.includes(t) && valid(sid) && sid >= FIRST ? { coins: COINS[t], ids: idsOf(sid, t) } : { coins: 0, ids: [] };
  /** Todos los premios de una temporada (para enseñarlos en la pantalla del Ranking). */
  const table = sid => TIERS.map(t => Object.assign({ tier: t, name: TNAME[t], color: TCOLOR[t] }, reward(sid, t)));

  D.Seasons = { FIRST, MIN_GAMES, TIERS, TNAME, TCOLOR, COINS, theme, label, item, reward, table, valid };
})();
