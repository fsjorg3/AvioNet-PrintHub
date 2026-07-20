# AvioNet PrintHub — Frontend

Panel administrativo SPA construido con React, TypeScript, Vite, React Router en modo declarativo, MUI y TanStack Query.

## Desarrollo

```bash
cp .env.example .env
npm install
npm run dev
```

Variables públicas:

```env
VITE_API_URL=http://localhost:10000
VITE_QUERY_STALE_TIME_MS=5000
```

`VITE_QUERY_STALE_TIME_MS` controla cuánto tiempo TanStack Query considera frescas las respuestas. No activa sondeo automático; después de ese intervalo, una consulta se revalida solo cuando vuelve a solicitarse.

## Verificación

```bash
npm run test
npm run build
```

## Render

Configura este directorio como `Root Directory` de un Static Site:

```text
Build Command: npm install && npm run build
Publish Directory: dist
```

Define `VITE_API_URL` con la URL pública del backend y `VITE_QUERY_STALE_TIME_MS=5000`. En el backend, añade la URL del Static Site a `CORS_ORIGIN`.
