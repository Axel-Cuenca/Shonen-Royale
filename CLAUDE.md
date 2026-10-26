# Shonen Royale (antes «Duelo Pokémon») — cómo se trabaja y se publica

Normas fijas del dueño del proyecto. Se aplican SIEMPRE.

(Desde el 22-10-2026 el sitio es SÓLO el Duelo: el juego PokéSurvivor se quitó. Sigue en el
historial de git, etiqueta `pokesurvivor-completo`.)

## Publicar una versión
1. Se edita `index.html` y los archivos de `js/` y `css/` directamente (ya no hay `dev.html`
   ni paquete minificado: `index.html` carga cada script con `?v=huella`).
2. `node tools/test_duelo.js && node tools/build.js`
   - `build.js` pone la huella en los `?v=` de `index.html` y escribe **`version.json`**
     (la huella de esta versión). Con `--forzar` la versión es obligatoria.
3. Commit (sin "Co-Authored-By" ni ninguna firma de IA) y `git push origin main` sólo cuando el dueño lo pida.

## Actualización automática de los jugadores (obligatorio)
Al publicar, todos los jugadores deben pasar a la versión nueva sin perder nada
(`js/core/updater.js`, mira `version.json` cada 5 min):
- **Fuera de partida** (menú, sala de espera incluida): aviso de 5 s y la página se recarga.
  Si hay una ventana abierta o está escribiendo en un campo, espera a que termine.
- **En partida**: no se toca. Al acabar, al volver al menú, se recarga.
- Antes de recargar se sube a la nube lo pendiente (los mazos).
No quitar `updater.js` ni la escritura de `version.json` en `tools/build.js`.

## Novedades (changelog)
Cada cambio de juego o arreglo de fallos va también en `js/data/changelog.js`, en `new` / `chg` / `fix` de la fecha de hoy
(se ve en «Novedades» del menú). **Regla del dueño (25-10-2026): un PARCHE por tanda, no una lista de widgets.**
Cuando llegan varias cartas, mejoras o arreglos a la vez, se redactan en UNA sola entrada
`[tituloES, descripcionES, tituloEN, descripcionEN]` (p. ej. «Tercera tanda de personajes») con un texto corrido que cuenta
lo que se agregó (nombres y lo esencial), sin una entrada ni un título por cada carta o mejora. Sólo si un cambio es
claramente independiente del resto (otro tema) puede llevar su propia entrada. Título corto, sin prefijos tipo «Música: …».
Los cambios de servidores, base de datos o costes NO van ahí.
Desde el 25-10-2026 cada fecha lleva UNA sola entrada (en `new`) que lo cuenta todo corrido: nada de listas por carta, por mejora ni por arreglo, y sin `chg` ni `fix` sueltos. Si en el mismo día llegan más cambios, se amplía ese texto.

## Servidores
- Firebase: proyecto **pokesurvivor-free** (autenticación normal: cuentas gratis sin límite).
  **Nunca** activar "Identity Platform" ni nada que lo active (funciones de bloqueo, MFA,
  "Actualizar para habilitar"): cobra por usuario. El proyecto viejo pokesurvivor-jpter se borró el 13-10-2026 (con su facturación).
- Dominio: el sitio vive en `axel-cuenca.github.io/Shonen-Royale/` (GitHub Pages; el repo se llama `Shonen-Royale` desde el 24-10-2026 (antes `duelo`)). `pokesurvivor.com` NO es nuestro (es de otra persona): no usarlo. El Worker y el TURN
  (Cloudflare Realtime) se quitaron el 15-10-2026: el cooperativo va sólo con conexión directa
  (STUN gratis de Google). No volver a añadir nada de pago.

## Cuentas y datos
- `js/duelo/account.js`: nombre + contraseña (email interno `…@jugadores.pokesurvivor.net`, igual que
  siempre, así las cuentas viejas siguen entrando), Google e invitado. Los mazos van en
  `saves/{uid}` campo `save.duelo` de Firestore: las reglas actuales ya lo permiten, no hay que
  volver a publicarlas. Se conserva lo demás que hubiera en ese documento.
- La nube sólo funciona desde `axel-cuenca.github.io` (y localhost); la lista está en `HOSTS` de `account.js`.

