const dialog=document.querySelector('#authDialog'), content=document.querySelector('#authContent');

// URL base del backend. config.js la resuelve (local o Render).
const API_BASE = window.SMARTDJ_API_URL || 'https://smart-dj-platform.onrender.com';

// Guardamos el accessToken en localStorage para sobrevivir recargas y
// no depender de cookies cross-site (Vercel -> Render) que el navegador bloquea.
function getToken() { return localStorage.getItem('accessToken'); }
function setToken(token) { if (token) localStorage.setItem('accessToken', token); }
function clearToken() { localStorage.removeItem('accessToken'); }

// Cliente fetch robusto: agrega el Bearer token automaticamente, valida res.ok
// y NUNCA intenta parsear HTML como JSON.
async function api(path, options = {}) {
  const url = `${API_BASE}/api${path}`;
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  let res;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch {
    throw new Error('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }
  // Si el access token expiró o quedó desfasado, intercambia la cookie HttpOnly
  // por un token nuevo y reintenta una vez antes de cerrar la sesión.
  if (res.status === 401 && token && path.startsWith('/venues')) {
    try {
      const refreshed = await supabaseAuth((auth) => auth.refreshSession());
      if (refreshed?.session?.access_token) {
        setToken(refreshed.session.access_token);
        headers.Authorization = `Bearer ${refreshed.session.access_token}`;
        res = await fetch(url, { credentials: 'include', ...options, headers });
      }
    } catch {
      // Se mostrará el error de la petición original si la renovación falla.
    }
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || (res.status === 404 ? 'Recurso no encontrado.' : 'Ocurrió un error en el servidor. Intenta más tarde.');
    const err = new Error(message);
    err.status = res.status;
    err.code = data?.code;
    err.retryAfter = data?.retryAfter;
    throw err;
  }
  return data;
}

// ---------- Supabase Auth ----------
// Cliente único de Supabase Auth; queda en null si config.js no tiene la URL o la clave anon.
const supabaseClient = window.supabase && window.SMARTDJ_SUPABASE_URL && window.SMARTDJ_SUPABASE_ANON_KEY
  ? window.supabase.createClient(window.SMARTDJ_SUPABASE_URL, window.SMARTDJ_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'smartdj-supabase' },
  })
  : null;

// Mensajes en español para los códigos de error de Supabase Auth.
const authErrorMessages = {
  invalid_credentials: 'El correo o la contraseña son incorrectos.',
  email_not_confirmed: 'Todavía no has confirmado tu correo. Escribe el código que te enviamos o pide otro.',
  user_already_exists: 'Este correo ya está registrado. Ingresa o recupera tu contraseña.',
  email_exists: 'Este correo ya está registrado. Ingresa o recupera tu contraseña.',
  weak_password: 'La contraseña es muy débil. Usa al menos 8 caracteres, con letras y números.',
  same_password: 'La contraseña nueva debe ser distinta de la anterior.',
  otp_expired: 'El código no es válido o ya venció. Pide otro.',
  otp_disabled: 'La verificación con código no está activada. Intenta más tarde.',
  over_email_send_rate_limit: 'Ya te enviamos un código hace poco. Espera un minuto antes de pedir otro.',
  over_request_rate_limit: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
  email_address_invalid: 'El correo electrónico no es válido.',
  signup_disabled: 'El registro está desactivado por ahora.',
  validation_failed: 'Revisa los datos e intenta de nuevo.',
  session_not_found: 'Tu sesión expiró. Vuelve a iniciar sesión.',
};
// Convierte un error de Supabase (o una falla de red) en un Error con mensaje en español y su código.
function authError(error) {
  const { code, status, name } = error || {};
  let message = authErrorMessages[code];
  if (!message && status === 429) message = authErrorMessages.over_request_rate_limit;
  if (!message && (name === 'AuthRetryableFetchError' || status === 0)) message = 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.';
  const err = new Error(message || 'No se pudo completar la operación. Intenta de nuevo.');
  err.code = code;
  if (code === 'over_email_send_rate_limit') err.retryAfter = 60;
  return err;
}
// Ejecuta una llamada de Supabase Auth y devuelve data; lanza un Error en español si falla.
async function supabaseAuth(call) {
  if (!supabaseClient) throw new Error('El inicio de sesión no está configurado todavía. Intenta más tarde.');
  let result;
  try { result = await call(supabaseClient.auth); } catch (err) { throw authError(err); }
  if (result?.error) throw authError(result.error);
  return result?.data;
}
// Con una sesión de Supabase: guarda el token, pide el perfil a la API y abre el panel.
async function openSession(session) {
  setToken(session.access_token);
  let user;
  try { user = await api('/auth/me'); }
  catch (err) { await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {}); clearToken(); throw err; }
  await showDashboard(user);
}
// supabase-js renueva el token antes de que venza: mantenemos al día la copia que envía api().
if (supabaseClient) supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session?.access_token && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) setToken(session.access_token);
  if (event === 'SIGNED_OUT') clearToken();
});

