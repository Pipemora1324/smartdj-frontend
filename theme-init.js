// Aplica el tema guardado antes de pintar la página (en el <head>, sin defer), para que no parpadee.
// Sin elección guardada no pone nada y el CSS sigue al sistema (prefers-color-scheme).
(function () {
  try {
    var saved = window.localStorage.getItem('smartdj-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    // Almacenamiento no disponible: se usa el tema del sistema.
  }
}());
