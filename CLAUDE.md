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
