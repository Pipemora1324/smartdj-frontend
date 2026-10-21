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

En el panel, cada local tiene el botón **🎧 Consola de DJ** (`showConsole()` en `dj-console.js`). La música suena en el navegador del dueño: hay que abrir la consola en el equipo conectado al sonido del local.

- **"Iniciar emisora":** los navegadores no reproducen audio sin un clic. Este botón crea el `AudioContext` y toma el control (`POST /player/claim`).
- **Decks A y B:** portada, título, artista, crédito con enlace y licencia, tiempo transcurrido y restante, forma de onda (picos de Jamendo) y volumen por deck.
- **EQ de 3 bandas (Web Audio):** graves (low-shelf de 250 Hz), medios (peaking de 1 kHz) y agudos (high-shelf de 4 kHz), de −24 a +6 dB, con botón **K** para cortar la banda.
- **Mezclador:** crossfader de potencia constante, volumen maestro (se guarda en el servidor), reproducir/pausar y saltar.
- **AutoDJ / Manual:**
  - En AutoDJ, la siguiente pista se precarga en el deck libre y el crossfade empieza en el punto que sugiere el motor, con la duración que sugiere. La rampa corre en el hilo de audio, así que también funciona con la pestaña en segundo plano.
  - En Manual no hay transiciones automáticas: el dueño mueve el crossfader. Si una pista termina, sigue la siguiente para que la emisora no se quede en silencio.
- **Cola:** reordenable con ↑/↓ (también en móvil) o arrastrando en escritorio. Se pueden quitar pistas y agregar otras desde el buscador del catálogo (Jamendo).
- **Si una pista falla:** un reintento, después el servidor de respaldo de Jamendo sin EQ (`audioFallbackUrl`) y, si tampoco carga, se salta. La siguiente pista se verifica mientras se precarga.
- **Una sola consola por local:** si otro equipo toma el control, esta consola se pausa y muestra "Tomar control".
- **"Solo licencias comerciales":** excluye las pistas con licencia no comercial (NC).

La lógica sin DOM (curvas del crossfader, punto de transición, forma de onda y movimientos de la cola) está en `console-core.js`, con pruebas en `scripts/console-core.test.mjs`.

**Página pública (`/?venue=`):**
- "Sonando ahora" con portada, título, artista y crédito (enlace a la pista y licencia), más las próximas 5 pistas. Las pedidas por el público se marcan como "Pedida".
- Se actualiza por SSE (`/api/public/venues/:code/events`), con polling cada 10 s si el SSE no está conectado.
- **No reproduce audio:** el preview de 30 s pasó a las peticiones del panel del dueño.

Las licencias de la música (uso no comercial de la API de Jamendo y qué cambia para un uso comercial) están explicadas en el README del backend.

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

## Docker

```bash
docker build -t smartdj-frontend .
docker run -p 5173:8080 smartdj-frontend
```

## Backend

El API está en el repositorio `smartdj-backend`.
