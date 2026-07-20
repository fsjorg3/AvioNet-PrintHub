# AvioNet PrintHub — Contrato de API (Kiosco)

**Versión:** 1.0  
**URL base (desarrollo/staging):** `https://avionet-printhub.onrender.com`  
**Protocolo:** HTTPS  
**Formato de respuesta:** `application/json` (excepto en la descarga de archivo)

---

## Autenticación

Todos los endpoints bajo `/v1/kiosk/` requieren un token de verificación compartido.  
Se puede enviar de dos formas (elegir una):

| Método | Ejemplo |
|--------|---------|
| Query param | `?token=TU_VERIFY_TOKEN` |
| Header HTTP | `x-verify-token: TU_VERIFY_TOKEN` |

Si el token es inválido o está ausente, se devuelve `403 Forbidden`.

---

## Rate Limiting

Los endpoints del kiosco tienen un límite de **30 peticiones por cada 15 minutos** por IP.  
Al superarlo se devuelve `429 Too Many Requests` con el siguiente cuerpo:

```json
{
  "success": false,
  "message": "Demasiadas peticiones al servicio del Kiosco. Acceso temporalmente bloqueado."
}
```

Los headers `RateLimit-*` estándar vienen incluidos en cada respuesta.

---

## Endpoints

### 1. Health Check

Verifica que el servidor esté activo. No requiere autenticación.

```
GET /health
```

**Respuesta `200 OK`**
```json
{
  "status": "online",
  "service": "AvioNet PrintHub WhatsApp Bot"
}
```

---

### 2. Consultar información del archivo

Valida el PIN y devuelve los metadatos del documento antes de descargarlo.  
Usar este endpoint primero para mostrar una vista previa al usuario del kiosco.

```
GET /v1/kiosk/file-info?pin={PIN}&token={TOKEN}
```

**Parámetros de query**

| Parámetro | Tipo   | Requerido | Descripción              |
|-----------|--------|-----------|--------------------------|
| `pin`     | string | Sí        | PIN de 6 dígitos         |
| `token`   | string | Sí*       | Token de verificación    |

*O bien enviar `x-verify-token` en el header.

**Respuesta `200 OK`**
```json
{
  "success": true,
  "pin": "482931",
  "filename": "mi_documento.pdf",
  "phone": "521234567890",
  "created_at": "2026-06-21T18:45:00.000Z"
}
```

| Campo        | Tipo   | Descripción                                      |
|--------------|--------|--------------------------------------------------|
| `pin`        | string | El mismo PIN consultado                          |
| `filename`   | string | Nombre original del archivo                      |
| `phone`      | string | Número de WhatsApp del remitente                 |
| `created_at` | string | Timestamp ISO 8601 de cuando se recibió el archivo |

**Respuestas de error**

| Código | Condición                              | Cuerpo                                                                     |
|--------|----------------------------------------|----------------------------------------------------------------------------|
| `400`  | Falta el parámetro `pin`              | `{ "success": false, "message": "Parámetro \"pin\" es requerido." }`       |
| `403`  | Token inválido o ausente              | `{ "success": false, "message": "Acceso prohibido: Token de verificación inválido o ausente." }` |
| `404`  | PIN no existe o ya expiró             | `{ "success": false, "message": "El PIN proporcionado no existe o ya expiró." }` |
| `429`  | Rate limit superado                   | *(ver sección Rate Limiting)*                                              |

---

### 3. Descargar archivo

Descarga el archivo físico asociado al PIN. **El archivo se elimina automáticamente del servidor tras una descarga exitosa.** Esta operación es destructiva e irreversible.

```
GET /v1/kiosk/download?pin={PIN}&token={TOKEN}
```

**Parámetros de query**

| Parámetro | Tipo   | Requerido | Descripción              |
|-----------|--------|-----------|--------------------------|
| `pin`     | string | Sí        | PIN de 6 dígitos         |
| `token`   | string | Sí*       | Token de verificación    |

*O bien enviar `x-verify-token` en el header.

**Respuesta `200 OK`**

El cuerpo de la respuesta es el archivo binario. Los headers relevantes son:

| Header                 | Valor de ejemplo                          |
|------------------------|-------------------------------------------|
| `Content-Type`         | `application/pdf` / `application/msword`  |
| `Content-Disposition`  | `attachment; filename="mi_documento.pdf"` |

**Respuestas de error**

| Código | Condición                              | Cuerpo                                                                          |
|--------|----------------------------------------|---------------------------------------------------------------------------------|
| `400`  | Falta el parámetro `pin`              | `{ "success": false, "message": "Parámetro \"pin\" es requerido." }`            |
| `403`  | Token inválido o ausente              | `{ "success": false, "message": "Acceso prohibido: Token de verificación inválido o ausente." }` |
| `404`  | PIN no existe o ya expiró             | `{ "success": false, "message": "No se encontró archivo asociado a este PIN." }` |
| `500`  | Error interno al leer el archivo      | `{ "success": false, "message": "Error interno al descargar el archivo." }`     |
| `429`  | Rate limit superado                   | *(ver sección Rate Limiting)*                                                   |

---

## Flujo recomendado para el kiosco

```
┌─────────────────────────────────────────────────────────────┐
│  1. Usuario ingresa el PIN en el kiosco                     │
│                                                             │
│  2. GET /v1/kiosk/file-info?pin=XXXXXX&token=...           │
│     ├── 404 → "PIN inválido o expirado", volver al paso 1  │
│     └── 200 → mostrar nombre del archivo y pedir confirmar │
│                                                             │
│  3. Usuario confirma que el archivo es el correcto          │
│                                                             │
│  4. GET /v1/kiosk/download?pin=XXXXXX&token=...            │
│     ├── 404 → el archivo expiró entre paso 2 y 4           │
│     ├── 500 → error de servidor, reintentar una vez        │
│     └── 200 → guardar archivo y enviar a impresión         │
└─────────────────────────────────────────────────────────────┘
```

> **Política de expiración:**
> - Si el archivo **no se descarga**: se elimina a los **10 minutos** desde que el usuario lo envió por WhatsApp.
> - Si el archivo **se descarga con éxito**: permanece disponible **5 minutos más** para reintentos ante fallos de red u otros problemas. Pasado ese tiempo se elimina definitivamente.
>
> Esto significa que el endpoint `/download` puede llamarse más de una vez con el mismo PIN dentro de la ventana de 5 minutos post-descarga.

---

## Consideraciones de implementación

- **Expiración sin descarga:** Los archivos expiran a los **10 minutos** desde `created_at`. Usar ese campo para mostrar un contador de tiempo restante al usuario antes de que ingrese el PIN.
- **Ventana de reintento post-descarga:** Tras una descarga exitosa el archivo persiste **5 minutos más**. El kiosco puede reintentar `/download` con el mismo PIN durante ese periodo si la transferencia falla o la impresión no se completa.
- **Timeout recomendado:** Configurar al menos 30 segundos de timeout en la descarga para archivos grandes.
- **Reintento seguro:** Si `/download` retorna `404`, el archivo ya expiró definitivamente y no puede recuperarse.
