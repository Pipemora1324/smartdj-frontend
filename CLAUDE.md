# SmartDJ Frontend

Frontend estático de SmartDJ (HTML, CSS y JavaScript nativo, sin build). Lo usan los dueños de locales (panel) y los clientes que llegan por el link público o el QR de un local (sin login).

- `config.js` resuelve la URL del backend: `http://localhost:3000` en local y Render en producción. También guarda la URL de Supabase y la clave anon (públicas).
- **Autenticación: Supabase Auth** (`supabase-js` por CDN con SRI). Registro, códigos de 6 dígitos, login y recuperación van por `supabaseAuth()` en `app.js`; el token se envía al backend como `Bearer`. Las rutas `/api/auth/*` propias de la Fase 1 responden 410: no usarlas. Las pruebas locales usan un Supabase simulado, nunca el proyecto real.
- `app.js`: toda la lógica de la interfaz. Los textos del usuario o del servidor se insertan con `textContent`, nunca con `innerHTML`.
- `scripts/`: servidor estático local y scripts de QA.
- Despliegue en Vercel. El API vive en el repo `smartdj-backend` (Render + Supabase).

## Convenciones técnicas (bloques B–F)

- **Vistas:** `showView()` reemplaza la portada por una vista de página completa: el panel del dueño (`showDashboard`) o la página pública del local (`publicRequest` → `venuePage`). `showLanding()` vuelve a la portada. El modal (`#authDialog`) queda para el login y el estado de una petición.
- **DOM:** construye siempre con `el()`. Todo dato externo (servidor, URL, usuario) va con `textContent`; `innerHTML` solo con texto fijo.
- **API:** usa `api(path)`, que pasa por `apiUrl()` y no sale de `API_BASE/api/`. Las llamadas `async` que no se esperan van con `void` y manejan su propio error.
- **Librerías por CDN:** con versión fija y SRI (supabase-js en jsDelivr y qrcode-generator en cdnjs). Verifica el hash al cambiar de versión.
- **Pruebas:** `node --test "scripts/*.test.mjs"`. Las pruebas de navegador usan una copia con un Supabase simulado y el backend local, nunca producción.
- **Consola de DJ:**
  - `dj-console.js` contiene la interfaz y el Web Audio (dos decks, EQ, crossfader y AutoDJ en el navegador); `console-core.js` tiene la lógica pura, con pruebas.
  - Cada deck usa dos `<audio>`: uno pasa por Web Audio y necesita CORS; el otro es el respaldo sin CORS y no se conecta a Web Audio, porque sonaría en silencio.
  - La rampa del crossfade se programa en los `AudioParam`, no con temporizadores.
  - El `Dockerfile` debe copiar `console-core.js` y `dj-console.js`.
- **Página pública:** sin audio. Se actualiza por SSE (`/public/venues/:code/events`), con polling de respaldo.
- **Panel del dueño:** solo gestión del local (datos, QR, link y editar). Las peticiones y la música van en la consola (pestañas Cola, Peticiones y Buscar).
- **Consola accesible:** pestañas con `role=tab` y flechas, `aria-label` o `<label>` en todos los controles, `:focus-visible` y `prefers-reduced-motion`. Los avisos se borran solos (`say()`).
- **Origen de las pistas:** usa `kindBadge()` para "Completa" o "Preview 30 s".

## Sistema de diseño (pulido del frontend)

- **Archivos:**
  - `theme-init.js` va en el `<head>`, sin `defer`, y aplica el tema guardado.
  - `ui-core.js` tiene la lógica pura (tema, contraseña, header, menú y código) y sus pruebas.
  - `ui.js` tiene los componentes: botón de tema, header con sesión, menú móvil, campos de contraseña y código, esqueletos, `animateList()` y animaciones de la portada.
  - Orden de carga: `ui-core.js` → `app.js` → `ui.js` → `console-core.js` → `dj-console.js`. El `Dockerfile` debe copiar todos.
- **Estilos:** solo tokens semánticos (`--surface`, `--text`, `--accent-text`…); nunca colores sueltos en los componentes. Todo debe verse bien en ambos temas.
- **Lima y contraste:** el lima solo como fondo, con `--on-accent` encima; para texto de acento usa `--accent-text`, que es oliva en modo claro.
- **Animaciones:** solo `transform` y `opacity`, siempre respetando `prefers-reduced-motion`.
- **Objetivos táctiles:** mínimo `--tap` (44 px).
- **Sesión:** `setSessionUser()` dispara `smartdj:session` y el header se vuelve a pintar. Cierra sesión siempre con `signOut()`.
- **Pruebas:** `node --test "scripts/*.test.mjs"`. La prueba de humo `scripts/smoke.e2e.mjs` usa datos de prueba, nunca el backend real ni Supabase.

## Reglas fijas

- **Idioma del código:** todo en inglés: variables, funciones, archivos, rutas, tablas y columnas nuevas.
- **Idioma de los textos:** comentarios nuevos y textos para el usuario (errores, pantallas, mensajes) en español.
- **Comentarios existentes:** no modificarlos ni eliminarlos, aunque el código de al lado cambie.
- **Commits:** pequeños (un cambio lógico por commit), mensajes cortos en español sin punto final, sin `Co-Authored-By` ni menciones de IA. Usar el git config del usuario sin cambiarlo.
- **Secretos:** no leer ni tocar `.env`. En `.env.example` solo placeholders `CAMBIAR_ESTO`.
- **Git remoto:** no hacer push sin confirmación del usuario. Nunca usar `--force` ni reescribir el historial.
- **Trabajo por fases:** una fase a la vez. Al terminar cada una, detenerse y decir qué hay que configurar en Render, Vercel o Supabase.
- **Comunicación backend ↔ ai: gRPC** (vive en `smartdj-backend`). El frontend no usa gRPC: sigue con REST y recibe el estado en vivo de cada petición por SSE (`/api/public/requests/:id/events`), con polling como respaldo (`requestStatusView()` en `app.js`).
- **Pruebas locales:** nunca probar contra el backend de producción; usar un backend local en `localhost:3000`.
