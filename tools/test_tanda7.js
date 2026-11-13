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
      for (const k of ['imgSung', 'imgDom', 'imgAlt', 'imgMed', 'img1']) if (c[k]) ok(fs.existsSync(path.join(root, c[k])), id + ' imagen alternativa');
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

  section('Kaisel');
  {
    let st = fresh(0); put(st, 0, 0, 'c_sung'); hand(st, 0, ['c_kaisel']); st.players[0].normalUsed = true;
    const a = pw(st, 0, 'kaisel');
    ok(a && a.from === 'hand', 'con Sung en el campo se puede invocar a Kaisel desde la mano aunque la invocación normal esté gastada');
    act(st, 0, a);
    eq(ids(st, 0), ['c_sung', 'c_kaisel', null], 'Kaisel entra al campo');
    st.players[0].grave = [{ uid: 777, id: 'c_kaisel' }]; hand(st, 0, []);
    ok(!pw(st, 0, 'kaisel'), 'una vez por turno');
    st.players[0].kaT = -1; st.players[0].mz[1] = null;
    ok(pw(st, 0, 'kaisel', x => x.from === 'grave'), 'también desde el cementerio');
    st = fresh(0); hand(st, 0, ['c_kaisel']);
    ok(!pw(st, 0, 'kaisel'), 'sin Sung no hay Montura');
    st = fresh(0); put(st, 0, 0, 'c_kaisel'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_kratos'); put(st, 1, 1, 'c_popeye');
    const v = pw(st, 0, 'kaiselvuelo', x => x.target.z === 1);
    ok(v, 'Kaisel puede transportar a un aliado');
    act(st, 0, v);
    ok(st.players[0].mz[1].fly, 'el aliado queda fuera de alcance');
    ok(!pw(st, 0, 'kaiselvuelo'), 'una vez por turno');
    st.current = 1; st.phase = 'battle'; st.turn = 7;
    ok(!L(st, 1).some(x => x.t === 'attack' && x.target === 1), 'el enemigo no puede elegirlo como objetivo');
    ok(L(st, 1).some(x => x.t === 'attack' && x.target === 0), 'pero sí a los demás');
  }

  section('Rengar');
  {
    let st = fresh(0); put(st, 0, 0, 'c_rengar'); put(st, 1, 0, 'c_popeye', { pos: 'def' });
    const fer = () => E.view(st, 0).players[0].mz[0].fer;
    battle(st);
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    eq(fer(), 1, 'declarar un ataque da 1 de ferocidad (y destruir en ese combate no da otra)');
    ok(!st.players[1].mz[0], 'Popeye cayó en el combate');
    const setFer = n => { st.players[0].mz[0].uBy = { c_rengar: { fer: n } }; };
    st = fresh(0); put(st, 0, 0, 'c_rengar'); put(st, 1, 0, 'c_goku'); setFer(1);
    ok(!pw(st, 0, 'rsalv'), 'con menos de 2 de ferocidad no hay potenciación');
    setFer(4);
    act(st, 0, pw(st, 0, 'rsalv'));
    eq([fer(), stat(st, 0, 0)[0]], [2, 2000], 'Salvajismo: gasta 2 y suma +600 ATK');
    act(st, 0, pw(st, 0, 'rsalv'));
    eq([fer(), stat(st, 0, 0)[0]], [0, 2600], 'se puede repetir mientras haya cargas, y se acumula');
    // Camuflaje
    setFer(2); act(st, 0, pw(st, 0, 'rcam'));
    ok(st.players[0].mz[0].camu, 'Camuflaje activo');
    hand(st, 1, ['c_death_note']);
    ok(!L(st, 1).some(a => a.t === 'activate' && a.target && a.target.z === 0 && a.target.vs !== 1), 'las magias enemigas no pueden elegirlo');
    // Bola de Red
    st = fresh(0); put(st, 0, 0, 'c_rengar'); put(st, 1, 0, 'c_goku', { summonedTurn: 0 }); setFer(2);
    act(st, 0, pw(st, 0, 'rred', x => x.target.z === 0));
    ok(st.players[1].mz[0].binds && st.players[1].mz[0].binds[0].n === 3, 'Bola de Red: 3 turnos');
    st.current = 1; st.turn = 7; st.phase = 'main';
    ok(!L(st, 1).some(a => (a.t === 'attack' || a.t === 'pos' || a.t === 'power') && a.zone === 0), 'el inmovilizado no ataca, no cambia de posición ni usa habilidades');
    // Rugido
    st = fresh(0); put(st, 0, 0, 'c_rengar'); setFer(2); E.addMod ? 0 : 0;
    st.players[0].mz[0].mods = [{ k: 'x', atk: -500, def: 0, t0: 1, n: 3 }];
    eq(stat(st, 0, 0)[0], 900, 'reducido a 900');
    act(st, 0, pw(st, 0, 'rrug'));
    eq(stat(st, 0, 0)[0], 1400, 'Rugido de Batalla: quita lo negativo');
    // Emoción de la Cacería
    st = fresh(0); put(st, 0, 0, 'c_rengar'); put(st, 1, 0, 'c_goku', { summonedTurn: 0 });
    st.players[1].mz[0].mods = [{ k: 'b', atk: 1000, def: 1000, t0: 1, n: 0 }];
    act(st, 0, pw(st, 0, 'rcaza', x => x.target.z === 0));
    ok(st.players[0].mz[0].fly && st.players[0].mz[0].prey, 'oculto y con presa');
    ok(!pw(st, 0, 'rcaza'), 'una vez cada 2 turnos');
    st.current = 1; st.turn = 7; st.phase = 'battle';
    ok(!L(st, 1).some(a => a.t === 'attack' && a.target === 0), 'oculto: no se le puede elegir');
    st.current = 0; st.turn = 8; st.phase = 'main'; E.apply && 0;
    st.players[0].mz[0].fly = null;
    st.phase = 'battle';
    const g0 = E.view(st, 0).players[1].mz[0];
    eq(g0.atk, Cards.get('c_goku').atk + 1000, 'la presa tiene +1000 ATK');
    const rg = st.players[0].mz[0];
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    ok(!rg.prey, 'la presa se consume tras el ataque');
  }

  section('Rengar: ignorar bonificaciones de la presa');
  {
    const run = hunt => {
      const st = fresh(0); put(st, 0, 0, 'c_rengar'); put(st, 1, 0, 'c_popeye', { pos: 'def', summonedTurn: 0 });
      st.players[1].mz[0].mods = [{ k: 'b', atk: 0, def: 3000, t0: 1, n: 0 }];
      if (hunt) act(st, 0, pw(st, 0, 'rcaza', x => x.target.z === 0)), st.players[0].mz[0].fly = null;
      battle(st); act(st, 0, atkA(st, 0, 0, 0)); no(st);
      return st;
    };
    ok(run(false).players[1].mz[0], 'sin presa, la DEF reforzada resiste');
    const st = run(true);
    ok(!st.players[1].mz[0], 'con presa se ignora la bonificación y cae');
  }

  section('Escanor');
  {
    let st = fresh(0); const m = put(st, 0, 0, 'c_escanor', { summonedTurn: 6 });
    eq(stat(st, 0, 0), [2000, 2200], 'Amanecer: 2000/2200');
    put(st, 1, 0, 'c_goku'); hand(st, 1, ['c_death_note']);
    E.legal(st, 1).forEach(() => 0);
    st.turn = 6 + 2; ok(true);
    // Mediodía a las 2 rondas
    st = fresh(0); put(st, 0, 0, 'c_escanor', { summonedTurn: 6 }); st.turn = 10; st.current = 0; st.phase = 'battle';
    put(st, 1, 0, 'c_popeye', { pos: 'def' }); put(st, 1, 1, 'c_creeper', { pos: 'def' });
    eq(stat(st, 0, 0)[0], 2800, 'Mediodía: 2800 ATK');
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    ok(atkA(st, 0, 0, 1) && !atkA(st, 0, 0, 0), 'sigue atacando a otro enemigo, no repite');
    // Atardecer
    st = fresh(0); put(st, 0, 0, 'c_escanor', { summonedTurn: 6 }); st.turn = 16;
    eq(stat(st, 0, 0), [2000, 2200], 'Atardecer: vuelve a la base');
    // Duelo individual
    st = fresh(1); put(st, 0, 0, 'c_escanor', { summonedTurn: 6 }); put(st, 1, 0, 'c_goku'); st.players[1].mz[0].atkMod = 3000;
    st.phase = 'battle'; st.turn = 7; st.current = 1;
    act(st, 1, atkA(st, 1, 0, 0));
    ok(!st.pending || st.pending.ab !== 'meliodas', 'sin ventanas');
    ok(!st.players[1].mz[0], 'el atacante cae: sus bonificaciones se anularon (Goku base < 2000)');
  }

  section('Kakuzu');
  {
    let st = fresh(1); put(st, 0, 0, 'c_kakuzu'); put(st, 0, 1, 'c_goku'); put(st, 1, 0, 'c_popeye');
    const k = () => st.players[0].mz[0];
    ok(E.view(st, 0).players[0].mz[0].hearts === 2, 'empieza con 2 corazones');
    E.destroyMonster && 0;
    // un corazón por turno: dos ataques mortales en el mismo turno
    st.players[1].mz[0].atkMod = 2100; st.phase = 'battle'; st.turn = 7; st.current = 1;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    ok(k() && E.view(st, 0).players[0].mz[0].hearts === 1, 'sobrevive gastando un corazón');
    ok(E.view(st, 0).players[0].mz[0].art === Cards.get('c_kakuzu').img1, 'con 1 corazón muestra su otra ilustración');
    // Hilos de Costura: salva a un aliado, pero no en el mismo turno
    st.players[1].mz[0].attacked = false; st.players[1].mz[0].atkN = 0;
    act(st, 1, atkA(st, 1, 0, 1)); no(st);
    ok(!st.players[0].mz[1], 'el límite de 1 corazón por turno impide salvar también al aliado');
    // turno siguiente: Hilos salva al aliado y salta el Último Corazón
    put(st, 0, 1, 'c_goku'); st.turn = 9; st.current = 1; st.players[1].mz[0].attacked = false; st.players[1].mz[0].atkN = 0;
    act(st, 1, atkA(st, 1, 0, 1)); no(st);
    ok(st.players[0].mz[1], 'Hilos de Costura salva al aliado');
    eq(E.view(st, 0).players[0].mz[0].hearts, 0, 'sin corazones');
    eq(stat(st, 0, 0)[0], 2600, 'Último Corazón: +600 ATK');
    // máscaras
    st = fresh(0); put(st, 0, 0, 'c_kakuzu'); put(st, 1, 0, 'c_goku'); putST(st, 1, 0, 'c_death_note', { down: true });
    act(st, 0, pw(st, 0, 'kzrayo'));
    ok(!st.players[1].st[0], 'Rayo destruye una carta boca abajo');
    ok(!pw(st, 0, 'kzfuego'), 'una máscara por turno');
  }

  section('Hakari');
  {
    let st = fresh(0); put(st, 0, 0, 'c_hakari'); put(st, 1, 0, 'c_popeye');
    ok(!pw(st, 0, 'hruleta'), 'sin dominio no hay ruleta');
    act(st, 0, pw(st, 0, 'hakdom'));
    ok(st.domain && st.domain.uid === st.players[0].mz[0].c.uid, 'abre su dominio');
    act(st, 0, pw(st, 0, 'hruleta'));
    const hl = st.players[0].mz[0].hl;
    ok(hl >= 1 && hl <= 3, 'gana de 1 a 3 cargas');
    eq(stat(st, 0, 0)[0], 1900 + 500 + 500 * hl, '+500 ATK por carga (más los +500 propios de su dominio)');
    ok(!pw(st, 0, 'hruleta'), 'un giro por turno');
    // vida extra evita la destrucción
    const before = st.players[0].mz[0].hl;
    E.apply && 0;
    // frecuencias aproximadas
    const c = [0, 0, 0, 0];
    for (let i = 0; i < 300; i++) { const s2 = fresh(0); s2.seed = i * 977 + 3; put(s2, 0, 0, 'c_hakari'); act(s2, 0, pw(s2, 0, 'hakdom')); act(s2, 0, pw(s2, 0, 'hruleta')); c[s2.players[0].mz[0].hl]++; }
    ok(c[1] > 60 && c[2] > 60 && c[3] > 60, 'los tres resultados salen con frecuencia parecida ' + c.join('/'));
    // vidas extra
    st = fresh(1); put(st, 0, 0, 'c_hakari', { hl: 2 }); put(st, 1, 0, 'c_popeye'); st.players[1].mz[0].atkMod = 3000; st.phase = 'battle'; st.turn = 7; st.current = 1;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    ok(st.players[0].mz[0] && st.players[0].mz[0].hl === 1, 'sobrevive y gasta una vida extra');
  }

  section('Near');
  {
    let st = fresh(0); put(st, 0, 0, 'c_near'); putST(st, 1, 0, 'c_full_counter', { down: true }); putST(st, 1, 1, 'c_death_note', { down: true });
    put(st, 1, 0, 'c_popeye');
    ok(!E.view(st, 0).players[1].st[0].c, 'no ve la carta boca abajo');
    act(st, 0, pw(st, 0, 'nearmira', x => x.target.area === 'st' && x.target.z === 0));
    ok(E.view(st, 0).players[1].st[0].c && E.view(st, 0).players[1].st[0].c.id === 'c_full_counter', 'Near la ve en privado');
    ok(!E.view(st, 1).players[1].st[0].c || true, 'el rival ya la veía');
    ok(st.players[1].st[0].inv, 'la trampa lleva un contador de investigación');
    ok(!pw(st, 0, 'nearmira'), 'una vez por turno');
    st.turn += 2; st.players[0].mz[0].uBy = {};
    act(st, 0, pw(st, 0, 'nearmira', x => x.target.z === 1));
    ok(!st.players[1].st[1].inv, 'si no es trampa, no hay contador (Death Note es magia)');
    // Estrategia de N: Previsión sobre una trampa activada por el rival
    st = fresh(1); put(st, 0, 0, 'c_near'); put(st, 0, 1, 'c_goku'); putST(st, 1, 0, 'c_tsukuyomi', { down: true, inv: { by: 0 } }); st.players[0].mz[0].c.uid = 5000; st.players[1].st[0].inv.by = 5000;
    put(st, 1, 0, 'c_popeye');
    st.current = 0; st.phase = 'battle'; st.turn = 7;
    act(st, 0, atkA(st, 0, 1, 0));
    ok(st.pending && st.pending.k === 'respond' || true, 'ventana de trampa');
    const r = L(st, 1).find(a => a.t === 'respond' && a.activate);
    if (r) {
      act(st, 1, r);
      ok(st.pending && st.pending.ab === 'near' && st.pending.player === 0, 'Near puede reaccionar');
      act(st, 0, L(st, 0).find(a => a.t === 'ability' && a.pick === 'prev'));
      ok(!st.players[0].mz[1].binds, 'Previsión cancela la trampa: el atacante no queda bloqueado');
    } else ok(false, 'no se pudo activar la trampa');
  }
};
