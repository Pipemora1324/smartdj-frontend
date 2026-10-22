// Prueba de humo en un navegador sin cabeza: carga cada vista (portada, menú móvil, registro, código, panel, consola y
// página pública) en tema claro y oscuro, a 360 y 1280 px, y falla si hay errores en la consola, scroll horizontal
// o si falta el elemento principal de la vista.
// Es autocontenida: sirve el sitio desde este repo, responde el API con datos de prueba y no usa Supabase
// (ni el real ni ningún otro) ni CDNs.
// Necesita Playwright o patchright (no son dependencias del proyecto):
//   npx -y playwright@1.49.1 install chromium
//   PLAYWRIGHT_MODULE=<ruta a node_modules/playwright> node scripts/smoke.e2e.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const API = 'http://api.smoke.test';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// ---------- Navegador ----------
async function loadBrowser() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'patchright'].filter(Boolean);
  for (const name of candidates) {
    try {
      const mod = createRequire(join(root, 'package.json'))(name);
      return { chromium: mod.chromium, patchright: /patchright/.test(name) };
    } catch { /* se prueba el siguiente */ }
  }
  console.error('No se encontró Playwright. Instálalo con "npx -y playwright@1.49.1 install chromium" y define PLAYWRIGHT_MODULE.');
  process.exit(2);
}

// ---------- Sitio: los scripts de CDN se reemplazan por dobles locales (sin red y sin Supabase) ----------
const SUPABASE_DOUBLE = `window.supabase = { createClient() { return { auth: {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }), refreshSession: async () => ({ data: { session: null }, error: null }),
} }; } };`;
const QR_DOUBLE = 'window.qrcode = () => ({ addData() {}, make() {}, getModuleCount: () => 21, isDark: (r, c) => (r + c) % 3 === 0 });';
function serveSite() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path === '/') path = '/index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      let body = await readFile(file, 'utf8');
      if (path === '/index.html') {
        body = body
          .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/[^"]+"[^>]*><\/script>/, `<script>${SUPABASE_DOUBLE}</script>`)
          .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/[^"]+"[^>]*><\/script>/, `<script>${QR_DOUBLE}</script>`);
      }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------- API de prueba ----------
