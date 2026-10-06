/*
 * Configuracion del frontend SmartDJ.
 * El frontend es estatico (sin Vite), asi que no existe import.meta.env.
 * Definimos la URL del backend en un solo lugar y permitimos sobreescribirla
 * con window.SMARTDJ_API_URL (inyectada desde el hosting) o con un <meta>.
 */
(function () {
  // 1) Si el hosting inyecta window.SMARTDJ_API_URL, la usamos.
  // 2) Si viene en un <meta name="smartdj-api-url" content="...">, la usamos.
  // 3) Si estamos en local, apuntamos al backend local.
  // 4) Por defecto, al backend de Render en produccion.
  var meta = document.querySelector('meta[name="smartdj-api-url"]');
  var fromMeta = meta ? meta.getAttribute('content') : null;
  var host = window.location.hostname;

  var isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '';

  var DEFAULT_LOCAL = 'http://localhost:3000';
  var DEFAULT_REMOTE = 'https://smart-dj-platform.onrender.com';

  var apiUrl =
    window.SMARTDJ_API_URL ||
    fromMeta ||
    (isLocal ? DEFAULT_LOCAL : DEFAULT_REMOTE);

  // Quitamos barras finales para evitar dobles slash al concatenar.
  window.SMARTDJ_API_URL = String(apiUrl).replace(/\/+$/, '');
})();
