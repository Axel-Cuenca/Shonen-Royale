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
    popeye: 'Popeye', minecraft: 'Minecraft', prueba: 'Prueba',
    dbz: 'Dragon Ball Z', gow: 'God of War', aot: 'Attack on Titan', jjk: 'Jujutsu Kaisen', mk: 'Mortal Kombat', zodiaco: 'Caballero del Zodiaco'
  };
  const TYPE_COLOR = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
    popeye: '#2e5aa8', minecraft: '#4a9a3a', prueba: '#8a8fa8',
    dbz: '#e8761a', gow: '#a3262a', aot: '#6b5a3c', jjk: '#6a3fb5', mk: '#b8312f', zodiaco: '#d4a72c'
  };

  // ---------------- catálogo ----------------
  // El catálogo de producción sólo tiene las cartas propias (más abajo): se van añadiendo de a una.
  // Los arrays de monstruos/magias/trampas están vacíos; tools/legacy_catalog.js los rellena sólo en las pruebas.
  const MONSTERS = [];
  const BY_ID = new Map();
  const SPELLS = [], TRAPS = [], PRESET_TYPES = [];

  // ---------------- cartas propias (no son de la Pokédex) ----------------
  // img: ilustración de la carta (se cambia sustituyendo el archivo). ab: habilidades, las interpreta engine.js.
  // sfx: sonidos de la carta (attack al atacar, transform al transformarse, ability al usar una habilidad, use al activarla).
  // Regla de tipo: las cartas nuevas llevan como tipo el nombre de su serie; los Pokémon no cambian.
  const V = f => 'assets/voices/' + f + '.mp3', I = f => 'assets/cards/' + f + '.webp';
  const mon = o => Object.assign({ kind: 'monster', dex: 0, rarity: 'rare', leg: false, gen: 0, bst: 0 }, o, { types: [o.type] });
  const spell = o => Object.assign({ kind: 'spell' }, o);
  // Habilidades: nombre y explicación (para la ventana de la carta y para lo que roban Kratos o Cell)
  const AB = {
    spinach: ['¡A comer espinaca!', 'Una vez, al ser destruido y ir al cementerio, puede revivir en tu campo con 1500 ATK y 1500 DEF.'],
    boom: ['Explosión', 'Tras un combate contra otro monstruo, los dos son desterrados. Una vez por invocación.'],
    instinto: ['Instinto Saiyajin', 'Si es tu único personaje en el campo, gana +400 ATK y +400 DEF.'],
    sangre: ['Sangre Saiyajin', 'Si es tu único personaje en el campo, gana +800 ATK y +800 DEF.'],
    canon: ['Cañón Espiritual Final', 'Destruye a un personaje enemigo de 7 estrellas o menos. Sin límite de usos.'],
    absorb: ['Absorción', 'Una vez por invocación: absorbe a un personaje del campo (aliado o enemigo) de tantas estrellas o menos que él; gana la mitad de su ATK y DEF y su habilidad. Si muere, lo libera.'],
    robar1: ['Robar habilidad', 'Cuando asesina a un personaje enemigo puedes quedarte con su habilidad (sólo una en total).'],
    robar2: ['Robar habilidades', 'Cuando asesina a un personaje enemigo puedes quedarte con una de sus habilidades (hasta 2 enemigos distintos).'],
    furia: ['Furia de Esparta', 'Tras su primera baja: una vez por invocación, +700 ATK y +700 DEF hasta el final del turno.'],
    bite: ['Invocación del Titán', 'Pagas 500 PV: invoca especialmente a Titán Martillo desde tu mano; Lara queda vinculada a él.'],
    regen5: ['Regeneración maldita', 'Inmune a las magias y trampas que intenten destruirlo.'],
    regen60: ['Regeneración maldita superior', 'Inmune a las magias, trampas y habilidades que intenten destruirlo.'],
    relicario: ['Relicario Demoníaco', 'Una vez por invocación: +500 ATK y DEF durante 2 turnos. Sólo los personajes de 10★ o más usan habilidades y nadie activa magias ni trampas.'],
    desmantelar: ['Desmantelar', 'Una vez por invocación: destruye una carta de magia/trampa del rival.'],
    copy: ['Transformación', 'Una vez por turno puede transformarse en un personaje que esté en el campo, copiando su estado actual: nombre, tipo, estrellas, habilidades y su ATK/DEF final con todos los bonos y penalizaciones vigentes (los temporales duran lo mismo que en el original). Sus habilidades copiadas empiezan sin usar. Si lo derrotan transformado, vuelve a su forma y no puede transformarse más.'],
    saiyan: ['Sangre Saiyan', 'Si es revivido, vuelve con +500 ATK y +500 DEF.'],
    escudo: ['Escudo Blue Evolution', 'Escudo de 3000: los ataques y las magias/trampas que lo destruyan golpean primero al escudo.'],
    bigbang: ['Big Bang', 'Una vez por invocación: destruye a todos los personajes rivales con menos de 2000 ATK.'],
    xform: ['Transformación', 'Se transforma en otra carta desde tu mano; la carta anterior queda vinculada.']
  };
  const CUSTOM = [
    mon({
      id: 'c_popeye', name: 'Popeye El Marinero', type: 'popeye', level: 4, atk: 1200, def: 1200,
      img: I('popeye'), ab: ['spinach'],
      text: '¡A comer espinaca!: una vez, cuando sea destruido en combate o por un efecto y vaya al cementerio, ' +
        'puedes revivirlo en tu campo (en ataque o defensa) con 1500 ATK y 1500 DEF. No ataca el turno en que revive. ' +
        'Si lo invocas o lo revives con otra carta, la habilidad vuelve a estar disponible.',
      voice: { src: V('popeye-attack'), say: '¡A comer espinaca!' }, sfx: { attack: V('popeye-attack') }
    }),
    mon({
      id: 'c_creeper', name: 'Creeper', type: 'minecraft', level: 3, atk: 1000, def: 1000,
      img: I('creeper'), ab: ['boom'],
      text: 'Explosión del Creeper: cuando combate contra otro monstruo del campo (ataque tuyo o del rival, en ataque o en defensa), ' +
        'el combate se calcula con normalidad y después Creeper y ese monstruo son desterrados (no van al cementerio). ' +
        'Una vez por invocación; no se activa en ataques directos.',
      voice: { src: V('creeper-attack'), say: '¡Ssssss… boom!' }
    }),
    mon({
      id: 'c_bardock', name: 'Bardock', type: 'dbz', level: 4, atk: 1400, def: 1400, img: I('bardock'), ab: ['instinto'],
      xform: { to: 'c_bardock_ssj', wait: 1 },
      text: 'Instinto Saiyajin: si es tu único personaje en el campo, recibe +400 ATK y +400 DEF. ' +
        'Transformación: tras permanecer un turno completo en el campo, puedes invocar a Bardock SSJ desde tu mano en su lugar (sin gastar tu invocación normal); Bardock queda vinculado a él.',
      sfx: { attack: V('bardock-attack'), transform: V('bardock-transform') }
    }),
    mon({
      id: 'c_bardock_ssj', name: 'Bardock SSJ', type: 'dbz', level: 7, atk: 1800, def: 1800, img: I('bardock_ssj'), ab: ['sangre', 'canon'],
      text: 'Sangre Saiyajin: si es tu único personaje en el campo, recibe +800 ATK y +800 DEF. ' +
        'Cañón Espiritual Final: cuando quieras, destruye a un personaje enemigo de 7 estrellas o menos. ' +
        'Si llegó por la transformación de Bardock, Bardock queda vinculado y sigue su mismo destino.',
      sfx: { attack: V('bardock-attack') }
    }),
    mon({
      id: 'c_cell', name: 'Cell Semi Perfecto', type: 'dbz', level: 6, atk: 1500, def: 1400, img: I('cell'), ab: ['absorb'],
      text: 'Absorción: una vez por invocación, absorbe a un personaje del campo (aliado o enemigo) de 6 estrellas o menos. ' +
        'Cell gana la mitad de su ATK y de su DEF y también su habilidad. Si Cell es destruido, el absorbido vuelve al campo de su dueño (o va al cementerio si no hay sitio).',
      sfx: { attack: V('cell-attack') }
    }),
    mon({
      id: 'c_kratos', name: 'Kratos', type: 'gow', level: 4, atk: 1300, def: 1300, img: I('kratos'), ab: ['robar1'],
      text: 'Robar habilidad: cuando Kratos asesina a un personaje enemigo (en combate o con un efecto suyo) puedes quedarte con su habilidad. ' +
        'Sólo una habilidad en total por invocación; si la rechazas, conservas la oportunidad.',
      sfx: { attack: V('kratos-attack') }
    }),
    mon({
      id: 'c_kratos_f', name: 'Kratos, el Fantasma de Esparta', type: 'gow', level: 6, atk: 1800, def: 1800, img: I('kratos_fantasma'), ab: ['robar2', 'furia'],
      text: 'Robar habilidades: al asesinar a un enemigo puedes quedarte con una de sus habilidades (hasta 2 enemigos distintos). ' +
        'Furia de Esparta: tras su primera baja, una vez por invocación, gana +700 ATK y +700 DEF hasta el final del turno.',
      sfx: { attack: V('kratos-attack') }
    }),
    mon({
      id: 'c_lara', name: 'Lara Tybur', type: 'aot', level: 2, atk: 300, def: 300, img: I('lara'), ab: ['bite'],
      text: 'Invocación del Titán Martillo: una vez, pagando 500 PV, invoca especialmente a Titán Martillo desde tu mano en su lugar. ' +
        'También puedes invocarlo si Lara muere por combate o por un efecto. Lara queda vinculada al Titán.',
      sfx: { transform: V('lara-transform') }
    }),
    mon({
      id: 'c_titan', name: 'Titán Martillo', type: 'aot', level: 8, atk: 1800, def: 2000, img: I('titan'), wide: true,
      text: 'Ocupa 2 zonas contiguas de monstruo. Se invoca con 2 tributos, o especialmente con Lara Tybur. Sin habilidades propias.'
    }),
    mon({
      id: 'c_sukuna5', name: 'Ryomen Sukuna 5%', type: 'jjk', level: 4, atk: 1300, def: 1300, img: I('sukuna5'), ab: ['regen5'],
      text: 'Regeneración maldita: las magias y trampas (tuyas o del rival) no pueden destruirlo; sus demás efectos se resuelven con normalidad. No lo protege del combate ni de otros efectos.',
      sfx: { attack: V('sukuna5-attack') }
    }),
    mon({
      id: 'c_sukuna60', name: 'Ryomen Sukuna 60%', type: 'jjk', level: 10, atk: 2800, def: 2900, img: I('sukuna60'), ab: ['regen60', 'relicario', 'desmantelar'],
      text: 'Regeneración maldita superior: inmune a magias, trampas y habilidades que intenten destruirlo. ' +
        'Relicario Demoníaco (una vez): +500 ATK y DEF durante 2 turnos; en ese dominio sólo los personajes de 10★ o más usan habilidades y nadie activa magias ni trampas. ' +
        'Desmantelar (una vez): destruye una magia o trampa del rival.',
      sfx: { attack: V('sukuna5-attack'), ability: V('sukuna60-ability') }
    }),
    mon({
      id: 'c_shang', name: 'Shang Tsung', type: 'mk', level: 9, atk: 1100, def: 1000, img: I('shang'), ab: ['copy'], sp: 'types3',
      text: 'Sólo se invoca especialmente desde la mano, si hay 3 tipos de personaje distintos en el campo (de ambos jugadores) y un espacio libre. ' +
        'Transformación: una vez por turno puede copiar a cualquier otro personaje (nombre, imagen, estrellas, ATK, DEF y habilidades). ' +
        'Si lo derrotan transformado, no muere: vuelve a ser Shang Tsung y pierde la transformación; derrotado en su forma base, muere.',
      sfx: { attack: V('shang-attack') }
    }),
    mon({
      id: 'c_vegeta', name: 'Vegeta', type: 'dbz', level: 4, atk: 1500, def: 1500, img: I('vegeta'), ab: ['saiyan'], xform: { family: 'Vegeta' },
      text: 'Sangre Saiyan: si es revivido, vuelve con +500 ATK y +500 DEF. ' +
        'Transformación: puede transformarse en otra carta Vegeta de tu mano (1 turno completo de espera por cada 2 estrellas de diferencia); la anterior queda vinculada.',
      sfx: { attack: V('vegeta-attack'), transform: V('bardock-transform') }
    }),
    mon({
      id: 'c_vegeta_blue', name: 'Vegeta Blue Evolution', type: 'dbz', level: 10, atk: 2700, def: 2800, img: I('vegeta_blue'), ab: ['escudo', 'bigbang'], xform: { family: 'Vegeta' },
      text: 'Escudo Blue Evolution: 3000 de resistencia; los ataques le quitan el escudo y no a él, y las magias o trampas que intenten destruirlo sólo destruyen el escudo. ' +
        'Big Bang (una vez): destruye a todos los personajes rivales con menos de 2000 ATK. Se puede llegar a él transformando a un Vegeta.',
      sfx: { attack: V('vegeta-attack'), transform: V('bardock-transform'), ability: V('vegeta_blue-ability') }
    }),
    spell({
      id: 'c_armadura', name: 'Armadura Dorada', icon: '🛡️', img: I('armadura'), fx: 'equip', sub: 'equip', eAtk: 600, eDef: 600, eType: { type: 'zodiaco', atk: 1000, def: 1000 },
      text: 'Equipa a un personaje tuyo: +1000 ATK y DEF si es Caballero del Zodiaco; +600 ATK y DEF si es de otro tipo. Si el personaje sale del campo, la armadura va al cementerio.',
      sfx: { use: V('armadura-use') }
    }),
    spell({
      id: 'c_espada', name: 'Espada del Rey Arruinado', icon: '🗡️', img: I('espada'), fx: 'equip', sub: 'equip', sword: 500,
      text: 'Equipa a un personaje tuyo. Cuando ataque a otro personaje, roba 500 de DEF al objetivo y gana 500 ATK, sólo durante ese combate.'
    }),
    spell({
      id: 'c_gema', name: 'Gema de la Mente', icon: '🔮', img: I('gema'), fx: 'gem', sub: 'cont',
      text: 'Controla la mente de un personaje enemigo. Una acción por turno, máximo 2 en total: cancelar su ataque, cambiar su posición u obligarlo a atacar a un aliado suyo. Tras la segunda acción se destruye.'
    }),
    spell({
      id: 'c_karma', name: 'Karma', icon: '☯️', img: I('karma'), fx: 'karma', sub: 'equip',
      text: 'Equípala a un personaje tuyo. Si muere, Karma pasa a un personaje enemigo que elijas y empieza una cuenta atrás de 3 turnos: si se cumple, ese enemigo muere y tu personaje revive en tu campo.'
    }),
    spell({
      id: 'c_superball', name: 'Superball', icon: '🔴', img: I('superball'), fx: 'special', max: 6,
      text: 'Invoca especialmente desde tu mano un personaje de 6 estrellas o menos, sin tributos y sin gastar tu invocación normal.',
      sfx: { use: V('superball-use') }
    }),
    spell({
      id: 'c_tormenta', name: 'Tormenta Eléctrica', icon: '⚡', img: I('tormenta'), fx: 'storm', sub: 'cont',
      text: 'Magia continua. Una vez por turno, elige: (1) destruye un personaje tuyo de la mano para asesinar a un personaje rival de igual o menos estrellas; o (2) destruye una magia/trampa de tu mano para destruir una magia/trampa rival.',
      sfx: { use: V('tormenta-use') }
    })
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

  /** Mazo de la computadora con las cartas propias (30, máximo 2 copias de cada una). */
  const aiDeck = () => {
    const two = ['c_lara', 'c_creeper', 'c_popeye', 'c_bardock', 'c_kratos', 'c_vegeta', 'c_sukuna5', 'c_cell', 'c_kratos_f', 'c_armadura', 'c_espada', 'c_superball'];
    const one = ['c_bardock_ssj', 'c_vegeta_blue', 'c_titan', 'c_sukuna60', 'c_tormenta', 'c_karma'];
    return two.flatMap(id => [id, id]).concat(one).filter(id => BY_ID.has(id));
  };
  /** Mazo de estreno de un tipo: 18 monstruos (por niveles) + 8 magias + 4 trampas. Siempre el mismo. */
  function presetDeck(type) {
    const bucket = c => c.level <= 2 ? 0 : c.level <= 4 ? 1 : c.level <= 6 ? 2 : 3;
    if (TEST && !MONSTERS.length) return testDeck();
    if (!MONSTERS.length) return aiDeck();
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
    custom: CUSTOM, AB,
    all: () => MONSTERS.concat(CUSTOM, TESTCARDS, SPELLS, TRAPS, TESTST),
    TYPE_ES, TYPE_COLOR, PRESET_TYPES, DECK_SIZE, MAX_COPIES,
    presetDeck, checkDeck, register, canPlay, testDeck, test: TEST,
    tributesFor: level => level >= 10 ? 3 : level >= 7 ? 2 : level >= 5 ? 1 : 0
  };
  if (!isBrowser) module.exports = D.Cards;
})();
