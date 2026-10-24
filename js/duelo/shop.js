/* ============ duelo/shop.js — puntos, recompensa diaria y Tienda de cosméticos ============
 * Todo lo que se guarda va dentro del mismo `store` que los mazos (campo `pts`), así viaja
 * a la nube con ellos (saves/{uid}.save.duelo) sin tocar reglas ni servidores.
 *
 *   store.pts = { coins, day, streak, aiDay, aiGot, owned: [ids], eq: { cat: id } }
 *
 * Los cosméticos NO dan ventaja en las partidas. Cada jugador ve los suyos en su pantalla.
 * Los premios se calculan en el navegador (sin servidor): entre amigos es suficiente.
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});

  // ---------------- catálogo ----------------
  // rar: c común · r raro · e épico · l legendario. Los 'free' vienen con la cuenta.
  const CATS = [
    { id: 'hc', name: 'Color del holograma', icon: '🎨' },
    { id: 'ha', name: 'Aura', icon: '🔥' },
    { id: 'hm', name: 'Movimiento', icon: '🌀' },
    { id: 'cb', name: 'Reverso de cartas', icon: '🂠' },
    { id: 'bd', name: 'Tablero', icon: '🟦' },
    { id: 'av', name: 'Avatar', icon: '🧑' },
    { id: 'fr', name: 'Marco de perfil', icon: '🖼️' },
    { id: 'ti', name: 'Título', icon: '🏷️' }
  ];
  const I = (id, cat, name, price, rar, extra) => Object.assign({ id, cat, name, price, rar: rar || 'c' }, extra || {});
  const ITEMS = [
    // color del holograma (css: html[data-hc])
    I('hc_cian', 'hc', 'Cian clásico', 0, 'c', { free: 1, sw: '#44ffff' }),
    I('hc_oro', 'hc', 'Oro', 150, 'c', { sw: '#ffd84a' }),
    I('hc_magenta', 'hc', 'Magenta', 150, 'c', { sw: '#ff4fd8' }),
    I('hc_esmeralda', 'hc', 'Esmeralda', 220, 'r', { sw: '#3dffa0' }),
    I('hc_violeta', 'hc', 'Violeta', 220, 'r', { sw: '#a77bff' }),
    I('hc_carmesi', 'hc', 'Carmesí', 300, 'r', { sw: '#ff4a5a' }),
    // aura (css: html[data-ha])
    I('ha_none', 'ha', 'Sin aura', 0, 'c', { free: 1 }),
    I('ha_fuego', 'ha', 'Llamas', 400, 'r', { sw: '#ff8a2a' }),
    I('ha_rayos', 'ha', 'Tormenta', 500, 'e', { sw: '#9fd0ff' }),
    I('ha_arcoiris', 'ha', 'Arcoíris', 700, 'l', { sw: 'linear-gradient(90deg,#f55,#fd4,#5f8,#4af,#a6f)' }),
    // movimiento del holograma (css: html[data-hm])
    I('hm_flotar', 'hm', 'Flotar suave', 0, 'c', { free: 1 }),
    I('hm_respirar', 'hm', 'Respirar', 250, 'r'),
    I('hm_oscilar', 'hm', 'Oscilar', 300, 'r'),
    I('hm_girar', 'hm', 'Giro holográfico', 600, 'e'),
    // reverso de cartas (css: html[data-cb])
    I('cb_clasico', 'cb', 'Clásico', 0, 'c', { free: 1, sw: '#26409a' }),
    I('cb_dorado', 'cb', 'Dorado', 200, 'c', { sw: '#b8892a' }),
    I('cb_carmesi', 'cb', 'Carmesí', 200, 'c', { sw: '#8a1c2a' }),
    I('cb_galaxia', 'cb', 'Galaxia', 450, 'e', { sw: '#3a1a7a' }),
    // tablero (css: html[data-bd])
    I('bd_clasico', 'bd', 'Clásico', 0, 'c', { free: 1, sw: '#3a54b8' }),
    I('bd_esmeralda', 'bd', 'Esmeralda', 300, 'r', { sw: '#1f8a5a' }),
    I('bd_carmesi', 'bd', 'Carmesí', 300, 'r', { sw: '#a83040' }),
    I('bd_medianoche', 'bd', 'Medianoche', 500, 'e', { sw: '#2a2a5a' }),
    // avatar (emoji)
    I('av_user', 'av', 'Jugador', 0, 'c', { free: 1, emoji: '👤' }),
    I('av_dragon', 'av', 'Dragón', 120, 'c', { emoji: '🐉' }),
    I('av_rayo', 'av', 'Rayo', 120, 'c', { emoji: '⚡' }),
    I('av_calavera', 'av', 'Calavera', 180, 'r', { emoji: '💀' }),
    I('av_corona', 'av', 'Corona', 350, 'e', { emoji: '👑' }),
    // marco de perfil (css: .fr-*)
    I('fr_none', 'fr', 'Sin marco', 0, 'c', { free: 1 }),
    I('fr_oro', 'fr', 'Marco de oro', 250, 'r', { sw: '#ffd84a' }),
    I('fr_neon', 'fr', 'Marco neón', 350, 'e', { sw: '#4ff' }),
    // título
    I('ti_none', 'ti', 'Sin título', 0, 'c', { free: 1 }),
    I('ti_novato', 'ti', 'Duelista novato', 100, 'c', { text: 'Duelista novato' }),
    I('ti_estratega', 'ti', 'Estratega', 220, 'r', { text: 'Estratega' }),
    I('ti_invicto', 'ti', 'El Invicto', 400, 'e', { text: 'El Invicto' })
  ];
  const BY = new Map(ITEMS.map(i => [i.id, i]));
  const DEFAULT_EQ = { hc: 'hc_cian', ha: 'ha_none', hm: 'hm_flotar', cb: 'cb_clasico', bd: 'bd_clasico', av: 'av_user', fr: 'fr_none', ti: 'ti_none' };
  const RARITY = { c: 'Común', r: 'Raro', e: 'Épico', l: 'Legendario' };

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
    p.owned = Array.isArray(p.owned) ? p.owned.filter(id => BY.has(id)) : [];
    p.eq = p.eq && typeof p.eq === 'object' ? p.eq : {};
    return p;
  }
  const owns = id => { const it = BY.get(id), p = pts(); return !!it && (!!it.free || (!!p && p.owned.includes(id))); };
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
  function buy(id) {
    const p = pts(), it = BY.get(id);
    if (!p || !it) return { ok: false, error: 'No existe.' };
    if (owns(id)) return { ok: false, error: 'Ya lo tienes.' };
    if (p.coins < it.price) return { ok: false, error: 'Te faltan ' + (it.price - p.coins) + ' puntos.' };
    p.coins -= it.price; p.owned.push(id); saveStore();
    return { ok: true };
  }
  function equip(id) {
    const p = pts(), it = BY.get(id);
    if (!p || !it || !owns(id)) return false;
    p.eq[it.cat] = id; saveStore(); apply();
    return true;
  }
  const equipped = cat => { const p = pts(), id = p && p.eq[cat]; return BY.get(owns(id) ? id : DEFAULT_EQ[cat]); };

  /** Pone los cosméticos puestos en <html> (data-hc, data-ha…), que el CSS usa. */
  function apply() {
    const r = document.documentElement;
    for (const c of CATS) { const it = equipped(c.id); r.setAttribute('data-' + c.id, it ? it.id.slice(c.id.length + 1) : ''); }
  }

  D.Shop = { CATS, ITEMS, RARITY, DAILY, DEFAULT_EQ, init, pts, coins, owns, equipped, equip, buy, dailyInfo, claimDaily, reward, apply, get: id => BY.get(id), AI_DAILY_CAP, PLAY_ONLINE, WIN_ONLINE, PLAY_AI, WIN_AI };
})();