## Cartas
- El catálogo del juego (`js/duelo/cards.js`) son sólo las cartas propias del array `CUSTOM` (53 desde el 25-10-2026: 51 visibles + 2 formas ocultas de Kayn `c_kayn_rhaast`/`c_kayn_sombra`, que `all()` filtra; antes 20: 14
  personajes y 6 magias; sus habilidades están en la tabla `AB` y en `engine.js`; imágenes `.webp` en `assets/cards/`):
  el dueño pasa las cartas de a una o por lotes (ZIP). El catálogo antiguo (Pokémon, 12 magias, 5 trampas) vive en
  `tools/legacy_catalog.js` y lo usan SÓLO las pruebas. Con menos de 15 cartas distintas no se puede armar un
  mazo (30 cartas, 2 copias): el juego avisa «aún no hay cartas suficientes» y bloquea jugar (con las 20 actuales ya se puede). La computadora usa `aiDeck()`. Las reglas del mazo
  no se tocan.
- Tablero: 3 zonas de monstruo + 3 de magia/trampa por jugador (`ZONES` en `engine.js`).
- Las imágenes de las cartas van en `assets/cards/` y las voces de habilidad en `assets/voices/` (las pone el dueño).
- Modo de prueba: abrir el sitio con `?prueba` (p. ej. `axel-cuenca.github.io/Shonen-Royale/?prueba`) da un mazo fijo de 30 (Popeye, Creeper, monstruos «Prueba ★N» y magias/trampas «Prueba: …»), sin límite de copias, sólo contra la computadora y sin guardar nada. Sirve para probar mientras el catálogo es pequeño; no cambia las reglas reales.

## Mazos (pantalla «Mis mazos»)
- `deckBuilder()` en `ui.js` es la lista de mazos (tarjetas, hasta 6, «Mazo activo» = `store.active`, el que se usa al jugar); `deckEditor(i)` es el editor: colección (centro), carta seleccionada con skin (derecha), tu mazo en 30 casillas (abajo) y lista de mazos (izquierda). Editar un mazo NO cambia el activo (hay «Usar para jugar»). Escritorio: arrastrar y soltar con Pointer Events propios (`drag()`; zonas `data-drop="pool|deck"`; en táctil se desactiva para no romper el scroll); doble clic añade/quita. Móvil (≤ 860 px): pestañas Colección / Tu mazo, botones − / +, tocar una carta abre su ventana, barra con la cuenta fija. Las reglas del mazo no cambian. Los elementos del editor usan `data-did` (no `data-cid`, que activa la vista previa al pasar el ratón).

## Puntos y Tienda
- `js/duelo/shop.js`: puntos ✦, recompensa diaria (racha de 7), premios por partida (`reward`) y catálogo de cosméticos (`ITEMS`). Todo se guarda en `store.pts` (mismo documento que los mazos, sin reglas nuevas). Los cosméticos se aplican con `data-hc/ha/hm/cb/bd/av/fr/ti` en `<html>` (CSS al final de `css/duelo.css`). Son sólo estéticos y cada jugador ve los suyos. Pendiente: cajas (azar), Tienda con ofertas, ranking con rangos y temporadas.
- Ranking (`js/duelo/rank.js`): PC tipo Elo, rangos de 300 con 3 peldaños, Gran Maestro desde 1800, temporada = mes con reinicio parcial. Mi estado va en `store.rank`; la tabla pública está en Firestore `ranks/{AAAA-MM}/p/{uid}` y **necesita estas reglas publicadas por el dueño** en la consola de Firebase (sin ellas el ranking funciona en local y la pantalla avisa):
```
match /ranks/{season}/p/{uid} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null && request.auth.uid == uid
    && request.resource.data.keys().hasOnly(['name','pts','w','l','u'])
    && request.resource.data.name is string && request.resource.data.name.size() <= 24
    && request.resource.data.pts is int && request.resource.data.pts >= 0 && request.resource.data.pts <= 5000
    && (resource == null || (request.resource.data.pts - resource.data.pts <= 60 && resource.data.pts - request.resource.data.pts <= 60));
}
```
- Premios de fin de temporada (`js/duelo/seasons.js`, se carga ANTES de `shop.js`): al cerrar el mes se cobra (modal al entrar al menú, `D.Rank.claim`) el premio del MEJOR rango (`rank.best`), si hubo ≥ 5 partidas con rango. Trae ✦ y cosméticos EXCLUSIVOS (no están en `ITEMS`, ni en la Tienda ni en cajas): título (todos los rangos), marco (desde Oro), avatar (desde Platino). Ids `ti_s2026-10-oro`, `fr_…`, `av_…`; se generan al pedirlos (`Seasons.item`) y cambian solos cada mes según `TEMAS[mes]` (nombre, emoji, brillo). Para un premio hecho a mano en un mes concreto: entrada en `ESPECIALES`. Los pendientes van en `store.rank.pending`. Se equipan desde la Tienda («Tus premios de temporada»). Primera temporada con premios: 2026-10.
- Skins de cartas (`sk_*` en `ITEMS` de `shop.js`, marca `box:1`): efectos de CSS sobre la imagen que ya tiene cada personaje (`[data-sk=…]` en `css/duelo.css`, variable `--skf`), así no hacen falta imágenes extra por personaje y valen para los que se añadan. SÓLO salen de cajas (no se compran, no entran en ofertas; cada caja con la rareza lleva ≥ 1). Una por personaje: `store.pts.sk = { idCarta: 'sk_…' }`, se elige en el constructor de mazos (ℹ de la carta → «Skin»). Viajan en `cos.sk` (máx. 60) y los rivales las ven.
- Cajas y ofertas: en `shop.js` (`BOXES`, `openBox`, `offers`); cada cosmético sale en una sola caja y la Tienda lo vende más caro que esa caja. Los cosméticos viajan en el `hello`/vista (`cos`) y se validan contra el catálogo.

