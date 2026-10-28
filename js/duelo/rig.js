/* ============ duelo/rig.js — personajes animados con malla deformable (PixiJS, rama v2-visual) ============
 * UN solo contexto WebGL compartido: cada personaje es una malla (MeshPlane) cuyo dibujo se copia a su propio <canvas> 2D,
 * que se coloca en el DOM como cualquier otra imagen. Así caben decenas de personajes sin decenas de contextos.
 * Animación por vértices: respiración, balanceo, ataque (anticipación + embestida + rebote), daño (sacudida que se apaga)
 * y postura de cansancio permanente. Los valores salen del nivel de la carta (los fuertes son más pesados y lentos).
 * Si no hay WebGL2, falla la carga de PixiJS o «Efectos 3D» está apagado, `make()` devuelve null y el juego sigue con la imagen de siempre.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const CW = 420, CH = 570, FEET = 548, FIT_H = 500, FIT_W = 380;       // lienzo y encaje del personaje (con margen para embestir)
  const VX = 12, VY = 16;
  const PIXI_SRC = 'assets/vendor/pixi.min.js', PIXI_EVAL = 'assets/vendor/pixi-unsafe-eval.min.js';
  let app = null, state = 'idle', waiters = [], why = '';                           // idle | loading | ready | off
  const rigs = new Map();

  const canGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; } };
  /** ¿Se permite usar mallas? Se apaga con Efectos 3D off o Efectos reducidos; con «Gráficos bajos» sólo si se fuerza con duelo.rig = 1. */
  function allowed() {
    if (state === 'off') return false;
    if (document.documentElement.classList.contains('rm')) return false;
    if (D.CardFX && !D.CardFX.on3d()) return false;
    const f = ls('duelo.rig');
    if (f === '0') return false;
    if (f !== '1' && ls('duelo.gfx') === 'low') return false;
    return true;
  }
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => no(new Error('no carga ' + src)); document.head.append(s); });
  /** Carga PixiJS (más su módulo «unsafe-eval», que evita `new Function`: la política de seguridad del sitio no permite eval) y crea el único contexto WebGL. */
  async function load() {
    if (state !== 'idle') return;
    state = 'loading';
    const fail = w => { state = 'off'; why = String(w && w.message || w || 'fallo'); };
    if (!canGL()) return fail('sin WebGL2');
    try {
      await script(PIXI_SRC); await script(PIXI_EVAL);
      app = new PIXI.Application();
      await app.init({ width: CW, height: CH, backgroundAlpha: 0, antialias: true, resolution: 1, preference: 'webgl', autoStart: false });
      app.ticker.stop();
      state = 'ready'; loop();
      const w = waiters; waiters = []; w.forEach(f => { try { f(); } catch (e) { /* nada */ } });
    } catch (e) { fail(e); }
  }
  const ready = () => state === 'ready';
  const onReady = f => { if (state === 'ready') f(); else waiters.push(f); };

  // ---------------- perfil de movimiento según el nivel ----------------
  function profile(id, level) {
    const hv = Math.max(0, Math.min(1, ((level || 4) - 3) / 4));            // 0 = ligero … 1 = pesado
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const ph = (h % 628) / 100;
    return { breath: .018 - .010 * hv, bsp: 2.0 - 1.2 * hv, sway: .022 - .015 * hv, ssp: 1.5 - .95 * hv, lunge: 1.3 - .5 * hv, recoil: 1.0 - .55 * hv, ph };
  }
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // ---------------- un personaje ----------------
  function build(r) {
    const img = new Image();
    img.onload = () => {
      if (r.dead) return;
      try {
        const tex = PIXI.Texture.from(img);
        const k = Math.min(FIT_H / img.naturalHeight, FIT_W / img.naturalWidth), w = img.naturalWidth * k, h = img.naturalHeight * k;
        const mesh = new PIXI.MeshPlane({ texture: tex, verticesX: VX, verticesY: VY });
        const pos = mesh.geometry.positions;
        for (let q = 0; q < pos.length; q++) pos[q] *= k;
        mesh.geometry.getBuffer('aPosition').update();
        r.base = Float32Array.from(pos); r.w = w; r.h = h; r.mesh = mesh; r.tex = tex;
        mesh.position.set(CW / 2 - w / 2, FEET - h);
        const box = new PIXI.Container(); box.addChild(mesh); r.cont = box;
        r.ok = true;
      } catch (e) { r.err = e; }
    };
    img.onerror = () => { r.err = 1; };
    img.src = r.src;
  }
  /** Canvas del personaje de esa casilla (o null si todavía no se puede: se usa la imagen de siempre). */
  function make(key, id, src, level) {
    if (!allowed() || !src) return null;
    if (state === 'idle') load();
    if (state !== 'ready') return null;
    let r = rigs.get(key);
    if (r && (r.id !== id || r.src !== src)) { destroy(key); r = null; }
    if (!r) {
      const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; cv.className = 'hrig';
      r = { key, id, src, canvas: cv, ctx: cv.getContext('2d'), p: profile(id, level), t0: performance.now(), atk: -1, hit: -1, tired: 0, tiredT: 0, gone: 0, ok: false };
      rigs.set(key, r); build(r);
    }
    r.gone = 0;
    return r.canvas;
  }
  function destroy(key) {
    const r = rigs.get(key); if (!r) return;
    r.dead = true; rigs.delete(key);
    try { r.mesh && r.mesh.destroy(); r.tex && r.tex.destroy(true); } catch (e) { /* nada */ }
  }
  const atk = key => { const r = rigs.get(key); if (r) r.atk = performance.now(); };
  const hit = key => { const r = rigs.get(key); if (r) r.hit = performance.now(); };
  const tired = (key, b) => { const r = rigs.get(key); if (r) r.tiredT = b ? 1 : 0; };

  // ---------------- animación por vértices ----------------
  function deform(r, now) {
    const P = r.p, t = (now - r.t0) / 1000;
    let lean = 0, ay = 0, sc = 1, stretch = 0;
    if (r.atk > 0) {
      const k = (now - r.atk) / 1000, A = .28, L = .22, R = .7;
      if (k < A) { const e = ease(k / A); lean = -.10 * e; ay = 14 * e; sc = 1 - .04 * e; }
      else if (k < A + L) { const e = ease((k - A) / L); lean = -.10 + (.22 * P.lunge + .10) * e; ay = 14 - (34 * P.lunge + 14) * e; sc = .96 + (.10 * P.lunge + .04) * e; stretch = .10 * e; }
      else if (k < A + L + R) { const e = (k - A - L) / R, d = Math.exp(-5 * e) * Math.cos(e * 9); lean = .22 * P.lunge * d; ay = -34 * P.lunge * d; sc = 1 + .10 * P.lunge * d; stretch = .1 * d; }
      else r.atk = -1;
    }
    let hx = 0, hy = 0, hs = 0, flinch = 0, flash = 0;
    if (r.hit > 0) {
      const k = (now - r.hit) / 1000;
      if (k < .9) { const d = Math.exp(-4.5 * k); hx = Math.sin(k * 46) * 14 * d * P.recoil; hy = 10 * d * P.recoil; flinch = -.20 * d * P.recoil; hs = .07 * d * P.recoil; flash = d; }   // vibra con frecuencia constante y amplitud que se apaga
      else r.hit = -1;
    }
    r.tired += (r.tiredT - r.tired) * .04;                           // la postura de cansancio entra poco a poco
    const T = r.tired, br = Math.sin(t * P.bsp * (1 - .35 * T) * Math.PI * 2 + P.ph) * P.breath * (1 - .3 * T), sw = Math.sin(t * P.ssp * Math.PI * 2 + P.ph) * P.sway * (1 - .5 * T);
    const pos = r.mesh.geometry.positions, b = r.base, w = r.w, h = r.h;
    for (let j = 0; j < VY; j++) {
      const v = j / (VY - 1), top = 1 - v, tw = Math.pow(top, 1.4), hunch = T * top * top;
      for (let i = 0; i < VX; i++) {
        const k = (j * VX + i) * 2, xr = (b[k] / w) - .5;
        let x = b[k], y = b[k + 1];
        y = h - (h - y) * (1 + br + stretch - T * .07) + hunch * h * .17;                 // cansado: la cabeza cae
        x += xr * w * br * 1.4 * Math.sin(v * Math.PI);
        x += (sw + lean + flinch) * w * tw + hx * tw + hunch * w * .09;
        y += ay * tw + hy * top * .8;
        const S = sc - hs; x = w / 2 + (x - w / 2) * S; y = h + (y - h) * S;
        pos[k] = x; pos[k + 1] = y;
      }
    }
    r.mesh.geometry.getBuffer('aPosition').update();
    // teñido: rojo al recibir un golpe, apagado si está cansado
    const hot = Math.round(255 - 80 * flash), cool = 1 - .30 * T;
    r.mesh.tint = ((Math.round(255 * cool) & 255) << 16) | ((Math.round(hot * cool) & 255) << 8) | (Math.round(hot * cool) & 255);
  }
  let raf = 0, tick = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !app) return;
    const now = performance.now(), n = rigs.size;
    if ((n > 8 || (D.BgFX && D.BgFX.busy && D.BgFX.busy())) && (++tick & 1)) return;                                // con muchos personajes, a media velocidad
    for (const r of rigs.values()) {
      if (!r.canvas.isConnected) { if (++r.gone > 90) destroy(r.key); continue; }
      r.gone = 0;
      if (!r.ok) continue;
      try {
        deform(r, now);
        app.stage.removeChildren(); app.stage.addChild(r.cont);
        app.render();
        const dpr = Math.min(devicePixelRatio || 1, 2), cw = r.canvas.clientWidth;
        const tw = cw ? Math.max(120, Math.min(CW, Math.round(cw * dpr * 1.6))) : CW, th = Math.round(tw * CH / CW);        // tamaño de pantalla (con margen): evita que un recorte grande se vea 'pixelado' al reducirlo
        if (r.canvas.width !== tw) { r.canvas.width = tw; r.canvas.height = th; r.ctx.imageSmoothingEnabled = true; r.ctx.imageSmoothingQuality = 'high'; }
        r.ctx.clearRect(0, 0, tw, th); r.ctx.drawImage(app.canvas, 0, 0, CW, CH, 0, 0, tw, th);
      } catch (e) { r.ok = false; r.err = String(e && e.message || e); }
    }
  }
  D.Rig = { allowed, load, ready, onReady, make, destroy, atk, hit, tired, CW, CH, _rigs: rigs, _state: () => state, _why: () => why };
})();
