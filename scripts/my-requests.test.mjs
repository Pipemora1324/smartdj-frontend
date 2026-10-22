// Pruebas de las peticiones propias del cliente (app.js): ids en localStorage, como mucho 10 y sin fallar sin almacenamiento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = source.indexOf('const MY_REQUESTS_MAX');
const end = source.indexOf('function nowPlayingCard');
assert.ok(start > 0 && end > start, 'las funciones de peticiones propias deben existir en app.js');
const load = (localStorage) => vm.runInNewContext(`${source.slice(start, end)}; ({ loadMyRequests, rememberRequest })`, { localStorage, JSON, Array });

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};

test('guarda las peticiones por local, la más nueva primero y sin repetir', () => {
  const storage = memoryStorage();
  const { loadMyRequests, rememberRequest } = load(storage);
  rememberRequest('abc', 'r1');
  rememberRequest('abc', 'r2');
  rememberRequest('abc', 'r1');
  rememberRequest('otro', 'x');
  assert.deepEqual([...loadMyRequests('abc')], ['r1', 'r2']);
  assert.deepEqual([...loadMyRequests('otro')], ['x']);
});

test('conserva como mucho 10 peticiones', () => {
  const { loadMyRequests, rememberRequest } = load(memoryStorage());
  for (let i = 0; i < 15; i += 1) rememberRequest('abc', `r${i}`);
  const ids = loadMyRequests('abc');
  assert.equal(ids.length, 10);
  assert.equal(ids[0], 'r14');
});

test('sin almacenamiento o con datos dañados no falla', () => {
  const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  const { loadMyRequests, rememberRequest } = load(broken);
  assert.doesNotThrow(() => rememberRequest('abc', 'r1'));
  assert.deepEqual([...loadMyRequests('abc')], []);
  const storage = memoryStorage();
  storage.setItem('smartdj-requests-abc', '{no es json');
  assert.deepEqual([...load(storage).loadMyRequests('abc')], []);
});
