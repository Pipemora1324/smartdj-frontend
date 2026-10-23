// Pruebas del identificador anónimo del navegador y de liveUrl() de app.js (sin navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const apiUrl = source.match(/function apiUrl\(path\) \{[\s\S]*?\n\}/)[0];
const start = source.indexOf('const CLIENT_ID_KEY');
const end = source.indexOf('// Cliente fetch robusto');
assert.ok(start > 0 && end > start, 'el identificador y liveUrl() deben existir en app.js');
const block = source.slice(start, end);

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};
const load = (localStorage) =>
  vm.runInNewContext(`${apiUrl}; ${block}; ({ clientId, liveUrl })`, {
    API_BASE: 'https://api.test',
    URL,
    localStorage,
    window: { crypto: { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' } },
  });

test('crea un identificador una vez y lo reutiliza', () => {
  const storage = memoryStorage();
  assert.equal(load(storage).clientId, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(storage.data.get('smartdj-client-id'), '123e4567-e89b-42d3-a456-426614174000');
  storage.data.set('smartdj-client-id', 'guardado-1234');
  assert.equal(load(storage).clientId, 'guardado-1234');
});

test('reemplaza un identificador inválido y funciona sin almacenamiento', () => {
  assert.equal(load(memoryStorage({ 'smartdj-client-id': '<script>' })).clientId, '123e4567-e89b-42d3-a456-426614174000');
  const blocked = {
    getItem: () => {
      throw new Error('bloqueado');
    },
  };
  assert.match(load(blocked).clientId, /^[A-Za-z0-9-]{8,64}$/);
});

test('liveUrl agrega el cliente y los parámetros dentro de API_BASE/api/', () => {
  const { liveUrl } = load(memoryStorage({ 'smartdj-client-id': 'cliente-1234' }));
  assert.equal(liveUrl('/public/venues/abc/events'), 'https://api.test/api/public/venues/abc/events?client=cliente-1234');
  assert.equal(
    liveUrl('/public/venues/abc/events', { view: 'console' }),
    'https://api.test/api/public/venues/abc/events?view=console&client=cliente-1234',
  );
  assert.throws(() => liveUrl('/../x'), /Ruta de API inválida/);
});
