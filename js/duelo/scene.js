/* ============ duelo/scene.js — la arena 3D (suelo de piedra, muros, torres, árboles, río) ============
 * Todo se dibuja por código: las texturas se generan en un canvas al arrancar y
 * los elementos (muros, torres, árboles…) son capas CSS 3D alrededor del tablero.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const TILT = 40;
  const W = 575, H = 440;                       // tamaño del tablero (px base)

  // ---------------- texturas ----------------
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const mk = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

  function noiseOver(ctx, n, amt) {
    const img = ctx.getImageData(0, 0, n, n), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (rnd() - 0.5) * amt; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
    ctx.putImageData(img, 0, 0);
  }
  function grassTex() {
    const n = 512, c = mk(n), x = c.getContext('2d');
    x.fillStyle = '#3f6a2b'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 160; i++) {                       // manchas anchas (con vuelta para que encaje)
      const px = rnd() * n, py = rnd() * n, r = 20 + rnd() * 70, l = rnd() < .5;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
        g.addColorStop(0, l ? 'rgba(120,170,60,.22)' : 'rgba(20,60,25,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 2600; i++) {                      // briznas
      const px = rnd() * n, py = rnd() * n, h = 3 + rnd() * 7, t = rnd();
      x.strokeStyle = t < .5 ? 'rgba(130,190,70,.55)' : t < .8 ? 'rgba(30,80,30,.55)' : 'rgba(190,210,90,.4)';
      x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - .5) * 3, py - h); x.stroke();
    }
    noiseOver(x, n, 14);
    return c.toDataURL('image/jpeg', .85);
  }
  function stoneTex() {                                   // losas irregulares tipo celdas, color arena
    const n = 512, c = mk(n), x = c.getContext('2d'), N = 46;
    const sx = [], sy = [], sc = [];
    for (let i = 0; i < N; i++) { sx.push(rnd() * n); sy.push(rnd() * n); sc.push(rnd()); }
    const img = x.createImageData(n, n), d = img.data;
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      let b1 = 1e9, b2 = 1e9, bi = 0;
      for (let i = 0; i < N; i++) {
        let dx = Math.abs(px - sx[i]), dy = Math.abs(py - sy[i]);
        if (dx > n / 2) dx = n - dx; if (dy > n / 2) dy = n - dy;
        const dd = dx * dx + dy * dy;
        if (dd < b1) { b2 = b1; b1 = dd; bi = i; } else if (dd < b2) b2 = dd;
      }
      const edge = Math.sqrt(b2) - Math.sqrt(b1);          // distancia al borde de la celda
      const k = sc[bi], o = (py * n + px) * 4;
      let r = 196 + k * 26, g = 160 + k * 24, bl = 108 + k * 20;
      const sh = edge < 2.2 ? 0.35 : edge < 5 ? 0.78 + edge * 0.044 : 1;
      d[o] = r * sh; d[o + 1] = g * sh; d[o + 2] = bl * sh; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(90,70,40,${.04 + rnd() * .05})`; x.beginPath(); x.arc(rnd() * n, rnd() * n, 6 + rnd() * 22, 0, 7); x.fill(); }
    noiseOver(x, n, 16);
    return c.toDataURL('image/jpeg', .88);
  }
  function wallTex() {                                    // bloques de piedra
    const n = 256, c = mk(n), x = c.getContext('2d'), rows = 4, bh = n / rows;
    x.fillStyle = '#4f4a44'; x.fillRect(0, 0, n, n);
    for (let r = 0; r < rows; r++) {
      let px = -(r % 2) * 32;
      while (px < n) {
        const bw = 56 + rnd() * 40, t = rnd(), L = 132 + t * 40;
        const g = x.createLinearGradient(0, r * bh, 0, (r + 1) * bh);
        g.addColorStop(0, rgb(L + 22, L + 16, L)); g.addColorStop(1, rgb(L - 18, L - 22, L - 34));
        x.fillStyle = g; x.fillRect(px + 2, r * bh + 2, bw - 4, bh - 4);
        px += bw;
      }
    }
    noiseOver(x, n, 22);
    return c.toDataURL('image/jpeg', .88);
  }
  function waterTex() {
    const n = 256, c = mk(n), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, n, n); g.addColorStop(0, '#2a7fa6'); g.addColorStop(.5, '#3fa3bd'); g.addColorStop(1, '#25709a');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) {
      const px = rnd() * n, py = rnd() * n, l = 14 + rnd() * 40;
      x.strokeStyle = `rgba(220,245,255,${.15 + rnd() * .3})`; x.lineWidth = 1 + rnd() * 1.5;
      for (const ox of [-n, 0, n]) { x.beginPath(); x.moveTo(px + ox, py); x.quadraticCurveTo(px + ox + l / 2, py - 4, px + ox + l, py); x.stroke(); }
    }
    return c.toDataURL('image/jpeg', .85);
  }

  let texDone = false;
  function textures() {
    if (texDone) return;
    texDone = true;
    const r = document.documentElement.style;
    r.setProperty('--t-grass', `url(${grassTex()})`); r.setProperty('--t-stone', `url(${stoneTex()})`);
    r.setProperty('--t-wall', `url(${wallTex()})`); r.setProperty('--t-water', `url(${waterTex()})`);
  }

  // ---------------- piezas ----------------
  const el = (cls, css, kids) => { const e = document.createElement('div'); e.className = cls; if (css) e.style.cssText = css; (kids || []).forEach(k => e.append(k)); return e; };

  /** Prisma: base en el plano (x,y,w,d) elevado `hgt`; cara superior + cara frontal. */
  function prism(x, y, w, d, hgt, cls) {
    const top = el('pr-top ' + (cls || ''), `width:${w}px;height:${d}px;transform:translateZ(${hgt}px)`);
    const front = el('pr-front ' + (cls || ''), `width:${w}px;height:${hgt}px;transform:rotateX(-90deg)`);
    return el('pr', `left:${x}px;top:${y}px;width:${w}px;height:${d}px`, [front, top]);
  }
  /** Elemento que se pone de pie mirando a la cámara. */
  function billboard(x, y, w, h, inner, z) {
    const i = el('bbi', `width:${w}px;height:${h}px;transform:rotateX(-${TILT}deg)`, inner);
    return el('bb', `left:${x - w / 2}px;top:${y}px;width:${w}px;transform:translateZ(${z || 0}px)`, [i]);
  }
  function tree(x, y, s) {
    const f = [];
    const cols = ['#1f5a24', '#2e7a2b', '#3f9a36', '#5fb84a'];
    [[.5, .38, .9], [.28, .5, .62], [.72, .5, .62], [.5, .22, .6], [.38, .3, .5], [.62, .3, .5]].forEach((p, i) => {
      f.push(el('lf', `left:${(p[0] - p[2] / 2) * 100}%;top:${(p[1] - p[2] / 2) * 100}%;width:${p[2] * 100}%;height:${p[2] * 100}%;background:radial-gradient(circle at 35% 30%, ${cols[Math.min(3, i % 4 + 1)]}, ${cols[0]} 78%)`));
    });
    f.unshift(el('trunk', ''));
    return billboard(x, y, s, s * 1.15, f);
  }
  function rock(x, y, s) { return billboard(x, y, s, s * .7, [el('rk', '')]); }
  function torch(x, y) {
    const flame = el('flame', ''), glow = el('fglow', '');
    return billboard(x, y, 26, 40, [glow, el('pot', ''), flame], 36);
  }
  function bowl(x, y) { return billboard(x, y, 22, 20, [el('bowl', '')], 10); }

  const TREES = [[-250, -150, 120], [-330, 40, 140], [-270, 230, 120], [-360, 420, 150], [-240, 600, 130], [W + 240, -170, 130], [W + 330, 30, 150], [W + 260, 250, 120], [W + 350, 440, 140],
    [W + 230, 620, 120], [120, -250, 110], [330, -300, 130], [520, -240, 110], [60, H + 250, 120], [300, H + 290, 140], [520, H + 240, 120], [-130, -240, 90], [W + 110, -250, 90]];
  const ROCKS = [[-170, 120, 40], [W + 160, 330, 46], [-150, 480, 36], [W + 130, 90, 34], [200, H + 150, 38], [420, -170, 36]];

  /** Rodea a `slab` (el suelo de juego de W×H) con la arena. */
  function build(slab) {
    textures();
    if (D.Floor && !D.Floor.tried()) D.Floor.init(TREES.map(t => [t[0], t[1], t[2], 0]).concat(ROCKS.map(r => [r[0], r[1], r[2], 1])));
    const parts = [];
    parts.push(el('ground', ''));
    parts.push(el('river r1', ''), el('river r2', ''));
    // muros alrededor del suelo (altura 10)
    parts.push(prism(-34, -36, W + 68, 36, 10, 'wl'), prism(-34, H, W + 68, 40, 10, 'wl'), prism(-34, 0, 34, H, 10, 'wl'), prism(W, 0, 34, H, 10, 'wl'));
    // torres de las esquinas
    [[-58, -60], [W + 6, -60], [-58, H + 12], [W + 6, H + 12]].forEach(([x, y]) => { parts.push(prism(x, y, 52, 52, 30, 'wl tw')); });
    // antorchas + cuencos
    [[-32, -34], [W + 32, -34], [-32, H + 38], [W + 32, H + 38]].forEach(([x, y]) => parts.push(torch(x, y)));
    for (let i = 0; i < 8; i++) { const y = 34 + i * 50; parts.push(bowl(-17, y), bowl(W + 17, y)); }
    TREES.forEach(t => parts.push(tree(t[0], t[1], t[2])));
    ROCKS.forEach(r => parts.push(rock(r[0], r[1], r[2])));
    parts.forEach(p => slab.prepend(p));
    if (D.Floor && D.Floor.ok) D.Floor.attach(slab);
  }

  let bgSlab = null;
  /** Devuelve el suelo WebGL al fondo de los menús (cuando se sale de la partida). */
  function toBackdrop() { if (bgSlab && D.Floor && D.Floor.ok) D.Floor.attach(bgSlab); }

  /** Fondo para los menús: la misma arena, de lejos, con el tablero vacío. */
  function backdrop(host) {
    const slab = el('slab', ''), board = el('board3d menuboard', '', [slab]), persp = el('persp', '', [board]);
    host.append(persp); build(slab); bgSlab = slab;
    function fit() {
      const sw = host.clientWidth, sh = host.clientHeight;
      const k = Math.min(sw / (W * 1.5), sh / (H * 0.95));
      board.style.setProperty('--k', k.toFixed(3));
      persp.style.perspective = Math.round(W * k * 2.6) + 'px';
    }
    fit(); window.addEventListener('resize', fit);
  }

  D.Scene = { build, backdrop, toBackdrop, TILT, W, H };
})();
