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

## Docker

```bash
docker build -t smartdj-frontend .
docker run -p 5173:80 smartdj-frontend
```

## Backend

El API está en el repositorio `smartdj-backend`.
