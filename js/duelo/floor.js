/* ============ duelo/floor.js — el suelo de la arena en WebGL2 ============
 * Genera, una sola vez al arrancar y en la GPU, un material "PBR" de todo el terreno:
 *   mapa de color (albedo) · mapa de altura · mapa de normales · oclusión ambiental ·
 *   rugosidad · sombras del sol (relieve, muros, torres, árboles) ya horneadas.
 * Cada fotograma sólo se suman encima las luces de las antorchas (que parpadean)
 * y se anima el agua del río. Todo es procedural: no hay imágenes externas.
 *
 * Si el navegador no tiene WebGL2 (o falla el shader) `Floor.ok` queda en false y la
 * arena sigue usando las texturas CSS de scene.js.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const W = 575, H = 440;
  const R = { x: -440, y: -430, w: 1455, h: 1280 };       // zona del mundo que cubre el lienzo
  const HS = 24;                                           // altura real (px) de "1.0" del mapa de altura
  const SUN = [-0.55, -0.5, 0.68];                         // hacia dónde está el sol (x, y hacia arriba-izquierda, z)
  const WALLS = [[-34, -36, W + 68, 36, 10], [-34, H, W + 68, 40, 10], [-34, 0, 34, H, 10], [W, 0, 34, H, 10],
    [-58, -60, 52, 52, 30], [W + 6, -60, 52, 52, 30], [-58, H + 12, 52, 52, 30], [W + 6, H + 12, 52, 52, 30]];
  const TORCHES = [[-32, -34], [W + 32, -34], [-32, H + 38], [W + 32, H + 38]];   // base de cada antorcha
  const TORCH_Z = 62;

  const st = { ok: false, tried: false, canvas: null, gl: null, trees: [], q: 'auto', S: 1.4, raf: 0, t0: performance.now(), lastDraw: 0, fps: 30, slow: 0, still: false, torchK: 2.2 };

  // 27-10-2026: el modo automático ya no deja guardado «off» (dejaba el suelo sin dibujar para siempre); se limpia lo que dejó antes
  try { if (!localStorage.getItem('duelo.gfxfix')) { localStorage.setItem('duelo.gfxfix', '1'); if (localStorage.getItem('duelo.gfx') === 'off') localStorage.removeItem('duelo.gfx'); } } catch (e) { /* nada */ }
  function pref() { try { return localStorage.getItem('duelo.gfx') || 'auto'; } catch (e) { return 'auto'; } }

  // ---------------- GLSL ----------------
  const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

  const COMMON = `
precision highp float; precision highp int;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.3); a *= .5; } return s; }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float sdRBox(vec2 p, vec2 b, float r){ return sdBox(p, b - r) - r; }
const vec2 BOARD = vec2(${W}., ${H}.);
const vec3 SUNDIR = normalize(vec3(${SUN[0]}, ${SUN[1]}, ${SUN[2]}));
`;

  const BAKE1 = `#version 300 es
${COMMON}
in vec2 vUv;
uniform vec4 uR;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;

// Voronoi con distancia exacta al borde de la celda: (borde, idx, idy, distancia al centro)
vec4 voro(vec2 x, float jit){
  vec2 n = floor(x), f = fract(x), mg = vec2(0), mr = vec2(0); float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(i, j), o = .5 + jit * (h22(n + g) - .5) * 2., r = g + o - f; float d = dot(r, r);
    if (d < md){ md = d; mr = r; mg = g; }
  }
  md = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){
    vec2 g = mg + vec2(i, j), o = .5 + jit * (h22(n + g) - .5) * 2., r = g + o - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(md, n + mg, length(mr));
}

// Voronoi 1D irregular: (distancia al borde, id de celda, centro)
float cen(float j, float jit, float seed){ return j + .5 + jit * (h21(vec2(j, seed)) - .5) * 2.; }
vec3 vor1(float u, float jit, float seed){
  float i = floor(u), best = 9., ca = 0., ia = i;
  for (int k = -1; k <= 1; k++){ float j = i + float(k), c = cen(j, jit, seed); if (abs(u - c) < best){ best = abs(u - c); ca = c; ia = j; } }
  float l = (cen(ia - 1., jit, seed) + ca) * .5, r = (ca + cen(ia + 1., jit, seed)) * .5;
  return vec3(min(u - l, r - u), ia, ca);
}

// ---- losas irregulares de la arena (sillería con hiladas desiguales) ----
void flagstone(vec2 p, out vec3 col, out float h, out float crev){
  const vec2 C = vec2(84., 56.);
  vec2 q = p + (vec2(fbm(p * .016), fbm(p * .016 + 5.)) - .5) * 16.;
  vec3 vy = vor1(q.y / C.y, .30, 0.);
  float rid = vy.y;
  vec3 vx = vor1(q.x / C.x + h21(vec2(rid, 3.)) * 9.37, .36, rid * 13.7);
  float bd = min(vy.x * C.y, vx.x * C.x);
  bd += (fbm(p * .33) - .5) * 3.4 + (vn(p * 1.25) - .5) * 1.2;                      // bordes gastados y astillados
  vec2 id = vec2(vx.y, rid); float k = h21(id + 1.7), k2 = h21(id + 3.7);
  vec2 rel = vec2((q.x / C.x + h21(vec2(rid, 3.)) * 9.37 - vx.z), q.y / C.y - vy.z);
  float gap = smoothstep(.8, 3.4, bd), bevel = smoothstep(0., 7.5, bd);
  float hs = .62 + (k - .5) * .14 + dot(rel, vec2(h21(id + 9.1) - .5, h21(id + 1.3) - .5)) * .10;
  hs += (fbm(p * .045) - .5) * .10 + (fbm(p * .21) - .5) * .05 + (vn(p * .85) - .5) * .028 + (vn(p * 2.3) - .5) * .012;
  hs -= smoothstep(.70, .88, vn(p * .45 + k * 10.)) * .05;                          // picaduras
  h = mix(.07, hs, gap) - (1. - bevel) * .07 * gap;
  vec4 vc = voro(p / 170. + (vec2(fbm(p * .03), fbm(p * .03 + 3.)) - .5) * .6, .45); // grietas
  float cr = vc.x * 170. + (fbm(p * .4) - .5) * 4.0 + (vn(p * 1.4) - .5) * 1.5;
  float crack = (1. - smoothstep(.0, 1.6, cr)) * smoothstep(.57, .66, fbm(p * .021 + 9.));
  h -= crack * .36;
  vec3 pal0 = vec3(.55, .49, .40), pal1 = vec3(.50, .48, .44), pal2 = vec3(.43, .44, .44), pal3 = vec3(.58, .50, .38);
  col = mix(mix(pal0, pal1, smoothstep(0., .45, k)), mix(pal2, pal3, smoothstep(.55, 1., k)), smoothstep(.3, .7, k2));
  col *= .80 + .40 * fbm(p * .028 + id);
  col *= .92 + .16 * vn(p * .9);
  col *= 1. - .10 * smoothstep(.4, 1., vn(p * 3.1 + id));
  vec3 dirt = vec3(.20, .16, .12) * (.7 + .6 * vn(p * .7));
  col = mix(dirt, col, gap);
  col = mix(col, dirt * .7, crack);
  col *= 1. - .38 * smoothstep(.55, .82, fbm(p * .011 + 40.));                             // manchas grandes
  col = mix(col, col * 1.18 + .02, .35 * smoothstep(.6, .85, fbm(p * .017 + 70.)));         // zonas desgastadas
  float moss = smoothstep(.5, .76, fbm(p * .05 + 20.)) * (1. - smoothstep(0., 8., bd));
  moss += .5 * smoothstep(.64, .82, fbm(p * .03 + 60.)) * (1. - bevel * .6);
  col = mix(col, vec3(.16, .27, .07) * (.75 + .5 * vn(p * 1.7)), clamp(moss, 0., 1.) * .85);
  crev = 1. - gap * (1. - crack);
}

// ---- adoquines del borde ----
void cobble(vec2 p, out vec3 col, out float h, out float crev){
  const float C = 31.;
  vec2 q = p / C + (vec2(fbm(p * .05), fbm(p * .05 + 8.)) - .5) * .25;
  vec4 v = voro(q, .30);
  float bd = v.x * C + (fbm(p * .4) - .5) * 2.2;
  vec2 id = v.yz; float k = h21(id), k2 = h21(id + 5.3);
  float gap = smoothstep(0., 1.5, bd), dome = sqrt(clamp(bd / 9., 0., 1.));
  h = mix(.05, .38 + dome * .22 + (k - .5) * .10, gap) + (fbm(p * .3) - .5) * .05;
  vec3 a = vec3(.40, .38, .34), b = vec3(.31, .31, .31), c = vec3(.45, .37, .28);
  col = mix(mix(a, b, k), c, smoothstep(.6, 1., k2) * .7);
  col *= .78 + .44 * fbm(p * .09 + id) ; col *= .9 + .2 * vn(p * 1.3);
  col = mix(vec3(.15, .12, .08), col, gap);
  float moss = smoothstep(.5, .75, fbm(p * .06 + 31.)) * (1. - smoothstep(0., 6., bd));
  col = mix(col, vec3(.17, .29, .07), moss * .8);
  crev = 1. - gap;
}

void grass(vec2 p, out vec3 col, out float h){
  float a = fbm(p * .018), b = fbm(p * .05 + 11.);
  vec3 g0 = vec3(.13, .29, .07), g1 = vec3(.20, .38, .10), g2 = vec3(.31, .46, .13);
  col = mix(mix(g0, g1, smoothstep(.3, .6, a)), g2, smoothstep(.55, .8, b));
  col = mix(col, vec3(.42, .40, .18), smoothstep(.62, .78, fbm(p * .013 + 90.)) * .8);     // zonas secas
  float bl = vn(vec2(p.x * 1.7, p.y * .55)) * .6 + vn(vec2(p.x * 3.9 + 3., p.y * 1.1)) * .4;
  col *= .72 + .6 * bl;
  col *= .92 + .16 * vn(p * .15);
  vec2 cell = floor(p / 15.); vec2 o = h22(cell) * 15. + cell * 15.;
  float fl = step(.965, h21(cell + 4.)) * smoothstep(2.4, 1.1, length(p - o));             // florecillas
  vec3 fc = h21(cell + 9.) < .5 ? vec3(.95, .92, .80) : vec3(.95, .78, .25);
  col = mix(col, fc, fl);
  h = .42 + (fbm(p * .13) - .5) * .20 + (bl - .5) * .10;
}

void main(){
  vec2 p = uR.xy + vec2(vUv.x, 1. - vUv.y) * uR.zw, c = BOARD * .5;
  float dFlag = sdBox(p - c, BOARD * .5 + vec2(48.));
  float warp = (fbm(p * .012) - .5) * 46. + (fbm(p * .06) - .5) * 8.;
  float dApron = sdRBox(p - c, BOARD * .5 + vec2(150.), 64.) + warp;
  float dRiv = min(sdRBox(p - vec2(-292., 370.), vec2(48., 700.), 48.), sdRBox(p - vec2(285., -282.), vec2(625., 48.), 48.));
  dRiv += (fbm(p * .02 + 2.) - .5) * 16.;

  vec3 col; float h, crev = 0., mat = 0.;
  if (dFlag < 0.) { flagstone(p, col, h, crev); mat = 1.; }
  else {
    vec3 gc; float gh; grass(p, gc, gh);
    // tierra y gravilla en la frontera
    vec4 pv = voro(p / 9., .45);
    float peb = smoothstep(.0, 1.4, pv.x * 9.);
    vec3 dirt = mix(vec3(.30, .22, .13), vec3(.43, .36, .27), h21(pv.yz)) * (.8 + .4 * fbm(p * .2));
    vec3 dcol = mix(dirt * .55, dirt, peb); float dh = .30 + peb * .22 * h21(pv.yz + 1.);
    if (dApron < 0.) { cobble(p, col, h, crev); mat = 2.; }
    else {
      float t = smoothstep(14. + (fbm(p * .08) - .5) * 20., 34., dApron);
      col = mix(dcol, gc, t); h = mix(dh, gh, t); mat = 0.;
      crev = (1. - t) * (1. - peb);
    }
    // orilla del río y agua
    float bank = 1. - smoothstep(0., 22., dRiv);
    if (dRiv < 26.) {
      vec3 rc = mix(dcol * .9, vec3(.34, .31, .27) * (.7 + .6 * h21(pv.yz + 6.)), peb);
      float rh = .28 + peb * .24 * h21(pv.yz + 3.);
      float tb = smoothstep(20., 4., dRiv);
      col = mix(col, rc, tb); h = mix(h, rh, tb); mat = tb > .5 ? 4. : mat;
    }
    if (dRiv < 0.) {
      float depth = clamp(-dRiv / 30., 0., 1.);
      col = mix(vec3(.16, .40, .40), vec3(.03, .17, .24), depth);
      col = mix(col, vec3(.20, .36, .28), (1. - depth) * .5 * fbm(p * .15));
      h = .12 + (1. - depth) * .05; mat = 3.; crev = 0.;
    }
  }
  oA = vec4(col, mat / 8.);
  float hh = clamp(h, 0., .999), hi = floor(hh * 255.) / 255.;
  oB = vec4(hi, fract(hh * 255.), clamp(crev, 0., 1.), 1.);
}`;

  const BAKE2 = `#version 300 es
${COMMON}
in vec2 vUv;
uniform sampler2D uA, uB;
uniform vec4 uR;
uniform vec2 uSize;
uniform vec4 uTrees[${'__NT__'}];     // x, y (base), tamaño, tipo (0 árbol, 1 roca)
uniform vec4 uWalls[8];               // x, y, w, h
uniform float uWallH[8];
layout(location = 0) out vec4 oN;
layout(location = 1) out vec4 oL;

float Hh(ivec2 i){ i = clamp(i, ivec2(0), ivec2(uSize) - 1); vec4 b = texelFetch(uB, i, 0); return b.r + b.g / 255.; }

void main(){
  ivec2 i = ivec2(gl_FragCoord.xy);
  vec2 p = uR.xy + vec2(vUv.x, 1. - vUv.y) * uR.zw;
  float pxw = uR.z / uSize.x;
  vec4 A = texture(uA, vUv); vec4 B = texelFetch(uB, i, 0);
  float mat = floor(A.a * 8. + .5);
  float h0 = Hh(i);
  float hl = Hh(i + ivec2(-1, 0)), hr = Hh(i + ivec2(1, 0)), hd = Hh(i + ivec2(0, -1)), hu = Hh(i + ivec2(0, 1));
  float gx = (hr - hl) / (2. * pxw), gy = -(hu - hd) / (2. * pxw);       // fila +1 = y del mundo menos
  float bump = mat == 3. ? 0.15 : 1.;
  vec3 n = normalize(vec3(-gx * ${HS}. * bump, -gy * ${HS}. * bump, 1.));
  // oclusión ambiental de cavidades
  float s = 0.;
  for (int a = 0; a < 8; a++){
    float an = float(a) * .7853982; vec2 d = vec2(cos(an), sin(an));
    s += clamp(Hh(i + ivec2(d * 3.)) - h0, 0., .4) + clamp(Hh(i + ivec2(d * 7.)) - h0, 0., .4) * .7;
  }
  float ao = exp(-s * .38);
  // contacto con los muros
  float dIn = -sdBox(p - BOARD * .5, BOARD * .5), dOut = sdBox(p - BOARD * .5, BOARD * .5 + vec2(36., 38.));
  if (dIn > 0.) ao *= .62 + .38 * smoothstep(0., 30., dIn);
  else if (dOut > 0.) ao *= .5 + .5 * smoothstep(0., 34., dOut);
  // sol: sombras del relieve
  vec3 L = SUNDIR; vec2 ld = normalize(L.xy);
  float slope = L.z / length(L.xy), sh = 1., hw = h0 * ${HS}.;
  for (int k = 1; k <= 14; k++){
    float t = float(k) * 1.6;                                       // texeles
    vec2 off = vec2(ld.x, -ld.y) * t;
    float ht = Hh(i + ivec2(off + sign(off) * .5)) * ${HS}.;
    float ray = hw + t * pxw * slope;
    sh = min(sh, clamp(1. - (ht - ray) * .5, 0., 1.));
  }
  if (mat != 3.) sh = mix(.18, 1., sh);
  // sombras de muros y torres (prismas barridos)
  for (int w = 0; w < 8; w++){
    vec4 r = uWalls[w]; vec2 sv = vec2(-L.x, -L.y) / L.z * uWallH[w];
    float m = 0.;
    for (int k = 0; k <= 6; k++){
      vec2 q = p - sv * float(k) / 6.;
      float d = sdBox(q - (r.xy + r.zw * .5), r.zw * .5);
      m = max(m, 1. - smoothstep(-1.5, 2.5, d));
    }
    sh *= 1. - .62 * m;
  }
  // árboles y rocas: sombra elíptica + sombra de contacto
  for (int t = 0; t < ${'__NT__'}; t++){
    vec4 o = uTrees[t]; float sz = o.z, hg = o.w < .5 ? sz * 1.0 : sz * .55;
    vec2 dir = normalize(vec2(-L.x, -L.y)); vec2 ctr = o.xy + dir * hg * .55;
    vec2 d = p - ctr; vec2 e = vec2(dot(d, dir) / (hg * (o.w < .5 ? .95 : .6)), dot(d, vec2(-dir.y, dir.x)) / (sz * (o.w < .5 ? .36 : .42)));
    float m = 1. - smoothstep(.55, 1.05, length(e));
    sh *= 1. - .6 * m;
    float cd = length((p - o.xy) / vec2(sz * .34, sz * .2));
    ao *= 1. - .55 * (1. - smoothstep(.4, 1.1, cd));
  }
  // ---- iluminación base (sol + cielo) ----
  vec3 alb = pow(A.rgb, vec3(2.2));
  float ndl = max(dot(n, L), 0.);
  vec3 sunC = vec3(1.0, .78, .52) * 1.45;
  vec3 amb = mix(vec3(.07, .075, .065), vec3(.14, .19, .31), n.z * .5 + .5);
  float rough = mat == 3. ? .06 : mix(.88, .55, B.b * 0.) ;
  if (mat == 1. || mat == 2.) rough = .9 - .25 * smoothstep(.55, 1., h0) * (1. - B.b);          // las losas altas pulidas por el uso
  if (mat == 0.) rough = .97;
  vec3 V = normalize(vec3(0., .64, .77)), Hv = normalize(L + V);
  float a2 = pow(rough, 4.), nh = max(dot(n, Hv), 0.), dd = nh * nh * (a2 - 1.) + 1.;
  float D = a2 / (3.14159 * dd * dd);
  vec3 spec = sunC * sh * ndl * D * .035;
  vec3 lit = alb * (sunC * ndl * sh + amb * ao * 2.2) + spec;
  oN = vec4(n.xy * .5 + .5, ao, rough);
  oL = vec4(sqrt(clamp(lit / 4., 0., 1.)), 1.);
}`;

  const FINAL = `#version 300 es
${COMMON}
in vec2 vUv;
uniform sampler2D uA, uN, uL;
uniform vec4 uR;
uniform float uT;
uniform vec4 uTorch[4];        // x, y, z, intensidad
uniform float uRev;            // aparición de la cinemática de entrada (≥ 1.25: ya visible)
out vec4 oC;

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

void main(){
  vec2 p = uR.xy + vec2(vUv.x, 1. - vUv.y) * uR.zw;
  vec4 A = texture(uA, vUv), N = texture(uN, vUv), Ld = texture(uL, vUv);
  vec3 lit = Ld.rgb * Ld.rgb * 4.;
  vec3 alb = pow(A.rgb, vec3(2.2));
  vec3 n = vec3(N.xy * 2. - 1., 0.); n.z = sqrt(max(0., 1. - dot(n.xy, n.xy)));
  float ao = N.b, rough = N.a, mat = floor(A.a * 8. + .5);
  vec3 V = normalize(vec3(0., .64, .77));
  bool water = mat == 3.;
  if (water) {
    vec2 w1 = p * .035 + vec2(uT * .05, uT * .03), w2 = p * .09 - vec2(uT * .04, -uT * .06), w3 = p * .22 + vec2(uT * .09, uT * .02);
    float e = .6;
    vec2 g = vec2(vn(w1 + vec2(e, 0.)) - vn(w1 - vec2(e, 0.)), vn(w1 + vec2(0., e)) - vn(w1 - vec2(0., e)))
           + .6 * vec2(vn(w2 + vec2(e, 0.)) - vn(w2 - vec2(e, 0.)), vn(w2 + vec2(0., e)) - vn(w2 - vec2(0., e)))
           + .35 * vec2(vn(w3 + vec2(e, 0.)) - vn(w3 - vec2(e, 0.)), vn(w3 + vec2(0., e)) - vn(w3 - vec2(0., e)));
    n = normalize(vec3(-g * .55, 1.));
    float fr = pow(1. - max(dot(n, V), 0.), 4.) * .85 + .06;
    vec3 sky = vec3(.30, .45, .62);
    vec3 Hs = normalize(SUNDIR + V);
    float sp = pow(max(dot(n, Hs), 0.), 160.);
    float foam = smoothstep(.62, .78, vn(p * .3 + vec2(uT * .1, 0.))) * smoothstep(.5, 0., A.r) * 0.;
    lit = mix(lit * 1.05, sky * .8, fr) + vec3(1., .85, .6) * sp * 2.2;
  }
  // ---- antorchas ----
  vec3 add = vec3(0.);
  for (int i = 0; i < 4; i++){
    vec3 lp = uTorch[i].xyz; float I = uTorch[i].w;
    vec3 d = lp - vec3(p, 0.); float dist = length(d); vec3 l = d / dist;
    float att = 1. / (1. + pow(dist / 135., 2.)) * smoothstep(520., 200., dist);
    float ndl = max(dot(n, l), 0.);
    vec3 Hh2 = normalize(l + V);
    float a2 = pow(max(rough, .05), 4.), nh = max(dot(n, Hh2), 0.), dd = nh * nh * (a2 - 1.) + 1.;
    float sp = water ? pow(nh, 220.) * 1.4 : a2 / (3.14159 * dd * dd) * .03;
    add += vec3(1., .52, .20) * I * att * (water ? vec3(0.) : alb * ndl * ao * 4.6) + vec3(1., .62, .30) * I * att * sp * ndl * 4.;
  }
  vec3 col = (lit + add) * .95;
  col = aces(col);
  col = pow(col, vec3(1. / 2.2));
  // calidez general y viñeta suave
  col = mix(col, col * vec3(1.05, 1.0, .93), .5);
  // ---- aparición: el terreno se forma desde el centro en espiral, con ruido y un frente incandescente ----
  if (uRev < 1.25) {
    vec2 q = (p - vec2(287., 215.)) * vec2(1., 1.18);
    float dn = length(q) / 980. + (atan(q.y, q.x) / 6.2832 + .5) * .07;
    float nz = vn(p * .011) * .55 + vn(p * .035 + 7.) * .3 + vn(p * .11) * .15;
    float m = uRev * 1.3 - (dn + (nz - .5) * .3), bw = .05;
    if (m < 0.) { float hh = -m / .05; float ha = hh < 1.4 ? (1. - hh / 1.4) * .22 : 0.; oC = vec4(vec3(1., .62, .22) * ha, ha); return; }
    if (m < bw) { float k = m / bw; vec3 em = k < .4 ? mix(vec3(1., .95, .7), vec3(1., .7, .25), k / .4) : mix(vec3(1., .7, .25), vec3(1., .38, .08), (k - .4) / .6); oC = vec4(em, 1.); return; }
    col += vec3(1., .5, .16) * (1. - smoothstep(bw, bw + .09, m)) * .55;
  }
  vec2 e = min(p - uR.xy, uR.xy + uR.zw - p);
  float a = smoothstep(0., 150., min(e.x, e.y));
  oC = vec4(col * a, a);
}`;

  // ---------------- utilidades GL ----------------
  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, inf.name); }
    return { p, u };
  }
  function tex(gl, w, h, filter) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(gl, texs) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incompleto');
    return f;
  }

  /** Intensidad del parpadeo de la antorcha i en el instante t (s). Compartida con la llama dibujada. */
  function flicker(i, t) {
    const a = Math.sin(t * 7.3 + i * 2.1) * .5 + Math.sin(t * 12.7 + i * 5.3) * .3 + Math.sin(t * 3.1 + i) * .2;
    const n = Math.sin(t * 31 + i * 9.7) * Math.sin(t * 17.3 + i * 1.9);
    return 1 + a * .13 + n * .07;
  }

  /** Calidad máxima según el equipo (el suelo se calcula en la tarjeta gráfica: en equipos justos congela el navegador). */
  function maxScale() {
    if (st.q === 'low') return 0.7;
    if (st.q === 'mid') return 1.0;
    if (st.q === 'high') return 1.8;
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    return cores >= 8 && mem >= 8 ? 1.4 : cores >= 4 ? 1.0 : 0.75;
  }
  /** Prueba a poca resolución cuánto tarda la tarjeta; sólo sube la resolución si va sobrada. */
  function init(trees) {
    if (st.tried) return st.ok;
    st.tried = true;
    st.trees = trees || [];
    st.q = pref();
    if (st.q === 'off') return false;
    if (!make(0.5)) return false;
    const ms = st.bakeMs, top = maxScale();
    if (ms > 1500 && st.q !== 'high' && st.q !== 'mid') {            // ni a un cuarto de resolución va bien: sin suelo 3D (queda el suelo sencillo)
      try { const x = st.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* nada */ }
      st.ok = false; st.canvas = null; st.gl = null;
      return false;
    }
    // elegido a mano (bajos/medios/altos): se respeta tal cual; en automático, a ~0,5 s de preparación como mucho
    const want = st.q === 'auto' ? Math.min(top, 0.5 * Math.sqrt(500 / Math.max(ms, 1))) : top;
    if (want > 0.62) {
      const keep = { gl: st.gl, canvas: st.canvas, S: st.S, draw: st.draw };
      if (make(want)) { try { const x = keep.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* nada */ } }
      else { st.gl = keep.gl; st.canvas = keep.canvas; st.S = keep.S; st.draw = keep.draw; st.ok = true; }
    }
    return st.ok;
  }
  function make(S) {
    st.ok = false;
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) return false;
      const mx = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      while (R.w * S > mx || R.h * S > mx) S *= .85;
      const TW = Math.round(R.w * S), TH = Math.round(R.h * S);
      cv.width = TW; cv.height = TH; cv.className = 'floorgl';
      cv.style.cssText = `left:${R.x}px;top:${R.y}px;width:${R.w}px;height:${R.h}px`;

      const pA = program(gl, BAKE1);
      const NT = Math.max(1, st.trees.length);
      const pB = program(gl, BAKE2.split('__NT__').join(String(NT)));
      const pF = program(gl, FINAL);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const tA = tex(gl, TW, TH, gl.LINEAR), tB = tex(gl, TW, TH, gl.NEAREST), tN = tex(gl, TW, TH, gl.LINEAR), tL = tex(gl, TW, TH, gl.LINEAR);
      const f1 = fbo(gl, [tA, tB]), f2 = fbo(gl, [tN, tL]);
      const rect = [R.x, R.y, R.w, R.h];

      const tBake = performance.now();
      gl.disable(gl.BLEND); gl.viewport(0, 0, TW, TH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f1); gl.useProgram(pA.p); gl.uniform4fv(pA.u.uR, rect); gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, f2); gl.useProgram(pB.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tA); gl.uniform1i(pB.u.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tB); gl.uniform1i(pB.u.uB, 1);
      gl.uniform4fv(pB.u.uR, rect); gl.uniform2f(pB.u.uSize, TW, TH);
      const tr = new Float32Array(NT * 4); st.trees.forEach((o, i) => tr.set([o[0], o[1], o[2], o[3] || 0], i * 4));
      gl.uniform4fv(pB.u.uTrees, tr);
      gl.uniform4fv(pB.u.uWalls, new Float32Array(WALLS.flatMap(w => [w[0], w[1], w[2], w[3]])));
      gl.uniform1fv(pB.u.uWallH, new Float32Array(WALLS.map(w => w[4])));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.deleteTexture(tB);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); st.bakeMs = performance.now() - tBake;   // leer un píxel obliga a esperar a la tarjeta

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tN);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tL);
      gl.useProgram(pF.p); gl.uniform1i(pF.u.uA, 0); gl.uniform1i(pF.u.uN, 1); gl.uniform1i(pF.u.uL, 2); gl.uniform4fv(pF.u.uR, rect);
      gl.clearColor(0, 0, 0, 0);
      st.draw = function (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, TW, TH);
        gl.useProgram(pF.p); gl.uniform1f(pF.u.uT, t);
        gl.uniform1f(pF.u.uRev, revValue());
        const tt = new Float32Array(16);
        TORCHES.forEach((o, i) => tt.set([o[0], o[1], TORCH_Z, (st.still ? 1 : flicker(i, t)) * st.torchK], i * 4));
        gl.uniform4fv(pF.u.uTorch, tt);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      st.gl = gl; st.canvas = cv; st.S = S;
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (st.canvas !== cv) return; st.ok = false; stop(); document.documentElement.classList.remove('gl'); });
      st.draw(0);
      st.ok = true;
      return true;
    } catch (e) {
      console.warn('[Duelo.Floor] sin suelo WebGL:', e && e.message);
      st.ok = false; st.canvas = null; return false;
    }
  }

  // ---------------- aparición del terreno (cinemática de entrada) ----------------
  function revValue() {
    const r = st.rev; if (!r) return 9;
    if (!r.t0) return 0;
    const q = (performance.now() - r.t0) / r.dur;
    if (q >= 1) { st.rev = null; return 9; }
    const e = Math.max(0, q); return e * e * (3 - 2 * e) * 1.25;
  }
  /** El suelo se forma de nuevo durante `ms` milisegundos (0 = visible ya). Sin WebGL2 no hace nada. */
  function reveal(ms) { if (st.tried && !st.ok) return; st.rev = ms > 0 ? { t0: st.ok ? performance.now() : 0, dur: ms } : null; if (st.ok && st.draw) st.draw((performance.now() - st.t0) / 1000); }

  // ---------------- bucle ----------------
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function loop(now) {
    st.raf = requestAnimationFrame(loop);
    if (!st.ok || !st.canvas || !st.canvas.isConnected || document.hidden) return;
    if (document.documentElement.classList.contains('fxbg') && st.canvas.closest && st.canvas.closest('.game')) return;      // fondo nuevo: el suelo está oculto, no se calcula
    const iv = 1000 / st.fps;
    if (now - st.lastDraw < iv - 2) return;
    const gap = now - st.lastDraw; st.lastDraw = now;
    // si el equipo va justo, se baja la cadencia y, en último caso, se deja la imagen quieta
    if (gap > iv * 2.2) st.slow++; else st.slow = Math.max(0, st.slow - 1);
    if (st.slow > 24) { st.slow = 0; if (st.fps > 15) st.fps = 15; else if (st.fps > 8) st.fps = 8; else { st.still = true; } }
    st.draw((performance.now() - st.t0) / 1000);
  }
  function start() { if (!st.raf) { if (reduced()) st.still = true; st.raf = requestAnimationFrame(loop); } }
  function stop() { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; }

  /** Pone el lienzo del suelo como primera capa de `host` (el "slab" del tablero). */
  function attach(host) {
    if (!st.ok || !st.canvas) return false;
    if (st.canvas.parentNode !== host) host.prepend(st.canvas);
    if (st.rev && !st.rev.t0) st.rev.t0 = performance.now();
    document.documentElement.classList.add('gl');
    st.draw((performance.now() - st.t0) / 1000);
    start();
    return true;
  }

  D.Floor = {
    _st: st, init, attach, reveal, revealNow() { reveal(0); }, flicker, tried: () => st.tried, TORCHES, TORCH_Z, R,
    get ok() { return st.ok; },
    setQuality(q) { try { localStorage.setItem('duelo.gfx', q); } catch (e) { } },
    quality: pref,
  };
})();
