const dialog=document.querySelector('#authDialog'), content=document.querySelector('#authContent');

// URL base del backend. config.js la resuelve (local o Render).
const API_BASE = window.SMARTDJ_API_URL || 'https://smart-dj-platform.onrender.com';

// Guardamos el accessToken en localStorage para sobrevivir recargas y
// no depender de cookies cross-site (Vercel -> Render) que el navegador bloquea.
function getToken() { return localStorage.getItem('accessToken'); }
function setToken(token) { if (token) localStorage.setItem('accessToken', token); }
function clearToken() { localStorage.removeItem('accessToken'); }

// Construye la URL del backend y verifica que no salga de API_BASE/api/ (evita desviar la petición
// a otro origen con rutas como "//otro-host" o "../").
function apiUrl(path) {
  const base = new URL(`${API_BASE}/api/`);
  const url = new URL(`${API_BASE}/api${path}`);
  if (!String(path).startsWith('/') || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Ruta de API inválida.');
  return url.toString();
}

// Cliente fetch robusto: agrega el Bearer token automaticamente, valida res.ok
// y NUNCA intenta parsear HTML como JSON.
async function api(path, options = {}) {
  const url = apiUrl(path);
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
function authForm(mode='login'){const register=mode==='register';content.innerHTML=`<section class="auth"><h2>${register?'Crea tu venue':'Bienvenido de nuevo'}</h2><p>${register?'Empieza a dirigir tu ambiente musical.':'Ingresa a tu consola Smart DJ.'}</p><form id="authForm" novalidate>${register?'<input name="name" placeholder="Tu nombre" autocomplete="name"><p class="field-error" data-error-for="name"></p>':''}<input name="email" type="email" placeholder="Correo electrónico" autocomplete="email"><p class="field-error" data-error-for="email"></p><input name="password" type="password" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="${register?'new-password':'current-password'}"><p class="field-error" data-error-for="password"></p><p class="error" id="formError"></p><button type="submit">${register?'Crear cuenta':'Ingresar'}</button></form>${register?'':'<button type="button" class="switch" id="forgotLink">¿Olvidaste tu contraseña?</button>'}<button type="button" class="switch" id="switchAuth">${register?'Ya tengo cuenta':'Crear una cuenta'}</button></section>`;document.querySelector('#switchAuth').onclick=()=>authForm(register?'login':'register');if(!register)document.querySelector('#forgotLink').onclick=()=>forgotForm();document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));showFormError('');let firstError=null;if(register){const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);if(nameErr)firstError=nameErr;}const emailErr=validateEmail(data.email);setError(document.querySelector('[data-error-for="email"]'),emailErr);if(emailErr&&!firstError)firstError=emailErr;const passErr=validatePassword(data.password,register);setError(document.querySelector('[data-error-for="password"]'),passErr);if(passErr&&!firstError)firstError=passErr;if(firstError)return showFormError(firstError);const payload={email:data.email.trim(),password:data.password};if(register)payload.name=data.name.trim();try{if(register){const email=payload.email.toLowerCase();const signed=await supabaseAuth(auth=>auth.signUp({email,password:payload.password,options:{data:{name:payload.name}}}));if(signed?.user&&Array.isArray(signed.user.identities)&&!signed.user.identities.length)return showFormError(authErrorMessages.email_exists);if(signed?.session)return await openSession(signed.session);return verifyStep(email);}const signedIn=await supabaseAuth(auth=>auth.signInWithPassword({email:payload.email.toLowerCase(),password:payload.password}));await openSession(signedIn.session);}catch(err){if(err.code==='email_not_confirmed'||err.code==='EMAIL_NOT_VERIFIED')return offerVerification(payload.email.toLowerCase(),err.message);showFormError(err.message)}}}

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
// ---------- Vistas de página completa (panel del dueño y página pública del local) ----------
// Reemplazan la portada (main#inicio) sin recargar; showLanding() la vuelve a mostrar.
function appView() {
  let view = document.querySelector('#app-view');
  if (!view) {
    view = el('section', { id: 'app-view', class: 'app-view' });
    document.querySelector('#inicio').after(view);
  }
  return view;
}
function showView(...nodes) {
  if (dialog.open) dialog.close();
  document.querySelector('#inicio').hidden = true;
  const view = appView();
  view.hidden = false;
  view.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}