const user = { id: 'u1', name: 'Ana Prueba', email: 'ana@prueba.co' };
const venue = { id: '11111111-1111-4111-8111-111111111111', name: 'Café Prueba', kind: 'cafe', ambience: 'Jazz y lounge', public_code: 'abc123', exclude_non_commercial: false };
const track = (n, kind = 'full') => ({
  id: `t${n}`, provider: kind === 'full' ? 'jamendo' : 'itunes', externalId: String(n), title: `Tema ${n}`, artist: `Artista ${n}`, genre: 'lounge',
  durationSeconds: 180, artworkUrl: null, energy: 3, bpm: 0, musicalKey: '', kind, kindLabel: kind === 'full' ? 'Completa' : 'Preview 30 s', waveform: [0.2, 0.6, 0.4],
  credit: { artist: `Artista ${n}`, title: `Tema ${n}`, url: 'https://www.jamendo.com/track/1', source: 'Jamendo', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', nonCommercial: false },
});
const snapshot = { status: 'stopped', mode: 'autodj', volume: 80, crossfadeSeconds: 8, positionSeconds: 0, current: null, consoleId: null,
  queue: [1, 2].map((n) => ({ id: `q${n}`, position: n, source: 'autodj', requestId: null, score: 80, reason: 'Encaja con el local.', transitionAtSeconds: 170, crossfadeSeconds: 8, track: track(n) })) };
const request = { id: 'r1', title: 'Tema 9', artist: 'Artista 9', genre: 'Salsa', artworkUrl: null, kind: 'preview', kindLabel: 'Preview 30 s', state: 'bridging', stateLabel: 'El DJ la revisará', fits: false, reason: null, createdAt: new Date().toISOString(), guestName: 'Leo' };
function apiResponse(url) {
  const { pathname } = new URL(url);
  const routes = [
    [/^\/api\/auth\/me$/, user],
    [/^\/api\/venues$/, [venue]],
    [/^\/api\/venues\/[^/]+\/player\/requests$/, { requests: [request] }],
    [/^\/api\/venues\/[^/]+\/player$/, snapshot],
    [/^\/api\/venues\/[^/]+\/tracks\/search$/, { tracks: [track(3)], source: 'cache' }],
    [/^\/api\/public\/venues\/abc123$/, { id: venue.id, name: venue.name, kind: venue.kind, ambience: venue.ambience, public_code: venue.public_code }],
    [/^\/api\/public\/venues\/abc123\/now$/, { station: { status: 'playing', mode: 'autodj' }, nowPlaying: { ...track(1), previewUrl: null, source: 'autodj' }, queue: [track(2), track(4, 'preview')] }],
    [/^\/api\/public\/venues\/abc123\/search$/, [{ ...track(5), source: 'jamendo' }, { ...track(6, 'preview'), source: 'itunes', trackId: '6' }]],
    [/^\/api\/public\/venues\/abc123\/requests$/, { requests: [] }],
  ];
  const match = routes.find(([pattern]) => pattern.test(pathname));
  return match ? { status: 200, body: JSON.stringify(match[1]) } : { status: 404, body: JSON.stringify({ error: 'No existe en la prueba de humo' }) };
}

// ---------- Vistas ----------
const VIEWS = [
  ['portada', async () => {}, '.hero h1'],
  ['menú móvil', async (page) => { if (await page.locator('.burger').isVisible()) await page.locator('.burger').click(); }, '.hero h1'],
  ['registro', async (page, ev) => ev(() => openAuth('register')), 'dialog[open] #authForm'],
  ['código', async (page, ev) => ev(() => { openAuth('login'); verifyStep('ana@prueba.co'); }), 'dialog[open] .otp'],
  ['panel', async (page, ev) => ev(async () => { setSessionUser(await api('/auth/me')); await showDashboard(currentUser); }), '.panel .venue-item'],
  ['consola', async (page, ev) => {
    await ev(async () => { const venues = await api('/venues'); showConsole(venues[0], {}); });
    // Los controles quedan bajo la capa "Iniciar emisora" (autoplay); las pestañas sí se pueden usar.
    await page.locator('#tab-requests').click();
  }, '.dj-console .request-item'],
  ['página pública', async (page) => {
    await page.goto(`${page.baseUrl}/?venue=abc123`);
    await page.locator('input[type=search]').fill('tema');
  }, '.results li'],
];

async function main() {
  const { chromium, patchright } = await loadBrowser();
  const server = await serveSite();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  // Si no está el navegador "headless shell", se usa el Chromium completo instalado por Playwright.
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chromium' }));
  const failures = [];
  let checked = 0;
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 860 }, colorScheme: theme });
      await context.addInitScript(({ t, api }) => {
        localStorage.setItem('smartdj-theme', t);
        window.SMARTDJ_API_URL = api;
        window.SMARTDJ_SUPABASE_URL = 'http://supabase.smoke.invalid';
      }, { t: theme, api: API });
      await context.route(`${API}/**`, (route) => {
        const { status, body } = apiResponse(route.request().url());
        if (/\/events$/.test(route.request().url())) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: ready\ndata: {}\n\n' });
        return route.fulfill({ status, contentType: 'application/json', body });
      });
      await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      for (const [name, open, selector] of VIEWS) {
        const page = await context.newPage();
        page.baseUrl = baseUrl;
        const ev = (fn, arg) => (patchright ? page.evaluate(fn, arg, undefined, false) : page.evaluate(fn, arg));
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        const label = `${name} · ${theme} · ${width}px`;
        try {
          await page.goto(baseUrl);
          await page.locator('.theme-toggle').first().waitFor({ timeout: 10000 });
          await open(page, ev);
          await page.locator(selector).first().waitFor({ timeout: 10000 });
          await page.waitForTimeout(400);
          const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, theme: document.documentElement.getAttribute('data-theme') }));
          if (state.overflow) errors.push('scroll horizontal');
          if (state.theme !== theme) errors.push(`tema ${state.theme} en lugar de ${theme}`);
        } catch (err) {
          errors.push(err.message.split('\n')[0]);
        }
        checked += 1;
        if (errors.length) failures.push(`${label}: ${errors.join(' | ')}`);
        console.log(`${errors.length ? '✖' : '✔'} ${label}`);
        await page.close();
      }
      await context.close();
    }
  }
  await browser.close();
  server.close();
  console.log(`\n${checked - failures.length}/${checked} vistas sin errores.`);
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
}

await main();
