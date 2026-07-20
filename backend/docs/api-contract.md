# Contrato de API — AvioNet PrintHub

Todas las respuestas son JSON. Los endpoints con cuerpo esperan `Content-Type: application/json`.

## CORS

El backend permite solicitudes desde los orígenes configurados en `CORS_ORIGIN`, una lista separada por comas. Ejemplo para desarrollo y Render:

```env
CORS_ORIGIN=http://localhost:5173,https://panel-printhub.onrender.com
```

Las solicitudes del frontend que usan sesión deben incluir `credentials: 'include'`. La API responde con `403` y código `CORS_ORIGIN_DENIED` si el encabezado `Origin` no está permitido.

## Formato de errores

Los errores de la API siguen esta forma:

```json
{
  "success": false,
  "error": {
    "code": "CODIGO_DE_ERROR",
    "message": "Descripción explícita para diagnóstico",
    "details": { "method": "GET", "path": "/ruta" }
  }
}
```

`details` se incluye cuando aporta contexto útil, como una ruta inexistente o un parámetro inválido.

---

## Webhook (Meta)

### `GET /v1/webhook`

Handshake de verificación de Meta.

**Query params:** `hub.mode`, `hub.verify_token`, `hub.challenge`

**Respuesta exitosa:** `200`, cuerpo = valor de `hub.challenge` (texto plano).

**Error:** `403` (mode o token inválido).

### `POST /v1/webhook`

Recibe eventos de WhatsApp (mensajes, estados). Requiere header `X-Hub-Signature-256` con la firma HMAC-SHA256 del cuerpo, calculada con `APP_SECRET`. Si falta o no coincide, responde `401` con los códigos `WEBHOOK_SIGNATURE_MISSING` o `WEBHOOK_SIGNATURE_INVALID`.

**Respuesta exitosa:** `200 EVENT_RECEIVED` (texto plano).

**Nota:** No requiere ni produce respuesta directa al llamador — las respuestas al usuario van por WhatsApp de forma asíncrona.

---

## Kiosco — recolección de impresión (flujo WhatsApp → PIN)

Autenticación: `VERIFY_TOKEN` compartido, vía query param `?token=` o header `X-Verify-Token`.

