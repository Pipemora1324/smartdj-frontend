// ---------- Componentes de la interfaz ----------
// Tema claro/oscuro y, en los bloques siguientes, header con sesión, menú móvil, campos de contraseña y código.
// Usa el() de app.js y la lógica pura de ui-core.js (window.SmartDJUI). Los textos externos van con textContent.
const UI = window.SmartDJUI;
const systemDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const prefersReducedMotion = () => Boolean(reducedMotionQuery?.matches);

// localStorage puede no existir o lanzar un error (modo privado, cookies bloqueadas).
function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

// Íconos SVG construidos con createElementNS (sin innerHTML).
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgIcon(className, shapes) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  }
  return svg;
}
const sunIcon = () => svgIcon('icon icon-sun', [['circle', { cx: '12', cy: '12', r: '4.5' }], ['path', { d: 'M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8' }]]);
const moonIcon = () => svgIcon('icon icon-moon', [['path', { d: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z' }]]);

// ---------- Tema ----------
function currentTheme() {
  return UI.resolveTheme(document.documentElement.getAttribute('data-theme'), systemDarkQuery?.matches);
}
function paintThemeButton(button, theme) {
  button.setAttribute('aria-label', UI.themeToggleLabel(theme));
  button.dataset.theme = theme;
}
function syncThemeUi() {
  const theme = currentTheme();
  for (const button of document.querySelectorAll('.theme-toggle')) paintThemeButton(button, theme);
  // Color de la barra del navegador en móvil según el tema efectivo.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', theme === 'dark' ? '#0e0e0c' : '#f4f1eb');
}
function applyTheme(theme) {
  const swap = () => { document.documentElement.setAttribute('data-theme', theme); syncThemeUi(); };
  // Con View Transitions el cambio es un fundido (solo opacidad); sin soporte o con movimiento reducido, inmediato.
  if (document.startViewTransition && !prefersReducedMotion()) document.startViewTransition(swap);
  else swap();
  UI.saveTheme(safeStorage(), theme);
}
function toggleTheme() { applyTheme(UI.oppositeTheme(currentTheme())); }
function themeToggleButton(extraClass = '') {
  const button = el('button', { type: 'button', class: `theme-toggle ${extraClass}`.trim() }, sunIcon(), moonIcon());
  button.addEventListener('click', toggleTheme);
  paintThemeButton(button, currentTheme());
  return button;
}
// Si el usuario no eligió tema, la interfaz sigue los cambios del sistema.
systemDarkQuery?.addEventListener?.('change', () => { if (!UI.readTheme(safeStorage())) syncThemeUi(); });

// ---------- Header según la sesión ----------
const siteHeader = document.querySelector('.site-header');
const headerActions = document.querySelector('#headerActions');
const mainNav = document.querySelector('.main-nav');
const landing = document.querySelector('#inicio');
const menuIcon = () => svgIcon('icon icon-menu', [['path', { d: 'M4 7h16M4 12h16M4 17h16' }]]);
const closeIcon = () => svgIcon('icon icon-close', [['path', { d: 'M6 6l12 12M18 6 6 18' }]]);

// Enlaces de la landing: si se está en el panel o en la consola, primero se vuelve a la portada.
function goToSection(href) {
  if (landing?.hidden) showLanding();
  requestAnimationFrame(() => document.querySelector(href)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
}
function landingLink(link) {
  const a = el('a', { href: link.href, text: link.label, class: 'nav-link' });
  a.addEventListener('click', (e) => { e.preventDefault(); closeMobileMenu(false); goToSection(link.href); });
  return a;
}
function runHeaderAction(id) {
  const actions = {
    login: () => openAuth('login'), register: () => openAuth('register'),
    venues: () => currentUser && showDashboard(currentUser), console: () => openOwnerConsole(),
    theme: () => toggleTheme(), logout: () => signOut(),
  };
  void actions[id]?.();
}

// Menú desplegable de la cuenta (role="menu"): flechas, Inicio y Fin mueven el foco; Escape cierra y vuelve al botón.
function accountMenu(model) {
  const button = el('button', { type: 'button', class: 'avatar-button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'accountMenu', 'aria-label': `Menú de tu cuenta (${model.displayName})` },
    el('span', { class: 'avatar', 'aria-hidden': 'true', text: model.initials }));
  const items = model.menu.map((item) => el('button', { type: 'button', role: 'menuitem', tabindex: '-1', class: `menu-item menu-${item.id}`, text: item.label }));
  const menu = el('div', { id: 'accountMenu', role: 'menu', 'aria-label': 'Tu cuenta', class: 'account-items' }, ...items);
  const dropdown = el('div', { class: 'account-dropdown', hidden: '' },
    el('div', { class: 'account-head' }, el('strong', { text: model.displayName }), model.email ? el('small', { text: model.email }) : null), menu);
  const isOpen = () => !dropdown.hidden;
  function onOutside(e) { if (!dropdown.contains(e.target) && !button.contains(e.target)) close(false); }
  function close(focusButton = true) {
    if (!isOpen()) return;
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside);
    if (focusButton) button.focus();
  }
  function open(focusIndex = 0) {
    dropdown.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    items[focusIndex]?.focus();
    document.addEventListener('pointerdown', onOutside);
  }
  button.addEventListener('click', () => (isOpen() ? close() : open()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(e.key === 'ArrowUp' ? items.length - 1 : 0); }
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { close(false); return; }
    const next = UI.menuNextIndex(e.key, items.indexOf(document.activeElement), items.length);
    if (next !== null) { e.preventDefault(); items[next].focus(); }
  });
  items.forEach((item, i) => item.addEventListener('click', () => { close(model.menu[i].id === 'theme'); runHeaderAction(model.menu[i].id); }));
  return el('div', { class: 'account' }, button, dropdown);
}

// Menú móvil (diálogo modal): foco atrapado, Escape cierra y devuelve el foco al botón de menú.
const burger = el('button', { type: 'button', class: 'burger', 'aria-expanded': 'false', 'aria-controls': 'mobileMenu', 'aria-label': 'Abrir menú' }, menuIcon());
const mobileMenu = el('div', { id: 'mobileMenu', class: 'mobile-menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menú', hidden: '' });
const focusableIn = (root) => [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')].filter((n) => n.offsetParent !== null);
function onMobileKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeMobileMenu(); return; }
  if (e.key !== 'Tab') return;
  const items = focusableIn(mobileMenu);
  const target = UI.trapFocusIndex(items.indexOf(document.activeElement), items.length, e.shiftKey);
  if (target !== null) { e.preventDefault(); items[target].focus(); }
}
function openMobileMenu() {
  mobileMenu.hidden = false;
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Cerrar menú');
  document.body.classList.add('menu-open');
  requestAnimationFrame(() => mobileMenu.classList.add('open'));
  document.addEventListener('keydown', onMobileKeydown);
  focusableIn(mobileMenu)[0]?.focus();
}
function closeMobileMenu(returnFocus = true) {
  if (mobileMenu.hidden) return;
  mobileMenu.classList.remove('open');
  mobileMenu.hidden = true;
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Abrir menú');
  document.body.classList.remove('menu-open');
  document.removeEventListener('keydown', onMobileKeydown);
  if (returnFocus) burger.focus();
}
burger.addEventListener('click', () => (mobileMenu.hidden ? openMobileMenu() : closeMobileMenu()));
// Si la pantalla crece (por ejemplo al girar el teléfono), el menú móvil se cierra solo.
window.matchMedia?.('(min-width: 768px)').addEventListener?.('change', (e) => { if (e.matches) closeMobileMenu(false); });

function renderMobileMenu(model) {
  const action = (item, primary = false) => {
    const b = el('button', { type: 'button', class: primary ? 'mobile-action primary' : 'mobile-action', text: item.label });
    b.addEventListener('click', () => { closeMobileMenu(false); runHeaderAction(item.id); });
    return b;
  };
  const accountBlock = model.signedIn
    ? [el('div', { class: 'mobile-account' }, el('span', { class: 'avatar', 'aria-hidden': 'true', text: model.initials }), el('span', {}, el('strong', { text: model.displayName }), model.email ? el('small', { text: model.email }) : null)),
      ...model.menu.filter((m) => m.id !== 'theme').map((m) => action(m))]
    : model.actions.map((a, i) => action(a, i === 1));
  const closeButton = el('button', { type: 'button', class: 'mobile-close', 'aria-label': 'Cerrar menú' }, closeIcon());
  closeButton.addEventListener('click', () => closeMobileMenu());
  mobileMenu.replaceChildren(
    el('div', { class: 'mobile-menu-panel' },
      el('div', { class: 'mobile-menu-top' }, el('span', { class: 'brand', 'aria-hidden': 'true' }, 'SMART', el('span', { text: 'DJ' })), closeButton),
      el('nav', { class: 'mobile-nav', 'aria-label': 'Secciones' }, ...model.links.map(landingLink)),
      el('div', { class: 'mobile-actions' }, ...accountBlock),
      el('div', { class: 'mobile-theme' }, el('span', { text: 'Tema' }), themeToggleButton())));
}

function renderHeader(user) {
  if (!headerActions) return;
  const model = UI.headerModel(user);
  const guestActions = model.signedIn ? [] : model.actions.map((a, i) => {
    const b = el('button', { type: 'button', class: i === 0 ? 'ghost header-login' : 'header-cta', text: a.label });
    b.addEventListener('click', () => runHeaderAction(a.id));
    return b;
  });
  headerActions.replaceChildren(themeToggleButton(), ...guestActions, model.signedIn ? accountMenu(model) : '', burger);
  siteHeader?.classList.toggle('signed-in', model.signedIn);
  renderMobileMenu(model);
}
if (siteHeader) {
  siteHeader.after(mobileMenu);
  mainNav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goToSection(a.getAttribute('href')); }));
  renderHeader(null);
  window.addEventListener('smartdj:session', (e) => renderHeader(e.detail));
}

