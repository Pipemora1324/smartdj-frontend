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

test('las iniciales del avatar salen del nombre o del correo', () => {
  assert.equal(ui.initials('Juan Felipe Mora', 'x@y.co'), 'JM');
  assert.equal(ui.initials('ana', ''), 'AN');
  assert.equal(ui.initials('  Óscar  Ruiz ', ''), 'ÓR');
  assert.equal(ui.initials('', 'pipe.mora@gmail.com'), 'PI');
  assert.equal(ui.initials('', ''), '?');
});

test('el header cambia según la sesión', () => {
  const guest = ui.headerModel(null);
  assert.equal(guest.signedIn, false);
  assert.deepEqual([...guest.actions.map((a) => a.label)], ['Ingresar', 'Crear establecimiento']);
  assert.deepEqual([...guest.links.map((l) => l.href)], ['#como-funciona', '#roles']);
  const owner = ui.headerModel({ name: 'Ana Dueña', email: 'ana@test.co' });
  assert.equal(owner.signedIn, true);
  assert.equal(owner.initials, 'AD');
  assert.equal(owner.actions, undefined);
  assert.deepEqual([...owner.menu.map((m) => m.label)], ['Mis locales', 'Consola de DJ', 'Cambiar tema', 'Cerrar sesión']);
  assert.equal(ui.headerModel({ email: 'x@y.co' }).displayName, 'x@y.co');
});

test('el menú de la cuenta se recorre con flechas, Inicio y Fin', () => {
  assert.equal(ui.menuNextIndex('ArrowDown', 3, 4), 0);
  assert.equal(ui.menuNextIndex('ArrowUp', 0, 4), 3);
  assert.equal(ui.menuNextIndex('Home', 2, 4), 0);
  assert.equal(ui.menuNextIndex('End', 0, 4), 3);
  assert.equal(ui.menuNextIndex('Enter', 1, 4), null);
  assert.equal(ui.menuNextIndex('ArrowDown', 0, 0), null);
});

test('el menú móvil atrapa el foco', () => {
  assert.equal(ui.trapFocusIndex(4, 5, false), 0);
  assert.equal(ui.trapFocusIndex(0, 5, true), 4);
  assert.equal(ui.trapFocusIndex(2, 5, false), null);
  assert.equal(ui.trapFocusIndex(-1, 5, false), 0);
  assert.equal(ui.trapFocusIndex(-1, 5, true), 4);
  assert.equal(ui.trapFocusIndex(0, 0, false), null);
});