### `GET /v1/kiosk/file-info?pin=123456`

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "pin": "123456",
  "filename": "documento.pdf",
  "phone": "521234567890",
  "created_at": "2026-07-05 12:00:00"
}
```

**Errores:**
- `400` — falta el parámetro `pin`: `{ "success": false, "message": "Parámetro \"pin\" es requerido." }`
- `403` — token inválido o ausente: `{ "success": false, "message": "Acceso prohibido: Token de verificación inválido o ausente." }`
- `404` — PIN no existe o expiró: `{ "success": false, "message": "El PIN proporcionado no existe o ya expiró." }`

### `GET /v1/kiosk/download?pin=123456`

Descarga el archivo binario y lo marca como descargado (el archivo físico persiste 5 minutos más por si se necesita reintentar; la fila en `pending_prints` nunca se borra).

**Respuesta exitosa (`200`):** stream binario del archivo (`Content-Disposition: attachment`).

**Errores:** mismos códigos y formato que `file-info`, más `500` si falla el envío del stream.

---

## Kiosco — reporte de impresión (ingreso, páginas, consumibles)

Autenticación: header `Authorization: Bearer <kiosk_id>.<secret>` — credencial individual por kiosco, emitida una sola vez por `POST /v1/admin/kiosks`.

### `POST /v1/kiosk/report`

**Body:**
```json
{
  "pin": "123456",
  "pages": 3,
  "revenue": 6.0,
  "idempotency_key": "kiosk_a1b2c3d4-job-2026-07-05T12:00:00Z",
  "consumables": [
    { "type": "paper", "status": "ok", "level_percent": 82 },
    { "type": "toner_black", "status": "low" },
    { "type": "toner_color", "status": "unknown" }
  ]
}
```

- `pin` (opcional): PIN del trabajo de `pending_prints`; si se envía, debe existir (la fila nunca se borra, así que es una referencia válida incluso mucho después de que el archivo físico haya sido eliminado).
- `pages` (requerido): entero > 0.
- `revenue` (requerido): número ≥ 0.
- `idempotency_key` (opcional pero recomendado): string único por kiosco. Si se repite, la llamada es un no-op — no se duplica el trabajo de impresión ni se vuelve a sumar el ingreso.
- `consumables` (opcional): array de `{ type, status, level_percent? }`.
  - `type` — uno de: `paper`, `toner_black`, `toner_color`, `toner_cyan`, `toner_magenta`, `toner_yellow`, `drum_unit`.
  - `status` — uno de: `ok`, `low`, `critical`, `empty`, `unknown`. **Es el campo del que depende cualquier alerta o vista en el panel** — siempre debe enviarse.
  - `level_percent` — opcional, 0–100. Solo si el SNMP de la impresora realmente lo reporta; si no está disponible, omitirlo (no forzar un valor inventado).

**Respuesta exitosa (`200`):** `{ "success": true }`

**Errores:**
- `400` — `pages` inválido: `{ "success": false, "message": "Parámetro \"pages\" debe ser un entero mayor a 0." }`
- `400` — `revenue` inválido: `{ "success": false, "message": "Parámetro \"revenue\" debe ser un número mayor o igual a 0." }`
- `400` — `pin` no existe: `{ "success": false, "message": "El PIN \"123456\" no existe." }`
- `400` — `consumables` con `type`/`status` fuera de las listas permitidas: `{ "success": false, "message": "Parámetro \"consumables\" inválido. Cada ítem requiere \"type\" y \"status\" de las listas permitidas." }`
- `403` — credenciales de kiosco inválidas o ausentes: `{ "success": false, "message": "Acceso prohibido: credenciales de kiosco inválidas o ausentes." }`

---

## Administración

El frontend inicia sesión con usuario y contraseña; el servidor devuelve una cookie firmada, `HttpOnly`, con una vigencia de 8 horas. Esta cookie no puede ser leída por JavaScript y el navegador la envía al usar `credentials: 'include'`.

Para mantener la compatibilidad con clientes de línea de comandos, los endpoints protegidos también aceptan HTTP Basic Auth (`ADMIN_USER` / `ADMIN_PASSWORD`).

### `POST /v1/admin/login`

**Body:**
```json
{ "user": "administrador", "password": "contraseña" }
```

**Respuesta exitosa (`200`):** establece la cookie `avionet_admin_session` y devuelve:
```json
{ "success": true, "user": "administrador", "expiresInSeconds": 28800 }
```

**Errores:**
- `401` — `ADMIN_LOGIN_INVALID`: usuario o contraseña incorrectos.
- `503` — `ADMIN_SESSION_NOT_CONFIGURED`: falta `ADMIN_SESSION_SECRET` en el servidor.

### `POST /v1/admin/logout`

Elimina la cookie de sesión. Respuesta: `{ "success": true, "message": "Sesión cerrada correctamente." }`.

### `GET /v1/admin/session`

Comprueba si la sesión actual es válida. Respuesta: `{ "success": true, "user": "administrador" }`.

### `GET /v1/admin/kiosks`

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "kiosks": [
    { "id": "kiosk_a1b2c3d4", "name": "Kiosco Terminal 1", "price_per_page": 2.0, "is_active": 1, "created_at": "...", "last_seen_at": "..." }
  ]
}
```

### `POST /v1/admin/kiosks`

Crea un nuevo kiosco. **El secreto solo se muestra en esta respuesta — no se puede recuperar después.**

**Body:** `{ "name": "Kiosco Terminal 1", "pricePerPage": 2.0 }` (`pricePerPage` opcional, default `0`).

**Respuesta exitosa (`201`):**
```json
{
  "success": true,
  "id": "kiosk_a1b2c3d4",
  "secret": "5f2b...(64 hex chars)...",
  "name": "Kiosco Terminal 1",
  "pricePerPage": 2.0
}
```
El kiosco debe guardar `Bearer kiosk_a1b2c3d4.5f2b...` como su credencial para `POST /v1/kiosk/report`.

**Errores:** `400` si falta `name` o `pricePerPage` es inválido.

### `GET /v1/admin/kpis?from=&to=`

`from`/`to` opcionales, formato `YYYY-MM-DD` o `YYYY-MM-DD HH:MM:SS` (comparados contra `print_jobs.created_at`).

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "totalRevenue": 120.5,
  "totalPages": 60,
  "totalJobs": 20,
  "byKiosk": [
    { "kiosk_id": "kiosk_a1b2c3d4", "name": "Kiosco Terminal 1", "revenue": 80.0, "pages": 40, "jobs": 14 },
    { "kiosk_id": "kiosk_e5f6a7b8", "name": "Kiosco Terminal 2", "revenue": 40.5, "pages": 20, "jobs": 6 }
  ]
}
```

### `GET /v1/admin/consumables`

Último estado reportado por tipo de consumible, por kiosco.

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "consumables": [
    { "kiosk_id": "kiosk_a1b2c3d4", "type": "paper", "status": "ok", "level_percent": 82, "reported_at": "..." },
    { "kiosk_id": "kiosk_a1b2c3d4", "type": "toner_black", "status": "low", "level_percent": null, "reported_at": "..." }
  ]
}
```