// Cristal con sombra al hacer scroll (una lectura por frame).
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => { siteHeader?.classList.toggle('scrolled', window.scrollY > 8); scrollTicking = false; });
}, { passive: true });

// Enlace activo según la sección visible de la landing.
if ('IntersectionObserver' in window && mainNav) {
  const links = new Map([...mainNav.querySelectorAll('a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = links.get(entry.target.id);
      if (!link) continue;
      link.classList.toggle('is-active', entry.isIntersecting);
      if (entry.isIntersecting) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of links.keys()) { const section = document.getElementById(id); if (section) observer.observe(section); }
}

// "Saltar al contenido": lleva el foco a la vista visible (portada o vista de la app).
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  const target = landing && !landing.hidden ? landing : document.querySelector('#app-view');
  if (!target) return;
  e.preventDefault();
  target.setAttribute('tabindex', '-1');
  target.focus();
});

// ---------- Formularios de autenticación ----------
const eyeIcon = () => svgIcon('icon icon-eye', [['path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z' }], ['circle', { cx: '12', cy: '12', r: '3' }]]);
const eyeOffIcon = () => svgIcon('icon icon-eye-off', [['path', { d: 'M3 3l18 18' }], ['path', { d: 'M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6' }], ['path', { d: 'M9.9 9.9a3 3 0 0 0 4.2 4.2' }]]);
let fieldCounter = 0;

