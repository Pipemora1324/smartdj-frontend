// Prueba de apiUrl() de app.js (sin navegador): extrae la función y la ejecuta en un contexto aislado.
// Uso: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const fn = source.match(/function apiUrl\(path\) \{[\s\S]*?\n\}/);
assert.ok(fn, 'apiUrl() debe existir en app.js');
const apiUrlFor = (base) => vm.runInNewContext(`${fn[0]}; apiUrl`, { API_BASE: base, URL });

test('arma URLs dentro de API_BASE/api/', () => {
  const apiUrl = apiUrlFor('https://smart-dj-platform.onrender.com');
  assert.equal(apiUrl('/public/venues/abc'), 'https://smart-dj-platform.onrender.com/api/public/venues/abc');
  assert.equal(
    apiUrl(`/public/venues/${encodeURIComponent('a/../b')}/search?q=x`),
    'https://smart-dj-platform.onrender.com/api/public/venues/a%2F..%2Fb/search?q=x',
  );
});

test('rechaza rutas que intentan salir del backend', () => {
  const apiUrl = apiUrlFor('https://smart-dj-platform.onrender.com');
  for (const path of ['@evil.example/x', '/../../otra', '/%2e%2e/%2e%2e/otra', 'public/venues', 'https://evil.example/']) {
    assert.throws(() => apiUrl(path), /Ruta de API inválida|Invalid URL/, path);
  }
});

test('una doble barra queda dentro del mismo origen', () => {
  const url = new URL(apiUrlFor('https://smart-dj-platform.onrender.com')('//evil.example/x'));
  assert.equal(url.origin, 'https://smart-dj-platform.onrender.com');
  assert.ok(url.pathname.startsWith('/api/'));
});

test('funciona con el backend local', () => {
  assert.equal(apiUrlFor('http://localhost:3000')('/auth/me'), 'http://localhost:3000/api/auth/me');
});
