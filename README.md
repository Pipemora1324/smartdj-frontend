# SmartDJ Frontend

Frontend estático de SmartDJ (HTML, CSS y JavaScript sin build).

## Ejecutar en local

Requiere Node.js 18 o superior.

```bash
node scripts/dev-static-server.mjs 5173
```

Abre `http://localhost:5173`. Usa el puerto 5173 (o 3000/8080), que son los que el backend permite por CORS en local.

## URL del backend

`config.js` decide a qué backend llamar:

- En local (`localhost`, `127.0.0.1`, red privada): `http://localhost:3000`
- En producción: `https://smart-dj-platform.onrender.com`

Para usar otra URL sin tocar el código, define `window.SMARTDJ_API_URL` antes de cargar `config.js` o agrega `<meta name="smartdj-api-url" content="https://...">` en `index.html`. Cualquiera de los dos tiene prioridad sobre la detección de local, así que no los dejes apuntando a producción o el frontend local llamará a Render.

## Autenticación (Supabase Auth)

El registro, la verificación del correo con código de 6 dígitos, el inicio de sesión y la recuperación de contraseña usan [Supabase Auth](https://supabase.com/docs/guides/auth) con `supabase-js` cargado desde jsDelivr (versión fija y con SRI en `index.html`).

En `config.js` completa:

- `window.SMARTDJ_SUPABASE_URL`: `https://<ref>.supabase.co`.
- `window.SMARTDJ_SUPABASE_ANON_KEY`: la clave **anon/publishable** (Project Settings → API). Es pública por diseño. **Nunca** uses la `service_role` ni una `sb_secret_…`.

Mientras estén vacías, la app muestra "El inicio de sesión no está configurado todavía". Después del login, el frontend envía el access token de Supabase como `Bearer` al backend, que crea el perfil con `GET /api/auth/me`.

La configuración del panel de Supabase (SMTP de Gmail, plantillas con el código, límites) está en `SUPABASE_AUTH.md` del repositorio `smartdj-backend`.

## Pedir canciones (bloque B)

El link público del local (`/?venue=<código>`) muestra un **buscador**:

- Al escribir 2 o más letras, después de 400 ms sin teclear, consulta `GET /api/public/venues/:code/search?q=`. El backend busca en iTunes; el navegador nunca llama a APIs externas.
- Cada resultado muestra portada, título, artista, género y un botón para escuchar el **preview de 30 s**.
- **Al tocar una canción se pide de inmediato** con `POST /api/public/venues/:code/requests` y `{ trackId, guestName? }`. El nombre es opcional y no hay campos de género, BPM ni tonalidad.
- Después se muestra el estado en vivo por etapas.
- Todo dato externo (nombre del local, canciones) se inserta con `textContent`.

## Panel del dueño (bloque C)

Al iniciar sesión se abre una **vista de gestión** de página completa (`showDashboard()` en `app.js`) en lugar del modal:

- Lista de locales del dueño, que puede tener varios, y formulario para **crear** uno nuevo.
- Por local: **editar** los datos, el link público con botón para copiarlo y las **peticiones recientes**. Cada petición muestra portada, canción, quién la pidió y el motivo del motor, con acciones para **aceptar**, **rechazar** y **marcar como sonada**.
- Las peticiones se actualizan cada 5 s por polling, pausado cuando la pestaña no está visible.
- "Cerrar sesión" vuelve a la portada.

## Link público con interfaz de DJ y QR (bloque D)

- **`/?venue=<código>`** abre una página completa del local:
  - **Sonando ahora**: la última canción marcada como sonada, con portada y botón de preview de 30 s si existe.
  - **Próximas canciones**: las aceptadas por el DJ.
  - El **buscador** para pedir.

  Los datos vienen de `GET /api/public/venues/:code/now` y se refrescan cada 10 s. Al pedir una canción, su estado en vivo se muestra en un modal; al cerrarlo se puede pedir otra.
- **QR por local** en el panel del dueño:
  - Se genera en el navegador con `qrcode-generator` 1.4.4, cargado desde cdnjs con SRI.
  - Botón **Descargar QR (PNG)**, que guarda `qr-<nombre-del-local>.png`, y **Copiar link**.
  - Se verificó decodificando el PNG descargado: contiene exactamente el link público.

## Consola de DJ y emisora automática

En el panel, cada local muestra sus datos, el QR, el link público, "Editar local" y el botón **🎧 Consola de DJ**. La música, la cola y las peticiones se manejan solo desde la consola (`showConsole()` en `dj-console.js`).

**Flujo del dueño:**
1. Abre la consola en el equipo conectado al sonido del local y toca **"Iniciar emisora"**: los navegadores no reproducen audio sin un clic.
2. **Dos vinilos**, uno por deck, giran mientras suena su pista y se detienen al pausar. Muestran la portada, el título, el artista, el progreso y el crédito con enlace y licencia. Los cortes de iTunes se marcan **"Preview 30 s"**.
3. **Controles grandes:** reproducir/pausar, saltar, volumen y el interruptor **AutoDJ / Manual**.
   - En AutoDJ, la siguiente pista se precarga y el crossfade empieza en el punto que sugiere el motor.
   - En Manual decide el dueño.
4. **"Avanzado"** (cerrado por defecto): EQ de 3 bandas por deck (graves, medios y agudos, con botón **K** para cortar), volumen por deck, forma de onda y crossfader manual.
5. **Pestañas:**
   - **Cola:** reordenable con ↑/↓ o arrastrando.
   - **Peticiones:** en vivo, con portada, origen, quién pidió y estado. Acciones **Reproducir ahora**, **Añadir a la cola** y **Descartar**.
   - **Buscar:** catálogo de Jamendo para agregar a la cola.
6. **Si una pista falla:** un reintento, después el servidor de respaldo sin EQ y, si tampoco carga, se salta. También si falla durante un crossfade.
7. **Avisos:** se borran solos a los pocos segundos.

**Accesibilidad:** foco visible, etiquetas en todos los controles, pestañas operables con flechas, Inicio y Fin, y vinilos quietos si el sistema pide reducir el movimiento.

**Flujo del cliente** (`/?venue=<código>`):
1. "Sonando ahora", con crédito y licencia, y las próximas canciones, actualizadas por SSE.
2. Buscador: primero canciones **Completa** (suenan enteras) y, si hay pocas, **Preview 30 s** (iTunes, suenan como corte de 30 s).
3. Al pedir ve el análisis en vivo y después la sección **"Tus peticiones"** con el estado de cada una: En evaluación, El DJ la revisará, En la cola, Sonando ahora o Sonada. Se guardan solo los ids en su navegador.

La página pública no reproduce audio. La lógica sin DOM está en `console-core.js`, con pruebas en `scripts/`.

Las licencias de la música (uso no comercial de Jamendo y por qué los previews de iTunes no sirven para un uso real) están explicadas en el README del backend.

## Calidad: SonarCloud (bloque F)

El Quality Gate fallaba por **seguridad** (E) y **fiabilidad** (C). Lo que se corrigió:

- **XSS en el DOM (BLOCKER):** el nombre del local se insertaba con `innerHTML`. Ahora todo dato externo va con `textContent` (bloques B a D).
- **CSRF del lado del cliente:** `apiUrl()` verifica que cada petición quede dentro de `API_BASE/api/`. Prueba: `node --test "scripts/*.test.mjs"`.
- **Promesas sin manejar:** se marcan con `void` las que ya manejan su error. Además se corrigió un `return openSession()` dentro de un `try` que no capturaba el error.
- **Contraseña fija** en `scripts/qa-login-flow.mjs`: ahora se genera al azar.
- **Dockerfile:** el `COPY .` recursivo publicaba `CLAUDE.md`, el `Dockerfile` y los scripts. Ahora copia solo `index.html`, `app.js`, `config.js` y `styles.css`, con `nginx-unprivileged`, sin root, en el puerto 8080.

Se mantiene, como aceptado: `scripts/dev-static-server.mjs` usa `http`, porque es un servidor solo para desarrollo local.

## Estado en vivo de una petición (gRPC en el backend)

El navegador **no habla gRPC**: usa REST con el backend. Por dentro, el backend evalúa cada petición llamando al motor de IA por **gRPC con streaming** y reenvía cada etapa al navegador por **SSE**.

```
 Navegador (este repo)                  Backend                      Motor de IA
 ─────────────────────                  ───────                      ───────────
 POST /api/public/venues/:code/requests ─▶ cola BullMQ ── gRPC stream ─▶ etapas
 EventSource /api/public/requests/:id/events ◀── SSE ◀── Redis ◀──────── (en cola,
 (si falla: GET /api/public/requests/:id cada 2 s)                       género, tempo,
                                                                          tonalidad,
                                                                          resultado)
```

- Después de enviar una canción, `requestStatusView()` en `app.js` muestra las etapas (en cola, analizando el género, el tempo y la tonalidad, resultado) y al final la decisión. Si no se acepta directamente, también muestra el puente sugerido.
- Usa `EventSource`. Si el SSE se corta o el navegador no lo soporta, consulta el estado cada 2 segundos (polling).
- Los textos que llegan del servidor se insertan con `textContent`.
- Los detalles de gRPC están en el README y en `DECISIONES_GRPC.md` del repositorio `smartdj-backend`.

## Sistema de diseño y temas

Todo color, tipografía, espaciado, radio, sombra y duración sale de **tokens** en `:root` (`styles.css`).

**Tipos de token:**
- **Primitivos:** paleta de marca `--lime-*`, `--olive-*`, `--cream-*`, `--ink-*` y `--amber-400`.
- **Semánticos:** `--bg`, `--surface`, `--surface-2`, `--surface-inverse`, `--text`, `--text-muted`, `--border`, `--accent`, `--on-accent`, `--accent-text`, `--focus`, `--danger`, `--warning`, `--glass` y `--shadow-*`.
- **Escalas:** `--text-*`, `--space-*`, `--radius-*`, `--dur*`, `--ease*` y `--tap` (44 px).

Los componentes solo usan tokens semánticos.

**Temas claro y oscuro** en todas las pantallas, incluida la consola de DJ:
- Por defecto se sigue el sistema (`prefers-color-scheme`).
- El botón de tema del header (`.theme-toggle`, con etiqueta accesible) guarda la elección en `localStorage` (`smartdj-theme`). Si el almacenamiento no está disponible, se sigue usando el tema del sistema.
- `theme-init.js` va en el `<head>` y aplica el tema guardado antes de pintar la página, para que no parpadee.
- Con View Transitions el cambio es un fundido de opacidad.

**Contraste** (WCAG AA, verificado en ambos temas):
- En modo claro, los botones lima llevan texto oscuro (`--on-accent`) y los acentos de texto usan oliva `#4a5d00`, con 6,5:1 sobre crema; el foco también es oliva.
- En modo oscuro, el lima sobre tinta da 16,7:1.

**Movimiento:**
- Solo se animan `transform` y `opacity`.
- **Animaciones:** aparecer al hacer scroll, parallax del deck, contador de la portada, entrada y salida de listas, esqueletos de carga, vinilos que giran, visualizador de nivel y transición entre vistas.
- Con `prefers-reduced-motion: reduce` se desactivan.

## Header y navegación

- **Sin sesión:** enlaces de la portada, **Ingresar** y **Crear establecimiento**.
- **Con sesión:** avatar con iniciales y menú (**Mis locales**, **Consola de DJ**, **Cambiar tema**, **Cerrar sesión**). Se maneja con el teclado: flechas, Inicio, Fin y Escape.
- La sesión se restaura al cargar la página (`restoreSession()` en `app.js`).
- **Header:** fijo, con efecto cristal y sombra al hacer scroll, y con el enlace de la sección visible resaltado.
- **Menú hamburguesa** por debajo de 900 px: diálogo modal con foco atrapado, Escape para cerrar y foco de vuelta al botón.

## Accesibilidad

- **Foco y navegación:** foco visible en todo control (`:focus-visible`), enlace "Saltar al contenido" y orden de tabulación lógico.
- **Etiquetas:** etiquetas visibles en los formularios, con los errores asociados por `aria-describedby` y `aria-invalid`.
- **Contraseñas:** botón de mostrar/ocultar (ojo) con `aria-pressed` y una etiqueta que cambia. La fortaleza y los requisitos se actualizan en vivo.
- **Código de 6 dígitos:** seis casillas con teclado numérico en móvil, autofoco, pegado repartido y retroceso.
- **Mensajes:** con `role="alert"` o `role="status"` y una animación suave.
- **Roles ARIA:** `menu`/`menuitem` en la cuenta, `tablist`/`tab`/`tabpanel` en la consola y `dialog` con `aria-modal` en el menú móvil.
- **Objetivos táctiles:** de al menos 44 px.

**Revisión responsive** (navegador sin cabeza a 320, 360, 768, 900 y 1280 px, en ambos temas). Se corrigió:
- Los artículos de la portada se encogían a 44 px por un choque de nombres de clase con el botón del ojo.
- El encabezado de la página pública heredaba los estilos del header del sitio.
- El texto de "Comparte tu local" cortaba palabras a la mitad.
- El logo y "Ver demostración" medían menos de 44 px.
- A 768 px el botón de tema se encogía; por eso el header de escritorio empieza a los 900 px.
- Ninguna vista tiene scroll horizontal.

## Pruebas

```bash
npm install                          # solo herramientas de desarrollo; el sitio no tiene build
npm test                             # pruebas unitarias (sin navegador)
npm run lint                         # ESLint; los globales compartidos entre scripts se leen de los propios archivos
npm run format                       # Prettier (index.html y los .md quedan fuera, ver .prettierignore)
PLAYWRIGHT_MODULE=<ruta a node_modules/playwright> node scripts/smoke.e2e.mjs   # prueba de humo
```

- `package.json` solo existe para estas herramientas. `.vercelignore` lo deja fuera del despliegue, así Vercel sigue publicando el sitio estático sin instalar nada.

- **Pruebas unitarias:** cubren el tema (alternar, guardar y almacenamiento no disponible), la contraseña (fortaleza, requisitos, mostrar/ocultar y confirmación), el header según la sesión, el menú (flechas y foco atrapado), el código de 6 dígitos, la lógica de la consola, las peticiones del cliente y `apiUrl()`.
- **Prueba de humo:** carga la portada, el menú móvil, el registro, el código, el panel, la consola y la página pública en tema claro y oscuro, a 360 y 1280 px. Falla si hay errores en la consola o scroll horizontal.
  - Es autocontenida: responde el API con datos de prueba y reemplaza los scripts de CDN y Supabase por dobles locales.
  - Necesita Playwright, que no es dependencia del proyecto: `npx -y playwright@1.49.1 install chromium`.

## Docker

```bash
docker build -t smartdj-frontend .
docker run -p 5173:8080 smartdj-frontend
```

## Backend

El API está en el repositorio `smartdj-backend`.
