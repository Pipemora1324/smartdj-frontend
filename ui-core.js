// Lógica pura de la interfaz (sin DOM), para poder probarla con node --test.
// Se expone como window.SmartDJUI; ui.js y app.js la usan para el tema, la contraseña, el header y el código.
(function (global) {
  // ---------- Tema claro / oscuro ----------
  const THEME_KEY = 'smartdj-theme';
  const THEMES = ['light', 'dark'];

  // Tema guardado ('light' | 'dark') o null si no hay elección o el almacenamiento no está disponible.
  function readTheme(storage) {
    try {
      const value = storage?.getItem(THEME_KEY);
      return THEMES.includes(value) ? value : null;
    } catch {
      return null;
    }
  }

  // Guarda la elección; devuelve false si el navegador no deja guardar (modo privado, almacenamiento bloqueado).
  function saveTheme(storage, theme) {
    if (!THEMES.includes(theme)) return false;
    try {
      storage.setItem(THEME_KEY, theme);
      return true;
    } catch {
      return false;
    }
  }

  // Tema efectivo: el elegido o, si no hay, el del sistema.
  function resolveTheme(saved, systemDark) {
    if (THEMES.includes(saved)) return saved;
    return systemDark ? 'dark' : 'light';
  }

  const oppositeTheme = (theme) => (theme === 'dark' ? 'light' : 'dark');

  // Texto accesible del botón: describe la acción, no el estado.
  const themeToggleLabel = (theme) => (theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');

  // ---------- Header según la sesión ----------
  // Iniciales para el avatar: dos letras del nombre o, si no hay, del correo.
  function initials(name, email) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    const local = String(email || '').split('@')[0].replace(/[^\p{L}\p{N}]/gu, '');
    return (local.slice(0, 2) || '?').toUpperCase();
  }

  const LANDING_LINKS = [{ href: '#como-funciona', label: 'Cómo funciona' }, { href: '#roles', label: 'Para quién' }];
  // Qué muestra el header: sin sesión, enlaces de la landing y acceso; con sesión, avatar y menú de la cuenta.
  function headerModel(user) {
    if (!user) {
      return { signedIn: false, links: LANDING_LINKS, actions: [{ id: 'login', label: 'Ingresar' }, { id: 'register', label: 'Crear establecimiento' }] };
    }
    return {
      signedIn: true, links: LANDING_LINKS, initials: initials(user.name, user.email), displayName: user.name || user.email || 'Tu cuenta', email: user.email || '',
      menu: [{ id: 'venues', label: 'Mis locales' }, { id: 'console', label: 'Consola de DJ' }, { id: 'theme', label: 'Cambiar tema' }, { id: 'logout', label: 'Cerrar sesión' }],
    };
  }

  // Menú desplegable: a qué ítem va el foco con cada tecla (null si la tecla no mueve el foco).
  function menuNextIndex(key, index, count) {
    if (!count) return null;
    if (key === 'ArrowDown') return (index + 1) % count;
    if (key === 'ArrowUp') return (index - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
  }

  // Foco atrapado (menú móvil): con Tab desde el último vuelve al primero y con Shift+Tab desde el primero va al último.
  // Devuelve el índice al que hay que mover el foco o null si el navegador puede seguir solo.
  function trapFocusIndex(index, count, shiftKey) {
    if (!count) return null;
    if (index < 0) return shiftKey ? count - 1 : 0;
    if (shiftKey && index === 0) return count - 1;
    if (!shiftKey && index === count - 1) return 0;
    return null;
  }

  // ---------- Contraseña ----------
  // Reglas que se muestran en vivo. Las obligatorias coinciden con validatePassword() de app.js (8+, letra y número).
  function passwordChecks(password) {
    const value = String(password || '');
    return [
      { id: 'length', label: 'Al menos 8 caracteres', required: true, ok: value.length >= 8 },
      { id: 'letter', label: 'Una letra', required: true, ok: /\p{L}/u.test(value) },
      { id: 'number', label: 'Un número', required: true, ok: /\d/.test(value) },
      { id: 'case', label: 'Mayúsculas y minúsculas', required: false, ok: /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value) },
      { id: 'symbol', label: 'Un símbolo', required: false, ok: /[^\p{L}\d\s]/u.test(value) },
    ];
  }
  const STRENGTH_LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];
  // Fortaleza de 0 a 4: sin las obligatorias no pasa de "Débil"; la longitud extra y las recomendadas suben el puntaje.
  function passwordStrength(password) {
    const value = String(password || '');
    const checks = passwordChecks(value);
    const meetsMinimum = checks.filter((c) => c.required).every((c) => c.ok);
    let score = 0;
    if (value.length >= 1) score = 1;
    if (meetsMinimum) {
      score = 2;
      if (value.length >= 12) score += 1;
      if (checks.filter((c) => !c.required && c.ok).length >= 1) score += 1;
    }
    score = Math.min(4, score);
    return { score, label: value ? STRENGTH_LABELS[score] : '', meetsMinimum, checks };
  }
  // Botón de mostrar/ocultar: tipo del campo y texto accesible según el estado.
  function revealState(visible) {
    return { type: visible ? 'text' : 'password', pressed: visible ? 'true' : 'false', label: visible ? 'Ocultar contraseña' : 'Mostrar contraseña' };
  }
  function confirmError(password, confirm) {
    if (!confirm) return 'Repite la contraseña.';
    return password === confirm ? null : 'Las contraseñas no coinciden.';
  }

  // ---------- Código de 6 dígitos ----------
  const CODE_LENGTH = 6;
  const onlyDigits = (text) => String(text || '').replace(/\D/g, '');
  // Escribir o pegar en la casilla "index": reparte los dígitos desde ahí y dice a qué casilla pasa el foco.
  function distributeCode(digits, index, text, length = CODE_LENGTH) {
    const next = Array.from({ length }, (_, i) => digits[i] || '');
    const incoming = onlyDigits(text).slice(0, length - index);
    for (let i = 0; i < incoming.length; i += 1) next[index + i] = incoming[i];
    const focusIndex = incoming.length ? Math.min(index + incoming.length, length - 1) : index;
    return { digits: next, focusIndex, complete: next.every(Boolean) };
  }

  global.SmartDJUI = {
    THEME_KEY, readTheme, saveTheme, resolveTheme, oppositeTheme, themeToggleLabel,
    initials, headerModel, menuNextIndex, trapFocusIndex,
    passwordChecks, passwordStrength, revealState, confirmError, CODE_LENGTH, onlyDigits, distributeCode,
  };
}(typeof window !== 'undefined' ? window : globalThis));
