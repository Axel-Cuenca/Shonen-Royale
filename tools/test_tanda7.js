/* Tanda 7 (13-11-2026). Se carga desde tools/test_duelo.js. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function (T) {
  const { E, Cards, ok, eq, section, act, game } = T;
  const L = (st, p) => E.legal(st, p);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    st.players[p].mz[z] = m; return m;
  };
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = p => { const st = game({ seed: 11 }); ready(st, p || 0); for (const P of st.players) { P.hand = []; P.st = P.st.map(() => null); P.mz = P.mz.map(() => null); } return st; };
  const hand = (st, p, ids) => { st.players[p].hand = ids.map(id => ({ uid: st.nextUid++, id })); };
  const pw = (st, p, name, f) => L(st, p).find(a => a.t === 'power' && a.pw === name && (!f || f(a)));
  const ids = (st, p) => st.players[p].mz.map(m => m ? m.c.id : null);
  const cnt = st => [E.countCards(st, 0), E.countCards(st, 1)];
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const atkA = (st, p, z, tz, f) => L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz && !x.hira && (!f || f(x)));
  const battle = st => { st.phase = 'battle'; };
  const answer = (st, pick) => { let n = 0; while (st.pending && n++ < 12) { const q = E.actor(st), l = L(st, q); act(st, q, pick(st, q, l) || l.find(x => x.t === 'respond' && !x.activate) || l.find(x => x.t === 'ability' && x.use === false) || l[0]); } };
  const no = st => answer(st, () => null);
  const yes = st => answer(st, (s, q, l) => l.find(x => x.t === 'respond' && x.activate) || l.find(x => x.t === 'ability' && x.use === true));
  const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);

  section('tanda 7: catálogo');
  {
    const root = path.join(__dirname, '..');
    for (const id of Cards.inTanda(7).concat(Cards.custom.filter(c => c.hidden && Cards.tandaOf(c.id) === 7).map(c => c.id))) {
      const c = Cards.get(id);
      ok(c && c.img && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k of ['imgSung', 'imgDom', 'imgAlt']) if (c[k]) ok(fs.existsSync(path.join(root, c[k])), id + ' imagen alternativa');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k);
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': ' + a + ' tiene texto');
    }
  }

  section('Edo Tensei');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku'); st.players[0].grave = [{ uid: 900, id: 'c_kratos' }]; hand(st, 0, ['c_edo_tensei']);
    const l = L(st, 0).filter(a => a.t === 'activate' && a.target && a.target.u);
    ok(l.length === 2, 'puede revivir al del cementerio o al recién sacrificado');
    const n0 = E.countCards(st, 0);
    act(st, 0, l.find(a => a.target.u === 900));
    no(st);
    eq(ids(st, 0), ['c_kratos', null, null], 'el sacrificado se va y vuelve el del cementerio');
    ok(grave(st, 0, 'c_goku') && grave(st, 0, 'c_edo_tensei'), 'Goku y la magia en el cementerio');
    eq(E.countCards(st, 0), n0, 'sin pérdida de cartas');
    st = fresh(0); hand(st, 0, ['c_edo_tensei']); st.players[0].grave = [{ uid: 901, id: 'c_kratos' }];
    ok(!L(st, 0).some(a => a.t === 'activate'), 'sin aliado que sacrificar no se activa');
  }

  section('Ojos de Shinigami');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_kratos', { down: true, pos: 'def' }); hand(st, 0, ['c_ojos_shinigami']);
    ok(!E.view(st, 0).players[1].mz[0].c, 'antes no ve la identidad');
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 0)); no(st);
    const v0 = E.view(st, 0).players[1].mz[0], v1 = E.view(st, 1).players[1].mz[0];
    ok(v0.c && v0.c.id === 'c_kratos' && v0.peeked, 've al personaje boca abajo, en privado');
    ok(v1.c && v1.c.id === 'c_kratos' && !v1.peeked, 'el dueño lo ve normal');
    ok(st.players[1].mz[0].down, 'sigue boca abajo para el rival');
    ok(!E.view(st, 1).players[0].mz[0].c || E.view(st, 1).players[0].mz[0].c.id === 'c_goku', 'el rival no ve nada extra');
    st.players[0].mz[0] = null;
    ok(!E.view(st, 0).players[1].mz[0].c, 'al irse el portador, deja de ver');
  }
};