## Pantalla de carga y menú principal
- Marca: logo C (sello circular con llama, degradados `#lgG`/`#lgR` definidos en un SVG oculto de `index.html`; `EMB` en `ui.js`), nombre «SHONEN ROYALE» en GFS Didot (`assets/fonts/GFSDidot-400.woff2`, OFL). Iconos en `assets/icons/` y `favicon.ico` salen de ese logo. El splash escribe nombre y frase con efecto máquina de escribir (`splash.js`, `.tw`/`.cur`; mínimo 3 s visible). Fondo dorado global (`goldBg`) y cabecera fija (`refreshHeader`) en todas las pantallas.
- Splash (`#splash` en `index.html`, CSS «Splash» al final de `css/duelo.css`, `js/core/splash.js` va el PRIMER script): Sukuna carmesí; la llama del brazo (`assets/duelo/home/sukuna_fire.webp`, capa aparte de `sukuna.webp`) y las cortinas de luz «ondean como bandera» con franjas que suben y bajan desfasadas (sólo `transform`). Se apaga con Gráficos bajos/sin WebGL, Efectos reducidos y pantallas pequeñas. La barra mide los scripts que ya llegaron; `ui.js` llama a `DueloSplash.done()` al montar el primer menú o la pantalla de entrada (mínimo 1,5 s visible; a los 25 s se va sola). El emblema del logo viaja al logo del menú.
- Menú Oro (`menu()` en `ui.js`, clases `.home/.hbg/.hhero/.htop/.hmain/.hlist/.hnews/.hbot` en `duelo.css`): fondo con suelo de piedra (`assets/duelo/home/suelo.webp`), Bardock (`bardock.webp`), lista a la izquierda con la descripción de la opción (flechas + Enter), 3 últimas novedades y la temporada a la derecha. Los botones siguen siendo `.menu-btn` (otros códigos lo usan para saber que se está en el menú). Splash y menú comparten emblema (`EMB` en `ui.js` = el SVG de `index.html`). Pendiente: que el héroe y los colores roten con el tema del mes (`TEMAS` de `seasons.js`).

## Interfaz: avisos, tutorial y accesibilidad (24-10-2026)
- Resultado de partida (`showEnd` en `ui.js`): motivo explicado + pista de la regla, resumen 1 contra 1 (`.recap`) y puntos con el tope diario contra la computadora (`D.Shop.aiToday()`, `AI_DAILY_CAP` = 50).
- Tutorial de la primera partida contra la computadora (`tutorial()` en `ui.js`, `TUT`; se marca en `localStorage` `duelo.tut`; se repite desde «Reglas»). «Reglas» va en pestañas con ejemplos (`rules(tab)`).
- Puntitos rojos de aviso en la barra (`badges()`): recompensa diaria, ofertas de hoy (`duelo.offSeen`), caja abrible, premio de temporada y novedades sin leer (`duelo.newsSeen`).
- Accesibilidad (Sonido y efectos): tamaño de letra de menús y ventanas (`data-fs` en `<html>`, `zoom`, `duelo.fs`) y subtítulos de voces (`S.onVoice`, `duelo.subs`). Las «Novedades» del menú usan un icono por categoría (`NICO`), no cartas.


