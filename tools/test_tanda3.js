/* Pruebas de la tanda 3 (25-10-2026): Rika Orimoto, Yuta Okkotsu y los cambios de reglas
 * (Total Counter, Anillo de la Promesa, Anti-Venom, IA). Se carga desde tools/test_duelo.js. */
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
  const toBattle = (st, p) => act(st, p, { t: 'toBattle' });
  const atkA = (st, p, z, tz, vs) => L(st, p).find(x => x.t === 'attack' && x.zone === z && x.target === tz && (vs === undefined ? x.vs !== p : x.vs === vs));
  const atk = (st, p, z, tz, vs) => { const a = atkA(st, p, z, tz, vs); if (!a) throw new Error('no hay ataque ' + z + '→' + tz); act(st, p, a); };
  const pw = (st, p, pwn, f) => L(st, p).find(a => (a.t === 'power' || a.t === 'spow') && a.pw === pwn && (!f || f(a)));
  const stat = (st, p, z) => { const m = E.view(st, p).players[p].mz[z]; return m ? [m.atk, m.def] : null; };
  const answer = (st, p, a) => act(st, p, Object.assign({ t: 'ability' }, a));
  const pass = (st, n) => { for (let i = 0; i < (n || 1); i++) { const p = E.actor(st); const a = find(st, p, x => x.t === 'endTurn') || find(st, p, x => x.t === 'discard'); act(st, p, a); } };

  section('tanda 3: catálogo (Rika y Yuta)');
  {
    const root = path.join(__dirname, '..');
    eq([Cards.get('c_yuta').level, Cards.get('c_yuta').atk, Cards.get('c_yuta').def, Cards.get('c_yuta').type], [10, 2500, 2500, 'jjk'], 'Yuta Okkotsu: 10★ 2500/2500');
    eq([Cards.get('c_rika').level, Cards.get('c_rika').atk, Cards.get('c_rika').def, Cards.get('c_rika').type], [9, 2500, 2500, 'jjk'], 'Rika Orimoto: 9★ 2500/2500');
    for (const id of ['c_yuta', 'c_rika']) {
      const c = Cards.get(id);
      ok(c.img && fs.existsSync(path.join(root, c.img)), id + ' tiene imagen');
      for (const k in (c.sfx || {})) ok(fs.existsSync(path.join(root, c.sfx[k])), id + ' sonido ' + k + ' existe');
      for (const a of c.ab) ok(Cards.AB[a], id + ': la habilidad ' + a + ' tiene texto');
      ok(Cards.all().some(x => x.id === id), id + ' sale en la colección');
    }
  }

  section('Rika Orimoto: felicidad, bonificaciones y Anillo de la Promesa');
  {
    const st = fresh(); put(st, 0, 0, 'c_rika'); put(st, 1, 0, 'c_lara', { pos: 'def' });
    eq(stat(st, 0, 0), [2500, 2500], 'Rika sola (sin Yuta ni anillo): 2500/2500');
    put(st, 0, 1, 'c_yuta');
    eq(stat(st, 0, 0), [3200, 3200], 'con Yuta en el campo: +700/+700');
    st.players[0].mz[1] = null;
    // Anillo en otro personaje (aunque Yuta no esté): +700
    const lara = put(st, 0, 1, 'c_lara'); putST(st, 0, 0, 'c_anillo_promesa', { equipTo: 1, promise: true, bearer: lara.c.uid });
    eq(stat(st, 0, 0), [3200, 3200], 'Anillo en otro personaje: +700/+700');
    eq(stat(st, 0, 1), [500, 500], 'el portador recibe +200/+200 del anillo');
    // Anillo + Yuta (en otro personaje): no se acumulan
    put(st, 0, 2, 'c_yuta');
    eq(stat(st, 0, 0), [3200, 3200], 'Yuta y anillo a la vez no se acumulan');
    // Anillo en Yuta: +1200
    st.players[0].st[0] = null; st.players[0].mz[2] = null; st.players[0].mz[1] = null;
    const y = put(st, 0, 1, 'c_yuta'); putST(st, 0, 0, 'c_anillo_promesa', { equipTo: 1, promise: true, bearer: y.c.uid });
    eq(stat(st, 0, 0), [3700, 3700], 'Anillo equipado a Yuta: +1200/+1200');
    eq(stat(st, 0, 1), [2700, 2700], 'Yuta recibe sus +200/+200 propios');
    // si el anillo se desvincula de su portador original no funciona
    st.players[0].st[0].bearer = 9999;
    st.players[0].mz[1] = null;
    eq(stat(st, 0, 0), [2500, 2500], 'sin Yuta y con un portador distinto del original no hay bonificación');
    // el anillo de otro jugador también cuenta (no importa quién controle al portador)
    const st2 = fresh(); put(st2, 0, 0, 'c_rika'); const q = put(st2, 1, 0, 'c_lara'); putST(st2, 1, 0, 'c_anillo_promesa', { equipTo: 0, promise: true, bearer: q.c.uid });
    eq(stat(st2, 0, 0), [3200, 3200], 'el anillo de cualquier personaje del campo cuenta');
  }
  {
    // el anillo no se puede equipar a Rika (Protección Absoluta) y el equipo sigue al portador original
    const st = fresh(); put(st, 0, 0, 'c_rika'); put(st, 0, 1, 'c_lara'); give(st, 0, ['c_anillo_promesa']);
    const acts = L(st, 0).filter(a => a.t === 'activate');
    ok(acts.length === 1 && acts[0].target.z === 1, 'el anillo sólo se puede equipar a otros personajes, no a Rika');
    act(st, 0, acts[0]);
    const slot = st.players[0].st.find(Boolean);
    ok(slot.bearer === st.players[0].mz[1].c.uid, 'el anillo registra a su portador original');
    ok(E.view(st, 0).players[0].st[0].bearer === 'c_lara', 'la vista muestra el portador permanente');
    // si el portador sale del campo el anillo va al cementerio y no pasa a otro
    E.apply; st.players[0].mz[1] = null; st.players[0].st[0] = slot; slot.equipTo = 1;
    put(st, 0, 1, 'c_zenitsu');
    eq(stat(st, 0, 0), [2500, 2500], 'otro personaje en la misma zona no hereda el anillo');
  }

  section('Rika Orimoto: Maldición Incontrolable');
  {
    const st = fresh(); put(st, 0, 0, 'c_rika'); put(st, 0, 1, 'c_lara'); put(st, 1, 0, 'c_zenitsu'); st.turn = 7;
    ok(!find(st, 0, a => a.t === 'endTurn'), 'sin Yuta ni anillo no puede terminar el turno sin atacar (fase principal)');
    ok(!!find(st, 0, a => a.t === 'toBattle'), 'puede pasar a la fase de batalla');
    ok(!find(st, 0, a => a.t === 'pos' && a.zone === 0), 'no puede ponerse en defensa para evitar atacar');
    toBattle(st, 0);
    ok(!find(st, 0, a => a.t === 'endTurn'), 'en batalla tampoco puede terminar sin atacar con Rika');
    const as = L(st, 0).filter(a => a.t === 'attack' && a.zone === 0);
    ok(as.some(a => a.target === 0 && a.vs === undefined), 'puede atacar a un personaje enemigo');
    ok(as.some(a => a.target === 1 && a.vs === 0), 'puede atacar a un personaje aliado');
    ok(!as.some(a => a.target === 'direct'), 'no puede atacar directo si hay personajes');
    atk(st, 0, 0, 1, 0);
    ok(!!find(st, 0, a => a.t === 'endTurn'), 'tras atacar puede terminar el turno');
    ok(grave(st, 0, 'c_lara'), 'el combate contra el aliado se resuelve con las reglas generales (Lara muere)');
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_rika', 'Rika sobrevive (2500 vs 300)');
  }
  {
    // ataque directo obligatorio si no hay personajes
    const st = fresh(); put(st, 0, 0, 'c_rika'); st.turn = 7; toBattle(st, 0);
    const as = L(st, 0).filter(a => a.t === 'attack');
    ok(as.length === 1 && as[0].target === 'direct', 'sin otros personajes ataca directo');
    atk(st, 0, 0, 'direct');
    ok(st.players[1].lp === 8000 - 2500, 'daño directo con sus estadísticas actuales');
  }
  {
    // feliz: ataca cuando quiere y sólo a enemigos
    const st = fresh(); put(st, 0, 0, 'c_rika'); put(st, 0, 1, 'c_yuta'); put(st, 1, 0, 'c_zenitsu'); st.turn = 7;
    ok(!!find(st, 0, a => a.t === 'endTurn'), 'con Yuta en el campo puede terminar el turno sin atacar');
    toBattle(st, 0);
    ok(!L(st, 0).some(a => a.t === 'attack' && a.vs === 0), 'feliz: no puede atacar a aliados');
    // Yuta se va: vuelve a ser obligada
    st.players[0].mz[1] = null;
    ok(!L(st, 0).some(a => a.t === 'endTurn'), 'sin Yuta vuelve a estar obligada a atacar');
    eq(stat(st, 0, 0), [2500, 2500], 'pierde la bonificación al instante');
  }
  {
    // el ataque a aliados no abre ventana de trampas del propio jugador
    const st = fresh(); put(st, 0, 0, 'c_rika'); put(st, 0, 1, 'c_lara', { pos: 'def' }); putST(st, 0, 0, 'c_rayo_solar', { down: true });
    put(st, 1, 0, 'c_zenitsu'); st.turn = 7; toBattle(st, 0);
    atk(st, 0, 0, 1, 0);
    ok(!st.pending || st.pending.k !== 'respond', 'atacar a un aliado no activa trampas propias');
  }

  section('Rika Orimoto: Protección Absoluta');
  {
    const st = fresh(); put(st, 1, 0, 'c_rika'); put(st, 1, 1, 'c_lara'); give(st, 0, ['s_beam']);
    const acts = L(st, 0).filter(a => a.t === 'activate');
    ok(acts.length === 1 && acts[0].target.z === 1, 'una magia de destruir no puede elegir a Rika boca arriba');
    // destroyAll no la destruye
    const st2 = fresh(); put(st2, 0, 0, 'c_rika'); put(st2, 0, 1, 'c_lara');
    if (Cards.get('s_storm') || Cards.get('s_bomb')) { /* catálogo antiguo: se prueba con la trampa */ }
    const t = Cards.all().find(c => c.fx === 'destroyAll');
    if (t) { give(st2, 0, [t.id]); const a = L(st2, 0).find(x => x.t === 'activate'); if (a) { act(st2, 0, a); ok(st2.players[0].mz[0] && st2.players[0].mz[0].c.id === 'c_rika', 'destruir todo no destruye a Rika'); } }
    // trampa: el Rayo de Luz Solar no la destruye, pero el ataque se cancela
    const st3 = fresh(); put(st3, 0, 0, 'c_rika'); put(st3, 0, 1, 'c_yuta'); putST(st3, 1, 0, 'c_rayo_solar', { down: true });
    put(st3, 1, 0, 'c_lara'); st3.turn = 7; toBattle(st3, 0); atk(st3, 0, 0, 0);
    act(st3, 1, find(st3, 1, a => a.t === 'respond' && a.activate));
    ok(st3.players[0].mz[0] && st3.players[0].mz[0].c.id === 'c_rika', 'la trampa que destruye al atacante no afecta a Rika');
    ok(st3.players[1].mz[0] && !st3.pending, 'el ataque queda cancelado (efecto independiente)');
    // Gem de la mente / voto no la eligen
    const st4 = fresh(); put(st4, 1, 0, 'c_rika'); put(st4, 0, 0, 'c_zenitsu'); give(st4, 0, ['c_voto']);
    ok(!L(st4, 0).some(a => a.t === 'activate'), 'Voto Vinculante no puede elegirla');
    // Rika sí recibe daño de ataques y habilidades
    const st5 = fresh(); put(st5, 1, 0, 'c_rika'); put(st5, 0, 0, 'c_titan'); st5.turn = 7; toBattle(st5, 0);
    ok(!!atkA(st5, 0, 0, 0), 'los ataques sí pueden elegirla (la inmunidad es sólo a magias y trampas)');
    const st6 = fresh(); put(st6, 1, 0, 'c_rika'); put(st6, 0, 0, 'c_spiderman'); st6.turn = 7;
    ok(!!pw(st6, 0, 'telar', a => a.target.z === 0), 'las habilidades de otros personajes sí pueden elegirla');
  }

  section('Yuta Okkotsu: Amor Mutuo y Verdadero');
  {
    const st = fresh(); put(st, 0, 0, 'c_yuta'); put(st, 0, 1, 'c_jogo'); put(st, 1, 0, 'c_sukuna60'); put(st, 1, 1, 'c_lara');
    const a = pw(st, 0, 'ydominio'); ok(!!a, 'Yuta puede activar su dominio');
    act(st, 0, a);
    ok(!!st.domain && st.domain.min === 11, 'el dominio sólo permite habilidades a los de más de 10★');
    eq(stat(st, 0, 0), [3000, 3000], 'Yuta gana +500/+500');
    ok(!pw(st, 0, 'ydominio'), 'el dominio no se reinicia ni se acumula');
    ok(!pw(st, 0, 'llama', () => true) && !L(st, 0).some(x => x.t === 'power' && x.zone === 1), 'Jogo (7★) no puede usar habilidades');
    const v = E.view(st, 1);
    ok(v.players[1].mz[0].muted, 'Sukuna (10★) tampoco: el enemigo también queda silenciado');
    ok(!!st.domain && E.view(st, 0).domain.nm === 'de Yuta' && E.view(st, 0).domain.noST, 'la vista informa del dominio de Yuta');
    // dura 2 turnos completos
    pass(st, 6);
    ok(!st.domain, 'el dominio termina tras 2 turnos (rondas) completos');
    eq(stat(st, 0, 0), [2500, 2500], 'se retira sólo su bonificación');
  }
  {
    // magias y trampas del campo desactivadas durante el dominio
    const st = fresh(); const lz = put(st, 0, 0, 'c_lara'); put(st, 0, 1, 'c_yuta'); putST(st, 0, 0, 'c_gema_poder', { equipTo: 0 });
    st.players[0].st[0].c.id = 'c_gema_poder';
    const eqSpell = Cards.all().find(c => c.fx === 'equip' && c.eAtk);
    if (eqSpell) {
      putST(st, 0, 1, eqSpell.id, { equipTo: 0 });
      const before = stat(st, 0, 0)[0];
      act(st, 0, pw(st, 0, 'ydominio'));
      ok(stat(st, 0, 0)[0] < before + 1 && stat(st, 0, 0)[0] === before - (eqSpell.eAtk || 0) - 800, 'los equipamientos dejan de dar estadísticas durante el dominio');
      pass(st, 6);
      eq(stat(st, 0, 0)[0], before, 'al terminar el dominio las magias recuperan su funcionamiento');
      ok(st.players[0].st[1] && st.players[0].st[1].c.id === eqSpell.id, 'el dominio no destruye las cartas');
    }
    const st2 = fresh(); put(st2, 0, 0, 'c_yuta'); give(st2, 0, ['s_beam']); put(st2, 1, 0, 'c_lara'); putST(st2, 1, 0, 't_barrier', { down: true });
    act(st2, 0, pw(st2, 0, 'ydominio'));
    ok(!L(st2, 0).some(a => a.t === 'activate' || a.t === 'setst' && false), 'nadie activa magias durante el dominio');
  }
  {
    // copia de habilidades del campo (aliadas y enemigas)
    const st = fresh(); put(st, 0, 0, 'c_yuta'); put(st, 1, 0, 'c_sukuna60'); put(st, 1, 1, 'c_lara'); putST(st, 1, 0, 't_barrier', { down: true });
    ok(!pw(st, 0, 'desmantelar'), 'fuera del dominio no usa la habilidad ajena');
    act(st, 0, pw(st, 0, 'ydominio'));
    const d = pw(st, 0, 'desmantelar');
    ok(!!d, 'durante el dominio usa Desmantelar de un enemigo boca arriba');
    act(st, 0, d);
    ok(!st.players[1].st[0], 'la habilidad copiada funciona (destruye la trampa)');
    ok(!pw(st, 0, 'desmantelar'), 'conserva el límite original: una vez por invocación');
    ok(st.players[1].mz[0] && !st.players[1].mz[0].ext, 'no modifica la habilidad original del personaje');
    // el personaje de origen se va: ya no puede copiarla
    const st2 = fresh(); put(st2, 0, 0, 'c_yuta'); const s60 = put(st2, 1, 0, 'c_sukuna60'); putST(st2, 1, 0, 't_barrier', { down: true });
    act(st2, 0, pw(st2, 0, 'ydominio'));
    ok(!!pw(st2, 0, 'desmantelar'), 'disponible mientras el origen esté boca arriba');
    s60.down = true;
    ok(!pw(st2, 0, 'desmantelar'), 'si el origen se pone boca abajo ya no se puede copiar');
    // habilidades aliadas
    const st3 = fresh(); put(st3, 0, 0, 'c_yuta'); put(st3, 0, 1, 'c_zenitsu'); put(st3, 1, 0, 'c_lara');
    ok(!pw(st3, 0, 'conc', a => a.zone === 0), 'sin dominio no copia la Concentración Total');
    act(st3, 0, pw(st3, 0, 'ydominio'));
    ok(!!pw(st3, 0, 'conc', a => a.zone === 0), 'copia la habilidad de un aliado');
    act(st3, 0, pw(st3, 0, 'conc', a => a.zone === 0));
    eq(stat(st3, 0, 0), [2500 + 500 + 400, 2500 + 500 + 400], 'la habilidad copiada se aplica a Yuta (no copia estadísticas ni identidad)');
    ok(E.view(st3, 0).players[0].mz[0].c.id === 'c_yuta', 'sigue siendo Yuta');
  }

  section('Yuta Okkotsu: Copia de Técnicas');
  {
    const st = fresh(); put(st, 0, 0, 'c_yuta'); put(st, 0, 1, 'c_zenitsu'); put(st, 1, 0, 'c_lara');
    act(st, 0, pw(st, 0, 'conc', a => a.zone === 1));
    ok(st.pending && st.pending.ab === 'yutalearn' && st.pending.player === 0, 'Yuta puede aprender la habilidad que ve usar');
    answer(st, 0, { use: true });
    const vy = E.view(st, 0).players[0].mz[0];
    ok(vy.ext.includes('zenitsu2') && vy.yuta.learned.length === 1 && vy.yuta.lrnTurn, 'la aprende y queda registrada (1/3)');
    ok(!!pw(st, 0, 'conc', a => a.zone === 0), 'puede usarla después, fuera del dominio');
    // la aprendida se conserva si el origen se va
    st.players[0].mz[1] = null;
    ok(!!pw(st, 0, 'conc', a => a.zone === 0), 'se conserva aunque el personaje de origen abandone el campo');
    // sólo una por turno
    put(st, 0, 2, 'c_gyomei'); act(st, 0, pw(st, 0, 'conc2'));
    ok(!st.pending, 'sólo puede aprender una habilidad por turno');
  }
  {
    // rechazar no ocupa espacio; máximo 3; no repite
    const st = fresh(); put(st, 0, 0, 'c_yuta'); put(st, 0, 1, 'c_zenitsu'); put(st, 0, 2, 'c_gyomei'); put(st, 1, 0, 'c_lara');
    act(st, 0, pw(st, 0, 'conc', a => a.zone === 1)); answer(st, 0, { use: false });
    eq(E.view(st, 0).players[0].mz[0].yuta.learned.length, 0, 'rechazar no ocupa espacio');
    ok(!E.view(st, 0).players[0].mz[0].ext, 'y no la aprende');
    st.players[0].mz[1].uBy = {};
    // aprende 3 en 3 turnos y la cuarta no
    const learnNow = (z, pwn) => { ready(st, 0, st.turn + 2); const a = pw(st, 0, pwn, x => x.zone === z); if (!a) return null; act(st, 0, a); if (st.pending && st.pending.ab === 'yutalearn') { answer(st, 0, { use: true }); return true; } return false; };
    ok(learnNow(1, 'conc') === true, 'aprende la primera'); st.players[0].mz[1].uBy = {};
    ok(learnNow(2, 'conc2') === true, 'aprende la segunda');
    st.players[0].mz[2].uBy = {};
    ok(learnNow(2, 'marca') === true, 'aprende la tercera');
    eq(E.view(st, 0).players[0].mz[0].yuta.learned.length, 3, 'tiene 3 aprendidas');
    st.players[0].mz[1].uBy = {};
    put(st, 0, 1, 'c_patriarca');
    ok(learnNow(1, 'desp') === false, 'no puede aprender una cuarta');
  }

  section('Yuta Okkotsu: Rika Orimoto, Intercepción Protectora');
  {
    const st = fresh(); put(st, 0, 0, 'c_popeye'); put(st, 0, 1, 'c_yuta'); put(st, 1, 0, 'c_titan'); st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 0);
    ok(st.pending && st.pending.ab === 'rika' && st.pending.player === 0, 'Rika puede interceptar un ataque mortal a un aliado');
    answer(st, 0, { use: true });
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_popeye' && st.players[0].lp === 8000, 'el aliado sobrevive y no hay daño');
    ok(st.players[1].mz[0] && st.players[1].lp === 8000, 'no causa daño al atacante');
    const vy = E.view(st, 0).players[0].mz[1].yuta;
    eq([vy.rk, vy.rkMax, vy.rkTurn, vy.rkNext, vy.rkLast && vy.rkLast.ally], [1, 2, true, false, 'Popeye El Marinero'], 'la vista muestra 1/2, el turno y el aliado protegido');
    // sólo una vez por turno
    ready(st, 1, st.turn); st.phase = 'battle'; st.players[1].mz[0].attacked = false; st.players[1].mz[0].atkN = undefined;
    atk(st, 1, 0, 0);
    ok(!st.pending || st.pending.ab !== 'rika', 'sólo una intercepción por turno');
  }
  {
    // 2 usos por invocación y declinar no gasta
    const st = fresh(); put(st, 0, 0, 'c_popeye'); put(st, 0, 1, 'c_yuta'); put(st, 1, 0, 'c_titan'); st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 0); answer(st, 0, { use: false });
    ok(!st.players[0].mz[0], 'si el jugador declina, el golpe se resuelve');
    const st2 = fresh(); put(st2, 0, 0, 'c_popeye'); put(st2, 0, 1, 'c_yuta'); put(st2, 1, 0, 'c_titan');
    let n = 0;
    for (let i = 0; i < 4; i++) {
      ready(st2, 1, 7 + i * 2); st2.phase = 'battle'; st2.players[1].mz[0].attacked = false; st2.players[1].mz[0].atkN = undefined;
      if (!st2.players[0].mz[0]) break;
      atk(st2, 1, 0, 0);
      if (st2.pending && st2.pending.ab === 'rika') { answer(st2, 0, { use: true }); n++; }
    }
    eq(n, 2, 'Rika sólo intercepta 2 veces por invocación de Yuta');
  }
  {
    // magias, trampas y habilidades
    const st = fresh(); put(st, 0, 0, 'c_popeye'); put(st, 0, 1, 'c_yuta'); st.current = 1; ready(st, 1); give(st, 1, ['s_beam']);
    act(st, 1, find(st, 1, a => a.t === 'activate'));
    ok(st.pending && st.pending.ab === 'rika', 'Rika intercepta una magia que destruye');
    answer(st, 0, { use: true });
    ok(!!st.players[0].mz[0] && st.players[1].grave.some(c => c.id === 's_beam'), 'el aliado se salva y la magia se gasta');
    const st2 = fresh(); put(st2, 0, 0, 'c_popeye'); put(st2, 0, 1, 'c_yuta'); put(st2, 1, 0, 'c_bardock_ssj'); ready(st2, 1);
    act(st2, 1, pw(st2, 1, 'canon', a => a.target.z === 0));
    ok(st2.pending && st2.pending.ab === 'rika', 'Rika intercepta una habilidad que destruye');
    answer(st2, 0, { use: true });
    ok(!!st2.players[0].mz[0], 'el aliado sobrevive al Cañón Espiritual');
    const st3 = fresh(); put(st3, 0, 0, 'c_popeye'); put(st3, 0, 1, 'c_yuta'); putST(st3, 1, 0, 'c_rayo_solar', { down: true });
    put(st3, 1, 0, 'c_lara'); st3.turn = 7; toBattle(st3, 0); atk(st3, 0, 0, 0);
    act(st3, 1, find(st3, 1, a => a.t === 'respond' && a.activate));
    ok(st3.pending && st3.pending.ab === 'rika' && st3.pending.player === 0, 'Rika intercepta también una trampa que mata al aliado');
    answer(st3, 0, { use: true });
    ok(st3.players[0].mz[0] && st3.players[0].mz[0].c.id === 'c_popeye' && st3.players[1].mz[0], 'el aliado vive y el ataque queda cancelado');
  }

  section('Meliodas: Total Counter (una vez por turno: magias, trampas, habilidades y ataques)');
  {
    // una vez por turno
    const st = fresh(); put(st, 1, 0, 'c_meliodas'); put(st, 0, 0, 'c_zenitsu'); put(st, 1, 1, 'c_creeper'); put(st, 1, 2, 'c_lara');
    give(st, 0, ['s_beam', 's_beam']);
    act(st, 0, find(st, 0, a => a.t === 'activate' && a.target.z === 1));
    answer(st, 1, { use: true }); answer(st, 1, { vs: 0, z: 0 });
    ok(grave(st, 0, 'c_zenitsu'), 'primera magia: se devuelve');
    put(st, 0, 0, 'c_zenitsu');
    act(st, 0, find(st, 0, a => a.t === 'activate' && a.target.z === 1));
    ok(!st.pending, 'segunda magia en el mismo turno: Total Counter ya se usó');
    ok(!st.players[1].mz[1], 'la segunda magia se resuelve con normalidad');
    // al turno siguiente vuelve a estar disponible, sin límite de veces en la partida
    const st2 = fresh(); put(st2, 1, 0, 'c_meliodas'); put(st2, 0, 0, 'c_zenitsu'); put(st2, 1, 1, 'c_creeper');
    let used = 0;
    for (let i = 0; i < 3; i++) {
      ready(st2, 0, 6 + i * 2); give(st2, 0, ['s_beam']); put(st2, 0, 0, 'c_zenitsu'); put(st2, 1, 1, 'c_creeper');
      act(st2, 0, find(st2, 0, a => a.t === 'activate' && a.target.z === 1));
      if (st2.pending && st2.pending.ab === 'meliodas') { answer(st2, 1, { use: true }); answer(st2, 1, { vs: 0, z: 0 }); used++; }
      st2.pending = null;
    }
    eq(used, 3, 'en turnos distintos puede usarlo todas las veces');
  }
  {
    // reflejar un ataque
    const st = fresh(); put(st, 1, 0, 'c_meliodas'); put(st, 0, 0, 'c_titan'); put(st, 0, 1, 'c_lara', { pos: 'def' }); st.turn = 7; toBattle(st, 0);
    atk(st, 0, 0, 0);
    ok(st.pending && st.pending.ab === 'meliodas' && st.pending.kind === 'attack', 'Meliodas puede devolver un ataque');
    answer(st, 1, { use: true });
    ok(st.pending && st.pending.stage === 'target', 'elige contra qué personaje del atacante se devuelve');
    answer(st, 1, { vs: 0, z: 1 });
    ok(grave(st, 0, 'c_lara') && st.players[1].mz[0], 'el ataque golpea al personaje elegido y Meliodas no recibe daño');
    // sin otros personajes: daño directo a su dueño
    const st2 = fresh(); put(st2, 1, 0, 'c_meliodas'); put(st2, 0, 0, 'c_zenitsu'); st2.turn = 7; toBattle(st2, 0); atk(st2, 0, 0, 0);
    const dmg2 = stat(st2, 0, 0)[0];
    answer(st2, 1, { use: true });
    ok(st2.players[0].lp === 8000 - dmg2 && !st2.pending && st2.players[1].lp === 8000, 'si no hay otro personaje, su dueño recibe el daño');
    // declinar: el ataque sigue
    const st3 = fresh(); put(st3, 1, 0, 'c_meliodas'); put(st3, 0, 0, 'c_titan'); st3.turn = 7; toBattle(st3, 0); atk(st3, 0, 0, 0);
    answer(st3, 1, { use: false });
    ok(!st3.players[1].mz[0], 'sin usarlo, el ataque se resuelve');
    // Yoriichi es inmune a las habilidades enemigas durante sus ataques
    const st4 = fresh(); put(st4, 1, 0, 'c_meliodas'); put(st4, 0, 0, 'c_yoriichi'); st4.turn = 7; toBattle(st4, 0); atk(st4, 0, 0, 0);
    ok(!st4.pending, 'Yoriichi atacando es inmune a Total Counter');
  }
  {
    // reflejar una trampa
    const st = fresh(); put(st, 0, 0, 'c_meliodas'); put(st, 0, 1, 'c_lara'); put(st, 1, 0, 'c_zenitsu'); put(st, 1, 1, 'c_creeper'); putST(st, 0, 0, 'c_rayo_solar', { down: true });
    st.current = 1; st.turn = 7; st.phase = 'battle'; atk(st, 1, 0, 0);
    // el que responde es el defensor (jugador 0): activa su trampa contra el atacante del jugador 1; el jugador 1 no tiene Meliodas
    act(st, 0, find(st, 0, a => a.t === 'respond' && a.activate));
    ok(!st.players[1].mz[0] && !st.pending, 'sin Meliodas rival la trampa funciona con normalidad');
    const st2 = fresh(); put(st2, 1, 0, 'c_meliodas'); put(st2, 1, 1, 'c_lara'); put(st2, 0, 0, 'c_zenitsu'); put(st2, 0, 1, 'c_creeper'); putST(st2, 0, 0, 'c_rayo_solar', { down: true });
    st2.current = 1; st2.turn = 7; st2.phase = 'battle';
    // ataca Meliodas del jugador 1 al jugador 0; el jugador 0 activa la trampa contra el atacante (de jugador 1)
    put(st2, 1, 2, 'c_titan'); atk(st2, 1, 2, 0);
    act(st2, 0, find(st2, 0, a => a.t === 'respond' && a.activate));
    ok(st2.pending && st2.pending.ab === 'meliodas' && st2.pending.kind === 'trap' && st2.pending.player === 1, 'Meliodas puede devolver una trampa enemiga');
    answer(st2, 1, { use: true });
    ok(st2.pending && st2.pending.stage === 'target', 'elige a quién se devuelve');
    answer(st2, 1, { vs: 0, z: 1 });
    ok(grave(st2, 0, 'c_creeper') && st2.players[1].mz[2], 'el efecto cae sobre el dueño de la trampa y el atacante no muere');
  }
  {
    // reflejar una habilidad
    const st = fresh(); put(st, 1, 0, 'c_meliodas'); put(st, 1, 1, 'c_lara'); put(st, 0, 0, 'c_bardock_ssj'); ready(st, 0);
    act(st, 0, pw(st, 0, 'canon', a => a.target.z === 1));
    ok(st.pending && st.pending.ab === 'meliodas' && st.pending.kind === 'power', 'Meliodas puede devolver una habilidad hostil');
    answer(st, 1, { use: true });
    ok(st.pending && st.pending.stage === 'target', 'elige el objetivo');
    answer(st, 1, { vs: 0, z: 0 });
    ok(grave(st, 0, 'c_bardock_ssj') && st.players[1].mz[1], 'el Cañón se devuelve contra su dueño');
    // declinar: la habilidad se resuelve
    const st2 = fresh(); put(st2, 1, 0, 'c_meliodas'); put(st2, 1, 1, 'c_lara'); put(st2, 0, 0, 'c_bardock_ssj'); ready(st2, 0);
    act(st2, 0, pw(st2, 0, 'canon', a => a.target.z === 1)); answer(st2, 1, { use: false });
    ok(grave(st2, 1, 'c_lara') && !st2.pending, 'sin usarlo la habilidad se resuelve');
    // en un dominio de Jogo (7★ o más) Meliodas (3★) no puede usar habilidades
    const st3 = fresh(); put(st3, 1, 0, 'c_meliodas'); put(st3, 1, 1, 'c_lara'); put(st3, 0, 0, 'c_bardock_ssj'); put(st3, 0, 1, 'c_jogo'); ready(st3, 0);
    st3.domain = { p: 0, uid: st3.players[0].mz[1].c.uid, t0: 6, x: 1, min: 7, nm: 'de Jogo' };
    ok(!find(st3, 0, a => a.t === 'activate'), 'sin magias en el dominio');
  }

  section('Anti-Venom: muere en lugar de su anfitrión');
  {
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 0, 1, 'c_lara'); give(st, 0, ['c_antivenom']);
    act(st, 0, find(st, 0, x => x.t === 'couple' && x.host === 0));
    eq(stat(st, 0, 0), [2000, 2000], 'acoplado: +1000/+1000');
    put(st, 1, 0, 'c_sukuna60'); st.turn = 7; st.current = 1; st.phase = 'battle';
    atk(st, 1, 0, 0);
    ok(!st.pending || st.pending.ab !== 'rika', 'sin Yuta, no hay otras reacciones');
    ok(grave(st, 0, 'c_antivenom'), 'Anti-Venom muere y va al cementerio');
    ok(st.players[0].mz[0] && st.players[0].mz[0].c.id === 'c_zenitsu' && !grave(st, 0, 'c_zenitsu'), 'el anfitrión sobrevive');
    eq(stat(st, 0, 0), [1000, 1000], 'el anfitrión queda normal (sin los +1000)');
    const v = E.view(st, 0).players[0].mz[0];
    ok(!v.av && !(v.link || []).includes('c_antivenom'), 'ya no está acoplado');
    ok(st.players[0].grave.filter(c => c.id === 'c_antivenom').length === 1, 'Anti-Venom está una sola vez en el cementerio');
    // una segunda vez el anfitrión ya no tiene protección
    ready(st, 1, 9); st.phase = 'battle'; st.players[1].mz[0].attacked = false; st.players[1].mz[0].atkN = undefined;
    atk(st, 1, 0, 0);
    ok(!st.players[0].mz[0], 'sin Anti-Venom el anfitrión muere con las reglas normales');
  }
  {
    // si el ataque no vence, Anti-Venom sigue
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 0, 1, 'c_lara'); give(st, 0, ['c_antivenom']);
    act(st, 0, find(st, 0, x => x.t === 'couple' && x.host === 0));
    put(st, 1, 0, 'c_lara'); st.turn = 7; st.current = 1; st.phase = 'battle'; atk(st, 1, 0, 0);
    ok(!grave(st, 0, 'c_antivenom') && E.view(st, 0).players[0].mz[0].av, 'si el atacante pierde, Anti-Venom no muere');
  }

  section('IA: Voto Vinculante y Marca de Cazador');
  {
    const ai = AI.create('normal', 1);
    // Voto: sacrifica DEF para copiar un ATK mucho mayor
    const st = fresh(); put(st, 0, 0, 'c_zenitsu'); put(st, 1, 0, 'c_sukuna60'); give(st, 0, ['c_voto']);
    const lg = L(st, 0).filter(a => a.t === 'activate');
    ok(lg.length > 0, 'Voto Vinculante tiene objetivos');
    const pick = ai.choose(st, 0);
    ok(pick && pick.t === 'activate' && pick.target.mode === 1, 'la IA usa el Voto para copiar el ATK de un enemigo mucho más fuerte');
    // sin enemigos más fuertes no lo usa
    const st2 = fresh(); put(st2, 0, 0, 'c_sukuna60'); put(st2, 1, 0, 'c_lara'); give(st2, 0, ['c_voto']);
    const p2 = ai.choose(st2, 0);
    ok(!(p2 && p2.t === 'activate'), 'no lo usa si no gana nada');
    // Marca de Cazador: la usa cuando puede ganar la partida o romper un empate
    const st3 = fresh(); put(st3, 0, 0, 'c_gyomei'); st3.players[1].lp = 2000; ready(st3, 0, 7);
    const p3 = ai.choose(st3, 0);
    ok(p3 && p3.t === 'power' && p3.pw === 'marca', 'la IA usa la Marca de Cazador cuando el rival está a punto de caer');
    const st4 = fresh(); put(st4, 0, 0, 'c_gyomei'); put(st4, 1, 0, 'c_lara', { pos: 'def' }); ready(st4, 0, 7);
    const p4 = ai.choose(st4, 0);
    ok(!(p4 && p4.t === 'power' && p4.pw === 'marca'), 'no la usa sin necesidad (Gyomei muere al terminar)');
  }

  section('IA y Rika / Yuta: partidas completas');
  {
    const ids = ['c_rika', 'c_yuta', 'c_meliodas', 'c_antivenom', 'c_sukuna60', 'c_zenitsu', 'c_bardock_ssj', 'c_jogo', 'c_anillo_promesa', 'c_voto', 'c_rayo_solar', 'c_gyomei', 'c_cell', 'c_popeye', 'c_lara'];
    let fin = 0, stuck = 0;
    for (let g = 0; g < 40; g++) {
      const mk = () => { const d = []; let i = 0; while (d.length < 30) { d.push(ids[i % ids.length]); i += 1 + (g % 3); } return d; };
      const st = E.newGame([mk(), mk()], { seed: 900 + g, first: g % 2 });
      const bots = [AI.create('normal', g), AI.create('facil', g + 1)];
      let n = 0;
      try {
        while (st.winner === null && n++ < 3000) {
          const p = E.actor(st), a = bots[p].choose(st, p);
          if (!a) throw new Error('la IA no tiene acción');
          const r = E.apply(st, p, a);
          if (!r.ok) throw new Error('acción rechazada ' + JSON.stringify(a) + ' ' + r.error);
          for (let q = 0; q < 2; q++) { const cn = E.countCards(st, q); if (cn !== 30) throw new Error('se perdieron cartas: jugador ' + q + ' tiene ' + cn + ' tras ' + JSON.stringify(a)); }
        }
        if (st.winner !== null) fin++; else stuck++;
      } catch (e) { ok(false, 'partida #' + g + ': ' + e.message); break; }
    }
    ok(fin >= 30, `${fin} de 40 partidas con Rika y Yuta terminaron (${stuck} sin terminar)`);
  }
};
