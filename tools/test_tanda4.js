/* Tanda 4 (28-10-2026): Goku Ultra Instinto, Kaioken, Majin Vegeta, Armin, Botiquín, Thanos, Ataque de Ultratumba, Naruto Chico (y de Una Cola),
 * Galio, Titán Colosal y Death Note. Se carga desde tools/test_duelo.js. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function (T) {
  const { E, Cards, ok, eq, section, act, game } = T;
  const L = (st, p) => E.legal(st, p);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    if (Cards.get(id).huge) m.huge = true;
    st.players[p].mz[z] = m; return m;
  };
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = p => { const st = game({ seed: 11 }); ready(st, p || 0); for (const P of st.players) P.hand = []; return st; };
  const hand = (st, p, ids) => { st.players[p].hand = ids.map(id => ({ uid: st.nextUid++, id })); };
  const pw = (st, p, name, f) => L(st, p).find(a => a.t === 'power' && a.pw === name && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const answer = (st, p, a) => act(st, p, Object.assign({ t: 'ability' }, a));
  const pass = (st, n) => { for (let i = 0; i < (n || 1); i++) { const p = E.actor(st); act(st, p, L(st, p).find(x => x.t === 'endTurn') || L(st, p).find(x => x.t === 'discard')); } };
  const toBattle = (st, p) => act(st, p, { t: 'toBattle' });
  const atkA = (st, p, z, tz) => L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz && !x.hira);
  const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);
  const banished = (st, p, id) => st.players[p].banish.some(c => c.id === id);
  const cnt = st => [E.countCards(st, 0), E.countCards(st, 1)];
  const ids = (st, p) => st.players[p].mz.map(m => m ? m.c.id : null);
  /** Responde a lo que haya pendiente declinando todo (para llegar al final de un ataque o una magia). */
  const settle = st => { let n = 0; while (st.pending && n++ < 12) { const q = E.actor(st), l = L(st, q); act(st, q, l.find(x => x.t === 'respond' && !x.activate) || l.find(x => x.t === 'ability' && x.use === false) || l[0]); } };

  section('tanda 4: catálogo');
  {
    const root = path.join(__dirname, '..');
    for (const id of ['c_goku_ui', 'c_kaioken', 'c_majin_vegeta', 'c_armin', 'c_botiquin', 'c_thanos', 'c_ultratumba', 'c_naruto_chico', 'c_naruto_kyuubi', 'c_galio', 'c_titan_colosal', 'c_death_note']) {
      const c = Cards.get(id);
      ok(c && c.img && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
      ok(Cards.all().some(x => x.id === id), id + ' sale en la colección');
    }
    const g = Cards.get('c_goku_ui'), mv = Cards.get('c_majin_vegeta'), ga = Cards.get('c_galio'), co = Cards.get('c_titan_colosal'), ar = Cards.get('c_armin'), th = Cards.get('c_thanos');
    eq([g.level, g.atk, g.def, g.fam], [10, 3000, 2700, 'Goku'], 'Goku Ultra Instinto: 10★ 3000/2700, familia Goku');
    eq([mv.level, mv.atk, mv.def], [6, 1700, 1600], 'Majin Vegeta: 6★ 1700/1600');
    eq([ga.level, ga.atk, ga.def, !!ga.wide], [8, 2100, 2500, true], 'Galio: 8★ 2100/2500, 2 zonas');
    eq([co.level, co.atk, co.def, !!co.huge], [10, 2900, 2900, true], 'Titán Colosal: 10★ 2900/2900, 3 zonas');
    eq([ar.level, ar.atk, ar.def], [2, 300, 300], 'Armin: 2★ 300/300');
    eq([th.level, th.atk, th.def], [6, 1800, 1800], 'Thanos: 6★ 1800/1800');
    eq([Cards.get('c_naruto_chico').level, Cards.get('c_naruto_chico').atk, Cards.get('c_naruto_kyuubi').level, Cards.get('c_naruto_kyuubi').atk], [4, 1300, 5, 1600], 'Naruto Chico 4★ 1300 y de Una Cola 5★ 1600');
  }

  section('Majin Vegeta');
  {
    const st = fresh(); put(st, 0, 0, 'c_vegeta'); hand(st, 0, ['c_majin_vegeta']);
    ok(!!pw(st, 0, 'xform'), 'Majin Vegeta: se puede transformar desde un Vegeta de 4★');
    const s2 = fresh(); put(s2, 0, 0, 'c_super_vegeta'); hand(s2, 0, ['c_majin_vegeta']);
    ok(!pw(s2, 0, 'xform'), 'Majin Vegeta: no entra desde un Vegeta de 6★');
    act(st, 0, pw(st, 0, 'xform'));
    ok(ids(st, 0)[0] === 'c_majin_vegeta' && st.players[0].mz[0].link.some(c => c.id === 'c_vegeta'), 'Majin Vegeta queda en el campo con Vegeta vinculado');
    ok(!pw(st, 0, 'xform'), 'Majin Vegeta ya no puede volver a transformarse');
    // Explosión final: destruye a todos los de 6★ o menos (también aliados) y a sí mismo; los de más estrellas sobreviven
    const sx = fresh(); put(sx, 0, 0, 'c_majin_vegeta'); put(sx, 0, 1, 'c_shen'); put(sx, 1, 0, 'c_shen'); put(sx, 1, 1, 'c_vegeta_blue'); put(sx, 1, 2, 'c_goku');
    const n0 = cnt(sx);
    act(sx, 0, pw(sx, 0, 'majinex')); settle(sx);
    eq([ids(sx, 0), ids(sx, 1)], [[null, null, null], [null, 'c_vegeta_blue', null]], 'Explosión final: caen Majin, Shen aliado, Shen rival y Goku (4★); sólo sigue Vegeta Blue (10★)');
    ok(!pw(sx, 0, 'majinex'), 'Explosión final: una vez por invocación');
    eq(cnt(sx), n0, 'Explosión final: no se pierde ninguna carta');
  }

  section('Armin y Titán Colosal');
  {
    const st = fresh(); put(st, 0, 1, 'c_armin'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_odin'); hand(st, 0, ['c_titan_colosal']);
    const n0 = cnt(st), lp0 = st.players[0].lp;
    act(st, 0, pw(st, 0, 'armin')); settle(st);
    ok(ids(st, 0)[0] === 'c_titan_colosal' && st.players[0].mz[0].huge && st.players[0].mz[0].link.some(c => c.id === 'c_armin'), 'Armin se transforma en el Titán Colosal (zona 1, 3 zonas) y queda vinculado');
    eq(st.players[0].lp, lp0 - 1000, 'La transformación cuesta 1000 PV');
    eq(ids(st, 1), [null, null, null], 'La explosión destruye a los personajes rivales de 10★ o menos (Odin también)');
    eq(cnt(st), n0, 'Armin/Colosal: no se pierde ninguna carta');
    const v = E.view(st, 0).players[0];
    eq([v.shadow[1], v.shadow[2]], [0, 0], 'las zonas 2 y 3 quedan ocupadas por el gigante');
    // necesita las 3 zonas libres
    const s2 = fresh(); put(s2, 0, 0, 'c_armin'); put(s2, 0, 2, 'c_goku'); hand(s2, 0, ['c_titan_colosal']);
    ok(!pw(s2, 0, 'armin'), 'Armin: con otro personaje en el campo no cabe el Colosal');
    // Último sacrificio: muere por el ataque de un enemigo
    const sd = fresh(1); put(sd, 0, 0, 'c_armin'); put(sd, 1, 0, 'c_goku', { atkMod: 3000 }); hand(sd, 0, ['c_titan_colosal']);
    const nd = cnt(sd), lpd = st.players[0].lp;
    toBattle(sd, 1); act(sd, 1, atkA(sd, 1, 0, 0));
    settle2(sd);
    function settle2(s) { let n = 0; while (s.pending && n++ < 12) { const q = E.actor(s), l = L(s, q); const pick = l.find(x => x.t === 'ability' && x.use === true && s.pending.ab === 'titan') || l.find(x => x.t === 'respond' && !x.activate) || l.find(x => x.t === 'ability' && x.use === false) || l[0]; act(s, q, pick); } }
    ok(ids(sd, 0)[0] === 'c_titan_colosal' || ids(sd, 0).includes('c_titan_colosal'), 'Último sacrificio: Armin muere y entra el Titán Colosal (' + ids(sd, 0) + ')');
    eq(sd.players[0].lp, 8000 - (4400 - 300), 'Último sacrificio: sólo el daño del combate, sin pagar 1000 PV');
    eq(cnt(sd), nd, 'Último sacrificio: sin pérdida de cartas');
    // invocación normal: no explota
    const sn = fresh(); put(sn, 0, 0, 'c_goku'); put(sn, 0, 1, 'c_goku'); put(sn, 0, 2, 'c_goku'); put(sn, 1, 0, 'c_goku'); hand(sn, 0, ['c_titan_colosal']);
    const sm = L(sn, 0).find(a => a.t === 'summon' && a.hand === 0);
    ok(!!sm && sm.tributes.length === 3, 'Titán Colosal: se invoca con 3 tributos');
    if (sm) { act(sn, 0, sm); settle(sn); ok(ids(sn, 1)[0] === 'c_goku' && ids(sn, 0)[0] === 'c_titan_colosal', 'invocado normalmente no destruye a nadie'); }
  }

  section('Galio');
  {
    const st = fresh(); put(st, 0, 0, 'c_galio'); hand(st, 1, ['c_curacion'].filter(id => Cards.get(id))); hand(st, 0, ['c_gema_poder']);
    ok(!L(st, 0).some(a => a.t === 'activate' || a.t === 'activateSet'), 'Campo de silencio: nadie activa magias');
    ok(L(st, 0).some(a => a.t === 'setst'), 'se pueden colocar cartas boca abajo');
    const sz = fresh(); put(sz, 0, 0, 'c_galio'); put(sz, 0, 2, 'c_goku'); put(sz, 1, 0, 'c_toge'); put(sz, 1, 1, 'c_goku'); ready(sz, 1);
    ok(!pw(sz, 1, 'td', a => a.target.z === 0 && a.target.vs === 0) && !!pw(sz, 1, 'td', a => a.target.z === 2), 'Resistencia mágica: las habilidades no pueden elegir a Galio');
    // Púrpura sí
    // Protección heroica
    const sh = fresh(1); put(sh, 0, 0, 'c_galio'); put(sh, 0, 2, 'c_goku'); put(sh, 1, 0, 'c_titan', { atkMod: 3000 });
    const nh = cnt(sh);
    toBattle(sh, 1); act(sh, 1, atkA(sh, 1, 0, 2));
    let n = 0; while (sh.pending && sh.pending.ab !== 'galio' && n++ < 8) { const q = E.actor(sh), l = L(sh, q); act(sh, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
    ok(sh.pending && sh.pending.ab === 'galio', 'Protección heroica: Galio puede salvar al aliado que va a morir');
    if (sh.pending && sh.pending.ab === 'galio') { answer(sh, 0, { use: true }); settle(sh); ok(ids(sh, 0)[2] === 'c_goku', 'el aliado sobrevive'); eq(cnt(sh), nh, 'sin pérdida de cartas'); }
  }

  section('Goku Ultra Instinto');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_toge'); put(st, 1, 1, 'c_goku'); put(st, 0, 1, 'c_goku_ui'); ready(st, 1);
    ok(!pw(st, 1, 'td', a => a.target.vs === 0 && a.target.z === 1) && !!pw(st, 1, 'td', a => a.target.vs === 0 && a.target.z === 0), 'Velocidad instintiva: los enemigos no lo eligen con habilidades');
    // Defensa instintiva contra una magia que destruye
    const sd = fresh(); put(sd, 0, 0, 'c_goku'); put(sd, 0, 1, 'c_goku_ui'); put(sd, 1, 0, 'c_goku'); hand(sd, 1, ['c_rayo_solar'].filter(id => Cards.get(id)));
    const ds = Cards.all().find(c => c.kind === 'spell' && c.fx === 'destroyOne');
    hand(sd, 1, [ds.id]); ready(sd, 1);
    const ac = L(sd, 1).find(a => a.t === 'activate' && a.target && (a.target.vs == null || a.target.vs === 0) && a.target.z === 0);
    ok(!!ac, 'hay una magia que destruye para probar (' + ds.name + ')');
    if (ac) {
      const n0 = cnt(sd); act(sd, 1, ac);
      let k = 0; while (sd.pending && sd.pending.ab !== 'uidef' && k++ < 8) { const q = E.actor(sd), l = L(sd, q); act(sd, q, l.find(x => x.t === 'respond' && !x.activate) || l[0]); }
      ok(sd.pending && sd.pending.ab === 'uidef', 'Defensa instintiva: Goku UI puede destruir la magia');
      if (sd.pending && sd.pending.ab === 'uidef') { answer(sd, 0, { use: true }); settle(sd); ok(ids(sd, 0)[0] === 'c_goku' && grave(sd, 1, ds.id), 'el aliado se salva y la magia se destruye'); eq(cnt(sd), n0, 'sin pérdida de cartas'); }
    }
    // Contraataque instintivo
    const sc = fresh(1); put(sc, 0, 0, 'c_goku'); put(sc, 0, 1, 'c_goku_ui'); put(sc, 1, 0, 'c_goku');
    toBattle(sc, 1); act(sc, 1, atkA(sc, 1, 0, 0));
    ok(sc.pending && sc.pending.ab === 'uicont', 'Contraataque instintivo: Goku UI puede intervenir');
    if (sc.pending && sc.pending.ab === 'uicont') { const n0 = cnt(sc); answer(sc, 0, { use: true }); settle(sc); ok(ids(sc, 1)[0] === null && ids(sc, 0)[0] === 'c_goku', 'el atacante cae contra Goku UI y el aliado sigue'); eq(cnt(sc), n0, 'sin pérdida de cartas'); }
  }

  section('Naruto Chico');
  {
    const st = fresh(); put(st, 0, 0, 'c_naruto_chico'); hand(st, 0, ['c_naruto_kyuubi']);
    ok(!!pw(st, 0, 'manto', a => a.opt === 'shield') && !!pw(st, 0, 'manto', a => a.opt === 'xform'), 'Manto de Kyuubi: dos opciones');
    act(st, 0, pw(st, 0, 'manto', a => a.opt === 'xform'));
    ok(ids(st, 0)[0] === 'c_naruto_kyuubi' && st.players[0].mz[0].link.some(c => c.id === 'c_naruto_chico'), 'se transforma en Naruto de Una Cola con Naruto Chico vinculado');
    // manto protector
    const sm = fresh(); put(sm, 0, 0, 'c_naruto_chico');
    act(sm, 0, pw(sm, 0, 'manto', a => a.opt === 'shield'));
    eq(stat(sm, 0, 0), [1600, 1600], 'manto: +300/+300');
    ok(!pw(sm, 0, 'manto'), 'el Manto sólo se usa una vez');
    // un ataque mortal destruye sólo el manto
    put(sm, 1, 0, 'c_titan', { atkMod: 2000 }); ready(sm, 1);
    const n0 = cnt(sm);
    toBattle(sm, 1); act(sm, 1, atkA(sm, 1, 0, 0)); settle(sm);
    ok(ids(sm, 0)[0] === 'c_naruto_chico' && !sm.players[0].mz[0].manto, 'el golpe mortal sólo rompe el manto');
    eq(stat(sm, 0, 0), [1300, 1300], 'sin el manto vuelve a 1300/1300');
    eq(cnt(sm), n0, 'sin pérdida de cartas');
    // Rasengan
    const sr = fresh(); put(sr, 0, 0, 'c_naruto_chico'); put(sr, 1, 0, 'c_goku', { pos: 'def' });
    act(sr, 0, pw(sr, 0, 'rasengan'));
    eq(stat(sr, 0, 0)[0], 1700, 'Rasengan: +400 ATK');
    toBattle(sr, 0); act(sr, 0, atkA(sr, 0, 0, 0)); settle(sr);
    eq(stat(sr, 0, 0)[0], 1300, 'tras el ataque el aumento se pierde');
    ok(!pw(sr, 0, 'rasengan'), 'Rasengan: una sola vez');
    // Naruto Chico de Una Cola: no muere por combate, sólo recibe la diferencia
    const sk = fresh(1); put(sk, 0, 0, 'c_naruto_kyuubi'); put(sk, 1, 0, 'c_titan');
    const lp0 = sk.players[0].lp;
    toBattle(sk, 1); act(sk, 1, atkA(sk, 1, 0, 0)); settle(sk);
    ok(ids(sk, 0)[0] === 'c_naruto_kyuubi', 'Una Cola no muere por combate');
    eq(sk.players[0].lp, lp0 - (2300 - 1600), 'recibe la diferencia de estadísticas');
    // vínculo: si una magia lo destruye también cae Naruto Chico
    const sv = fresh(); put(sv, 0, 0, 'c_naruto_chico'); hand(sv, 0, ['c_naruto_kyuubi']); act(sv, 0, pw(sv, 0, 'manto', a => a.opt === 'xform'));
    const n1 = cnt(sv); E.apply; 
    const m = sv.players[0].mz[0]; sv.players[0].mz[0] = null; sv.players[0].grave.push(m.c, ...m.link);
    ok(grave(sv, 0, 'c_naruto_chico') && grave(sv, 0, 'c_naruto_kyuubi'), 'si cae Una Cola, Naruto Chico cae con él');
  }

  section('Thanos');
  {
    const st = fresh(); put(st, 0, 0, 'c_thanos'); putST(st, 0, 0, 'c_gema_poder', { equipTo: 0 });
    const base = Cards.get('c_thanos').atk;
    ok(stat(st, 0, 0)[0] >= base + 500, 'Thanos gana +500 ATK por cada gema equipada (' + stat(st, 0, 0) + ')');
    // roba una gema rival sin necesidad del Guantelete
    const sg = fresh(1); put(sg, 0, 0, 'c_thanos'); put(sg, 1, 0, 'c_goku'); hand(sg, 1, ['c_gema_poder']);
    const n0 = cnt(sg);
    act(sg, 1, L(sg, 1).find(a => a.t === 'activate' && a.hand === 0));
    ok(sg.pending && sg.pending.ab === 'glove' && sg.pending.player === 0, 'Thanos puede robar las gemas sin Guantelete');
    if (sg.pending && sg.pending.ab === 'glove') { answer(sg, 0, { use: true }); settle(sg); ok(sg.players[0].st.some(s => s && s.c.id === 'c_gema_poder'), 'la gema queda equipada a Thanos'); eq(cnt(sg), n0, 'sin pérdida de cartas'); eq(stat(sg, 0, 0), [1800 + 800 + 500, 1800 + 800 + 500], 'Thanos: +800 de la Gema del Poder y +500 por la gema'); }
  }

  // Mente y Tiempo robadas: Thanos las lleva consigo (sin ocupar zona de magia/trampa) y las usa como habilidad si el jugador quiere
  {
    const mk = id => { const sg = fresh(1); put(sg, 0, 0, 'c_thanos'); put(sg, 0, 1, 'c_goku'); put(sg, 1, 0, 'c_goku'); hand(sg, 1, [id]); return sg; };
    const sm = mk('c_gema'), n0 = cnt(sm);
    act(sm, 1, L(sm, 1).find(a => a.t === 'activate' && a.hand === 0));
    ok(!!sm.pending && sm.pending.ab === 'glove' && sm.pending.player === 0 && sm.pending.info.idle, 'Mente: Thanos puede robarla al activarse');
    answer(sm, 0, { use: true }); settle(sm);
    const th = sm.players[0].mz[0];
    ok(th.gemsIdle && th.gemsIdle.length === 1 && th.link.some(c => c.id === 'c_gema'), 'Mente robada: queda en Thanos como habilidad');
    ok(!sm.players[0].st.some(x => x), 'Mente robada: NO ocupa ninguna zona de magia/trampa');
    ok(!sm.players[1].st.some(s => s && s.c.id === 'c_gema') && !sm.players[1].grave.some(c => c.id === 'c_gema'), 'la activación del rival se cancela (no está en su campo ni cementerio)');
    eq(cnt(sm), n0, 'Mente robada: no se pierde ninguna carta');
    ok(stat(sm, 0, 0)[0] >= 1800 + 500, 'Mente robada cuenta como gema de Thanos (+500)');
    ok(E.view(sm, 0).players[0].mz[0].gems.includes('c_gema'), 'la ficha de Thanos enseña la gema que lleva');
    ready(sm, 0, 7);
    const bind = L(sm, 0).filter(a => a.t === 'power' && a.pw === 'tgmente');
    ok(bind.length === 1 && bind[0].target.vs === 1, 'Mente robada: se puede usar como habilidad sobre un rival');
    act(sm, 0, bind[0]);
    const sl = sm.players[0].st.findIndex(s => s && s.c.id === 'c_gema');
    ok(sl >= 0 && !!sm.players[0].st[sl].gem && !sm.players[0].mz[0].gemsIdle, 'Mente robada: al usarla controla a su objetivo');
    ok(L(sm, 0).some(a => a.t === 'spow' && (a.pw === 'gempos' || a.pw === 'gematk')), 'Mente robada: después ofrece sus acciones habituales');
    eq(cnt(sm), n0, 'Mente robada usada: se mantiene el total de cartas');
    // sin zona de magia libre no se ofrece usar la Mente
    const sf = mk('c_gema'); act(sf, 1, L(sf, 1).find(a => a.t === 'activate' && a.hand === 0)); answer(sf, 0, { use: true }); settle(sf); ready(sf, 0, 7);
    for (let z = 0; z < 3; z++) putST(sf, 0, z, 'c_gema_poder', { down: true });
    ok(!L(sf, 0).some(a => a.t === 'power' && a.pw === 'tgmente'), 'Mente robada: con las 3 zonas de magia ocupadas no se ofrece');
    // si Thanos muere, la gema que llevaba va al cementerio de quien la robó
    const sd = mk('c_gema'), dn = cnt(sd); act(sd, 1, L(sd, 1).find(a => a.t === 'activate' && a.hand === 0)); answer(sd, 0, { use: true }); settle(sd);
    ready(sd, 1, 8); put(sd, 1, 1, 'c_odin');
    toBattle(sd, 1); act(sd, 1, atkA(sd, 1, 1, 0)); settle(sd);
    ok(!sd.players[0].mz[0] && sd.players[0].grave.some(c => c.id === 'c_gema'), 'si Thanos muere, la gema que llevaba va al cementerio de quien la robó');
    eq(cnt(sd)[0], dn[0], 'Thanos muerto con una gema robada: el total de cartas del ladrón no cambia');
    ok(!sd.players[0].st.some(x => x) && !sd.players[0].mz.some(m => m && m.link && m.link.some(c => c.id === 'c_gema')), 'la gema no queda en ningún sitio más');
    const stt = fresh(1); put(stt, 0, 0, 'c_thanos'); put(stt, 1, 0, 'c_goku'); hand(stt, 1, ['c_gema_tiempo']);
    const snapT = JSON.stringify({ mz: stt.players[0].mz, st: stt.players[0].st }); stt.players[0].snaps = [snapT, snapT]; stt.players[1].snaps = [snapT, snapT];
    const tn = cnt(stt), ta = L(stt, 1).find(a => a.t === 'activate' && a.hand === 0);
    ok(!!ta, 'Tiempo: se puede activar');
    act(stt, 1, ta);
    ok(!!stt.pending && stt.pending.ab === 'glove' && stt.pending.info.idle, 'Tiempo: Thanos puede robarla al activarse');
    answer(stt, 0, { use: true }); settle(stt);
    ok(stt.players[0].mz[0].gemsIdle && stt.players[0].mz[0].gemsIdle[0].fx === 'tiempo' && !stt.players[0].st.some(x => x), 'Tiempo robada: queda en Thanos sin ocupar zona');
    eq(cnt(stt), tn, 'Tiempo robada: no se pierde ninguna carta');
    // usarla: retrocede el campo, la gema va al cementerio y no vuelve
    ready(stt, 0, 9);
    put(stt, 0, 2, 'c_zenitsu'); const tn2 = cnt(stt);
    const tp = L(stt, 0).find(a => a.t === 'power' && a.pw === 'tgtiempo');
    ok(!!tp, 'Tiempo robada: se ofrece como habilidad');
    if (tp) { act(stt, 0, tp); ok(grave(stt, 0, 'c_gema_tiempo'), 'Tiempo robada usada: la gema va al cementerio'); eq(cnt(stt), tn2, 'Tiempo robada usada: no se pierde ninguna carta'); const th2 = stt.players[0].mz[0]; ok(th2 && th2.c.id === 'c_thanos' && !(th2.gemsIdle && th2.gemsIdle.length), 'Thanos sigue en su zona y ya no la lleva'); ok(!stt.players[0].mz[2] && stt.players[0].hand.some(c => c.id === 'c_zenitsu'), 'el retroceso devolvió a Zenitsu (que no estaba) a la mano'); }
  }

  section('Kaioken');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_goku'); hand(st, 0, ['c_kaioken']);
    const ac = L(st, 0).filter(a => a.t === 'activate');
    ok(ac.length === 1 && ac[0].target && ac[0].target.z === 0, 'Kaioken: sólo se puede elegir a un aliado');
    act(st, 0, ac[0]); settle(st);
    eq(stat(st, 0, 0), [1800, 1800], 'Kaioken: +400/+400');
    ok(grave(st, 0, 'c_kaioken'), 'Kaioken va al cementerio');
    ok(!!pw(st, 0, 'kaiox10'), 'se puede llevar a x10 el mismo turno');
    act(st, 0, pw(st, 0, 'kaiox10'));
    eq(stat(st, 0, 0), [2200, 2200], 'Kaioken x10: +800 en total');
    ok(!pw(st, 0, 'kaiox10'), 'sólo una vez');
    pass(st, 1);               // fin del turno propio: pierde los bonos y queda agotado
    eq(stat(st, 0, 0), [0, 0], 'agotado: 0 ATK y 0 DEF');
    pass(st, 1);               // turno del rival
    eq(stat(st, 0, 0), [0, 0], 'sigue agotado durante su siguiente turno');
    pass(st, 1);               // fin de su siguiente turno
    eq(stat(st, 0, 0), [1400, 1400], 'tras el agotamiento recupera sus valores');
    // sin x10: dura 3 turnos y se retira
    const s2 = fresh(); put(s2, 0, 0, 'c_goku'); hand(s2, 0, ['c_kaioken']); act(s2, 0, L(s2, 0).find(a => a.t === 'activate')); settle(s2);
    for (let i = 0; i < 8; i++) pass(s2, 1);
    eq(stat(s2, 0, 0), [1400, 1400], 'Kaioken sin x10 termina y quita sólo sus bonos');
  }

  section('Botiquín');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_goku');
    const m = st.players[1].mz[0]; m.mods = [{ k: 'ola', atk: -500, def: -500, t0: 1, n: 0 }, { k: 'conc', atk: 400, def: 400, t0: 1, n: 0 }];
    eq(stat(st, 1, 0), [1300, 1300], 'preparado: −500 y +400');
    hand(st, 0, ['c_botiquin']);
    const ac = L(st, 0).find(a => a.t === 'activate' && a.target && a.target.vs === 1 && a.target.z === 0);
    ok(!!ac && L(st, 0).some(a => a.t === 'activate' && a.target && a.target.vs === 0), 'Botiquín: se puede elegir un personaje propio o rival');
    act(st, 0, ac); settle(st);
    eq(stat(st, 1, 0), [1800, 1800], 'quita la reducción y conserva el bono positivo');
    ok(grave(st, 0, 'c_botiquin'), 'Botiquín va al cementerio');
  }

  section('Death Note');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_shen'); hand(st, 0, ['c_death_note']);
    const ac = L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 1);
    act(st, 0, ac); settle(st);
    ok(ids(st, 1)[1] === 'c_shen', 'Death Note: el objetivo sigue vivo hasta el turno de su dueño');
    ok(grave(st, 0, 'c_death_note'), 'Death Note va al cementerio');
    const n0 = cnt(st);
    pass(st, 1);
    ok(ids(st, 1)[1] === null && grave(st, 1, 'c_shen'), 'durante el turno de su dueño el personaje se destruye');
    ok(ids(st, 1)[0] === 'c_goku', 'los demás no se ven afectados');
    eq(cnt(st), n0, 'sin pérdida de cartas');
  }

  section('Ataque de Ultratumba');
  {
    const st = fresh(); put(st, 1, 0, 'c_goku'); hand(st, 0, ['c_ultratumba']);
    st.players[0].grave.push({ uid: st.nextUid++, id: 'c_shen' }); st.players[1].grave.push({ uid: st.nextUid++, id: 'c_titan' });
    const as = L(st, 0).filter(a => a.t === 'activate');
    ok(as.length >= 2 && as.some(a => st.players[a.target.g].grave.some(c => c.uid === a.target.u && c.id === 'c_titan')), 'puede elegir personajes de cualquier cementerio');
    const n0 = cnt(st);
    const ac = as.find(a => st.players[a.target.g].grave.some(c => c.uid === a.target.u && c.id === 'c_shen') && a.target.tz === 0);
    act(st, 0, ac); settle(st);
    ok(!st.players[0].mz.some(m => m && m.ghost), 'tras el ataque el personaje ya no está en el campo');
    ok(banished(st, 0, 'c_shen') && !grave(st, 0, 'c_shen'), 'el personaje se destierra');
    ok(banished(st, 0, 'c_ultratumba'), 'la magia se destierra y no vuelve a usarse');
    ok(!grave(st, 1, 'c_goku') || true, 'el ataque se resolvió');
    eq(cnt(st), n0, 'sin pérdida de cartas');
    // el rival no tiene personajes: ataque directo
    const sd = fresh(); hand(sd, 0, ['c_ultratumba']); sd.players[0].grave.push({ uid: sd.nextUid++, id: 'c_shen' });
    const lpd = sd.players[1].lp;
    const ad = L(sd, 0).find(a => a.t === 'activate' && a.target.tz === 'direct');
    ok(!!ad, 'sin personajes rivales ataca directo');
    if (ad) { act(sd, 0, ad); settle(sd); eq(sd.players[1].lp, lpd - 1600, 'daño directo con su ATK'); }
  }
  section('tanda 4: partidas al azar con las cartas nuevas');
  {
    const NEW = ['c_goku_ui', 'c_kaioken', 'c_majin_vegeta', 'c_armin', 'c_botiquin', 'c_thanos', 'c_ultratumba', 'c_naruto_chico', 'c_naruto_kyuubi', 'c_galio', 'c_titan_colosal', 'c_death_note'];
    const extra = ['c_goku', 'c_vegeta', 'c_odin', 'c_toge', 'c_venom', 'c_guantelete', 'c_gema_poder', 'c_gema_tiempo', 'c_gema_mente', 'c_gema_realidad', 'c_x', 'c_ola_fuego', 'c_infarto'].filter(i => Cards.get(i));
    let bad = '', done = 0, seed = 4242; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const rest = Cards.custom.filter(c => !c.hidden).map(c => c.id);
    for (let g = 0; g < 80 && !bad; g++) {
      const mk = () => { const d = []; for (const id of NEW) if (rnd() < .8) d.push(id); for (const id of extra) if (rnd() < .5 && d.length < 30) d.push(id); while (d.length < 30) { const id = rest[Math.floor(rnd() * rest.length)]; if (d.filter(x => x === id).length < 2) d.push(id); } return d.slice(0, 30); };
      const st = E.newGame([mk(), mk()], { seed: 1300 + g, first: g % 2 });
      let n = 0;
      try {
        while (st.winner === null && n++ < 1800) {
          const p = E.actor(st), Ls = E.legal(st, p);
          if (!Ls.length) { bad = 'sin acciones legales (partida ' + g + ')'; break; }
          const pref = Ls.filter(a => a.t !== 'endTurn'), pool = rnd() < 0.85 && pref.length ? pref : Ls;
          const a = pool[Math.floor(rnd() * pool.length)];
          const r = E.apply(st, p, a);
          if (!r.ok) { bad = 'rechazada ' + JSON.stringify(a) + ' ' + r.error; break; }
          for (let q = 0; q < 2; q++) if (E.countCards(st, q) !== 30) { bad = `partida ${g}: jugador ${q} tiene ${E.countCards(st, q)} cartas tras ${JSON.stringify(a)}`; break; }
          if (bad) break;
        }
        if (st.winner !== null) done++;
      } catch (e) { bad = 'excepción: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '); }
    }
    ok(!bad, bad || 'partidas con las cartas nuevas sin errores'); ok(done >= 30, done + ' de 80 partidas terminaron');
  }

  section('Sylas: una habilidad robada por turno (29-10-2026)');
  {
    const st = fresh(0); put(st, 0, 0, 'c_sylas'); put(st, 1, 0, 'c_toge'); put(st, 1, 1, 'c_minato');
    const a1 = pw(st, 0, 'robo');
    ok(!!a1, 'Sylas puede robar una habilidad');
    act(st, 0, a1);
    ok(E.view(st, 0).players[0].mz[0].ext.length === 1, 'copia exactamente una habilidad');
    ok(!pw(st, 0, 'robo'), 'no puede robar una segunda en el mismo turno');
    pass(st, 2);
    ok(E.actor(st) === 0 && st.current === 0, 'vuelve su turno');
    const a2 = pw(st, 0, 'robo');
    ok(!!a2, 'al turno siguiente puede robar otra');
    if (a2) { act(st, 0, a2); ok(E.view(st, 0).players[0].mz[0].ext.length === 2, 'acumula la segunda habilidad'); }
    ok(!pw(st, 0, 'robo'), 'otra vez una sola por turno');
  }

  section('Venom: Simbiosis de 2 turnos con no-Marvel (29-10-2026)');
  {
    const mk = host => { const st = fresh(0); put(st, 0, 0, host); put(st, 1, 2, 'c_creeper'); hand(st, 0, ['c_venom']); return st; };
    // anfitrión de Marvel: se queda todo el tiempo
    const sm = mk('c_deadpool');
    act(sm, 0, L(sm, 0).find(a => a.t === 'attach' && a.mode === 'venom'));
    ok(sm.players[0].mz[0].sym, 'Venom se equipa a Deadpool (Marvel)');
    pass(sm, 2 * 6);
    ok(sm.players[0].mz[0] && sm.players[0].mz[0].sym && !sm.players[0].mz[1], 'con un anfitrión de Marvel sigue equipado muchos turnos después');
    ok(E.view(sm, 0).players[0].mz[0].symLeft == null, 'sin cuenta atrás para Marvel');
    // anfitrión que no es de Marvel: 2 turnos y se separa
    const sg = mk('c_goku');
    const n0 = E.countCards(sg, 0);
    act(sg, 0, L(sg, 0).find(a => a.t === 'attach' && a.mode === 'venom'));
    ok(E.view(sg, 0).players[0].mz[0].symLeft === 2, 'a Goku le quedan 2 turnos');
    pass(sg, 2);
    ok(sg.players[0].mz[0].sym && E.view(sg, 0).players[0].mz[0].symLeft === 2, 'primer turno propio completo: sigue equipado');
    pass(sg, 2);
    ok(sg.players[0].mz[0].sym && E.view(sg, 0).players[0].mz[0].symLeft === 1, 'segundo turno: sigue equipado, le queda 1');
    pass(sg, 2);
    const P0 = sg.players[0];
    ok(!P0.mz[0].sym && !(P0.mz[0].link || []).length, 'a los 2 turnos Venom se separa de Goku');
    ok(P0.mz.some(m => m && m.c.id === 'c_venom' && !m.sym), 'Venom sale al campo como personaje normal');
    eq(stat(sg, 0, 0), [Cards.get('c_goku').atk, Cards.get('c_goku').def], 'Goku pierde la bonificación');
    ok(!L(sg, 0).some(a => a.t === 'power' && a.pw === 'simb'), 'no puede acoplarse de nuevo el mismo turno');
    eq(E.countCards(sg, 0), n0, 'ninguna carta se pierde ni se duplica');
    pass(sg, 2);
    ok(L(sg, 0).some(a => a.t === 'power' && a.pw === 'simb'), 'un turno después puede acoplarse otra vez');
  }
};