// ---------- Validaciones estrictas ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\s'.-]{1,79}$/u;
function validateEmail(value){const v=(value||'').trim();if(!v)return 'Escribe tu correo electrónico.';if(!EMAIL_RE.test(v))return 'Escribe un correo válido (ejemplo: nombre@gmail.com).';return null;}
function validatePassword(value,forRegistration=false){const v=value||'';if(!v)return 'Escribe tu contraseña.';if(forRegistration&&v.length<8)return 'La contraseña debe tener al menos 8 caracteres.';if(v.length>128)return 'La contraseña no puede superar 128 caracteres.';if(forRegistration&&!/[0-9]/.test(v))return 'La contraseña debe incluir al menos un número.';if(forRegistration&&!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(v))return 'La contraseña debe incluir al menos una letra.';return null;}
function validateName(value){const v=(value||'').trim();if(!v)return 'Este campo no puede estar vacío.';if(v.length<2)return 'Debe tener al menos 2 caracteres.';if(!NAME_RE.test(v))return 'Usa solo letras, números y espacios.';return null;}
function setError(el,message){if(!el)return;el.textContent=message||'';el.style.display=message?'block':'none';}
function showFormError(message){setError(document.querySelector('#formError'),message);}

// ---------- Construcción segura del DOM ----------
// Los textos siempre se asignan con textContent o como nodos de texto, nunca con innerHTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter(Boolean));
  return node;
}
function render(...nodes) { content.replaceChildren(...nodes); }

// ---------- Códigos de 6 dígitos ----------
function validateCode(value) { const v = (value || '').trim(); if (!v) return 'Escribe el código que te enviamos.'; if (!/^\d{6}$/.test(v)) return 'El código debe tener 6 dígitos.'; return null; }
function codeInput() {
  const input = el('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: 'Código de 6 dígitos' });
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
  return input;
}
// Botón "Reenviar código" con cuenta regresiva; respeta el retryAfter que devuelve el backend.
function resendButton(send, showMessage, initialWait = 60) {
  const btn = el('button', { type: 'button', class: 'switch' });
  let timer = null;
  const wait = (seconds) => {
    clearInterval(timer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = 'Reenviar código'; return; }
      btn.disabled = true; btn.textContent = `Reenviar código (${left}s)`; left--;
    };
    tick(); timer = setInterval(tick, 1000);
  };
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { const result = await send(); showMessage(result?.message || 'Te enviamos un código nuevo.', false); wait(60); }
    catch (err) { showMessage(err.message, true); wait(err.retryAfter || 0); }
  });
  wait(initialWait);
  return btn;
}

