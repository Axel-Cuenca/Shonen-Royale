/* ============ duelo/intro.js — cinemática de entrada de cada partida ============
 * Las casillas del tablero se materializan una a una, en ESPIRAL desde el centro hacia afuera:
 *   · Caen desde arriba con física (gravedad, rebote amortiguado, cabeceo y "squash" al encajar).
 *   · Se forman con una máscara de ruido: la roca aparece con un borde incandescente (emisión).
 *   · Ese borde ilumina de forma aditiva las losas vecinas y el suelo; al impactar hay un destello,
 *     una onda, polvo, un golpe sordo y un pequeño temblor de cámara.
 * Todo es procedural (Canvas 2D + transformaciones CSS 3D): no hay imágenes ni librerías.
 * Se puede saltar (botón, toque, Esc/Espacio/Enter) y apagar en Ajustes («Cinemática de entrada»).
 * Las casillas reales de juego (.zone) permanecen ocultas mientras dura y se revelan al final.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const KEY = 'duelo.intro';
  const lsGet = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const on = () => lsGet() !== '0';
  const set = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* nada */ } };
  const reduced = () => document.documentElement.classList.contains('rm');
  const enabled = () => on() && !reduced();

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  // aleatorio determinista (la misma entrada en todos los equipos) — mulberry32
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------------- ruido (se genera una sola vez) ----------------
  const NS = 128;
  let NOISE = null, GRAIN = null, CRACK = null;
  function fbm(seed, octs) {
    const r = rng(seed), out = new Float32Array(NS * NS);
    let amp = 1, tot = 0;
    for (const g of octs) {
      const grid = new Float32Array(g * g); for (let i = 0; i < grid.length; i++) grid[i] = r();
      for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
        const fx = x * g / NS, fy = y * g / NS, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = ease(fx - x0), ty = ease(fy - y0);
        const a = grid[(y0 % g) * g + (x0 % g)], b = grid[(y0 % g) * g + ((x0 + 1) % g)], c = grid[((y0 + 1) % g) * g + (x0 % g)], d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        out[y * NS + x] += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  function equalize(arr) {          // reparte los valores de 0 a 1: la disolución avanza pareja
    const idx = Array.from(arr.keys()).sort((a, b) => arr[a] - arr[b]), out = new Float32Array(arr.length);
    idx.forEach((k, i) => { out[k] = i / (arr.length - 1); });
    return out;
  }
  function prepare() { if (NOISE) return; NOISE = equalize(fbm(11, [5, 10, 20, 40])); GRAIN = fbm(29, [12, 24, 48]); const c = fbm(53, [4, 8, 16]); CRACK = new Float32Array(c.length); for (let i = 0; i < c.length; i++) CRACK[i] = Math.abs(c[i] - .5) * 2; }

  // ---------------- WebGL2: roca PBR con relieve, luces dinámicas y disolución ----------------
  // Cada losa se dibuja en un lienzo WebGL compartido y se copia a su lienzo 2D (que sigue transformándose con CSS 3D):
  // así la posición y la física siguen siendo exactas y la cara superior se ilumina de verdad.
  const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;   // r: ruido repartido · g: grano · b: grietas
uniform vec4 uTile;       // x, y, ancho, alto de la losa en el panel (px)
uniform vec2 uSize;       // píxeles del lienzo de la losa
uniform vec2 uOff;        // desplazamiento aleatorio del ruido
uniform float uThr, uP, uBody, uFlash;
uniform vec3 uRim;
uniform vec2 uTilt;       // cabeceo (rad)
uniform int uN; uniform vec4 uL[10]; uniform float uR;
float gr(vec2 p){ return texture(uTex, p).g; }
float ck(vec2 p){ return texture(uTex, p).b; }
float H(vec2 uv){
  vec2 p = uv * uTile.zw / 170. + uOff;
  float h = gr(p * .9) * .55 + gr(p * 2.7 + .3) * .27 + gr(p * 7.1) * .13;
  h -= (1. - smoothstep(0., .075, ck(p * .8 + .17))) * .95;
  vec2 e = min(uv, 1. - uv) * uTile.zw; float d = min(e.x, e.y);
  h -= (1. - smoothstep(0., 5.5, d)) * .85;
  return h;
}
vec3 rot(vec3 v, vec2 t){ float cx = cos(t.x), sx = sin(t.x), cy = cos(t.y), sy = sin(t.y); v = vec3(v.x, cx * v.y - sx * v.z, sx * v.y + cx * v.z); return vec3(cy * v.x + sy * v.z, v.y, -sy * v.x + cy * v.z); }
void main(){
  vec2 uv = vec2(vUv.x, 1. - vUv.y);
  vec2 np = uv * .75 + uOff;
  float n = texture(uTex, np).r, m = uThr - n, bw = .11;
  if (m < 0.) {                                   // aún no existe: halo tenue
    float hh = -m / bw; float a = (hh < 1.2 && uP < 1.) ? (1. - hh / 1.2) * .3 : 0.;
    o = vec4(vec3(1., .66, .24) * a, a); return;
  }
  if (m < bw && uP < 1.) {                        // borde incandescente
    float k = m / bw;
    vec3 c = k < .35 ? mix(vec3(1., 1., .85), vec3(1., .8, .35), k / .35) : mix(vec3(1., .8, .35), vec3(1., .42, .08), (k - .35) / .65);
    o = vec4(c * 1.15, 1.); return;
  }
  // relieve: oclusión de paralaje (las grietas se hunden de verdad)
  vec3 E = normalize(vec3(0., .62, .78));
  vec2 sh = E.xy / E.z * .03; float layer = 1. / 9., dep = 0.; vec2 uvc = uv;
  for (int i = 0; i < 9; i++) { float D = 1. - clamp(H(uvc) * .5 + .5, 0., 1.); if (dep < D) { uvc -= sh * layer; dep += layer; } }
  uvc = clamp(uvc, 0., 1.);
  vec2 eps = 1.6 / uSize; float hs = 6.5;
  float dx = (H(uvc + vec2(eps.x, 0.)) - H(uvc - vec2(eps.x, 0.))) * hs / (2. * eps.x * uTile.z);
  float dy = (H(uvc + vec2(0., eps.y)) - H(uvc - vec2(0., eps.y))) * hs / (2. * eps.y * uTile.w);
  vec3 N = rot(normalize(vec3(-dx, -dy, 1.)), uTilt);
  vec2 p = uvc * uTile.zw / 170. + uOff;
  float g = gr(p * 1.3), crk = 1. - smoothstep(0., .075, ck(p * .8 + .17));
  float hn = clamp(H(uvc) * .5 + .5, 0., 1.);
  vec3 stone = mix(vec3(.40, .37, .36), vec3(.64, .60, .55), g);
  stone = mix(stone, uRim, .17) * (.5 + .65 * hn);
  stone *= 1. - crk * .55;
  vec3 Ls = normalize(vec3(-.55, -.5, .68));
  vec3 col = stone * vec3(.26, .30, .40);
  col += stone * vec3(1., .93, .82) * max(dot(N, Ls), 0.) * .95;
  col += vec3(1., .95, .85) * pow(max(dot(N, normalize(Ls + E)), 0.), 34.) * .28 * (.3 + .7 * (1. - g));
  vec3 wp = vec3(uTile.xy + uvc * uTile.zw, 0.);
  for (int i = 0; i < 10; i++) {
    if (i >= uN) break;
    vec3 d = uL[i].xyz - wp; float dist = length(d); vec3 Ln = d / dist;
    float at = uL[i].w / (1. + 2. * (dist / uR) * (dist / uR));
    col += stone * vec3(1., .68, .32) * max(dot(N, Ln), 0.) * at * 1.15;
    col += vec3(1., .72, .38) * pow(max(dot(N, normalize(Ln + E)), 0.), 22.) * at * .3;
  }
  float hot = clamp(1. - (m - bw) / (bw * 2.2), 0., 1.) * (1. - uP);
  col += vec3(1., .5, .16) * hot * .9 + vec3(1., .45, .12) * crk * (1. - uP) * .8;      // la roca recién formada aún brilla
  col += vec3(1., .92, .75) * uFlash * .6;
  vec2 e = min(uv, 1. - uv) * uTile.zw; float dd = min(e.x, e.y);
  float rimk = 1. - smoothstep(1.2, 2.6, dd);
  col = mix(col, uRim * (.85 + .3 * max(dot(N, Ls), 0.)), rimk * .8);
  col = 1. - exp(-col * 1.35);
  float a = mix(.35 + .65 * uBody, uBody, smoothstep(1.2, 2.6, dd));
  o = vec4(min(col, 1.) * a, a);
}`;
  let GL = undefined;
  function glInit() {
    if (GL !== undefined) return GL;
    GL = null;
    try {
      const f = D.Floor; if (f && f.quality && f.quality() === 'low') return GL;
      const c = document.createElement('canvas'); c.width = 192; c.height = 256;
      const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) return GL;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const tex = gl.createTexture(), px = new Uint8Array(NS * NS * 4);
      for (let i = 0; i < NS * NS; i++) { px[i * 4] = NOISE[i] * 255; px[i * 4 + 1] = GRAIN[i] * 255; px[i * 4 + 2] = Math.min(255, CRACK[i] * 255); px[i * 4 + 3] = 255; }
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NS, NS, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const U = {}; for (const k of ['uTex', 'uTile', 'uSize', 'uOff', 'uThr', 'uP', 'uBody', 'uFlash', 'uRim', 'uTilt', 'uN', 'uL', 'uR']) U[k] = gl.getUniformLocation(pr, k);
      gl.uniform1i(U.uTex, 0);
      gl.clearColor(0, 0, 0, 0);
      c.addEventListener('webglcontextlost', e => { e.preventDefault(); GL = null; });
      GL = { c, gl, U, lights: new Float32Array(40) };
    } catch (e) { console.warn('[Duelo.Intro] sin WebGL, uso la versión 2D:', e && e.message); GL = null; }
    return GL;
  }
  /** Dibuja la cara superior de una losa en el lienzo compartido y la copia a su lienzo 2D. */
  function glPaint(t, a) {
    const { gl, U, c } = GL;
    gl.viewport(0, 0, t.cw, t.ch); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(U.uTile, t.x, t.y, t.w, t.h); gl.uniform2f(U.uSize, t.cw, t.ch); gl.uniform2f(U.uOff, t.ox / NS, t.oy / NS);
    gl.uniform1f(U.uThr, a.thr); gl.uniform1f(U.uP, a.p); gl.uniform1f(U.uBody, a.body); gl.uniform1f(U.uFlash, a.flash);
    gl.uniform3f(U.uRim, t.rim[0] / 255, t.rim[1] / 255, t.rim[2] / 255); gl.uniform2f(U.uTilt, a.rx, a.ry);
    gl.uniform1i(U.uN, a.n); gl.uniform4fv(U.uL, GL.lights); gl.uniform1f(U.uR, a.R);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    t.ctx.clearRect(0, 0, t.cw, t.ch); t.ctx.drawImage(c, 0, c.height - t.ch, t.cw, t.ch, 0, 0, t.cw, t.ch);
  }

  // ---------------- sonido: golpe de roca (sintetizado) ----------------
  let ac = null;
  function sfxOk() { const S = D.Sound; return !(S && (S.muted || S.sfxOn === false)); }
  function vol() { const S = D.Sound; try { return (S && S.volume ? S.volume('master') * S.volume('combat') : 0.8) || 0; } catch (e) { return 0.6; } }
  function thud(k) {
    if (!sfxOk() || k < 0.08) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime, v = vol() * (0.25 + 0.75 * k), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      g.connect(ac.destination);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130 + 40 * k, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2); o.connect(g); o.start(t); o.stop(t + 0.3);
      const nb = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.09), ac.sampleRate), ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      const ns = ac.createBufferSource(), lp = ac.createBiquadFilter(), ng = ac.createGain();
      ns.buffer = nb; lp.type = 'lowpass'; lp.frequency.value = 520 + 700 * k; ng.gain.value = 0.55 * v; ns.connect(lp); lp.connect(ng); ng.connect(ac.destination); ns.start(t);
    } catch (e) { /* sin audio */ }
  }

  // ---------------- sprites de polvo ----------------
  let DUST = null;
  function dustSprite() {
    if (DUST) return DUST;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(190,178,160,.95)'); g.addColorStop(.5, 'rgba(160,150,136,.45)'); g.addColorStop(1, 'rgba(150,140,128,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (DUST = c);
  }
  let GLOWS = null;
  function glowSprite() {
    if (GLOWS) return GLOWS;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,214,120,1)'); g.addColorStop(.35, 'rgba(255,170,60,.55)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (GLOWS = c);
  }

  // ---------------- color de borde de una casilla ----------------
  function parseColor(s) { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return [120, 160, 255]; const p = m[1].split(',').map(parseFloat); return [p[0] | 0, p[1] | 0, p[2] | 0]; }

  // ---------------- la cinemática ----------------
  /**
   * run({ slab, host, stage, seed, onDone }) → { skip(), cancel(), done }
   *   slab: el .slab que contiene las casillas; host: el contenedor de la partida (recibe las clases intro / introout);
   *   stage: elemento que tiembla con los impactos.
   */
  function run(o) {
    prepare();
    const slab = o.slab, host = o.host, stage = o.stage || null;
    const zones = Array.from(slab.querySelectorAll('.zone'));
    const SW = slab.clientWidth, SH = slab.clientHeight;
    if (!zones.length || !SW || !SH) return null;
    const R = rng(o.seed || 7);
    const G = glInit();                              // null → versión 2D
    // --- geometría de cada casilla respecto al panel ---
    const tiles = zones.map(z => {
      let x = 0, y = 0, e = z;
      while (e && e !== slab) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
      const cs = getComputedStyle(z);
      return { x, y, w: z.offsetWidth, h: z.offsetHeight, rim: parseColor(cs.borderTopColor), mz: z.classList.contains('mz') };
    }).filter(t => t.w > 6 && t.h > 6);
    if (!tiles.length) return null;
    // --- orden en espiral desde el centro ---
    const cx = SW / 2, cy = SH / 2, pitch = Math.max(20, Math.min(...tiles.map(t => Math.min(t.w, t.h)))) * 1.25;
    tiles.forEach(t => { const dx = t.x + t.w / 2 - cx, dy = t.y + t.h / 2 - cy; t.cx = dx + cx; t.cy = dy + cy; t.key = Math.hypot(dx, dy) / pitch + (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 0.95; });
    tiles.sort((a, b) => a.key - b.key);
    const N = tiles.length, gap = Math.min(150, 2100 / Math.max(1, N - 1));
    tiles.forEach((t, i) => {
      t.t0 = 650 + i * gap;                    // ms desde el inicio
      t.z = 250 + R() * 70; t.vz = 0;
      t.e = 0.27 + R() * 0.07;                 // restitución
      t.rx = (R() - .5) * 15; t.ry = (R() - .5) * 15; t.vrx = 0; t.vry = 0;
      t.s = 1; t.vs = 0; t.bounces = 0; t.landT = -1; t.flash = 0; t.rest = false; t.dirty = true;
      t.ox = (R() * NS) | 0; t.oy = (R() * NS) | 0; t.gl = 0;
      t.cw = G ? 192 : 112; t.ch = G ? clamp(Math.round(192 * t.h / t.w), 96, 256) : clamp(Math.round(112 * t.h / t.w), 64, 168); t.th = clamp(Math.min(t.w, t.h) * .24, 10, 24);
    });

    // --- capas ---
    const layer = document.createElement('div'); layer.className = 'ilayer';
    const mkCanvas = (cls, z) => { const c = document.createElement('canvas'); c.className = cls; const dpr = Math.min(1.5, window.devicePixelRatio || 1); c.width = Math.round(SW * dpr); c.height = Math.round(SH * dpr); c.style.width = SW + 'px'; c.style.height = SH + 'px'; c.style.transform = `translateZ(${z}px)`; c._dpr = dpr; return c; };
    tiles.forEach(t => {
      t.sh = document.createElement('div'); t.sh.className = 'ishadow'; t.sh.style.cssText = `left:${t.x - t.w * .08}px;top:${t.y - t.h * .06}px;width:${t.w * 1.16}px;height:${t.h * 1.16}px;opacity:0`;
      layer.append(t.sh);
    });
    tiles.forEach(t => {
      t.el = document.createElement('div'); t.el.className = 'itile'; t.el.style.cssText = `left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;visibility:hidden`;
      t.cv = document.createElement('canvas'); t.cv.width = t.cw; t.cv.height = t.ch; t.ctx = t.cv.getContext('2d'); t.img = G ? null : t.ctx.createImageData(t.cw, t.ch);
      const side = (css, rot) => { const d = document.createElement('div'); d.className = 'iside'; d.style.cssText = css; d.style.background = `linear-gradient(rgb(${(t.rim[0] * .25 + 96) | 0},${(t.rim[1] * .25 + 90) | 0},${(t.rim[2] * .25 + 92) | 0}), #24242c)`; d.style.transform = rot; d.style.opacity = 0; return d; };
      t.sd = [side(`left:0;top:100%;width:100%;height:${t.th}px;transform-origin:top`, 'rotateX(-90deg)'), side(`left:0;top:0;width:${t.th}px;height:100%;transform-origin:left`, 'rotateY(90deg)'), side(`right:0;top:0;width:${t.th}px;height:100%;transform-origin:right`, 'rotateY(-90deg)')];
      t.el.append(...t.sd, t.cv); layer.append(t.el);
    });
    const glow = mkCanvas('ifx', 3), dust = mkCanvas('ifx', 24);
    layer.append(glow, dust);
    slab.append(layer);
    const gx = glow.getContext('2d'), dx = dust.getContext('2d');
    // --- interfaz de salto ---
    const catcher = document.createElement('div'); catcher.className = 'introcatch';
    const btn = document.createElement('button'); btn.className = 'introskip'; btn.type = 'button'; btn.textContent = 'Saltar ▶'; btn.setAttribute('aria-label', 'Saltar la cinemática de entrada');
    document.body.append(catcher, btn);
    host.classList.add('intro');

    let nLights = 0; const lightR = pitch * 1.9;
    let t00 = performance.now(), last = t00, raf = 0, finishing = false, fadeT = 0, ended = false;
    const parts = [], rings = [];
    let shake = 0, lastLand = -1;
    const doneP = new Promise(res => { o._res = res; });

    function addDust(t, k) {
      const n = Math.round(6 + 16 * k);
      for (let i = 0; i < n; i++) {
        const side = R() * 4 | 0, f = R();
        const px = side === 0 ? t.x + f * t.w : side === 1 ? t.x + t.w : side === 2 ? t.x + f * t.w : t.x;
        const py = side === 0 ? t.y : side === 1 ? t.y + f * t.h : side === 2 ? t.y + t.h : t.y + f * t.h;
        const ang = Math.atan2(py - t.cy, px - t.cx) + (R() - .5) * .7, sp = 26 + R() * 70 * (.4 + k);
        parts.push({ x: px, y: py, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 14 * R(), r: 7 + R() * 9, g: 14 + R() * 18 * (.5 + k), life: .7 + R() * .6, age: 0, a: .28 + .24 * k });
      }
    }

    function paint(t, now) {
      if (GL && !t.img) {
        const age = now - t.t0, p = clamp(age / 950, 0, 1), fade = finishing ? clamp(fadeT, 0, 1) : 0;
        try { glPaint(t, { thr: ease(p) * 1.11, p, body: 1 - ease(fade), flash: t.flash, rx: t.rx * Math.PI / 180, ry: t.ry * Math.PI / 180, n: nLights, R: lightR }); return; }
        catch (e) { GL = null; t.img = t.ctx.createImageData(t.cw, t.ch); }
      }
      paint2d(t, now);
    }
    function paint2d(t, now) {
      const { cw, ch, img } = t, d = img.data, age = now - t.t0;
      const p = clamp(age / 950, 0, 1), pe = ease(p), bw = 0.11;
      const thr = pe * (1 + bw);
      const fade = finishing ? clamp(fadeT, 0, 1) : 0;               // 0 → 1 mientras se entrega a la casilla real
      const body = 1 - ease(fade);
      const [rr, rg, rb] = t.rim;
      const fl = t.flash;
      for (let y = 0; y < ch; y++) {
        const v = (y + .5) / ch;
        for (let x = 0; x < cw; x++) {
          const u = (x + .5) / cw, o = (y * cw + x) * 4;
          const nx = ((u * 96 | 0) + t.ox) & 127, ny = ((v * 96 | 0) + t.oy) & 127, n = NOISE[ny * NS + nx], m = thr - n;
          if (m < 0) {                                                // aún no existe: halo tenue alrededor del frente
            const h = -m / bw;
            if (h < 1.2 && p < 1) { const a = (1 - h / 1.2) * 70; d[o] = 255; d[o + 1] = 170; d[o + 2] = 60; d[o + 3] = a; } else d[o + 3] = 0;
            continue;
          }
          if (m < bw && p < 1) {                                      // borde incandescente
            const k = m / bw;
            d[o] = 255; d[o + 1] = k < .35 ? lerp(255, 205, k / .35) : lerp(205, 105, (k - .35) / .65); d[o + 2] = k < .35 ? lerp(215, 90, k / .35) : lerp(90, 22, (k - .35) / .65); d[o + 3] = 255;
            continue;
          }
          // roca: grano, grietas, bisel y borde con el color de la casilla
          const gi = (((v * 96 | 0) + t.oy * 3) & 127) * NS + (((u * 96 | 0) + t.ox * 3) & 127);
          const gr = GRAIN[gi], cr = CRACK[(((v * 110 | 0) + t.ox) & 127) * NS + (((u * 110 | 0) + t.oy) & 127)];
          const sp = ((Math.sin(x * 12.9898 + y * 78.233 + t.ox) * 43758.5453) % 1 + 1) % 1;
          let b = 0.46 + 0.7 * gr + (sp - .5) * .16;
          if (cr < .05) b *= .38 + 12.4 * cr;
          const du = Math.min(u, 1 - u) * cw, dv = Math.min(v, 1 - v) * ch, dd = Math.min(du, dv);
          if (dd < 5) { const lit = (du < dv ? (u < .5 ? 1 : -.8) : (v < .5 ? 1 : -.8)); b += lit * 0.4 * (1 - dd / 5); }
          let r = 124 * b, g = 116 * b, bl = 114 * b;
          r = lerp(r, rr, .2); g = lerp(g, rg, .2); bl = lerp(bl, rb, .2);
          if (dd < 2) { r = lerp(r, rr, .85); g = lerp(g, rg, .85); bl = lerp(bl, rb, .85); }
          // brillo residual del borde de disolución (se enfría) y destello del impacto
          if (p < 1) { const hot = clamp(1 - (m - bw) / (bw * 2.2), 0, 1) * (1 - p) ; r += 255 * hot * .5; g += 150 * hot * .5; bl += 40 * hot * .3; }
          if (fl > 0) { r += 255 * fl * .5; g += 235 * fl * .5; bl += 190 * fl * .45; }
          d[o] = r > 255 ? 255 : r; d[o + 1] = g > 255 ? 255 : g; d[o + 2] = bl > 255 ? 255 : bl;
          d[o + 3] = dd < 2 ? 255 * (0.35 + 0.65 * body) : 255 * body;
        }
      }
      t.ctx.putImageData(img, 0, 0);
    }

    function step(now) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const el = now - t00;
      let active = false, landedAll = true, maxGlowT = 0;
      if (GL) {                                                   // luces dinámicas: cada losa que se forma o impacta ilumina a las demás
        const src = tiles.filter(q => q.glI > .05).sort((a, b) => b.glI - a.glI).slice(0, 10);
        nLights = src.length; src.forEach((q, i) => { GL.lights[i * 4] = q.cx; GL.lights[i * 4 + 1] = q.cy; GL.lights[i * 4 + 2] = 22 + q.z * .35; GL.lights[i * 4 + 3] = q.glI * 1.25; });
      }
      for (const t of tiles) {
        if (el < t.t0) { landedAll = false; active = true; continue; }
        if (!t.started) { t.started = true; t.el.style.visibility = 'visible'; }
        const age = el - t.t0;
        // --- física (pasos pequeños para que el rebote sea estable) ---
        if (!t.rest) {
          const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
          for (let i = 0; i < n; i++) {
            t.vz -= 1500 * h; t.z += t.vz * h;
            if (t.z <= 0) {
              const vi = -t.vz;
              t.z = 0;
              if (vi > 60) {
                const k = clamp(vi / 830, 0, 1);
                t.vz = vi * t.e;
                t.vs += 1.6 * k; t.vrx += (R() - .5) * 260 * k; t.vry += (R() - .5) * 260 * k;
                t.flash = Math.max(t.flash, .9 * k + .1);
                addDust(t, k); thud(k); shake = Math.max(shake, 3.2 * k);
                rings.push({ x: t.cx, y: t.cy, r0: Math.min(t.w, t.h) * .4, r1: Math.max(t.w, t.h) * (.9 + .5 * k), age: 0, life: .34, a: .5 * k });
                t.gl = Math.max(t.gl, 1);
                if (t.landT < 0) t.landT = el;
                t.bounces++;
              } else { t.vz = 0; t.rest = true; break; }
            }
          }
        }
        // resortes de cabeceo y "squash"
        t.vs += (-240 * (t.s - 1) - 16 * t.vs) * dt; t.s += t.vs * dt * 0.06;
        t.vrx += (-300 * t.rx - 20 * t.vrx) * dt; t.rx += t.vrx * dt;
        t.vry += (-300 * t.ry - 20 * t.vry) * dt; t.ry += t.vry * dt;
        t.flash = Math.max(0, t.flash - dt / 0.2);
        t.gl = Math.max(0, t.gl - dt / 0.5);
        const settled = t.rest && Math.abs(t.rx) < .05 && Math.abs(t.ry) < .05 && Math.abs(t.s - 1) < .002;
        if (settled) { t.rx = t.ry = 0; t.s = 1; }
        const so = clamp((age - 220) / 320, 0, 1); if (t.so !== so) { t.so = so; for (const d of t.sd) d.style.opacity = so.toFixed(2); }          // los costados se forman cuando la cara ya existe
        const hh = t.z, sq = 1 + (t.s - 1) * 0.5;
        t.el.style.transform = `translate3d(0,0,${hh.toFixed(2)}px) rotateX(${t.rx.toFixed(2)}deg) rotateY(${t.ry.toFixed(2)}deg) scale(${sq.toFixed(4)},${(2 - sq).toFixed(4)})`;
        // sombra sobre el suelo: más ancha y suave cuanto más alto
        const hf = clamp(hh / 300, 0, 1), vis = clamp(age / 160, 0, 1);
        t.sh.style.opacity = (vis * (0.7 - 0.45 * hf)).toFixed(3);
        t.sh.style.transform = `scale(${(1 + hf * .35).toFixed(3)})`;
        const needs = age < 560 || t.flash > 0 || finishing || t.dirty || (GL && nLights > 0);
        if (needs) { paint(t, el); t.dirty = false; }
        if (!(t.rest && settled && age > 560 && t.flash <= 0 && t.gl <= 0)) landedAll = false;
        active = true;
        // luz de la disolución (pico a mitad) + destello del impacto
        const p = clamp(age / 950, 0, 1), dissolveGlow = p < 1 ? Math.sin(Math.PI * p) : 0;
        t.glI = Math.max(dissolveGlow * .9, t.gl * .85);
        maxGlowT = Math.max(maxGlowT, t.glI);
      }

      // --- capa de luz aditiva ---
      gx.setTransform(glow._dpr, 0, 0, glow._dpr, 0, 0); gx.clearRect(0, 0, SW, SH);
      gx.globalCompositeOperation = 'lighter';
      const gs = glowSprite();
      for (const t of tiles) {
        if (!t.glI || t.glI < .02) continue;
        const rad = Math.max(t.w, t.h) * (1.15 + .35 * t.glI);
        gx.globalAlpha = clamp(t.glI * (GL ? .38 : .62), 0, 1);
        gx.drawImage(gs, t.cx - rad, t.cy - rad, rad * 2, rad * 2);
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i]; g.age += dt; const q = g.age / g.life;
        if (q >= 1) { rings.splice(i, 1); continue; }
        const r = lerp(g.r0, g.r1, 1 - (1 - q) * (1 - q));
        gx.globalAlpha = g.a * (1 - q); gx.strokeStyle = 'rgb(255,214,140)'; gx.lineWidth = 3 * (1 - q) + 1;
        gx.beginPath(); gx.arc(g.x, g.y, r, 0, Math.PI * 2); gx.stroke();
      }
      gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over';

      // --- polvo ---
      dx.setTransform(dust._dpr, 0, 0, dust._dpr, 0, 0); dx.clearRect(0, 0, SW, SH);
      const ds = dustSprite();
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.age += dt;
        if (q.age >= q.life) { parts.splice(i, 1); continue; }
        const f = q.age / q.life;
        q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= (1 - 2.2 * dt); q.vy *= (1 - 2.2 * dt); q.vy -= 10 * dt;
        const r = q.r + q.g * f;
        dx.globalAlpha = q.a * (1 - f) * (1 - f * .3);
        dx.drawImage(ds, q.x - r, q.y - r, r * 2, r * 2);
      }
      dx.globalAlpha = 1;

      // --- temblor de cámara ---
      if (stage) {
        if (shake > .05) { stage.style.transform = `translate(${((R() - .5) * 2 * shake).toFixed(2)}px,${((R() - .5) * 2 * shake).toFixed(2)}px)`; shake *= Math.pow(.0008, dt); }
        else if (shake !== 0) { shake = 0; stage.style.transform = ''; }
      }

      // --- final: todas las losas encajadas → entrega a las casillas reales ---
      if (!finishing && (landedAll || (el > 7800))) startFinish(false);
      if (finishing) {
        fadeT += dt / (o._quick ? .25 : .85);
        if (fadeT >= 1 && !parts.length && !rings.length) end();
      }
    }

    function startFinish(quick) {
      if (finishing) return;
      finishing = true; o._quick = quick; fadeT = 0;
      for (const t of tiles) { if (!t.started) { t.started = true; t.el.style.visibility = 'visible'; } t.dirty = true; }
      host.classList.add('introout'); host.classList.remove('intro');
      catcher.remove(); btn.remove();
      const ti = document.createElement('div'); ti.className = 'introtitle'; ti.textContent = '¡DUELO!'; document.body.append(ti);
      setTimeout(() => ti.remove(), 1500);
      o._title = ti;
    }
    function skip() {
      if (finishing || ended) return;
      if (D.Floor && D.Floor.revealNow) D.Floor.revealNow();
      // todas las losas a su sitio ya, sin esperar
      for (const t of tiles) { t.started = true; t.z = 0; t.vz = 0; t.rx = t.ry = 0; t.s = 1; t.rest = true; t.flash = 0; t.gl = 0; t.t0 = Math.min(t.t0, (performance.now() - t00) - 600); }
      startFinish(true);
    }
    function end() {
      if (ended) return; ended = true;
      cancelAnimationFrame(raf); layer.remove(); catcher.remove(); btn.remove();
      if (stage) stage.style.transform = '';
      host.classList.remove('intro'); setTimeout(() => host.classList.remove('introout'), 900);
      document.removeEventListener('keydown', onKey, true);
      if (o.onDone) o.onDone();
      if (o._res) o._res();
    }
    function cancel() {
      if (ended) return; ended = true;
      cancelAnimationFrame(raf); layer.remove(); catcher.remove(); btn.remove();
      if (o._title) o._title.remove();
      if (D.Floor && D.Floor.revealNow) D.Floor.revealNow();
      if (stage) stage.style.transform = '';
      host.classList.remove('intro', 'introout');
      document.removeEventListener('keydown', onKey, true);
      if (o._res) o._res();
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); skip(); } }
    catcher.addEventListener('pointerdown', skip); btn.addEventListener('click', e => { e.stopPropagation(); skip(); });
    document.addEventListener('keydown', onKey, true);
    raf = requestAnimationFrame(step);
    return { skip, cancel, done: doneP };
  }

  D.Intro = { run, enabled, on, set };
})();
