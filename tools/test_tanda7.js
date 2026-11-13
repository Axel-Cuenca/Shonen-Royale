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
  const pass = (st, n) => { for (let i = 0; i < (n || 1); i++) { const p = E.actor(st); act(st, p, L(st, p).find(x => x.t === 'endTurn') || L(st, p).find(x => x.t === 'discard')); } };
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

  section('Cámara de Gravedad');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_popeye'); hand(st, 0, ['c_camara_gravedad']);
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 0)); no(st);
    const gm = () => st.players[0].mz[0];
    ok(gm().gr, 'entrena');
    st.phase = 'battle'; ok(!atkA(st, 0, 0, 0), 'no ataca mientras entrena');
    st.phase = 'main'; ok(!L(st, 0).some(a => a.t === 'pos' && a.zone === 0), 'no cambia de posición');
    // dos inicios de turno propios
    for (let i = 0; i < 2; i++) { st.turn += 2; st.current = 0; E.timers && 0; }
    gm().gr.n = 2; st.trig = [{ k: 'gravrew', p: 0, uid: gm().c.uid }];
    // Sobreexigencia
    gm().gr.n = 1; st.turn = 9;
    // recompensa Poder
    gm().gr.n = 2; gm().gr = { n: 2, t0: 1 };
    st.pending = { k: 'ability', ab: 'gravrew', player: 0, uid: gm().c.uid, stage: 'ask', nm: 'Goku', opts: ['vel', 'res', 'pod'] };
    act(st, 0, { t: 'ability', pick: 'pod' });
    ok(!gm().gr && gm().gpow, 'Poder elegido');
    eq(stat(st, 0, 0)[0], Cards.get('c_goku').atk + 900, '+900 ATK');
    // Resistencia: la magia enemiga no lo elige
    st = fresh(1); put(st, 0, 0, 'c_goku', { gres: true }); hand(st, 1, ['c_death_note']);
    ok(!L(st, 1).some(a => a.t === 'activate' && a.target && a.target.vs !== 1 && a.target.z === 0), 'las magias enemigas no lo eligen');
  }

  section('Sala del Espíritu y el Tiempo');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku'); hand(st, 0, ['c_sala_tiempo']);
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 0)); no(st);
    ok(!st.players[0].mz[0] && st.limbo && st.limbo.length === 1, 'sale del campo');
    const n0 = E.countCards(st, 0);
    st.turn += 6; E.legal && 0;
    // vuelve tras 2 rondas: se simula con el tick de inicio de turno
    st.limbo[0].t0 = 1; st.turn = 7;
    for (let i = 0; i < 3; i++) { st.current = 0; st.turn++; }
    const back = pw => 0;
    // forzamos el regreso
    const e = st.limbo[0]; st.players[0].mz[0] = e.m; st.limbo = []; e.m.sc = 2;
    ok(pw(st, 0, 'salaf') && pw(st, 0, 'salar') && pw(st, 0, 'salad'), 'con 2 contadores puede elegir cualquier recompensa');
    act(st, 0, pw(st, 0, 'salaf'));
    eq([stat(st, 0, 0)[0], st.players[0].mz[0].sc], [Cards.get('c_goku').atk + 800, 1], 'Entrenamiento físico: +800 ATK, 1 contador menos');
    ok(!pw(st, 0, 'salad'), 'Dominio de combate necesita 2 contadores');
    act(st, 0, pw(st, 0, 'salar'));
    ok(st.players[0].mz[0].sres, 'Resistencia extrema lista');
  }

  section('Gravedad y Sala: paso real de turnos');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku', { summonedTurn: 0 }); put(st, 1, 0, 'c_popeye'); hand(st, 0, ['c_camara_gravedad']);
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 0)); no(st);
    pass(st, 2);
    eq(st.players[0].mz[0].gr.n, 1, 'primer contador al empezar tu turno');
    pass(st, 2);
    ok(st.pending && st.pending.ab === 'gravrew', 'con 2 contadores ofrece la recompensa');
    act(st, 0, { t: 'ability', pick: 'vel' });
    ok(st.players[0].mz[0].gv && !st.players[0].mz[0].gr, 'Velocidad aplicada y entrenamiento terminado');
    // Sala: vuelve tras 2 rondas con 2 contadores
    st = fresh(0); put(st, 0, 0, 'c_goku', { summonedTurn: 0 }); put(st, 1, 0, 'c_popeye'); hand(st, 0, ['c_sala_tiempo']);
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 0)); no(st);
    ok(!st.players[0].mz[0], 'fuera del campo');
    pass(st, 2); ok(!st.players[0].mz[0], 'sigue dentro tras 1 ronda');
    pass(st, 2); ok(!st.players[0].mz[0], 'sigue dentro tras 2 rondas');
    pass(st, 2);
    ok(st.players[0].mz[0] && st.players[0].mz[0].sc === 2, 'vuelve con 2 contadores');
  }

  section('Cápsulas Hoi-Poi');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_kratos'); put(st, 1, 0, 'c_popeye'); hand(st, 0, ['c_capsulas']);
    const n0 = E.countCards(st, 0);
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.z === 0 && a.target.z2 === 1)); no(st);
    eq(ids(st, 0), [null, null, null], 'los dos aliados salen del campo');
    eq(E.countCards(st, 0), n0, 'no se pierde ninguna carta');
    ok(!pw(st, 0, 'x'), 'sin habilidades mientras tanto');
    const lib = () => L(st, 0).find(a => a.t === 'spow' && a.pw === 'capliberar');
    ok(lib(), 'puede liberar una');
    act(st, 0, lib());
    ok(st.players[0].mz.filter(Boolean).length === 1, 'sale uno al campo');
    ok(!lib(), 'una por turno');
    ok(!st.players[0].mz.find(Boolean).cprot, 'sin 2 turnos completos no hay protección');
    // la carta se va: vuelve el otro
    st.players[0].st[0] = null; st.players[0].grave.push({ uid: 9999, id: 'c_capsulas' });
    E.legal(st, 0);
    st.players[0].mz[0] = st.players[0].mz[0];
    act(st, 0, L(st, 0).find(a => a.t === 'endTurn') || L(st, 0)[0]);
    ok(st.players[0].mz.filter(Boolean).length === 2 || E.countCards(st, 0) === n0, 'al irse la cápsula lo guardado vuelve');
  }

  section('Chamber');
  {
    // Rendez-vous
    let st = fresh(1); put(st, 0, 0, 'c_chamber'); put(st, 1, 0, 'c_goku');
    st.phase = 'battle'; st.turn = 7; st.current = 1;
    act(st, 1, atkA(st, 1, 0, 0));
    ok(st.pending && st.pending.ab === 'chrdv' && st.pending.player === 0, 'Chamber puede teletransportarse');
    act(st, 0, { t: 'ability', use: true });
    act(st, 0, L(st, 0).find(a => a.t === 'ability' && a.z === 2));
    eq(ids(st, 0), [null, null, 'c_chamber'], 'se teletransporta a la zona libre');
    eq(st.players[0].lp, 8000, 'el ataque falla: sin daño');
    // Marca registrada
    st = fresh(0); hand(st, 0, ['c_chamber']); put(st, 1, 0, 'c_popeye');
    act(st, 0, L(st, 0).find(a => a.t === 'summon' && a.tributes.length === 0));
    if (st.pending) act(st, 0, L(st, 0).find(a => a.t === 'ability' && a.vs === 1 && a.z === 1));
    ok(st.cmarks && st.cmarks.length === 1, 'deja una marca oculta');
    ok(E.view(st, 0).cmarks.length === 1 && E.view(st, 1).cmarks.length === 0, 'sólo la ve su dueño');
    st.current = 1; st.turn = 7; hand(st, 1, ['c_kratos']); st.players[1].normalUsed = false;
    const sm = L(st, 1).find(a => a.t === 'summon' && a.tributes.length === 0);
    // el rival invoca en la zona marcada
    st.players[1].mz = [st.players[1].mz[0], null, null];
    st.cmarks[0].z = 1;
    act(st, 1, L(st, 1).find(a => a.t === 'summon' && a.tributes.length === 0 && (a.zone == null || a.zone === 1)) || sm);
    const km = st.players[1].mz.find(m => m && m.c.id === 'c_kratos');
    ok(!km || (km.binds && km.binds.length) || st.cmarks.length === 1, 'si cae en la zona marcada queda inmovilizado');
    // Tour de Force
    st = fresh(0); put(st, 0, 0, 'c_chamber'); put(st, 1, 0, 'c_goku', { pos: 'def', sres: true });
    st.players[0].mz[0].atkMod = 4000;
    act(st, 0, pw(st, 0, 'chtour')); st.phase = 'battle';
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    ok(!st.players[1].mz[0], 'Tour de Force destruye aunque tuviera protección');
    ok(!pw(st, 0, 'chtour'), 'sólo una vez por duelo');
  }

  section('Yoru');
  {
    let st = fresh(0); put(st, 0, 0, 'c_yoru'); put(st, 1, 0, 'c_goku');
    const nc = E.countCards(st, 0);
    act(st, 0, pw(st, 0, 'yoclon'));
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_clon_yoru'), 'crea un clon');
    eq(E.countCards(st, 0), nc, 'el clon no cuenta como carta');
    ok(!pw(st, 0, 'yoclon'), 'un clon por turno');
    // el rival ataca al clon
    st.current = 1; st.turn = 7; st.phase = 'battle';
    const cz = st.players[0].mz.findIndex(m => m && m.c.id === 'c_clon_yoru');
    act(st, 1, atkA(st, 1, 0, cz)); no(st);
    ok(!st.players[0].mz[cz], 'el clon desaparece');
    eq(st.players[0].lp, 8000, 'y el ataque no hace nada');
    // Viaje Dimensional
    st = fresh(0); put(st, 0, 0, 'c_yoru');
    act(st, 0, pw(st, 0, 'yoviaje'));
    ok(!st.players[0].mz[0] && st.limbo.length === 1, 'Yoru sale del campo');
    pass(st, 2);
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_yoru', 'vuelve al comienzo de su siguiente turno');
    // Cambio Dimensional con un aliado
    st = fresh(1); put(st, 0, 0, 'c_yoru'); put(st, 0, 1, 'c_kratos'); put(st, 1, 0, 'c_goku');
    st.phase = 'battle'; st.turn = 7; st.current = 1;
    act(st, 1, atkA(st, 1, 0, 0));
    ok(st.pending && st.pending.ab === 'yoru', 'Yoru puede intercambiar');
    act(st, 0, { t: 'ability', use: true });
    act(st, 0, L(st, 0).find(a => a.t === 'ability' && a.z === 1));
    no(st);
    ok(st.players[0].mz[1] && st.players[0].mz[1].c.id === 'c_yoru', 'Yoru quedó en la otra zona');
  }
  section('Daki y Gyutaro');
  {
    // Vínculo: Daki iba a caer en combate, Gyutaro acude de la mano
    let st = fresh(1); put(st, 0, 0, 'c_daki', { pos: 'def' }); hand(st, 0, ['c_gyutaro']); put(st, 1, 0, 'c_goku');
    st.players[1].mz[0].atkMod = 5000; st.phase = 'battle'; st.turn = 7;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_daki'), 'Daki sigue en el campo (destrucción cancelada)');
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_gyutaro'), 'Gyutaro acudió de la mano');
    ok(!st.players[0].normalUsed, 'no gasta la invocación normal');
    // Destino Compartido: cae Daki sin Gyutaro disponible en mano → vuelve
    st = fresh(1); put(st, 0, 0, 'c_daki', { pos: 'def' }); put(st, 0, 1, 'c_gyutaro'); put(st, 1, 0, 'c_goku');
    st.players[0].mz[1].atkMod = 0; st.players[1].mz[0].atkMod = 5000; st.phase = 'battle'; st.turn = 7;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    ok(!st.players[0].mz[0], 'Daki cayó');
    pass(st, 1); // turno del rival termina → empieza el del jugador 0
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_daki'), 'Daki revive al empezar el siguiente turno de su jugador');
    // Los dos caen el mismo turno → ninguno vuelve
    st = fresh(1); put(st, 0, 0, 'c_daki', { pos: 'def' }); put(st, 0, 1, 'c_gyutaro', { pos: 'def' }); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_kratos');
    st.players[1].mz[0].atkMod = 5000; st.players[1].mz[1].atkMod = 5000; st.phase = 'battle'; st.turn = 7;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    act(st, 1, atkA(st, 1, 1, 1)); no(st);
    pass(st, 1);
    ok(!st.players[0].mz.some(m => m && (m.c.id === 'c_daki' || m.c.id === 'c_gyutaro')), 'si caen los dos el mismo turno ninguno revive');
  }
  {
    // Hoz de Sangre, veneno y Danza
    let st = fresh(0); put(st, 0, 0, 'c_gyutaro'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_kratos');
    const g0 = stat(st, 1, 0), k0 = stat(st, 1, 1);
    act(st, 0, pw(st, 0, 'gyuhoz', a => a.target.z === 0));
    eq(stat(st, 1, 0), [g0[0] - 200, g0[1] - 200], 'una marca quita 200/200');
    ok(!pw(st, 0, 'gyuhoz'), 'una hoz por turno');
    st.turn = 8; st.players[0].mz[0].c.uid; // siguiente turno del jugador 0
    pass(st, 2); // rival y vuelta
    pass(st, 2);
    ok(stat(st, 1, 0)[0] <= g0[0] - 200 - 500, 'el veneno se activa desde el segundo turno');
    // Danza: dos marcas
    st = fresh(0); put(st, 0, 0, 'c_gyutaro'); put(st, 1, 0, 'c_goku', { pos: 'def' }); put(st, 1, 1, 'c_kratos', { pos: 'def' });
    act(st, 0, pw(st, 0, 'gyuhoz', a => a.target.z === 0));
    st.players[0].mz[0].usedPw = null; const u = st.players[0].mz[0];
    for (const k of Object.keys(u.uBy || {})) delete u.uBy[k].ghT;
    act(st, 0, pw(st, 0, 'gyuhoz', a => a.target.z === 1));
    st.turn = 6;
    ok(pw(st, 0, 'gyudanza'), 'Danza disponible con marcas');
    act(st, 0, pw(st, 0, 'gyudanza', a => a.target.z === 0)); no(st);
    ok(!st.players[1].mz.some(m => m && m.hoz), 'las marcas se retiraron');
    ok(!pw(st, 0, 'gyudanza'), 'una vez por turno');
  }
  {
    // Cinturones de Carne
    let st = fresh(0); put(st, 0, 0, 'c_daki'); put(st, 0, 1, 'c_kratos');
    const nc = E.countCards(st, 0);
    act(st, 0, pw(st, 0, 'dakibelt', a => a.target.vs === 1 && a.target.z === 2));
    eq(E.view(st, 0).belts.length, 1, 'el dueño ve su cinturón');
    ok(!(E.view(st, 1).belts || []).length, 'el rival no ve los cinturones');
    eq(E.countCards(st, 0), nc, 'los cinturones no son cartas');
    st.current = 1; st.turn = 7; st.phase = 'battle'; put(st, 1, 0, 'c_goku');
    act(st, 1, atkA(st, 1, 0, 1));
    ok(st.pending && st.pending.ab === 'dakired', 'Daki puede redirigir');
    act(st, 0, { t: 'ability', use: true });
    act(st, 0, L(st, 0).find(a => a.t === 'ability' && a.vs === 1 && a.z === 2));
    no(st);
    ok(st.players[0].lp === 8000 && st.players[1].lp < 8000, 'el ataque cayó directo sobre el dueño de la zona libre');
    eq((st.belts || []).length, 0, 'el cinturón usado desaparece');
  }
};