// ---------- Verificación del correo ----------
function verifyStep(email, message, initialWait = 60) {
  const info = el('p', { class: 'notice', text: message || 'Te enviamos un código de 6 dígitos a tu correo.' });
  const input = codeInput();
  const fieldError = el('p', { class: 'field-error' });
  const formError = el('p', { class: 'error', id: 'formError' });
  const form = el('form', { novalidate: '' }, input, fieldError, formError, el('button', { type: 'submit', text: 'Verificar' }));
  const showMessage = (text, isError) => { if (isError) return setError(formError, text); setError(formError, ''); info.textContent = text; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeErr = validateCode(input.value); setError(fieldError, codeErr);
    if (codeErr) return setError(formError, codeErr);
    setError(formError, '');
    try {
      const verified = await supabaseAuth((auth) => auth.verifyOtp({ email, token: input.value.trim(), type: 'email' }));
      await openSession(verified.session);
    } catch (err) { setError(formError, err.message); }
  });
  render(el('section', { class: 'auth' },
    el('h2', { text: 'Verifica tu correo' }),
    el('p', {}, 'Escribe el código que enviamos a ', el('b', { text: email }), '. Vence en 10 minutos.'),
    info, form,
    resendButton(() => supabaseAuth((auth) => auth.resend({ type: 'signup', email })), showMessage, initialWait),
    el('button', { type: 'button', class: 'switch', text: 'Volver a ingresar', onclick: () => authForm('login') })));
  input.focus();
}
// Login de una cuenta sin verificar: muestra el error y ofrece enviar un código nuevo.
function offerVerification(email, message) {
  showFormError(message);
  const form = document.querySelector('#authForm');
  if (!form || form.querySelector('[data-verify]')) return;
  form.append(el('button', { type: 'button', class: 'switch', 'data-verify': '', text: 'Enviar código de verificación', onclick: async () => {
    try { await supabaseAuth((auth) => auth.resend({ type: 'signup', email })); verifyStep(email); }
    catch (err) { if (err.code === 'over_email_send_rate_limit') verifyStep(email, 'Ya te enviamos un código hace poco. Revisa tu correo.', err.retryAfter); else showFormError(err.message); }
  } }));
}
function authForm(mode='login'){const register=mode==='register';content.innerHTML=`<section class="auth"><h2>${register?'Crea tu venue':'Bienvenido de nuevo'}</h2><p>${register?'Empieza a dirigir tu ambiente musical.':'Ingresa a tu consola Smart DJ.'}</p><form id="authForm" novalidate>${register?'<input name="name" placeholder="Tu nombre" autocomplete="name"><p class="field-error" data-error-for="name"></p>':''}<input name="email" type="email" placeholder="Correo electrónico" autocomplete="email"><p class="field-error" data-error-for="email"></p><input name="password" type="password" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="${register?'new-password':'current-password'}"><p class="field-error" data-error-for="password"></p><p class="error" id="formError"></p><button type="submit">${register?'Crear cuenta':'Ingresar'}</button></form>${register?'':'<button type="button" class="switch" id="forgotLink">¿Olvidaste tu contraseña?</button>'}<button type="button" class="switch" id="switchAuth">${register?'Ya tengo cuenta':'Crear una cuenta'}</button></section>`;document.querySelector('#switchAuth').onclick=()=>authForm(register?'login':'register');if(!register)document.querySelector('#forgotLink').onclick=()=>forgotForm();document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));showFormError('');let firstError=null;if(register){const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);if(nameErr)firstError=nameErr;}const emailErr=validateEmail(data.email);setError(document.querySelector('[data-error-for="email"]'),emailErr);if(emailErr&&!firstError)firstError=emailErr;const passErr=validatePassword(data.password,register);setError(document.querySelector('[data-error-for="password"]'),passErr);if(passErr&&!firstError)firstError=passErr;if(firstError)return showFormError(firstError);const payload={email:data.email.trim(),password:data.password};if(register)payload.name=data.name.trim();try{if(register){const email=payload.email.toLowerCase();const signed=await supabaseAuth(auth=>auth.signUp({email,password:payload.password,options:{data:{name:payload.name}}}));if(signed?.user&&Array.isArray(signed.user.identities)&&!signed.user.identities.length)return showFormError(authErrorMessages.email_exists);if(signed?.session)return openSession(signed.session);return verifyStep(email);}const signedIn=await supabaseAuth(auth=>auth.signInWithPassword({email:payload.email.toLowerCase(),password:payload.password}));await openSession(signedIn.session);}catch(err){if(err.code==='email_not_confirmed'||err.code==='EMAIL_NOT_VERIFIED')return offerVerification(payload.email.toLowerCase(),err.message);showFormError(err.message)}}}

