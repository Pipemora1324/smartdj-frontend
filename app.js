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
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const refreshed = await refreshRes.json();
      if (refreshRes.ok && refreshed?.accessToken) {
        setToken(refreshed.accessToken);
        headers.Authorization = `Bearer ${refreshed.accessToken}`;
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
      const result = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code: input.value.trim() }) });
      if (result?.accessToken) setToken(result.accessToken);
      await showDashboard(result.user);
    } catch (err) { setError(formError, err.message); }
  });
  render(el('section', { class: 'auth' },
    el('h2', { text: 'Verifica tu correo' }),
    el('p', {}, 'Escribe el código que enviamos a ', el('b', { text: email }), '. Vence en 10 minutos.'),
    info, form,
    resendButton(() => api('/auth/resend-code', { method: 'POST', body: JSON.stringify({ email }) }), showMessage, initialWait),
    el('button', { type: 'button', class: 'switch', text: 'Volver a ingresar', onclick: () => authForm('login') })));
  input.focus();
}
// Login de una cuenta sin verificar: muestra el error y ofrece enviar un código nuevo.
function offerVerification(email, message) {
  showFormError(message);
  const form = document.querySelector('#authForm');
  if (!form || form.querySelector('[data-verify]')) return;
  form.append(el('button', { type: 'button', class: 'switch', 'data-verify': '', text: 'Enviar código de verificación', onclick: async () => {
    try { const result = await api('/auth/resend-code', { method: 'POST', body: JSON.stringify({ email }) }); verifyStep(email, result?.message); }
    catch (err) { if (err.status === 429) verifyStep(email, 'Ya te enviamos un código hace poco. Revisa tu correo.', err.retryAfter); else showFormError(err.message); }
  } }));
}
function authForm(mode='login'){const register=mode==='register';content.innerHTML=`<section class="auth"><h2>${register?'Crea tu venue':'Bienvenido de nuevo'}</h2><p>${register?'Empieza a dirigir tu ambiente musical.':'Ingresa a tu consola Smart DJ.'}</p><form id="authForm" novalidate>${register?'<input name="name" placeholder="Tu nombre" autocomplete="name"><p class="field-error" data-error-for="name"></p>':''}<input name="email" type="email" placeholder="Correo electrónico" autocomplete="email"><p class="field-error" data-error-for="email"></p><input name="password" type="password" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="${register?'new-password':'current-password'}"><p class="field-error" data-error-for="password"></p><p class="error" id="formError"></p><button type="submit">${register?'Crear cuenta':'Ingresar'}</button></form>${register?'':'<button type="button" class="switch" id="forgotLink">¿Olvidaste tu contraseña?</button>'}<button type="button" class="switch" id="switchAuth">${register?'Ya tengo cuenta':'Crear una cuenta'}</button></section>`;document.querySelector('#switchAuth').onclick=()=>authForm(register?'login':'register');if(!register)document.querySelector('#forgotLink').onclick=()=>forgotForm();document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));showFormError('');let firstError=null;if(register){const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);if(nameErr)firstError=nameErr;}const emailErr=validateEmail(data.email);setError(document.querySelector('[data-error-for="email"]'),emailErr);if(emailErr&&!firstError)firstError=emailErr;const passErr=validatePassword(data.password,register);setError(document.querySelector('[data-error-for="password"]'),passErr);if(passErr&&!firstError)firstError=passErr;if(firstError)return showFormError(firstError);const payload={email:data.email.trim(),password:data.password};if(register)payload.name=data.name.trim();try{const result=await api(`/auth/${register?'register':'login'}`,{method:'POST',body:JSON.stringify(payload)});if(register)return verifyStep(payload.email.toLowerCase(),result?.message);if(result?.accessToken)setToken(result.accessToken);await showDashboard(result.user);}catch(err){if(err.code==='EMAIL_NOT_VERIFIED')return offerVerification(payload.email.toLowerCase(),err.message);showFormError(err.message)}}}

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
    try { const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: value }) }); resetForm(value, result?.message); }
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeErr = validateCode(code.value);
    const passErr = validatePassword(password.value, true);
    const confirmErr = !passErr && password.value !== confirm.value ? 'Las contraseñas no coinciden.' : null;
    setError(errors.code, codeErr); setError(errors.password, passErr); setError(errors.confirm, confirmErr);
    const firstError = codeErr || passErr || confirmErr;
    if (firstError) return setError(formError, firstError);
    setError(formError, '');
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code: code.value.trim(), password: password.value }) });
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
    resendButton(() => api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }), showMessage),
    el('button', { type: 'button', class: 'switch', text: 'Volver a ingresar', onclick: () => authForm('login') })));
  code.focus();
}
async function showDashboard(user){let venues=[];try{venues=await api('/venues')}catch(err){if(err.status===401){clearToken();if(!dialog.open)dialog.showModal();return authForm('login');}}const existing=venues.length?`<p>Establecimientos activos:</p>${venues.map(v=>`<p><b>${v.name}</b><br><small>Petición pública: ${location.origin}/?venue=${v.public_code}</small></p>`).join('')}<hr>`:'';content.innerHTML=`<section class="auth"><h2>Hola, ${user.name}</h2>${existing}<p>Registra un establecimiento para activar el DJ inteligente.</p><form id="venueForm" novalidate><input name="name" placeholder="Nombre del establecimiento"><p class="field-error" data-error-for="name"></p><select name="kind"><option value="restaurant">Restaurante</option><option value="cafe">Café</option><option value="salsa_bar">Bar de Salsa</option><option value="nightclub">Discoteca</option><option value="lounge">Lounge</option><option value="other">Otro</option></select><textarea name="ambience" placeholder="Describe el ambiente que deseas"></textarea><p class="field-error" data-error-for="ambience"></p><p class="error" id="venueError"></p><button type="submit">Crear establecimiento</button></form><button type="button" class="switch" id="logoutBtn">Cerrar sesión</button></section>`;document.querySelector('#logoutBtn').onclick=async()=>{try{await api('/auth/logout',{method:'POST'})}catch{}clearToken();authForm('login');};document.querySelector('#venueForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));setError(document.querySelector('#venueError'),'');const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);const ambienceErr=(data.ambience||'').trim().length<2?'Describe el ambiente (mínimo 2 caracteres).':null;setError(document.querySelector('[data-error-for="ambience"]'),ambienceErr);if(nameErr||ambienceErr)return setError(document.querySelector('#venueError'),nameErr||ambienceErr);try{await api('/venues',{method:'POST',body:JSON.stringify({name:data.name.trim(),kind:data.kind,ambience:data.ambience.trim()})});await showDashboard(user)}catch(err){setError(document.querySelector('#venueError'),err.message)}}}
document.querySelector('#openLogin').onclick=()=>{authForm();dialog.showModal()};document.querySelector('#openRegister').onclick=document.querySelector('#heroStart').onclick=()=>{authForm('register');dialog.showModal()};document.querySelector('#closeDialog').onclick=()=>dialog.close();
document.querySelector('#mixButton').onclick=()=>{const st=document.querySelector('#mixStatus');st.textContent='Puente armónico generado · mezclando…';document.querySelectorAll('.platter').forEach(p=>p.style.animationDuration='2s');setTimeout(()=>{st.textContent='Transición completada · 94% match';document.querySelectorAll('.platter').forEach(p=>p.style.animationDuration='8s')},1800)};
document.querySelector('#crossfade').oninput=e=>document.querySelector('.deck').style.filter=`brightness(${.8+e.target.value/500})`;
async function publicRequest(code){try{const venue=await api(`/public/venues/${encodeURIComponent(code)}`);content.innerHTML=`<section class="auth"><h2>Pide una canción</h2><p>Estás en <b>${venue.name}</b> · ${venue.ambience}</p><form id="requestForm"><input name="guestName" placeholder="Tu nombre" required><input name="title" placeholder="Canción" required><input name="artist" placeholder="Artista" required><input name="genre" placeholder="Género (ej. Salsa)" required><input name="bpm" type="number" min="1" max="300" placeholder="BPM (opcional)"><input name="musicalKey" placeholder="Tonalidad (opcional, ej. Am)"><p class="error" id="requestError"></p><button>Enviar petición</button></form></section>`;dialog.showModal();document.querySelector('#requestForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(!d.bpm)delete d.bpm;else d.bpm=Number(d.bpm);if(!d.musicalKey)delete d.musicalKey;try{await api(`/public/venues/${encodeURIComponent(code)}/requests`,{method:'POST',body:JSON.stringify(d)});content.innerHTML='<section class="auth"><h2>Petición recibida</h2><p>Smart DJ la evaluará para mantener el ambiente perfecto.</p><button id="done">Cerrar</button></section>';document.querySelector('#done').onclick=()=>dialog.close()}catch(err){document.querySelector('#requestError').textContent=err.message}}}catch{alert('No encontramos este establecimiento. Revisa el código compartido.')}}
const publicCode=new URLSearchParams(location.search).get('venue');if(publicCode) publicRequest(publicCode);