// Campo con etiqueta visible y mensaje de error asociado (aria-describedby).
function labeledField(name, label, attrs = {}) {
  fieldCounter += 1;
  const id = `field-${name}-${fieldCounter}`;
  const error = el('p', { class: 'field-error', id: `${id}-error`, 'data-error-for': name });
  const input = el('input', { id, name, 'aria-describedby': `${id}-error`, ...attrs });
  return { input, error, field: el('div', { class: 'field' }, el('label', { for: id, text: label }), input, error) };
}

// Contraseña con botón de mostrar/ocultar (ojo): cambia el tipo del campo, aria-pressed y la etiqueta.
function passwordField(name, label, attrs = {}) {
  const { input, error, field } = labeledField(name, label, { type: 'password', ...attrs });
  const toggle = el('button', { type: 'button', class: 'reveal', 'aria-controls': input.id, 'aria-pressed': 'false', 'aria-label': 'Mostrar contraseña' }, eyeIcon(), eyeOffIcon());
  toggle.addEventListener('click', () => {
    const state = UI.revealState(input.type === 'password');
    input.type = state.type;
    toggle.setAttribute('aria-pressed', state.pressed);
    toggle.setAttribute('aria-label', state.label);
    input.focus();
  });
  const wrap = el('div', { class: 'password-wrap' });
  input.replaceWith(wrap);
  wrap.append(input, toggle);
  return { input, error, field, toggle };
}

