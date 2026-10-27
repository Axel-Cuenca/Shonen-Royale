/* ============ duelo/account.js — cuentas y nube del Duelo ============
 * Firebase Authentication + Cloud Firestore (proyecto pokesurvivor-amigos, plan gratis).
 *
 *   - Nombre + contraseña: Firebase pide un email, así que el nombre se convierte en
 *     uno interno (nunca se le manda nada). Es el MISMO formato de siempre: las cuentas
 *     que ya existían siguen entrando igual.
 *   - Cuenta de Google (y vincular el Gmail a una cuenta de nombre para poder recuperarla).
 *   - Invitado: juega contra la computadora, sin guardar nada fuera de este navegador.
 *
 * Qué se guarda en la nube: los mazos, dentro del documento saves/{uid}, campo save.duelo
 * (las reglas de Firestore de siempre lo permiten tal cual: no hay que tocarlas).
 * Se conserva todo lo demás que hubiera en ese documento.
 *
 * Sin nube (archivo abierto con doble clic, otra web, sin configuración): no hay cuentas,
 * los mazos se guardan sólo en este navegador.
 *
 * API (window.Duelo.Account):
 *   ready()            -> Promise<{ mode: 'cloud'|'local', user: {uid,name}|null }>
 *   register(n, p) · login(n, p) · google() · guest() · logout() · linkGoogle() · deleteAccount(pass)
 *   user               -> { uid, name, guest } | null
 *   cloud              -> true si hay nube
 *   pull()             -> Promise<datos de duelo guardados en la nube | null>
 *   push(datos)        -> programa la subida (con espera) · flush() la hace ya
 *   firebase()         -> { fb, rtdb } para las salas online
 */
