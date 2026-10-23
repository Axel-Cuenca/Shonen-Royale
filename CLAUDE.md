# Duelo Pokémon — cómo se trabaja y se publica

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
Cada cambio de juego o arreglo de fallos va también en `js/data/changelog.js`
(español e inglés, en `new` / `chg` / `fix` de la fecha de hoy; se ve en «Novedades» del menú). Los cambios de
servidores, base de datos o costes NO van ahí.

## Servidores
- Firebase: proyecto **pokesurvivor-free** (autenticación normal: cuentas gratis sin límite).
  **Nunca** activar "Identity Platform" ni nada que lo active (funciones de bloqueo, MFA,
  "Actualizar para habilitar"): cobra por usuario. El proyecto viejo pokesurvivor-jpter se borró el 13-10-2026 (con su facturación).
- Dominio: el sitio vive en `axel-cuenca.github.io/duelo/` (GitHub Pages; el repo se llama `duelo` desde el 22-10-2026). `pokesurvivor.com` NO es nuestro (es de otra persona): no usarlo. El Worker y el TURN
  (Cloudflare Realtime) se quitaron el 15-10-2026: el cooperativo va sólo con conexión directa
  (STUN gratis de Google). No volver a añadir nada de pago.

## Cuentas y datos
- `js/duelo/account.js`: nombre + contraseña (email interno `…@jugadores.pokesurvivor.net`, igual que
  siempre, así las cuentas viejas siguen entrando), Google e invitado. Los mazos van en
  `saves/{uid}` campo `save.duelo` de Firestore: las reglas actuales ya lo permiten, no hay que
  volver a publicarlas. Se conserva lo demás que hubiera en ese documento.
- La nube sólo funciona desde `axel-cuenca.github.io` (y localhost); la lista está en `HOSTS` de `account.js`.

## Cartas
- El catálogo del juego (`js/duelo/cards.js`) son sólo las cartas propias del array `CUSTOM` (Popeye y Creeper hoy):
  el dueño pasa las cartas de a una. El catálogo antiguo (Pokémon, 12 magias, 5 trampas) vive en
  `tools/legacy_catalog.js` y lo usan SÓLO las pruebas. Con menos de 15 cartas distintas no se puede armar un
  mazo (30 cartas, 2 copias): el juego avisa «aún no hay cartas suficientes» y bloquea jugar. Las reglas del mazo
  no se tocan.
- Tablero: 3 zonas de monstruo + 3 de magia/trampa por jugador (`ZONES` en `engine.js`).
- Las imágenes de las cartas van en `assets/cards/` y las voces de habilidad en `assets/voices/` (las pone el dueño).
- Modo de prueba: abrir el sitio con `?prueba` (p. ej. `axel-cuenca.github.io/duelo/?prueba`) da un mazo fijo de 30 (Popeye, Creeper, monstruos «Prueba ★N» y magias/trampas «Prueba: …»), sin límite de copias, sólo contra la computadora y sin guardar nada. Sirve para probar mientras el catálogo es pequeño; no cambia las reglas reales.
