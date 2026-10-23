// Pruebas de config.js: qué URL del API usa el sitio según el hosting, el <meta> y el host (sin navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const file = fileURLToPath(new URL('../config.js', import.meta.url));
const source = readFileSync(file, 'utf8');

const load = ({ host = 'smart-dj-platform-frontend.vercel.app', meta = null, injected } = {}) => {
  const window = { location: { hostname: host }, ...(injected ? { SMARTDJ_API_URL: injected } : {}) };
  const document = { querySelector: () => (meta ? { getAttribute: () => meta } : null) };
  vm.runInNewContext(source, { window, document }, { filename: file });
  return window;
};

test('en producción usa el backend de Render', () => {
  assert.equal(load().SMARTDJ_API_URL, 'https://smart-dj-platform.onrender.com');
});

test('en local y en redes privadas usa el backend local', () => {
  for (const host of ['localhost', '127.0.0.1', '', '192.168.1.20', '10.0.0.5', '172.16.0.2', '172.31.255.1']) {
    assert.equal(load({ host }).SMARTDJ_API_URL, 'http://localhost:3000', host);
  }
});

test('una IP pública que empieza por 172 no cuenta como local', () => {
  for (const host of ['172.15.0.1', '172.32.0.1', '172.217.3.110']) {
    assert.equal(load({ host }).SMARTDJ_API_URL, 'https://smart-dj-platform.onrender.com', host);
  }
});

test('la URL inyectada por el hosting gana al <meta>, y el <meta> al host', () => {
  assert.equal(load({ meta: 'https://api.meta.test', injected: 'https://api.hosting.test' }).SMARTDJ_API_URL, 'https://api.hosting.test');
  assert.equal(load({ meta: 'https://api.meta.test/' }).SMARTDJ_API_URL, 'https://api.meta.test');
});

test('quita las barras finales y deja valores públicos de Supabase', () => {
  const window = load({ injected: 'http://localhost:3300///' });
  assert.equal(window.SMARTDJ_API_URL, 'http://localhost:3300');
  assert.match(window.SMARTDJ_SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(window.SMARTDJ_SUPABASE_ANON_KEY, /^sb_publishable_/, 'nunca una clave secreta');
});
