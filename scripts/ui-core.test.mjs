// Pruebas de ui-core.js (lógica de la interfaz) en un contexto aislado, sin navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../ui-core.js', import.meta.url), 'utf8'), context);
const ui = context.window.SmartDJUI;

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
};
const blockedStorage = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };

test('el tema sigue al sistema hasta que el usuario elige', () => {
  assert.equal(ui.resolveTheme(null, true), 'dark');
  assert.equal(ui.resolveTheme(null, false), 'light');
  assert.equal(ui.resolveTheme('light', true), 'light');
  assert.equal(ui.resolveTheme('rosa', true), 'dark');
});

test('alterna y recuerda la elección del tema', () => {
  const storage = memoryStorage();
  assert.equal(ui.readTheme(storage), null);
  const next = ui.oppositeTheme(ui.resolveTheme(ui.readTheme(storage), false));
  assert.equal(next, 'dark');
  assert.equal(ui.saveTheme(storage, next), true);
  assert.equal(ui.readTheme(storage), 'dark');
  assert.equal(ui.oppositeTheme('dark'), 'light');
  assert.equal(ui.saveTheme(storage, 'rosa'), false);
  assert.equal(ui.readTheme(storage), 'dark');
});

test('sin almacenamiento disponible no falla y usa el tema del sistema', () => {
  assert.equal(ui.readTheme(blockedStorage), null);
  assert.equal(ui.saveTheme(blockedStorage, 'dark'), false);
  assert.equal(ui.readTheme(undefined), null);
  const storage = memoryStorage();
  storage.setItem(ui.THEME_KEY, 'cualquier-cosa');
  assert.equal(ui.readTheme(storage), null);
});

test('el botón de tema describe la acción', () => {
  assert.equal(ui.themeToggleLabel('dark'), 'Cambiar a modo claro');
  assert.equal(ui.themeToggleLabel('light'), 'Cambiar a modo oscuro');
});
