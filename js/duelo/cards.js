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
    dbz: 'Dragon Ball Z', gow: 'God of War', aot: 'Attack on Titan', jjk: 'Jujutsu Kaisen', mk: 'Mortal Kombat', zodiaco: 'Caballero del Zodiaco',
    marvel: 'Marvel', demonslayer: 'Demon Slayer', lol: 'League of Legends', shrek: 'Shrek', pecados: '7 Pecados Capitales', anillos: 'El Señor de los Anillos',
    adventuretime: 'Hora de Aventura', naruto: 'Naruto'
  };
  const TYPE_COLOR = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
    popeye: '#2e5aa8', minecraft: '#4a9a3a', prueba: '#8a8fa8',
    dbz: '#e8761a', gow: '#a3262a', aot: '#6b5a3c', jjk: '#6a3fb5', mk: '#b8312f', zodiaco: '#d4a72c',
    marvel: '#d12a2f', demonslayer: '#1f9d8b', lol: '#c8a24a', shrek: '#6aa84f', pecados: '#c0392b', anillos: '#b8860b',
    adventuretime: '#f5a623', naruto: '#f28c1e'
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
    canon: ['Cañón Espiritual Final', 'Destruye a un personaje enemigo de 7 estrellas o menos. Una sola vez por invocación.'],
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
    escudo: ['Escudo Blue Evolution', 'Escudo de 3000: mientras esté activo, los ataques se resuelven sólo contra el escudo (el ATK y la DEF de Vegeta no cuentan, nadie sufre daño de diferencia y lo que sobre no pasa a Vegeta); las magias/trampas que lo destruyan golpean primero al escudo.'],
    bigbang: ['Big Bang', 'Una vez por invocación: destruye a todos los personajes rivales con menos de 2000 ATK.'],
    xform: ['Transformación', 'Se transforma en otra carta desde tu mano; la carta anterior queda vinculada.'],
    zenitsu1: ['Primera Postura del Rayo', 'Cada vez que declara un ataque, obtiene +200 ATK y +200 DEF durante su invocación.'],
    zenitsu2: ['Respiración de Concentración Total', 'Una vez por invocación: +400 ATK y +400 DEF durante 2 turnos.'],
    gyomei1: ['Respiración de la Roca', '4 posturas: cada vez que ataca a otro personaje o es atacado por él, consume una y gana +200 ATK y +200 DEF.'],
    gyomei2: ['Respiración de Concentración Total', 'Una vez por invocación: +400 ATK durante 2 turnos.'],
    gyomei3: ['Marca de Cazador', 'Una vez por invocación: +500 ATK y DEF durante 3 turnos; al terminar, Gyomei muere.'],
    yoriichi: ['El Cazador Más Fuerte de la Historia', '13 posturas solares: cada vez que ataca o es atacado por otro personaje consume una y gana +300 ATK y +300 DEF. En sus propios ataques es inmune a las magias, trampas y habilidades enemigas.'],
    odincarga: ['Cargas de vida', 'Cada vez que muere un personaje del campo, Odin obtiene 1 carga de vida. Al acumular 3 cargas, puede gastarlas para revivir a un personaje de tu cementerio.'],
    odinrev: ['Revelación divina', 'Una vez por turno, puede destruir una carta boca abajo rival que todavía no haya sido revelada, ya sea un personaje o una magia/trampa.'],
    odinbend: ['Bendición de poder', 'Una vez por turno, hasta 3 veces por invocación, bendice a otro personaje aliado: +600 ATK y +600 DEF de forma permanente hasta que ese personaje sea destruido.'],
    patriarca: ['Despertar del Poder Oculto', 'Otro personaje aliado del campo (nunca él mismo) gana +700 ATK y DEF durante su invocación. Una vez por turno, hasta 3 veces por invocación.'],
    kaioken: ['Kaio-ken', 'Una vez por invocación: +700 ATK y DEF durante 3 turnos (+600 si la aprendió de Kaio Sama).'],
    maestro: ['Maestro de las Artes', 'Enseña a un aliado el Kaio-ken o la Genkidama (una enseñanza por turno, cada habilidad una vez por invocación). Quien la aprende la usa una sola vez por invocación.'],
    jogodom: ['Ataúd de la Montaña de Hierro', 'Dominio de 2 turnos: +500 ATK y DEF; sólo los personajes de 7★ o más usan habilidades y nadie activa magias ni trampas.'],
    llama: ['Llama Infernal', 'Una vez por invocación: +200 ATK y DEF por cada asesinato propio que lleve contado.'],
    sentido: ['Sentido Arácnido', 'El rival no puede elegirlo como objetivo de magias, trampas ni habilidades (sí puede atacarlo).'],
    telar: ['Telarañas', 'Sella una habilidad de un personaje enemigo mientras Spider-Man siga en el campo. Hasta 2 veces por invocación.'],
    corrupt: ['Promesa de Poder', 'Elige a un personaje enemigo con menos estrellas: no puede atacar y, en tu siguiente turno, pasa a servirte.'],
    asimila: ['Asimilación', 'Se regenera la primera vez que muere en un turno; si muere otra vez ese mismo turno, muere de verdad.'],
    espada: ['Espada de Exterminio', 'Los personajes que mata Mahoraga son desterrados en lugar de ir al cementerio.'],
    muerte: ['Acumulación de Muertes', 'Cada vez que muere un personaje, gana +300 ATK de forma permanente.'],
    counter: ['Total Counter', 'Una vez por turno, cuando el rival te lanza una magia, una trampa, una habilidad o un ataque hostil, puedes devolver su efecto contra su dueño y elegir el objetivo.'],
    yutadom: ['Amor Mutuo y Verdadero', 'Una sola vez por invocación (también con la Gema del Poder). Dominio de 2 turnos: +500 ATK y DEF; sólo los personajes de más de 10★ usan habilidades, las magias y trampas del campo quedan desactivadas, y Yuta puede usar las habilidades de cualquier personaje boca arriba.'],
    copia: ['Copia de Técnicas', 'Cuando otro personaje usa una habilidad estando Yuta en el campo, puedes aprenderla (1 por turno, máximo 3, sin repetir). Se conserva aunque el original se vaya.'],
    rikaint: ['Rika Orimoto: Intercepción Protectora', 'Cuando un aliado va a morir por un ataque, una magia, una trampa o una habilidad, Rika intercepta el efecto y el aliado se salva. 2 usos por invocación, 1 por turno.'],
    rikamal: ['Maldición Incontrolable', 'Si no hay un Yuta Okkotsu en el campo ni un Anillo de la Promesa equipado, Rika debe atacar cada turno a un personaje del campo (aliado o enemigo) y sólo ataca directo si no hay ninguno.'],
    rikaprot: ['Protección Absoluta', 'No puede recibir equipamientos ni ser afectada por magias o trampas.'],
    rikavinc: ['El Vínculo con Yuta', 'Con Yuta Okkotsu en el campo, o un Anillo de la Promesa equipado a cualquier personaje, Rika es feliz: +700 ATK y DEF y ataca cuando quiera (+1200 si el portador del anillo es Yuta). No se acumulan.'],
    // ---------------- tanda 3 (27-10-2026) ----------------
    regenx: ['Regeneración extrema', 'Inmune a la destrucción por combate y por habilidades de personaje. Las magias y trampas que lo destruyen sí le afectan; sigue pudiendo ser elegido como objetivo y perder ATK/DEF.'],
    transtitan: ['Transformación en Titán de Ataque', 'Con Titán de Ataque en tu mano y 2 zonas contiguas libres, paga 500 PV: lo invoca especialmente sin tributos. Eren se queda en el campo. Los 500 PV se pagan una vez por cada invocación lograda.'],
    punos: ['Endurecimiento de los puños', 'Una vez por turno propio, hasta 2 veces por invocación: su próximo ataque gana +700 ATK (sólo para ese ataque; después se pierde).'],
    resis: ['Resistencia titánica', '2 vidas: cada vez que fuera a morir (por una magia, trampa, habilidad o un combate) gasta una vida y sobrevive. Si lo atacan con más ATK, sobrevive y su dueño pierde la diferencia de ATK.'],
    toge: ['Discurso Maldito', 'Tres órdenes, cada una UNA vez por invocación y como máximo una orden por turno: ¡Quieto! (cambia la posición de un personaje rival o voltea uno boca abajo; también puede responder a un ataque contra Toge o un aliado: cambia la posición del atacante y cancela el ataque), ¡Debilítate! (−500 ATK y −500 DEF a un rival) y ¡Muere! (destruye a un personaje rival de 4★ o menos).'],
    semilla: ['Semilla del Hermitaño', 'Una vez por turno propio, sobre un aliado: quita sus efectos negativos (reducciones de ATK/DEF, habilidades selladas, Promesa de Poder y cartas rivales dañinas como Karma o la Gema de la Mente) y le devuelve el poder perdido, sin pasar de su valor base.'],
    tonyarm: ['Armadura de Iron Man', 'Cada turno propio completo en el campo reúne materiales. Con el primero construye la primera armadura (+1000 ATK y DEF); con cada turno completo posterior puede mejorarla (+300 ATK y DEF cada vez, sin límite). Una acción por turno.'],
    jake: ['Transformación en equipo', 'Jake puede jugarse como personaje o equiparse a un aliado como espada (+600 ATK) o escudo (+500 DEF). Si el aliado equipado fuera a ser destruido, Jake se destruye en su lugar.'],
    symb: ['Simbiosis', 'Una vez por turno, en tu turno, puedes equipar a Venom a un aliado (desde la mano o desde el campo): le da +1400 ATK y +1300 DEF y deja de ocupar su zona. Es opcional: también puede invocarse y combatir con normalidad.'],
    hostprot: ['Protección del huésped', 'Mientras esté equipado, si el portador fuera a ser destruido, se destruye Venom en su lugar (no protege del destierro).'],
    absorbv: ['Absorción de habilidades', 'Cuando Venom, o su portador, destruye a un enemigo puedes elegir UNA de sus habilidades para que Venom la aprenda para siempre.'],
    sylas: ['Robo de habilidades', 'Una vez por turno copia una habilidad (a elegir) de un personaje rival del campo. La conserva para siempre y puede acumular todas las que consiga. Si no hay nada que robar, no gasta el uso.'],
    kurama: ['Chakra de Kurama', '+600 ATK y +600 DEF durante 2 turnos propios completos. No se puede reactivar mientras dure.'],
    hiraishin: ['Hiraishin — Marca del Dios del Trueno Volador', 'Cada ataque normal contra un personaje deja una marca en esa casilla (se queda aunque el personaje se vaya). Por cada ataque normal puedes lanzar UN ataque Hiraishin extra contra una casilla marcada ocupada por un rival: nadie puede responder a ese ataque.']
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
      id: 'c_titan', name: 'Titán Martillo', type: 'aot', level: 8, atk: 2300, def: 2300, img: I('titan'), wide: true,
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
      id: 'c_vegeta', name: 'Vegeta', fam: 'Vegeta', type: 'dbz', level: 4, atk: 1500, def: 1500, img: I('vegeta'), ab: ['saiyan'], xform: { family: 'Vegeta' },
      text: 'Sangre Saiyan: si es revivido, vuelve con +500 ATK y +500 DEF. ' +
        'Transformación: puede transformarse en otra carta Vegeta de tu mano (1 turno completo de espera por cada 2 estrellas de diferencia); la anterior queda vinculada.',
      sfx: { attack: V('vegeta-attack'), transform: V('bardock-transform') }
    }),
    mon({
      id: 'c_vegeta_blue', name: 'Vegeta Blue Evolution', fam: 'Vegeta', type: 'dbz', level: 10, atk: 2700, def: 2800, img: I('vegeta_blue'), ab: ['escudo', 'bigbang'], xform: { family: 'Vegeta' },
      text: 'Escudo Blue Evolution: 3000 de resistencia; los ataques sólo dañan al escudo (su ATK/DEF no cuentan y nadie recibe daño de diferencia), y las magias o trampas que intenten destruirlo sólo destruyen el escudo. ' +
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
      text: 'Magia continua. Sólo puede usar UNA función, UNA vez en todo el tiempo que esté en el campo; después va al cementerio. Elige: (1) destruye un personaje tuyo de la mano para asesinar a un personaje rival de igual o menos estrellas; o (2) destruye una magia/trampa de tu mano para destruir una magia/trampa rival.',
      sfx: { use: V('tormenta-use') }
    }),
    // ---------------- tanda 2 (25-10-2026) ----------------
    mon({
      id: 'c_zenitsu', name: 'Zenitsu Agatsuma', type: 'demonslayer', level: 4, atk: 1000, def: 1000, img: I('zenitsu'), ab: ['zenitsu1', 'zenitsu2'],
      text: 'Primera Postura del Rayo: cada vez que declara un ataque gana +200 ATK y +200 DEF durante su invocación. ' +
        'Respiración de Concentración Total (una vez por invocación): +400 ATK y +400 DEF durante 2 turnos.',
      sfx: { attack: V('zenitsu-attack') }
    }),
    mon({
      id: 'c_patriarca', name: 'Gran Patriarca', type: 'dbz', level: 2, atk: 800, def: 800, img: I('gran_patriarca'), ab: ['patriarca'],
      text: 'Despertar del Poder Oculto: elige a un personaje aliado del campo (también él mismo): gana +700 ATK y +700 DEF durante su invocación. ' +
        'Una vez por turno y hasta 3 veces por invocación de Gran Patriarca.'
    }),
    mon({
      id: 'c_gyomei', name: 'Gyomei Himejima', type: 'demonslayer', level: 8, atk: 1900, def: 1900, img: I('gyomei'), ab: ['gyomei1', 'gyomei2', 'gyomei3'],
      text: 'Respiración de la Roca: 4 posturas; cada vez que ataca a otro personaje o es atacado por uno gasta una y gana +200 ATK y +200 DEF. ' +
        'Respiración de Concentración Total (una vez): +400 ATK durante 2 turnos. ' +
        'Marca de Cazador (una vez): +500 ATK y +500 DEF durante 3 turnos, pero al terminar Gyomei muere.'
    }),
    mon({
      id: 'c_yoriichi', name: 'Yoriichi', type: 'demonslayer', level: 11, atk: 2600, def: 2600, img: I('yoriichi'), ab: ['yoriichi'],
      text: 'El Cazador Más Fuerte de la Historia: 13 posturas de la Respiración Solar; cada vez que ataca a otro personaje o es atacado por uno gasta una y gana +300 ATK y +300 DEF. ' +
        'Velocidad Inalcanzable: mientras resuelve sus propios ataques en tu turno es inmune a las magias, trampas y habilidades enemigas.'
    }),
    mon({
      id: 'c_goku', name: 'Goku', fam: 'Goku', type: 'dbz', level: 4, atk: 1400, def: 1400, img: I('goku'), ab: ['kaioken'], xform: { family: 'Goku' },
      text: 'Transformación Saiyan: puede transformarse en otra carta Goku de tu mano (1 turno completo de espera por cada 2 estrellas de diferencia); la anterior queda vinculada. ' +
        'Kaio-ken (una vez por invocación): +700 ATK y +700 DEF durante 3 turnos.',
      sfx: { transform: V('goku-transform'), summon: V('goku-summon') }
    }),
    mon({
      id: 'c_super_vegeta', name: 'Super Vegeta', fam: 'Vegeta', type: 'dbz', level: 6, atk: 1800, def: 1600, img: I('super_vegeta'), xform: { family: 'Vegeta' },
      text: 'Sin habilidades propias. Pertenece a la familia Vegeta: puede transformarse en otra carta Vegeta de tu mano (1 turno completo de espera por cada 2 estrellas de diferencia); la anterior queda vinculada.',
      sfx: { attack: V('super_vegeta-attack'), transform: V('super_vegeta-transform') }
    }),
    mon({
      id: 'c_kaiosama', name: 'Kaio Sama', type: 'dbz', level: 6, atk: 1500, def: 1500, img: I('kaio_sama'), ab: ['maestro'],
      text: 'Maestro de las Artes: enseña a un personaje aliado el Kaio-ken (+600 ATK y DEF durante 3 turnos) o la Genkidama (2500 de daño a cada personaje rival). ' +
        'Una enseñanza por turno; cada habilidad se puede enseñar una vez por invocación de Kaio Sama. Quien la aprende la usa después, una vez por invocación.'
    }),
    mon({
      id: 'c_jogo', name: 'Jogo', type: 'jjk', level: 7, atk: 2100, def: 2100, img: I('jogo'), ab: ['jogodom', 'llama'],
      text: 'Ataúd de la Montaña de Hierro (dominio, 2 turnos): Jogo gana +500 ATK y DEF; sólo los personajes de 7★ o más usan habilidades y nadie activa magias ni trampas. ' +
        'Llama Infernal (una vez): +200 ATK y DEF por cada asesinato propio contado.',
      sfx: { ability: V('jogo-ability') }
    }),
    mon({
      id: 'c_kayn', name: 'Kayn', type: 'lol', level: 5, atk: 1400, def: 1400, img: I('kayn'),
      text: 'Rhaast: al asesinar a un enemigo en combate desbloquea esa transformación (al transformarse, +300 ATK y +300 DEF; después, +300 ATK y DEF más por cada asesinato en combate). ' +
        'Asesino Sombra: al infligir daño directo desbloquea esa transformación (+300 ATK por cada enemigo en defensa que asesine estando en ataque, y hasta 2 ataques por turno). ' +
        'Las transformaciones son opcionales y sólo puede elegir una por invocación.',
      sfx: { summon: V('kayn-summon') }
    }),
    mon({
      id: 'c_kayn_rhaast', name: 'Rhaast', type: 'lol', level: 5, atk: 1400, def: 1400, img: I('kayn_rhaast'), hidden: true,
      text: 'Forma de Kayn. Al transformarse gana +300 ATK y +300 DEF (una sola vez por invocación); después, +300 ATK y +300 DEF más por cada personaje enemigo que asesine en combate.', sfx: { transform: V('kayn-rhaast') }
    }),
    mon({
      id: 'c_kayn_sombra', name: 'Asesino Sombra', type: 'lol', level: 5, atk: 1400, def: 1400, img: I('kayn_sombra'), hidden: true,
      text: 'Forma de Kayn. Hasta 2 ataques por turno; +300 ATK cuando, en ataque, asesina a un personaje enemigo en defensa.', sfx: { transform: V('kayn-sombra') }
    }),
    mon({
      id: 'c_meliodas', name: 'Meliodas 5%', type: 'pecados', level: 3, atk: 900, def: 900, img: I('meliodas'), ab: ['counter'],
      text: 'Total Counter: una vez por turno, cuando el rival te lanza una magia, trampa, habilidad o ataque hostil, puedes devolver su efecto contra su dueño y elegir el objetivo (el efecto original no se aplica).',
      sfx: { attack: V('meliodas-attack'), ability: V('meliodas-ability') }
    }),
    mon({
      id: 'c_spiderman', name: 'Spider-Man', type: 'marvel', level: 4, atk: 1300, def: 1500, img: I('spiderman'), ab: ['sentido', 'telar'],
      text: 'Sentido Arácnido: el rival no puede elegirlo como objetivo de magias, trampas ni habilidades (sí puede atacarlo). Telarañas: sella una habilidad de un personaje enemigo mientras Spider-Man siga en el campo (una vez por turno, hasta 2 veces por invocación).',
      sfx: { summon: V('spiderman-summon'), ability: V('spiderman-ability') }
    }),
    mon({
      id: 'c_sauron', name: 'Sauron', type: 'anillos', level: 7, atk: 2100, def: 2100, img: I('sauron'), ab: ['corrupt'],
      text: 'Promesa de Poder: elige a un personaje enemigo con menos estrellas que Sauron. No puede atacar ese turno y, al comenzar tu siguiente turno, pasa a servirte. Cada 3 turnos. ' +
        'El Regreso del Señor Oscuro: si estás en el cementerio, vuelve al campo cuando se activa una magia de equipamiento.',
      sfx: { attack: V('sauron-attack'), summon: V('sauron-summon') }
    }),
    mon({
      id: 'c_mahoraga', name: 'General Mahoraga', type: 'jjk', level: 10, atk: 2700, def: 2800, img: I('mahoraga'), ab: ['asimila', 'espada'],
      text: 'Invocación especial: cuando el rival invoca un personaje de 10★ o más puedes invocar a Mahoraga desde tu mano sin gastar la invocación normal. ' +
        'Asimilación: la primera vez que muere en un turno se regenera; si muere otra vez ese turno, muere de verdad. ' +
        'Espada de Exterminio: los personajes que mata son desterrados.',
      sfx: { ability: V('mahoraga-ability') }
    }),
    mon({
      id: 'c_shen', name: 'Shen', type: 'lol', level: 6, atk: 1600, def: 1800, img: I('shen'),
      text: 'Protección del Ojo del Crepúsculo: cuando un aliado va a morir por un ataque o una magia enemiga puedes invocar a Shen desde tu mano (sin gastar la invocación normal): cancela ese efecto y el aliado recibe un escudo de 1000 que funciona como el de Vegeta Blue.',
      sfx: { attack: V('shen-attack'), summon: V('shen-summon') }
    }),
    mon({
      id: 'c_la_muerte', name: 'La Muerte', type: 'shrek', level: 5, atk: 1500, def: 1500, img: I('la_muerte'), ab: ['muerte'],
      text: 'Aparición de la Muerte: cuando un personaje se salva de una muerte, puedes invocarla especialmente desde tu mano. ' +
        'Acumulación de Muertes: cada vez que muere un personaje gana +300 ATK de forma permanente.',
      sfx: { summon: V('la_muerte-summon') }
    }),
    mon({
      id: 'c_antivenom', name: 'Anti-Venom', type: 'marvel', level: 6, atk: 1000, def: 1000, img: I('anti_venom'), couple: true,
      text: 'Acoplamiento: al invocarlo (con sus tributos) se acopla a un personaje aliado sin ocupar casilla; el anfitrión gana +1000 ATK y DEF. ' +
        'Evolución Adaptativa: cuando el anfitrión asesina a un enemigo elige UNA vez: Adaptación Ofensiva (+400 ATK y DEF por activación, 1 por turno, hasta 3) o Depredador de Magia (destruye una magia o trampa rival, 1 por turno, hasta 3). ' +
        'Si atacan al anfitrión y vencería según las reglas del combate, muere Anti-Venom (va al cementerio) y el anfitrión se salva y queda normal. Si el anfitrión sale del campo por otra causa, Anti-Venom va con él.'
    }),
    mon({
      id: 'c_yuta', name: 'Yuta Okkotsu', type: 'jjk', level: 10, atk: 2500, def: 2500, img: I('yuta'), ab: ['yutadom', 'copia', 'rikaint'],
      text: 'Amor Mutuo y Verdadero (dominio, una vez por invocación, 2 turnos): +500 ATK y DEF; sólo los personajes de más de 10★ usan habilidades, las magias y trampas del campo quedan desactivadas y Yuta usa las habilidades de cualquier personaje boca arriba. ' +
        'Copia de Técnicas: aprende hasta 3 habilidades que vea usar (1 por turno). ' +
        'Rika Orimoto, Intercepción Protectora: intercepta la muerte de un aliado (2 usos por invocación, 1 por turno).',
      sfx: { attack: V('yuta-attack'), ability: V('yuta-ability'), rika: V('yuta-rika') }
    }),
    mon({
      id: 'c_rika', name: 'Rika Orimoto', type: 'jjk', level: 9, atk: 2500, def: 2500, img: I('rika'), ab: ['rikamal', 'rikaprot', 'rikavinc'],
      text: 'Maldición Incontrolable: sin Yuta Okkotsu en el campo ni Anillo de la Promesa equipado, debe atacar cada turno a un personaje del campo (aliado o enemigo). ' +
        'Protección Absoluta: no recibe equipamientos ni la afectan magias ni trampas. ' +
        'El Vínculo con Yuta: con Yuta o el Anillo en el campo es feliz: +700 ATK y DEF y ataca cuando quiere.',
      sfx: { attack: V('rika-attack'), summon: V('rika-attack') }
    }),
    spell({
      id: 'c_gema_poder', name: 'Gema del Poder', icon: '💎', img: I('gema_poder'), fx: 'equip', sub: 'equip', eAtk: 800, eDef: 800, pgem: true,
      text: 'Equipa a un personaje tuyo: +800 ATK y DEF. Sus habilidades de «una vez» se pueden usar dos veces, las de un uso por turno dos veces por turno y sus aumentos se duplican. Si muere, el equipo se pierde.'
    }),
    spell({
      id: 'c_susano', name: 'Susano', icon: '🔥', img: I('susano'), fx: 'equip', sub: 'equip', susano: true,
      text: 'Equipa a un personaje tuyo. Despierta cuando muere otro personaje de su mismo tipo (de cualquier equipo): le da +400 ATK y DEF y un escudo de 2300 que funciona como el de Vegeta Blue.'
    }),
    spell({
      id: 'c_despertar_bestia', name: 'El Despertar de la Bestia', icon: '🐺', img: I('despertar_bestia'), fx: 'equip', sub: 'equip', beast: true,
      text: 'Elige a un personaje aliado. Cuando muere otro personaje de tu equipo, el elegido gana +800 ATK y +800 DEF durante su invocación y esta carta va al cementerio.',
      sfx: { use: V('despertar_bestia-use') }
    }),
    spell({
      id: 'c_anillo_promesa', name: 'Anillo de la Promesa', icon: '💍', img: I('anillo_promesa'), fx: 'equip', sub: 'equip', eAtk: 200, eDef: 200, promise: true,
      text: 'Equipa a un personaje tuyo: +200 ATK y DEF. Mientras lo lleve, Rika Orimoto es feliz y gana +700 ATK y DEF (+1200 si el portador es Yuta Okkotsu) y deja de estar obligada a atacar. El portador no puede cambiar durante toda la partida.'
    }),
    spell({
      id: 'c_anillo_unico', name: 'Anillo Único', icon: '💍', img: I('anillo_unico'), fx: 'equip', sub: 'equip', ring1: true,
      text: 'Equipa a un personaje tuyo: 1-4★ +500 ATK y DEF y muere a los 2 turnos; 5-6★ +600 y 3 turnos; 7★ o más +700 y 5 turnos (y puede usar una vez la Promesa de Poder). Sauron gana +1000 y no muere.'
    }),
    spell({
      id: 'c_pothala', name: 'Pothala', icon: '☯️', img: I('pothala'), fx: 'pothala',
      text: 'Fusiona a dos personajes aliados del campo durante 2 turnos completos: ATK y DEF = suma de ambos, y tiene las habilidades de los dos.',
      sfx: { use: V('pothala-use') }
    }),
    spell({
      id: 'c_esferas', name: 'Esferas del Dragón', icon: '🐉', img: I('esferas'), fx: 'esferas',
      text: 'Pide un deseo: (1) revive a un personaje tuyo del cementerio de 7★ o menos, (2) recupera 1500 PV o (3) invoca especialmente de tu mano un personaje de 7★ o menos.',
      sfx: { use: V('esferas-use') }
    }),
    spell({
      id: 'c_cana_gon', name: 'Caña de Pescar de Gon', icon: '🎣', img: I('cana_gon'), fx: 'cana',
      text: 'Devuelve a tu mano a un personaje tuyo que esté desterrado.',
      sfx: { use: V('cana_gon-use') }
    }),
    spell({
      id: 'c_uno_dos', name: 'Uno, Dos', icon: '✌️', img: I('uno_dos'), fx: 'uno',
      text: 'Un personaje tuyo puede atacar hasta 2 veces este turno.'
    }),
    spell({
      id: 'c_voto', name: 'Voto Vinculante', icon: '📜', img: I('voto_vinculante'), fx: 'voto',
      text: 'Elige a un aliado y a un enemigo: sacrifica su DEF para copiar el ATK del enemigo, su ATK para copiar la DEF, o su ATK y DEF para copiar una habilidad. Dura toda la invocación.'
    }),
    spell({
      id: 'c_gokumonkyo', name: 'Gokumonkyo', icon: '📕', img: I('gokumonkyo'), fx: 'gokumon', sub: 'cont', unstop: true,
      text: 'Sella a un personaje enemigo (nada lo impide, ni siquiera los Seis Ojos) durante 5 turnos completos; vuelve después. No se puede anular.'
    }),
    spell({
      id: 'c_guerrero', name: 'Guerrero del Infinito', icon: '👁️', img: I('guerrero_infinito'), fx: 'guerrero', sub: 'cont', cost: 2000,
      text: 'Paga 2000 PV. El próximo personaje que entre en tu campo recibe los Seis Ojos durante 3 turnos: intocable (tampoco puede ser desterrado), y puede lanzar Rojo, Azul o Púrpura (sólo uno de ellos por vez).'
    }),
    // ---------------- tanda 3 (27-10-2026) ----------------
    mon({
      id: 'c_deadpool', name: 'Deadpool', type: 'marvel', level: 4, atk: 1100, def: 1100, img: I('deadpool'), ab: ['regenx'],
      text: 'Regeneración extrema: no puede ser destruido en combate ni por habilidades de personaje. Las magias y trampas que lo destruyen sí le afectan, y puede ser elegido como objetivo y perder ATK o DEF.',
      sfx: { summon: V('deadpool-summon'), attack: V('deadpool-attack') }
    }),
    mon({
      id: 'c_eren', name: 'Eren Jaeger', type: 'aot', level: 3, atk: 400, def: 400, img: I('eren'), ab: ['transtitan'],
      text: 'Transformación en Titán de Ataque: con Titán de Ataque en tu mano y 2 zonas contiguas libres, paga 500 PV para invocarlo especialmente sin tributos. Eren se queda en el campo. Los 500 PV se pagan una vez por cada invocación lograda.',
      sfx: { transform: V('eren-transform') }
    }),
    mon({
      id: 'c_titan_ataque', name: 'Titán de Ataque', type: 'aot', level: 7, atk: 2100, def: 2100, img: I('titan_ataque'), wide: true, ab: ['punos', 'resis'],
      text: 'Ocupa 2 zonas contiguas. Se invoca con 2 tributos o, especialmente, con Eren Jaeger. Endurecimiento de los puños: su próximo ataque gana +700 ATK (una vez por turno propio, 2 veces por invocación). ' +
        'Resistencia titánica: 2 vidas contra la muerte; si lo atacan con más ATK sobrevive y su dueño pierde la diferencia.'
    }),
    mon({
      id: 'c_odin', name: 'Odin', type: 'marvel', level: 10, atk: 2500, def: 2600, img: I('odin'), ab: ['odincarga', 'odinrev', 'odinbend'],
      text: 'Cargas de vida: cada vez que muere un personaje del campo, Odin obtiene 1 carga de vida. Al acumular 3 cargas, puede gastarlas para revivir a un personaje del cementerio. ' +
        'Revelación divina: una vez por turno, puede destruir una carta boca abajo que todavía no haya sido revelada, ya sea un personaje o una magia/trampa. ' +
        'Bendición de poder: una vez por turno, durante un máximo de 3 turnos, puede bendecir a un personaje aliado, otorgándole +600 ATK y +600 DEF de forma permanente. El bono se mantiene hasta que el personaje sea destruido.'
    }),
    mon({
      id: 'c_toge', name: 'Toge Inumaki', type: 'jjk', level: 4, atk: 1200, def: 1200, img: I('toge'), ab: ['toge'],
      text: 'Discurso Maldito: tres órdenes, cada una una vez por invocación y una sola orden por turno. ¡Quieto!: cambia la posición de un personaje rival o voltea uno boca abajo (o, al ser atacados él o un aliado, cambia la posición del atacante y cancela el ataque). ' +
        '¡Debilítate!: −500 ATK y DEF a un rival. ¡Muere!: destruye a un personaje rival de 4★ o menos.',
      sfx: { ability: V('toge-ability'), attack: V('toge-attack') }
    }),
    mon({
      id: 'c_karim', name: 'Maestro Karim', type: 'dbz', level: 1, atk: 400, def: 300, img: I('karim'), ab: ['semilla'],
      text: 'Semilla del Hermitaño: una vez por turno propio, sobre un aliado: quita sus efectos negativos (reducciones de ATK/DEF, habilidades selladas, cartas rivales dañinas) y le devuelve el poder perdido, sin pasar de su valor base.'
    }),
    mon({
      id: 'c_tony', name: 'Tony Stark', type: 'marvel', level: 2, atk: 400, def: 400, img: I('tony'), ab: ['tonyarm'],
      text: 'Armadura de Iron Man: cada turno propio completo en el campo reúne materiales. Con el primero construye la primera armadura (+1000 ATK y DEF); con cada turno completo posterior puede mejorarla (+300 ATK y DEF cada vez, sin límite). Una acción por turno.'
    }),
    mon({
      id: 'c_tony_armadura', name: 'Tony Stark', type: 'marvel', level: 2, atk: 400, def: 400, img: I('tony_armadura'), ab: ['tonyarm'], hidden: true,
      text: 'Forma de Tony Stark con la armadura de Iron Man puesta.'
    }),
    mon({
      id: 'c_jake', name: 'Jake el Perro', type: 'adventuretime', level: 2, atk: 600, def: 500, img: I('jake'), ab: ['jake'],
      text: 'Transformación en equipo: puede jugarse como personaje o equiparse a un aliado como espada (+600 ATK) o escudo (+500 DEF). Si el aliado equipado fuera a ser destruido, Jake se destruye en su lugar y el aliado se salva.',
      sfx: { attack: V('jake-attack') }
    }),
    mon({
      id: 'c_venom', name: 'Venom', type: 'marvel', level: 4, atk: 1400, def: 1300, img: I('venom'), ab: ['symb', 'hostprot', 'absorbv'],
      text: 'Simbiosis: una vez por turno propio puedes equiparlo a un aliado (+1400 ATK y +1300 DEF; no ocupa zona mientras tanto). Protección del huésped: si el portador fuera a ser destruido, se destruye Venom en su lugar. ' +
        'Absorción de habilidades: cuando Venom o su portador destruye a un enemigo, Venom aprende para siempre UNA de sus habilidades.',
      sfx: { summon: V('venom-summon'), attack: V('venom-attack') }
    }),
    mon({
      id: 'c_sylas', name: 'Sylas', type: 'lol', level: 5, atk: 1600, def: 1600, img: I('sylas'), ab: ['sylas'],
      text: 'Robo de habilidades: una vez por turno copia una habilidad (a elegir) de un personaje rival del campo y la conserva para siempre, sin límite de habilidades acumuladas. Si no hay nada que robar, no gasta el uso.',
      sfx: { summon: V('sylas-summon'), attack: V('sylas-attack') }
    }),
    mon({
      id: 'c_minato', name: 'Minato Namikaze', type: 'naruto', level: 7, atk: 1900, def: 1800, img: I('minato'), ab: ['kurama', 'hiraishin'],
      text: 'Chakra de Kurama: +600 ATK y DEF durante 2 turnos propios completos. Hiraishin: cada ataque normal contra un personaje deja una marca en esa casilla; por cada ataque normal puedes lanzar un ataque Hiraishin extra contra una casilla marcada ocupada por un rival, y nadie puede responder a ese ataque.',
      sfx: { attack: V('minato-attack') }
    }),
    spell({
      id: 'c_guantelete', name: 'Guantelete del Infinito', icon: '🧤', img: I('guantelete'), fx: 'equip', sub: 'equip', glove: true, minStars: 4,
      text: 'Equípalo a un aliado de 4★ o más. Cuando un rival use una carta cuyo nombre empiece por «Gema», puedes robarla como respuesta y equiparla a tu portador. Precio del poder: si el portador es de 4-5★, al usar la gema robada su ATK y DEF base se reducen a la mitad y pierde sus habilidades; de 6★ o más no sufre nada. (Las gemas-trampa no se pueden robar.)',
      sfx: { steal: V('guantelete-use') }
    }),
    spell({
      id: 'c_gema_tiempo', name: 'Gema del Tiempo', icon: '⏳', img: I('gema_tiempo'), fx: 'tiempo',
      text: 'Retroceso temporal: sólo en tu turno, tu campo vuelve a como estaba al empezar tu turno anterior (personajes, posiciones, estadísticas, efectos y equipos). Sólo restaura TU campo; el del rival no cambia. Lo que tenías en el campo y entonces no estaba vuelve a tu mano. Después va al cementerio.'
    }),
    {
      kind: 'trap', id: 'c_ola_fuego', name: 'Ola de Fuego', icon: '🌊', img: I('ola_fuego'), trigger: 'attack', fx: 'ola',
      text: 'Cuando un rival declare un ataque, antes del combate: todos sus personajes pierden 500 ATK y 500 DEF.', sfx: { use: V('ola_fuego-use') }
    },
    {
      kind: 'trap', id: 'c_infarto', name: 'Infarto Inesperado', icon: '💔', img: I('infarto'), trigger: 'summon', fx: 'infarto', maxLevel: 4,
      text: 'Cuando un rival invoque un personaje de 4★ o menos puedes activarla: provocas un infarto y lo destruyes (la trampa va al cementerio). Si prefieres dejarlo vivir, no la actives y sigue puesta.', sfx: { use: V('infarto-use') }
    },
    {
      kind: 'trap', id: 'c_gema_realidad', name: 'Gema de la Realidad', icon: '🔴', img: I('gema_realidad'), triggers: ['attack', 'destroy', 'reduce'], fx: 'realidad',
      text: 'Un solo uso, con 3 efectos: (1) cuando un rival ataque a un aliado, redirige el ataque a un personaje del campo rival que elijas; (2) cuando una magia, trampa o habilidad rival vaya a destruir a un aliado, destruye en su lugar a un personaje rival que elijas; (3) cuando un efecto rival vaya a reducir el ATK o la DEF de un aliado, esa reducción se convierte en un aumento igual.'
    },
    {
      kind: 'trap', id: 'c_x', name: 'X', icon: '❌', img: I('x'), triggers: ['spell', 'power', 'trap'], fx: 'xcancel',
      text: 'Cancelación absoluta: cancela una magia, trampa o habilidad de personaje del rival antes de que se resuelva. Si cancelas una magia o trampa, la destruyes; si cancelas una habilidad, la consumes para siempre (sólo esa habilidad de esa invocación del personaje).'
    },
    {
      kind: 'trap', id: 'c_rayo_solar', name: 'Rayo de Luz Solar', icon: '☀️', img: I('rayo_solar'), trigger: 'attack', fx: 'destroyAttacker',
      text: 'Cuando un personaje enemigo declara un ataque: destrúyelo y cancela ese ataque.', sfx: { use: V('rayo_solar-use') }
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
    all: () => MONSTERS.concat(CUSTOM, TESTCARDS, SPELLS, TRAPS, TESTST).filter(c => !c.hidden),
    TYPE_ES, TYPE_COLOR, PRESET_TYPES, DECK_SIZE, MAX_COPIES,
    presetDeck, checkDeck, register, canPlay, testDeck, test: TEST,
    tributesFor: level => level >= 10 ? 3 : level >= 7 ? 2 : level >= 5 ? 1 : 0
  };
  if (!isBrowser) module.exports = D.Cards;
})();
