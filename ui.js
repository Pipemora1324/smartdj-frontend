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

document.querySelector('header nav')?.prepend(themeToggleButton());
