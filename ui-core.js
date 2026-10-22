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

  global.SmartDJUI = { THEME_KEY, readTheme, saveTheme, resolveTheme, oppositeTheme, themeToggleLabel };
}(typeof window !== 'undefined' ? window : globalThis));
