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

  global.SmartDJUI = {
    THEME_KEY, readTheme, saveTheme, resolveTheme, oppositeTheme, themeToggleLabel,
    initials, headerModel, menuNextIndex, trapFocusIndex,
  };
}(typeof window !== 'undefined' ? window : globalThis));
