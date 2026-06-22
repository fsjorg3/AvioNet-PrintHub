import { config } from './config.js';
import { getPendingPrint, deletePendingPrint, markAsDownloaded } from './db.js';

/**
 * Middleware para autorizar al kiosco (Host) usando el VERIFY_TOKEN
 */
export function verifyKioskToken(req, res, next) {
  const token = req.query.token || req.headers['x-verify-token'];
  if (!token || token !== config.verifyToken) {
    console.warn(`[KIOSK] ❌ Intento de acceso denegado. Token proporcionado: ${token}`);
    return res.status(403).json({ 
      success: false, 
      message: 'Acceso prohibido: Token de verificación inválido o ausente.' 
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
    return res.status(400).json({ success: false, message: 'Parámetro "pin" es requerido.' });
  }

  const record = getPendingPrint(pin);
  if (!record) {
    console.warn(`[KIOSK] ❌ El PIN ${pin} no fue encontrado o expiró.`);
    return res.status(404).json({ success: false, message: 'El PIN proporcionado no existe o ya expiró.' });
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
    return res.status(400).json({ success: false, message: 'Parámetro "pin" es requerido.' });
  }

  const record = getPendingPrint(pin);
  if (!record) {
    console.warn(`[KIOSK] ❌ No se pudo descargar. PIN ${pin} no existe.`);
    return res.status(404).json({ success: false, message: 'No se encontró archivo asociado a este PIN.' });
  }

  console.log(`[KIOSK] 📦 Enviando archivo ${record.filename} al cliente...`);

  res.download(record.filepath, record.filename, (err) => {
    if (err) {
      console.error(`[KIOSK] ❌ Error al enviar el archivo para el PIN ${pin}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error interno al descargar el archivo.' });
      }
    } else {
      console.log(`[KIOSK] ✅ Descarga exitosa del PIN ${pin}. El archivo persiste 5 minutos para reintentos.`);
      markAsDownloaded(pin);
    }
  });
}