(function () {
  'use strict';
  const D = (window.Duelo = window.Duelo || {});
  const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
  const NAME_DOMAIN = 'jugadores.pokesurvivor.net';   // sólo para el email interno
  const VALID = /^[A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]{3,16}$/;
  // La nube sólo desde la web propia (una copia en otra web guardaría sus cuentas en NUESTRO proyecto).
  const HOSTS = ['axel-cuenca.github.io', 'localhost', '127.0.0.1'];
  const PUSH_WAIT = 8000;       // los cambios de mazos suben 8 s después del último
  const SCHEMA = 3;             // campo "v" del documento (como el del juego anterior)

  let auth = null, fs = null, rtdb = null, mode = 'local', readyP = null;
  let user = null;              // { uid, name, guest }
  let pending = null, pushT = 0, pushing = null;

  const loadScript = src => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src; s.async = false; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });

  async function initCloud() {
    const cfg = window.G && G.FIREBASE_CONFIG;
    if (!/^https?:$/.test(location.protocol)) return false;
    if (!cfg || !cfg.apiKey || !cfg.projectId) return false;
    if (!cfg.emulator && !HOSTS.includes(location.hostname)) return false;
    // Se descargan a la vez (y el navegador ya las pidió desde index.html); async=false las ejecuta en orden.
    const libs = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'];
    if (cfg.databaseURL) libs.push('firebase-database-compat.js');
    await Promise.all(libs.map(f => loadScript(SDK + f)));
    const fb = window.firebase;
    fb.initializeApp(cfg);
    auth = fb.auth(); fs = fb.firestore();
    // Algunas redes cortan las conexiones en directo: Firebase prueba otra forma si hace falta.
    try { fs.settings({ experimentalAutoDetectLongPolling: true }); } catch (e) { /* ya estaba */ }
    rtdb = cfg.databaseURL ? fb.database() : null;
    await auth.setPersistence(fb.auth.Auth.Persistence.LOCAL);
    auth.languageCode = 'es';
    addEventListener('pagehide', () => { if (pending) pushNow(); });
    return true;
  }

  const nameToEmail = n => [...new TextEncoder().encode(n.trim().toLowerCase())].map(b => b.toString(16).padStart(2, '0')).join('') + '@' + NAME_DOMAIN;
  const cleanName = s => (String(s || '').trim().split(/\s+/)[0] || '').replace(/[^A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]/g, '').slice(0, 16);
  const docRef = () => fs.collection('saves').doc(user.uid);
  const plain = o => JSON.parse(JSON.stringify(o));      // Firestore no admite undefined

  /** Fija el usuario actual: el nombre sale del perfil de Firebase o, en cuentas viejas, del documento guardado. */
  async function setUser(u, typedName) {
    let name = cleanName(u.displayName);
    if (!name) {
      try { const s = await fs.collection('saves').doc(u.uid).get(); name = cleanName(s.exists && s.data().save && s.data().save.name); } catch (e) { /* sin conexión */ }
    }
    if (!name) name = cleanName(typedName) || 'Entrenador';
    if (!u.displayName) { try { await u.updateProfile({ displayName: name }); } catch (e) { /* nada */ } }
    user = { uid: u.uid, name, guest: false };
    return user;
  }

  function authError(e) {
    const c = (e && e.code) || '';
    const M = {
      'auth/email-already-in-use': 'Ese nombre ya existe.',
      'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
      'auth/invalid-login-credentials': 'Usuario o contraseña incorrectos.',
      'auth/wrong-password': 'Usuario o contraseña incorrectos.',
      'auth/user-not-found': 'Usuario o contraseña incorrectos.',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
      'auth/too-many-requests': 'Demasiados intentos seguidos. Espera un poco.',
      'auth/network-request-failed': 'Sin conexión a internet.',
      'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.',
      'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication > Configuración > Dominios autorizados).',
      'auth/operation-not-allowed': 'Ese método de inicio de sesión no está activado en Firebase.',
      'auth/admin-restricted-operation': 'Ahora mismo no se pueden crear cuentas nuevas. Si ya tienes cuenta, entra normal; si no, puedes jugar como invitado.',
      'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión y repite la operación.',
      'permission-denied': 'La base de datos rechazó el acceso.',
      'unavailable': 'Sin conexión con la base de datos.'
    };
    if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
    return M[c] || ('Error: ' + (c || (e && e.message) || 'desconocido'));
  }

  /** Arranca y recupera la sesión anterior. */
  function ready() {
    if (readyP) return readyP;
    readyP = (async () => {
      try { if (await initCloud()) mode = 'cloud'; }
      catch (e) { console.warn('[Cuenta] sin nube:', e.message); mode = 'local'; }
      if (mode === 'local') return { mode, user: null };
      const u = await new Promise(res => { const off = auth.onAuthStateChanged(x => { off(); res(x); }); });
      if (u) await setUser(u);
      return { mode, user };
    })();
    return readyP;
  }

  async function register(name, pass) {
    name = (name || '').trim();
    if (!VALID.test(name)) return { ok: false, error: 'El nombre debe tener 3-16 letras, números o _.' };
    if ((pass || '').length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    try {
      const cred = await auth.createUserWithEmailAndPassword(nameToEmail(name), pass);
      try { await cred.user.updateProfile({ displayName: name }); } catch (e) { /* nada */ }
      await setUser(cred.user, name);
      return { ok: true, isNew: true };
    } catch (e) { return { ok: false, error: authError(e) }; }
  }

  async function login(name, pass) {
    name = (name || '').trim();
    if (!name) return { ok: false, error: 'Escribe tu nombre.' };
    try {
      const cred = await auth.signInWithEmailAndPassword(nameToEmail(name), pass || '');
      await setUser(cred.user, name);
      return { ok: true };
    } catch (e) { return { ok: false, error: authError(e) }; }
  }

  async function google() {
    if (mode !== 'cloud') return { ok: false, error: 'Entrar con Google necesita la versión publicada.' };
    try {
      const cred = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      await setUser(cred.user, cred.user.displayName);
      return { ok: true };
    } catch (e) { return { ok: false, error: authError(e) }; }
  }

  function guest() { user = { uid: null, name: 'Invitado', guest: true }; return { ok: true }; }

  async function logout() {
    if (pending) { try { await flush(); } catch (e) { /* queda en este navegador */ } }
    clearTimeout(pushT); pending = null;
    if (D.Social) { try { await D.Social.stop(); } catch (e) { /* nada */ } }       // «desconectado» para tus amigos, mientras aún hay sesión
    if (mode === 'cloud' && user && !user.guest) { try { await auth.signOut(); } catch (e) { /* nada */ } }
    user = null;
  }

  const isNameAccount = () => !!(auth && auth.currentUser && (auth.currentUser.email || '').endsWith('@' + NAME_DOMAIN));
  const hasGoogle = () => !!(auth && auth.currentUser && auth.currentUser.providerData.some(p => p.providerId === 'google.com'));

  /** Vincula el Gmail a una cuenta de nombre: si olvidas la contraseña, entras con Google y es la misma cuenta. */
  async function linkGoogle() {
    if (!auth || !auth.currentUser) return { ok: false, error: 'Inicia sesión primero.' };
    try { await auth.currentUser.linkWithPopup(new firebase.auth.GoogleAuthProvider()); return { ok: true }; }
    catch (e) {
      const c = (e && e.code) || '';
      if (c === 'auth/provider-already-linked') return { ok: true };
      if (c === 'auth/credential-already-in-use' || c === 'auth/email-already-in-use') return { ok: false, error: 'Ese Gmail ya tiene su propia cuenta. Usa otro Gmail.' };
      return { ok: false, error: authError(e) };
    }
  }

  /** Borra la cuenta y sus datos. Antes confirma quién eres (contraseña o ventana de Google). */
  async function deleteAccount(pass) {
    if (!user || user.guest || mode !== 'cloud') return { ok: false, error: 'No hay cuenta que borrar.' };
    try {
      const cu = auth.currentUser;
      if (isNameAccount()) {
        if (!pass) return { ok: false, error: 'Escribe tu contraseña.' };
        await cu.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(cu.email, pass));
      } else await cu.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
      clearTimeout(pushT); pending = null;
      if (D.Social) { try { await D.Social.stop('delete'); } catch (e) { /* nada */ } }   // apodo, amistades y presencia
      await docRef().delete();
      await auth.currentUser.delete();
      user = null;
      return { ok: true };
    } catch (e) { return { ok: false, error: authError(e) }; }
  }

  // ---------------- datos del Duelo en la nube ----------------

  async function pull() {
    if (mode !== 'cloud' || !user || user.guest) return null;
    try {
      const snap = await docRef().get();
      const d = snap.exists && snap.data().save && snap.data().save.duelo;
      return d && Array.isArray(d.decks) ? d : null;
    } catch (e) { console.warn('[Cuenta] no se pudo leer:', e.code || e.message); return null; }
  }

  function pushNow() {
    if (mode !== 'cloud' || !user || user.guest || !pending) return Promise.resolve();
    if (pushing) return pushing.then(() => (pending ? pushNow() : undefined));
    const data = pending; pending = null; clearTimeout(pushT); pushT = 0;
    const ref = docRef();
    const run = fs.runTransaction(async tx => {
      const snap = await tx.get(ref), cur = snap.exists ? snap.data() : null;
      const save = Object.assign({}, cur && cur.save, { duelo: plain(data) });
      if (!save.name) save.name = user.name;
      const doc = { save, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), v: (cur && cur.v) || SCHEMA };
      if (cur && cur.ban === true) doc.ban = true;
      tx.set(ref, doc);
    });
    const timeout = new Promise((_, no) => setTimeout(() => no({ code: 'unavailable' }), 12000));
    pushing = Promise.race([run, timeout]).catch(e => {
      console.warn('[Cuenta] no se pudo guardar:', e.code || e.message);
      if (!pending) pending = data;                        // se reintenta con lo siguiente
      pushT = setTimeout(pushNow, 30000);
    }).finally(() => { pushing = null; });
    return pushing;
  }

  function push(data) {
    if (mode !== 'cloud' || !user || user.guest) return;
    pending = data;
    clearTimeout(pushT); pushT = setTimeout(pushNow, PUSH_WAIT);
  }
  const flush = () => (pending || pushing ? Promise.race([pushNow(), new Promise(r => setTimeout(r, 6000))]) : Promise.resolve());

  D.Account = {
    ready, register, login, google, guest, logout, linkGoogle, deleteAccount, isNameAccount, hasGoogle, pull, push, flush,
    get user() { return user; },
    get cloud() { return mode === 'cloud'; },
    firebase() { return { fb: window.firebase, rtdb }; }
  };
})();