// Indicador de fortaleza y requisitos, actualizados mientras se escribe.
function strengthMeter(input) {
  const label = el('p', { class: 'strength-label', 'aria-live': 'polite' });
  const checks = el('ul', { class: 'password-checks', 'aria-label': 'Requisitos de la contraseña' });
  const root = el('div', { class: 'strength', 'data-score': '0' },
    el('div', { class: 'strength-bar', 'aria-hidden': 'true' }, el('span'), el('span'), el('span'), el('span')), label, checks);
  const update = () => {
    const strength = UI.passwordStrength(input.value);
    root.dataset.score = String(strength.score);
    label.textContent = strength.label ? `Fortaleza: ${strength.label}` : '';
    checks.replaceChildren(...strength.checks.map((c) => el('li', { class: c.ok ? 'ok' : '' },
      el('span', { class: 'check-mark', 'aria-hidden': 'true', text: c.ok ? '✓' : '•' }),
      `${c.label}${c.required ? '' : ' (recomendado)'}`, el('span', { class: 'sr-only', text: c.ok ? ': cumplido' : ': pendiente' }))));
  };
  input.addEventListener('input', update);
  update();
  return root;
}

// Error de un campo: texto y aria-invalid.
function setFieldState(input, errorEl, message) {
  setError(errorEl, message);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}
// Valida al salir del campo y, desde entonces, mientras se escribe.
function liveValidate(input, errorEl, validate) {
  let touched = false;
  input.addEventListener('blur', () => { touched = true; setFieldState(input, errorEl, validate()); });
  input.addEventListener('input', () => { if (touched) setFieldState(input, errorEl, validate()); });
  return () => { touched = true; const message = validate(); setFieldState(input, errorEl, message); return message; };
}

// Estado de carga de un botón mientras dura la acción.
async function withLoading(button, loadingText, task) {
  const text = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-loading');
  button.textContent = loadingText;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-loading');
    button.textContent = text;
  }
}

// Código de 6 dígitos en casillas: teclado numérico en móvil, autofoco, pegado repartido y retroceso.
// El grupo se usa como un campo: .value, .disabled y .focus(). onComplete se llama al llenar las 6 casillas.
function otpInput(onComplete) {
  const boxes = Array.from({ length: UI.CODE_LENGTH }, (_, i) => el('input', {
    type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: String(i === 0 ? UI.CODE_LENGTH : 1), class: 'otp-box',
    autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': `Dígito ${i + 1} de ${UI.CODE_LENGTH}`,
  }));
  const group = el('div', { class: 'otp', role: 'group', 'aria-label': 'Código de 6 dígitos' }, ...boxes);
  const digits = () => boxes.map((b) => b.value);
  const apply = (index, text) => {
    const result = UI.distributeCode(digits(), index, text);
    result.digits.forEach((d, i) => { boxes[i].value = d; });
    boxes[result.focusIndex].focus();
    if (result.complete && UI.onlyDigits(text)) onComplete?.();
  };
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => { const text = box.value; box.value = ''; apply(i, text); });
    box.addEventListener('paste', (e) => { e.preventDefault(); apply(i, e.clipboardData?.getData('text') || ''); });
    box.addEventListener('focus', () => box.select());
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      if (e.key === 'ArrowRight' && i < boxes.length - 1) { e.preventDefault(); boxes[i + 1].focus(); }
    });
  });
  Object.defineProperty(group, 'value', { get: () => digits().join('') });
  Object.defineProperty(group, 'disabled', { get: () => boxes[0].disabled, set: (v) => boxes.forEach((b) => { b.disabled = v; }) });
  group.focus = () => (boxes.find((b) => !b.value) || boxes[0]).focus();
  return group;
}

