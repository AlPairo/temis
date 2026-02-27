# Temis Frontend

Frontend para el asistente legal Temis. Incluye landing pública y espacio de trabajo con chat, historial de sesiones y panel de configuración con permisos por rol.

## Requisitos

- Node 18+ y npm.
- Backend disponible en `http://localhost:3000` o configurar `VITE_BACKEND_URL`.

## Scripts

- `npm install` — instala dependencias.
- `npm run dev` — inicia el servidor de desarrollo en `http://localhost:5173`.
- `npm run build` — genera el build de producción.
- `npm run preview` — sirve el build generado.
- `npm run test` — ejecuta las pruebas unitarias (Vitest + Testing Library).

## Variables de entorno

Crear `.env.local` (o exportar) con:

```
VITE_BACKEND_URL=http://localhost:3000
VITE_USE_MOCK=false
```

## Notas

- CORS: el backend Fastify permite `http://localhost:5173` por defecto. Ajustar `FRONTEND_ORIGIN` en backend si cambias el dominio.
- Modo demo: establece `VITE_USE_MOCK=true` para usar datos simulados sin backend.
