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
function authForm(mode='login'){const register=mode==='register';content.innerHTML=`<section class="auth"><h2>${register?'Crea tu venue':'Bienvenido de nuevo'}</h2><p>${register?'Empieza a dirigir tu ambiente musical.':'Ingresa a tu consola Smart DJ.'}</p><form id="authForm" novalidate>${register?'<input name="name" placeholder="Tu nombre" autocomplete="name"><p class="field-error" data-error-for="name"></p>':''}<input name="email" type="email" placeholder="Correo electrónico" autocomplete="email"><p class="field-error" data-error-for="email"></p><input name="password" type="password" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="${register?'new-password':'current-password'}"><p class="field-error" data-error-for="password"></p><p class="error" id="formError"></p><button type="submit">${register?'Crear cuenta':'Ingresar'}</button></form>${register?'':'<button type="button" class="switch" id="forgotLink">¿Olvidaste tu contraseña?</button>'}<button type="button" class="switch" id="switchAuth">${register?'Ya tengo cuenta':'Crear una cuenta'}</button></section>`;document.querySelector('#switchAuth').onclick=()=>authForm(register?'login':'register');if(!register)document.querySelector('#forgotLink').onclick=()=>forgotForm();document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));showFormError('');let firstError=null;if(register){const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);if(nameErr)firstError=nameErr;}const emailErr=validateEmail(data.email);setError(document.querySelector('[data-error-for="email"]'),emailErr);if(emailErr&&!firstError)firstError=emailErr;const passErr=validatePassword(data.password,register);setError(document.querySelector('[data-error-for="password"]'),passErr);if(passErr&&!firstError)firstError=passErr;if(firstError)return showFormError(firstError);const payload={email:data.email.trim(),password:data.password};if(register)payload.name=data.name.trim();try{const result=await api(`/auth/${register?'register':'login'}`,{method:'POST',body:JSON.stringify(payload)});if(result?.accessToken)setToken(result.accessToken);if(dialog.open)dialog.close();await showDashboard(result.user);}catch(err){showFormError(err.message)}}}