function showLanding() {
  const view = document.querySelector('#app-view');
  if (view) { view.hidden = true; view.replaceChildren(); }
  document.querySelector('#inicio').hidden = false;
}

// ---------- Panel del dueño ----------
const VENUE_KIND_LABELS = { restaurant: 'Restaurante', cafe: 'Café', salsa_bar: 'Bar de salsa', nightclub: 'Discoteca', lounge: 'Lounge', other: 'Otro' };
const REQUEST_STATUS_LABELS = { queued: 'En cola', accepted: 'Aceptada', bridging: 'Con transición', rejected: 'Rechazada', played: 'Sonada' };
const PANEL_POLL_MS = 5000;
let panelPoll = null;
function stopPanelPoll() { clearInterval(panelPoll); panelPoll = null; }
const publicLink = (venue) => `${location.origin}/?venue=${encodeURIComponent(venue.public_code)}`;

// Formulario de local (crear o editar). onSave(datos) debe devolver una promesa.
function venueForm(venue, onSave, onCancel) {
  const name = el('input', { name: 'name', placeholder: 'Nombre del local', maxlength: '120', 'aria-label': 'Nombre del local' });
  const kind = el('select', { name: 'kind', 'aria-label': 'Tipo de local' }, ...Object.entries(VENUE_KIND_LABELS).map(([value, label]) => el('option', { value, text: label })));
  const ambience = el('textarea', { name: 'ambience', placeholder: 'Describe el ambiente que deseas', maxlength: '500', 'aria-label': 'Ambiente' });
  if (venue) { name.value = venue.name; kind.value = venue.kind; ambience.value = venue.ambience; }
  const error = el('p', { class: 'error' });
  const form = el('form', { class: 'venue-form', novalidate: '' }, name, kind, ambience, error,
    el('div', { class: 'row' }, el('button', { type: 'submit', text: venue ? 'Guardar cambios' : 'Crear local' }),
      onCancel ? el('button', { type: 'button', class: 'switch', text: 'Cancelar', onclick: onCancel }) : null));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { name: name.value.trim(), kind: kind.value, ambience: ambience.value.trim() };
    const problem = validateName(data.name) || (data.ambience.length < 2 ? 'Describe el ambiente (mínimo 2 caracteres).' : null);
    if (problem) return setError(error, problem);
    setError(error, '');
    try { await onSave(data); } catch (err) { setError(error, err.message); }
  });
  return form;
}

// Botones de acción según el estado actual de la petición.
function requestActions(request, onChange) {
  const actions = [];
  if (request.status !== 'accepted' && request.status !== 'played') actions.push(['accepted', 'Aceptar']);
  if (request.status !== 'rejected' && request.status !== 'played') actions.push(['rejected', 'Rechazar']);
  if (request.status !== 'played' && request.status !== 'rejected') actions.push(['played', 'Marcar como sonada']);
  return actions.map(([status, label]) => el('button', { type: 'button', class: `action action-${status}`, text: label, onclick: (e) => onChange(request, status, e.currentTarget) }));
}

