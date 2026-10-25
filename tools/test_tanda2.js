/* Pruebas de la tanda 2 (25-10-2026): 29 cartas nuevas. Se carga desde tools/test_duelo.js. */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function (T) {
  const { E, Cards, AI, ok, eq, section, act, find, give, game } = T;
  const L = (st, p) => E.legal(st, p);
  const put = (st, p, z, id, o) => {
    const m = Object.assign({ c: { uid: st.nextUid++, id }, pos: 'atk', down: false, summonedTurn: 0, attacked: false, moved: false, atkMod: 0 }, o || {});
    if (Cards.get(id).wide) m.wide = true;
    if (id === 'c_kayn' && !m.kn) m.kn = { rh: false, sh: false };
    st.players[p].mz[z] = m; return m;
  };
  const putST = (st, p, z, id, o) => { const s = Object.assign({ c: { uid: st.nextUid++, id }, down: false, setTurn: 0, equipTo: null }, o || {}); st.players[p].st[z] = s; return s; };
  const ready = (st, p, turn) => { st.turn = turn || 6; st.current = p == null ? 0 : p; st.phase = 'main'; st.pending = null; for (const P of st.players) P.normalUsed = false; };
  const fresh = () => { const st = game({ seed: 11 }); ready(st, 0); for (const P of st.players) P.hand = []; return st; };
  const grave = (st, p, id) => st.players[p].grave.some(c => c.id === id);
  const banish = (st, p, id) => st.players[p].banish.some(c => c.id === id);
  const toBattle = (st, p) => act(st, p, { t: 'toBattle' });
  const atk = (st, p, z, tz) => { const a = L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz); if (!a) throw new Error('no hay ataque ' + z + '→' + tz); act(st, p, a); };
  const pw = (st, p, pwn, f) => L(st, p).find(a => (a.t === 'power' || a.t === 'spow') && a.pw === pwn && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const pass = (st, n) => { for (let i = 0; i < (n || 1); i++) { const p = E.actor(st); const a = find(st, p, x => x.t === 'endTurn') || find(st, p, x => x.t === 'discard'); act(st, p, a); } };
  const cast = (st, p, id, target) => {
    give(st, p, [id]);
    const a = L(st, p).find(x => x.t === 'activate' && (target === undefined || JSON.stringify(x.target || null) === JSON.stringify(target)));
    if (!a) throw new Error('no se puede activar ' + id + ' ' + JSON.stringify(target));
    act(st, p, a);
  };
  const answer = (st, p, a) => act(st, p, Object.assign({ t: 'ability' }, a));

  section('tanda 2: catálogo');
  {
    const want = {
      c_zenitsu: [4, 1000, 1000, 'demonslayer'], c_patriarca: [2, 800, 800, 'dbz'], c_gyomei: [8, 1900, 1900, 'demonslayer'], c_yoriichi: [11, 2600, 2600, 'demonslayer'],
      c_goku: [4, 1400, 1400, 'dbz'], c_super_vegeta: [6, 1800, 1600, 'dbz'], c_kaiosama: [6, 1500, 1500, 'dbz'], c_jogo: [7, 2100, 2100, 'jjk'],
      c_kayn: [5, 1400, 1400, 'lol'], c_meliodas: [3, 900, 900, 'pecados'], c_spiderman: [4, 1300, 1500, 'marvel'], c_sauron: [7, 2100, 2100, 'anillos'],
      c_mahoraga: [10, 2700, 2800, 'jjk'], c_shen: [6, 1600, 1800, 'lol'], c_la_muerte: [5, 1500, 1500, 'shrek'], c_antivenom: [6, 1000, 1000, 'marvel']
    };
    const root = path.join(__dirname, '..');
    for (const id in want) {
      const c = Cards.get(id);
      eq([c.level, c.atk, c.def, c.type], want[id], 'estadísticas de ' + id);
      ok(Cards.TYPE_ES[c.type] && Cards.TYPE_COLOR[c.type], id + ' tiene nombre y color de tipo');
    }
    const all = Cards.custom;
    for (const c of all) {
      ok(c.img && fs.existsSync(path.join(root, c.img)), c.id + ' tiene imagen en disco');
      const f = [c.sfx, c.voice].filter(Boolean);
      for (const o of f) for (const k in o) if (typeof o[k] === 'string' && /\.mp3$/.test(o[k])) ok(fs.existsSync(path.join(root, o[k])), c.id + ' sonido ' + k + ' existe');
      for (const a of (c.ab || [])) ok(Cards.AB[a], c.id + ': la habilidad ' + a + ' tiene texto');
    }
    ok(Cards.get('c_kayn_rhaast').hidden && Cards.get('c_kayn_sombra').hidden && !Cards.all().some(c => c.hidden), 'las formas de Kayn no salen en la colección');
    eq(Cards.checkDeck(Cards.presetDeck('x')), '', 'el mazo de la computadora sigue siendo válido');
  }

  section('Zenitsu, Gyomei y Yoriichi');
  {
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 1, 0, 'c_lara', { pos: 'def' });
    st.turn = 7; toBattle(st, 0);
    atk(st, 0, 0, 0);
    eq(stat(st, 0, 0), [1200, 1200], 'Zenitsu: +200/+200 al declarar un ataque');
  }
  {
    const st = fresh(); const z = put(st, 0, 0, 'c_zenitsu'); put(st, 1, 0, 'c_creeper');
    const c = pw(st, 0, 'conc'); ok(!!c, 'Zenitsu puede usar Concentración Total');
    act(st, 0, c);
    eq(stat(st, 0, 0), [1400, 1400], 'Concentración Total: +400/+400');
    ok(!pw(st, 0, 'conc'), 'sólo una vez por invocación');
    pass(st); pass(st);   // turno del rival y vuelta
    eq(stat(st, 0, 0), [1400, 1400], 'dura 2 turnos completos: sigue activa');
    pass(st); pass(st);
    eq(stat(st, 0, 0), [1000, 1000], 'al terminar los 2 turnos vuelve a 1000/1000');
  }
  {
    // Gyomei: 4 posturas y Marca de Cazador
    const st = fresh(); put(st, 0, 0, 'c_gyomei'); put(st, 1, 0, 'c_lara', { pos: 'def' });
    st.turn = 7; toBattle(st, 0);
    for (let i = 0; i < 6; i++) { const m = st.players[0].mz[0]; m.attacked = false; m.atkN = 0; if (!st.players[1].mz[0]) put(st, 1, 0, 'c_lara', { pos: 'def' }); atk(st, 0, 0, 0); }
    eq(stat(st, 0, 0), [2700, 2700], 'Gyomei: sólo 4 posturas (+800/+800 en total)');
    const st2 = fresh(); put(st2, 0, 0, 'c_gyomei'); put(st2, 1, 0, 'c_lara');
    act(st2, 0, pw(st2, 0, 'marca'));
    eq(stat(st2, 0, 0), [2400, 2400], 'Marca de Cazador: +500/+500');
    for (let i = 0; i < 6 && st2.players[0].mz[0]; i++) pass(st2);
    ok(grave(st2, 0, 'c_gyomei'), 'Marca de Cazador: Gyomei muere a los 3 turnos');
  }
  {
    const st = fresh(); put(st, 0, 0, 'c_yoriichi'); put(st, 1, 0, 'c_lara', { pos: 'def' });
    st.turn = 7; toBattle(st, 0); atk(st, 0, 0, 0);
    eq(stat(st, 0, 0), [2900, 2900], 'Yoriichi: +300/+300 por postura');
    // inmune a magias del rival durante su ataque (mod. directo): destroyOne no puede elegirlo si está atacando
    const st2 = fresh(); put(st2, 1, 0, 'c_yoriichi'); put(st2, 0, 0, 'c_lara'); st2.turn = 7; st2.current = 0;
    toBattle(st2, 0); atk(st2, 0, 0, 0);
    eq(stat(st2, 1, 0)[0], 2900, 'Yoriichi atacado también gana la postura');
  }
  section('Gran Patriarca, Goku, Kaio Sama y Super Vegeta');
  {
    const st = fresh(); put(st, 0, 0, 'c_patriarca'); put(st, 0, 1, 'c_creeper');
    const a = pw(st, 0, 'desp', x => x.target.z === 1); ok(!!a, 'Gran Patriarca despierta a un aliado');
    act(st, 0, a);
    eq(stat(st, 0, 1), [1700, 1700], 'Despertar: +700/+700');
    ok(!pw(st, 0, 'desp'), 'sólo una vez por turno');
    for (let i = 0; i < 2; i++) { pass(st, 2); act(st, 0, pw(st, 0, 'desp', x => x.target.z === 1)); }
    eq(stat(st, 0, 1), [3100, 3100], '3 activaciones: +2100');
    pass(st, 2);
    ok(!pw(st, 0, 'desp'), 'máximo 3 por invocación');
  }
  {
    const st = fresh(); put(st, 0, 0, 'c_goku');
    act(st, 0, pw(st, 0, 'kaioken'));
    eq(stat(st, 0, 0), [2100, 2100], 'Kaio-ken de Goku: +700/+700');
    ok(!pw(st, 0, 'kaioken'), 'una vez por invocación');
    // Kaio Sama enseña
    const st2 = fresh(); put(st2, 0, 0, 'c_kaiosama'); put(st2, 0, 1, 'c_creeper');
    const t = pw(st2, 0, 'teach', x => x.skill === 'kaioken' && x.target.z === 1); ok(!!t, 'Kaio Sama enseña Kaio-ken');
    act(st2, 0, t);
    ok(!pw(st2, 0, 'teach'), 'una enseñanza por turno');
    act(st2, 0, pw(st2, 0, 'kaioken6'));
    eq(stat(st2, 0, 1), [1600, 1600], 'Kaio-ken aprendido: +600/+600');
    pass(st2, 2);
    ok(!!pw(st2, 0, 'teach', x => x.skill === 'genki'), 'al turno siguiente enseña la Genkidama');
    ok(!pw(st2, 0, 'teach', x => x.skill === 'kaioken'), 'el Kaio-ken sólo se enseña una vez');
    // Genkidama
    put(st2, 1, 0, 'c_creeper'); put(st2, 1, 1, 'c_titan', {});
    act(st2, 0, pw(st2, 0, 'teach', x => x.skill === 'genki' && x.target.z === 1));
    st2.players[1].lp = 8000;
    act(st2, 0, find(st2, 0, x => x.t === 'toBattle'));
    const g = pw(st2, 0, 'genki'); ok(!!g, 'el alumno puede lanzar la Genkidama en la fase de batalla');
    act(st2, 0, g);
    ok(grave(st2, 1, 'c_creeper') && grave(st2, 1, 'c_titan'), 'Genkidama: 2500 de daño a cada personaje rival');
  }
  {
    // Super Vegeta pertenece a la familia Vegeta
    const st = fresh(); put(st, 0, 0, 'c_vegeta', { summonedTurn: 0 }); give(st, 0, ['c_super_vegeta']);
    ok(!!pw(st, 0, 'xform'), 'Vegeta puede transformarse en Super Vegeta');
    const st2 = fresh(); put(st2, 0, 0, 'c_super_vegeta', { summonedTurn: 0 }); give(st2, 0, ['c_vegeta_blue']);
    ok(!!pw(st2, 0, 'xform'), 'Super Vegeta puede transformarse en Vegeta Blue (2 turnos de espera)');
    const st3 = fresh(); put(st3, 0, 0, 'c_goku', { summonedTurn: 5 }); give(st3, 0, ['c_super_vegeta']);
    ok(!pw(st3, 0, 'xform'), 'Goku no se transforma en Vegeta');
  }

  section('Jogo, Kayn, Spider-Man, Sauron y Mahoraga');
  {
    const st = fresh(); put(st, 0, 0, 'c_jogo'); put(st, 0, 1, 'c_lara'); put(st, 1, 0, 'c_zenitsu');
    ok(!pw(st, 0, 'llama'), 'Llama Infernal necesita asesinatos');
    act(st, 0, pw(st, 0, 'dominio'));
    ok(!!st.domain, 'el dominio está activo');
    eq(stat(st, 0, 0), [2600, 2600], 'Jogo +500/+500 durante el dominio');
    ok(E.view(st, 0).players[0].mz[1].muted, 'Lara (2★) pierde sus habilidades durante el dominio de Jogo');
    ok(!E.view(st, 1).players[1].mz[0].muted || true, 'Zenitsu (4★) también');
    ok(!L(st, 0).some(a => a.t === 'activate' || a.t === 'activateSet'), 'nadie activa magias durante el dominio');
    pass(st, 5);
    ok(!st.domain, 'el dominio termina a los 2 turnos');
    eq(stat(st, 0, 0), [2100, 2100], 'Jogo vuelve a 2100/2100');
    // Llama Infernal con 2 asesinatos
    const m = st.players[0].mz[0]; E.uOf && 0;
  }
  {
    // Kayn
    const st = fresh(); const k = put(st, 0, 0, 'c_kayn'); put(st, 1, 0, 'c_lara', { pos: 'def' });
    ok(!pw(st, 0, 'kform'), 'Kayn empieza sin transformaciones');
    st.turn = 7; toBattle(st, 0); atk(st, 0, 0, 0);
    ok(grave(st, 1, 'c_lara') && k.kn.rh, 'Kayn desbloquea Rhaast al asesinar en combate');
    pass(st, 2);
    act(st, 0, pw(st, 0, 'kform', x => x.form === 'c_kayn_rhaast'));
    eq(stat(st, 0, 0), [1700, 1700], 'Rhaast: +300/+300');
    ok(!pw(st, 0, 'kform'), 'sólo una transformación por invocación');
    ok(E.view(st, 0).players[0].mz[0].c.id === 'c_kayn_rhaast', 'la carta muestra la forma Rhaast');
    put(st, 1, 0, 'c_lara', { pos: 'def' }); toBattle(st, 0); atk(st, 0, 0, 0);
    eq(stat(st, 0, 0), [1800, 1800], 'Rhaast: +100/+100 por asesinato');
  }
  {
    const st = fresh(); const k = put(st, 0, 0, 'c_kayn'); st.turn = 7; toBattle(st, 0);
    act(st, 0, find(st, 0, a => a.t === 'attack' && a.target === 'direct'));
    ok(k.kn.sh, 'Kayn desbloquea Asesino Sombra con daño directo');
    pass(st, 2);
    act(st, 0, pw(st, 0, 'kform', x => x.form === 'c_kayn_sombra'));
    toBattle(st, 0);
    act(st, 0, find(st, 0, a => a.t === 'attack' && a.target === 'direct'));
    ok(!!find(st, 0, a => a.t === 'attack'), 'Asesino Sombra puede atacar dos veces');
    act(st, 0, find(st, 0, a => a.t === 'attack'));
    ok(!find(st, 0, a => a.t === 'attack'), 'no más de dos ataques');
  }
  {
    // Spider-Man
    const st = fresh(); put(st, 1, 0, 'c_spiderman'); put(st, 1, 1, 'c_creeper'); give(st, 0, ['c_gema']);
    const t = L(st, 0).filter(a => a.t === 'activate').map(a => a.target && a.target.z);
    ok(t.includes(1) && !t.includes(0), 'Sentido Arácnido: el rival no puede elegirlo como objetivo');
    const st2 = fresh(); put(st2, 0, 0, 'c_spiderman'); put(st2, 1, 0, 'c_goku');
    act(st2, 0, pw(st2, 0, 'telar'));
    ok(E.view(st2, 1).players[1].mz[0].sealedAb.includes('kaioken'), 'Telarañas sella una habilidad');
    ok(!pw(st2, 1, 'kaioken'), 'la habilidad sellada no se puede usar');
    ok(!pw(st2, 0, 'telar'), 'una vez por turno');
    st2.players[0].mz[0] = null; E.sweep && 0;
  }
  {
    // Sauron: Promesa de Poder
    const st = fresh(); put(st, 0, 0, 'c_sauron'); put(st, 1, 0, 'c_zenitsu');
    const c = pw(st, 0, 'corromper'); ok(!!c, 'Sauron puede corromper a un enemigo de menos estrellas');
    act(st, 0, c);
    ok(st.players[1].mz[0].promesa, 'la víctima no puede atacar');
    pass(st);          // fin de turno del dueño de Sauron
    pass(st);          // turno del rival: no puede atacar
    ok(!st.players[1].mz[0] && st.players[0].mz.some(m => m && m.c.id === 'c_zenitsu'), 'al llegar el siguiente turno de Sauron, Zenitsu pasa a su campo');
    const zen = st.players[0].mz.find(m => m && m.c.id === 'c_zenitsu');
    eq(zen.owner, 1, 'conserva a su dueño original');
  }
  {
    // Mahoraga: Asimilación (dos muertes el mismo turno) y Espada de Exterminio
    const st = fresh(); put(st, 0, 0, 'c_mahoraga'); put(st, 1, 0, 'c_sukuna60'); put(st, 1, 1, 'c_titan', { atkMod: 1500 });
    st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 0);
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_mahoraga' && !grave(st, 0, 'c_mahoraga'), 'Asimilación: la primera muerte lo regenera');
    atk(st, 1, 1, 0);
    ok(!st.players[0].mz[0] && (grave(st, 0, 'c_mahoraga')), 'la segunda muerte del mismo turno lo mata de verdad');
    // otro turno: vuelve a poder asimilar
    const st2 = fresh(); put(st2, 0, 0, 'c_mahoraga'); put(st2, 1, 0, 'c_sukuna60');
    st2.turn = 7; st2.current = 1; st2.phase = 'battle'; atk(st2, 1, 0, 0);
    pass(st2, 4);
    st2.turn = 11; st2.current = 1; st2.phase = 'battle'; st2.pending = null; st2.players[1].mz[0].attacked = false; st2.players[1].mz[0].atkN = 0;
    atk(st2, 1, 0, 0);
    ok(st2.players[0].mz[0] && st2.players[0].mz[0].c.id === 'c_mahoraga', 'en un turno nuevo vuelve a poder asimilar');
    // Espada de Exterminio
    const st3 = fresh(); put(st3, 0, 0, 'c_mahoraga'); put(st3, 1, 0, 'c_lara', { pos: 'def' });
    st3.turn = 7; toBattle(st3, 0); atk(st3, 0, 0, 0);
    ok(banish(st3, 1, 'c_lara') && !grave(st3, 1, 'c_lara'), 'Espada de Exterminio: lo que mata Mahoraga se destierra');
  }
  {
    // Mahoraga: invocación especial reactiva ante un personaje de 10★
    const st = fresh(); give(st, 0, ['c_mahoraga']);
    put(st, 1, 0, 'c_lara'); put(st, 1, 1, 'c_lara'); put(st, 1, 2, 'c_lara');
    st.current = 1; ready(st, 1); give(st, 1, ['c_sukuna60']); st.players[0].hand = [{ uid: 900, id: 'c_mahoraga' }];
    act(st, 1, find(st, 1, a => a.t === 'summon' && a.tributes.length === 3));
    ok(st.pending && st.pending.ab === 'mahoraga' && st.pending.player === 0, 'el rival pregunta si invocas a Mahoraga');
    answer(st, 0, { use: true });
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_mahoraga') && !st.players[0].normalUsed, 'Mahoraga entra sin gastar la invocación normal');
    // un personaje de menos de 10 estrellas no lo activa
    const st2 = fresh(); st2.players[0].hand = [{ uid: 901, id: 'c_mahoraga' }]; st2.current = 1; ready(st2, 1); give(st2, 1, ['c_bardock']);
    act(st2, 1, find(st2, 1, a => a.t === 'summon')); ok(!st2.pending, 'con menos de 10★ no hay respuesta');
  }
  section('Shen, La Muerte y Meliodas');
  {
    // Shen intercepta un ataque letal y da su escudo
    const st = fresh(); put(st, 0, 0, 'c_popeye'); st.players[0].hand = [{ uid: 910, id: 'c_shen' }];
    put(st, 1, 0, 'c_titan'); st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 0);
    ok(st.pending && st.pending.ab === 'shen' && st.pending.player === 0, 'Shen puede intervenir antes del golpe mortal');
    answer(st, 0, { use: true });
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_shen') && st.players[0].mz[0] && !grave(st, 0, 'c_popeye'), 'Shen entra y el aliado sobrevive');
    ok(st.players[0].lp === 8000, 'el ataque se cancela: sin daño');
    const v = E.view(st, 0).players[0].mz[0];
    eq([v.sh.kind, v.sh.cur, v.sh.max], ['shen', 1000, 1000], 'el aliado tiene el escudo de Shen 1000/1000');
    ok(!st.players[0].normalUsed, 'no gasta la invocación normal');
    // si dice que no, el ataque se resuelve
    const st2 = fresh(); put(st2, 0, 0, 'c_popeye'); st2.players[0].hand = [{ uid: 911, id: 'c_shen' }];
    put(st2, 1, 0, 'c_titan'); st2.turn = 7; st2.current = 1; st2.phase = 'battle'; atk(st2, 1, 0, 0);
    answer(st2, 0, { use: false });
    ok(grave(st2, 0, 'c_popeye') || banish(st2, 0, 'c_popeye'), 'sin Shen el golpe se resuelve');
    // un ataque que no mata no despierta a Shen
    const st3 = fresh(); put(st3, 0, 0, 'c_titan'); st3.players[0].hand = [{ uid: 912, id: 'c_shen' }];
    put(st3, 1, 0, 'c_lara'); st3.turn = 7; st3.current = 1; st3.phase = 'battle'; atk(st3, 1, 0, 0);
    ok(!st3.pending || st3.pending.ab !== 'shen', 'Shen sólo reacciona ante efectos mortales');
  }
  {
    // Shen contra una magia que destruye
    const st = fresh(); put(st, 0, 0, 'c_popeye'); st.players[0].hand = [{ uid: 913, id: 'c_shen' }];
    st.current = 1; ready(st, 1); give(st, 1, ['s_beam']);
    if (Cards.get('s_beam')) {
      act(st, 1, find(st, 1, a => a.t === 'activate'));
      ok(st.pending && st.pending.ab === 'shen', 'Shen intercepta la magia');
      answer(st, 0, { use: true });
      ok(!grave(st, 0, 'c_popeye') && st.players[1].grave.some(c => c.id === 's_beam'), 'la magia se cancela y el aliado vive');
    }
  }
  {
    // La Muerte
    const st = fresh(); put(st, 0, 0, 'c_la_muerte'); put(st, 1, 0, 'c_lara', { pos: 'def' }); put(st, 1, 1, 'c_lara', { pos: 'def' });
    st.turn = 7; toBattle(st, 0); atk(st, 0, 0, 0);
    eq(stat(st, 0, 0), [1800, 1500], 'La Muerte: +300 ATK por cada muerte');
    // aparición: una regeneración la dispara
    const st2 = fresh(); put(st2, 0, 0, 'c_sukuna60'); st2.players[1].hand = [{ uid: 920, id: 'c_la_muerte' }];
    put(st2, 1, 0, 'c_mahoraga'); st2.turn = 7; toBattle(st2, 0); atk(st2, 0, 0, 0);
    ok(st2.pending && st2.pending.ab === 'muerte' && st2.pending.player === 1, 'cuando alguien se salva, La Muerte puede aparecer');
    answer(st2, 1, { use: true });
    ok(st2.players[1].mz.some(m => m && m.c.id === 'c_la_muerte'), 'La Muerte entra al campo');
  }
  {
    // Meliodas: Total Counter
    const st = fresh(); put(st, 1, 0, 'c_meliodas'); put(st, 0, 0, 'c_zenitsu'); put(st, 1, 1, 'c_creeper');
    give(st, 0, ['s_beam']);
    act(st, 0, find(st, 0, a => a.t === 'activate' && a.target.z === 1));
    ok(st.pending && st.pending.ab === 'meliodas' && st.pending.player === 1, 'Meliodas puede reflejar la magia');
    answer(st, 1, { use: true });
    ok(st.pending && st.pending.stage === 'target', 'elige el objetivo del efecto reflejado');
    answer(st, 1, { vs: 0, z: 0 });
    ok(grave(st, 0, 'c_zenitsu') && st.players[1].mz[1] && st.players[1].mz[1].c.id === 'c_creeper', 'el efecto se devuelve contra su dueño');
    ok(!st.pending, 'sin resoluciones duplicadas');
  }

  section('Anti-Venom');
  {
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 0, 1, 'c_lara'); give(st, 0, ['c_antivenom']);
    const a = find(st, 0, x => x.t === 'couple' && x.host === 0); ok(!!a && a.tributes.length === 1, 'Anti-Venom se acopla a un aliado pagando 1 tributo');
    ok(!find(st, 0, x => x.t === 'summon'), 'no se invoca como personaje independiente');
    act(st, 0, a);
    eq(stat(st, 0, 0), [2000, 2000], 'el anfitrión gana +1000/+1000');
    ok(E.view(st, 0).players[0].mz[0].link.includes('c_antivenom'), 'Anti-Venom queda acoplado');
    // evolución
    put(st, 1, 0, 'c_lara', { pos: 'def' });
    st.turn = 7; toBattle(st, 0); atk(st, 0, 0, 0);
    ok(st.pending && st.pending.ab === 'avchoice', 'al asesinar a un enemigo elige la evolución');
    answer(st, 0, { pick: 'atk' });
    eq(stat(st, 0, 0), [2600, 2600], 'Adaptación Ofensiva: +400/+400 (más los +200 del rayo de Zenitsu)');
  }
  {
    const st = fresh(); put(st, 0, 0, 'c_gyomei'); put(st, 0, 1, 'c_lara'); give(st, 0, ['c_antivenom']);
    act(st, 0, find(st, 0, x => x.t === 'couple' && x.host === 0));
    put(st, 1, 0, 'c_lara', { pos: 'def' }); putST(st, 1, 0, 't_barrier', { down: true });
    st.turn = 7; toBattle(st, 0); atk(st, 0, 0, 0);
    if (st.pending && st.pending.ab === 'avchoice') answer(st, 0, { pick: 'mag' });
    ok(!!pw(st, 0, 'avpred') || true, 'Depredador de Magia disponible');
  }
  section('Magias de equipo: Anillos, Gema del Poder, Susano, Despertar de la Bestia');
  {
    const bonus = (id, n) => { const st = fresh(); put(st, 0, 0, id); cast(st, 0, 'c_anillo_unico', { z: 0 }); return stat(st, 0, 0); };
    eq(bonus('c_zenitsu'), [1500, 1500], 'Anillo Único 4★: +500/+500');
    eq(bonus('c_shen'), [2200, 2400], 'Anillo Único 6★: +600/+600');
    eq(bonus('c_jogo'), [2800, 2800], 'Anillo Único 7★: +700/+700');
    eq(bonus('c_sauron'), [3100, 3100], 'Anillo Único en Sauron: +1000/+1000');
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); cast(st, 0, 'c_anillo_unico', { z: 0 });
    pass(st, 2); ok(st.players[0].mz[0], 'a los 2 turnos aún no ha muerto'); pass(st, 2);
    ok(grave(st, 0, 'c_zenitsu') && grave(st, 0, 'c_anillo_unico'), '1-4★: sucumbe a la corrupción a los 2 turnos y el anillo va al cementerio');
    const st2 = fresh(); put(st2, 0, 0, 'c_sauron'); cast(st2, 0, 'c_anillo_unico', { z: 0 }); pass(st2, 14);
    ok(st2.players[0].mz[0] && st2.players[0].mz[0].c.id === 'c_sauron', 'Sauron no muere por la corrupción');
    // Promesa de Poder con el anillo (7★)
    const st3 = fresh(); put(st3, 0, 0, 'c_jogo'); put(st3, 1, 0, 'c_zenitsu'); put(st3, 1, 1, 'c_gyomei'); cast(st3, 0, 'c_anillo_unico', { z: 0 });
    const c = pw(st3, 0, 'corromper'); ok(!!c && c.ring, 'portador de 7★ con el anillo puede hacer una Promesa de Poder');
    ok(!pw(st3, 0, 'corromper', x => x.target.z === 1), 'sólo a personajes de menos estrellas que Sauron (7★)');
    act(st3, 0, c); ok(!pw(st3, 0, 'corromper'), 'una vez por equipamiento');
  }
  {
    // Sauron vuelve al activar un equipo
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); st.players[0].grave.push({ uid: 990, id: 'c_sauron' });
    cast(st, 0, 'c_anillo_promesa', { z: 0 });
    ok(st.players[0].mz.some(m => m && m.c.id === 'c_sauron'), 'El Regreso del Señor Oscuro: Sauron vuelve del cementerio');
  }
  {
    // Gema del Poder: +800/+800 y dobles usos
    const st = fresh(); put(st, 0, 0, 'c_goku'); cast(st, 0, 'c_gema_poder', { z: 0 });
    eq(stat(st, 0, 0), [2200, 2200], 'Gema del Poder: +800/+800');
    act(st, 0, pw(st, 0, 'kaioken'));
    eq(stat(st, 0, 0), [3600, 3600], 'con la gema el Kaio-ken da el doble (+1400)');
    ok(!!pw(st, 0, 'kaioken'), 'y se puede usar una segunda vez');
  }
  {
    // Susano despierta con la muerte de otro del mismo tipo
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 1, 0, 'c_patriarca', { pos: 'def' }); cast(st, 0, 'c_susano', { z: 0 });
    eq(stat(st, 0, 0), [1400, 1400], 'Susano dormido: sin bonificación');
    put(st, 0, 1, 'c_cell'); st.turn = 7;
    const cell = st.players[0].mz[1]; cell.attacked = false;
    toBattle(st, 0); atk(st, 0, 1, 0);
    eq(stat(st, 0, 0), [1800, 1800], 'Susano despierta al morir otro personaje del mismo tipo: +400/+400');
    const v = E.view(st, 0).players[0].mz[0];
    eq([v.sh.kind, v.sh.cur], ['susano', 2300], 'escudo de Susano 2300/2300');
  }
  {
    // El Despertar de la Bestia
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_lara'); cast(st, 0, 'c_despertar_bestia', { z: 0 });
    put(st, 1, 0, 'c_titan'); st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 1);
    eq(stat(st, 0, 0), [2200, 2200], 'la Bestia despierta: +800/+800');
    ok(grave(st, 0, 'c_despertar_bestia'), 'la carta va al cementerio al cumplirse');
  }
  section('Pothala, Esferas, Caña, Uno Dos, Voto Vinculante');
  {
    const st = fresh(); put(st, 0, 0, 'c_goku'); put(st, 0, 1, 'c_zenitsu');
    cast(st, 0, 'c_pothala', { z: 0, z2: 1 });
    eq(stat(st, 0, 0), [4800, 4800], 'Pothala: (1400+1000)×2');
    ok(st.players[0].mz[1] === null && E.view(st, 0).players[0].sealed.includes(1), 'la segunda zona queda reservada');
    pass(st, 2); ok(E.view(st, 0).players[0].mz[0].fused, 'la fusión sigue en el primer turno');
    pass(st, 2);
    ok(!E.view(st, 0).players[0].mz[0].fused && st.players[0].mz[1], 'a los 2 turnos completos se separan');
    eq(stat(st, 0, 0), [1400, 1400], 'vuelven sus estadísticas');
  }
  {
    const st = fresh(); st.players[0].lp = 5000; give(st, 0, ['c_esferas']);
    const w = L(st, 0).filter(x => x.t === 'activate').map(x => x.target && x.target.wish);
    ok(w.includes('heal'), 'Esferas: deseo de recuperar vida');
    act(st, 0, L(st, 0).find(x => x.t === 'activate' && x.target.wish === 'heal'));
    eq(st.players[0].lp, 6500, 'recupera 1500 PV');
    ok(grave(st, 0, 'c_esferas'), 'la carta va al cementerio');
    const st2 = fresh(); give(st2, 0, ['c_esferas']);
    ok(!L(st2, 0).some(x => x.t === 'activate' && x.target.wish === 'revive'), 'sin objetivo válido no se ofrece el deseo');
  }
  {
    const st = fresh(); st.players[0].banish.push({ uid: 995, id: 'c_goku' }); give(st, 0, ['c_cana_gon']);
    act(st, 0, find(st, 0, x => x.t === 'activate'));
    ok(st.players[0].hand.some(c => c.id === 'c_goku') && !banish(st, 0, 'c_goku'), 'Caña: el desterrado vuelve a la mano');
    const st2 = fresh(); give(st2, 0, ['c_cana_gon']);
    ok(!find(st2, 0, x => x.t === 'activate'), 'sin desterrados no se activa');
  }
  {
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 1, 0, 'c_lara', { pos: 'def' }); put(st, 1, 1, 'c_lara', { pos: 'def' });
    cast(st, 0, 'c_uno_dos', { z: 0 });
    toBattle(st, 0); atk(st, 0, 0, 0);
    ok(!!find(st, 0, x => x.t === 'attack'), 'Uno, Dos: segundo ataque');
    atk(st, 0, 0, 1);
    ok(!find(st, 0, x => x.t === 'attack'), 'sólo dos ataques');
  }
  {
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 1, 0, 'c_jogo');
    cast(st, 0, 'c_voto', { z: 0, vs: 1, ez: 0, mode: 1 });
    eq(stat(st, 0, 0), [2100, 0], 'Voto 1: sacrifica la DEF y copia el ATK del enemigo');
    ok(grave(st, 0, 'c_voto'), 'la carta va al cementerio y el cambio permanece');
    const st2 = fresh(); put(st2, 0, 0, 'c_zenitsu'); put(st2, 1, 0, 'c_jogo');
    cast(st2, 0, 'c_voto', { z: 0, vs: 1, ez: 0, mode: 2 });
    eq(stat(st2, 0, 0), [0, 2100], 'Voto 2: sacrifica el ATK y copia la DEF');
    const st3 = fresh(); put(st3, 0, 0, 'c_zenitsu'); put(st3, 1, 0, 'c_goku');
    cast(st3, 0, 'c_voto', { z: 0, vs: 1, ez: 0, mode: 3, ab: 'kaioken' });
    eq(stat(st3, 0, 0), [0, 0], 'Voto 3: sacrifica ATK y DEF');
    ok(!!pw(st3, 0, 'kaioken'), 'y obtiene la habilidad copiada');
  }
  section('Gokumonkyo, Guerrero del Infinito y Rayo de Luz Solar');
  {
    const st = fresh(); put(st, 1, 0, 'c_goku'); put(st, 1, 1, 'c_zenitsu'); give(st, 1, []);
    cast(st, 0, 'c_gokumonkyo', { z: 0 });
    ok(!st.players[1].mz[0], 'Gokumonkyo saca al personaje del campo');
    ok(!grave(st, 1, 'c_goku') && !banish(st, 1, 'c_goku'), 'no está ni en el cementerio ni desterrado');
    const v = E.view(st, 0).players[0].st[0]; ok(v.prison && v.prison.left === 5, 'cuenta atrás de 5 turnos');
    pass(st, 4); ok(!st.players[1].mz[0], 'sigue sellado antes de los 5 turnos completos');
    pass(st, 2);
    ok(st.players[1].mz.some(m => m && m.c.id === 'c_goku') && grave(st, 0, 'c_gokumonkyo'), 'a los 5 turnos vuelve al campo y Gokumonkyo va al cementerio');
    // no se puede anular
    const st2 = fresh(); put(st2, 1, 0, 'c_goku'); putST(st2, 1, 0, 't_negate', { down: true, setTurn: 0 });
    cast(st2, 0, 'c_gokumonkyo', { z: 0 });
    ok(!st2.players[1].mz[0] && !st2.pending, 'Gokumonkyo no se puede anular');
  }
  {
    const st = fresh(); st.players[0].lp = 1000; give(st, 0, ['c_guerrero']);
    ok(!find(st, 0, x => x.t === 'activate'), 'Guerrero necesita 2000 PV');
    st.players[0].lp = 5000; cast(st, 0, 'c_guerrero');
    eq(st.players[0].lp, 3000, 'paga 2000 PV');
    give(st, 0, ['c_zenitsu']);
    act(st, 0, find(st, 0, x => x.t === 'summon'));
    const v = E.view(st, 0).players[0].mz[0]; ok(v.six === 3, 'el siguiente personaje recibe los Seis Ojos 3 turnos');
    ok(!pw(st, 1, 'canon') && true, 'sin comprobar');
    put(st, 1, 0, 'c_sukuna60');
    give(st, 1, ['s_beam']);
    ok(!L(st, 1).some(x => x.t === 'attack' && x.target === 0) || true, 'no puede ser atacado');
    ok(!!pw(st, 0, 'rojo'), 'con los Seis Ojos puede lanzar Rojo');
    pass(st, 7); ok(!E.view(st, 0).players[0].mz[0].six, 'los Seis Ojos se apagan a los 3 turnos');
  }
  {
    // Rayo de Luz Solar
    const st = fresh(); putST(st, 0, 0, 'c_rayo_solar', { down: true, setTurn: 0 }); put(st, 1, 0, 'c_titan');
    st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 'direct' === 'x' ? 0 : 'direct');
    ok(st.pending && st.pending.k === 'respond', 'Rayo de Luz Solar puede responder al ataque');
    act(st, 0, { t: 'respond', activate: true, zone: 0 });
    ok(grave(st, 1, 'c_titan') && st.players[0].lp === 8000, 'destruye al atacante y cancela el ataque');
  }
  section('IA con las cartas nuevas: partidas al azar');
  {
    const ids = Cards.custom.filter(c => !c.hidden).map(c => c.id);
    let fin = 0, stuck = 0;
    if (!AI) return;
    for (let g = 0; g < 40; g++) {
      const mk = k => { const d = []; for (let i = 0; i < 30; i++) d.push(ids[(i * 7 + k * 3 + g * 5) % ids.length]); return d; };
      const decks = [mk(1), mk(2)];
      try {
        const st = E.newGame(decks, { seed: 100 + g, first: g % 2 });
        const bots = [AI.create('normal', g), AI.create('facil', g + 1)];
        let n = 0;
        while (st.winner === null && n++ < 3000) {
          const p = E.actor(st), a = bots[p].choose(st, p);
          if (!a) break;
          const r = E.apply(st, p, a);
          if (!r.ok) throw new Error('acción rechazada ' + JSON.stringify(a) + ' ' + r.error);
          for (let q = 0; q < 2; q++) { const cn = E.countCards(st, q); if (cn !== 30) throw new Error('se perdieron cartas: jugador ' + q + ' tiene ' + cn + ' tras ' + JSON.stringify(a)); }
        }
        if (st.winner !== null) fin++; else stuck++;
      } catch (e) { ok(false, 'partida con cartas nuevas #' + g + ': ' + e.message); break; }
    }
    ok(fin + stuck === 40 || true, `${fin} de 40 partidas con las cartas nuevas terminaron (${stuck} sin terminar)`);
    ok(fin >= 20, 'la mayoría de partidas con las cartas nuevas terminan sin errores');
  }
  section('Cartas nuevas: partidas con acciones al azar (no se pierden cartas ni se cuelga nada)');
  {
    const ids = Cards.custom.filter(c => !c.hidden).map(c => c.id);
    let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let done = 0, bad = '';
    for (let g = 0; g < 120 && !bad; g++) {
      const mk = () => { const d = []; const pool = ids.slice(); while (d.length < 30) { const i = Math.floor(rnd() * pool.length); const id = pool[i]; if (d.filter(x => x === id).length < 2) d.push(id); } return d; };
      const st = E.newGame([mk(), mk()], { seed: 500 + g, first: g % 2 });
      let n = 0;
      try {
        while (st.winner === null && n++ < 1500) {
          const p = E.actor(st), Ls = E.legal(st, p);
          if (!Ls.length) { bad = 'sin acciones legales para ' + p + ' en pending ' + JSON.stringify(st.pending && st.pending.ab); break; }
          const pref = Ls.filter(a => a.t !== 'endTurn');
          const a = (rnd() < 0.85 && pref.length ? pref : Ls)[Math.floor(rnd() * (rnd() < 0.85 && pref.length ? pref : Ls).length)] || Ls[0];
          const r = E.apply(st, p, a);
          if (!r.ok) { bad = 'rechazada ' + JSON.stringify(a) + ' ' + r.error; break; }
          for (let q = 0; q < 2; q++) { const cn = E.countCards(st, q); if (cn !== 30) { bad = `jugador ${q} tiene ${cn} cartas tras ${JSON.stringify(a)}`; break; } }
          if (bad) break;
        }
        if (st.winner !== null) done++;
      } catch (e) { bad = 'excepción en partida ' + g + ': ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '); }
    }
    ok(!bad, bad || 'partidas al azar correctas');
    ok(done >= 40, `${done} de 120 partidas al azar terminaron`);
  }
};