// ---------- Olvidé mi contraseña ----------
function forgotForm(){content.innerHTML=`<section class="auth"><h2>Recuperar contraseña</h2><p>Te enviaremos un enlace para crear una nueva.</p><form id="forgotForm" novalidate><input name="email" type="email" placeholder="Correo electrónico" autocomplete="email"><p class="field-error" data-error-for="email"></p><p class="error" id="formError"></p><button type="submit">Enviar enlace</button></form><button type="button" class="switch" id="backToLogin">Volver a ingresar</button></section>`;document.querySelector('#backToLogin').onclick=()=>authForm('login');document.querySelector('#forgotForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));showFormError('');const emailErr=validateEmail(data.email);setError(document.querySelector('[data-error-for="email"]'),emailErr);if(emailErr)return showFormError(emailErr);try{const result=await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email:data.email.trim()})});content.innerHTML=`<section class="auth"><h2>Revisa tu correo</h2><p>${result?.message||'Si el correo existe, te enviamos un enlace para restablecer tu contraseña.'}</p>${result?.resetToken?`<p><small>Token de prueba: <b>${result.resetToken}</b></small></p>`:''}<button type="button" class="switch" id="goReset">Ya tengo el token</button><button type="button" class="switch" id="backToLogin2">Volver a ingresar</button></section>`;document.querySelector('#goReset').onclick=()=>resetForm();document.querySelector('#backToLogin2').onclick=()=>authForm('login');}catch(err){showFormError(err.message)}}}

// ---------- Nueva contraseña con token ----------
function resetForm(prefillToken=''){content.innerHTML=`<section class="auth"><h2>Nueva contraseña</h2><p>Pega el token que recibiste y elige una contraseña segura.</p><form id="resetForm" novalidate><input name="token" placeholder="Token de recuperación" value="${prefillToken}"><p class="field-error" data-error-for="token"></p><input name="password" type="password" placeholder="Nueva contraseña (mínimo 8 caracteres)" autocomplete="new-password"><p class="field-error" data-error-for="password"></p><p class="error" id="formError"></p><button type="submit">Guardar contraseña</button></form><button type="button" class="switch" id="backToLogin3">Volver a ingresar</button></section>`;document.querySelector('#backToLogin3').onclick=()=>authForm('login');document.querySelector('#resetForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));showFormError('');let firstError=null;if(!data.token||!data.token.trim()){setError(document.querySelector('[data-error-for="token"]'),'Pega el token de recuperación.');firstError='Pega el token de recuperación.';}else{setError(document.querySelector('[data-error-for="token"]'),null);}const passErr=validatePassword(data.password);setError(document.querySelector('[data-error-for="password"]'),passErr);if(passErr&&!firstError)firstError=passErr;if(firstError)return showFormError(firstError);try{await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token:data.token.trim(),password:data.password})});content.innerHTML=`<section class="auth"><h2>¡Listo!</h2><p>Tu contraseña se actualizó. Ya puedes ingresar.</p><button type="button" class="switch" id="goLogin">Ingresar</button></section>`;document.querySelector('#goLogin').onclick=()=>authForm('login');}catch(err){showFormError(err.message)}}}
async function showDashboard(user){let venues=[];try{venues=await api('/venues')}catch(err){if(err.status===401){clearToken();dialog.showModal();return authForm('login');}}const existing=venues.length?`<p>Establecimientos activos:</p>${venues.map(v=>`<p><b>${v.name}</b><br><small>Petición pública: ${location.origin}/?venue=${v.public_code}</small></p>`).join('')}<hr>`:'';content.innerHTML=`<section class="auth"><h2>Hola, ${user.name}</h2>${existing}<p>Registra un establecimiento para activar el DJ inteligente.</p><form id="venueForm" novalidate><input name="name" placeholder="Nombre del establecimiento"><p class="field-error" data-error-for="name"></p><select name="kind"><option value="restaurant">Restaurante</option><option value="cafe">Café</option><option value="salsa_bar">Bar de Salsa</option><option value="nightclub">Discoteca</option><option value="lounge">Lounge</option><option value="other">Otro</option></select><textarea name="ambience" placeholder="Describe el ambiente que deseas"></textarea><p class="field-error" data-error-for="ambience"></p><p class="error" id="venueError"></p><button type="submit">Crear establecimiento</button></form><button type="button" class="switch" id="logoutBtn">Cerrar sesión</button></section>`;document.querySelector('#logoutBtn').onclick=async()=>{try{await api('/auth/logout',{method:'POST'})}catch{}clearToken();authForm('login');};document.querySelector('#venueForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));setError(document.querySelector('#venueError'),'');const nameErr=validateName(data.name);setError(document.querySelector('[data-error-for="name"]'),nameErr);const ambienceErr=(data.ambience||'').trim().length<2?'Describe el ambiente (mínimo 2 caracteres).':null;setError(document.querySelector('[data-error-for="ambience"]'),ambienceErr);if(nameErr||ambienceErr)return setError(document.querySelector('#venueError'),nameErr||ambienceErr);try{await api('/venues',{method:'POST',body:JSON.stringify({name:data.name.trim(),kind:data.kind,ambience:data.ambience.trim()})});await showDashboard(user)}catch(err){setError(document.querySelector('#venueError'),err.message)}}}
document.querySelector('#openLogin').onclick=()=>{authForm();dialog.showModal()};document.querySelector('#openRegister').onclick=document.querySelector('#heroStart').onclick=()=>{authForm('register');dialog.showModal()};document.querySelector('#closeDialog').onclick=()=>dialog.close();
document.querySelector('#mixButton').onclick=()=>{const st=document.querySelector('#mixStatus');st.textContent='Puente armónico generado · mezclando…';document.querySelectorAll('.platter').forEach(p=>p.style.animationDuration='2s');setTimeout(()=>{st.textContent='Transición completada · 94% match';document.querySelectorAll('.platter').forEach(p=>p.style.animationDuration='8s')},1800)};
document.querySelector('#crossfade').oninput=e=>document.querySelector('.deck').style.filter=`brightness(${.8+e.target.value/500})`;
async function publicRequest(code){try{const venue=await api(`/public/venues/${encodeURIComponent(code)}`);content.innerHTML=`<section class="auth"><h2>Pide una canción</h2><p>Estás en <b>${venue.name}</b> · ${venue.ambience}</p><form id="requestForm"><input name="guestName" placeholder="Tu nombre" required><input name="title" placeholder="Canción" required><input name="artist" placeholder="Artista" required><input name="genre" placeholder="Género (ej. Salsa)" required><input name="bpm" type="number" min="1" max="300" placeholder="BPM (opcional)"><input name="musicalKey" placeholder="Tonalidad (opcional, ej. Am)"><p class="error" id="requestError"></p><button>Enviar petición</button></form></section>`;dialog.showModal();document.querySelector('#requestForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(!d.bpm)delete d.bpm;else d.bpm=Number(d.bpm);if(!d.musicalKey)delete d.musicalKey;try{await api(`/public/venues/${encodeURIComponent(code)}/requests`,{method:'POST',body:JSON.stringify(d)});content.innerHTML='<section class="auth"><h2>Petición recibida</h2><p>Smart DJ la evaluará para mantener el ambiente perfecto.</p><button id="done">Cerrar</button></section>';document.querySelector('#done').onclick=()=>dialog.close()}catch(err){document.querySelector('#requestError').textContent=err.message}}}catch{alert('No encontramos este establecimiento. Revisa el código compartido.')}}
const resetToken=new URLSearchParams(location.search).get('reset');const publicCode=new URLSearchParams(location.search).get('venue');if(resetToken){resetForm(resetToken);dialog.showModal();}else if(publicCode) publicRequest(publicCode);
