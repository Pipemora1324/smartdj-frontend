// Lógica pura de la consola de DJ (sin DOM ni audio), para poder probarla con node --test.
// Se expone como window.SmartDJConsole; dj-console.js la usa para la interfaz y el Web Audio.
(function (global) {
  const DEFAULT_CROSSFADE = 8;
  const EQ_MIN_DB = -24;
  const EQ_MAX_DB = 6;
  const EQ_KILL_DB = -40;
  const WAVE_FALLBACK = 0.3;

  // Crossfader de potencia constante: x = 0 solo suena el deck A, x = 1 solo el B; en el centro ambos a ~0,71.
  function equalPowerGains(x) {
    const p = Math.min(1, Math.max(0, Number(x) || 0));
    return { a: Math.cos((p * Math.PI) / 2), b: Math.sin((p * Math.PI) / 2) };
  }

  // Curva de ganancia para una rampa de crossfade (valores para AudioParam.setValueCurveAtTime).
  function fadeCurve(direction, steps = 64) {
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      curve[i] = direction === 'in' ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
    }
    return curve;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Cuándo empieza el crossfade hacia la siguiente y cuánto dura: lo sugerido por el motor o, si falta,
  // el crossfade del local antes del final. Nunca más de un tercio de la pista.
  function transitionPlan(item, duration, fallbackFade = DEFAULT_CROSSFADE) {
    const length = Number(duration) || Number(item?.track?.durationSeconds) || 0;
    let fade = Number(item?.crossfadeSeconds);
    if (!Number.isFinite(fade) || fade < 0) fade = Number(fallbackFade) || 0;
    if (length > 0) fade = Math.min(fade, length / 3);
    let at = Number(item?.transitionAtSeconds);
    if (!Number.isFinite(at) || at <= 0 || (length > 0 && at > length)) at = Math.max(0, length - fade - 1);
    return { at: Math.round(at * 100) / 100, fade: Math.round(fade * 100) / 100 };
  }

  // ¿Ya hay que empezar la transición? (también si la pista terminó antes del punto previsto).
  function shouldTransition(currentTime, plan, ended = false) {
    return Boolean(ended || (plan && plan.at > 0 && currentTime >= plan.at));
  }

  // Picos de la forma de onda → n barras entre 0,05 y 1; sin datos, barras planas.
  function waveformBars(peaks, count) {
    const n = Math.max(1, Math.floor(count));
    const values = Array.isArray(peaks) ? peaks.map(Number).filter(Number.isFinite) : [];
    if (!values.length) return new Array(n).fill(WAVE_FALLBACK);
    return Array.from({ length: n }, (_, i) => {
      const v = values[Math.min(values.length - 1, Math.floor((i / n) * values.length))];
      return Math.max(0.05, Math.min(1, Math.abs(v)));
    });
  }

  // Mueve el elemento index una posición (delta -1 o +1) y devuelve un arreglo nuevo.
  function moveItem(list, index, delta) {
    const target = index + delta;
    if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list.slice();
    const copy = list.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    return copy;
  }

  // Mover de la posición from a la to (arrastrar y soltar).
  function moveTo(list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
    const copy = list.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  }

  // Ganancia del EQ en dB, acotada; "kill" corta la banda casi por completo.
  function eqGain(value, kill = false) {
    if (kill) return EQ_KILL_DB;
    return Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, Number(value) || 0));
  }

  // Volumen de un <audio> sin Web Audio (respaldo sin CORS): maestro × deck × crossfader, entre 0 y 1.
  function elementVolume(master, deck, crossfade) {
    const v = (Number(master) / 100) * (Number(deck) / 100) * Number(crossfade);
    return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  }

  // Id de la consola: aleatorio criptográfico (randomUUID o, en contextos sin él, getRandomValues).
  function newConsoleId() {
    const { crypto } = global;
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `consola-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  const SOURCE_LABELS = { autodj: 'AutoDJ', request: 'Petición', manual: 'Manual' };

  global.SmartDJConsole = {
    DEFAULT_CROSSFADE,
    EQ_MIN_DB,
    EQ_MAX_DB,
    SOURCE_LABELS,
    equalPowerGains,
    fadeCurve,
    formatTime,
    transitionPlan,
    shouldTransition,
    waveformBars,
    moveItem,
    moveTo,
    eqGain,
    elementVolume,
    newConsoleId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
