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
    host === '0.0.0.0' ||
    host === '' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.');

  var DEFAULT_LOCAL = 'http://localhost:3000';
  var DEFAULT_REMOTE = 'https://smart-dj-platform.onrender.com';

  var apiUrl = window.SMARTDJ_API_URL || fromMeta || (isLocal ? DEFAULT_LOCAL : DEFAULT_REMOTE);

  // Quitamos barras finales para evitar dobles slash al concatenar.
  window.SMARTDJ_API_URL = String(apiUrl).replace(/\/+$/, '');
})();

/*
 * Supabase Auth (registro, códigos de 6 dígitos, login y recuperación).
 * Ambos valores son públicos por diseño: la URL del proyecto y la clave anon/publishable
 * (Project Settings → API). Nunca pongas aquí la service_role ni una clave sb_secret_.
 */
window.SMARTDJ_SUPABASE_URL = window.SMARTDJ_SUPABASE_URL || 'https://tecabokuyamxmozomqay.supabase.co';
window.SMARTDJ_SUPABASE_ANON_KEY = window.SMARTDJ_SUPABASE_ANON_KEY || 'sb_publishable_h_C1CNiFkIhCCtFa9XKOvg_rb3kM7Q9';
