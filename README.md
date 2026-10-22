# Duelo Pokémon

Duelos de cartas por turnos con los Pokémon como monstruos: 8000 PV, nivel, ATK y DEF
sacados de cada Pokémon, 12 magias y 5 trampas. Se juega contra la computadora o **online con
amigos**, en 1 contra 1, todos contra todos (3 o 4 jugadores) y 2 contra 2.

Es una copia propia, derivada de [PokéSurvivor](https://github.com/JPTER78/pokesurvivor) de
JPTER78 (el juego original ya no está en esta copia; sigue en el historial de git con la etiqueta
`pokesurvivor-completo`). Licencia y créditos: `LICENSE-NONCOMMERCIAL.md` y `CREDITS.md`
(uso **no comercial**).

HTML + CSS + JavaScript sin dependencias ni paso de compilación. Gratis y sin anuncios.

## Jugar

- Web publicada: <https://axel-cuenca.github.io/duelo-pokemon/>
- En local: `python3 -m http.server` en esta carpeta y abrir <http://localhost:8000>. Sin la web
  publicada no hay nube: no hay cuentas y los mazos se guardan sólo en el navegador.

Cuentas: nombre + contraseña, Google o invitado. Con cuenta, los mazos se guardan en la nube y se
puede jugar online. Como invitado sólo contra la computadora.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `js/duelo/` | `engine.js` (reglas, puras), `ai.js`, `match.js` (local/anfitrión/invitado), `online.js` (salas), `account.js` (cuentas y nube), `ui.js`, `scene.js` + `floor.js` (tablero 3D), `sound.js` |
| `js/net/net.js` | Conexión directa entre navegadores (WebRTC) |
| `js/core/updater.js` | Actualiza a los jugadores solos al publicar una versión |
| `assets/` | Sprites (`pokemon/<n>/Idle.png`), audio, fuentes e iconos |
| `tools/` | `build.js` (huella + `version.json`), `test_duelo.js` (pruebas del motor), `make_duelo_audio.py`, `make_icons.py` |
| `docs/FIREBASE.md` | Cómo configurar Firebase |

## Publicar y probar

```
node tools/test_duelo.js     # pruebas del motor, la IA y las salas (unos segundos)
node tools/build.js          # pone la huella en index.html y escribe version.json
```

Detalles y reglas del proyecto en `CLAUDE.md`.
