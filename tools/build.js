/* Prepara la publicación del Duelo: pone la huella de esta versión en los scripts y estilos
 * de index.html (para que nadie se quede con una copia vieja en caché) y escribe version.json
 * (lo que mira js/core/updater.js cada 5 min para actualizar a los jugadores solo).
 *
 *   node tools/build.js            versión normal
 *   node tools/build.js --forzar   obligatoria: también recarga a quien esté en partida
 *
 * index.html SÍ se edita a mano (ya no se genera). Sin dependencias: sólo Node.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
let html = fs.readFileSync(INDEX, 'utf8');

const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)\?v=[0-9a-f]+"/g)].map(m => m[1]);
if (!refs.length) throw new Error('index.html no tiene scripts/estilos con ?v=');
// Huella: contenido de todos los archivos, en orden. Cambia sólo si cambia algo de verdad.
const h = crypto.createHash('sha1');
for (const f of refs) h.update(f).update(fs.readFileSync(path.join(ROOT, f)));
const hash = h.digest('hex').slice(0, 10);

html = html.replace(/((?:src|href)="(?:js|css)\/[^"?]+)\?v=[0-9a-f]+"/g, `$1?v=${hash}"`);
fs.writeFileSync(INDEX, html);

const FORZAR = process.argv.includes('--forzar');
fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify(Object.assign({ v: hash, at: new Date().toISOString() }, FORZAR ? { force: true } : {})) + '\n');
console.log(`${FORZAR ? '[OBLIGATORIA] ' : ''}ok: ${refs.length} archivos · versión ${hash}`);