// ---------- Olvidé mi contraseña ----------
function forgotForm() {
  const email = el('input', { name: 'email', type: 'email', placeholder: 'Correo electrónico', autocomplete: 'email' });
  const fieldError = el('p', { class: 'field-error' });
  const formError = el('p', { class: 'error', id: 'formError' });
  const form = el('form', { novalidate: '' }, email, fieldError, formError, el('button', { type: 'submit', text: 'Enviar código' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailErr = validateEmail(email.value); setError(fieldError, emailErr);
    if (emailErr) return setError(formError, emailErr);
    setError(formError, '');
    const value = email.value.trim().toLowerCase();
    try { await supabaseAuth((auth) => auth.resetPasswordForEmail(value)); resetForm(value);}
    catch (err) { setError(formError, err.message); }
  });
  render(el('section', { class: 'auth' },
    el('h2', { text: 'Recuperar contraseña' }),
    el('p', { text: 'Te enviaremos un código de 6 dígitos para crear una nueva.' }),
    form,
    el('button', { type: 'button', class: 'switch', text: 'Volver a ingresar', onclick: () => authForm('login') })));
  email.focus();
}

// ---------- Nueva contraseña con token ----------
function resetForm(email, message) {
  const info = el('p', { class: 'notice', text: message || 'Si el correo existe, te enviamos un código para restablecer tu contraseña.' });
  const code = codeInput();
  const password = el('input', { name: 'password', type: 'password', placeholder: 'Nueva contraseña (mínimo 8 caracteres)', autocomplete: 'new-password' });
  const confirm = el('input', { name: 'confirm', type: 'password', placeholder: 'Repite la nueva contraseña', autocomplete: 'new-password' });
  const errors = { code: el('p', { class: 'field-error' }), password: el('p', { class: 'field-error' }), confirm: el('p', { class: 'field-error' }) };
  const formError = el('p', { class: 'error', id: 'formError' });
  const form = el('form', { novalidate: '' }, code, errors.code, password, errors.password, confirm, errors.confirm, formError, el('button', { type: 'submit', text: 'Guardar contraseña' }));
  const showMessage = (text, isError) => { if (isError) return setError(formError, text); setError(formError, ''); info.textContent = text; };
  // verifyOtp consume el código: si luego falla updateUser (p. ej. contraseña repetida), se reintenta sin pedir otro.
  let codeVerified = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeErr = codeVerified ? null : validateCode(code.value);
    const passErr = validatePassword(password.value, true);
    const confirmErr = !passErr && password.value !== confirm.value ? 'Las contraseñas no coinciden.' : null;
    setError(errors.code, codeErr); setError(errors.password, passErr); setError(errors.confirm, confirmErr);
    const firstError = codeErr || passErr || confirmErr;
    if (firstError) return setError(formError, firstError);
    setError(formError, '');
    try {
      if (!codeVerified) {
        await supabaseAuth((auth) => auth.verifyOtp({ email, token: code.value.trim(), type: 'recovery' }));
        codeVerified = true;
        code.disabled = true;
      }
      await supabaseAuth((auth) => auth.updateUser({ password: password.value }));
      // Cierra todas las sesiones de la cuenta, incluida la que abrió el código.
      await supabaseClient.auth.signOut({ scope: 'global' }).catch(() => {});
      clearToken();
      render(el('section', { class: 'auth' },
        el('h2', { text: '¡Listo!' }),
        el('p', { text: 'Tu contraseña se actualizó y cerramos las sesiones abiertas. Ya puedes ingresar.' }),
        el('button', { type: 'button', class: 'switch', text: 'Ingresar', onclick: () => authForm('login') })));
    } catch (err) { setError(formError, err.message); }
  });
  render(el('section', { class: 'auth' },
    el('h2', { text: 'Nueva contraseña' }),
    el('p', {}, 'Escribe el código que enviamos a ', el('b', { text: email }), ' y elige una contraseña segura.'),
    info, form,
    resendButton(() => supabaseAuth((auth) => auth.resetPasswordForEmail(email)), showMessage),
    el('button', { type: 'button', class: 'switch', text: 'Volver a ingresar', onclick: () => authForm('login') })));
  code.focus();
}
async function showDashboard(user){let venues=[];try{venues=await api('/venues')}catch(err){if(err.status===401){clearToken();if(!dialog.open)dialog.showModal();return authForm('login');}}const existing=venues.length?`<p>Establecimientos activos:</p>${venues.map(v=>`<p><b>${v.name}</b><br><small>Petición pública: ${location.origin}/?venue=${v.public_code}</small></p>`).join('')}<hr>`:'';content.innerHTML=`<section class="auth"><h2>Hola, ${user.name}</h2>${existing}<p>Registra un establecimiento para activar el DJ inteligente.</p><form id="venueForm" novalidate><input name="name" placeholder="Nombre del establecimiento"><p class="field-error" data-error-for="name"></p><select name="kind"><option value="restaurant">Restaurante</option><option value="cafe">Café</option><option value="salsa_bar">Bar de Salsa</option><option value="nightclub">Discoteca</option><option value="lounge">Lounge</option><option value="other">Otro</option></select><textarea name="ambience" placeholder="Describe el ambiente que deseas"></textarea><p class="field-error" data-error-for="ambience"></p><p class="error" id="venueError"></p><button type="submit">Crear establecimiento</button></form><button type="button" class="switch" id="logoutBtn">Cerrar sesión</button></section>`;document.querySelector('#logoutBtn').onclick=async()=>{if(supabaseClient)await supabaseClient.auth.signOut().catch(()=>{});clearToken();authForm('login');};document.querySelector('#venueForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));setError(document.querySelector('#venueError'),'');const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);const ambienceErr=(data.ambience||'').trim().length<2?'Describe el ambiente (mínimo 2 caracteres).':null;setError(document.querySelector('[data-error-for="ambience"]'),ambienceErr);if(nameErr||ambienceErr)return setError(document.querySelector('#venueError'),nameErr||ambienceErr);try{await api('/venues',{method:'POST',body:JSON.stringify({name:data.name.trim(),kind:data.kind,ambience:data.ambience.trim()})});await showDashboard(user)}catch(err){setError(document.querySelector('#venueError'),err.message)}}}
document.querySelector('#openLogin').onclick=()=>{authForm();dialog.showModal()};document.querySelector('#openRegister').onclick=document.querySelector('#heroStart').onclick=()=>{authForm('register');dialog.showModal()};document.querySelector('#closeDialog').onclick=()=>dialog.close();
document.querySelector('#mixButton').onclick=()=>{const st=document.querySelector('#mixStatus');st.textContent='Puente armónico generado · mezclando…';document.querySelectorAll('.platter').forEach(p=>p.style.animationDuration='2s');setTimeout(()=>{st.textContent='Transición completada · 94% match';document.querySelectorAll('.platter').forEach(p=>p.style.animationDuration='8s')},1800)};
document.querySelector('#crossfade').oninput=e=>document.querySelector('.deck').style.filter=`brightness(${.8+e.target.value/500})`;
// ---------- Estado en vivo de una petición ----------
// El backend recibe las etapas del motor por streaming gRPC y las reenvía por SSE (EventSource).
// Si SSE no está disponible o se corta, se consulta el estado cada 2 segundos (polling).
const REQUEST_STAGES = [
  ['queued', 'En cola'],
  ['analyzing_genre', 'Analizando el género'],
  ['analyzing_bpm', 'Analizando el tempo'],
  ['analyzing_key', 'Analizando la tonalidad'],
  ['result', 'Resultado'],
];
function requestStatusView(requestId, track = null) {
  const items = new Map(REQUEST_STAGES.map(([stage, label]) => [stage, el('li', { class: 'stage-pending', text: label })]));
  const message = el('p', { class: 'notice', text: 'Tu petición está en la cola.' });
  const outcome = el('div');
  let source = null;
  let pollTimer = null;
  let finished = false;
  const stop = () => { finished = true; source?.close(); clearTimeout(pollTimer); };
  const showOutcome = (event) => {
    const children = [];
    if (event.stage === 'failed') {
      children.push(el('h3', { text: 'No pudimos evaluarla' }), el('p', { text: event.message }));
    } else if (event.result?.accepted) {
      children.push(el('h3', { text: '¡Aceptada!' }), el('p', { text: event.result.reason }));
    } else {
      children.push(el('h3', { text: 'El DJ preparará una transición' }), el('p', { text: event.result?.reason || event.message }));
      const steps = event.result?.bridgeSequence || [];
      if (steps.length) children.push(el('ol', {}, ...steps.map((step) => el('li', { text: `${step.genre} a ${step.target_bpm} BPM` }))));
    }
    outcome.replaceChildren(...children);
  };
  const apply = (event) => {
    if (finished || !event?.stage) return;
    message.textContent = event.message || '';
    const reached = REQUEST_STAGES.findIndex(([stage]) => stage === event.stage);
    REQUEST_STAGES.forEach(([stage], index) => {
      items.get(stage).className = reached < 0 ? 'stage-pending' : index < reached ? 'stage-done' : index === reached ? 'stage-current' : 'stage-pending';
    });
    if (event.stage === 'result' || event.stage === 'failed') { showOutcome(event); stop(); }
  };
  const poll = async () => {
    if (finished) return;
    try { const data = await api(`/public/requests/${encodeURIComponent(requestId)}`); apply(data.live); } catch { /* se reintenta en el siguiente ciclo */ }
    if (!finished) pollTimer = setTimeout(poll, 2000);
  };
  if ('EventSource' in window) {
    source = new EventSource(`${API_BASE}/api/public/requests/${encodeURIComponent(requestId)}/events`);
    source.addEventListener('status', (e) => { try { apply(JSON.parse(e.data)); } catch { /* evento ilegible: se ignora */ } });
    source.onerror = () => { if (finished) return; source.close(); source = null; poll(); };
  } else {
    poll();
  }
  dialog.addEventListener('close', stop, { once: true });
  render(el('section', { class: 'auth' },
    el('h2', { text: 'Petición recibida' }),
    track ? el('div', { class: 'requested-track' }, trackCover(track, 72), el('span', { class: 'track-info' }, el('strong', { text: track.title }), el('small', { text: track.artist }))) : null,
    message,
    el('ul', { class: 'stages' }, ...items.values()),
    outcome,
    el('button', { type: 'button', text: 'Cerrar', onclick: () => dialog.close() })));
}
// ---------- Pedir una canción (link público del local) ----------
// El cliente busca en el buscador del backend (iTunes desde el servidor) y al tocar una canción la pide.
const SEARCH_DEBOUNCE_MS = 400;
let previewAudio = null;
function stopPreview() { if (previewAudio) { previewAudio.pause(); previewAudio = null; } }

function trackCover(track, size = 56) {
  return track.artworkUrl
    ? el('img', { class: 'cover', src: track.artworkUrl, alt: '', width: String(size), height: String(size), loading: 'lazy' })
    : el('div', { class: 'cover cover-empty', 'aria-hidden': 'true', text: '♪' });
}

// Botón para escuchar los 30 s de muestra; solo suena una a la vez.
function previewButton(track) {
  if (!track.previewUrl) return null;
  const btn = el('button', { type: 'button', class: 'preview', 'aria-label': `Escuchar 30 segundos de ${track.title}`, text: '▶ 30 s' });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const playingThis = previewAudio && previewAudio.dataset.trackId === track.trackId;
    stopPreview();
    document.querySelectorAll('button.preview').forEach((b) => { b.textContent = '▶ 30 s'; });
    if (playingThis) return;
    previewAudio = new Audio(track.previewUrl);
    previewAudio.dataset.trackId = track.trackId;
    previewAudio.addEventListener('ended', () => { btn.textContent = '▶ 30 s'; });
    previewAudio.play().then(() => { btn.textContent = '■ Detener'; }).catch(() => { btn.textContent = 'Sin audio'; });
  });
  return btn;
}