function requestRow(request, onChange) {
  const cover = request.artwork_url
    ? el('img', { class: 'cover', src: request.artwork_url, alt: '', width: '48', height: '48', loading: 'lazy' })
    : el('div', { class: 'cover cover-empty', 'aria-hidden': 'true', text: '♪' });
  const when = new Date(request.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return el('li', { class: `request status-${request.status}` },
    cover,
    el('div', { class: 'request-info' },
      el('strong', { text: request.title }),
      el('small', { text: `${request.artist} · pedida por ${request.guest_name} · ${when}` }),
      request.ai_reason ? el('small', { class: 'reason', text: request.ai_reason }) : null),
    el('span', { class: 'badge', text: REQUEST_STATUS_LABELS[request.status] || request.status }),
    el('div', { class: 'actions' }, ...requestActions(request, onChange), previewButton({ previewUrl: request.preview_url, trackId: request.id, title: request.title })));
}

// Detalle de un local: datos, link público, QR y peticiones con actualización periódica.
function venueDetail(venue, { onEdited, onConsole }) {
  const list = el('ul', { class: 'requests' });
  const info = el('p', { class: 'notice', text: 'Cargando peticiones…' });
  const header = el('div', { class: 'venue-head' });
  const editArea = el('div');
  const refresh = async () => {
    try {
      const data = await api(`/venues/${encodeURIComponent(venue.id)}/dashboard?limit=50`);
      info.textContent = data.requests.length ? `Peticiones recientes (se actualizan cada ${PANEL_POLL_MS / 1000} s).` : 'Todavía no hay peticiones. Comparte el link o el QR del local.';
      list.replaceChildren(...data.requests.map((r) => requestRow(r, changeStatus)));
    } catch (err) {
      if (err.status === 401) { stopPanelPoll(); clearToken(); showLanding(); authForm('login'); return dialog.showModal(); }
      info.textContent = err.message;
    }
  };
  const changeStatus = async (request, status, button) => {
    button.disabled = true;
    try { await api(`/venues/${encodeURIComponent(venue.id)}/requests/${encodeURIComponent(request.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); }
    catch (err) { info.textContent = err.message; button.disabled = false; }
  };
  const renderHeader = () => header.replaceChildren(
    el('div', {},
      el('h2', { text: venue.name }),
      el('p', { text: `${VENUE_KIND_LABELS[venue.kind] || venue.kind} · ${venue.ambience}` })),
    el('button', { type: 'button', class: 'console-open', text: '🎧 Consola de DJ', onclick: () => onConsole?.(venue) }),
    el('button', { type: 'button', class: 'switch', text: 'Editar local', onclick: () => {
      editArea.replaceChildren(venueForm(venue, async (data) => {
        const saved = await api(`/venues/${encodeURIComponent(venue.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
        Object.assign(venue, saved);
        editArea.replaceChildren();
        renderHeader();
        onEdited(saved);
      }, () => editArea.replaceChildren()));
    } }));
  renderHeader();
  stopPanelPoll();
  void refresh();
  panelPoll = setInterval(() => { if (!document.hidden) void refresh(); }, PANEL_POLL_MS);
  return el('div', { class: 'venue-detail' }, header, editArea, shareBox(venue), el('h3', { text: 'Peticiones' }), info, list);
}

// Link público del local con botón para copiarlo (el QR se agrega en shareBox del bloque D).
// Dibuja el QR del link en un canvas (qrcode-generator, cargado desde CDN con SRI). Devuelve null si no cargó.
const QR_MODULE_PX = 8;
const QR_MARGIN_MODULES = 4;
function qrCanvas(text) {
  if (typeof window.qrcode !== 'function') return null;
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const size = (modules + QR_MARGIN_MODULES * 2) * QR_MODULE_PX;
  const canvas = el('canvas', { class: 'qr', width: String(size), height: String(size), role: 'img', 'aria-label': `Código QR de ${text}` });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + QR_MARGIN_MODULES) * QR_MODULE_PX, (row + QR_MARGIN_MODULES) * QR_MODULE_PX, QR_MODULE_PX, QR_MODULE_PX);
    }
  }
  return canvas;
}
const fileSlug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'local';

