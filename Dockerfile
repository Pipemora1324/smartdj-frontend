# Solo los archivos públicos del sitio (nada de scripts, README ni archivos locales); nginx sin root en el puerto 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY index.html app.js config.js styles.css console-core.js dj-console.js theme-init.js ui-core.js ui.js /usr/share/nginx/html/
