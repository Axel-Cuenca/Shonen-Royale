/* ============ duelo/cards.js — las cartas del Duelo ============
 * Desde el 22-10-2026 el catálogo es sólo el de las cartas propias (CUSTOM): el dueño las va pasando de a una.
 * El catálogo antiguo (Pokémon de la Pokédex, 12 magias, 5 trampas) está en tools/legacy_catalog.js y sólo
 * lo usan las pruebas. Con pocas cartas no se puede armar un mazo válido (30 cartas, 2 copias) y el juego
 * avisa de que aún no se puede jugar.
 *
 * Funciona en el navegador (Duelo.Cards) y en Node (para las pruebas).
 */
(function () {
  'use strict';
  const isBrowser = typeof window !== 'undefined';
  const D = isBrowser ? (window.Duelo = window.Duelo || {}) : (global.Duelo = global.Duelo || {});

  const TYPE_ES = {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo',
    fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
    popeye: 'Popeye', minecraft: 'Minecraft', prueba: 'Prueba'
  };
  const TYPE_COLOR = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
    popeye: '#2e5aa8', minecraft: '#4a9a3a', prueba: '#8a8fa8'
  };

  // ---------------- catálogo ----------------
  // El catálogo de producción sólo tiene las cartas propias (más abajo): se van añadiendo de a una.
  // Los arrays de monstruos/magias/trampas están vacíos; tools/legacy_catalog.js los rellena sólo en las pruebas.
  const MONSTERS = [];
  const BY_ID = new Map();
  const SPELLS = [], TRAPS = [], PRESET_TYPES = [];

  // ---------------- cartas propias (no son de la Pokédex) ----------------
  // img: ilustración de la carta (se cambia sustituyendo el archivo). ability: la interpreta engine.js.
  // Regla de tipo: las cartas nuevas llevan como tipo el nombre de su serie; los Pokémon no cambian.
  const CUSTOM = [
    {
      id: 'c_popeye', kind: 'monster', dex: 0, name: 'Popeye El Marinero', types: ['popeye'], type: 'popeye',
      level: 4, atk: 1200, def: 1200, rarity: 'rare', leg: false, gen: 0, bst: 0,
      img: 'assets/cards/popeye.png', ability: 'spinach',
      text: '¡A comer espinaca!: una vez, cuando sea destruido en combate o por un efecto y vaya al cementerio, ' +
        'puedes revivirlo en tu campo (en ataque o defensa) con 1500 ATK y 1500 DEF. No ataca el turno en que revive. ' +
        'Si lo invocas o lo revives con otra carta, la habilidad vuelve a estar disponible.',
      voice: { src: 'assets/voices/popeye.mp3', say: '¡A comer espinaca!' }
    },
    {
      id: 'c_creeper', kind: 'monster', dex: 0, name: 'Creeper', types: ['minecraft'], type: 'minecraft',
      level: 3, atk: 1000, def: 1000, rarity: 'rare', leg: false, gen: 0, bst: 0,
      img: 'assets/cards/creeper.png', ability: 'boom',
      text: 'Explosión del Creeper: cuando combate contra otro monstruo del campo (ataque tuyo o del rival, en ataque o en defensa), ' +
        'el combate se calcula con normalidad y después Creeper y ese monstruo son desterrados (no van al cementerio). ' +
        'Una vez por invocación; no se activa en ataques directos.',
      voice: { src: 'assets/voices/creeper.mp3', say: '¡Ssssss… boom!' }
    }
  ];
  for (const c of CUSTOM) BY_ID.set(c.id, c);

  // ---------------- modo de prueba ----------------
  // Se activa abriendo el juego con «?prueba» al final de la dirección. Sirve para ver y probar el juego mientras
  // no hay cartas suficientes: mazo fijo de 30 con Popeye, Creeper, cartas de relleno («Prueba ★N», sin
  // habilidad) y magias y trampas de prueba, sin límite de copias y sólo contra la computadora. No cambia las reglas reales.
  const TEST = isBrowser && /[?&]prueba(=|&|$)/.test(location.search);
  const TESTCARDS = TEST ? [2, 4, 5, 6, 7, 8].map(l => ({
    id: 'x' + l, kind: 'monster', dex: 0, name: 'Prueba ★' + l, types: ['prueba'], type: 'prueba', level: l,
    atk: 700 + l * 250, def: 600 + l * 200, rarity: 'c', leg: false, gen: 0, bst: 0, text: 'Carta de relleno del modo de prueba (sin habilidad).'
  })) : [];
  // magias y trampas de relleno, sólo para probar el tablero y las respuestas (usan los efectos que ya tiene el motor)
  const TESTST = !TEST ? [] : [
    { id: 'xs_potion', name: 'Prueba: Poción', icon: '🧪', fx: 'heal', n: 1000, text: 'Recuperas 1000 PV.' },
    { id: 'xs_bag', name: 'Prueba: Mochila', icon: '🎒', fx: 'draw', n: 2, text: 'Robas 2 cartas.' },
    { id: 'xs_revive', name: 'Prueba: Revivir', icon: '✨', fx: 'revive', text: 'Invoca 1 monstruo de tu cementerio en posición de ataque.' },
    { id: 'xs_beam', name: 'Prueba: Hiperrayo', icon: '💥', fx: 'destroyOne', self: 1000, text: 'Destruye 1 monstruo del rival. Pierdes 1000 PV.' },
    { id: 'xs_quake', name: 'Prueba: Terremoto', icon: '🌋', fx: 'destroyAll', text: 'Destruye todos los monstruos del campo.' },
    { id: 'xs_twister', name: 'Prueba: Tornado', icon: '🌪️', fx: 'destroyST', text: 'Destruye 1 carta de magia o trampa del rival.' },
    { id: 'xs_flame', name: 'Prueba: Llamarada', icon: '🔥', fx: 'burn', n: 1000, text: 'Inflige 1000 de daño directo al rival.' },
    { id: 'xs_candy', name: 'Prueba: Caramelo', icon: '🍬', fx: 'boost', n: 700, text: 'Un monstruo tuyo gana 700 ATK hasta el final del turno.' },
    { id: 'xs_band', name: 'Prueba: Cinta', icon: '🎗️', fx: 'equip', eAtk: 600, eDef: 600, sub: 'equip', text: 'Equipa a un monstruo tuyo: gana 600 ATK y DEF.' }
  ].map(c => Object.assign({ kind: 'spell' }, c)).concat([
    { id: 'xt_barrier', name: 'Prueba: Barrera', icon: '🛡️', trigger: 'attack', fx: 'negateAttack', text: 'Cuando el rival declare un ataque: niega ese ataque.' },
    { id: 'xt_counter', name: 'Prueba: Contraataque', icon: '⚔️', trigger: 'attack', fx: 'destroyAttacker', text: 'Cuando el rival declare un ataque: destruye al monstruo atacante.' },
    { id: 'xt_mirror', name: 'Prueba: Espejo', icon: '🪞', trigger: 'attack', fx: 'mirror', text: 'Cuando el rival declare un ataque: niega el ataque y el rival pierde 800 PV.' },
    { id: 'xt_negate', name: 'Prueba: Anulación', icon: '🚫', trigger: 'spell', fx: 'negateSpell', text: 'Cuando el rival active una magia: niega su activación y destrúyela.' },
    { id: 'xt_snare', name: 'Prueba: Cepo', icon: '🪤', trigger: 'summon', fx: 'destroySummoned', text: 'Cuando el rival invoque un monstruo en ataque: destrúyelo.' }
  ].map(c => Object.assign({ kind: 'trap' }, c)));
  for (const c of TESTCARDS.concat(TESTST)) BY_ID.set(c.id, c);
  // mazo de prueba (30): 12 monstruos, 10 magias y 8 trampas
  const testDeck = () => ['c_popeye', 'c_popeye', 'c_popeye', 'c_creeper', 'c_creeper', 'c_creeper', 'x2', 'x4', 'x5', 'x6', 'x7', 'x8',
    'xs_potion', 'xs_potion', 'xs_bag', 'xs_revive', 'xs_beam', 'xs_quake', 'xs_twister', 'xs_flame', 'xs_candy', 'xs_band',
    'xt_barrier', 'xt_barrier', 'xt_counter', 'xt_counter', 'xt_mirror', 'xt_negate', 'xt_snare', 'xt_snare'].filter(id => BY_ID.has(id));

  // ---------------- mazos ----------------
  const DECK_SIZE = 30, MAX_COPIES = 2;

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /** Mazo de estreno de un tipo: 18 monstruos (por niveles) + 8 magias + 4 trampas. Siempre el mismo. */
  function presetDeck(type) {
    const bucket = c => c.level <= 2 ? 0 : c.level <= 4 ? 1 : c.level <= 6 ? 2 : 3;
    if (TEST && !MONSTERS.length) return testDeck();
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
    return chosen.concat(extras).filter(id => BY_ID.has(id));
  }

  /** Comprueba un mazo (lista de ids). Devuelve '' si es válido o el motivo. */
  function checkDeck(ids) {
    if (!Array.isArray(ids) || ids.length !== DECK_SIZE) return `El mazo debe tener exactamente ${DECK_SIZE} cartas (tiene ${ids ? ids.length : 0}).`;
    const n = {};
    for (const id of ids) {
      if (!BY_ID.has(id)) return 'Hay una carta que no existe.';
      n[id] = (n[id] || 0) + 1;
      if (!TEST && n[id] > MAX_COPIES) return `Máximo ${MAX_COPIES} copias de cada carta (${BY_ID.get(id).name}).`;
    }
    return '';
  }

  /** Sólo para las pruebas: mete un catálogo de prueba (monstruos, magias, trampas, tipos de mazo de estreno). */
  function register(mons, spells, traps, types) {
    for (const c of mons) { MONSTERS.push(c); BY_ID.set(c.id, c); }
    for (const c of spells) { SPELLS.push(c); BY_ID.set(c.id, c); }
    for (const c of traps) { TRAPS.push(c); BY_ID.set(c.id, c); }
    PRESET_TYPES.length = 0; PRESET_TYPES.push(...types);
  }
  /** ¿Hay cartas suficientes para armar un mazo válido? (con pocas cartas aún no se puede jugar) */
  const canPlay = () => TEST || (MONSTERS.length + CUSTOM.length + SPELLS.length + TRAPS.length) * MAX_COPIES >= DECK_SIZE;

  D.Cards = {
    get: id => BY_ID.get(id),
    monsters: MONSTERS, spells: SPELLS, traps: TRAPS,
    custom: CUSTOM,
    all: () => MONSTERS.concat(CUSTOM, TESTCARDS, SPELLS, TRAPS, TESTST),
    TYPE_ES, TYPE_COLOR, PRESET_TYPES, DECK_SIZE, MAX_COPIES,
    presetDeck, checkDeck, register, canPlay, testDeck, test: TEST,
    tributesFor: level => level >= 7 ? 2 : level >= 5 ? 1 : 0
  };
  if (!isBrowser) module.exports = D.Cards;
})();
