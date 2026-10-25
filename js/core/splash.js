/* ============ core/splash.js — pantalla de carga (Sukuna carmesí) ============
 * Va el PRIMERO de los scripts: el HTML de #splash ya está en index.html. Aquí se arma lo que
 * necesita JS (la llama y las luces «ondeando» como una bandera, las brasas) y se mide la carga
 * real: cuántos scripts de la lista ya llegaron. ui.js llama a DueloSplash.done() cuando el menú
 * ya está montado; entonces el splash se funde y el logo viaja a su sitio del menú (el mismo
 * logo, dorado). Sin JS de ui.js (error de carga) el splash avisa a los 15 s.
 * La onda sólo usa transform (barata en la GPU) y se apaga con «Gráficos bajos/sin WebGL»,
 * con «Efectos reducidos» y en pantallas pequeñas. */
(function () {
  'use strict';
  const sp = document.getElementById('splash');
  if (!sp) { window.DueloSplash = { done() { } }; return; }
  const t0 = performance.now();
  const en = /^en/i.test(navigator.language || '');
  let gfx = 'auto', rm = false;
  try { gfx = localStorage.getItem('duelo.gfx') || 'auto'; } catch (e) { /* nada */ }
  try { const v = localStorage.getItem('duelo.rm'); rm = v == null ? matchMedia('(prefers-reduced-motion: reduce)').matches : v === '1'; } catch (e) { /* nada */ }
  const wave = !rm && gfx !== 'low' && gfx !== 'off' && Math.min(innerWidth, innerHeight) >= 520;
  const mk = (cls, st) => { const e = document.createElement('i'); if (cls) e.className = cls; if (st) e.style.cssText = st; return e; };

  // llama del brazo: franjas verticales de la misma imagen; cada una sube y baja con un desfase (bandera)
  const fire = sp.querySelector('.sp-fire');
  if (fire) {
    const N = wave ? 20 : 1;
    for (let i = 0; i < N; i++) {
      const x = N > 1 ? i / (N - 1) : 0;
      const a = N > 1 ? Math.pow(Math.max(0, Math.min(1, (0.74 - x) / 0.74)), 0.85) : 0;   // más lejos de la mano, más ondea
      fire.appendChild(mk('', `--i:${i};--n:${N};--a:${a.toFixed(3)};` + (N > 1 ? '' : 'animation:none')));
    }
  }
  // cortinas de luz del fondo: otra bandera, más suave y lenta
  const cur = sp.querySelector('.sp-curt');
  if (cur && wave) {
    const N = 26;
    for (let i = 0; i < N; i++) cur.appendChild(mk('', `--i:${i};--n:${N}`));
  }
  const parts = sp.querySelector('.sp-parts');
  if (parts && !rm) {
    for (let i = 0; i < (wave ? 44 : 18); i++) {
      const s = 2 + Math.random() * 5, d = 5 + Math.random() * 9;
      parts.appendChild(mk('', `left:${(Math.random() * 100).toFixed(1)}%;top:${(40 + Math.random() * 60).toFixed(1)}%;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;--d:${d.toFixed(1)}s;animation-delay:-${(Math.random() * d).toFixed(1)}s;--dx:${((Math.random() - .5) * 120).toFixed(0)}px`));
    }
  }
  sp.classList.toggle('wave', wave);

  // máquina de escribir: el nombre y la frase se escriben letra a letra con el cursor parpadeando
  const l1 = sp.querySelector('.l1'), tg = sp.querySelector('.tag');
  const queue = [];
  const prep = (root) => {
    const walk = (n) => { [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) { const f = document.createDocumentFragment(); for (const ch of c.textContent) { if (ch === ' ') f.append(' '); else { const sp2 = document.createElement('span'); sp2.className = 'tw'; sp2.textContent = ch; f.append(sp2); queue.push(sp2); } } c.replaceWith(f); }
      else if (c.nodeType === 1) walk(c); }); };
    walk(root);
  };
  const caret = document.createElement('i'); caret.className = 'cur';
  let typed = false;
  if (!rm && l1 && tg) {
    prep(l1); const nLogo = queue.length; prep(tg);
    let i = 0, t = 0;
    const step = () => {
      if (gone) return;
      if (i >= queue.length) { typed = true; return; }          // fin: el cursor sigue parpadeando
      const c = queue[i++]; c.classList.add('on'); c.after(caret);
      if (i === nLogo) { setTimeout(step, 380); return; }          // pausa entre el nombre y la frase
      setTimeout(step, (i <= nLogo ? 85 : 32) + Math.random() * 40);
    };
    setTimeout(step, 350);
  } else typed = true;

  // progreso real: scripts de la lista que ya terminaron de bajar
  const bar = sp.querySelector('.sp-bar b'), txt = sp.querySelector('.sp-pct'), lab = sp.querySelector('.sp-lab');
  const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src').split('?')[0]);
  let shown = 0, target = 0, finished = false, gone = false;
  const poll = () => {
    if (gone) return;
    if (!finished) {
      let ok = 0;
      try { const rs = performance.getEntriesByType('resource'); for (const s of srcs) if (rs.some(r => r.name.indexOf(s) >= 0 && r.responseEnd > 0)) ok++; } catch (e) { ok = 0; }
      target = Math.max(target, Math.min(92, srcs.length ? (ok / srcs.length) * 88 : 40));
    } else target = 100;
    shown += (target - shown) * 0.18 + 0.15;
    if (shown > target) shown = target;
    const p = Math.round(shown);
    if (bar) bar.style.width = p + '%';
    if (txt) txt.textContent = (en ? 'Loading' : 'Cargando') + ' · ' + p + ' %';
    if (!finished && performance.now() - t0 > 15000 && lab) lab.textContent = en ? 'Taking longer than usual… check your connection' : 'Tarda más de lo normal… revisa tu conexión';
    setTimeout(poll, 70);
  };
  poll();

  // el logo del splash viaja hasta el logo del menú (mismo emblema) y el splash se funde
  function leave() {
    if (gone) return; gone = true;
    const home = document.querySelector('.home');
    const from = sp.querySelector('.sp-logo .emb'), to = document.querySelector('.gtop .brand .emb');
    let fly = null;
    try {
      if (from && to && !rm) {
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        if (a.width && b.width) {
          fly = from.cloneNode(true); fly.removeAttribute('class'); fly.classList.add('sp-fly');
          fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
          document.body.appendChild(fly); to.style.visibility = 'hidden';
          fly.animate([{ transform: 'none' }, { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width})` }],
            { duration: 900, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }).onfinish = () => { to.style.visibility = ''; fly.remove(); };
        }
      }
    } catch (e) { if (to) to.style.visibility = ''; }
    sp.classList.add('out');
    document.querySelectorAll('.pre').forEach(e => e.classList.remove('pre'));
    setTimeout(() => { sp.remove(); document.documentElement.classList.remove('splashing'); }, rm ? 100 : 1000);
  }
  document.documentElement.classList.add('splashing');
  setTimeout(() => window.DueloSplash.done(), 25000);              // por si algo falla: que no se quede tapando
  window.DueloSplash = {
    done() {
      if (finished) return; finished = true;
      const wait = Math.max(0, (rm ? 1200 : 3000) - (performance.now() - t0));   // se ve al menos 3 s: da tiempo a escribir el nombre
      setTimeout(() => setTimeout(leave, 350), wait);                  // y deja llegar la barra al 100 %
    }
  };
})();
