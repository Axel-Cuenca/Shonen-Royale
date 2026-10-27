/* Pruebas de la sala de espera (lobby, 26-10-2026): formato cambiable, hasta 3 invitados y el anfitrión decide cuándo empezar. */
'use strict';
module.exports = function (T) {
  const { ok, eq, section, Match, Cards, until } = T;
  return async function () {
    section('Lobby: sala de espera con formato cambiable');
    const mk = (n) => {
      const h = Match.host({ deck: Cards.presetDeck('water'), name: 'Axel', n: 2, mode: 'duel', seed: 51, delay: 100000, autoStart: false });
      const gs = [], msgs = [];
      for (let i = 0; i < n; i++) {
        const [th, tg] = Match.memoryPair(0);
        h.addGuest(th);
        const g = Match.guest({ deck: Cards.presetDeck(['fire', 'grass', 'ice'][i]), name: 'J' + (i + 1), transport: tg, helloMs: 20 });
        const st = []; g.onStatus(s => st.push(s)); gs.push(g); msgs.push(st);
      }
      h.start(); gs.forEach(g => g.start());
      return { h, gs, msgs };
    };
    {
      const { h, gs, msgs } = mk(1);
      ok(await until(() => h.lobby().filter(x => x.ready).length === 1, 1000), 'un invitado entra y no empieza solo');
      ok(await until(() => msgs[0].some(s => s.k === 'lobby'), 1000), 'el invitado recibe el estado de la sala');
      const l = msgs[0].filter(s => s.k === 'lobby').pop();
      ok(l.n === 2 && l.mode === 'duel' && l.host === 'Axel', 'sala: formato y anfitrión');
      h.close(); gs.forEach(g => g.close());
    }
    {
      const { h, gs, msgs } = mk(3);
      ok(await until(() => h.lobby().filter(x => x.ready).length === 3, 1500), 'tres invitados entran');
      h.setFormat(4, 'ffa');
      ok(await until(() => msgs[2].some(s => s.k === 'lobby' && s.n === 4 && s.mode === 'ffa' && s.players.length === 3), 1000), 'el cambio de formato llega a los invitados');
      eq([h.n, h.mode], [4, 'ffa'], 'el anfitrión queda en 4 todos contra todos');
      let hv = null; h.onView(v => { hv = v; });
      ok(h.begin(), 'el anfitrión empieza con 3 invitados');
      ok(await until(() => hv, 1000), 'la partida arranca');
      eq(h.names.length, 4, 'cuatro asientos');
      h.close(); gs.forEach(g => g.close());
    }
    {
      const { h, gs } = mk(3);
      await until(() => h.lobby().filter(x => x.ready).length === 3, 1500);
      h.setFormat(3, 'ffa');
      let hv = null; h.onView(v => { hv = v; });
      h.begin();
      await until(() => hv, 1000);
      eq(h.names.length, 3, 'formato de 3: sólo entran 2 invitados');
      h.close(); gs.forEach(g => g.close());
    }
    {
      const { h, gs } = mk(1);
      await until(() => h.lobby().filter(x => x.ready).length === 1, 1000);
      ok(!h.setFormat(9, 'raro') && h.n === 2 && h.mode === 'duel', 'un modo desconocido se rechaza');
      h.setFormat(9, 'ffa');
      ok(h.n === 4, 'asientos fuera de rango se acotan a 4');
      h.close(); gs.forEach(g => g.close());
    }
  };
};
