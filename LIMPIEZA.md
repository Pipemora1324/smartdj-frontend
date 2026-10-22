# Limpieza de código muerto (frontend)

Primero se hizo el inventario y después se borró. Cómo se buscó:
- **Identificadores:** los de nivel superior de cada archivo, declarados y nunca usados (análisis con un script).
- **Clases CSS:** las de `styles.css` contra el HTML y el JS, contando las que se arman dinámicamente (`kind-*`, `state-*`, `source-*`…).
- **Llamadas al API:** contra las rutas que existen en el backend.
- **Scripts:** los de `scripts/` contra los flujos actuales.

| Elemento | Evidencia | Decisión |
| --- | --- | --- |
| `panelPoll` y `stopPanelPoll()` en `app.js` | El panel dejó de hacer sondeo cuando la gestión musical pasó a la consola: `panelPoll` ya nunca recibe un intervalo. | **Borrar**, junto con sus llamadas en `app.js` y `dj-console.js`. |
| `credentials: 'include'` en `api()` y el comentario de la "cookie HttpOnly" | La API usa `Authorization: Bearer`; el backend ya no emite cookies. El comentario describe la renovación anterior, que ahora hace Supabase. | **Quitar** y corregir el comentario. |
| `scripts/qa-auth.mjs` y `scripts/qa-login-flow.mjs` | Prueban la auth propia de la Fase 1 (login con `accessToken` del backend), que ya no existe. Los reemplazan las pruebas unitarias y `scripts/smoke.e2e.mjs`. | **Borrar.** |
| Clases CSS | Ninguna sin uso: el análisis solo encontró "googleapis", que es la URL de las fuentes. | **Nada que borrar.** |
| Identificadores de JS | Fuera de `panelPoll` y `stopPanelPoll`, ninguno sin uso. | **Nada más que borrar.** |
| `scripts/dev-static-server.mjs` | Servidor local de desarrollo, documentado en el README. | **Mantener.** |

La limpieza del backend y del motor está en `LIMPIEZA.md` de `smartdj-backend`.
