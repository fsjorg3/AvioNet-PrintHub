# AGENTS.md

Este archivo proporciona orientación a Codex (Codex.ai/code) cuando trabaja con el código de este repositorio.

## Qué es este proyecto

AvioNet-PrintHub es un monorepo cuyo backend es una API de Express para Node.js (ES Modules) que conecta a usuarios de WhatsApp con un kiosco de autoservicio de impresión. Los usuarios envían documentos por WhatsApp, el servicio los almacena y devuelve un PIN de 6 dígitos; después, el kiosco recupera el archivo utilizando ese PIN.

## Comandos

```bash
cd backend
npm install          # instala las dependencias del backend
npm start            # producción: node src/app.js
npm run dev          # desarrollo: node --watch src/app.js (recarga automática al cambiar archivos)
```

No hay un ejecutor de pruebas configurado. No se requiere una etapa de compilación.

## Entorno

Copia `backend/.env.sample` a `backend/.env` y completa las credenciales de Meta/WhatsApp. Variables requeridas:

- `ACCESS_TOKEN` — token de la API Cloud de WhatsApp de Meta
- `VERIFY_TOKEN` — secreto compartido utilizado tanto para el handshake del webhook como para la autenticación del kiosco
- `PHONE_NUMBER_ID` — identificador del número de teléfono de WhatsApp en Meta
- `APP_SECRET` — secreto de la aplicación de Meta para verificar firmas HMAC-SHA256
- `API_VERSION` — versión de la API Graph de Meta (por ejemplo, `v20.0`)
- `PORT` — valor predeterminado: 10000
- `ADMIN_USER` / `ADMIN_PASSWORD` — credenciales de HTTP Basic Auth para los endpoints del panel `/v1/admin/*`
- `ADMIN_SESSION_SECRET` — secreto aleatorio utilizado para firmar las cookies de sesión del panel
- `CORS_ORIGIN` — orígenes web autorizados, separados por comas (por ejemplo, `http://localhost:5173,https://panel.onrender.com`)

## Arquitectura

### Flujo de datos

```
Usuario de WhatsApp → Meta → POST /v1/webhook → webhook.js → whatsapp.js (descarga) → db.js (guardado + PIN) → respuesta de WhatsApp
Terminal del kiosco → GET /v1/kiosk/file-info?pin=... → kiosk.js → db.js → metadatos
Terminal del kiosco → GET /v1/kiosk/download?pin=... → kiosk.js → db.js → flujo del archivo + eliminación automática
Dispositivo del kiosco → POST /v1/kiosk/report (Bearer <kiosk_id>.<secret>) → kiosks.js → db.js → trabajo de impresión + registro de consumibles
Administrador → GET/POST /v1/admin/* (Basic Auth) → admin.js → db.js → kioscos, KPIs y consumibles
```

### Responsabilidades de los módulos

| Archivo | Función |
|------|------|
| `backend/src/app.js` | Configuración de Express, limitadores de solicitudes, definición de rutas y tarea de limpieza cada 60 segundos |
| `backend/src/webhook.js` | Handshake de verificación del webhook, comprobación de firma HMAC-SHA256 y procesamiento de eventos de documentos |
| `backend/src/whatsapp.js` | Llamadas HTTP a la API Graph de Meta (envío de mensajes y descarga de archivos multimedia) |
| `backend/src/kiosk.js` | Middleware de autenticación por token y handlers de información/descarga de archivos (flujo de recepción WhatsApp→PIN) |
| `backend/src/kiosks.js` | Autenticación mediante clave de API por kiosco y handler de reportes de trabajos (páginas, ingresos y consumibles) |
| `backend/src/admin.js` | Middleware de HTTP Basic Auth para administradores y handlers de gestión de kioscos y consultas de KPIs/consumibles |
| `backend/src/db.js` | Capa SQLite: tablas `pending_prints`, `kiosks`, `print_jobs` y `kiosk_consumables`; generación de PIN, limpieza de expirados y agregación de KPIs |
| `backend/src/config.js` | Carga de variables de entorno y validación al iniciar |

### Almacenamiento

SQLite (`backend/database.sqlite`, creado automáticamente). Tablas:

- `pending_prints(pin, filename, filepath, phone, created_at, downloaded_at, file_deleted_at)` — flujo de recepción WhatsApp→PIN. Los archivos de `backend/temp_files/` se eliminan automáticamente después de 10 minutos (o 5 minutos después de la descarga) mediante `db.cleanupExpiredPrints`, pero **la fila nunca se elimina**: se conserva permanentemente como registro histórico para que `print_jobs.pin` pueda referenciarla. `file_deleted_at` indica cuándo se eliminó el archivo físico.
- `kiosks(id, name, api_key_hash, price_per_page, created_at, last_seen_at)` — una fila por kiosco físico. `api_key_hash` es un SHA-256 de un secreto aleatorio; el secreto en texto plano solo se muestra una vez al crearlo (`POST /v1/admin/kiosks`).
- `print_jobs(id, kiosk_id, pin, pages, revenue, idempotency_key, created_at)` — una fila por cada impresión completada, reportada por el propio kiosco. `idempotency_key` (opcional y único por kiosco) evita contabilizar dos veces un reintento.
- `kiosk_consumables(id, kiosk_id, type, status, level_percent, reported_at)` — historial (no sobrescrito) de los niveles de consumibles. El campo que debe utilizarse es `status` (`ok/low/critical/empty/unknown`); `level_percent` es opcional y con frecuencia no está disponible, según el soporte SNMP de la impresora.

### Capas de seguridad

1. **Webhook**: la firma HMAC-SHA256 se verifica contra `APP_SECRET` antes de cualquier procesamiento (la solicitud se rechaza inmediatamente si falta la cabecera de firma).
2. **Endpoints de recogida del kiosco** (`/v1/kiosk/file-info`, `/v1/kiosk/download`): requieren el `VERIFY_TOKEN` compartido en el parámetro de consulta o en la cabecera `Authorization`.
3. **Endpoint de reportes del kiosco** (`/v1/kiosk/report`): utiliza una credencial individual por kiosco, `Authorization: Bearer <kiosk_id>.<secret>`; el secreto se verifica contra un hash almacenado.
4. **Endpoints administrativos** (`/v1/admin/*`): utilizan HTTP Basic Auth con `ADMIN_USER`/`ADMIN_PASSWORD`.
5. **Limitación de solicitudes**: webhook: 60 solicitudes/minuto; kiosco: 30 solicitudes/15 minutos; administración: 100 solicitudes/15 minutos.

## Particularidades importantes

- **Números telefónicos de México**: Meta envía `+521XXXXXXXXXX` (13 dígitos) para números de México; `webhook.js` elimina el `1` adicional para obtener `+52XXXXXXXXXX` (12 dígitos) antes de utilizar el número como destinatario de la respuesta.
- **Tipos de archivo aceptados**: solo se procesan PDF, DOC y DOCX; los demás tipos reciben una respuesta de error.
- **ES Modules**: todos los archivos utilizan `import`/`export` (`"type": "module"` en `package.json`). No utilices `require()`.
- **Proxy inverso**: `app.set('trust proxy', 1)` está habilitado para despliegues en Render/Heroku donde `X-Forwarded-For` contiene la IP real.
