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
  function vnoise(x, y) {                                 // ruido de valor con vuelta (para texturas que encajan)
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (i, j) => { let n = (i * 374761393 + j * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
  }
  /** Sillería: bloques desiguales con relieve, juntas, astillas, musgo y luz calculada píxel a píxel. */
  function wallTex(big) {
    const w = 512, hh = 256, c = document.createElement('canvas'); c.width = w; c.height = hh;
    const x = c.getContext('2d'), rows = big ? 3 : 5, rh = hh / rows;
    const hgt = new Float32Array(w * hh), col = new Float32Array(w * hh * 3);
    for (let r = 0; r < rows; r++) {
      let px = -rnd() * 60;
      const y0 = r * rh;
      while (px < w) {
        const bw = (big ? 110 : 70) + rnd() * (big ? 90 : 80), tone = rnd(), tilt = (rnd() - .5) * .35, lvl = .6 + (rnd() - .5) * .12;
        const base = [.52 + tone * .16, .50 + tone * .13, .46 + tone * .09];
        for (let yy = Math.max(0, Math.floor(y0)); yy < Math.min(hh, y0 + rh); yy++) for (let xx = Math.floor(px); xx < px + bw; xx++) {
          const X = (xx + w) % w, i = yy * w + X;
          let dx = Math.min(xx - px, px + bw - xx), dy = Math.min(yy - y0, y0 + rh - yy);
          let d = Math.min(dx, dy) + (vnoise(xx * .22, yy * .22) - .5) * 4 + (vnoise(xx * .9, yy * .9) - .5) * 1.4;
          const gap = Math.min(1, Math.max(0, (d - .5) / 2.6)), bev = Math.min(1, Math.max(0, d / 7));
          let h = (lvl + tilt * ((xx - px) / bw - .5) + (vnoise(xx * .05, yy * .05) - .5) * .12 + (vnoise(xx * .3, yy * .3) - .5) * .06 + (vnoise(xx * 1.1, yy * 1.1) - .5) * .03) * gap - (1 - bev) * .08 * gap + (1 - gap) * .05;
          hgt[i] = h;
          const m = .8 + vnoise(xx * .035 + tone * 9, yy * .035) * .4, g = .93 + vnoise(xx * 1.2, yy * 1.2) * .14;
          let moss = Math.max(0, vnoise(xx * .06 + 40, yy * .06) - .6) * 2.4 * (1 - bev * .5) + Math.max(0, .35 - (dy / rh)) * Math.max(0, vnoise(xx * .1, yy * .1) - .55) * 3;
          moss = Math.min(.85, moss);
          for (let k = 0; k < 3; k++) { let v = base[k] * m * g * (gap * .85 + .15 * .35); const mc = [.17, .29, .08][k]; col[i * 3 + k] = v * (1 - moss) + mc * moss; }
        }
        px += bw;
      }
    }
    const img = x.createImageData(w, hh), d = img.data, lx = -.55, ly = -.5, lz = .68;
    for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx, hl = hgt[yy * w + (xx + w - 1) % w], hr = hgt[yy * w + (xx + 1) % w], hu = hgt[((yy + hh - 1) % hh) * w + xx], hd = hgt[((yy + 1) % hh) * w + xx];
      let nx = -(hr - hl) * 26, ny = -(hd - hu) * 26, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz) / .68;
      let ao = 1; for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [6, 6], [-6, -6]]) { const hn = hgt[((yy + oy + hh) % hh) * w + (xx + ox + w) % w]; ao -= Math.max(0, hn - hgt[i]) * .55; }
      ao = Math.max(.15, ao);
      const L = .42 * ao + .78 * ndl * (.45 + .55 * ao);
      for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.min(255, Math.pow(col[i * 3 + k] * L * (k === 2 ? .96 : 1.04), 1 / 2.2) * 255);
      d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', .9);
  }
  /** Árbol dibujado con luz desde arriba-izquierda: copa de muchas hojas, tronco con corteza. kind: 0 y 1 frondosos, 2 pino. */
  function treeSprite(kind) {
    const w = 256, hh = 300, c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d');
    const tk = x.createLinearGradient(100, 0, 156, 0); tk.addColorStop(0, '#3a2412'); tk.addColorStop(.35, '#7d5632'); tk.addColorStop(.7, '#5a3a1e'); tk.addColorStop(1, '#2a180a');
    x.fillStyle = tk; x.beginPath(); x.moveTo(112, 292); x.lineTo(118, 170); x.lineTo(138, 170); x.lineTo(150, 292); x.closePath(); x.fill();
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(20,10,4,${.15 + rnd() * .25})`; const px = 114 + rnd() * 32; x.beginPath(); x.moveTo(px, 290); x.lineTo(px + (rnd() - .5) * 8, 180 + rnd() * 40); x.stroke(); }
    const pal = kind === 1 ? [[78, 104, 30], [128, 160, 52], [176, 196, 84]] : kind === 2 ? [[16, 52, 36], [30, 88, 52], [70, 128, 76]] : [[22, 72, 28], [52, 118, 40], [112, 170, 66]];
    const blobs = [];
    if (kind === 2) {
      for (let t = 0; t < 6; t++) { const cy = 250 - t * 38, rw = 108 - t * 17; for (let i = 0; i < 26; i++) blobs.push([128 + (rnd() - .5) * rw * 1.7, cy - rnd() * 34, 15 + rnd() * 12 - t]); }
    } else {
      for (let i = 0; i < 170; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()); blobs.push([128 + Math.cos(a) * r * 112, 110 + Math.sin(a) * r * 82 + (kind === 1 ? 14 : 0), 16 + rnd() * 20]); }
    }
    blobs.sort((p, q) => p[1] - q[1]);
    for (const [bx, by, br] of blobs) {
      const lit = Math.max(0, Math.min(1, .55 - (bx - 128) / 300 - (by - 110) / 260 + (rnd() - .5) * .3));
      const mix = (a, b, t) => a + (b - a) * t, cc = i => lit < .5 ? mix(pal[0][i], pal[1][i], lit * 2) : mix(pal[1][i], pal[2][i], (lit - .5) * 2);
      const g = x.createRadialGradient(bx - br * .3, by - br * .35, 1, bx, by, br);
      g.addColorStop(0, `rgb(${cc(0) * 1.15 | 0},${cc(1) * 1.15 | 0},${cc(2) * 1.1 | 0})`); g.addColorStop(.7, `rgb(${cc(0) | 0},${cc(1) | 0},${cc(2) | 0})`); g.addColorStop(1, `rgb(${cc(0) * .55 | 0},${cc(1) * .55 | 0},${cc(2) * .55 | 0})`);
      x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 1400; i++) { const px = rnd() * w, py = 10 + rnd() * 260; x.fillStyle = rnd() < .5 ? `rgba(220,240,130,${.1 + rnd() * .25})` : `rgba(8,30,10,${.15 + rnd() * .3})`; x.beginPath(); x.ellipse(px, py, 1.5 + rnd() * 3, .8 + rnd() * 1.6, rnd() * 3, 0, 7); x.fill(); }
    x.globalCompositeOperation = 'source-over';
    return c.toDataURL('image/png');
  }
  function rockSprite() {
    const w = 160, hh = 120, c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d');
    const pts = []; for (let i = 0; i < 11; i++) { const a = i / 11 * 6.283, r = .8 + rnd() * .2; pts.push([80 + Math.cos(a) * 66 * r, 70 + Math.sin(a) * 40 * r - (Math.sin(a) < 0 ? 10 : 0)]); }
    const ctr = [80, 56];
    x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.save(); x.clip();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2 - ctr[0], my = (p[1] + q[1]) / 2 - ctr[1], l = Math.hypot(mx, my) || 1;
      const lit = Math.max(0, Math.min(1, .5 - (mx / l) * .45 - (my / l) * .4 + (rnd() - .5) * .2)), v = 70 + lit * 120;
      x.fillStyle = `rgb(${v * 1.02 | 0},${v | 0},${v * .92 | 0})`; x.beginPath(); x.moveTo(ctr[0], ctr[1]); x.lineTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.closePath(); x.fill();
    }
    for (let i = 0; i < 700; i++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.1)'; x.fillRect(rnd() * w, rnd() * hh, 1 + rnd() * 3, 1 + rnd() * 3); }
    for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(20,18,14,.55)'; x.lineWidth = 1; x.beginPath(); let px = 40 + rnd() * 80, py = 30 + rnd() * 50; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - .5) * 22; py += 5 + rnd() * 9; x.lineTo(px, py); } x.stroke(); }
    const mg = x.createLinearGradient(0, 20, 0, 70); mg.addColorStop(0, 'rgba(70,120,30,.55)'); mg.addColorStop(1, 'rgba(70,120,30,0)'); x.fillStyle = mg; x.fillRect(0, 0, w, 80);
    x.restore();
    return c.toDataURL('image/png');
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

  // Las texturas se dibujan por partes (una por turno del navegador) para no congelarlo al abrir el juego;
  // se ponen como variables CSS según van estando listas. Con el suelo WebGL no hacen falta ni la hierba, ni
  // la piedra, ni el agua.
  // Caché en el navegador (IndexedDB): las texturas son siempre iguales, así que sólo se dibujan la primera vez.
  const TEX_VER = 'tex1';
  const idb = (mode, fn) => new Promise(res => {
    try {
      const rq = indexedDB.open('duelo-arena', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('t');
      rq.onerror = () => res(null);
      rq.onsuccess = () => {
        try { const tx = rq.result.transaction('t', mode), r = fn(tx.objectStore('t')); tx.oncomplete = () => { res(r && r.result !== undefined ? r.result : null); rq.result.close(); }; tx.onerror = tx.onabort = () => res(null); }
        catch (e) { res(null); }
      };
    } catch (e) { res(null); }
  });
  let texStarted = false;
  function textures() {
    if (texStarted) return;
    texStarted = true;
    const r = document.documentElement.style;
    const apply = o => { for (const k in o) r.setProperty(k, o[k]); };
    idb('readonly', st => st.get(TEX_VER)).then(hit => {
      if (hit && hit.main) {
        apply(hit.main);
        if (hit.extra) apply(hit.extra);
        // sin suelo WebGL hacen falta también la hierba, la piedra y el agua
        if (!hit.extra) whenFloorKnown(() => { if (!(D.Floor && D.Floor.ok)) generate(true, hit); });
        return;
      }
      generate(false, null);
    });
  }
  function whenFloorKnown(fn) { if (D.Floor && !D.Floor.tried()) setTimeout(() => whenFloorKnown(fn), 200); else fn(); }
  /** Dibuja las texturas por partes (una por turno del navegador, para no congelarlo) y las pone todas a la vez. */
  function generate(onlyExtra, prev) {
    const r = document.documentElement.style, main = {}, extra = {};
    const mk = (o, k, fn) => () => { o[k] = `url(${fn()})`; };
    const steps = onlyExtra ? [] : [
      mk(main, '--t-wall', () => wallTex(false)), mk(main, '--t-tower', () => wallTex(true)),
      mk(main, '--t-tree0', () => treeSprite(0)), mk(main, '--t-tree1', () => treeSprite(1)), mk(main, '--t-tree2', () => treeSprite(2)),
      mk(main, '--t-rock', rockSprite)
    ];
    const fallback = [mk(extra, '--t-water', waterTex), mk(extra, '--t-grass', grassTex), mk(extra, '--t-stone', stoneTex)];
    let asked = onlyExtra;
    if (onlyExtra) steps.push.apply(steps, fallback.splice(0));
    const next = () => {
      if (!steps.length && !asked) {
        asked = true;
        whenFloorKnown(() => { if (!(D.Floor && D.Floor.ok)) steps.push.apply(steps, fallback.splice(0)); next(); });
        return;
      }
      if (steps.length) {
        try { steps.shift()(); } catch (e) { /* esa textura se queda con su color liso */ }
        setTimeout(next, 16);
        return;
      }
      // todas a la vez: un solo recálculo de estilos en vez de uno por textura
      const m = onlyExtra ? prev.main : main;
      for (const k in m) r.setProperty(k, m[k]);
      for (const k in extra) r.setProperty(k, extra[k]);
      const rec = { main: m };
      if (Object.keys(extra).length) rec.extra = extra;
      idb('readwrite', st => st.put(rec, TEX_VER));
    };
    setTimeout(next, 0);
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
  let treeN = 0;
  function tree(x, y, s) {
    const k = (treeN++) % 3;
    return billboard(x, y, s, s * 1.17, [el('tspr', `background-image:var(--t-tree${k})`)]);
  }
  function rock(x, y, s) { return billboard(x, y, s * 1.5, s * 1.1, [el('tspr', `background-image:var(--t-rock)`)]); }
  const fires = [];
  function torch(x, y, idx) {
    const cv = document.createElement('canvas'); cv.width = 112; cv.height = 168; cv.className = 'flamec';
    fires.push({ cv, idx, parts: [] });
    startFire();
    return billboard(x, y, 26, 40, [el('fglow', ''), el('pot', ''), cv], 36);
  }
  /** Fuego de las antorchas: llama, chispas y humo, con el mismo parpadeo que la luz del suelo. */
  let fireRaf = 0, fireT = 0;
  function startFire() {
    if (fireRaf) return;
    const step = now => {
      fireRaf = requestAnimationFrame(step);
      if (document.hidden || now - fireT < 33) return;
      const dt = Math.min(.06, (now - fireT) / 1000); fireT = now;
      const t = now / 1000;
      for (let i = fires.length - 1; i >= 0; i--) if (fires[i].gone) fires.splice(i, 1);
      for (const f of fires) {
        if (!f.cv.isConnected) { if (f.seen) f.gone = true; continue; }
        f.seen = true;
        const g = f.cv.getContext('2d'), fl = D.Floor ? D.Floor.flicker(f.idx, t) : 1;
        g.clearRect(0, 0, 112, 168);
        if (Math.random() < 30 * dt) f.parts.push({ k: 0, x: 56 + (Math.random() - .5) * 10, y: 146, vx: (Math.random() - .5) * 8, vy: -(40 + Math.random() * 30), l: 0, life: .55 + Math.random() * .3, r: 18 + Math.random() * 10 });
        if (Math.random() < 2.2 * dt) f.parts.push({ k: 1, x: 56 + (Math.random() - .5) * 14, y: 136, vx: (Math.random() - .5) * 30, vy: -(50 + Math.random() * 50), l: 0, life: .9 + Math.random() * .9, r: 1.6 });
        if (Math.random() < 3 * dt) f.parts.push({ k: 2, x: 56 + (Math.random() - .5) * 8, y: 110, vx: 6 + Math.random() * 6, vy: -(14 + Math.random() * 10), l: 0, life: 1.6 + Math.random(), r: 8 });
        f.parts = f.parts.filter(p => (p.l += dt) < p.life);
        for (const p of f.parts) {
          const u = p.l / p.life;
          p.x += (p.vx + Math.sin(t * 9 + p.y * .1) * (p.k === 0 ? 10 : 4)) * dt; p.y += p.vy * dt;
          if (p.k === 2) { g.globalCompositeOperation = 'source-over'; const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (1 + u * 2)); gr.addColorStop(0, `rgba(60,55,50,${.16 * (1 - u)})`); gr.addColorStop(1, 'rgba(60,55,50,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + u * 2), 0, 7); g.fill(); }
          else if (p.k === 1) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,${170 - u * 80 | 0},60,${1 - u})`; g.beginPath(); g.arc(p.x, p.y, p.r * (1 - u * .5), 0, 7); g.fill(); }
          else {
            g.globalCompositeOperation = 'lighter'; const r = p.r * fl * (1 - u * .75);
            const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); gr.addColorStop(0, `rgba(255,${235 - u * 120 | 0},${150 - u * 140 | 0},${.85 * (1 - u * .6)})`); gr.addColorStop(.5, `rgba(255,${130 - u * 80 | 0},20,${.5 * (1 - u)})`); gr.addColorStop(1, 'rgba(200,40,0,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
          }
        }
        g.globalCompositeOperation = 'source-over';
      }
    };
    fireRaf = requestAnimationFrame(step);
  }
  function bowl(x, y) { return billboard(x, y, 22, 20, [el('bowl', '')], 10); }

  const TREES = [[-250, -150, 120], [-330, 40, 140], [-270, 230, 120], [-360, 420, 150], [-240, 600, 130], [W + 240, -170, 130], [W + 330, 30, 150], [W + 260, 250, 120], [W + 350, 440, 140],
    [W + 230, 620, 120], [120, -250, 110], [330, -300, 130], [520, -240, 110], [60, H + 250, 120], [300, H + 290, 140], [520, H + 240, 120], [-130, -240, 90], [W + 110, -250, 90]];
  const ROCKS = [[-170, 120, 40], [W + 160, 330, 46], [-150, 480, 36], [W + 130, 90, 34], [200, H + 150, 38], [420, -170, 36]];

  /** Rodea a `slab` (el suelo de juego de W×H) con la arena. */
  function build(slab) {
    textures();
    const parts = [];
    parts.push(el('ground', ''));
    parts.push(el('tabimg', ''));
    parts.push(el('river r1', ''), el('river r2', ''));
    // muros alrededor del suelo (altura 10)
    parts.push(prism(-34, -36, W + 68, 36, 10, 'wl'), prism(-34, H, W + 68, 40, 10, 'wl'), prism(-34, 0, 34, H, 10, 'wl'), prism(W, 0, 34, H, 10, 'wl'));
    // torres de las esquinas
    [[-58, -60], [W + 6, -60], [-58, H + 12], [W + 6, H + 12]].forEach(([x, y]) => { parts.push(prism(x, y, 52, 52, 30, 'wl tw')); });
    // antorchas + cuencos
    [[-32, -34], [W + 32, -34], [-32, H + 38], [W + 32, H + 38]].forEach(([x, y], i) => parts.push(torch(x, y, i)));
    for (let i = 0; i < 8; i++) { const y = 34 + i * 50; parts.push(bowl(-17, y), bowl(W + 17, y)); }
    TREES.forEach(t => parts.push(tree(t[0], t[1], t[2])));
    ROCKS.forEach(r => parts.push(rock(r[0], r[1], r[2])));
    parts.forEach(p => slab.prepend(p));
    floorFor(slab);
  }
  /** El suelo WebGL se prepara un momento después de pintar la pantalla (así el menú no espera a la tarjeta gráfica). */
  let floorWant = null, floorSched = false;
  function floorFor(slab) {
    floorWant = slab;
    if (!D.Floor) return;
    if (D.Floor.tried()) { if (D.Floor.ok) D.Floor.attach(slab); return; }
    if (floorSched) return;
    floorSched = true;
    setTimeout(() => {
      D.Floor.init(TREES.map(t => [t[0], t[1], t[2], 0]).concat(ROCKS.map(r => [r[0], r[1], r[2], 1])));
      if (D.Floor.ok && floorWant) D.Floor.attach(floorWant);
    }, 350);
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