// Buscador con resultados; onPick(track) se llama al tocar una canción.
function songSearch(code, onPick) {
  const input = el('input', { type: 'search', name: 'q', placeholder: 'Busca una canción o un artista', autocomplete: 'off', maxlength: '100', 'aria-label': 'Buscar canción' });
  const hint = el('p', { class: 'notice', text: 'Escribe al menos 2 letras para buscar.' });
  const list = el('ul', { class: 'results' });
  let timer = null;
  let latest = '';
  const show = (tracks) => {
    if (!tracks.length) { hint.textContent = 'No encontramos canciones con esa búsqueda.'; list.replaceChildren(); return; }
    hint.textContent = 'Toca una canción para pedirla.';
    list.replaceChildren(...tracks.map((track) => {
      const pick = el('button', { type: 'button', class: 'track', 'aria-label': `Pedir ${track.title} de ${track.artist}` },
        trackCover(track),
        el('span', { class: 'track-info' }, el('strong', { text: track.title }), el('small', { text: `${track.artist} · ${track.genre}` })));
      pick.addEventListener('click', () => onPick(track, list));
      return el('li', {}, pick, previewButton(track));
    }));
  };
  const search = async (q) => {
    hint.textContent = 'Buscando…';
    try {
      const tracks = await api(`/public/venues/${encodeURIComponent(code)}/search?q=${encodeURIComponent(q)}`);
      if (q === latest) show(tracks);
    } catch (err) { if (q === latest) { hint.textContent = err.message; list.replaceChildren(); } }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    latest = input.value.trim();
    if (latest.length < 2) { hint.textContent = 'Escribe al menos 2 letras para buscar.'; list.replaceChildren(); return; }
    timer = setTimeout(() => search(latest), SEARCH_DEBOUNCE_MS);
  });
  return { root: el('div', { class: 'song-search' }, input, hint, list), input };
}

