/* ============ changelog.js — novedades del juego ============
 * Lo que ve la gente en el botón "Novedades" de la barra de arriba: cambios
 * de juego y fallos arreglados (nada de servidores ni bases de datos).
 * La fecha más nueva, arriba. En cada fecha, por apartados:
 *   new  lo nuevo · chg  cambios y ajustes · fix  fallos arreglados
 * Cada línea en español y en inglés.
 */
G.CHANGELOG = [
  { d: '2026-10-23', title: ['Llegan 18 cartas nuevas: ya se puede jugar', '18 new cards: you can play now'], new: [
    ['Ya hay 20 cartas y se pueden armar mazos (30 cartas, máximo 2 copias) y jugar contra la computadora y online. Personajes: Bardock, Bardock SSJ, Cell Semi Perfecto, Kratos, Kratos el Fantasma de Esparta, Lara Tybur, Titán Martillo, Ryomen Sukuna 5% y 60%, Shang Tsung, Vegeta y Vegeta Blue Evolution (más Popeye y Creeper, con imagen y sonido nuevos). Magias: Armadura Dorada, Espada del Rey Arruinado, Gema de la Mente, Karma, Superball y Tormenta Eléctrica. Toca una carta para ver lo que hace su habilidad.',
     'There are now 20 cards and you can build decks (30 cards, max 2 copies) and play against the computer and online. Characters: Bardock, Bardock SSJ, Semi-Perfect Cell, Kratos, Kratos the Ghost of Sparta, Lara Tybur, Hammer Titan, Ryomen Sukuna 5% and 60%, Shang Tsung, Vegeta and Vegeta Blue Evolution (plus Popeye and Creeper, with new art and sound). Spells: Golden Armor, Sword of the Ruined King, Mind Gem, Karma, Superball and Electric Storm. Tap a card to see what its ability does.'],
    ['Habilidades con acción propia: aparecen como botones al tocar tu personaje (transformaciones, Cañón Espiritual, Absorción, Big Bang, Relicario Demoníaco, Desmantelar, Furia de Esparta…) o tu magia continua (Gema de la Mente, Tormenta Eléctrica). Los personajes muestran insignias: escudo, vínculo, habilidades robadas, bajas, Karma, dominio.',
     'Abilities with their own action: they show as buttons when you tap your character (transformations, Spirit Cannon, Absorption, Big Bang, Demonic Shrine, Dismantle, Spartan Rage…) or your continuous spell (Mind Gem, Electric Storm). Characters show badges: shield, link, stolen abilities, kills, Karma, domain.'],
    ['Titán Martillo ocupa 2 zonas de monstruo. Las cartas propias suenan al atacar, transformarse o usar su habilidad.',
     'Hammer Titan takes up 2 monster zones. The cards play their own sounds when attacking, transforming or using their ability.'],
    ['Nuevas animaciones a pantalla grande: al activar una magia o trampa la carta aparece grande en el centro, y cuando un personaje ataca, se transforma o usa una habilidad su imagen entra con rebote desde un lado con el texto de la acción. Se ven también las jugadas del rival; toca la pantalla para saltarlas. Las invocaciones tienen una versión corta. Se desactivan con la opción de movimiento reducido.',
     'New full-screen animations: when a spell or trap is activated the card appears large in the center, and when a character attacks, transforms or uses an ability its image bounces in from the side with the action text. Your opponent’s plays are shown too; tap the screen to skip them. Summons have a short version. They are turned off by the reduced-motion option.'],
    ['La computadora ya sabe usar las cartas nuevas y su mazo se arma con ellas.',
     'The computer now knows how to use the new cards and builds its deck with them.']
  ], chg: [
    ['Los personajes de 10 estrellas o más (Sukuna 60%, Vegeta Blue Evolution…) piden sacrificar 3 personajes tuyos para invocarlos de forma normal. Las invocaciones especiales y las transformaciones no piden sacrificios.',
     'Characters of 10 stars or more (Sukuna 60%, Vegeta Blue Evolution…) require sacrificing 3 of your characters to be normal-summoned. Special summons and transformations require no sacrifices.'],
    ['Nuevo control «Voces y sonidos de las cartas» en el panel de sonido (🔊): sube o baja el volumen de los audios de los personajes. Por defecto ahora suenan más bajos (40 %).',
     'New “Card voices and sounds” control in the sound panel (🔊): raise or lower the volume of the character audio. By default they are now quieter (40%).'],
    ['Las cartas de tu mano ya no hacen ruido al pasar el ratón por encima.',
     'The cards in your hand no longer make a sound when you hover over them.'],
    ['El modo de prueba («?prueba») sigue disponible, pero ya no hace falta para jugar.',
     'Test mode (“?prueba”) is still available but is no longer needed to play.']
  ] },
  { d: '2026-10-22', title: ['Ahora el sitio es sólo el Duelo', 'The site is now only the Duel'], new: [
    ['Chat en las partidas online: escribe a tu rival (y a tus compañeros) debajo del seguimiento de acciones. Puedes plegarlo o silenciarlo.',
     'Chat in online matches: write to your opponent (and teammates) below the action feed. You can fold or mute it.'],
    ['El juego ahora es únicamente el Duelo Pokémon: se abre directo en el duelo de cartas. Puedes crear una cuenta (nombre y contraseña o Google) o jugar como invitado. Con cuenta, tus mazos se guardan en la nube y los tienes en cualquier aparato, y puedes jugar online con amigos. Las cuentas que ya tenías siguen funcionando. Como invitado puedes jugar contra la computadora.',
     'The game is now only Pokémon Duel: it opens straight into the card duel. You can create an account (name and password, or Google) or play as a guest. With an account your decks are saved in the cloud so you have them on any device, and you can play online with friends. Your existing accounts keep working. As a guest you can play against the computer.']
    ,
    ['Modo de prueba: abriendo el juego con «?prueba» al final de la dirección se puede jugar contra la computadora con un mazo fijo (Popeye, Creeper, cartas de relleno y magias y trampas de prueba) aunque aún no haya cartas suficientes. No guarda nada.',
     'Test mode: opening the game with “?prueba” at the end of the address lets you play against the computer with a fixed deck (Popeye, Creeper, filler cards and test spells and traps) even though there are not enough cards yet. It saves nothing.'],
    ['Nueva carta: Creeper (3★, 1000/1000, tipo Minecraft). Su habilidad «Explosión del Creeper»: cuando combate contra otro monstruo del campo (atacando o siendo atacado, en ataque o en defensa), el combate se calcula con normalidad y después los dos monstruos son desterrados, sin pasar por el cementerio. Una vez por invocación; no se activa en ataques directos. Hay una nueva zona de destierro (se ve como 🌀 junto al cementerio). La ilustración es provisional.',
     'New card: Creeper (3★, 1000/1000, Minecraft type). Its ability “Creeper Explosion”: when it battles another monster on the field (attacking or being attacked, in attack or defense), the battle is calculated normally and then both monsters are banished, without going to the graveyard. Once per summon; it does not trigger on direct attacks. There is a new banish zone (shown as 🌀 next to the graveyard). The artwork is a placeholder.'],
    ['Las cartas con habilidad pueden tener voz: al usarla suena un audio propio de la carta (assets/voices) o, si no hay archivo, la frase con la voz del navegador. Se silencia con el botón 🔊.',
     'Cards with abilities can have a voice: when used, the card’s own audio plays (assets/voices) or, if there is no file, the phrase is spoken with the browser’s voice. It is muted with the 🔊 button.'],
    ['Nueva carta: Popeye El Marinero (4★, 1200/1200, tipo Popeye). Su habilidad «¡A comer espinaca!»: una sola vez, cuando es destruido en combate o por un efecto, puedes revivirlo con 1500 ATK y 1500 DEF y elegir si queda en ataque o defensa (no ataca ese turno ni gasta tu invocación normal). La computadora la usa sola. Si lo invocas o lo revives con otra carta, la habilidad vuelve a estar disponible. Ya la puedes meter en tus mazos (filtro «Popeye»). La ilustración es provisional.',
     'New card: Popeye the Sailor (4★, 1200/1200, Popeye type). His ability “Time for spinach!”: once, when he is destroyed in battle or by an effect, you may revive him with 1500 ATK and 1500 DEF and choose attack or defense (he can’t attack that turn and it doesn’t use your normal summon). The computer uses it automatically. If you summon him or revive him with another card, the ability is available again. You can add him to your decks (“Popeye” filter). The artwork is a placeholder.']
  ], chg: [
    ['Ahora el tablero tiene 3 zonas de monstruo y 3 de magia/trampa por jugador (antes 5 y 5).',
     'The board now has 3 monster zones and 3 spell/trap zones per player (before 5 and 5).'],
    ['El catálogo se reinició: por ahora solo están Popeye y Creeper y las demás cartas se irán añadiendo de a poco. Hasta que haya cartas suficientes para un mazo (30 cartas, máximo 2 copias) no se puede jugar; los mazos guardados pierden las cartas que ya no existen.',
     'The catalog was reset: for now only Popeye and Creeper exist and the other cards will be added little by little. Until there are enough cards for a deck (30 cards, max 2 copies) you cannot play; saved decks lose the cards that no longer exist.'],
    ['Cada jugador muestra en grande cuántas cartas tiene en la mano («Mano: N»), y las acciones de la partida salen en una lista fija a la izquierda, con icono y el color de quien las hace (la última arriba y más grande).',
     'Each player shows how many cards they hold in hand (“Hand: N”) in large text, and the game actions appear in a fixed list on the left, with an icon and the color of who did them (the latest on top and larger).'],
    ['Se quitaron las ventajas de tipo: el combate sólo compara ATK y DEF (ya no hay «¡Es muy eficaz!»).',
     'Type advantages were removed: combat only compares ATK and DEF (no more “It’s super effective!”).'],
    ['Se quitó el juego anterior (PokéSurvivor); el Duelo ocupa su lugar y la dirección de siempre. El menú tiene un botón «Novedades» y la ventana «Cuenta» para cerrar sesión, vincular tu Gmail o borrar la cuenta.',
     'The previous game (PokéSurvivor) was removed; the Duel takes its place at the same address. The menu has a “News” button and an “Account” window to sign out, link your Gmail or delete the account.']
  ], fix: [
    ['Las magias y trampas sobresalían de su cuadrado en el tablero; ahora entran justas, como los monstruos.',
     'Spells and traps did not fit their slot on the board; the slot now matches the card size exactly, like monsters.'],
    ['Las cartas de 5 y 6 estrellas se veían más grandes que las demás en el campo; ahora tienen el mismo tamaño.',
     'Cards of 5 and 6 stars looked bigger than the others on the field; they are now the same size.'],
    ['La ventana de información de una carta ahora muestra lo que hace su habilidad.',
     'The card information window now shows what its ability does.'],
    ['El juego tardaba y podía colgar el navegador unos segundos al abrirse en equipos modestos. Ahora el menú sale enseguida, la arena se dibuja por partes y se guarda en el navegador (las siguientes veces carga al instante), y el suelo 3D ajusta su calidad al equipo o se desactiva si no puede.',
     'The game could be slow and freeze the browser for a few seconds when opening on modest computers. Now the menu shows right away, the arena is drawn in pieces and saved in the browser (later visits load instantly), and the 3D floor adjusts its quality to the computer or turns itself off if it can’t cope.'],
    ['Si un jugador se rendía justo cuando su carta se estaba activando y eso terminaba la partida, esa carta desaparecía.',
     'If a player resigned just as their card was being activated and that ended the game, that card vanished.']
  ] },
  { d: '2026-10-20', title: ['Duelo de cartas para 3 y 4 jugadores', 'Card duel for 3 and 4 players'], new: [
    ['El Duelo ya se puede jugar de 3 o 4: «todos contra todos» (cada uno con sus 8000 PV, gana el último en pie) y «2 contra 2» (dos equipos; gana el que deja sin PV a los dos rivales). Al atacar eliges a quién; quien cae queda fuera y sigue mirando. Funciona contra la computadora y online: crea la sala, elige el formato, tus amigos entran con el código y, si falta gente, los asientos libres los juega la computadora. En el tablero se ven los campos de todos a la vez (con su nombre, vida y cartas); para atacar o elegir objetivo, toca directamente en el campo del rival.',
     'The Duel can now be played with 3 or 4: “free for all” (everyone has their own 8000 LP, last one standing wins) and “2 vs 2” (two teams; the team that leaves both rivals at 0 LP wins). When attacking you choose the target; whoever falls is out and keeps watching. It works against the computer and online: create the room, pick the format, your friends join with the code and, if someone is missing, free seats are played by the computer. The board shows everyone’s field at once (with name, life and cards); to attack or choose a target, tap directly on the rival’s field.']
  ] },
  { d: '2026-10-19', title: ['Duelo de cartas: los Pokémon como monstruos', 'Card duel: Pokémon as monsters'], new: [
    ['El Duelo tiene sistema de audio nuevo: música distinta para el menú, la preparación, el combate y el combate con poca vida (con fundidos), ambiente de la arena, jingles de victoria y derrota, y unos 40 sonidos distintos (interfaz, cartas, turnos y combate). Cada tipo de ataque suena y se ve diferente (fuego, agua, rayo, hielo, planta, místico y físico). Seis controles de volumen y silencio en el botón 🔊. Es música y sonido sintetizados por código (originales, no una grabación orquestal) y se pueden reemplazar por archivos propios.',
     'The Duel has a new audio system: different music for the menu, setup, combat and low-life combat (with crossfades), arena ambience, victory and defeat jingles, and about 40 distinct sounds (interface, cards, turns and combat). Each attack type sounds and looks different (fire, water, electric, ice, grass, mystic and physical). Six volume controls and mute under the 🔊 button. The music and sounds are synthesized by code (original, not an orchestral recording) and can be replaced with your own files.'],
    ['Nuevas pantallas de victoria y derrota, aviso «¡Es muy eficaz!», brillo en las cartas de nivel alto, carta seleccionada con pulso dorado y opción «Efectos reducidos» (también se activa sola si tu sistema pide menos movimiento).',
     'New victory and defeat screens, a “It’s super effective!” banner, a shine on high-level cards, a pulsing gold glow on the selected card and a “Reduced effects” option (also turned on automatically if your system asks for less motion).'],
    ['Nuevo suelo de la arena del Duelo con piedra de verdad: relieve, juntas, grietas, musgo, sombras del sol y de los muros, y las antorchas iluminan el suelo con luz que parpadea. Muros y torres en bloques de piedra irregulares con musgo, árboles y rocas con volumen, y fuego con chispas y humo en las antorchas. Se dibuja con la tarjeta gráfica (WebGL); si tu navegador no la admite, se ve la arena de antes.',
     'New Duel arena floor with real-looking stone: relief, joints, cracks, moss, sun and wall shadows, and the torches light the ground with flickering light. Walls and towers in irregular mossy stone blocks, trees and rocks with volume, and fire with sparks and smoke on the torches. It is drawn on the GPU (WebGL); if your browser does not support it, the previous arena is shown.'],
    ['Nuevo modo «Duelo de cartas» (en el menú): duelos de cartas por turnos con 8000 PV, monstruos con nivel, ATK y DEF sacados de cada Pokémon, 12 magias y 5 trampas. Juega contra la computadora (fácil o normal) o online con un amigo con un código de sala.',
     'New “Card duel” mode (in the menu): turn-based card duels with 8000 LP, monsters whose level, ATK and DEF come from each Pokémon, 12 spells and 5 traps. Play against the computer (easy or normal) or online with a friend using a room code.'],
    ['El Duelo estrena arena: tablero de piedra con muros, torres con antorchas, árboles y río, visto entero y lo más grande posible, con una interfaz nueva (paneles de jugador con vida, botones dorados y menús rediseñados).',
     'The Duel gets a new arena: a stone board with walls, torch towers, trees and a river, seen whole and as large as possible, with a new interface (player panels with life, golden buttons and redesigned menus).'],
    ['El tablero del Duelo ahora es 3D: una arena inclinada con perspectiva y relieve, flotando sobre un cielo animado con nubes, luces y partículas. Las cartas caen sobre el tablero con un destello y al pasar el mouse por una carta se ve ampliada a la izquierda. La mano ya no se corta por abajo.',
     'The Duel board is now 3D: a tilted arena with perspective and depth, floating over an animated sky with clouds, lights and particles. Cards drop onto the board with a flash and hovering a card shows it enlarged on the left. The hand is no longer cut off at the bottom.'],
    ['El Duelo tiene sonido en cada jugada (invocar, atacar, magias, trampas, daño…), música de fondo y un botón 🔊 para apagarla o subir y bajar el volumen. Las cartas se ven más grandes, aparecen con un destello al ponerlas y las magias y trampas se muestran a pantalla grande al activarse.',
     'The Duel now has sound on every move (summoning, attacking, spells, traps, damage…), background music and a 🔊 button to turn it off or change the volume. Cards are bigger, appear with a flash when played, and spells and traps are shown full screen when activated.'],
    ['Constructor de mazos de 30 cartas (máximo 2 copias de cada una) con 18 mazos de estreno, uno por tipo. La ventaja de tipo suma o resta ATK en combate.',
     'Deck builder for 30-card decks (max 2 copies of each) with 18 starter decks, one per type. Type advantage adds or subtracts ATK in combat.']
  ], fix: [
    ['Duelo: el ATK y la DEF de las cartas ya no se ven pegados, y vuelven a verse las imágenes de los Pokémon en las listas del constructor de mazos.',
     'Duel: card ATK and DEF no longer run together, and the Pokémon pictures are back in the deck builder lists.']
  ] },
  { d: '2026-10-18', title: ['Físico y especial, mando, botón Guardar y rankings desde cero', 'Physical and special, controller, Save button and fresh leaderboards'], new: [
    ['Ataques físicos y especiales, como en los juegos: cada Pokémon tiene su Ataque, Ataque Especial, Defensa y Defensa Especial. Los ataques físicos pegan con su Ataque y los especiales con su Ataque Especial: Machamp pega fuerte con Golpe Kárate y flojo con Bola Sombra. Con los de su lado bueno pega lo mismo que antes. Al subir de nivel, cada carta dice si el ataque es físico o especial y cuánto rinde con tu Pokémon, y en la colección se ven todas sus estadísticas.',
     'Physical and special moves, like in the games: every Pokémon has its Attack, Special Attack, Defense and Special Defense. Physical moves use its Attack and special moves its Special Attack: Machamp hits hard with Karate Chop and weakly with Shadow Ball. With moves on its strong side it hits as hard as before. When leveling up, each card says whether the move is physical or special and how well it works with your Pokémon, and the collection shows all its stats.'],
    ['Danza Espada y Danza Dragón suben sólo el Ataque (físico), como en los juegos, y llega Maquinación, que sube el Ataque Especial y la puede aprender cualquier Pokémon. Al subir de nivel, los ataques del lado bueno de tu Pokémon salen el doble de a menudo.',
     'Swords Dance and Dragon Dance now raise only (physical) Attack, like in the games, and Nasty Plot arrives, raising Special Attack, learnable by any Pokémon. When leveling up, moves on your Pokémon’s strong side show up twice as often.'],
    ['Resumen de la partida en la pausa: cada ataque con su categoría, el daño que lleva hecho y su daño por segundo; tus estadísticas con todo lo que has subido; y el objeto y las cartas de mejora que llevas.',
     'Run summary in the pause screen: each move with its category, the damage it has dealt and its damage per second; your stats with everything you have raised; and your item and the upgrade cards you have.'],
    ['Las defensas también cuentan (un poco): los enemigos se defienden de tus ataques físicos con su Defensa y de los especiales con su Defensa Especial, y cada enemigo te pega con su lado fuerte, que paras con tu Defensa o tu Defensa Especial.',
     'Defenses count too (a little): enemies resist your physical moves with their Defense and special moves with their Special Defense, and each enemy hits you with its strong side, which you block with your Defense or Special Defense.'],
    ['Ya se puede jugar con mando (Xbox, PlayStation, Switch y la mayoría de mandos USB o Bluetooth): moverte, cambiar de ataque, pausar, elegir cartas y manejar todos los menús, con vibración al recibir daño. Se configura en Ajustes > Controles.',
     'You can now play with a controller (Xbox, PlayStation, Switch and most USB or Bluetooth controllers): move, switch attacks, pause, pick cards and use every menu, with vibration when you take damage. Set it up in Settings > Controls.'],
    ['Colección: buscador por nombre o número, pestaña con todas las generaciones, filtros que se combinan (tengo / me faltan, varias rarezas a la vez, shiny, favoritos y tipo) y orden por número, nombre, rareza, recién conseguidos o más usados. Y favoritos: márcalos en la ficha de cada Pokémon; van con tu cuenta, en todos tus aparatos.',
     'Collection: search by name or number, a tab with every generation, filters that combine (owned / missing, several rarities at once, shiny, favorites and type) and sorting by number, name, rarity, recently caught or most played. Plus favorites: mark them on each Pokémon’s page; they go with your account, on all your devices.'],
    ['Nueva pestaña Accesibilidad en Ajustes con «Apuntar a mano»: tus ataques van hacia el ratón o hacia donde empujes el stick derecho del mando, en vez de al enemigo más cercano. Viene desactivado.',
     'New Accessibility tab in Settings with “Manual aim”: your attacks go towards the mouse or wherever you push the controller’s right stick, instead of the nearest enemy. It is off by default.'],
    ['Botón Guardar arriba a la derecha: sube tu partida a la nube al momento. Úsalo antes de cerrar el juego o de cambiar de aparato.',
     'Save button at the top right: it uploads your game to the cloud right away. Use it before closing the game or switching devices.']
  ], chg: [
    ['Las cartas de nivel, de vínculo y de objeto no se pueden elegir durante un momento al aparecer (se ven apagadas): pulsar 1-4 o tocar la pantalla para cambiar de ataque en plena pelea ya no elige una carta sin querer.',
     'Level-up, bond and item cards can’t be picked for a moment after they appear (they look dimmed): pressing 1-4 or tapping to switch attacks mid-fight no longer picks a card by accident.'],
    ['Con mando ya se pueden elegir en la colección los Pokémon que aún no tienes, y en el móvil las pestañas de Ajustes caben en una fila que se desliza.',
     'With a controller you can now select the Pokémon you don’t have yet in the collection, and on mobile the Settings tabs fit in one row that scrolls sideways.'],
    ['La partida se guarda en la nube automáticamente cada 10 minutos.',
     'Your game is saved to the cloud automatically every 10 minutes.'],
    ['Ranking histórico: si estás por debajo del puesto 1.000, sale «#1000+» en vez del número exacto.',
     'All-time leaderboard: if you are below rank 1,000, it shows “#1000+” instead of the exact number.'],
    ['Los Pokémon grandes (Onix, Gyarados, Wailord, Eternatus, los legendarios...) ya se pueden jugar bien: se ven algo más pequeños, aunque siguen siendo de los más grandes, y chocan como uno normal, así que caben por todos los pasillos y no reciben más golpes por su tamaño.',
     'Big Pokémon (Onix, Gyarados, Wailord, Eternatus, the legendaries...) are now properly playable: they look a bit smaller, while still being among the biggest, and collide like a normal one, so they fit through every corridor and don’t take extra hits because of their size.'],
    ['Como mucho hay 3 curanderos, 3 escuderos y 3 invocadores a la vez.',
     'There are at most 3 healers, 3 shielders and 3 summoners at a time.'],
    ['Los curanderos y escuderos ya no hacen inmatable a un jefe: lo que le curan y el escudo que le ponen van con el daño que le estás haciendo, y sólo recibe un escudo cada 6 segundos.',
     'Healers and shielders no longer make a boss unkillable: their healing and shields scale with the damage you are dealing to it, and it only gets one shield every 6 seconds.'],
    ['Sentencia de Arceus: la velocidad tiene un tope suave (lo que pase de cierto punto cuenta mucho menos) y los legendarios corren casi tanto como tú. Desde los 5 minutos de Sentencia Arceus acelera sin parar, y desde los 7 su toque quita cada vez más vida, hasta dejarte KO de un golpe hacia el minuto 40.',
     'Judgment of Arceus: speed has a soft cap (anything above a certain point counts much less) and legendaries run almost as fast as you. After 5 minutes of Judgment, Arceus keeps speeding up, and after 7 its touch takes more and more HP, until it knocks you out in one hit around minute 40.'],
    ['El veneno sigue quitando un porcentaje de la vida, pero contra enemigos con muchísima vida (los legendarios de la Sentencia) ese porcentaje es menor.',
     'Poison still takes a percentage of HP, but against enemies with huge HP (the Judgment legendaries) that percentage is smaller.'],
    ['Todos los rankings empiezan de cero (hoy, semana, mes, año e histórico): las marcas de huir de Arceus ya no se podrían alcanzar.',
     'All leaderboards start from scratch (daily, weekly, monthly, yearly and all-time): records from running away from Arceus could no longer be reached.']
  ], fix: [
    ['Seguridad: se ha cerrado un agujero por el que alguien podía meter código en su fila del ranking o en su perfil y hacer que se ejecutara en el navegador de quien los abría (a algunos les llevaba a un vídeo). Ahora todo lo que viene de otros jugadores se limpia, el servidor sólo deja guardar lo que debe, y el navegador no ejecuta nada que no sea del juego.',
     'Security: we closed a hole that let someone put code in their leaderboard row or profile and make it run in the browser of whoever opened them (some people were sent to a video). Now everything coming from other players is cleaned, the server only accepts what it should, and the browser runs nothing that isn’t part of the game.'],
    ['En el ranking ya salen en shiny los Pokémon de quien jugó con su shiny.',
     'The leaderboard now shows Pokémon in shiny form for players who played with their shiny.']
  ] },
  { d: '2026-10-15', title: ['Actualizaciones obligatorias', 'Required updates'], chg: [
    ['Cuando una actualización sea obligatoria (por ejemplo, para arreglar un fallo importante), la partida en curso se termina tras un aviso de 10 s y el juego se recarga. No pierdes nada: las monedas, los tickets, los récords y el ranking de esa partida se guardan como al abandonarla.',
     'When an update is required (for example, to fix an important bug), your current run ends after a 10 s notice and the game reloads. You lose nothing: that run’s coins, tickets, records and leaderboard entry are saved as if you had quit.']
  ] },
  { d: '2026-10-14', title: ['Recupera tu cuenta con Gmail', 'Recover your account with Gmail'], new: [
    ['Si juegas con nombre y contraseña, puedes vincular tu Gmail: si un día olvidas la contraseña, entras con Google y es tu misma cuenta. Te lo ofrecemos al entrar.',
     'If you play with a name and password, you can link your Gmail: if you ever forget your password, sign in with Google and it is the same account. We offer it when you sign in.'],
    ['Móvil: ya puedes colocar los botones donde quieras. En Ajustes > Controles > Colocar los botones arrastras los ataques (con el objeto), la pausa y el joystick, que ahora también puede ser fijo en vez de aparecer donde pones el dedo.',
     'Mobile: you can now place the buttons wherever you want. In Settings > Controls > Place the buttons, drag the attacks (with the item), the pause button and the joystick, which can now also be fixed instead of appearing where you put your finger.']
  ], chg: [
    ['Las tablas de la semana y del mes del ranking empiezan de cero, como el histórico: ahora sólo cuentan partidas con la Sentencia de Arceus y todas las tablas cuadran entre sí.',
     'The weekly and monthly leaderboards start from scratch, like the all-time one: now only runs with the Judgment of Arceus count, and all boards match each other.'],
    ['Aviso importante: la única web oficial de PokéSurvivor es pokesurvivor.com. El juego es y será gratis: si alguna otra web te pide pagar (por tickets, monedas o lo que sea), no somos nosotros. Lo verás también al entrar y en el Aviso legal.',
     'Important: the only official PokéSurvivor website is pokesurvivor.com. The game is and always will be free: if any other website asks you to pay (for tickets, coins or anything else), it isn’t us. You will also see this when signing in and in the Legal notice.'],
    ['El código del juego pasa a una licencia no comercial (PolyForm Noncommercial 1.0.0): se puede seguir estudiando y modificando, pero nadie puede cobrar por él.',
     'The game’s code moves to a non-commercial license (PolyForm Noncommercial 1.0.0): you can still study and modify it, but nobody may charge for it.']
  ], fix: [
    ['Cooperativo: la partida ya no se queda parada con cada uno esperando a que el otro elija. Un objeto y las cartas de nivel ya no se tapan, y si la conexión pierde un aviso se arregla solo.',
     'Co-op: the game no longer freezes with each player waiting for the other to choose. An item and the level-up cards no longer cover each other, and if the connection drops a message it fixes itself.'],
    ['Cooperativo: al volver de una grieta, quien no era el anfitrión ya ve a todos los enemigos (antes algunos eran invisibles y sólo se veían sus ataques).',
     'Co-op: after coming back from a rift, players who are not the host can see every enemy again (some used to be invisible, with only their attacks showing).'],
    ['Amigos: si tu móvil u ordenador tiene la hora (o la zona horaria) mal puesta, tus amigos ya no salen siempre desconectados y sus invitaciones te llegan.',
     'Friends: if your phone or computer has the wrong time (or time zone), your friends no longer always show as offline and their invitations reach you.'],
    ['Jugar en dos aparatos (PC y móvil) ya no hace perder monedas ni tickets: antes, si uno tenía la partida abierta con datos viejos y guardaba, borraba lo ganado en el otro. Ahora se suma lo de los dos. Y al volver al juego tras un rato fuera, se trae lo conseguido en el otro aparato (Pokémon, shinies...) sin recargar.',
     'Playing on two devices (PC and phone) no longer loses coins or tickets: before, if one had the game open with old data and saved, it erased what you earned on the other. Now both are added up. And when you come back to the game after a while away, it brings in what you got on the other device (Pokémon, shinies...) without reloading.'],
    ['Los avisos grandes de la partida (un Gholdengo cerca, una marea...) ya salen siempre centrados.',
     'Big in-game announcements (a nearby Gholdengo, a swarm...) are always centered now.']
  ] },
  { d: '2026-10-13', title: ['La Sentencia de Arceus', 'The Judgment of Arceus'], new: [
    ['La Sentencia de Arceus: al llegar al minuto 30, Arceus baja del cielo y te lleva a las Ruinas del Juicio. Es invencible, te persigue cada vez más deprisa y lanza pilares de luz, rayos y ondas; si te toca, te quita casi media vida. Cada 5 segundos acude un legendario con el doble de vida y de daño que el anterior. ¿Cuánto aguantarás?',
     'The Judgment of Arceus: at minute 30, Arceus descends from the sky and takes you to the Ruins of Judgment. It is invincible, chases you faster and faster and casts pillars of light, beams and shockwaves; if it touches you, you lose almost half your HP. Every 5 seconds a legendary joins, each with twice the HP and damage of the previous one. How long can you last?'],
    ['Tres logros nuevos: La Sentencia (llega al minuto 30), Ante el Creador (aguanta 1 minuto ante Arceus) y Desafío divino (derrota a 3 legendarios ante Arceus en una partida).',
     'Three new achievements: The Judgment (reach minute 30), Before the Creator (survive 1 minute against Arceus) and Divine challenge (defeat 3 legendaries against Arceus in a single run).'],
    ['Música nueva para la pelea contra Arceus.', 'New music for the fight against Arceus.'],
    ['Botón para reportar marcas sospechosas en el ranking (la banderita de cada fila).',
     'A button to report suspicious records on the leaderboard (the little flag on each row).']
  ], chg: [
    ['El ranking histórico empieza de cero: ahora que las partidas acaban ante Arceus, las marcas de antes ya no se podrían alcanzar. Las tablas de hoy, de la semana y del mes siguen igual.',
     'The all-time leaderboard starts from scratch: now that runs end against Arceus, older records could no longer be reached. The daily, weekly and monthly boards are unchanged.'],
    ['Se quita el tiempo extra del minuto 60 (ya no se llega hasta ahí).',
     'Overtime from minute 60 is removed (runs no longer get that far).'],
    ['Desde el minuto 28 ya no se abren grietas, para que la Sentencia no te pille dentro de una.',
     'Rifts no longer open from minute 28 on, so the Judgment does not catch you inside one.'],
    ['Ranking protegido contra trampas: el servidor comprueba que cada marca se ha jugado de verdad. Nunca se pierde nada de lo que ganas jugando.',
     'Leaderboard protected against cheating: the server checks that every record was really played. You never lose anything you earn by playing.'],
    ['Se han quitado del ranking las marcas de más de 35 minutos: con la Sentencia de Arceus ya no son posibles.',
     'Records over 35 minutes have been removed from the leaderboard: with the Judgment of Arceus they are no longer possible.']
  ], fix: [
    ['Las tiradas del gacha, los Pokémon nuevos y los premios se guardan en la nube al momento. Si abriste el juego en otro aparato o navegador y te faltaba algo, vuelve a abrirlo donde lo conseguiste: se recupera solo.',
     'Gacha pulls, new Pokémon and rewards are saved to the cloud right away. If you opened the game on another device or browser and something was missing, open it again where you got it: it comes back on its own.']
  ] },
  { d: '2026-10-12', title: ['Tiempo extra y grietas con menos azar', 'Overtime and less random rifts'], new: [
    ['Tiempo extra: desde el minuto 60 los Pokémon salvajes se vuelven cada vez más fuertes (más vida y más daño), y cada vez más deprisa. Antes, con las mejoras al máximo, algunas partidas no acababan nunca; ahora las mejores rondarán la hora y media.',
     'Overtime: from minute 60 on, wild Pokémon keep getting stronger (more HP and more damage), faster and faster. Before, with maxed upgrades, some runs never ended; now the best ones will last about an hour and a half.'],
    ['El juego se actualiza solo cuando sale una versión nueva: si estás en el menú, a los 5 segundos; si estás jugando, al acabar la partida (sin perder nada).',
     'The game now updates itself when a new version is out: within 5 seconds if you are in the menu, or after your run if you are playing (without losing anything).'],
    ['Botón de Novedades (esta ventana) con todos los cambios del juego.',
     'A "What\'s new" button (this window) with every change to the game.'],
    ['Números más fáciles de leer: el 2, el 5 y el 8 ya no se confunden.',
     'Easier to read numbers: 2, 5 and 8 no longer look alike.'],
    ['Elige la versión normal o shiny de tu compañero desde el menú principal, debajo de él.',
     'Pick the normal or shiny version of your partner right from the main menu, under it.'],
    ['Mejoras nuevas para cada Pokémon: Golpe Crítico (+3 % de críticos por nivel, que hacen x1,5 de daño), Cambio de cartas (+1 cambio de las cartas de nivel por run) y Veto (bloquea movimientos para que no te salgan en las cartas; se eligen en Mejoras).',
     'New upgrades for each Pokémon: Critical Hit (+3% critical chance per level, crits deal x1.5 damage), Card reroll (+1 level-up card reroll per run) and Ban (block moves so they never show up in your cards; pick them in Upgrades).'],
    ['Atajos de movimientos (en Mejoras, para cada Pokémon): elige qué movimiento va siempre en cada hueco, por ejemplo Confusión siempre en el 1, para la memoria muscular.',
     'Move shortcuts (in Upgrades, for each Pokémon): choose which move always goes in each slot, for example Confusion always on 1, for muscle memory.']
  ], chg: [
    ['Avalancha hace menos daño (21 en vez de 26): derrotaba casi el doble que la media de los movimientos.',
     'Rock Slide deals less damage (21 instead of 26): it defeated almost twice as many as the average move.'],
    ['Los cambios de cartas de nivel ya no se ganan venciendo jefes: tienes 1 gratis por run y el resto se compra en Mejoras.',
     'Level-up card rerolls are no longer earned by defeating bosses: you get 1 free per run and can buy more in Upgrades.'],
    ['Los legendarios de grieta ya no dan siempre tickets x10: dan uno la mitad de las veces (antes daban 2 siempre y salían demasiados).',
     'Rift legendaries no longer always drop x10 tickets: they drop one half of the time (they used to always drop 2, which was too many).'],
    ['Cooperativo: si vuestras redes no consiguen conectar entre sí, la sala lo avisa y lo reintenta sola, en vez de jugar a tirones por un servidor lento.',
     'Co-op: if your networks cannot connect to each other, the room says so and keeps retrying, instead of playing laggy through a slow server.'],
    ['Hemos cambiado de servidores para que el juego siga siendo gratis: puede que tengas que volver a iniciar sesión (con la misma cuenta y contraseña, o con Google). Tu partida y tus Pokémon siguen igual.',
     'We moved to new servers so the game can stay free: you may need to sign in again (with the same account and password, or with Google). Your save and your Pokémon are unchanged.'],
    ['Gacha: los shiny ya no salen repetidos. Si te toca uno que ya tienes, sale otro de la misma rareza que te falte.',
     'Gacha: shinies no longer come out as duplicates. If you roll one you already have, you get another of the same rarity that you are missing.'],
    ['Grietas con menos azar: cada vez que no sale una, la siguiente es más probable (como mucho 2,5 minutos sin grieta).',
     'Less random rifts: every time one does not show up, the next one is more likely (at most 2.5 minutes without a rift).'],
    ['Los legendarios que aún no has vencido salen 4 veces más en las grietas.',
     'Legendaries you have not beaten yet show up 4 times as often in rifts.'],
    ['Los curanderos curan más cuanto más fuerte pegas, pero cada vez menos y con un tope (como mucho el 2,5x).',
     'Healers heal more the harder you hit, but with diminishing returns and a cap (2.5x at most).'],
    ['Ataques cuerpo a cuerpo más fuertes: mientras llevas uno activo recibes un 25 % menos de daño, llegan un 25 % más lejos y hacen un 20 % más de daño.',
     'Stronger melee attacks: while one is active you take 25% less damage, and they reach 25% further and deal 20% more damage.'],
    ['Cooperativo: al elegir con qué objeto quedarte, la partida se para para todos (antes seguía y te pegaban mientras elegías).',
     'Co-op: choosing which held item to keep now pauses the run for everyone (it used to keep going and you got hit while choosing).'],
    ['Cooperativo: mientras alguien elige una fusión, la partida se para para todos.',
     'Co-op: while someone is choosing a fusion, the run pauses for everyone.'],
    ['Cooperativo: si el anfitrión cambia de pestaña o se le para el juego, la partida se pausa para todos hasta que vuelva.',
     'Co-op: if the host switches tabs or their game stalls, the run pauses for everyone until they are back.'],
    ['Las runs de menos de 1 minuto ya no cuentan para el ranking.',
     'Runs shorter than 1 minute no longer count for the leaderboard.']
  ], fix: [
    ['Quitadas del ranking las marcas rotas por el fallo del minuto 84 (el reloj seguía corriendo con el juego parado) y alguna imposible. Si tenías una, tu próxima partida vuelve a contar.',
     'Removed broken records from the leaderboard caused by the minute 84 bug (the clock kept running while the game was frozen) and a few impossible ones. If you had one, your next run counts again.'],
    ['iPhone (Safari y Chrome): a veces no se podía cambiar de movimiento tocando los iconos, sobre todo con el otro dedo en el joystick. Además los botones quedan por encima de la barra de inicio.',
     'iPhone (Safari and Chrome): sometimes you could not switch moves by tapping the icons, especially with your other finger on the joystick. Buttons also sit above the home bar now.'],
    ['En las partidas de más de 84 minutos la pantalla se quedaba en negro, el juego se paraba o empezabas a subir de nivel sin fin. Ya puedes jugar todo lo que aguantes.',
     'In runs longer than 84 minutes the screen went black, the game froze or you kept levelling up forever. Now you can play for as long as you survive.'],
    ['Si el juego fallara, la partida se cierra sola y se guarda (tiempo, derrotados, récords y ranking) en vez de perderse.',
     'If the game ever crashes, the run ends by itself and is saved (time, defeated, records and leaderboard) instead of being lost.'],
    ['Las partidas muy largas a veces se tomaban por trampas y no contaban para el ranking.',
     'Very long runs were sometimes flagged as cheating and did not count for the leaderboard.'],
    ['Cooperativo: si el anfitrión cambiaba de pestaña, los enemigos se quedaban quietos y los demás jugaban con ventaja.',
     'Co-op: if the host switched tabs, enemies stood still and everyone else got a free advantage.'],
    ['iPhone: mantener el dedo en el joystick sacaba "Copiar / Seleccionar todo".',
     'iPhone: holding your finger on the joystick brought up "Copy / Select all".'],
    ['iPhone: a veces no salía la pantalla completa. Ahora el botón explica cómo tenerla (Compartir y "Añadir a pantalla de inicio").',
     'iPhone: fullscreen sometimes did not show up. Now the button explains how to get it (Share and "Add to Home Screen").']
  ] },
  { d: '2026-10-11', title: ['Vínculos', 'Bonds'], new: [
    ['Vínculos: al vencer a un legendario fusionas movimientos que se lanzan a la vez desde un solo hueco (hasta 4).',
     'Bonds: defeating a legendary lets you fuse moves that fire at the same time from a single slot (up to 4).'],
    ['Botón para cambiar las cartas de subir de nivel.',
     'A button to reroll the level-up cards.']
  ], chg: [
    ['Más grietas.', 'More rifts.'],
    ['Movimientos psíquicos y curanderos más flojos.', 'Weaker psychic moves and healers.'],
    ['Las mejoras de las cartas de nivel (velocidad, recarga, experiencia, imán, coraza y potencia) tienen un tope de veces.',
     'Level-up card upgrades (speed, cooldown, experience, magnet, armor and power) can only be taken a limited number of times.'],
    ['En el móvil, la ficha del Pokémon sale al lado; entrar es más rápido y el gacha x10 se puede cerrar.',
     'On mobile, the Pokémon details show alongside; logging in is faster and the x10 gacha can be closed.']
  ], fix: [
    ['Pantalla negra en partidas de más de una hora por llenarse la memoria de imágenes.',
     'Black screen in runs longer than an hour because image memory filled up.'],
    ['Los tickets se perdían si se cerraba la pestaña antes de acabar la partida: ahora se guardan al cogerlos.',
     'Tickets were lost if the tab closed before the run ended: now they are saved as soon as you pick them up.'],
    ['Una mejora comprada justo después de guardar se cobraba y no se apuntaba.',
     'An upgrade bought right after saving was charged but not applied.'],
    ['El juego se quedaba congelado para siempre si algo fallaba a mitad de partida.',
     'The game froze forever if something went wrong mid-run.']
  ] },
  { d: '2026-10-10', title: ['Más reto', 'More challenge'], new: [
    ['Jefes y legendarios con 4 ataques avisados que se enfurecen a media vida.',
     'Bosses and legendaries with 4 telegraphed attacks that get enraged at half health.'],
    ['12 movimientos nuevos y 8 formas de atacar nuevas: bumerán, cadena, minas, meteoros, torreta, embestida, rastro y abanico.',
     '12 new moves and 8 new ways to attack: boomerang, chain, mines, meteors, turret, dash, trail and spray.'],
    ['Eventos a mitad de partida (hordas de un tipo, hora dorada, Pokémon perdidos) y Meowth y Gholdengo que huyen cargados de monedas.',
     'Mid-run events (single-type hordes, golden hour, lost Pokémon) and Meowth and Gholdengo running away loaded with coins.'],
    ['Estatuas para los Pokémon grandes.', 'Statues for big Pokémon.']
  ], chg: [
    ['Más difícil: menos enemigos pero más duros.', 'Harder: fewer but tougher enemies.'],
    ['Subir de nivel es más lento, los tickets son más raros y los jefes dan ticket x10 una de cada tres veces.',
     'Levelling up is slower, tickets are rarer and bosses drop a x10 ticket one time in three.'],
    ['Carga más rápida.', 'Faster loading.']
  ], fix: [
    ['Los enemigos rezagados desaparecían delante de ti: ahora sólo fuera de la vista.',
     'Straggling enemies vanished in front of you: now only off-screen.'],
    ['Los menús y pantallas se montaban encima de la barra de arriba.',
     'Menus and screens overlapped the top bar.']
  ] },
  { d: '2026-10-09', title: ['Móvil e inglés', 'Mobile and English'], new: [
    ['Se puede jugar en móvil y tablet con joystick táctil, e instalar como app.',
     'Play on phones and tablets with a touch joystick, and install it as an app.'],
    ['El juego, en español y en inglés.', 'The game in English and Spanish.'],
    ['Pantalla de ajustes con calidad gráfica automática.', 'Settings screen with automatic graphics quality.']
  ], chg: [
    ['Menos enemigos en pantalla pero más fuertes.', 'Fewer but stronger enemies on screen.'],
    ['Gigadrenado pasa a ser Hierba Lazo (ya no cura).', 'Giga Drain becomes Grass Knot (no more healing).']
  ] },
  { d: '2026-10-08', title: ['Misiones, grietas y cooperativo', 'Missions, rifts and co-op'], new: [
    ['Misiones diarias y semanales, logros con medallas y títulos, y perfil público.',
     'Daily and weekly missions, achievements with medals and titles, and a public profile.'],
    ['Objetos equipables, evoluciones de movimientos y enemigos que curan, protegen, invocan o explotan.',
     'Held items, move evolutions and enemies that heal, shield, summon or explode.'],
    ['Grietas que llevan a 18 arenas legendarias, una por tipo, y clima que cambia la batalla.',
     'Rifts leading to 18 legendary arenas, one per type, and weather that changes the fight.'],
    ['Cooperativo con tu lista de amigos y ranking.', 'Co-op with your friends list and leaderboards.'],
    ['Mejoras para cada Pokémon, gacha tragaperras con tickets y tabla de tipos.',
     'Upgrades for each Pokémon, a slot-machine ticket gacha and a type chart.']
  ], chg: [
    ['Cámara más lejos y enemigos que rodean los obstáculos.', 'Camera further out and enemies that walk around obstacles.']
  ] },
  { d: '2026-10-07', title: ['Primera versión', 'First version'], new: [
    ['Primera versión pública de PokéSurvivor.', 'First public version of PokéSurvivor.']
  ] }
];
