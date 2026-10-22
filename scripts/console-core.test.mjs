// Pruebas de console-core.js (lógica de la consola de DJ) en un contexto aislado, sin navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {
  window: { crypto: { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) } },
  Math,
  Number,
  Array,
  Float32Array,
  Uint8Array,
  String,
  Date,
};
vm.runInNewContext(readFileSync(new URL('../console-core.js', import.meta.url), 'utf8'), context);
const core = context.window.SmartDJConsole;
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('el crossfader mantiene la potencia constante', () => {
  assert.deepEqual({ ...core.equalPowerGains(0) }, { a: 1, b: 0 });
  const mid = core.equalPowerGains(0.5);
  assert.ok(close(mid.a, Math.SQRT1_2) && close(mid.b, Math.SQRT1_2));
  for (const x of [0, 0.2, 0.7, 1]) {
    const g = core.equalPowerGains(x);
    assert.ok(close(g.a ** 2 + g.b ** 2, 1));
  }
  assert.equal(core.equalPowerGains(5).b, 1);
  assert.equal(core.equalPowerGains('x').a, 1);
});

test('las curvas de la rampa empiezan y terminan donde deben', () => {
  const fadeIn = core.fadeCurve('in', 10);
  const fadeOut = core.fadeCurve('out', 10);
  assert.equal(fadeIn.length, 10);
  assert.ok(close(fadeIn[0], 0) && close(fadeIn[9], 1));
  assert.ok(close(fadeOut[0], 1) && close(fadeOut[9], 0));
});

test('formatea el tiempo como m:ss', () => {
  assert.equal(core.formatTime(0), '0:00');
  assert.equal(core.formatTime(65.9), '1:05');
  assert.equal(core.formatTime(-3), '0:00');
  assert.equal(core.formatTime(undefined), '0:00');
});

test('usa el punto de transición del motor o calcula uno antes del final', () => {
  assert.deepEqual({ ...core.transitionPlan({ transitionAtSeconds: 190, crossfadeSeconds: 9 }, 200) }, { at: 190, fade: 9 });
  assert.deepEqual({ ...core.transitionPlan({ track: { durationSeconds: 200 } }, 0, 8) }, { at: 191, fade: 8 });
  assert.deepEqual({ ...core.transitionPlan({ transitionAtSeconds: 500, crossfadeSeconds: 8 }, 120) }, { at: 111, fade: 8 });
  assert.deepEqual({ ...core.transitionPlan({ crossfadeSeconds: 12 }, 30) }, { at: 19, fade: 10 });
  assert.equal(core.shouldTransition(189, { at: 190 }), false);
  assert.equal(core.shouldTransition(190, { at: 190 }), true);
  assert.equal(core.shouldTransition(10, { at: 190 }, true), true);
  assert.equal(core.shouldTransition(10, { at: 0 }), false);
});

test('reduce la forma de onda a barras y usa barras planas sin datos', () => {
  const bars = core.waveformBars([0, 0.5, 1, 0.2], 8);
  assert.equal(bars.length, 8);
  assert.ok(bars.every((v) => v >= 0.05 && v <= 1));
  assert.deepEqual([...core.waveformBars(null, 3)], [0.3, 0.3, 0.3]);
});

test('mueve pistas en la cola sin salirse de los bordes', () => {
  assert.deepEqual([...core.moveItem(['a', 'b', 'c'], 1, -1)], ['b', 'a', 'c']);
  assert.deepEqual([...core.moveItem(['a', 'b', 'c'], 2, 1)], ['a', 'b', 'c']);
  assert.deepEqual([...core.moveTo(['a', 'b', 'c', 'd'], 0, 2)], ['b', 'c', 'a', 'd']);
  assert.deepEqual([...core.moveTo(['a', 'b'], 0, 9)], ['a', 'b']);
});

test('acota el EQ y calcula el volumen sin Web Audio', () => {
  assert.equal(core.eqGain(10), 6);
  assert.equal(core.eqGain(-50), -24);
  assert.equal(core.eqGain(3, true), -40);
  assert.equal(core.elementVolume(100, 100, 1), 1);
  assert.equal(core.elementVolume(50, 50, 1), 0.25);
  assert.equal(core.elementVolume(100, 100, 2), 1);
  assert.equal(core.elementVolume('x', 100, 1), 0);
});

test('genera un id de consola válido para el backend', () => {
  assert.match(core.newConsoleId(), /^[A-Za-z0-9-]{8,64}$/);
});