function songRequestView(venue, code) {
  const name = el('input', { name: 'guestName', placeholder: 'Tu nombre (opcional)', maxlength: '60', autocomplete: 'given-name', 'aria-label': 'Tu nombre (opcional)' });
  const formError = el('p', { class: 'error', id: 'formError' });
  let sending = false;
  const { root, input } = songSearch(code, async (track, list) => {
    if (sending) return;
    const guestName = name.value.trim();
    if (guestName && guestName.length < 2) return setError(formError, 'El nombre debe tener al menos 2 letras (o déjalo vacío).');
    sending = true;
    list.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    setError(formError, '');
    try {
      const created = await api(`/public/venues/${encodeURIComponent(code)}/requests`, { method: 'POST', body: JSON.stringify({ trackId: track.trackId, ...(guestName ? { guestName } : {}) }) });
      stopPreview();
      requestStatusView(created.id, track);
    } catch (err) {
      sending = false;
      list.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      setError(formError, err.message);
    }
  });
  const view = el('section', { class: 'auth' },
    el('h2', { text: 'Pide una canción' }),
    el('p', {}, 'Estás en ', el('b', { text: venue.name }), venue.ambience ? ` · ${venue.ambience}` : ''),
    name, root, formError);
  return { view, input };
}

async function publicRequest(code) {
  let venue;
  try { venue = await api(`/public/venues/${encodeURIComponent(code)}`); }
  catch {
    render(el('section', { class: 'auth' }, el('h2', { text: 'Local no encontrado' }), el('p', { text: 'Revisa el código o el QR que te compartieron.' })));
    if (!dialog.open) dialog.showModal();
    return;
  }
  const { view, input } = songRequestView(venue, code);
  render(view);
  if (!dialog.open) dialog.showModal();
  dialog.addEventListener('close', stopPreview, { once: true });
  input.focus();
}
const publicCode=new URLSearchParams(location.search).get('venue');if(publicCode) publicRequest(publicCode);
