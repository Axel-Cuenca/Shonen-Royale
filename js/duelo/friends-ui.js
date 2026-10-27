/* ============ duelo/friends-ui.js — botón burger y menú lateral «líquido» de amigos ============
 * Un botón burger fijo (arriba a la derecha) abre un panel que entra por la derecha. El borde del
 * panel es una forma líquida (SVG) movida con física de muelle: dos capas, la dorada va por delante
 * y la oscura la sigue, así que al abrir/cerrar el borde se curva, rebota y se asienta. Con
 * «Efectos reducidos» (clase rm en <html>) o si el sistema pide menos movimiento, el panel entra sin rebote.
 * La lógica de amigos está en js/duelo/social.js; aquí sólo se pinta. ui.js le pasa unas pocas funciones (ver init).
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const NS = 'http://www.w3.org/2000/svg';
  let hx = null, burger = null, badge = null, panel = null, body = null, overlay = null, svg = null, gold = null, dark = null, toast = null;
  let open = false, rafId = 0, last = 0, queuedInvite = null, msgBox = null, poll = 0, toastT = 0, seenInv = new Set();
  // capas de muelle: p = posición (0 cerrado, 1 abierto), v = velocidad
  const L = [{ p: 0, v: 0, k: 190, d: 15 }, { p: 0, v: 0, k: 120, d: 13 }];
  const reduced = () => document.documentElement.classList.contains('rm') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const panelW = () => Math.min(380, Math.round(innerWidth * 0.92));
  const SIDE = 140;   // espacio extra a la izquierda del panel para que el borde pueda abombarse

  function path(layer, W, H) {
    const Wp = W + SIDE, x = Wp - W * layer.p, b = Math.max(-110, Math.min(110, layer.v * 15));
    const y1 = H * 0.3, y2 = H * 0.7;
    return `M${Wp + 80},0 L${x},0 C${x - b},${y1} ${x - b},${y2} ${x},${H} L${Wp + 80},${H} Z`;
  }
  function draw() {
    const W = panelW(), H = innerHeight;
    svg.setAttribute('width', W + SIDE); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W + SIDE} ${H}`);
    gold.setAttribute('d', path(L[0], W, H)); dark.setAttribute('d', path(L[1], W, H));
  }
  function tick(t) {
    const target = open ? 1 : 0, dt = Math.max(0.004, Math.min(0.1, (t - last) / 1000 || 0.016)); last = t;     // (t puede ser un pelín anterior a last)
    let moving = false;
    for (const l of L) {
      const n = Math.ceil(dt / 0.008);       // pasos pequeños: el muelle no se desmanda ni con pocos fotogramas por segundo
      for (let i = 0; i < n; i++) {
        const s = dt / n, a = l.k * (target - l.p) - l.d * l.v;
        l.v += a * s; l.p += l.v * s;
      }
      if (Math.abs(target - l.p) > 0.0005 || Math.abs(l.v) > 0.01) moving = true; else { l.p = target; l.v = 0; }
    }
    draw();
    panel.style.transform = `translateX(${Math.max(0, (1 - L[1].p) * 100)}%)`;
    if (moving) rafId = requestAnimationFrame(tick); else { rafId = 0; if (!open) { panel.style.visibility = 'hidden'; svg.style.visibility = 'hidden'; } }
  }
  function run() { if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(tick); } }

  function setOpen(v) {
    if (v === open) return;
    open = v;
    burger.classList.toggle('on', v); burger.setAttribute('aria-expanded', String(v));
    burger.classList.remove('pop'); void burger.offsetWidth; burger.classList.add('pop');
    overlay.classList.toggle('on', v); document.body.classList.toggle('fr-open', v);
    panel.classList.toggle('open', v); panel.setAttribute('aria-hidden', String(!v));
    if (v) {
      panel.style.visibility = ''; svg.style.visibility = '';
      render(); D.Social.refreshPresence().catch(() => {});
      clearInterval(poll); poll = setInterval(() => D.Social.refreshPresence().catch(() => {}), 60000);
    } else { clearInterval(poll); poll = 0; burger.focus({ preventScroll: true }); }
    if (reduced()) { for (const l of L) { l.p = v ? 1 : 0; l.v = 0; } draw(); panel.style.transform = v ? 'none' : 'translateX(100%)'; if (!v) { panel.style.visibility = 'hidden'; svg.style.visibility = 'hidden'; } }
    else run();
    if (v) setTimeout(() => { const f = panel.querySelector('input'); if (f && !matchMedia('(pointer: coarse)').matches) f.focus({ preventScroll: true }); }, 380);
  }

  // ---------------- contenido ----------------
  const h = (...a) => hx(...a);
  const dotCls = f => f.online ? (f.play ? 'play' : 'on') : 'off';
  const stateTxt = f => f.online ? (f.play ? 'Jugando' : f.room ? 'En una sala' : 'En línea') : 'Desconectado';
  function say(text, bad) { if (!msgBox) return; msgBox.textContent = text || ''; msgBox.className = 'fsmsg' + (text ? (bad ? ' err' : ' ok') : ''); }
  const res = r => say(r.ok ? (r.msg || '') : r.error, !r.ok);
  const sanitize = s => String(s || '').replace(/[^A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]/g, '').slice(0, 16);

  let idx = 0;
  const item = (cls, ...kids) => h('div', { class: 'fsit ' + (cls || ''), style: '--i:' + (idx++) }, ...kids);
  const sec = t => item('fsh', t);

  function render() {
    if (!body) return;
    idx = 0;
    const S = D.Social, kids = [];
    msgBox = h('div', { class: 'fsmsg', role: 'status' });
    const u = D.Account && D.Account.user;
    if (!u || u.guest || !D.Account.cloud) {
      kids.push(item('fsempty', h('b', null, 'Los amigos necesitan una cuenta'), h('p', null, 'Entra o crea tu cuenta (es gratis) para tener apodo, amigos y poder invitarlos a una sala.')),
        item('', h('button', { class: 'btn gold', onclick: () => { setOpen(false); cfg.login(); } }, 'Entrar o crear cuenta')));
    } else if (!S.me) {
      const inp = h('input', { type: 'text', maxlength: 16, placeholder: 'Tu apodo', value: sanitize(u.name), autocomplete: 'off', 'aria-label': 'Tu apodo' });
      const go = async () => { if (go.busy) return; go.busy = true; say('Guardando…'); const r = await S.claimNick(inp.value); go.busy = false; if (r.ok) { render(); } else say(r.error, true); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      kids.push(item('fsempty', h('b', null, 'Elige tu apodo único'), h('p', null, 'Es el nombre con el que te encontrarán tus amigos. Nadie más puede tenerlo y después no se puede cambiar. 3-16 letras, números o _.')),
        item('fsrow', inp, h('button', { class: 'btn gold', onclick: go }, 'Elegir')), item('', msgBox));
    } else {
      const inv = S.invisible;
      kids.push(item('fsme', h('span', { class: 'dot ' + (inv ? 'off' : 'on') }), h('b', null, S.me.name),
        h('button', { class: 'fsink', title: 'Aparecer desconectado ante tus amigos', onclick: () => { S.setInvisible(!S.invisible); render(); } }, inv ? '👻 Invisible' : '🟢 Visible')));
      const add = h('input', { type: 'text', maxlength: 16, placeholder: 'Apodo de tu amigo', autocomplete: 'off', 'aria-label': 'Apodo de tu amigo' });
      const send = async () => { if (!add.value.trim()) return; say('Enviando…'); const r = await S.request(add.value); res(r); if (r.ok) add.value = ''; };
      add.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      kids.push(item('fsrow', add, h('button', { class: 'btn gold', onclick: send }, 'Agregar')), item('', msgBox));
      const invs = S.inbox();
      if (invs.length) { kids.push(sec('Invitaciones'));
        invs.forEach(i => kids.push(item('fscard hot', h('span', { class: 'fsn' }, h('b', null, i.name), ' te invita a su sala'),
          h('span', { class: 'fsb' }, h('button', { class: 'btn gold sm', onclick: () => join(i.from) }, 'Unirse'), h('button', { class: 'btn ghost sm', onclick: () => S.declineInvite(i.from) }, 'No'))))); }
      const inc = S.incoming();
      if (inc.length) { kids.push(sec('Solicitudes'));
        inc.forEach(f => kids.push(item('fscard hot', h('span', { class: 'fsn' }, h('b', null, f.name), ' quiere ser tu amigo'),
          h('span', { class: 'fsb' }, h('button', { class: 'btn gold sm', onclick: async () => res(await S.accept(f.uid)) }, 'Aceptar'), h('button', { class: 'btn ghost sm', onclick: async () => res(await S.remove(f.uid)) }, 'No'))))); }
      const fr = S.list().filter(f => f.status === 'ok').sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
      kids.push(sec('Amigos (' + fr.length + ')'));
      if (!fr.length) kids.push(item('fsempty', h('p', null, 'Aún no tienes amigos. Escribe arriba el apodo exacto de alguien y le llegará tu solicitud.')));
      fr.forEach(f => {
        const acts = [];
        if (f.online && !f.play) acts.push(h('button', { class: 'btn gold sm', onclick: () => invite(f) }, 'Invitar'));
        if (f.online && !f.play && f.room) acts.push(h('button', { class: 'btn sm', title: 'Entrar a su sala', onclick: () => joinCode(f.room) }, 'Unirme'));
        acts.push(h('button', { class: 'fsx', title: 'Eliminar amigo', 'aria-label': 'Eliminar a ' + f.name, onclick: e => {
          const b = e.currentTarget; if (b.dataset.sure) { S.remove(f.uid).then(res); return; }
          b.dataset.sure = '1'; b.textContent = '¿Seguro?'; b.classList.add('sure'); setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = '✕'; b.classList.remove('sure'); } }, 3000); } }, '✕'));
        kids.push(item('fscard', h('span', { class: 'dot ' + dotCls(f) }), h('span', { class: 'fsn' }, h('b', null, f.name), h('small', null, stateTxt(f))), h('span', { class: 'fsb' }, ...acts)));
      });
      const out = S.list().filter(f => f.status === 'out');
      if (out.length) { kids.push(sec('Enviadas'));
        out.forEach(f => kids.push(item('fscard', h('span', { class: 'fsn' }, h('b', null, f.name), h('small', null, 'Esperando respuesta')), h('span', { class: 'fsb' }, h('button', { class: 'fsx', title: 'Cancelar', onclick: async () => res(await S.remove(f.uid)) }, '✕'))))); }
    }
    body.replaceChildren(...kids);
    updateBadge();
  }

  async function invite(f) {
    const S = D.Social;
    if (S.room) { res(await S.invite(f.uid)); return; }
    queuedInvite = f.uid; say('Creando tu sala…'); setOpen(false); cfg.host();      // crea la sala y, al tenerla, roomOpened() manda la invitación
  }
  function join(from) { const r = D.Social.acceptInvite(from); if (!r.ok) { say(r.error, true); render(); return; } joinCode(r.room); }
  function joinCode(code) { setOpen(false); cfg.joinCode(code); }

  // ---------------- aviso, insignia y arranque ----------------
  function updateBadge() {
    if (!badge) return;
    const S = D.Social, u = D.Account && D.Account.user;
    const n = S.started && S.me ? S.pendingCount() : 0, needNick = S.started && !S.me && u && !u.guest;
    badge.textContent = n ? String(n) : needNick ? '!' : '';
    badge.style.display = n || needNick ? '' : 'none';
    burger.title = n ? n + ' novedad' + (n > 1 ? 'es' : '') + ' en amigos' : needNick ? 'Elige tu apodo' : 'Amigos';
  }
  function showToast(i) {
    clearTimeout(toastT); if (toast) toast.remove();
    toast = h('div', { class: 'fstoast', role: 'alert' }, h('span', null, h('b', null, i.name), ' te invita a jugar'),
      h('button', { class: 'btn gold sm', onclick: () => { toast.remove(); toast = null; join(i.from); } }, 'Unirse'),
      h('button', { class: 'btn ghost sm', onclick: () => { toast.remove(); toast = null; D.Social.declineInvite(i.from); } }, 'No'));
    document.body.append(toast); toastT = setTimeout(() => { if (toast) { toast.remove(); toast = null; } }, 15000);
  }
  function onSocial(what) {
    if (what === 'invites') {
      D.Social.inbox().forEach(i => { const key = i.from + ':' + i.at; if (!seenInv.has(key)) { seenInv.add(key); if (!open && burger.style.display !== 'none') showToast(i); } });
    }
    if (open && what !== 'room' && what !== 'stop') render(); else updateBadge();
    if (what === 'stop') { if (open) setOpen(false); }
  }

  /** ui.js avisa cuando tu sala está creada (con su código) o cerrada. */
  function roomOpened(code) {
    D.Social.setRoom(code);
    if (queuedInvite) { const q = queuedInvite; queuedInvite = null; D.Social.invite(q).then(r => { if (r.ok) say(r.msg); }); }
  }
  function roomClosed() { queuedInvite = null; D.Social.setRoom(''); }

  let cfg = null;
  /** Crea el botón y el panel (una sola vez). cfg: { h, joinCode(code), host(), login() } */
  function init(c) {
    if (burger) return burger;
    cfg = c; hx = c.h;
    burger = hx('button', { class: 'frburger', type: 'button', 'aria-label': 'Amigos', 'aria-expanded': 'false', 'aria-controls': 'frpanel', onclick: () => setOpen(!open) },
      hx('i'), hx('i'), hx('i'));
    badge = hx('b', { class: 'frbadge', style: 'display:none' }); burger.append(badge);
    overlay = hx('div', { class: 'frov', onclick: () => setOpen(false) });
    svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'frsvg'); svg.setAttribute('aria-hidden', 'true');
    gold = document.createElementNS(NS, 'path'); gold.setAttribute('class', 'frg');
    dark = document.createElementNS(NS, 'path'); dark.setAttribute('class', 'frd');
    svg.append(gold, dark); svg.style.visibility = 'hidden';
    body = hx('div', { class: 'frbody' });
    const head = hx('div', { class: 'frhead' }, hx('h2', null, 'Amigos'));
    panel = hx('aside', { class: 'frpanel', id: 'frpanel', role: 'dialog', 'aria-label': 'Amigos', 'aria-hidden': 'true' }, head, body);
    panel.style.visibility = 'hidden'; panel.style.transform = 'translateX(100%)';
    document.body.append(overlay, svg, panel, burger);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } });
    // deslizar el panel hacia la derecha lo cierra
    let sx = null, sy = 0;
    panel.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = Math.abs(e.changedTouches[0].clientY - sy); sx = null; if (dx > 70 && dy < 60) setOpen(false); }, { passive: true });
    addEventListener('resize', () => { if (open || rafId) draw(); });
    D.Social.on(onSocial);
    draw();
    return burger;
  }

  /** Lo llama ui.js: muestra u oculta el botón según la pantalla y la cuenta. */
  function show(v) { if (!burger) return; burger.style.display = v ? '' : 'none'; document.body.classList.toggle('fr-on', !!v); if (!v && open) setOpen(false); if (v) updateBadge(); }
  /** Tras iniciar sesión: arranca el sistema social. */
  async function login() { if (!burger) return; const st = await D.Social.start(); render_if(); return st; }
  function render_if() { if (open) render(); else updateBadge(); }

  D.FriendsUI = { init, show, login, roomOpened, roomClosed, toggle: () => setOpen(!open), get isOpen() { return open; }, close: () => setOpen(false) };
})();