function shareBox(venue) {
  const link = publicLink(venue);
  const status = el('small', { class: 'copy-status' });
  const canvas = qrCanvas(link);
  const qrArea = canvas
    ? el('div', { class: 'qr-area' }, canvas, el('button', { type: 'button', class: 'switch', text: 'Descargar QR (PNG)', onclick: () => {
      canvas.toBlob((blob) => {
        if (!blob) { status.textContent = 'No se pudo generar el PNG.'; return; }
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: `qr-${fileSlug(venue.name)}.png` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    } }))
    : el('p', { class: 'notice', text: 'No se pudo cargar el generador de QR. Recarga la página.' });
  return el('div', { class: 'share' },
    qrArea,
    el('p', {}, 'Link público: ', el('a', { href: link, target: '_blank', rel: 'noopener', text: link })),
    el('button', { type: 'button', class: 'switch', text: 'Copiar link', onclick: async () => {
      try { await navigator.clipboard.writeText(link); status.textContent = 'Link copiado.'; } catch { status.textContent = 'No se pudo copiar; selecciónalo y cópialo a mano.'; }
    } }),
    status);
}

async function showDashboard(user, { selectId } = {}) {
  let venues = [];
  try { venues = await api('/venues'); }
  catch (err) {
    if (err.status === 401) { clearToken(); showLanding(); if (!dialog.open) dialog.showModal(); return authForm('login'); }
    venues = [];
  }
  let selectedId = venues.find((v) => v.id === selectId)?.id || venues[0]?.id || null;
  const sidebar = el('aside', { class: 'venue-list' });
  const main = el('div', { class: 'panel-main' });
  const select = (id) => { selectedId = id; renderSidebar(); renderMain(); };
  const renderSidebar = () => sidebar.replaceChildren(
    el('h3', { text: 'Tus locales' }),
    venues.length ? el('ul', {}, ...venues.map((v) => el('li', {}, el('button', { type: 'button', class: v.id === selectedId ? 'venue-item selected' : 'venue-item', text: v.name, onclick: () => select(v.id) })))) : el('p', { text: 'Aún no tienes locales.' }),
    el('button', { type: 'button', text: '+ Nuevo local', onclick: () => select(null) }));
  const renderMain = () => {
    const venue = venues.find((v) => v.id === selectedId);
    if (venue) return main.replaceChildren(venueDetail(venue, { onEdited: () => renderSidebar(), onConsole: (v) => showConsole(v, { onBack: () => showDashboard(user, { selectId: v.id }) }) }));
    stopPanelPoll();
    main.replaceChildren(el('h2', { text: 'Nuevo local' }), el('p', { text: 'Registra un local para activar el DJ inteligente.' }),
      venueForm(null, async (data) => { const created = await api('/venues', { method: 'POST', body: JSON.stringify(data) }); venues.unshift(created); select(created.id); }));
  };
  const logout = async () => { stopPanelPoll(); if (supabaseClient) await supabaseClient.auth.signOut().catch(() => {}); clearToken(); showLanding(); };
  renderSidebar();
  renderMain();
  showView(el('div', { class: 'panel' },
    el('div', { class: 'panel-bar' }, el('h1', { text: `Hola, ${user.name}` }), el('button', { type: 'button', id: 'logoutBtn', class: 'switch', text: 'Cerrar sesión', onclick: logout })),
    el('div', { class: 'panel-body' }, sidebar, main)));
}
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
      if (steps.length) children.push(el('ol', {}, ...steps.map((step) => el('li', { text: step.target_bpm ? `${step.genre} a ${step.target_bpm} BPM` : step.genre }))));
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
    source.onerror = () => { if (finished) return; source.close(); source = null; void poll(); };
  } else {
    void poll();
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

// Etiqueta del origen de una pista: "Completa" (suena entera) o "Preview 30 s" (corte de iTunes).
function kindBadge(track) {
  if (!track?.kindLabel) return null;
  return el('span', { class: `kind kind-${track.kind}`, text: track.kindLabel });
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
        el('span', { class: 'track-info' }, el('strong', { text: track.title }), el('small', { text: track.genre ? `${track.artist} · ${track.genre}` : track.artist })),
        kindBadge(track));
      pick.addEventListener('click', () => { void onPick(track, list); });
      return el('li', {}, pick);
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
    // Los resultados anteriores dejan de servir mientras llega la nueva búsqueda.
    list.querySelectorAll('button.track').forEach((b) => { b.disabled = true; });
    if (latest.length < 2) { hint.textContent = 'Escribe al menos 2 letras para buscar.'; list.replaceChildren(); return; }
    timer = setTimeout(() => { void search(latest); }, SEARCH_DEBOUNCE_MS);
  });
  return { root: el('div', { class: 'song-search' }, input, hint, list), input };
}

