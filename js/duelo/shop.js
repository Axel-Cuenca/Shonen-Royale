/* ============ duelo/shop.js — puntos, recompensa diaria y Tienda de cosméticos ============
 * Todo lo que se guarda va dentro del mismo `store` que los mazos (campo `pts`), así viaja
 * a la nube con ellos (saves/{uid}.save.duelo) sin tocar reglas ni servidores.
 *
 *   store.pts = { coins, day, streak, aiDay, aiGot, owned: [ids], eq: { cat: id }, sk: { carta: efecto }, si: { carta: skin } }
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
    ['si_shen_frozen', 'c_shen', 'Frozen Shen', 'shen_frozen']
  ];
  for (const [id, card, name, file] of SKINS) ITEMS.push({ id, cat: 'si', name, rar: 'u', price: 0, box: 1, card, img: 'assets/skins/' + file + '.webp' });
  const BY = new Map(ITEMS.map(i => [i.id, i]));
  /** Cosmético por id: del catálogo o de temporada (D.Seasons, exclusivos por rango; no están en la Tienda ni en cajas). */
  const byId = id => BY.get(id) || (D.Seasons ? D.Seasons.item(id) : null) || undefined;
  const DEFAULT_EQ = { hc: 'hc_cian', ha: 'ha_none', hm: 'hm_flotar', cb: 'cb_clasico', bd: 'bd_clasico', av: 'av_user', fr: 'fr_none', ti: 'ti_none', ef: 'ef_none' };
  const RARITY = { c: 'Común', r: 'Raro', e: 'Épico', l: 'Legendario' };
  const RANK = { c: 0, r: 1, e: 2, l: 3 };

  // ---------------- cajas ----------------
  // w = probabilidad (%) de cada rareza. Cada premio sale en UNA sola caja (reparto automático), y la Tienda lo vende más caro
  // que lo que cuesta la caja donde puede salir. pity = tras n aperturas sin la rareza `to` (o mejor), la siguiente la trae segura.
  const BOXES = [
    { id: 'plata', name: 'Caja de Plata', price: 60, w: { c: 80, r: 17, e: 3 }, pity: { n: 15, to: 'e' }, color: '#cfd8e8', icon: '📦' },
    { id: 'oro', name: 'Caja de Oro', price: 150, w: { c: 50, r: 40, e: 10 }, pity: { n: 10, to: 'e' }, color: '#ffd84a', icon: '🎁' },
    { id: 'premium', name: 'Caja Premium', price: 300, w: { r: 55, e: 38, l: 7 }, pity: { n: 12, to: 'l' }, color: '#c47bff', icon: '💎' },
    { id: 'especial', name: 'Caja Especial', price: 600, w: { e: 80, l: 20 }, pity: { n: 5, to: 'l' }, color: '#ff7a4a', icon: '🔮' },
    { id: 'legendaria', name: 'Caja Legendaria', price: 1100, w: { l: 100 }, pity: null, color: '#fff2a8', icon: '👑' }
  ];
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
    its.forEach((it, k) => { boxOf[it.id] = bs[k % bs.length].id; });
    sks.forEach((it, k) => { boxOf[it.id] = bs[k % bs.length].id; });      // las skins se reparten aparte: así cada caja trae al menos una
  }
  const poolOf = (box, R) => box && box.kind === 'skins' ? skinPool() : ITEMS.filter(i => boxOf[i.id] === box.id && (!R || i.rar === R));
  const dupRefund = it => it.cat === 'si' ? SKIN_BOX.dupRefund : Math.round(PRICE[it.rar] * 0.2);

  // ---------------- economía ----------------
  const DAILY = [20, 25, 30, 35, 40, 50, 80];          // día 1..7 de la racha (luego vuelve a empezar)
  const PLAY_ONLINE = 15, WIN_ONLINE = 25;              // por terminar una partida online / extra por ganar
  const PLAY_AI = 5, WIN_AI = 10, AI_DAILY_CAP = 50;    // contra la computadora: menos y con tope diario

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
    p.owned = Array.isArray(p.owned) ? p.owned.filter(id => !!byId(id)) : [];
    p.eq = p.eq && typeof p.eq === 'object' ? p.eq : {};
    p.pity = p.pity && typeof p.pity === 'object' ? p.pity : {};
    p.sk = p.sk && typeof p.sk === 'object' && !Array.isArray(p.sk) ? p.sk : {};
    p.si = p.si && typeof p.si === 'object' && !Array.isArray(p.si) ? p.si : {};
    for (const cid of Object.keys(p.si)) { const it = BY.get(p.si[cid]); if (!it || it.cat !== 'si' || it.card !== cid) delete p.si[cid]; }      // skin de otra carta o que ya no existe
    return p;
  }
  const owns = id => { const it = byId(id), p = pts(); return !!it && (!!it.free || (!!p && p.owned.includes(id))); };
  const coins = () => { const p = pts(); return p ? p.coins : 0; };

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
    const dup = owns(it.id), refund = dup ? dupRefund(it) : 0;
    if (dup) p.coins += refund; else p.owned.push(it.id);
    saveStore();
    return { ok: true, item: it, dup, refund, pity: p.pity[b.id] };
  }
  function buy(id) {
    const p = pts(), it = byId(id);
    if (!p || !it) return { ok: false, error: 'No existe.' };
    if (it.box) return { ok: false, error: 'Las skins sólo salen en cajas.' };
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
  function skinOf(cardId) { const p = pts(), id = p && p.sk[cardId]; const it = id && byId(id); return it && it.cat === 'sk' && owns(id) ? it : null; }
  /** Pone (o quita, con null) una skin a un personaje. Hay que tenerla. */
  function setSkin(cardId, skinId) {
    const p = pts(); if (!p || typeof cardId !== 'string' || !/^[\w-]{1,40}$/.test(cardId)) return false;
    if (skinId == null) { delete p.sk[cardId]; saveStore(); return true; }
    const it = byId(skinId); if (!it || it.cat !== 'sk' || !owns(skinId)) return false;
    p.sk[cardId] = skinId; saveStore(); return true;
  }
  const mySkins = () => { const p = pts(); return p ? p.owned.map(byId).filter(i => i && i.cat === 'sk') : []; };
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

  D.Shop = { SKIN_BOX, skinPool, skinChance, artOf, setArt, artsFor, mine, clean, slug, BOXES, boxOf, poolOf, dupRefund, openBox, offers, priceOf, OFFER_OFF, PRICE, CATS, ITEMS, RARITY, DAILY, DEFAULT_EQ, init, pts, coins, owns, equipped, equip, buy, dailyInfo, claimDaily, reward, aiToday, apply, grant, exclusive, skinOf, setSkin, mySkins, catName, get: byId, AI_DAILY_CAP, PLAY_ONLINE, WIN_ONLINE, PLAY_AI, WIN_AI };
})();
