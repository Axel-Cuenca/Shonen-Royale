/* ============ duelo/bgfx.js — fondo cinético de la partida (rama v2-visual) ============
 * Retícula de puntos unidos por líneas (estilo constelación) dibujada en un <canvas> 2D que ocupa TODA la pantalla, por debajo de todo
 * (z-index -1 dentro de `.game`; sin eventos de puntero). Física propia: cada punto es un muelle amortiguado que
 *  · se aparta del cursor con una estela fluida (repulsión + arrastre según la velocidad del ratón) y brilla cerca de él,
 *  · ondula solo con un campo de ondas muy lento (modo reposo, «zen»),
 *  · recibe ondas de choque (`pulse`) que se propagan en círculo desde un punto.
 * El estado de la partida (`setState`) cambia colores y velocidad con transiciones suaves:
 *   normal → azul profundo, muy pausado · turno rival → gris frío, aún más lento y apagado · poca vida (< 30 %) → rojo, rápido y con latido.
 * Todo en un solo requestAnimationFrame (dt real, sin dependencias); con Gráficos bajos la retícula es más espaciada.
 * Con «Efectos reducidos» o apagado en Ajustes (duelo.kbg = 0) no se crea: queda el fondo oscuro estático.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const KEY = 'duelo.kbg';
  const ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  const reduced = () => document.documentElement.classList.contains('rm');
  const on = () => ls(KEY) !== '0' && !reduced();

  // ---------------- estados de ánimo del fondo ----------------
  //   h/s/l: color de líneas y puntos · c0/c1: degradado de fondo (centro → borde) · speed: velocidad del tiempo · amp: amplitud de la ondulación · glow: brillo
  const MOODS = {
    normal: { h: 222, s: 64, l: 62, c0: [13, 22, 56], c1: [3, 5, 14], speed: .35, amp: 1, glow: .55 },
    alert: { h: 356, s: 90, l: 60, c0: [58, 10, 20], c1: [12, 2, 5], speed: 1.9, amp: 1.7, glow: .95 }
  };
  /** Mood destino según la partida: `danger` (poca vida) y `rival` (turno de otro). Puro: se prueba aparte. */
  function moodFor(danger, rival) {
    const b = danger ? MOODS.alert : MOODS.normal, m = Object.assign({}, b, { c0: b.c0.slice(), c1: b.c1.slice() });
    if (rival) {                                   // turno rival: más lento, más frío y apagado
      m.speed *= .4; m.amp *= .6; m.glow *= .5; m.s *= .4; m.l -= 6;
      m.c0 = m.c0.map((v, i) => v * .7 + [20, 24, 30][i] * .3 * (i === 0 ? .5 : 1)); m.c1 = m.c1.map(v => v * .8);
    }
    return m;
  }
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------------- estado ----------------
  let cv = null, cx = null, raf = 0, W = 0, H = 0, DPR = 1, last = 0, t = 0;
  let cols = 0, rows = 0, sp = 52, N = 0, rx, ry, dx, dy, vx, vy;
  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, seen: 0 };
  const ripples = [];
  const cur = moodFor(false, false), tgt = moodFor(false, false);
  let danger = false, rival = false, beat = 0;

  function build() {
    if (!cv) return;
    const low = ls('duelo.gfx') === 'low', narrow = innerWidth < 700;
    sp = low ? 74 : narrow ? 58 : 50;
    DPR = Math.min(devicePixelRatio || 1, low ? 1 : 1.5);
    W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
    cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cols = Math.ceil(W / sp) + 3; rows = Math.ceil(H / sp) + 3; N = cols * rows;
    rx = new Float32Array(N); ry = new Float32Array(N); dx = new Float32Array(N); dy = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    const ox = (W - (cols - 1) * sp) / 2, oy = (H - (rows - 1) * sp) / 2;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const k = j * cols + i; rx[k] = ox + i * sp; ry[k] = oy + j * sp; }
  }

  function step(ts) {
    if (!cv || !cv.isConnected) { stop(); return; }
    raf = requestAnimationFrame(step);
    if (document.hidden) { last = 0; return; }
    const dtms = Math.min(50, last ? ts - last : 16.7); last = ts;
    const f = dtms / 16.67, k = Math.min(1, dtms / 650);                // f: factor respecto a 60 fps · k: suavizado de las transiciones
    // transición suave del estado de ánimo
    cur.h = lerp(cur.h, tgt.h, k * .8); cur.s = lerp(cur.s, tgt.s, k); cur.l = lerp(cur.l, tgt.l, k);
    cur.speed = lerp(cur.speed, tgt.speed, k); cur.amp = lerp(cur.amp, tgt.amp, k); cur.glow = lerp(cur.glow, tgt.glow, k);
    for (let i = 0; i < 3; i++) { cur.c0[i] = lerp(cur.c0[i], tgt.c0[i], k); cur.c1[i] = lerp(cur.c1[i], tgt.c1[i], k); }
    t += dtms / 1000 * cur.speed; beat += dtms / 1000 * cur.speed * (danger ? 3.2 : 0);
    // velocidad del ratón (suavizada)
    mouse.vx *= .85; mouse.vy *= .85;
    const R = Math.max(130, Math.min(W, H) * .17), R2 = R * R, mA = performance.now() - mouse.seen < 4000;
    const now = performance.now();
    for (let q = ripples.length - 1; q >= 0; q--) if (now - ripples[q].t0 > 2600) ripples.splice(q, 1);
    const amp = cur.amp, K = .055 * f, Dm = Math.pow(.9, f);
    for (let k2 = 0; k2 < N; k2++) {
      const x0 = rx[k2], y0 = ry[k2];
      // ondulación lenta (modo reposo): dos ondas cruzadas
      const wx = (Math.sin(y0 * .011 + t * .9 + x0 * .004) * 5 + Math.sin((x0 + y0) * .006 - t * .6) * 3) * amp;
      const wy = (Math.cos(x0 * .012 + t * .8) * 5 + Math.cos((x0 - y0) * .007 + t * .5) * 3) * amp;
      let ax = (wx - dx[k2]) * K, ay = (wy - dy[k2]) * K;
      // ratón: repulsión elástica + arrastre
      if (mA) {
        const px = x0 + dx[k2] - mouse.x, py = y0 + dy[k2] - mouse.y, d2 = px * px + py * py;
        if (d2 < R2 && d2 > .01) {
          const d = Math.sqrt(d2), s = 1 - d / R, fr = s * s * 1.5 * f;
          ax += px / d * fr; ay += py / d * fr;
          ax += mouse.vx * s * .018 * f; ay += mouse.vy * s * .018 * f;
        }
      }
      // ondas de choque
      for (let q = 0; q < ripples.length; q++) {
        const r = ripples[q], age = (now - r.t0) / 1000, rr = age * 520, ex = x0 - r.x, ey = y0 - r.y, d = Math.sqrt(ex * ex + ey * ey) || 1, band = (d - rr) / 70;
        if (band > -1.4 && band < 1.4) { const s = Math.exp(-band * band * 2) * r.s * Math.exp(-age * 1.5) * 1.7 * f; ax += ex / d * s; ay += ey / d * s; }
      }
      vx[k2] = (vx[k2] + ax) * Dm; vy[k2] = (vy[k2] + ay) * Dm;
      dx[k2] += vx[k2] * f; dy[k2] += vy[k2] * f;
    }
    draw(mA);
  }

  const NB = 6;                                                          // niveles de opacidad para agrupar los trazos
  function draw(mA) {
    const hue = cur.h.toFixed(0), sat = cur.s.toFixed(0) + '%', lig = cur.l.toFixed(0) + '%';
    const g = cx.createRadialGradient(W / 2, H * .46, Math.min(W, H) * .08, W / 2, H * .5, Math.max(W, H) * .78);
    g.addColorStop(0, `rgb(${cur.c0[0] | 0},${cur.c0[1] | 0},${cur.c0[2] | 0})`); g.addColorStop(1, `rgb(${cur.c1[0] | 0},${cur.c1[1] | 0},${cur.c1[2] | 0})`);
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    const pulse = danger ? .5 + .5 * Math.sin(beat) : 0, base = .1 + .1 * cur.glow, mR = Math.max(150, Math.min(W, H) * .24);
    const buckets = Array.from({ length: NB }, () => []);
    const seg = (a, b) => {
      const ax = rx[a] + dx[a], ay = ry[a] + dy[a], bx = rx[b] + dx[b], by = ry[b] + dy[b];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      let al = base + Math.min(.12, (Math.abs(dx[a]) + Math.abs(dy[a])) * .012 * cur.glow);
      if (mA) { const px = mx - mouse.x, py = my - mouse.y, d = Math.sqrt(px * px + py * py); if (d < mR) al += (1 - d / mR) * .55 * cur.glow; }
      al += pulse * .06;
      const bi = Math.min(NB - 1, (al * (NB / .75)) | 0);
      buckets[bi].push(ax, ay, bx, by);
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i; if (i < cols - 1) seg(k, k + 1); if (j < rows - 1) seg(k, k + cols);
    }
    cx.lineWidth = 1; cx.lineCap = 'round';
    for (let b = 0; b < NB; b++) {
      const arr = buckets[b]; if (!arr.length) continue;
      cx.strokeStyle = `hsla(${hue},${sat},${lig},${((b + .5) * .75 / NB).toFixed(3)})`;
      cx.beginPath(); for (let q = 0; q < arr.length; q += 4) { cx.moveTo(arr[q], arr[q + 1]); cx.lineTo(arr[q + 2], arr[q + 3]); } cx.stroke();
    }
    // puntos: más grandes y brillantes cerca del cursor
    for (let k = 0; k < N; k++) {
      const x = rx[k] + dx[k], y = ry[k] + dy[k];
      let a = .22 + .25 * cur.glow + pulse * .1, r = 1.1;
      if (mA) { const px = x - mouse.x, py = y - mouse.y, d = Math.sqrt(px * px + py * py); if (d < mR) { const s = 1 - d / mR; a += s * .6; r += s * 2.2; } }
      cx.fillStyle = `hsla(${hue},${sat},${lig},${Math.min(1, a).toFixed(2)})`;
      cx.beginPath(); cx.arc(x, y, r, 0, 6.2832); cx.fill();
    }
    if (mA) {                                                                // halo suave bajo el cursor
      const hg = cx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, mR * 1.1);
      hg.addColorStop(0, `hsla(${hue},${sat},${lig},${(.12 * cur.glow).toFixed(3)})`); hg.addColorStop(1, `hsla(${hue},${sat},${lig},0)`);
      cx.fillStyle = hg; cx.fillRect(mouse.x - mR * 1.1, mouse.y - mR * 1.1, mR * 2.2, mR * 2.2);
    }
    if (danger) {                                                           // viñeta roja que late
      const vg = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .38, W / 2, H / 2, Math.max(W, H) * .78);
      vg.addColorStop(0, 'rgba(255,30,50,0)'); vg.addColorStop(1, `rgba(255,30,50,${(.12 + .16 * pulse).toFixed(3)})`);
      cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
    }
  }

  const onMove = e => { const nx = e.clientX, ny = e.clientY; if (mouse.seen) { mouse.vx = nx - mouse.x; mouse.vy = ny - mouse.y; } mouse.x = nx; mouse.y = ny; mouse.seen = performance.now(); };
  const onResize = () => build();
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', onResize);
    document.documentElement.classList.remove('fxbg');
    cv = null;
  }
  function retarget() { Object.assign(tgt, moodFor(danger, rival)); }

  D.BgFX = {
    on,
    set: v => lsSet(KEY, v ? '1' : '0'),
    /** Monta el fondo dentro de `host` (la pantalla de partida) si no estaba ya. */
    attach(host) {
      if (!host || !on()) { if (cv) stop(); return false; }
      if (cv && cv.isConnected && cv.parentNode === host) return true;
      if (cv) stop();
      cv = document.createElement('canvas'); cv.className = 'kbg'; cx = cv.getContext('2d', { alpha: false });
      if (!cx) { cv = null; return false; }
      host.insertBefore(cv, host.firstChild); build();
      window.addEventListener('pointermove', onMove, { passive: true }); window.addEventListener('resize', onResize);
      document.documentElement.classList.add('fxbg');
      Object.assign(cur, moodFor(danger, rival)); retarget();
      last = 0; raf = requestAnimationFrame(step);
      return true;
    },
    /** Estado de la partida: danger = mis PV < 30 %, rival = es el turno de otro jugador. */
    setState(o) { if (o.danger != null) danger = !!o.danger; if (o.rival != null) rival = !!o.rival; retarget(); },
    /** Onda de choque desde (x, y) en píxeles de pantalla (por defecto, el centro). */
    pulse(x, y, s) { ripples.push({ x: x == null ? W / 2 : x, y: y == null ? H / 2 : y, s: s || 1, t0: performance.now() }); if (ripples.length > 6) ripples.shift(); },
    moodFor, _state: () => ({ on: !!cv, danger, rival, cur: Object.assign({}, cur), n: N, ripples: ripples.length })
  };
})();
