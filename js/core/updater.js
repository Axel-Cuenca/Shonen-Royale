/* ============ updater.js — actualizaciones automáticas ============
 * Al publicar una versión nueva (node tools/build.js escribe version.json con la
 * huella de los archivos), todos los jugadores la reciben sin perder nada:
 *
 *   - Cada 5 min (y al volver a la pestaña) se mira version.json (lo sirve GitHub
 *     Pages: no cuesta nada).
 *   - Fuera de partida (menú, sala de espera incluida): aviso de 5 s y se recarga.
 *     Si está escribiendo en un campo (nombre, contraseña...) o en una ventana
 *     abierta, espera a que termine.
 *   - En partida: no se toca. Al acabar y volver al menú, se recarga.
 *   - Antes de recargar se sube a la nube lo pendiente (los mazos).
 *   - Versión OBLIGATORIA (node tools/build.js --forzar escribe force:true): quien
 *     esté en partida ve un aviso de 15 s y se recarga igual (esa partida se pierde).
 * Sólo funciona en la web publicada (con ?v=huella en los scripts); con doble clic
 * (file://) no hace nada.
 */
window.Duelo = window.Duelo || {};
Duelo.Updater = (() => {
  const EVERY = 5 * 60 * 1000, COUNTDOWN = 5, FORCED = 15;
  const tag = document.querySelector('script[src*="js/duelo/ui.js?v="]');
  const mine = tag ? (tag.getAttribute('src').match(/v=([0-9a-f]+)/) || [])[1] : null;
  let pending = false, forced = false, lastCheck = 0, timer = 0, counting = false, toastEl = null;

  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99;background:#0b1535;color:#fff;border:2px solid #f2c862;border-radius:10px;padding:8px 16px;font:600 15px system-ui,sans-serif;box-shadow:0 4px 18px #000a;max-width:90vw;text-align:center';
      document.body.append(toastEl);
    }
    toastEl.textContent = text; toastEl.style.display = text ? '' : 'none';
  }

  async function check() {
    if (!mine || pending) return;
    lastCheck = Date.now();
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.v && j.v !== mine) { pending = true; forced = !!j.force; console.log('[Actualizar] versión nueva', j.v, '(esta es', mine + ')', forced ? 'OBLIGATORIA' : ''); }
    } catch (e) { /* sin red: se mira la próxima vez */ }
  }

  const inMatch = () => !!(Duelo.UI && Duelo.UI.inMatch());

  /** ¿Se puede recargar ahora sin cortar nada? */
  function safe() {
    if (inMatch()) return false;
    if (document.querySelector('.modal')) return false;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;   // escribiendo (contraseña, nombre del mazo...)
    return true;
  }

  async function reload() {
    try { if (Duelo.Account) await Duelo.Account.flush(); } catch (e) { /* queda en este navegador */ }
    location.reload();
  }

  function countdown(total, ask) {
    counting = true;
    let n = total;
    const tick = () => {
      if (ask && !safe()) { counting = false; toast(''); return; }       // ha empezado una partida: se espera
      if (n <= 0) { reload(); return; }
      toast((forced ? 'Actualización obligatoria: ' : 'Hay una versión nueva del juego: ') + 'se recarga en ' + n + ' s…');
      n--;
      setTimeout(tick, 1000);
    };
    tick();
  }

  function loop() {
    if (pending && !counting) {
      if (forced) countdown(inMatch() ? FORCED : COUNTDOWN, false);
      else if (safe()) countdown(COUNTDOWN, true);
    }
    if (!pending && Date.now() - lastCheck > EVERY) check();
  }

  function init() {
    if (!mine || !location.protocol.startsWith('http')) return;
    clearInterval(timer);
    timer = setInterval(loop, 2000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60000) check(); });
    setTimeout(check, 30000);
  }

  return { init, check, get pending() { return pending; }, get version() { return mine; } };
})();
Duelo.Updater.init();