**Error común a todos los endpoints protegidos de administración:** `401` con código `ADMIN_AUTH_REQUIRED` si no existe una cookie de sesión válida ni credenciales Basic válidas.

### `GET /v1/admin/pending-prints`

Lista la cola histórica de documentos recibidos por WhatsApp. Nunca expone `filepath` ni el número telefónico completo.

**Query params opcionales:** `status` (`pending`, `downloaded`, `expired`), `pin`, `from`, `to`, `page` (predeterminado: `1`) y `pageSize` (predeterminado: `25`, máximo: `100`). Las fechas usan `YYYY-MM-DD` o `YYYY-MM-DD HH:MM:SS`.

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "items": [{
    "pin": "123456",
    "filename": "tesis.pdf",
    "phone": "5212****7890",
    "created_at": "2026-07-20 10:15:00",
    "downloaded_at": null,
    "file_deleted_at": null,
    "status": "pending",
    "expires_at": "2026-07-20 10:25:00"
  }],
  "pagination": { "page": 1, "pageSize": 25, "total": 1, "totalPages": 1 }
}
```

### `GET /v1/admin/print-jobs`

Historial paginado de trabajos de impresión reportados por los kioscos.

**Query params opcionales:** `kioskId`, `pin`, `from`, `to`, `page`, `pageSize`.

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "items": [{ "id": 7, "kiosk_id": "kiosk_a1b2c3d4", "kiosk_name": "Kiosco Terminal 1", "pin": "123456", "pages": 3, "revenue": 6, "created_at": "..." }],
  "pagination": { "page": 1, "pageSize": 25, "total": 1, "totalPages": 1 }
}
```

### `GET /v1/admin/print-jobs/:id`

Devuelve un trabajo de impresión individual. Responde `400` con `INVALID_PRINT_JOB_ID` si `id` no es un entero positivo, o `404` con `PRINT_JOB_NOT_FOUND` si no existe.

### `GET /v1/admin/kiosks/:id`

Devuelve el detalle de un kiosco, incluido `is_active`. Responde `404` con `KIOSK_NOT_FOUND` si no existe.

### `PATCH /v1/admin/kiosks/:id`

Edita el nombre y/o precio por página de un kiosco; no modifica su secreto.

**Body:**
```json
{ "name": "Kiosco Terminal 1", "pricePerPage": 2.5 }
```

Ambos campos son opcionales, pero debe enviarse al menos uno. Responde el kiosco actualizado.

### `PATCH /v1/admin/kiosks/:id/status`

Activa o desactiva un kiosco sin borrar su historial. Un kiosco inactivo no puede autenticarse para reportar trabajos.

**Body:**
```json
{ "isActive": false }
```

### `GET /v1/admin/kiosks/:id/print-jobs`

Historial paginado de trabajos del kiosco indicado. Admite `pin`, `from`, `to`, `page` y `pageSize`; la respuesta usa el mismo formato que `GET /v1/admin/print-jobs`.

### `GET /v1/admin/kiosks/:id/consumables/history`

Historial paginado de reportes de consumibles para un kiosco.

**Query params opcionales:** `type` (`paper`, `toner_black`, `toner_color`, `toner_cyan`, `toner_magenta`, `toner_yellow`, `drum_unit`), `from`, `to`, `page`, `pageSize`.

**Respuesta exitosa (`200`):**
```json
{
  "success": true,
  "items": [{ "id": 42, "kiosk_id": "kiosk_a1b2c3d4", "type": "paper", "status": "low", "level_percent": 10, "reported_at": "..." }],
  "pagination": { "page": 1, "pageSize": 25, "total": 1, "totalPages": 1 }
}
```

### Errores de filtros y paginación

- `INVALID_PAGINATION` (`400`) — `page` o `pageSize` fuera de rango.
- `INVALID_DATE_RANGE` (`400`) — fecha inválida o rango invertido.
- `INVALID_PENDING_PRINT_STATUS` (`400`) — estado de cola no permitido.
- `INVALID_CONSUMABLE_TYPE` (`400`) — tipo de consumible no permitido.
