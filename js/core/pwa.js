/* Permite instalar el juego como app y abrirlo sin conexión (ver sw.js). */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* sin soporte: no pasa nada */ }); });
}
