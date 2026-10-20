/* ============ duelo/cards.js — las cartas del Duelo Pokémon ============
 * Cada Pokémon de la Pokédex del juego es una carta de MONSTRUO:
 *   nivel  según sus stats base totales (1-8)
 *   ATK    ≈ su mejor ataque (físico o especial)
 *   DEF    ≈ su mejor defensa
 *   tipo   el primero de sus tipos (la tabla de tipos da ±ATK en combate)
 * Más cartas de MAGIA y TRAMPA propias. Reglas inspiradas en los juegos de
 * cartas de monstruos, con cartas y nombres propios.
 *
 * Funciona en el navegador (Duelo.Cards) y en Node (para las pruebas).
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});
  const GG = isBrowser ? window.G : global.G;

  const TYPE_ES = {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo',
    fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada'
  };
  const TYPE_COLOR = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad'
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------- monstruos (de la Pokédex) ----------------
  const MONSTERS = [];
  const BY_ID = new Map();
  for (const e of (GG.DEX || [])) {
    // pa/sa se derivaron de los stats base: 0,70 + base/100 · 0,55 (tools/fetch_pokedex.py)
    const rawAtk = Math.max((e.pa - 0.70) / 0.55 * 100, (e.sa - 0.70) / 0.55 * 100);
    const rawDef = Math.max(e.df, e.sd);
    const card = {
      id: 'm' + e.dex, kind: 'monster', dex: e.dex, name: e.name, types: e.types.slice(), type: e.types[0],
      level: clamp(Math.round((e.bst - 170) / 70), 1, 8),
      atk: clamp(Math.round(rawAtk * 18 / 50) * 50, 100, 3500),
      def: clamp(Math.round(rawDef * 18 / 50) * 50, 100, 3500),
      rarity: e.rarity, leg: !!e.leg, gen: e.gen, bst: e.bst
    };
    MONSTERS.push(card); BY_ID.set(card.id, card);
  }

  // ---------------- magias ----------------
  // fx: lo que hace (lo interpreta engine.js)
  const SPELLS = [
    { id: 's_potion', name: 'Poción', icon: '🧪', fx: 'heal', n: 1000, text: 'Recuperas 1000 PV.' },
    { id: 's_hyper', name: 'Hiperpoción', icon: '💉', fx: 'heal', n: 2500, text: 'Recuperas 2500 PV.' },
    { id: 's_bag', name: 'Mochila de Aventurero', icon: '🎒', fx: 'draw', n: 2, text: 'Robas 2 cartas.' },
    { id: 's_ball', name: 'Poké Ball', icon: '🔴', fx: 'search', max: 4, text: 'Elige 1 monstruo de nivel 4 o menos de tu mazo y agrégalo a tu mano.' },
    { id: 's_master', name: 'Master Ball', icon: '🟣', fx: 'search', min: 7, text: 'Elige 1 monstruo de nivel 7 o más de tu mazo y agrégalo a tu mano.' },
    { id: 's_revive', name: 'Revivir', icon: '✨', fx: 'revive', text: 'Invoca 1 monstruo de tu cementerio en posición de ataque.' },
    { id: 's_beam', name: 'Hiperrayo', icon: '💥', fx: 'destroyOne', self: 1000, text: 'Destruye 1 monstruo del rival. Pierdes 1000 PV.' },
    { id: 's_quake', name: 'Terremoto', icon: '🌋', fx: 'destroyAll', text: 'Destruye todos los monstruos del campo.' },
    { id: 's_twister', name: 'Tornado', icon: '🌪️', fx: 'destroyST', text: 'Destruye 1 carta de magia o trampa del rival.' },
    { id: 's_flame', name: 'Llamarada', icon: '🔥', fx: 'burn', n: 1000, text: 'Inflige 1000 de daño directo al rival.' },
    { id: 's_candy', name: 'Caramelo Raro', icon: '🍬', fx: 'boost', n: 700, text: 'Un monstruo tuyo gana 700 ATK hasta el final del turno.' },
    { id: 's_band', name: 'Cinta Experto', icon: '🎗️', fx: 'equip', eAtk: 600, eDef: 600, sub: 'equip', text: 'Equipa a un monstruo tuyo: gana 600 ATK y DEF.' }
  ].map(c => Object.assign({ kind: 'spell' }, c));

  // ---------------- trampas ----------------
  // trigger: cuándo se puede activar (siempre boca abajo desde un turno anterior)
  const TRAPS = [
    { id: 't_barrier', name: 'Barrera', icon: '🛡️', trigger: 'attack', fx: 'negateAttack', text: 'Cuando el rival declare un ataque: niega ese ataque.' },
    { id: 't_counter', name: 'Contraataque', icon: '⚔️', trigger: 'attack', fx: 'destroyAttacker', text: 'Cuando el rival declare un ataque: destruye al monstruo atacante.' },
    { id: 't_mirror', name: 'Espejo Mágico', icon: '🪞', trigger: 'attack', fx: 'mirror', text: 'Cuando el rival declare un ataque: niega el ataque y el rival pierde 800 PV.' },
    { id: 't_negate', name: 'Anulación', icon: '🚫', trigger: 'spell', fx: 'negateSpell', text: 'Cuando el rival active una magia: niega su activación y destrúyela.' },
    { id: 't_snare', name: 'Cepo', icon: '🪤', trigger: 'summon', fx: 'destroySummoned', text: 'Cuando el rival invoque un monstruo en ataque: destrúyelo.' }
  ].map(c => Object.assign({ kind: 'trap' }, c));

  for (const c of SPELLS.concat(TRAPS)) BY_ID.set(c.id, c);

  // ---------------- tabla de tipos ----------------
  /** Multiplicador de los juegos (×2 / ×0,5 / ×0, multiplicados) de un tipo atacante contra los tipos del defensor. */
  function typeMult(att, defTypes) {
    const row = GG.Types && GG.Types.CHART && GG.Types.CHART[att];
    if (!row) return 1;
    let m = 1;
    for (const t of defTypes) if (row[t] != null) m *= row[t];
    return m;
  }
  /** Bonus de ATK en combate: ±500 / ±1000 según la eficacia del tipo principal del atacante. */
  function typeBonus(att, defTypes) {
    const m = typeMult(att, defTypes);
    if (m === 0) return -1000;
    if (m >= 4) return 1000;
    if (m >= 2) return 500;
    if (m <= 0.25) return -1000;
    if (m <= 0.5) return -500;
    return 0;
  }

  // ---------------- mazos ----------------
  const DECK_SIZE = 30, MAX_COPIES = 2;

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /** Mazo de estreno de un tipo: 18 monstruos (por niveles) + 8 magias + 4 trampas. Siempre el mismo. */
  function presetDeck(type) {
    const bucket = c => c.level <= 2 ? 0 : c.level <= 4 ? 1 : c.level <= 6 ? 2 : 3;
    const quota = [4, 8, 4, 2];
    const pool = MONSTERS.filter(c => c.types.includes(type));
    const rest = MONSTERS.filter(c => !c.types.includes(type) && c.types.includes('normal'));
    const take = (list, n, seedKey) => {
      const sorted = list.slice().sort((a, b) => hash(seedKey + a.id) - hash(seedKey + b.id));
      return sorted.slice(0, n);
    };
    const chosen = [];
    for (let b = 0; b < 4; b++) {
      let got = take(pool.filter(c => bucket(c) === b), quota[b], type + b);
      if (got.length < quota[b]) got = got.concat(take(rest.filter(c => bucket(c) === b), quota[b] - got.length, type + 'r' + b));
      if (got.length < quota[b]) got = got.concat(take(MONSTERS.filter(c => bucket(c) === b && !got.includes(c)), quota[b] - got.length, 'x' + b));
      for (const c of got) chosen.push(c.id);
    }
    const extras = ['s_potion', 's_potion', 's_bag', 's_ball', 's_revive', 's_beam', 's_flame', 's_band',
      't_barrier', 't_counter', 't_snare', 't_negate'];
    return chosen.concat(extras);
  }

  /** Comprueba un mazo (lista de ids). Devuelve '' si es válido o el motivo. */
  function checkDeck(ids) {
    if (!Array.isArray(ids) || ids.length !== DECK_SIZE) return `El mazo debe tener exactamente ${DECK_SIZE} cartas (tiene ${ids ? ids.length : 0}).`;
    const n = {};
    for (const id of ids) {
      if (!BY_ID.has(id)) return 'Hay una carta que no existe.';
      n[id] = (n[id] || 0) + 1;
      if (n[id] > MAX_COPIES) return `Máximo ${MAX_COPIES} copias de cada carta (${BY_ID.get(id).name}).`;
    }
    return '';
  }

  const PRESET_TYPES = ['fire', 'water', 'grass', 'electric', 'psychic', 'dragon', 'ghost', 'fighting', 'dark',
    'steel', 'fairy', 'ground', 'ice', 'flying', 'bug', 'rock', 'poison', 'normal'];

  D.Cards = {
    get: id => BY_ID.get(id),
    monsters: MONSTERS, spells: SPELLS, traps: TRAPS,
    all: () => MONSTERS.concat(SPELLS, TRAPS),
    TYPE_ES, TYPE_COLOR, PRESET_TYPES, DECK_SIZE, MAX_COPIES,
    typeMult, typeBonus, presetDeck, checkDeck,
    tributesFor: level => level >= 7 ? 2 : level >= 5 ? 1 : 0
  };
  if (!isBrowser) module.exports = D.Cards;
})();
