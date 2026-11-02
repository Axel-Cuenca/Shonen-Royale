/* ============ duelo/shop.js — puntos, recompensa diaria y Tienda de cosméticos ============
 * Todo lo que se guarda va dentro del mismo `store` que los mazos (campo `pts`), así viaja
 * a la nube con ellos (saves/{uid}.save.duelo) sin tocar reglas ni servidores.
 *
 *   store.pts = { coins, day, streak, aiDay, aiGot, owned: [ids], eq: { cat: id }, sk: { carta: efecto }, skOwn: { carta: [efectos que tiene ESA carta] }, si: { carta: skin } }
 *
 * Los cosméticos NO dan ventaja en las partidas. Cada jugador ve los suyos en su pantalla.
 * Los premios se calculan en el navegador (sin servidor): entre amigos es suficiente.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});

  // ---------------- catálogo ----------------
  // rar: c común · r raro · e épico · l legendario. El precio sale de la rareza (PRICE); los 'free' vienen con la cuenta.
  const PRICE = { c: 200, r: 400, e: 800, l: 1500 };
  const CATS = [
    { id: 'hc', name: 'Color del holograma', icon: '🎨' },
    { id: 'ha', name: 'Aura', icon: '🔥' },
    { id: 'hm', name: 'Movimiento', icon: '🌀' },
    { id: 'cb', name: 'Reverso de cartas', icon: '🂠' },
    { id: 'bd', name: 'Tablero', icon: '🟦' },
    { id: 'av', name: 'Avatar', icon: '🧑' },
    { id: 'fr', name: 'Marco de perfil', icon: '🖼️' },
    { id: 'ti', name: 'Título', icon: '🏷️' },
    { id: 'ef', name: 'Efecto de victoria', icon: '🎆' }
  ];
  const I = (id, cat, name, rar, extra) => Object.assign({ id, cat, name, rar, price: extra && extra.free ? 0 : PRICE[rar] }, extra || {});
  const ITEMS = [
    // color del holograma (css: [data-hc])
    I('hc_cian', 'hc', 'Cian clásico', 'c', { free: 1, sw: '#44ffff' }),
    I('hc_oro', 'hc', 'Oro', 'c', { sw: '#ffd84a' }),
    I('hc_magenta', 'hc', 'Magenta', 'c', { sw: '#ff4fd8' }),
    I('hc_esmeralda', 'hc', 'Esmeralda', 'r', { sw: '#3dffa0' }),
    I('hc_violeta', 'hc', 'Violeta', 'r', { sw: '#a77bff' }),
    I('hc_carmesi', 'hc', 'Carmesí', 'r', { sw: '#ff4a5a' }),
    I('hc_blanco', 'hc', 'Blanco puro', 'e', { sw: '#ffffff' }),
    I('hc_prisma', 'hc', 'Prisma (cambia de color)', 'l', { sw: 'linear-gradient(90deg,#4ff,#a6f,#f6a,#fd4)' }),
    // aura
    I('ha_none', 'ha', 'Sin aura', 'c', { free: 1 }),
    I('ha_escarcha', 'ha', 'Escarcha', 'r', { sw: '#9fe6ff' }),
    I('ha_fuego', 'ha', 'Llamas', 'r', { sw: '#ff8a2a' }),
    I('ha_rayos', 'ha', 'Tormenta', 'e', { sw: '#9fd0ff' }),
    I('ha_sombra', 'ha', 'Sombras', 'e', { sw: '#3a1a5a' }),
    I('ha_arcoiris', 'ha', 'Arcoíris', 'l', { sw: 'linear-gradient(90deg,#f55,#fd4,#5f8,#4af,#a6f)' }),
    I('ha_solar', 'ha', 'Corona solar', 'l', { sw: 'radial-gradient(#fff,#ffd84a,#ff8a00)' }),
    // movimiento del holograma
    I('hm_flotar', 'hm', 'Flotar suave', 'c', { free: 1 }),
    I('hm_respirar', 'hm', 'Respirar', 'r'),
    I('hm_oscilar', 'hm', 'Oscilar', 'r'),
    I('hm_latido', 'hm', 'Latido', 'r'),
    I('hm_girar', 'hm', 'Giro holográfico', 'e'),
    I('hm_levitar', 'hm', 'Levitar', 'e'),
    I('hm_fantasma', 'hm', 'Fantasma (parpadea)', 'l'),
    // reverso de cartas
    I('cb_clasico', 'cb', 'Clásico', 'c', { free: 1, sw: '#26409a' }),
    I('cb_dorado', 'cb', 'Dorado', 'c', { sw: '#b8892a' }),
    I('cb_carmesi', 'cb', 'Carmesí', 'c', { sw: '#8a1c2a' }),
    I('cb_hielo', 'cb', 'Hielo', 'r', { sw: '#8fd6f0' }),
    I('cb_galaxia', 'cb', 'Galaxia', 'e', { sw: '#3a1a7a' }),
    I('cb_prisma', 'cb', 'Prisma', 'l', { sw: 'linear-gradient(90deg,#4ff,#a6f,#f6a,#fd4)' }),
    // tablero
    I('bd_clasico', 'bd', 'Clásico', 'c', { free: 1, sw: '#3a54b8' }),
    I('bd_violeta', 'bd', 'Violeta', 'r', { sw: '#6a3ab8' }),
    I('bd_esmeralda', 'bd', 'Esmeralda', 'r', { sw: '#1f8a5a' }),
    I('bd_carmesi', 'bd', 'Carmesí', 'r', { sw: '#a83040' }),
    I('bd_medianoche', 'bd', 'Medianoche', 'e', { sw: '#2a2a5a' }),
    I('bd_dorado', 'bd', 'Oro real', 'l', { sw: '#d9a520' }),
    // avatar (emoji)
    I('av_user', 'av', 'Jugador', 'c', { free: 1, emoji: '👤' }),
    I('av_estrella', 'av', 'Estrella', 'c', { emoji: '⭐' }),
    I('av_dragon', 'av', 'Dragón', 'c', { emoji: '🐉' }),
    I('av_rayo', 'av', 'Rayo', 'c', { emoji: '⚡' }),
    I('av_calavera', 'av', 'Calavera', 'r', { emoji: '💀' }),
    I('av_alien', 'av', 'Alienígena', 'r', { emoji: '👽' }),
    I('av_demonio', 'av', 'Demonio', 'e', { emoji: '😈' }),
    I('av_corona', 'av', 'Corona', 'e', { emoji: '👑' }),
    I('av_aguila', 'av', 'Águila real', 'l', { emoji: '🦅' }),
    // marco de perfil
    I('fr_none', 'fr', 'Sin marco', 'c', { free: 1 }),
    I('fr_plata', 'fr', 'Marco de plata', 'c', { sw: '#cfd8e8' }),
    I('fr_oro', 'fr', 'Marco de oro', 'r', { sw: '#ffd84a' }),
    I('fr_neon', 'fr', 'Marco neón', 'e', { sw: '#4ff' }),
    I('fr_arcoiris', 'fr', 'Marco arcoíris', 'e', { sw: 'linear-gradient(90deg,#f55,#fd4,#5f8,#4af,#a6f)' }),
    I('fr_llamas', 'fr', 'Marco de llamas', 'l', { sw: '#ff6a1a' }),
    // título
    I('ti_none', 'ti', 'Sin título', 'c', { free: 1 }),
    I('ti_aprendiz', 'ti', 'Aprendiz', 'c', { text: 'Aprendiz' }),
    I('ti_novato', 'ti', 'Duelista novato', 'c', { text: 'Duelista novato' }),
    I('ti_estratega', 'ti', 'Estratega', 'r', { text: 'Estratega' }),
    I('ti_invicto', 'ti', 'El Invicto', 'e', { text: 'El Invicto' }),
    I('ti_maestro', 'ti', 'Maestro del duelo', 'e', { text: 'Maestro del duelo' }),
    I('ti_leyenda', 'ti', 'Leyenda viviente', 'l', { text: 'Leyenda viviente' }),
    // efecto de victoria (pantalla de «¡VICTORIA!»)
    I('ef_none', 'ef', 'Confeti clásico', 'c', { free: 1 }),
    I('ef_oro', 'ef', 'Lluvia de oro', 'c', { sw: '#ffd84a' }),
    I('ef_estrellas', 'ef', 'Estrellas', 'r', { sw: '#fff' }),
    I('ef_fuego', 'ef', 'Chispas de fuego', 'e', { sw: '#ff6a1a' }),
    I('ef_arcoiris', 'ef', 'Arcoíris', 'l', { sw: 'linear-gradient(90deg,#f55,#fd4,#5f8,#4af,#a6f)' }),
    // skins de cartas (sk): efectos sobre la imagen de CUALQUIER personaje; sólo salen en cajas (no se venden). css: [data-sk]
    I('sk_sepia', 'sk', 'Sepia antiguo', 'c', { box: 1 }), I('sk_sombra', 'sk', 'Sombra', 'c', { box: 1 }), I('sk_escarcha', 'sk', 'Escarcha', 'c', { box: 1 }),
    I('sk_carmesi', 'sk', 'Carmesí', 'r', { box: 1 }), I('sk_jade', 'sk', 'Jade', 'r', { box: 1 }), I('sk_amatista', 'sk', 'Amatista', 'r', { box: 1 }),
    I('sk_neon', 'sk', 'Neón', 'e', { box: 1 }), I('sk_negativo', 'sk', 'Negativo', 'e', { box: 1 }), I('sk_dorada', 'sk', 'Dorada', 'e', { box: 1 }), I('sk_cromo', 'sk', 'Cromada', 'e', { box: 1 }),
    I('sk_arcoiris', 'sk', 'Arcoíris', 'l', { box: 1 }), I('sk_llamarada', 'sk', 'Llamarada', 'l', { box: 1 }), I('sk_galaxia', 'sk', 'Galaxia', 'l', { box: 1 })
  ];
  // ---------------- skins de cartas con ilustración propia (si) ----------------
  // Cada skin es OTRA imagen para UN personaje concreto: sólo cambia el aspecto (nombre, estrellas, ATK, DEF, tipo y
  // habilidades siguen siendo los de la carta). Todas salen del Cofre de skins con la MISMA probabilidad, sin rarezas.
  // Para añadir una: pon la imagen en assets/skins/ y una línea aquí [id (≤ 24 letras), id de la carta, nombre, archivo];
  // entra sola en el cofre y las probabilidades se recalculan.
  const SKINS = [
    ['si_vegeta_guerra', 'c_vegeta', 'Vegeta traje de guerra', 'vegeta_guerra'],
    ['si_goku_dbz', 'c_goku', 'Goku DBZ', 'goku_dbz'],
    ['si_zenitsu_postura', 'c_zenitsu', 'Primera postura nro. 2', 'zenitsu_postura'],
    ['si_bardock_super', 'c_bardock', 'Bardock super', 'bardock_super'],
    ['si_shen_frozen', 'c_shen', 'Frozen Shen', 'shen_frozen'],
    ['si_kayn_heraldo', 'c_kayn', 'Kayn heraldo del caos', 'kayn_heraldo'],
    ['si_minato_relampago', 'c_minato', 'Relámpago amarillo', 'minato_relampago'],
    ['si_popeye_espinaca', 'c_popeye', 'Popeye a comer espinaca', 'popeye_espinaca'],
    ['si_shen_original', 'c_shen', 'Shen original', 'shen_original'],
    ['si_venom_asesino', 'c_venom', 'Venom asesino', 'venom_asesino'],
    ['si_cell_turbo', 'c_cell_perfecto', 'Turboperfección', 'cell_turbo'],
    ['si_goku_ui_skin', 'c_goku_ui', 'Ultra Instinto', 'goku_ui_skin'],
    ['si_meliodas_sate', 'c_meliodas', 'Meliodas Sate Sate', 'meliodas_sate'],
    ['si_toge_paz', 'c_toge', 'Toge Paz', 'toge_paz'],
    ['si_warwick_invierno', 'c_warwick', 'Warwick favor del invierno', 'warwick_invierno']
  ];
  for (const [id, card, name, file] of SKINS) ITEMS.push({ id, cat: 'si', name, rar: 'u', price: 0, box: 1, card, img: 'assets/skins/' + file + '.webp' });
  // (31/10/2026) Con las cajas se fue su contenido: de la Tienda sólo quedan lo gratis de serie y las skins (Cofre de skins; los efectos de color sólo los conservan quienes ya los tienen).
  const SKINS_FUERA = ['si_vegeta_guerra', 'si_goku_dbz', 'si_zenitsu_postura', 'si_bardock_super', 'si_shen_frozen'];      // retiradas el 31/10/2026 (quedan las otras 5 en el Cofre)
  ITEMS.splice(0, ITEMS.length, ...ITEMS.filter(i => i.free || (i.cat === 'si' && !SKINS_FUERA.includes(i.id)) || i.cat === 'sk'));      // los efectos 'sk' ya no se consiguen, pero quien los tiene los conserva
  const BY = new Map(ITEMS.map(i => [i.id, i]));
  /** Cosmético por id: del catálogo o de temporada (D.Seasons, exclusivos por rango; no están en la Tienda ni en cajas). */
  const byId = id => BY.get(id) || (D.Seasons ? D.Seasons.item(id) : null) || undefined;
  const DEFAULT_EQ = { hc: 'hc_cian', ha: 'ha_none', hm: 'hm_flotar', cb: 'cb_clasico', bd: 'bd_clasico', av: 'av_user', fr: 'fr_none', ti: 'ti_none', ef: 'ef_none' };
  const RARITY = { c: 'Común', r: 'Raro', e: 'Épico', l: 'Legendario' };
  const RANK = { c: 0, r: 1, e: 2, l: 3 };

  // ---------------- cajas ----------------
  // w = probabilidad (%) de cada rareza. Cada premio sale en UNA sola caja (reparto automático), y la Tienda lo vende más caro
  // que lo que cuesta la caja donde puede salir. pity = tras n aperturas sin la rareza `to` (o mejor), la siguiente la trae segura.
  // (31/10/2026) Se quitaron las cajas de Plata, Oro, Premium, Especial y Legendaria: sólo queda el Cofre de skins. Lo que ya se compró se conserva.
  const BOXES = [];
  // Cofre de skins: todas las skins de ilustración, cada una con la misma probabilidad (100 % / cantidad de skins).
  // Va aparte de BOXES (no tiene rarezas ni garantía) pero se abre con el mismo openBox() y la misma ruleta.
  const SKIN_BOX = { id: 'skins', kind: 'skins', name: 'Cofre de skins', price: 250, dupRefund: 60, color: '#4fd1c5', icon: '🎴' };
  const skinPool = () => ITEMS.filter(i => i.cat === 'si');
  /** Probabilidad (%) de cada skin del cofre: igual para todas. */
  const skinChance = () => { const n = skinPool().length; return n ? 100 / n : 0; };
  const BOX_BY = new Map(BOXES.concat([SKIN_BOX]).map(b => [b.id, b]));
  const boxOf = {};
  for (const R of ['c', 'r', 'e', 'l']) {
    const bs = BOXES.filter(b => b.w[R]), its = ITEMS.filter(i => i.rar === R && !i.free && !i.box), sks = ITEMS.filter(i => i.rar === R && i.box);
    if (!bs.length) continue;
    its.forEach((it, k) => { boxOf[it.id] = bs[k % bs.length].id; });
    sks.forEach((it, k) => { boxOf[it.id] = bs[k % bs.length].id; });      // las skins se reparten aparte: así cada caja trae al menos una
  }
  const poolOf = (box, R) => box && box.kind === 'skins' ? skinPool() : ITEMS.filter(i => boxOf[i.id] === box.id && (!R || i.rar === R));
  const dupRefund = it => it.cat === 'si' ? SKIN_BOX.dupRefund : Math.round(PRICE[it.rar] * 0.2);

  // ---------------- economía ----------------
  const DAILY = [40, 50, 60, 70, 80, 100, 150];          // día 1..7 de la racha (luego vuelve a empezar)
  const PLAY_ONLINE = 30, WIN_ONLINE = 50;              // por terminar una partida online / extra por ganar
  const PLAY_AI = 10, WIN_AI = 20, AI_DAILY_CAP = 150;    // contra la computadora: menos y con tope diario

  let getStore = () => null, saveStore = () => { /* nada */ };
  function init(get, save) { getStore = get; saveStore = save; }

  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayNum = s => { const [y, m, d] = String(s).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

  /** Estado de puntos del jugador, saneado (nunca se fía de lo que venga de la nube). */
  function pts() {
    const s = getStore(); if (!s) return null;
    const p = s.pts && typeof s.pts === 'object' ? s.pts : (s.pts = {});
    p.coins = Math.max(0, Math.floor(Number(p.coins) || 0));
    p.streak = Math.max(0, Math.floor(Number(p.streak) || 0));
    p.day = typeof p.day === 'string' ? p.day : '';
    p.aiDay = typeof p.aiDay === 'string' ? p.aiDay : '';
    p.aiGot = Math.max(0, Math.floor(Number(p.aiGot) || 0));
    { const a = p.arc && typeof p.arc === 'object' ? p.arc : {}, n = (v, mx) => Math.max(0, Math.min(mx, Math.floor(Number(v) || 0)));
      p.arc = { best: n(a.best, 11), cur: Math.max(1, n(a.cur, 11)), clears: n(a.clears, 99999), fight: n(a.fight, 11), day: typeof a.day === 'string' ? a.day : '', got: n(a.got, 99999) }; }      // Arcade
    p.owned = Array.isArray(p.owned) ? p.owned.filter(id => !!byId(id)) : [];
    p.skOwn = p.skOwn && typeof p.skOwn === 'object' && !Array.isArray(p.skOwn) ? p.skOwn : {};
    p.eq = p.eq && typeof p.eq === 'object' ? p.eq : {};
    p.cards = cleanCards(p.cards);
    p.pity = p.pity && typeof p.pity === 'object' ? p.pity : {};
    p.sk = p.sk && typeof p.sk === 'object' && !Array.isArray(p.sk) ? p.sk : {};
    p.si = p.si && typeof p.si === 'object' && !Array.isArray(p.si) ? p.si : {};
    for (const cid of Object.keys(p.si)) { const it = BY.get(p.si[cid]); if (!it || it.cat !== 'si' || it.card !== cid) delete p.si[cid]; }      // skin de otra carta o que ya no existe
    // Efectos (sk): se tienen POR PERSONAJE: skOwn = { idCarta: ['sk_…'] }. Lo que antes valía para todos se reparte:
    // cada efecto que ya tenías queda en los personajes donde lo llevabas puesto (o en uno solo si no lo llevabas).
    const viejos = p.owned.filter(id => { const it = BY.get(id); return !!it && it.cat === 'sk'; });
    if (viejos.length) {
      p.owned = p.owned.filter(id => !viejos.includes(id));
      for (const id of viejos) {
        let cs = Object.keys(p.sk).filter(c => p.sk[c] === id);
        if (!cs.length) { const all = skCards(); if (all.length) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; cs = [all[h % all.length]]; } }
        for (const c of cs) giveSk(p, c, id);
      }
    }
    for (const cid of Object.keys(p.skOwn)) {
      const l = Array.isArray(p.skOwn[cid]) ? Array.from(new Set(p.skOwn[cid])).filter(id => { const it = BY.get(id); return !!it && it.cat === 'sk'; }) : [];
      if (l.length && /^[\w-]{1,40}$/.test(cid)) p.skOwn[cid] = l; else delete p.skOwn[cid];
    }
    for (const cid of Object.keys(p.sk)) if (!(p.skOwn[cid] || []).includes(p.sk[cid])) delete p.sk[cid];      // un efecto puesto que ese personaje no tiene
    return p;
  }
  /** Personajes con ilustración (los que pueden llevar un efecto). */
  const skCards = () => { const C = D.Cards; return C && C.all ? C.all().filter(c => c.kind === 'monster' && c.img).map(c => c.id) : []; };
  const giveSk = (p, cid, id) => { const l = p.skOwn[cid] || (p.skOwn[cid] = []); if (!l.includes(id)) l.push(id); };
  /** ¿Ese personaje tiene ese efecto? (los efectos son de un personaje concreto, no de todos) */
  const ownsSk = (cid, id) => { const p = pts(); return !!p && (p.skOwn[cid] || []).includes(id); };
  /** Efectos que tiene ese personaje (items). */
  const skinsFor = cid => { const p = pts(); return p ? (p.skOwn[cid] || []).map(byId).filter(i => i && i.cat === 'sk') : []; };
  const owns = id => { const it = byId(id), p = pts(); return !!it && (!!it.free || (!!p && p.owned.includes(id))); };
  const coins = () => { const p = pts(); return p ? p.coins : 0; };


  // ---------------- colección de cartas y sobres (31-10-2026) ----------------
  // Sólo la tanda 1 viene desbloqueada. El resto sale de los sobres de su tanda: 3 cartas por PACK_PRICE monedas.
  // p.cards = { idCarta: veces que te ha tocado }: la primera te la da para siempre (se puede usar 2 veces en el mazo) y
  // las siguientes quedan guardadas como repetidas (para los futuros intercambios: 5 repetidas de una rareza -> 1 de la siguiente).
  const PACK_PRICE = 50, PACK_SIZE = 3;
  const PACK_ODDS = { c: 55, u: 25, r: 12, e: 6, l: 2 };      // % de cada rareza al sacar una carta del sobre
  const cardsApi = () => D.Cards && D.Cards.tandaOf ? D.Cards : null;
  function cleanCards(o) {
    const C = cardsApi(), out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o) || !C) return out;
    for (const id of Object.keys(o)) { const n = Math.floor(Number(o[id])); if (n > 0 && C.get(id) && C.tandaOf(id) > 1) out[id] = Math.min(n, 999); }
    return out;
  }
  /** ¿La carta está desbloqueada? (tanda 1 siempre; el resto, si ya te tocó en un sobre) */
  function hasCard(id) { const C = cardsApi(); if (!C || C.tandaOf(id) <= 1) return true; const p = pts(); return !!p && (p.cards[id] | 0) > 0; }
  /** Veces que te ha tocado (0 = bloqueada). Las de la tanda 1 no se cuentan: ya son tuyas. */
  const cardCount = id => { const p = pts(); return p ? (p.cards[id] | 0) : 0; };
  /** Repetidas guardadas de esa carta (las que sobran después de la primera). */
  const spareOf = id => Math.max(0, cardCount(id) - 1);
  /** Cuántas cartas de esa tanda tienes desbloqueadas / cuántas tiene. */
  function tandaProgress(t) { const C = cardsApi(); if (!C) return { got: 0, total: 0 }; const l = C.inTanda(t); return { got: l.filter(hasCard).length, total: l.length }; }
  /** Una carta al azar de una tanda: primero la rareza (PACK_ODDS, sólo entre las que existen) y luego una de esa rareza. */
  function rollCard(t, rnd) {
    const C = cardsApi(); if (!C) return null;
    const pool = C.inTanda(t); if (!pool.length) return null;
    const by = {}; for (const id of pool) (by[C.rarityOf(id)] = by[C.rarityOf(id)] || []).push(id);
    const rs = C.RAR_ORDER.filter(r => by[r]), tot = rs.reduce((n, r) => n + PACK_ODDS[r], 0);
    let x = rnd() * tot, rar = rs[rs.length - 1];
    for (const r of rs) { if (x < PACK_ODDS[r]) { rar = r; break; } x -= PACK_ODDS[r]; }
    const l = by[rar]; return l[Math.min(l.length - 1, Math.floor(rnd() * l.length))];
  }
  /** Compra un sobre de la tanda t: cobra, saca PACK_SIZE cartas y las guarda. Devuelve { ok, cards: [{ id, rar, isNew, n }] }. */
  function buyPack(t, rnd) {
    const C = cardsApi(), p = pts(); rnd = rnd || Math.random;
    if (!p || !C || !C.PACK_TANDAS.includes(t)) return { ok: false, error: 'Ese sobre no existe.' };
    if (p.coins < PACK_PRICE) return { ok: false, error: 'No te alcanzan las monedas.' };
    p.coins -= PACK_PRICE;
    const cards = [];
    for (let i = 0; i < PACK_SIZE; i++) {
      const id = rollCard(t, rnd); if (!id) continue;
      const isNew = (p.cards[id] | 0) === 0; p.cards[id] = Math.min(999, (p.cards[id] | 0) + 1);
      cards.push({ id, rar: C.rarityOf(id), isNew, n: p.cards[id] });
    }
    saveStore();
    return { ok: true, cards, coins: p.coins };
  }


  // Intercambios: TRADE_N repetidas de una misma rareza -> 1 carta (al azar) de la rareza siguiente, de cualquier tanda con sobres.
  const TRADE_N = 5;
  /** Repetidas guardadas de esa rareza: [{ id, n }] (sólo las que sobran después de la primera copia). */
  function sparesOf(rar) {
    const C = cardsApi(), p = pts(); if (!C || !p) return [];
    return Object.keys(p.cards).filter(id => C.rarityOf(id) === rar && p.cards[id] > 1).map(id => ({ id, n: p.cards[id] - 1 }));
  }
  /** picks = { idCarta: cuántas repetidas das }. Devuelve { ok, card: { id, rar, isNew, n }, from, to }. */
  function tradeUp(picks, rnd) {
    const C = cardsApi(), p = pts(); rnd = rnd || Math.random;
    if (!p || !C || !picks || typeof picks !== 'object') return { ok: false, error: 'Intercambio no válido.' };
    const ids = Object.keys(picks).filter(id => (picks[id] | 0) > 0);
    const total = ids.reduce((n, id) => n + (picks[id] | 0), 0);
    if (total !== TRADE_N) return { ok: false, error: `Tienes que dar exactamente ${TRADE_N} repetidas.` };
    if (ids.some(id => !C.get(id) || (picks[id] | 0) > spareOf(id))) return { ok: false, error: 'No tienes tantas repetidas.' };
    const from = C.rarityOf(ids[0]);
    if (ids.some(id => C.rarityOf(id) !== from)) return { ok: false, error: 'Las cinco tienen que ser de la misma rareza.' };
    const to = C.RAR_ORDER[C.RAR_ORDER.indexOf(from) + 1];
    if (!to) return { ok: false, error: 'Las legendarias no se pueden cambiar por otra rareza.' };
    const pool = C.PACK_TANDAS.flatMap(t => C.inTanda(t)).filter(id => C.rarityOf(id) === to);
    if (!pool.length) return { ok: false, error: 'No hay cartas de esa rareza.' };
    for (const id of ids) p.cards[id] -= picks[id] | 0;
    const id = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
    const isNew = (p.cards[id] | 0) === 0; p.cards[id] = Math.min(999, (p.cards[id] | 0) + 1);
    saveStore();
    return { ok: true, card: { id, rar: to, isNew, n: p.cards[id] }, from, to };
  }

  /** ¿Se puede cobrar hoy? Devuelve { amount, day } (day 1..7) o null. */
  function dailyInfo() {
    const p = pts(); if (!p) return null;
    const t = today();
    if (p.day === t) return null;
    const cont = p.day && dayNum(t) - dayNum(p.day) === 1;
    const day = (cont ? p.streak : 0) % DAILY.length + 1;
    return { amount: DAILY[day - 1], day };
  }
  function claimDaily() {
    const p = pts(), info = dailyInfo(); if (!p || !info) return null;
    p.coins += info.amount; p.streak = info.day; p.day = today();
    saveStore();
    return info;
  }
  /** Premio por terminar una partida. online: contra personas · won: ganó. Devuelve los puntos dados. */
  function reward(online, won) {
    const p = pts(); if (!p) return 0;
    let n = online ? PLAY_ONLINE + (won ? WIN_ONLINE : 0) : PLAY_AI + (won ? WIN_AI : 0);
    if (!online) {
      const t = today(); if (p.aiDay !== t) { p.aiDay = t; p.aiGot = 0; }
      n = Math.max(0, Math.min(n, AI_DAILY_CAP - p.aiGot)); p.aiGot += n;
    }
    if (n > 0) { p.coins += n; saveStore(); }
    return n;
  }
  // ---------------- Arcade (1-nov-2026) ----------------
  const ARC_CAP = 210;      // ✦ máximos por día en el Arcade (una escalera completa: 6+8+…+24 + 60 = 210)
  const arcRung = n => (D.Arcade ? D.Arcade.rung(n) : { pts: 0 });
  /** Estado del Arcade: peldaño siguiente, mejor peldaño, escaleras completadas y ✦ de hoy. Un combate que quedó a medias cuenta como derrota. */
  function arcade() {
    const p = pts(); if (!p) return { cur: 1, best: 0, clears: 0, got: 0, cap: ARC_CAP };
    const a = p.arc;
    if (a.fight) { a.fight = 0; a.cur = 1; saveStore(); }
    return { cur: a.cur, best: a.best, clears: a.clears, got: a.day === today() ? a.got : 0, cap: ARC_CAP };
  }
  /** Empieza el combate del peldaño actual (si la página se cierra a medias, al volver cuenta como derrota). */
  function arcadeBegin(step) { const p = pts(); if (!p) return; p.arc.fight = step; saveStore(); }
  /** Fin de un combate del Arcade: devuelve { pts, next, done } (done = escalera completa) o null. */
  function arcadeEnd(step, won) {
    const p = pts(); if (!p) return null;
    const a = p.arc; a.fight = 0;
    if (!won) { a.cur = 1; saveStore(); return { pts: 0, next: 1, done: false, lost: true }; }
    if (a.day !== today()) { a.day = today(); a.got = 0; }
    const n = Math.max(0, Math.min(arcRung(step).pts, ARC_CAP - a.got)); a.got += n; p.coins += n;
    a.best = Math.max(a.best, step);
    const done = step >= (D.Arcade ? D.Arcade.BOSS : 11);
    if (done) { a.clears++; a.cur = 1; } else a.cur = step + 1;
    saveStore();
    return { pts: n, next: a.cur, done };
  }
  /** Lo ganado hoy contra la computadora y el tope diario. */
  function aiToday() { const p = pts(); if (!p) return { got: 0, cap: AI_DAILY_CAP }; return { got: p.aiDay === today() ? p.aiGot || 0 : 0, cap: AI_DAILY_CAP }; }
  // ofertas del día: 3 cosméticos con 30 % de descuento, iguales para todos ese día
  const OFFER_OFF = 0.3;
  function offers() {
    const t = today(); let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const pool = ITEMS.filter(i => !i.free && !i.box && i.rar !== 'l'), out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
    return out;
  }
  const priceOf = id => { const it = byId(id); return !it ? 0 : offers().includes(id) ? Math.round(it.price * (1 - OFFER_OFF)) : it.price; };
  const rand = () => { try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); } };
  /** Entero al azar en [0, n) sin sesgo (rechazo sobre 32 bits con crypto). */
  function randInt(n) {
    try {
      const u = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
      do crypto.getRandomValues(u); while (u[0] >= lim);
      return u[0] % n;
    } catch (e) { return Math.min(n - 1, Math.floor(Math.random() * n)); }
  }
  /** Cofre de skins: cobra, sortea UNA skin entre todas con la misma probabilidad y la guarda ANTES de mostrar nada.
   *  La animación sólo enseña este resultado. Si ya la tenías, devuelve parte en puntos. */
  function openSkinBox() {
    const p = pts(), b = SKIN_BOX, pool = skinPool();
    if (!p) return { ok: false, error: 'No existe.' };
    if (!pool.length) return { ok: false, error: 'Aún no hay skins en el cofre.' };
    if (p.coins < b.price) return { ok: false, error: 'Te faltan ' + (b.price - p.coins) + ' puntos.' };
    const it = pool[randInt(pool.length)];
    p.coins -= b.price;
    const dup = p.owned.includes(it.id), refund = dup ? b.dupRefund : 0;
    if (dup) p.coins += refund; else p.owned.push(it.id);
    saveStore();
    return { ok: true, item: it, dup, refund };
  }
  /** Abre una caja: cobra, sortea (con garantía) y entrega el premio; si ya lo tenías, devuelve parte en puntos. */
  function openBox(boxId) {
    const p = pts(), b = BOX_BY.get(boxId);
    if (b && b.kind === 'skins') return openSkinBox();
    if (!p || !b) return { ok: false, error: 'No existe.' };
    if (p.coins < b.price) return { ok: false, error: 'Te faltan ' + (b.price - p.coins) + ' puntos.' };
    p.pity = p.pity && typeof p.pity === 'object' ? p.pity : {};
    const n = Math.max(0, Math.floor(Number(p.pity[b.id]) || 0));
    let R = null;
    if (b.pity && n + 1 >= b.pity.n && poolOf(b, b.pity.to).length) R = b.pity.to;
    if (!R) {
      const opts = Object.keys(b.w).filter(r => poolOf(b, r).length), tot = opts.reduce((x, r) => x + b.w[r], 0);
      let roll = rand() * tot; R = opts[opts.length - 1];
      for (const r of opts) { if (roll < b.w[r]) { R = r; break; } roll -= b.w[r]; }
    }
    const pool = poolOf(b, R), it = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    p.coins -= b.price;
    p.pity[b.id] = b.pity && RANK[R] >= RANK[b.pity.to] ? 0 : n + 1;
    if (it.cat === 'sk') {        // un efecto es de UN personaje: se sortea entre los que aún no lo tienen
      const all = skCards(), libres = all.filter(c => !(p.skOwn[c] || []).includes(it.id));
      if (!all.length) { p.coins += b.price; return { ok: false, error: 'Aún no hay personajes con ilustración.' }; }
      const card = libres.length ? libres[randInt(libres.length)] : all[randInt(all.length)];
      const dup = !libres.length, refund = dup ? dupRefund(it) : 0;
      if (dup) p.coins += refund; else giveSk(p, card, it.id);
      saveStore();
      return { ok: true, item: it, card, dup, refund, pity: p.pity[b.id] };
    }
    const dup = owns(it.id), refund = dup ? dupRefund(it) : 0;
    if (dup) p.coins += refund; else p.owned.push(it.id);
    saveStore();
    return { ok: true, item: it, dup, refund, pity: p.pity[b.id] };
  }
  function buy(id) {
    const p = pts(), it = byId(id);
    if (!p || !it) return { ok: false, error: 'No existe.' };
    if (it.box) return { ok: false, error: 'Las skins sólo salen en el Cofre de skins.' };
    if (it.excl) return { ok: false, error: 'Es un premio de temporada: sólo se consigue por rango.' };
    if (owns(id)) return { ok: false, error: 'Ya lo tienes.' };
    const pr = priceOf(id);
    if (p.coins < pr) return { ok: false, error: 'Te faltan ' + (pr - p.coins) + ' puntos.' };
    p.coins -= pr; p.owned.push(id); saveStore();
    return { ok: true };
  }
  /** Entrega puntos y cosméticos (premios de temporada). Devuelve los cosméticos nuevos. */
  function grant(n, ids) {
    const p = pts(); if (!p) return [];
    p.coins += Math.max(0, Math.floor(Number(n) || 0));
    const nuevos = [];
    for (const id of ids || []) if (byId(id) && !p.owned.includes(id)) { p.owned.push(id); nuevos.push(id); }
    saveStore(); return nuevos;
  }
  /** Cosméticos de temporada que tengo de una categoría (no están en la Tienda). */
  const exclusive = cat => { const p = pts(); return p ? p.owned.map(byId).filter(i => i && i.excl && i.cat === cat).sort((a, b) => (b.season + b.tier).localeCompare(a.season + a.tier)) : []; };
  function equip(id) {
    const p = pts(), it = byId(id);
    if (!p || !it || !owns(id) || it.cat === 'sk' || it.cat === 'si') return false;     // las skins se ponen a un personaje (setSkin / setArt)
    p.eq[it.cat] = id; saveStore(); apply();
    return true;
  }
  /** Skin que tengo puesta a un personaje (item) o null. */
  function skinOf(cardId) { const p = pts(), id = p && p.sk[cardId]; const it = id && byId(id); return it && it.cat === 'sk' && ownsSk(cardId, id) ? it : null; }
  /** Pone (o quita, con null) una skin a un personaje. Hay que tenerla. */
  function setSkin(cardId, skinId) {
    const p = pts(); if (!p || typeof cardId !== 'string' || !/^[\w-]{1,40}$/.test(cardId)) return false;
    if (skinId == null) { delete p.sk[cardId]; saveStore(); return true; }
    const it = byId(skinId); if (!it || it.cat !== 'sk' || !ownsSk(cardId, skinId)) return false;      // sólo si ESE personaje lo tiene
    p.sk[cardId] = skinId; saveStore(); return true;
  }
  /** Todos los efectos que tengo, en cualquier personaje (sin repetir). */
  const mySkins = () => { const p = pts(), s = new Set(); if (p) for (const c of Object.keys(p.skOwn)) for (const id of p.skOwn[c]) s.add(id); return Array.from(s).map(byId).filter(Boolean); };
  /** Skin de ilustración que tengo puesta a un personaje (item) o null: entonces se ve la imagen original. */
  function artOf(cardId) { const p = pts(), id = p && p.si[cardId], it = id && BY.get(id); return it && it.cat === 'si' && it.card === cardId && owns(id) ? it : null; }
  /** Pone (o quita, con null) una skin de ilustración. Sólo si la tengo y es de ESA carta. */
  function setArt(cardId, skinId) {
    const p = pts(); if (!p || typeof cardId !== 'string' || !/^[\w-]{1,40}$/.test(cardId)) return false;
    if (skinId == null) { delete p.si[cardId]; saveStore(); return true; }
    const it = BY.get(skinId); if (!it || it.cat !== 'si' || it.card !== cardId || !owns(skinId)) return false;
    p.si[cardId] = skinId; saveStore(); return true;
  }
  /** Skins de ilustración de una carta (todas, las tenga o no). */
  const artsFor = cardId => skinPool().filter(i => i.card === cardId);
  const catName = c => { const k = CATS.find(x => x.id === c); return k ? k.name : c === 'sk' ? 'Efecto de carta' : c === 'si' ? 'Skin de carta' : c; };
  const equipped = cat => { const p = pts(), id = p && p.eq[cat]; return byId(owns(id) ? id : DEFAULT_EQ[cat]); };

  /** Lo que ven los demás de mí (sólo los ids de las categorías que se muestran en la partida). */
  const NET_CATS = ['hc', 'ha', 'hm', 'cb', 'av', 'fr', 'ti'];
  const MAX_SK = 60;
  function mine() {
    const o = {}; for (const c of NET_CATS) { const it = equipped(c); if (it) o[c] = it.id; }
    const p = pts(), sk = {}; let n = 0;
    if (p) for (const cid of Object.keys(p.sk)) { const it = skinOf(cid); if (it && n++ < MAX_SK) sk[cid] = it.id; }
    if (n) o.sk = sk;
    const si = {}; let m = 0;
    if (p) for (const cid of Object.keys(p.si)) { const it = artOf(cid); if (it && m++ < MAX_SK) si[cid] = it.id; }
    if (m) o.si = si;
    return o;
  }
  /** Sanea lo que manda otro jugador: sólo ids que existen en su categoría. Devuelve { cat: 'id' }. */
  function clean(o) {
    const out = {};
    if (o && typeof o === 'object') for (const c of NET_CATS) { const it = byId(o[c]); if (it && it.cat === c) out[c] = it.id; }
    if (o && o.sk && typeof o.sk === 'object') {            // skins por personaje: { idCarta: 'sk_…' }
      const sk = {}; let n = 0;
      for (const cid of Object.keys(o.sk)) { const it = byId(o.sk[cid]); if (it && it.cat === 'sk' && /^[\w-]{1,40}$/.test(cid) && n++ < MAX_SK) sk[cid] = it.id; }
      if (n) out.sk = sk;
    }
    if (o && o.si && typeof o.si === 'object') {            // skins de ilustración: { idCarta: 'si_…' }, sólo la de ESA carta
      const si = {}; let n = 0;
      for (const cid of Object.keys(o.si)) { const it = BY.get(o.si[cid]); if (it && it.cat === 'si' && it.card === cid && n++ < MAX_SK) si[cid] = it.id; }
      if (n) out.si = si;
    }
    return out;
  }
  const slug = id => { const it = byId(id); return it ? id.slice(it.cat.length + 1) : ''; };
  /** Pone los cosméticos puestos en <html> (data-hc, data-ha…), que el CSS usa. */
  function apply() {
    const r = document.documentElement;
    for (const c of CATS) { const it = equipped(c.id); r.setAttribute('data-' + c.id, it ? it.id.slice(c.id.length + 1) : ''); }
  }

  D.Shop = { TRADE_N, sparesOf, tradeUp, PACK_PRICE, PACK_SIZE, PACK_ODDS, hasCard, cardCount, spareOf, tandaProgress, rollCard, buyPack, SKIN_BOX, skinPool, skinChance, artOf, setArt, artsFor, mine, clean, slug, BOXES, boxOf, poolOf, dupRefund, openBox, offers, priceOf, OFFER_OFF, PRICE, CATS, ITEMS, RARITY, DAILY, DEFAULT_EQ, init, pts, coins, owns, ownsSk, skinsFor, equipped, equip, buy, dailyInfo, claimDaily, reward, aiToday, arcade, arcadeBegin, arcadeEnd, ARC_CAP, apply, grant, exclusive, skinOf, setSkin, mySkins, catName, get: byId, AI_DAILY_CAP, PLAY_ONLINE, WIN_ONLINE, PLAY_AI, WIN_AI };
})();
