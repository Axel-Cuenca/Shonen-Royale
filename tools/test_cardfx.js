/* Pruebas de js/duelo/cardfx.js (v2-visual): lista de servidores permitidos, manifiesto saneado y vuelta a la ilustración estática. */
'use strict';
module.exports = function (T) {
  const { ok, eq, section } = T;
  return function () {
    section('CardFX: animaciones externas con respaldo estático');
    const store = {};
    global.window = global; global.location = { href: 'https://axel-cuenca.github.io/Shonen-Royale/' };
    global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    global.document = { documentElement: { classList: { contains: () => false } }, addEventListener() { } };
    global.fetch = () => Promise.reject(new Error('sin red'));
    global.Image = function () { const o = this; Object.defineProperty(o, 'src', { set() { setTimeout(() => o.onerror && o.onerror(), 0); } }); };
    global.matchMedia = () => ({ matches: false });
    delete global.Duelo;
    delete require.cache[require.resolve('../js/duelo/cardfx.js')];
    require('../js/duelo/cardfx.js');
    const F = global.Duelo.CardFX;
    ok(F.allowed('https://raw.githubusercontent.com/u/r/main/a.gif'), 'GitHub raw permitido');
    ok(F.allowed('assets/anim/goku.webp'), 'ruta del propio sitio permitida');
    ok(!F.allowed('http://raw.githubusercontent.com/u/r/a.gif'), 'http rechazado');
    ok(!F.allowed('https://evil.example.com/a.gif'), 'servidor desconocido rechazado');
    ok(!F.allowed('javascript:alert(1)') && !F.allowed('data:image/gif;base64,AAAA') && !F.allowed('//evil.example.com/a.gif'), 'esquemas peligrosos y // rechazados');
    ok(!F.allowed('assets/../../x.gif') && !F.allowed(''), 'rutas con .. y vacías rechazadas');
    F.setManifest({ _ayuda: 'texto', c_goku: ['https://evil.example.com/a.gif', 'https://raw.githubusercontent.com/u/r/main/g.gif'], c_vegeta: { u: 'assets/anim/v.webp', px: true }, c_x: 'ftp://x/y.gif' });
    const m = F._manifest();
    eq(Object.keys(m).sort().join(), 'c_goku,c_vegeta', 'el manifiesto se sanea: sin _ayuda ni servidores no permitidos');
    eq(m.c_goku.length, 1, 'sólo queda la URL permitida');
    ok(m.c_vegeta[0].px === true, 'marca de pixel-art conservada');
    eq(F.animFor('c_nadie'), null, 'carta sin entrada: estática');
    eq(F.animFor('c_goku'), null, 'aún sin comprobar: estática (y arranca la comprobación)');
    F.fail('c_goku');
    eq(F.animFor('c_goku'), null, 'tras un fallo: estática');
    F.setExt(false); eq(F.animFor('c_vegeta'), null, 'con «Animaciones externas» apagado: estática'); F.setExt(true);
    ok(F.tired(2000, 8000) && !F.tired(2500, 8000) && !F.tired(0, 8000), 'cansancio por debajo del 30 % de PV (y no si ya murió)');
    delete global.Duelo; delete global.window; delete global.document; delete global.localStorage; delete global.location; delete global.fetch; delete global.matchMedia; delete global.Image;
  };
};
