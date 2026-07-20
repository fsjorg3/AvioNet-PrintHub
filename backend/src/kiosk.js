import { config } from './config.js';
import { getPendingPrint, markAsDownloaded } from './db.js';
import { sendError } from './http.js';

/**
 * Middleware para autorizar al kiosco (Host) usando el VERIFY_TOKEN
 */
export function verifyKioskToken(req, res, next) {
  const token = req.query.token || req.headers['x-verify-token'];
  if (!token || token !== config.verifyToken) {
    console.warn('[KIOSK] ❌ Intento de acceso denegado: token inválido o ausente.');
    return sendError(res, {
      status: 403,
      code: 'KIOSK_TOKEN_INVALID',
      message: 'El token de verificación del kiosco es inválido o no fue enviado.',
    });
  }
  console.log(`[KIOSK] ✅ Token validado correctamente.`);
  next();
}

/**
 * Obtiene el nombre del archivo y metadatos enviando el PIN
 */
export function handleGetFileInfo(req, res) {
  const { pin } = req.query;
  console.log(`[KIOSK] 🔍 Solicitando información para el PIN: ${pin}`);
  
  if (!pin) {
    console.warn(`[KIOSK] ❌ Falta el parámetro "pin".`);
    return sendError(res, {
      status: 400,
      code: 'PIN_REQUIRED',
      message: 'Incluye el parámetro de consulta "pin" para consultar el archivo.',
    });
  }

  const record = getPendingPrint(pin);
  if (!record) {
    console.warn(`[KIOSK] ❌ El PIN ${pin} no fue encontrado o expiró.`);
    return sendError(res, {
      status: 404,
      code: 'PRINT_NOT_AVAILABLE',
      message: 'No existe una impresión disponible para el PIN proporcionado. Puede ser incorrecto o su archivo físico ya expiró.',
      details: { pin },
    });
  }

  console.log(`[KIOSK] ✅ Información encontrada para PIN ${pin}: ${record.filename}`);

  res.json({
    success: true,
    pin: record.pin,
    filename: record.filename,
    phone: record.phone,
    created_at: record.created_at
  });
}

/**
 * Descarga el archivo físico y lo elimina del servidor tras una descarga exitosa
 */
export function handleDownloadFile(req, res) {
  const { pin } = req.query;
  console.log(`[KIOSK] ⬇️ Solicitud de descarga para PIN: ${pin}`);

  if (!pin) {
    console.warn(`[KIOSK] ❌ Falta el parámetro "pin" para descarga.`);
    return sendError(res, {
      status: 400,
      code: 'PIN_REQUIRED',
      message: 'Incluye el parámetro de consulta "pin" para descargar el archivo.',
    });
  }

  const record = getPendingPrint(pin);
  if (!record) {
    console.warn(`[KIOSK] ❌ No se pudo descargar. PIN ${pin} no existe.`);
    return sendError(res, {
      status: 404,
      code: 'PRINT_FILE_NOT_FOUND',
      message: 'No existe un archivo disponible para el PIN proporcionado.',
      details: { pin },
    });
  }

  console.log(`[KIOSK] 📦 Enviando archivo ${record.filename} al cliente...`);

  res.download(record.filepath, record.filename, (err) => {
    if (err) {
      console.error(`[KIOSK] ❌ Error al enviar el archivo para el PIN ${pin}:`, err);
      if (!res.headersSent) {
        sendError(res, {
          status: 500,
          code: 'FILE_DOWNLOAD_FAILED',
          message: 'No se pudo transmitir el archivo al kiosco. Revisa si el archivo aún existe en el servidor.',
          details: { pin },
        });
      }
    } else {
      console.log(`[KIOSK] ✅ Descarga exitosa del PIN ${pin}. El archivo persiste 5 minutos para reintentos.`);
      markAsDownloaded(pin);
    }
  });
}
