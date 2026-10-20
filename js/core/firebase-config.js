/* ============ firebase-config.js — conexión con tu proyecto de Firebase ============
 * Pega aquí la configuración de tu app web de Firebase (Consola de Firebase >
 * Configuración del proyecto > Tus apps > SDK setup and configuration > Config).
 * Los pasos completos están en docs/FIREBASE.md.
 *
 * Estos datos NO son secretos: Firebase los diseña para ir en la web. Lo que
 * protege las partidas son las reglas de Firestore (firestore.rules).
 *
 * Si se pone a null, el juego funciona en modo local (sólo en el navegador).
 */
// Proyecto propio pokesurvivor-amigos (plan Spark, gratis). Sin Identity Platform:
// ¡no pulsar nunca "Actualizar para habilitar" en Authentication!
G.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDDebAPbQK-JUPEGd27TWUKQZqknrCAr6A',
  authDomain: 'pokesurvivor-amigos.firebaseapp.com',
  projectId: 'pokesurvivor-amigos',
  storageBucket: 'pokesurvivor-amigos.firebasestorage.app',
  messagingSenderId: '102305833983',
  appId: '1:102305833983:web:e2f02d19f0d2a740a37dca',
  databaseURL: 'https://pokesurvivor-amigos-default-rtdb.firebaseio.com'
};

/* Servidores TURN para el cooperativo (puente cuando dos redes no pueden conectar
 * directo). Se pega aquí la lista "iceServers" que da el proveedor (p. ej. Metered).
 * Vacío = sólo conexión directa (STUN de Google). Estos datos acaban visibles en la
 * web: usa un plan gratuito y no reutilices la clave en otro sitio. */
G.TURN_SERVERS = [
  { urls: 'turn:global.relay.metered.ca:80', username: '2ca9d32f1339982851a71bf1', credential: 'DbMMrIR/V5M2f0dV' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '2ca9d32f1339982851a71bf1', credential: 'DbMMrIR/V5M2f0dV' },
  { urls: 'turn:global.relay.metered.ca:443', username: '2ca9d32f1339982851a71bf1', credential: 'DbMMrIR/V5M2f0dV' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '2ca9d32f1339982851a71bf1', credential: 'DbMMrIR/V5M2f0dV' }
];

/* Ejemplo de cómo debe quedar:
G.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
};
*/
