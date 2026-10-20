# SmartDJ Frontend

Frontend estático de SmartDJ (HTML, CSS y JavaScript nativo, sin build). Lo usan los dueños de locales (panel) y los clientes que llegan por el link público o el QR de un local (sin login).

- `config.js` resuelve la URL del backend: `http://localhost:3000` en local y Render en producción.
- `app.js`: toda la lógica de la interfaz. Los textos del usuario o del servidor se insertan con `textContent`, nunca con `innerHTML`.
- `scripts/`: servidor estático local y scripts de QA.
- Despliegue en Vercel. El API vive en el repo `smartdj-backend` (Render + Supabase).

## Reglas fijas

- **Idioma del código:** todo en inglés: variables, funciones, archivos, rutas, tablas y columnas nuevas.
- **Idioma de los textos:** comentarios nuevos y textos para el usuario (errores, pantallas, mensajes) en español.
- **Comentarios existentes:** no modificarlos ni eliminarlos, aunque el código de al lado cambie.
- **Commits:** pequeños (un cambio lógico por commit), mensajes cortos en español sin punto final, sin `Co-Authored-By` ni menciones de IA. Usar el git config del usuario sin cambiarlo.
- **Secretos:** no leer ni tocar `.env`. En `.env.example` solo placeholders `CAMBIAR_ESTO`.
- **Git remoto:** no hacer push sin confirmación del usuario. Nunca usar `--force` ni reescribir el historial.
- **Trabajo por fases:** una fase a la vez. Al terminar cada una, detenerse y decir qué hay que configurar en Render, Vercel o Supabase.
- **Comunicación backend ↔ ai:** en una fase próxima pasará a gRPC (con streaming). Todavía no existe el `.proto`; no asumir su forma.
- **Pruebas locales:** nunca probar contra el backend de producción; usar un backend local en `localhost:3000`.