// ---------- Estados de carga y vacíos ----------
// Esqueleto del panel mientras llegan los locales (aria-busy y texto para lectores de pantalla).
function panelSkeleton(user) {
  const bar = (cls) => el('span', { class: `skeleton ${cls}` });
  return el('div', { class: 'panel', 'aria-busy': 'true' },
    el('div', { class: 'panel-bar' }, el('h1', { text: user?.name ? `Hola, ${user.name}` : 'Tu panel' })),
    el('p', { class: 'sr-only', role: 'status', text: 'Cargando tus locales…' }),
    el('div', { class: 'panel-body', 'aria-hidden': 'true' },
      el('div', { class: 'venue-list' }, bar('sk-title'), bar('sk-card'), bar('sk-card'), bar('sk-button')),
      el('div', { class: 'panel-main' }, bar('sk-heading'), bar('sk-line'), bar('sk-line short'), bar('sk-block'))));
}
function emptyState(title, text) {
  return el('div', { class: 'empty-state' },
    el('span', { class: 'empty-icon', 'aria-hidden': 'true', text: '♫' }),
    el('strong', { text: title }),
    el('p', { text }));
}

// ---------- Listas con entrada y salida suaves ----------
// Reutiliza los elementos por clave: los nuevos entran con animación y los que salen se desvanecen antes de quitarse.
const LEAVE_MS = 260;
function animateList(list, items, keyOf, render) {
  const existing = new Map([...list.children].filter((n) => !n.classList.contains('leaving')).map((n) => [n.dataset.key, n]));
  const nodes = items.map((item) => {
    const key = String(keyOf(item));
    const node = render(item);
    node.dataset.key = key;
    if (!existing.has(key)) node.classList.add('entering');
    existing.delete(key);
    return node;
  });
  const leaving = [...existing.values()];
  if (prefersReducedMotion()) { list.replaceChildren(...nodes); return; }
  for (const node of leaving) node.classList.add('leaving');
  list.replaceChildren(...nodes, ...leaving);
  if (leaving.length) setTimeout(() => leaving.forEach((n) => n.remove()), LEAVE_MS);
}

// ---------- Landing: aparecer al hacer scroll, parallax suave y contadores ----------
function setupLandingMotion() {
  const root = document.documentElement;
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;
  root.classList.add('motion-ok');
  const targets = document.querySelectorAll('.how h2, .how .eyebrow, .steps article, .roles > div > *, .role-grid article');
  targets.forEach((node, i) => { node.classList.add('scroll-reveal'); node.style.setProperty('--reveal-delay', `${(i % 3) * 90}ms`); });
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      reveal.unobserve(entry.target);
    }
  }, { threshold: 0.15 });
  targets.forEach((node) => reveal.observe(node));

  // Contador: los números de las métricas suben desde 0 la primera vez que se ven.
  const counters = document.querySelectorAll('[data-count]');
  const countUp = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      countUp.unobserve(entry.target);
      const node = entry.target;
      const target = Number(node.dataset.count);
      const suffix = node.dataset.suffix || '';
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 900);
        node.textContent = `${Math.round(target * (1 - (1 - t) ** 3))}${suffix}`;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  });
  counters.forEach((node) => countUp.observe(node));

  // Parallax del deck de la portada: solo transform, una actualización por frame y solo si la portada se ve.
  const deck = document.querySelector('.hero .deck');
  if (!deck) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking || document.querySelector('#inicio')?.hidden) return;
    ticking = true;
    requestAnimationFrame(() => {
      deck.style.setProperty('--parallax', `${Math.min(window.scrollY, 600) * -0.08}px`);
      ticking = false;
    });
  }, { passive: true });
}
setupLandingMotion();
