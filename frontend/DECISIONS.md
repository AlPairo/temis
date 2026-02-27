# Decisiones de diseño (Temis Frontend)

- **Branding**: nombre Temis, fuente principal Cormorant Garamond para titulares y Inter para UI; paleta blancos/grises con acento azul marino `#1f2a44` y acento dorado sutil.
- **Stack**: Vite + React + TypeScript; Tailwind v4 (utilities + CSS variables); TanStack Query para datos y cacheo; React Router para navegación; Zustand para estado de usuario/rol.
- **Permisos**: modelo `Role x Resource x Action` con acciones `read|edit`. Roles: Basic (chat, sesiones y config solo lectura), Supervisor (edita materias, fechas, cuotas y usuarios), Admin (además cambia roles y permisos).
- **Chat**: usa SSE (`/chat/stream`) con parser manual y AbortController para cancelar; modo mock opcional (`VITE_USE_MOCK`).
- **Estructura de UI**: Landing en `/` con CTA; app en `/app` con layout de tres paneles (sesiones, chat, config). Panel de usuarios visible según permisos.
- **Accesibilidad**: focus styles visibles, soporte teclado en selects y botones, colores con contraste alto sobre fondo claro.
