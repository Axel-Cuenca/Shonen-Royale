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
  const THEMES = [   // 0 energía · 1 agujero negro · 2 dominio maldito · 3 mar nocturno  (tono base del estado normal)
    { n: 'Cielo de energía', h: 222, s: 64, l: 62, c0: [13, 22, 56], c1: [3, 5, 14] },
    { n: 'Agujero negro', h: 28, s: 90, l: 60, c0: [30, 14, 52], c1: [3, 2, 10] },
    { n: 'Dominio maldito', h: 350, s: 78, l: 56, c0: [60, 8, 22], c1: [10, 1, 6] },
    { n: 'Mar nocturno', h: 196, s: 70, l: 60, c0: [8, 38, 62], c1: [2, 8, 18] }];
  let themeIx = 0;
  function moodFor(danger, rival) {
    const T = THEMES[themeIx] || THEMES[0], nb = Object.assign({}, MOODS.normal, { h: T.h, s: T.s, l: T.l, c0: T.c0, c1: T.c1 });
    const b = danger ? MOODS.alert : nb, m = Object.assign({}, b, { c0: b.c0.slice(), c1: b.c1.slice() });
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


  // ---------------- capa de fondo realista (WebGL2): nebulosa volumétrica, rayos de luz y polvo con profundidad ----------------
  let gc = null, gl = null, gp = null, gu = null;
  const VS = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
  const FS = (oct) => `#version 300 es
precision highp float; out vec4 o;
uniform vec2 uRes, uM, uMv; uniform float uT, uGlow, uPulse, uRip, uRx, uRy, uFlash; uniform int uTh, uTh2; uniform float uMix;
uniform vec3 uA, uB, uC;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; mat2 r = mat2(.8, -.6, .6, .8); for (int i = 0; i < ${oct}; i++){ s += a * vn(p); p = r * p * 2.03 + 7.1; a *= .5; } return s; }
float st(vec2 g, float dens){ vec2 id = floor(g), f = fract(g) - .5; float r = h21(id); vec2 off = vec2(h21(id + 3.1), h21(id + 9.7)) - .5;
  return step(dens, r) * smoothstep(.09, .0, length(f - off * .7)) * (.4 + .6 * h21(id + 1.7)); }
vec3 scene(int th, vec2 uv, vec2 asp, vec2 p, vec2 m, vec2 d, float dm, vec2 push, float t){
  vec3 c = vec3(0.);
  if (th == 1) {
    // ===== AGUJERO NEGRO con lente gravitacional (el cursor es una segunda masa) =====
    vec2 bc = vec2(0., .02); vec2 r = p - bc; float rl = length(r);
    vec2 q = p; q += r / (rl * rl + .02) * .045; q += d / (dm * dm + .03) * .012;
    c = uA * .5;
    c += uB * .7 * fbm(q * 1.1 + t * .02) * fbm(q * .7 - t * .015 + 3.);
    c += vec3(.8, .85, 1.) * (st(q * 26. + 3., .86) + st(q * 14., .93) * 1.4) * (.6 + .4 * sin(t * 2. + q.x * 40.)) * uGlow;
    float R0 = .5, ring = exp(-pow((rl - R0) / .045, 2.)) + .45 * exp(-pow((rl - R0) / .13, 2.));
    float ang = atan(r.y, r.x), swirl = fbm(vec2(ang * 3. - t * .9, rl * 9.)) ;
    float dop = .55 + .45 * cos(ang + .6);
    c += mix(uC, vec3(1., .9, .7), .4) * ring * (.45 + .9 * swirl) * dop * (1.2 * uGlow);
    // arco superior de luz curvada por detrás del agujero
    c += uC * exp(-pow((length(r * vec2(1., .55) + vec2(0., .06)) - R0 * .98) / .05, 2.)) * .5 * dop * uGlow;
    c *= smoothstep(.2, .33, rl);                                          // horizonte de sucesos
  } else if (th == 2) {
    // ===== DOMINIO MALDITO: niebla roja, luna enorme, ceniza y ruinas =====
    vec2 q = p * 1.2 + push; vec2 w = vec2(fbm(q + t * .12), fbm(q + 4. - t * .1));
    float n = fbm(q + 2.6 * w + vec2(t * .06, 0.));
    c = mix(uA, uB, smoothstep(.2, .8, n)) * .75;
    vec2 mc = vec2(.3, .24); float md = length(p - mc);
    float moon = smoothstep(.13, .122, md) * (.8 + .25 * fbm((p - mc) * 9.));
    c += uC * exp(-md * md * 9.) * .4 * uGlow + mix(uC, vec3(1.), .35) * moon * .95;
    c *= 1. - .55 * smoothstep(.5, .1, uv.y) * 0.;
    float ridge = -.33 + .05 * sin(p.x * 7. + 1.) + .035 * sin(p.x * 17.) + .02 * sin(p.x * 41.) + .16 * step(.8, fract(floor(p.x * 5. + 3.) * .618)) * smoothstep(.0, .07, fract(p.x * 5. + 3.) * (1. - fract(p.x * 5. + 3.)));
    c = mix(c, vec3(.01, 0., .01), smoothstep(ridge + .01, ridge - .01, p.y));
    c += uC * .2 * fbm(vec2(p.x * 2. + t * .2, p.y * 6.)) * smoothstep(-.1, -.4, p.y) * uGlow;
  } else if (th == 3) {
    // ===== NOCHE SOBRE EL MAR: luna, reflejo ondulado y relámpagos =====
    float hz = -.06; vec2 q = p * 1.3 + push * .5;
    if (p.y > hz) {
      float k = (p.y - hz);
      c = mix(uB * .45, uA * .4, smoothstep(0., .6, k));
      c += uB * .4 * fbm(vec2(q.x * 2.2 + t * .08, q.y * 4.)) * smoothstep(.0, .5, k) * .8;
      vec2 mc = vec2(-.32, .3); float md = length(p - mc);
      c += mix(uC, vec3(1.), .6) * smoothstep(.1, .09, md) * 1.1 + uC * exp(-md * md * 9.) * .5 * uGlow;
      c += vec3(.9) * st(p * 30. + 5., .93) * smoothstep(.2, .6, k) * .6;
    } else {
      float k = hz - p.y; vec2 wv = vec2(fbm(vec2(p.x * 6., k * 30. - t * .8)) - .5, 0.);
      float rx = p.x + wv.x * (.02 + k * .1) - push.x * .6;
      float col = exp(-pow((rx + .32) * (6. - k * 3.), 2.)) * smoothstep(0., .1, k) * (.5 + .5 * fbm(vec2(rx * 12., k * 40. - t * 1.2)));
      c = mix(uA * .6, uB * .7, smoothstep(0., .5, k)) * (.4 + .6 * fbm(vec2(p.x * 3. + t * .1, k * 14.)));
      c += mix(uC, vec3(1.), .5) * col * 1.4 * uGlow;
    }
    c += uC * exp(-pow((p.y - hz) / .006, 2.)) * .35;
  } else {
    // ===== CIELO DE ENERGÍA (ki): nubes con corrientes, rayos de luz y polvo =====
    vec2 q = p * 1.35 + push;
    vec2 w = vec2(fbm(q + vec2(0., t * .25)), fbm(q + vec2(5.2, 1.3) - t * .2));
    float n = fbm(q + 3.2 * w + vec2(t * .12, -t * .08)), n2 = fbm(q * 2.3 - 2. * w + t * .16);
    c = mix(uA, uB, smoothstep(.2, .75, n)) * 1.35;
    c += uC * pow(smoothstep(.5, .95, n2 * .7 + n * .45), 2.2) * .9 * uGlow;
    vec2 sp = vec2(.12 + .05 * sin(t * .35), .78); vec2 r = uv - sp; float ang = atan(r.x, -r.y);
    float ray = pow(max(0., sin(ang * 9. + t * .4 + n * 2.) * .5 + .5), 3.) * smoothstep(1.3, 0., length(r * asp)) * (.5 + .5 * vn(vec2(ang * 5., t * .2)));
    c += uC * ray * .34 * uGlow;
    // rayos de energía: relámpago ramificado entre un lado y otro
    float tb = floor(t * .35), ph = fract(t * .35);
    float bx = (h21(vec2(tb, 3.)) - .5) * 1.4, by = (h21(vec2(tb, 7.)) - .5) * .8;
    float bolt = exp(-pow((p.x - bx + (fbm(vec2(p.y * 7., tb)) - .5) * .25) / .012, 2.)) * smoothstep(-.5, .5, p.y);
    c += vec3(.8, .9, 1.) * bolt * smoothstep(.14, 0., ph) * (.9 + uGlow) * step(.45, h21(vec2(tb, 1.)));
  }
  return c;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, asp = vec2(uRes.x / uRes.y, 1.), p = (uv - .5) * asp;
  vec2 m = (uM - .5) * asp; vec2 d = p - m; float dm = length(d); float t = uT;
  vec2 push = d / (dm + .02) * exp(-dm * dm * 9.) * .11 + uMv * exp(-dm * dm * 7.) * .6;
  vec3 c = scene(uTh, uv, asp, p, m, d, dm, push, t);
  if (uMix > 0.) c = mix(c, scene(uTh2, uv, asp, p, m, d, dm, push, t), uMix * uMix * (3. - 2. * uMix));
  c += uC * exp(-dm * dm * 14.) * .38 * uGlow;                               // luz bajo el cursor
  if (uRip > 0.){ vec2 rc = (vec2(uRx, uRy) - .5) * asp; float k = abs(length(p - rc) - uRip * 1.2); c += uC * exp(-k * k * 600.) * (1. - uRip) * .8; }
  c += mix(uC, vec3(1.), .5) * uFlash * (.25 + .3 * (1. - uv.y));              // destello de golpe
  // polvo / brasas con profundidad y bokeh (parallax con el ratón)
  for (int L = 0; L < 3; L++){
    float fl = float(L), sc = 7. + fl * 6., par = .03 + .05 * fl;
    vec2 g = (uv * asp - m * par) * sc + vec2(t * (.35 + fl * .25) * .3, -t * (.5 + fl * .3) * .3 - fl * 3.1);
    vec2 id = floor(g), f = fract(g) - .5; float rnd = h21(id + fl * 17.);
    vec2 off = vec2(h21(id + 3.1), h21(id + 9.7)) - .5; float rr = length(f - off * .6);
    float sz = .06 + .1 * fl * rnd, a = smoothstep(sz, sz * .2, rr) * step(.55, rnd) * (.5 + .5 * sin(t * 2. + rnd * 40.));
    c += mix(uC, vec3(1.), .5) * a * (.5 - fl * .12) * uGlow * (uTh == 1 ? .4 : 1.);
  }
  c *= 1. + uPulse * .35 * (1. - dot(uv - .5, uv - .5) * 2.);
  float vg = smoothstep(1.05, .25, length((uv - .5) * vec2(1., 1.1)));
  c *= mix(.45, 1., vg);
  c += (h21(gl_FragCoord.xy + fract(t) * 91.) - .5) * .035;                 // grano de película
  o = vec4(max(c, 0.), 1.);
}`;
  function glInit(host, low) {
    try {
      gc = document.createElement('canvas'); gc.className = 'kbg kbg0';
      gl = gc.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('sin webgl2');
      const sh = (ty, src) => { const o = gl.createShader(ty); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      gp = gl.createProgram(); gl.attachShader(gp, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(gp, sh(gl.FRAGMENT_SHADER, FS(low ? 3 : 5)));
      gl.linkProgram(gp); if (!gl.getProgramParameter(gp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(gp));
      gl.useProgram(gp);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(gp, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gu = {}; for (const n of ['uTh', 'uTh2', 'uMix', 'uFlash', 'uRes', 'uM', 'uMv', 'uT', 'uGlow', 'uPulse', 'uRip', 'uRx', 'uRy', 'uA', 'uB', 'uC']) gu[n] = gl.getUniformLocation(gp, n);
      gc.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; });
      return true;
    } catch (e) { gc = null; gl = null; return false; }
  }
  const hsl = (h, s, l) => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
  let flashV = 0, dtGl = .016, shA = 0, mixV = 0, autoMode = false, since = 0;
  const PERIOD = 75, FADE = 7;      // segundos: cada cuánto cambia el fondo y cuánto dura el fundido
  function glDraw(now) {
    if (!gl) return;
    const sc = ls('duelo.gfx') === 'low' ? .38 : .55, w = Math.max(2, Math.round(W * sc)), hh = Math.max(2, Math.round(H * sc));
    if (gc.width !== w || gc.height !== hh) { gc.width = w; gc.height = hh; gl.viewport(0, 0, w, hh); }
    const A = cur.c1.map((v, i) => v / 255 * 2 + cur.c0[i] / 255 * .35), c0 = cur.c0.map(v => v / 255), C = hsl(cur.h, cur.s, Math.min(78, cur.l + 8)), Bc = hsl(cur.h, cur.s * .9, cur.l * .42);
    gl.uniform2f(gu.uRes, w, hh); gl.uniform2f(gu.uM, mouse.seen ? mouse.x / W : .5, mouse.seen ? 1 - mouse.y / H : .5);
    gl.uniform2f(gu.uMv, mouse.vx / W * 1.6, -mouse.vy / H * 1.6); gl.uniform1f(gu.uT, t * 1.4 + 20); gl.uniform1f(gu.uGlow, cur.glow * 1.2);
    gl.uniform1f(gu.uPulse, danger ? .5 + .5 * Math.sin(beat) : 0);
    const rp = ripples.length ? ripples[ripples.length - 1] : null, age = rp ? (now - rp.t0) / 2600 : 2;
    gl.uniform1f(gu.uRip, rp && age < 1 ? age : 0); gl.uniform1f(gu.uRx, rp ? rp.x / W : .5); gl.uniform1f(gu.uRy, rp ? 1 - rp.y / H : .5);
    gl.uniform3f(gu.uA, A[0], A[1], A[2]); gl.uniform3f(gu.uB, Bc[0] * 1.15 + c0[0] * .9, Bc[1] * 1.15 + c0[1] * .9, Bc[2] * 1.15 + c0[2] * .9); gl.uniform3f(gu.uC, C[0], C[1], C[2]);
    flashV *= Math.pow(.02, dtGl); gl.uniform1f(gu.uFlash, flashV); gl.uniform1i(gu.uTh, shA); gl.uniform1i(gu.uTh2, themeIx); gl.uniform1f(gu.uMix, mixV);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

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
    dtGl = dtms / 1000;
    tilt(f, mA);
    if (mixV > 0) { mixV += dtGl / FADE; if (mixV >= 1) { mixV = 0; shA = themeIx; } }
    else if (autoMode && gl && !rival) { since += dtGl; if (since > PERIOD) { since = 0; shA = themeIx; themeIx = (themeIx + 1) % THEMES.length; mixV = .001; retarget(); } }
    glDraw(now); draw(mA);
  }

  // el tablero se inclina en 3D siguiendo al ratón (inclinación suave y amortiguada; vuelve al centro si el ratón se queda quieto)
  let tx = 0, ty = 0, board = null;
  function tilt(f, mA) {
    if (!board || !board.isConnected) board = cv && cv.parentNode && cv.parentNode.querySelector('.board3d');
    if (!board) return;
    const nx = mA ? Math.max(-1, Math.min(1, (mouse.x / W - .5) * 2)) : 0, ny = mA ? Math.max(-1, Math.min(1, (mouse.y / H - .5) * 2)) : 0;
    const k = 1 - Math.pow(.92, f);
    tx += (nx * 7 - tx) * k; ty += (ny * 4 - ty) * k;
    board.style.setProperty('--brx', tx.toFixed(2) + 'deg'); board.style.setProperty('--bry', (-ty).toFixed(2) + 'deg');
  }

  const NB = 6;                                                          // niveles de opacidad para agrupar los trazos
  function draw(mA) {
    const hue = cur.h.toFixed(0), sat = cur.s.toFixed(0) + '%', lig = cur.l.toFixed(0) + '%';
    const g = cx.createRadialGradient(W / 2, H * .46, Math.min(W, H) * .08, W / 2, H * .5, Math.max(W, H) * .78);
    g.addColorStop(0, `rgb(${cur.c0[0] | 0},${cur.c0[1] | 0},${cur.c0[2] | 0})`); g.addColorStop(1, `rgb(${cur.c1[0] | 0},${cur.c1[1] | 0},${cur.c1[2] | 0})`);
    if (gl) cx.clearRect(0, 0, W, H); else { cx.fillStyle = g; cx.fillRect(0, 0, W, H); }
    const pulse = danger ? .5 + .5 * Math.sin(beat) : 0, base = .05 + .06 * cur.glow, mR = Math.max(150, Math.min(W, H) * .24);
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
    if (gc) { gc.remove(); gc = null; gl = null; }
    cv = null;
  }
  function retarget() { Object.assign(tgt, moodFor(danger, rival)); }

  /** Tema elegido en Ajustes: 'auto' (sorpresa: uno distinto cada partida) o 0..3. */
  const pref = () => { const v = ls('duelo.kbgtheme'); return v == null || v === 'auto' ? 'auto' : Math.max(0, Math.min(THEMES.length - 1, +v | 0)); };
  let lastAuto = -1;
  const pick = () => { const v = pref(); if (v !== 'auto') return v; let n; do n = Math.floor(Math.random() * THEMES.length); while (n === lastAuto && THEMES.length > 1); return (lastAuto = n); };

  D.BgFX = {
    THEMES, pref, _fade: () => { since = PERIOD + 1; }, setTheme: v => { lsSet('duelo.kbgtheme', String(v)); if (cv) { themeIx = pick(); shA = themeIx; mixV = 0; since = 0; autoMode = pref() === 'auto'; retarget(); Object.assign(cur, moodFor(danger, rival)); } },
    /** Destello de golpe (0..1) que se apaga solo. */
    flash(s) { flashV = Math.min(1, flashV + (s == null ? .6 : s)); },
    on,
    set: v => lsSet(KEY, v ? '1' : '0'),
    /** Monta el fondo dentro de `host` (la pantalla de partida) si no estaba ya. */
    attach(host) {
      if (!host || !on()) { if (cv) stop(); return false; }
      if (cv && cv.isConnected && cv.parentNode === host) return true;
      if (cv) stop();
      cv = document.createElement('canvas'); cv.className = 'kbg'; glInit(host, ls('duelo.gfx') === 'low'); cx = cv.getContext('2d', { alpha: !!gl });
      if (!cx) { cv = null; return false; }
      themeIx = pick(); shA = themeIx; mixV = 0; since = 0; autoMode = pref() === 'auto';
      host.insertBefore(cv, host.firstChild); if (gc) host.insertBefore(gc, cv); build();
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
    moodFor, _state: () => ({ theme: themeIx, from: shA, mix: mixV, on: !!cv, danger, rival, cur: Object.assign({}, cur), n: N, ripples: ripples.length })
  };
})();