## Segunda tanda de cartas (25-10-2026)
- Pruebas nuevas en `tools/test_tanda2.js` y `tools/test_tanda3.js` (las carga `test_duelo.js`). Las cartas `xs_`/`xt_` sólo existen con `?prueba`; los tests usan ids del catálogo antiguo (`s_beam`, `t_negate`, `t_barrier`).
- Campo `fam` (familia: Vegeta, Goku…) para transformarse entre cartas de la misma familia. `couple:true` (Anti-Venom) se acopla con la acción legal `couple` y queda en el `link` del anfitrión, sin ocupar casilla. Otros flags: `pgem`, `susano`, `beast`, `ring1`, `promise`, `unstop` (Gokumonkyo), `cost:2000` (Guerrero), trampa `c_rayo_solar`.
- Pendings nuevos para reacciones (Shen, Mahoraga, La Muerte, Meliodas, elección de Anti-Venom): serializables, con `ch` (cadena) o `a` (ataque). Los equipos viven en `P.st` (ring, promise, susano, beast, guerrero, prison, held, gem, storm). Escudos con `shieldInfo` (prioridad shen > susano > vegeta); Seis Ojos vía `canTarget`, `SIX_TURNS = 3`.
- Simplificaciones: Shen pregunta al jugador (pending `ab:'shen'`; si acepta, `shenAuto` hace la intercepción; mensaje «Protección del Ojo del Crepúsculo — …» con cut-in) y sólo cubre ataques mortales y magias `destroyOne`; el equipo es sólo de personajes propios; Anti-Venom no tiene muerte propia y se acopla sin ventana de invocación. Meliodas (Total Counter, una vez por turno sin tope) devuelve magias `destroyOne`/`destroyST`/`burn`, trampas hostiles, poderes (cañón, desmantelar, telar, rojo, azul, púrpura, depredador, genkidama) y ataques (no durante los de Yoriichi). La Promesa de Rika fija el portador toda la partida (`slot.bearer`). Anti-Venom muere en lugar del anfitrión si un ataque lo vencería (`av.uid`, `ctx.defn`, `avDies`). La computadora usa Voto Vinculante y Marca de Cazador.
- Rika Orimoto y Yuta Okkotsu (cargadas, 53 CUSTOM): `rikaState(st)` da felicidad/bonus (700, sin acumular); sin Yuta ni anillo Rika ataca obligada (`forcedRika`/`rikaOptions`, quita `endTurn`, sólo personajes del campo o directo). Intercepción de Rika: pending `ab:'rika'` (2 usos por invocación, 1 por turno; cubre ataques, magias `destroyOne`, trampas destroyAttacker/destroySummoned y Cañón). Rika es inmune a magias/trampas/equipo (Gokumonkyo la ignora). Yuta: dominio vía `st.domain` con `min:11` y `noST` (suspende equipo, anillo, Susano y Bestia), copia poderes activables (`borrowable`), aprende con trigger `yutalearn` (máx. 3, 1 por turno).

## Turnos y rondas (25-10-2026)
- «Turno» = una RONDA: pasa cuando todos los jugadores han jugado. `st.round` (se ve como «Turno N» en la partida y en `view().round`) se calcula en `startTurn`; `st.turn` sigue contando el turno de cada jugador y se usa para los límites «una vez por turno» de quien actúa, las trampas recién puestas y el «no ataca el turno que se invoca».
- Todas las DURACIONES («durante N turnos», dominios, Seis Ojos, fusión, anillos, Karma, Gokumonkyo, esperas de transformación y enfriamiento de Sauron) cuentan rondas con `elapsed(st, t0)` / `roundAt` / `curRound`: no cuenta la ronda en que empieza el efecto, y termina al empezar la ronda en que `elapsed >= N`. Al crear un efecto se guarda `t0: st.turn`; no hace falta guardar la ronda. En las pruebas, un duelo = 2 `pass()` por ronda (N rondas = 2N+2 pasadas desde un turno forzado con `ready`).
- En la primera ronda nadie ataca (`canAttackNow`, en duelo también).
- Magias con elección propia en la interfaz (`spellFlow` en `ui.js`): Esferas del Dragón (`wishMenu`), Caña de Pescar (`chooseGrave` con `'banish'`), Pothala y Voto Vinculante (dos pasos con `pickTargets`), Gokumonkyo (sólo casillas enemigas).
