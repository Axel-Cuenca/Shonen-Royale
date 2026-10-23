/* Prepara el objeto global G que usan los datos y la red del juego principal. */
window.G = window.G || {};

/* Las fuentes de Google no bloquean la primera pantalla: se activan al llegar (tienen display=swap). */
(function () { const f = () => { const l = document.getElementById('gfonts'); if (l) l.media = 'all'; }; if (document.readyState === 'complete') f(); else addEventListener('DOMContentLoaded', f); })();