function songRequestView(venue, code, { onRequested } = {}) {
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
      // Pista completa (Jamendo) por proveedor e id; preview de iTunes por trackId.
      const song = track.kind === 'full' ? { provider: track.provider, externalId: track.externalId } : { trackId: track.trackId };
      const created = await api(`/public/venues/${encodeURIComponent(code)}/requests`, { method: 'POST', body: JSON.stringify({ ...song, ...(guestName ? { guestName } : {}) }) });
      stopPreview();
      requestStatusView(created.id, track);
      if (!dialog.open) dialog.showModal();
      // Al cerrar el estado se puede pedir otra canción.
      dialog.addEventListener('close', () => {
        sending = false;
        list.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        void onRequested?.();
      }, { once: true });
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

// ---------- Página pública del local: interfaz de DJ ----------
// Muestra lo que suena (con portada y preview), la cola de próximas aceptadas y el buscador.
const NOW_POLL_MS = 10000;
const LIVE_REFRESH_MS = 2000;
let nowPoll = null;

function nowPlayingCard(song) {
  if (!song) return el('div', { class: 'now-card empty' }, el('p', { text: 'Todavía no suena ninguna canción pedida. ¡Pide la primera!' }));
  return el('div', { class: 'now-card' },
    trackCover({ ...song, trackId: song.id }, 160),
    el('div', { class: 'now-info' },
      el('small', { class: 'eyebrow', text: 'Sonando ahora' }),
      el('strong', { text: song.title }),
      el('span', { text: song.genre ? `${song.artist} · ${song.genre}` : song.artist }),
      song.kind === 'preview' ? kindBadge(song) : null,
      song.credit ? creditLine(song) : null));
}

function venuePage(venue, code) {
  const nowArea = el('div', { class: 'now-area' }, el('p', { class: 'notice', text: 'Cargando lo que suena…' }));
  const queueList = el('ol', { class: 'queue' });
  const queueHint = el('p', { class: 'notice' });
  const refresh = async () => {
    try {
      const data = await api(`/public/venues/${encodeURIComponent(code)}/now`);
      nowArea.replaceChildren(nowPlayingCard(data.nowPlaying));
      const emptyQueue = data.station ? 'La emisora está eligiendo las próximas canciones.' : 'No hay canciones en cola. Las aceptadas por el DJ aparecen aquí.';
      queueHint.textContent = data.queue.length ? '' : emptyQueue;
      queueList.replaceChildren(...data.queue.map((song) => el('li', {}, trackCover({ ...song, trackId: song.id }, 40),
        el('span', { class: 'track-info' }, el('strong', { text: song.title }), el('small', { text: song.artist })),
        song.kind === 'preview' ? kindBadge(song) : null,
        song.source === 'request' ? el('span', { class: 'requested', text: 'Pedida' }) : null)));
    } catch (err) { queueHint.textContent = err.message; }
  };
  const { view } = songRequestView(venue, code, { onRequested: refresh });
  // En vivo: el backend avisa por SSE cada cambio de la emisora y se vuelve a pedir /now (como mucho cada 2 s).
  // Si el SSE no está conectado, se consulta cada 10 s.
  let live = false;
  let pending = null;
  const refreshSoon = () => { if (!pending) pending = setTimeout(() => { pending = null; void refresh(); }, LIVE_REFRESH_MS); };
  if ('EventSource' in window) {
    const source = new EventSource(apiUrl(`/public/venues/${encodeURIComponent(code)}/events`));
    source.addEventListener('ready', () => { live = true; refreshSoon(); });
    source.addEventListener('update', refreshSoon);
    source.onerror = () => { live = false; };
  }
  clearInterval(nowPoll);
  void refresh();
  nowPoll = setInterval(() => { if (!document.hidden && !live) void refresh(); }, NOW_POLL_MS);
  return el('div', { class: 'venue-page' },
    el('header', { class: 'venue-page-head' }, el('h1', { text: venue.name }), venue.ambience ? el('p', { text: venue.ambience }) : null),
    el('div', { class: 'venue-page-body' },
      el('section', { class: 'dj-booth' }, nowArea, el('h2', { text: 'Próximas canciones' }), queueHint, queueList),
      view));
}

async function publicRequest(code) {
  let venue;
  try { venue = await api(`/public/venues/${encodeURIComponent(code)}`); }
  catch {
    showView(el('section', { class: 'auth' }, el('h2', { text: 'Local no encontrado' }), el('p', { text: 'Revisa el código o el QR que te compartieron.' })));
    return;
  }
  showView(venuePage(venue, code));
  document.querySelector('.venue-page input[type=search]')?.focus();
}
const publicCode=new URLSearchParams(location.search).get('venue');if(publicCode) void publicRequest(publicCode);
