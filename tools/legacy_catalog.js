/* tools/legacy_catalog.js — el catálogo ANTIGUO del Duelo (todos los Pokémon de la Pokédex + 12 magias + 5 trampas).
 * Ya no está en el juego: el sitio sólo tiene las cartas que el dueño va pasando una a una.
 * Se conserva únicamente para las pruebas del motor, que necesitan muchas cartas para armar mazos de 30.
 * Uso:  require('./legacy_catalog.js')(Cards, G)   (antes de usar Cards).
 */
'use strict';
module.exports = function (Cards, GG) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TYPE_ES = Cards.TYPE_ES, TYPE_COLOR = Cards.TYPE_COLOR;
  Object.assign(TYPE_ES, {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo',
    fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada'
  });
  Object.assign(TYPE_COLOR, {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad'
  });
  const MONSTERS = [];
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
    MONSTERS.push(card);
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



  const PRESET_TYPES = ['fire', 'water', 'grass', 'electric', 'psychic', 'dragon', 'ghost', 'fighting', 'dark',
    'steel', 'fairy', 'ground', 'ice', 'flying', 'bug', 'rock', 'poison', 'normal'];

  Cards.register(MONSTERS, SPELLS, TRAPS, PRESET_TYPES);
};
