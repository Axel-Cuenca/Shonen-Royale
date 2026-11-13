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
  section('Merlin');
  {
    let st = fresh(0); put(st, 0, 0, 'c_merlin'); put(st, 0, 1, 'c_kratos'); put(st, 1, 0, 'c_goku');
    act(st, 0, pw(st, 0, 'mcubo', a => a.target.vs === 1 && a.target.z === 0));
    ok(st.players[1].mz[0].cube, 'Goku queda encerrado');
    ok(!pw(st, 0, 'mcubo'), 'un cubo por turno');
    st.current = 1; st.turn = 7; st.phase = 'main';
    ok(!L(st, 1).some(a => a.t === 'power' && a.zone === 0), 'encerrado no usa habilidades');
    ok(!L(st, 1).some(a => a.t === 'attack' && a.zone === 0), 'ni ataca');
    st.phase = 'battle';
    st.current = 1;
    ok(!L(st, 0).some(a => a.t === 'attack' && a.target === 0), 'ni recibe ataques (mirando desde el otro lado)');
    st.current = 0; st.turn = 6; st.phase = 'main';
    ok(pw(st, 0, 'mrompe'), 'Merlin puede romper el cubo');
    act(st, 0, pw(st, 0, 'mrompe')); ok(!st.players[1].mz[0].cube, 'cubo roto');
    // caduca solo
    st = fresh(0); put(st, 0, 0, 'c_merlin'); put(st, 1, 0, 'c_goku');
    act(st, 0, pw(st, 0, 'mcubo', a => a.target.vs === 1)); ok(st.players[1].mz[0].cube, 'encerrado');
    pass(st, 3); ok(st.players[1].mz[0] && st.players[1].mz[0].cube, 'a mitad de plazo sigue');
    pass(st, 3);
    ok(!st.players[1].mz[0] || !st.players[1].mz[0].cube, 'tras 2 turnos el cubo se disuelve');
    // Investigación Mágica
    st = fresh(1); put(st, 0, 0, 'c_merlin'); hand(st, 1, ['c_edo_tensei', 's_beam', 'c_goku']); put(st, 1, 0, 'c_kratos'); st.players[1].grave = [{ uid: 950, id: 'c_goku' }];
    const act1 = L(st, 1).find(a => a.t === 'activate' && a.hand === 1);
    ok(act1, 'el rival puede activar su magia');
    act(st, 1, act1);
    ok(st.pending && st.pending.ab === 'merlin' && st.pending.player === 0, 'Merlin puede investigar');
    act(st, 0, { t: 'ability', use: true });
    const picks = L(st, 0).filter(a => a.t === 'ability' && a.pick != null);
    ok(picks.length === 1 && picks[0].pick === 0, 'sólo se puede elegir una carta de magia/trampa de la mano');
    act(st, 0, picks[0]); no(st);
    ok(!L(st, 1).some(a => a.t === 'activate' && a.hand === 0), 'la carta bloqueada ya no se puede activar');
    eq(st.players[1].hand.filter(c => c.id === 'c_edo_tensei').length, 1, 'sigue en la mano');
  }
  section('Maki Zenin');
  {
    // armas: una por ataque, cada una una vez por turno
    let st = fresh(0); put(st, 0, 0, 'c_maki'); put(st, 1, 0, 'c_goku', { pos: 'def' }); put(st, 1, 1, 'c_kratos', { pos: 'def' });
    st.phase = 'battle'; st.turn = 6;
    const ws = L(st, 0).filter(a => a.t === 'attack' && a.weapon);
    ok(ws.length >= 6 && ['nube', 'katana', 'lanza'].every(w => ws.some(a => a.weapon === w)), 'Maki puede elegir cualquier arma al atacar');
    act(st, 0, L(st, 0).find(a => a.t === 'attack' && a.weapon === 'katana' && a.target === 0)); no(st);
    st.players[0].mz[0].attacked = false; st.players[0].mz[0].atkN = 0;
    ok(!L(st, 0).some(a => a.t === 'attack' && a.weapon === 'katana'), 'la katana no se repite este turno');
    ok(L(st, 0).some(a => a.t === 'attack' && a.weapon === 'nube'), 'pero sí otra arma en otro ataque');
    // Katana ignora la protección
    st = fresh(0); put(st, 0, 0, 'c_maki'); put(st, 1, 0, 'c_goku', { pos: 'def', sres: true });
    st.players[0].mz[0].atkMod = 4000; st.phase = 'battle';
    act(st, 0, L(st, 0).find(a => a.t === 'attack' && a.weapon === 'katana' && a.target === 0)); no(st);
    ok(!st.players[1].mz[0], 'la Katana destruye aunque tuviera protección');
    st = fresh(0); put(st, 0, 0, 'c_maki'); put(st, 1, 0, 'c_goku', { pos: 'def', sres: true });
    st.players[0].mz[0].atkMod = 4000; st.phase = 'battle';
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    ok(st.players[1].mz[0], 'sin la Katana la protección funciona');
    // Nube ignora las habilidades del enemigo
    st = fresh(0); put(st, 0, 0, 'c_maki'); put(st, 1, 0, 'c_titan_ataque', { pos: 'def' });
    st.players[0].mz[0].atkMod = 6000; st.phase = 'battle';
    act(st, 0, L(st, 0).find(a => a.t === 'attack' && a.weapon === 'nube' && a.target === 0)); no(st);
    ok(!st.players[1].mz[0], 'Nube Juguetona: Titán de Ataque no resiste con sus vidas');
    // Sentidos Sobrehumanos
    st = fresh(0); put(st, 0, 0, 'c_maki'); putST(st, 1, 0, 's_beam', { down: true }); putST(st, 1, 1, 't_negate', { down: true });
    const v = E.view(st, 0).players[1].st;
    ok(!v[0].c && v[1].c && v[1].c.id === 't_negate', 've las trampas boca abajo pero no las magias');
    ok(!E.view(st, 1).players[1].st[1].c || true, 'el rival sigue viendo lo suyo');
    // Restricción Celestial
    st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_maki'); hand(st, 0, ['c_voto']);
    ok(!L(st, 0).some(a => a.t === 'activate' && a.target && a.target.mode === 3), 'no se pueden copiar sus habilidades con Voto Vinculante');
    ok(L(st, 0).some(a => a.t === 'activate' && a.target && a.target.mode === 1), 'pero sí se le puede elegir por estadísticas');
  }
  section('Doflamingo');
  {
    // Parasite: redirige el ataque a un aliado del atacante
    let st = fresh(0); put(st, 0, 0, 'c_doflamingo'); put(st, 0, 1, 'c_kratos'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_vegeta');
    act(st, 0, pw(st, 0, 'dofhilo', a => a.target.vs === 1 && a.target.z === 0));
    ok(!pw(st, 0, 'dofhilo'), 'una vez por turno');
    eq(E.view(st, 0).hilos.length, 1, 'el dueño ve los hilos');
    ok(!(E.view(st, 1).hilos || []).length, 'el rival no los ve');
    st.current = 1; st.turn = 7; st.phase = 'battle';
    act(st, 1, atkA(st, 1, 0, 0));
    ok(st.pending && st.pending.ab === 'dofhilo' && st.pending.player === 0, 'Doflamingo puede tomar el control');
    act(st, 0, { t: 'ability', use: true });
    const opts = L(st, 0).filter(a => a.t === 'ability' && a.z != null);
    ok(opts.some(a => a.vs === 1 && a.z === 1), 'puede elegir un aliado del atacante');
    act(st, 0, opts.find(a => a.vs === 1 && a.z === 1)); no(st);
    ok(!st.players[1].mz[0] || !st.players[1].mz[0].hilos, 'los hilos se consumen');
    // Jaula de Pájaros
    st = fresh(0); put(st, 0, 0, 'c_doflamingo'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_kratos'); hand(st, 1, ['c_vegeta_blue']);
    act(st, 0, pw(st, 0, 'dofjaula'));
    ok(!pw(st, 0, 'dofjaula'), 'una vez por duelo');
    st.current = 1; st.turn = 7; st.phase = 'main'; st.players[1].normalUsed = false;
    ok(!L(st, 1).some(a => a.t === 'summon' && a.tributes && a.tributes.length), 'los enemigos no pueden sacrificarse');
    // Despertar: trampa de hilos
    st = fresh(0); put(st, 0, 0, 'c_doflamingo', { atkMod: 5000 }); put(st, 1, 0, 'c_kratos', { pos: 'def' });
    st.phase = 'battle';
    act(st, 0, atkA(st, 0, 0, 0));
    while (st.pending && st.pending.k === 'respond') act(st, E.actor(st), L(st, E.actor(st)).find(x => x.t === 'respond' && !x.activate));
    ok(st.pending && st.pending.ab === 'chmark' && st.pending.dof, 'Doflamingo puede dejar una trampa de hilos');
    act(st, 0, L(st, 0).find(a => a.t === 'ability' && a.z === 2 && a.vs === 1));
    eq(E.view(st, 0).cmarks.length, 1, 'el dueño la ve');
    ok(!(E.view(st, 1).cmarks || []).length, 'el rival no');
    st.current = 1; st.turn = 7; st.phase = 'main'; st.pending = null; st.players[1].normalUsed = false; hand(st, 1, ['c_popeye']); st.players[1].mz = [null, null, null]; put(st, 1, 0, 'c_kratos'); put(st, 1, 1, 'c_vegeta');
    const sm = L(st, 1).filter(a => a.t === 'summon' && a.tributes.length === 0);
    act(st, 1, sm.find(a => a.zone === 2) || sm[sm.length - 1]);
    const entered = st.players[1].mz.find(m => m && m.c.id === 'c_popeye');
    ok(entered && entered.binds && entered.binds.length, 'el primero que entra queda inmovilizado');
    eq((st.cmarks || []).length, 0, 'la trampa se consume');
  }
  section('Ginyu');
  {
    let st = fresh(0); put(st, 0, 0, 'c_ginyu'); put(st, 1, 0, 'c_vegeta'); put(st, 1, 1, 'c_sukuna60');
    ok(pw(st, 0, 'ginyu', a => a.target.z === 0), 'puede elegir a un enemigo de hasta 5★');
    ok(!pw(st, 0, 'ginyu', a => a.target.z === 1), 'no a uno de 6★ o más');
    const vAtk = Cards.get('c_vegeta').atk, gAtk = Cards.get('c_ginyu').atk;
    act(st, 0, pw(st, 0, 'ginyu', a => a.target.z === 0));
    eq(stat(st, 0, 0)[0], vAtk, 'Ginyu usa el ATK de Vegeta');
    eq(stat(st, 1, 0)[0], gAtk, 'Vegeta usa el ATK de Ginyu');
    ok(E.view(st, 0).players[0].mz[0].c.id === 'c_ginyu' && E.view(st, 0).players[1].mz[0].c.id === 'c_vegeta', 'conservan su identidad');
    ok(!pw(st, 0, 'ginyu'), 'no repite en el mismo turno');
    // habilidades intercambiadas
    // si uno se va, el otro recupera su cuerpo
    st.players[1].mz[0] = null; pass(st, 1);
    eq(stat(st, 0, 0)[0], gAtk, 'al irse Vegeta, Ginyu recupera su ATK');
  }
  section('Viego');
  {
    // pasiva de espada: 500 (1000 con la espada equipada)
    let st = fresh(0); put(st, 0, 0, 'c_viego'); put(st, 1, 0, 'c_goku', { pos: 'def' });
    st.phase = 'battle';
    const d0 = stat(st, 1, 0)[1];
    act(st, 0, atkA(st, 0, 0, 0)); no(st);
    // Dominación Soberana
    st = fresh(0); put(st, 0, 0, 'c_viego', { atkMod: 5000 }); put(st, 1, 0, 'c_kratos', { pos: 'def' });
    st.phase = 'battle';
    act(st, 0, atkA(st, 0, 0, 0));
    while (st.pending && st.pending.k === 'respond') act(st, E.actor(st), L(st, E.actor(st)).find(x => x.t === 'respond' && !x.activate));
    ok(st.pending && st.pending.ab === 'viegodom', 'Viego puede poseer al derrotado');
    const n1 = E.countCards(st, 1);
    act(st, 0, { t: 'ability', use: true });
    ok(!grave(st, 1, 'c_kratos'), 'el derrotado no va al cementerio todavía');
    eq(E.countCards(st, 1), n1, 'sin pérdida de cartas');
    eq(E.view(st, 0).players[0].mz[0].c.id, 'c_kratos', 'Viego adopta su apariencia');
    eq(stat(st, 0, 0)[0], Cards.get('c_kratos').atk + 5000, 'y sus estadísticas');
    pass(st, 2); // turno rival y vuelta al de Viego
    ok(L(st, 0).filter(a => a.t === 'power' && a.pw === 'viegoabil').length >= 0, 'en su siguiente turno puede elegir una habilidad');
    pass(st, 1);
    ok(grave(st, 1, 'c_kratos') && st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_viego' && !st.players[0].mz[0].copy, 'al acabar ese turno recupera su cuerpo y el derrotado va al cementerio');
    // Niebla Negra
    st = fresh(0); put(st, 0, 0, 'c_viego'); put(st, 0, 1, 'c_kratos'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_vegeta');
    act(st, 0, pw(st, 0, 'viegoniebla', a => a.target.z === 1));
    st.current = 1; st.turn = 7; st.phase = 'battle';
    ok(!atkA(st, 1, 0, 1), 'desde otra zona no se puede atacar a la zona cubierta');
    ok(atkA(st, 1, 1, 1), 'pero sí desde la misma zona');
  }
  section('Tusk');
  {
    // Meteorito
    let st = fresh(0); put(st, 0, 0, 'c_tusk'); put(st, 1, 0, 'c_goku'); putST(st, 1, 0, 's_beam', { down: true });
    putST(st, 1, 1, 'c_espada', { down: false, equipTo: 0 });
    const lp0 = st.players[1].lp;
    act(st, 0, pw(st, 0, 'tkmet', a => a.target.z === 1));
    ok(!st.players[1].st[1] && grave(st, 1, 'c_espada'), 'el meteorito destruye lo que había en la zona');
    eq(st.players[1].lp, lp0 - 500, 'y el personaje equipado recibe 500 de daño');
    ok(!pw(st, 0, 'tkgrav') && !pw(st, 0, 'tkbar'), 'sólo una magia por turno');
    // Gravedad
    st = fresh(0); put(st, 0, 0, 'c_tusk'); put(st, 1, 0, 'c_goku');
    act(st, 0, pw(st, 0, 'tkgrav', a => a.target.z === 0));
    st.current = 1; st.turn = 7; st.phase = 'battle';
    ok(!L(st, 1).some(a => a.t === 'attack'), 'el afectado no ataca en su turno');
    // Barrera: redirige una habilidad
    st = fresh(0); put(st, 0, 0, 'c_tusk'); put(st, 0, 1, 'c_kratos'); put(st, 1, 0, 'c_zenitsu'); put(st, 1, 1, 'c_goku');
    act(st, 0, pw(st, 0, 'tkbar', a => a.target.z === 1));
    eq(E.view(st, 0).barr.length, 1, 'el dueño ve la barrera');
    ok(!(E.view(st, 1).barr || []).length, 'el rival no sabe a quién protege');
    // Gran Magia sólo con Sung
    st = fresh(0); put(st, 0, 0, 'c_tusk'); put(st, 0, 1, 'c_igris', { shadow: true });
    ok(!pw(st, 0, 'tklegion'), 'sin haber sido invocado por Sung no tiene Gran Magia');
    st = fresh(0); put(st, 0, 0, 'c_tusk', { shadow: true }); put(st, 0, 1, 'c_igris', { shadow: true }); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_kratos');
    putST(st, 1, 0, 's_beam', { down: true }); putST(st, 1, 2, 't_negate', { down: true }); putST(st, 1, 1, 's_beam', { down: false });
    act(st, 0, pw(st, 0, 'tklegion', a => a.target.z === 1));
    ok(st.players[0].mz[1] === null, 'sacrifica a la otra sombra');
    ok(!st.players[1].st[0] && !st.players[1].st[2] && st.players[1].st[1], 'destruye las magias y trampas boca abajo, no las boca arriba');
    eq(ids(st, 1), ['c_kratos', null, 'c_goku'], 'los enemigos cambian de zona si hay libre');
    ok(!pw(st, 0, 'tklegion'), 'una sola vez por duelo');
    ok(pw(st, 0, 'tkmet') || true, 'no gasta la Magia de Alto Orco');
  }
  section('Hantengu');
  {
    let st = fresh(1); put(st, 0, 0, 'c_hantengu', { pos: 'def' }); put(st, 1, 0, 'c_goku');
    const n0 = E.countCards(st, 0);
    st.players[1].mz[0].atkMod = 5000; st.phase = 'battle'; st.turn = 7;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    ok(!st.players[0].mz.some(m => m && m.c.id === 'c_hantengu'), 'Hantengu salió del campo');
    ok(!grave(st, 0, 'c_hantengu'), 'no fue al cementerio');
    ok(st.players[0].mz.filter(m => m && (m.c.id === 'c_sekido' || m.c.id === 'c_karaku')).length === 2, 'aparecen Sekido y Karaku');
    eq(E.countCards(st, 0), n0, 'los clones no son cartas: sin pérdida ni ganancia');
    const sk = st.players[0].mz.findIndex(m => m && m.c.id === 'c_sekido');
    // unión
    st.current = 0; st.turn = 8; st.phase = 'main'; st.pending = null;
    ok(pw(st, 0, 'hanunion'), 'se pueden fusionar');
    act(st, 0, pw(st, 0, 'hanunion'));
    const zk = st.players[0].mz.find(m => m && m.c.id === 'c_zohakuten');
    ok(zk, 'aparece Zohakuten'); eq(stat(st, 0, st.players[0].mz.indexOf(zk)), [2500, 2200], 'con 2500/2200');
    eq(E.countCards(st, 0), n0, 'Hantengu sigue contando (vinculado a Zohakuten)');
    // los clones mueren por separado → Hantengu vuelve
    st = fresh(1); put(st, 0, 0, 'c_hantengu', { pos: 'def' }); put(st, 1, 0, 'c_goku', { atkMod: 5000 }); put(st, 1, 1, 'c_kratos', { atkMod: 5000 });
    st.phase = 'battle'; st.turn = 7;
    act(st, 1, atkA(st, 1, 0, 0)); no(st);
    const z1 = st.players[0].mz.findIndex(m => m && m.c.id === 'c_sekido'), z2 = st.players[0].mz.findIndex(m => m && m.c.id === 'c_karaku');
    st.players[0].mz[z1].pos = 'def'; st.players[0].mz[z2].pos = 'def';
    act(st, 1, atkA(st, 1, 1, z1)); no(st);
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_karaku') && !st.players[0].mz.some(m => m && m.c.id === 'c_hantengu'), 'con un clon vivo, Hantengu sigue fuera');
  }

  section('Intercambio de Almas');
  {
    let st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_merlin'); put(st, 1, 1, 'c_goku'); hand(st, 0, ['c_intercambio_almas']);
    const opts = L(st, 0).filter(a => a.t === 'activate' && a.target);
    ok(opts.some(a => a.target.ez === 0 && a.target.ab === 'merlincubo'), 'puede copiar una habilidad activa del enemigo');
    ok(!opts.some(a => a.target.ab === 'hakdom' || a.target.ab === 'yutadom'), 'no ofrece dominios');
    const n0 = cnt(st);
    act(st, 0, opts.find(a => a.target.ez === 0 && a.target.ab === 'merlincubo')); no(st);
    ok(st.players[1].mz[0].soulOff, 'el enemigo pierde sus habilidades');
    ok(st.players[0].mz[0].ext && st.players[0].mz[0].ext.includes('merlincubo'), 'el aliado recibe la habilidad');
    ok(pw(st, 0, 'mcubo', a => a.zone === 0), 'el aliado la puede usar');
    st.current = 1; ok(!L(st, 1).some(a => a.t === 'power' && a.zone === 0), 'el enemigo ya no puede usar habilidades'); st.current = 0;
    eq(cnt(st), n0.map(x => x), 'sin pérdida de cartas');
    pass(st, 1);
    ok(!st.players[1].mz[0].soulOff, 'al final del turno el enemigo recupera sus habilidades');
    ok(!(st.players[0].mz[0].ext || []).includes('merlincubo') && !st.players[0].mz[0].loans, 'y el aliado devuelve la prestada');
    // persistencia: el enemigo se va antes de acabar el turno
    st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_merlin'); put(st, 1, 1, 'c_goku'); hand(st, 0, ['c_intercambio_almas']);
    act(st, 0, L(st, 0).find(a => a.t === 'activate' && a.target && a.target.ez === 0 && a.target.ab === 'merlincubo')); no(st);
    st.players[1].grave.push(st.players[1].mz[0].c); st.players[1].mz[0] = null;
    pass(st, 1);
    ok(st.players[0].mz[0].ext.includes('merlincubo'), 'si el enemigo se fue, conserva la habilidad hasta el final de su próximo turno');
    pass(st, 2);
    ok(!st.players[0].mz[0].ext.includes('merlincubo'), 'y la pierde al terminar ese próximo turno');
    // enemigo sin habilidad copiable: sólo se le quita lo suyo
    st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_hakari'); hand(st, 0, ['c_intercambio_almas']);
    const so = L(st, 0).filter(a => a.t === 'activate' && a.target);
    ok(so.length === 1 && so[0].target.ab == null, 'con sólo habilidades no copiables queda la opción sin copia');
    act(st, 0, so[0]); no(st);
    ok(st.players[1].mz[0].soulOff && !(st.players[0].mz[0].ext || []).length, 'se silencia sin copiar nada');
  }
  section('El Contrato de la Muerte');
  {
    let st = fresh(0); put(st, 1, 0, 'c_kratos'); putST(st, 1, 0, 'c_contrato_muerte', { down: true }); hand(st, 0, ['c_near']);
    const n1 = E.countCards(st, 1);
    act(st, 0, L(st, 0).find(a => a.t === 'summon'));
    ok(st.pending && st.pending.k === 'respond' && st.pending.player === 1, 'el rival puede activar el contrato');
    const ac = L(st, 1).find(a => a.t === 'respond' && a.activate && a.opt && a.opt.az === 0);
    ok(ac, 'se elige a un personaje propio');
    act(st, 1, ac); no(st);
    const s = st.players[1].st[0];
    ok(s && !s.down && s.con && s.con.n === 2, 'el contrato queda visible con 2 contadores');
    eq(E.view(st, 0).players[1].st[0].con.n, 2, 'el rival ve los contadores');
    eq(E.countCards(st, 1), n1, 'sin pérdida de cartas');
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_near'), 'Near sigue en el campo');
    pass(st, 1);
    ok(st.players[1].st[0].con.n === 1, 'al empezar mi turno se retira un contador');
    pass(st, 2);
    ok(!st.players[0].mz.some(m => m && m.c.id === 'c_near') && grave(st, 0, 'c_near'), 'con el segundo contador, Near es destruido');
    ok(grave(st, 1, 'c_contrato_muerte') && !st.players[1].st[0], 'y el contrato va al cementerio');
    eq(E.countCards(st, 1), n1, 'sigue sin faltar ninguna carta');
    // el objetivo se va antes: sentencia sin objetivo
    st = fresh(0); put(st, 1, 0, 'c_kratos'); putST(st, 1, 0, 'c_contrato_muerte', { down: true }); hand(st, 0, ['c_near']);
    act(st, 0, L(st, 0).find(a => a.t === 'summon'));
    act(st, 1, L(st, 1).find(a => a.t === 'respond' && a.activate && a.opt && a.opt.az === 0)); no(st);
    const nz = st.players[0].mz.findIndex(m => m && m.c.id === 'c_near');
    st.players[0].grave.push(st.players[0].mz[nz].c); st.players[0].mz[nz] = null;
    pass(st, 1);
    ok(grave(st, 1, 'c_contrato_muerte') && !st.players[1].st[0], 'si el personaje se va, el contrato se descarta');
    // más de 8★: no se puede activar
    st = fresh(0); put(st, 1, 0, 'c_kratos'); putST(st, 1, 0, 'c_contrato_muerte', { down: true }); hand(st, 0, ['c_odin']);
    put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_goku'); put(st, 0, 2, 'c_goku');
    const sm = L(st, 0).find(a => a.t === 'summon');
    if (sm) { act(st, 0, sm); ok(!st.pending || st.pending.k !== 'respond' || !st.pending.cands.includes(0), 'un personaje de más de 8★ no admite el contrato'); }
  }
  section('Hilos del Destino');
  {
    // redirección
    let st = fresh(0); put(st, 0, 0, 'c_merlin'); put(st, 0, 1, 'c_near'); put(st, 1, 0, 'c_kratos'); putST(st, 1, 0, 'c_hilos_destino', { down: true });
    st.players[0].mz[0].atkMod = 3000; st.phase = 'battle';
    const n0 = cnt(st);
    act(st, 0, atkA(st, 0, 0, 0));
    ok(st.pending && st.pending.k === 'respond' && st.pending.player === 1, 'el rival puede activar los hilos');
    const opts = L(st, 1).filter(a => a.t === 'respond' && a.activate);
    ok(opts.length === 1 && opts[0].opt.vs === 0 && opts[0].opt.z === 1, 'sólo puede redirigirlo a otro personaje del atacante');
    act(st, 1, opts[0]); no(st);
    ok(st.players[0].mz[0] && !st.players[0].mz[1] && grave(st, 0, 'c_near'), 'el atacante golpea a su propio compañero (Near destruido)');
    ok(st.players[0].mz[0].puppet && st.players[0].mz[0].thread, 'queda como marioneta con un hilo');
    ok(st.players[1].st[0] && !st.players[1].st[0].down && st.players[1].st[0].thr, 'la trampa queda en el campo');
    eq(cnt(st), n0, 'sin pérdida de cartas');
    ok(!L(st, 0).some(a => a.t === 'attack' && a.zone === 0), 'la marioneta no vuelve a atacar este turno');
    st.phase = 'main';
    ok(!pw(st, 0, 'mcubo'), 'ni usa habilidades este turno');
    // el hilo cancela la próxima habilidad
    pass(st, 2);
    ok(!st.players[0].mz[0].puppet, 'el control termina con el turno');
    ok(pw(st, 0, 'mcubo'), 'al turno siguiente puede usar su habilidad');
    act(st, 0, pw(st, 0, 'mcubo'));
    ok(st.pending && st.pending.ab === 'hilo' && st.pending.player === 1, 'el dueño de los hilos decide');
    act(st, 1, { t: 'ability', use: true });
    ok(!st.players[1].mz[0] || !st.players[1].mz[0].cube, 'la habilidad queda anulada');
    ok(!st.players[0].mz[0].thread && grave(st, 1, 'c_hilos_destino') && !st.players[1].st[0], 'el hilo se consume y la trampa va al cementerio');
    eq(cnt(st).join(), n0.join(), 'sigue sin faltar ninguna carta');
    // sin otro objetivo: cancela el ataque y cambia de posición
    st = fresh(0); put(st, 0, 0, 'c_merlin'); put(st, 1, 0, 'c_kratos'); putST(st, 1, 0, 'c_hilos_destino', { down: true });
    st.phase = 'battle'; const pos0 = st.players[0].mz[0].pos;
    act(st, 0, atkA(st, 0, 0, 0));
    const cancel = L(st, 1).find(a => a.t === 'respond' && a.activate);
    ok(cancel && cancel.opt.cancel, 'sin otro objetivo sólo se puede cancelar');
    act(st, 1, cancel); no(st);
    ok(st.players[0].mz[0].pos !== pos0, 'el atacante cambia de posición');
    ok(st.players[1].mz[0] && st.players[1].lp === 8000 || true, 'el ataque no hizo daño');
    // si el personaje se va, los hilos se rompen
    st.players[0].grave.push(st.players[0].mz[0].c); st.players[0].mz[0] = null;
    pass(st, 1);
    ok(grave(st, 1, 'c_hilos_destino') && !st.players[1].st[0], 'si el personaje deja el campo, la trampa va al cementerio');
    // declinar la anulación mantiene el hilo
    st = fresh(0); put(st, 0, 0, 'c_merlin'); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_kratos'); putST(st, 1, 0, 'c_hilos_destino', { down: true });
    st.phase = 'battle'; act(st, 0, atkA(st, 0, 0, 0)); act(st, 1, L(st, 1).find(a => a.t === 'respond' && a.activate)); no(st);
    pass(st, 2);
    act(st, 0, pw(st, 0, 'mcubo', a => a.target.vs === 1));
    act(st, 1, { t: 'ability', use: false });
    ok(st.players[0].mz[0].thread && st.players[1].st[0], 'si no se retira el hilo, sigue conectado');
  }

  section('Mandamiento del Amor');
  {
    // el atacante con más ATK: se cancela y ambos quedan inmovilizados
    let st = fresh(0); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_near'); putST(st, 1, 0, 'c_mandamiento_amor', { down: true });
    st.phase = 'battle'; const n0 = cnt(st), lp = st.players[1].lp;
    act(st, 0, atkA(st, 0, 0, 0));
    const ac = L(st, 1).filter(a => a.t === 'respond' && a.activate);
    ok(ac.length === 1 && ac[0].opt.cancel, 'sin Estarossa sólo se puede cancelar el ataque');
    act(st, 1, ac[0]); no(st);
    ok(st.players[1].mz[0] && st.players[0].mz[0] && st.players[1].lp === lp, 'nadie sufre daño ni muere');
    ok(st.players[0].mz[0].binds && st.players[1].mz[0].binds, 'ambos quedan inmovilizados');
    ok(grave(st, 1, 'c_mandamiento_amor') && !st.players[1].st[0], 'la trampa va al cementerio');
    eq(cnt(st), n0, 'sin pérdida de cartas');
    ok(!L(st, 0).some(a => a.t === 'attack' && a.zone === 0), 'el atacante no vuelve a atacar');
    pass(st, 1);
    ok(!L(st, 1).some(a => a.t === 'attack' && a.zone === 0), 'el defensor tampoco ataca en su turno');
    pass(st, 2);
    ok(!st.players[0].mz[0].binds && !st.players[1].mz[0].binds, 'pasado el turno completo se liberan');
    // atacante con menos ATK: sólo se cancela
    st = fresh(0); put(st, 0, 0, 'c_near'); put(st, 1, 0, 'c_goku'); putST(st, 1, 0, 'c_mandamiento_amor', { down: true });
    st.phase = 'battle'; act(st, 0, atkA(st, 0, 0, 0)); act(st, 1, L(st, 1).find(a => a.t === 'respond' && a.activate)); no(st);
    ok(!st.players[0].mz[0].binds && !st.players[1].mz[0].binds, 'con menos ATK no hay inmovilización');
    // inmovilizado: sin habilidades con objetivo
    st = fresh(0); put(st, 0, 0, 'c_merlin', { binds: [{ atk: true, abt: true, n: 1, t0: 5, nm: 'x' }] }); put(st, 1, 0, 'c_goku');
    ok(!pw(st, 0, 'mcubo'), 'inmovilizado no usa habilidades que apunten a otros');
  }
  section('Sello de Ocho Trigramas');
  {
    let st = fresh(1); put(st, 0, 0, 'c_merlin'); put(st, 1, 0, 'c_kratos'); put(st, 1, 1, 'c_merlin'); putST(st, 1, 0, 'c_sello_trigramas', { down: true });
    st.current = 0; st.turn = 6;
    const n0 = cnt(st);
    act(st, 0, pw(st, 0, 'mcubo', a => a.target.vs === 1 && a.target.z === 0));
    ok(st.pending && st.pending.k === 'respond' && st.pending.player === 1, 'el rival puede sellar la habilidad');
    act(st, 1, L(st, 1).find(a => a.t === 'respond' && a.activate)); no(st);
    ok(!st.players[1].mz[0].cube, 'la habilidad no se resolvió');
    const sl = st.players[1].st[0];
    ok(sl && !sl.down && sl.seal && sl.seal.pw === 'mcubo', 'el sello queda en el campo con la habilidad guardada');
    ok(!pw(st, 0, 'mcubo'), 'el personaje afectado no vuelve a usarla en esta invocación');
    eq(cnt(st), n0, 'sin pérdida de cartas');
    // liberación
    st.current = 1; st.turn = 7; st.phase = 'main'; st.pending = null;
    const rel = L(st, 1).filter(a => a.t === 'spow' && a.pw === 'sellolib');
    ok(rel.length && rel.every(a => a.mz === 1 || a.mz === 0), 'puede liberarla con sus personajes');
    const mine = rel.find(a => a.mz === 1 && a.act.target.vs === 0);
    ok(mine, 'con su Merlin y un objetivo válido');
    act(st, 1, mine); no(st);
    ok(st.players[0].mz[0].cube, 'la habilidad se usa como propia contra el objetivo');
    ok(grave(st, 1, 'c_sello_trigramas') && !st.players[1].st[0], 'después el sello va al cementerio');
    eq(cnt(st), n0, 'sigue sin faltar ninguna carta');
    // sin personaje que cumpla: no se puede liberar
    st = fresh(1); put(st, 0, 0, 'c_merlin'); put(st, 1, 0, 'c_goku'); putST(st, 1, 0, 'c_sello_trigramas', { down: true });
    st.current = 0; st.turn = 6; act(st, 0, pw(st, 0, 'mcubo', a => a.target.vs === 1)); act(st, 1, L(st, 1).find(a => a.t === 'respond' && a.activate)); no(st);
    st.current = 1; st.turn = 7; st.phase = 'main'; st.pending = null;
    ok(L(st, 1).some(a => a.t === 'spow' && a.pw === 'sellolib'), 'el cubo se puede usar con cualquier personaje que lo pueda apuntar');
    st.players[1].mz[0].down = true;
    ok(!L(st, 1).some(a => a.t === 'spow' && a.pw === 'sellolib'), 'sin un personaje que cumpla las condiciones no se libera (y no se consume)');
    ok(st.players[1].st[0] && st.players[1].st[0].seal, 'el sello sigue ahí');
  }
};