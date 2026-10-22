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
