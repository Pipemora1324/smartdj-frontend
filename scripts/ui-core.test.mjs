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
const blockedStorage = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
};

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

test('la fortaleza de la contraseña exige las reglas mínimas', () => {
  const none = ui.passwordStrength('');
  assert.deepEqual([none.score, none.label, none.meetsMinimum], [0, '', false]);
  assert.equal(ui.passwordStrength('abc').label, 'Débil');
  assert.equal(ui.passwordStrength('abcdefghij').meetsMinimum, false);
  assert.equal(ui.passwordStrength('abcdefg1').label, 'Aceptable');
  assert.equal(ui.passwordStrength('abcdefghijk1').label, 'Buena');
  assert.equal(ui.passwordStrength('Abcdefghijk1!').label, 'Excelente');
  assert.equal(ui.passwordStrength('Mañana2026').meetsMinimum, true);
});

test('las reglas de la contraseña se evalúan en vivo', () => {
  const byId = (pw) => Object.fromEntries([...ui.passwordChecks(pw)].map((c) => [c.id, c.ok]));
  assert.deepEqual(byId('abc'), { length: false, letter: true, number: false, case: false, symbol: false });
  assert.deepEqual(byId('Abcdefg1$'), { length: true, letter: true, number: true, case: true, symbol: true });
  assert.equal([...ui.passwordChecks('')].filter((c) => c.required).length, 3);
});

test('mostrar y ocultar la contraseña cambia el tipo y el texto accesible', () => {
  assert.deepEqual({ ...ui.revealState(false) }, { type: 'password', pressed: 'false', label: 'Mostrar contraseña' });
  assert.deepEqual({ ...ui.revealState(true) }, { type: 'text', pressed: 'true', label: 'Ocultar contraseña' });
});

test('la confirmación de la contraseña tiene que coincidir', () => {
  assert.equal(ui.confirmError('Secreta1', 'Secreta1'), null);
  assert.equal(ui.confirmError('Secreta1', 'Secreta2'), 'Las contraseñas no coinciden.');
  assert.equal(ui.confirmError('Secreta1', ''), 'Repite la contraseña.');
});

test('las casillas del código reparten lo que se escribe o se pega', () => {
  const empty = ['', '', '', '', '', ''];
  const typed = ui.distributeCode(empty, 0, '4');
  assert.deepEqual([...typed.digits], ['4', '', '', '', '', '']);
  assert.equal(typed.focusIndex, 1);
  const pasted = ui.distributeCode(empty, 0, ' 123-456 ');
  assert.deepEqual([...pasted.digits], ['1', '2', '3', '4', '5', '6']);
  assert.equal(pasted.complete, true);
  assert.equal(pasted.focusIndex, 5);
  const middle = ui.distributeCode(['1', '2', '', '', '', ''], 2, '98765');
  assert.deepEqual([...middle.digits], ['1', '2', '9', '8', '7', '6']);
  assert.equal(ui.distributeCode(empty, 3, 'abc').focusIndex, 3);
  assert.equal(ui.onlyDigits('12a3'), '123');
});
