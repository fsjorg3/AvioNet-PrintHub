import { config } from './config.js';
import { getPendingPrint, deletePendingPrint } from './db.js';

/**
 * Middleware para autorizar al kiosco (Host) usando el VERIFY_TOKEN
 */
export function verifyKioskToken(req, res, next) {
  const token = req.query.token || req.headers['x-verify-token'];
  if (!token || token !== config.verifyToken) {
    return res.status(403).json({ 
      success: false, 
      message: 'Acceso prohibido: Token de verificación inválido o ausente.' 
    });
  }
  next();
}

/**
 * Obtiene el nombre del archivo y metadatos enviando el PIN
 */
export function handleGetFileInfo(req, res) {
  const { pin } = req.query;
  if (!pin) {
    return res.status(400).json({ success: false, message: 'Parámetro "pin" es requerido.' });
  }

  const record = getPendingPrint(pin);
  if (!record) {
    return res.status(404).json({ success: false, message: 'El PIN proporcionado no existe o ya expiró.' });
  }

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
  if (!pin) {
    return res.status(400).json({ success: false, message: 'Parámetro "pin" es requerido.' });
  }

  const record = getPendingPrint(pin);
  if (!record) {
    return res.status(404).json({ success: false, message: 'No se encontró archivo asociado a este PIN.' });
  }

  res.download(record.filepath, record.filename, (err) => {
    if (err) {
      console.error(`Error al enviar el archivo físico para el PIN ${pin}:`, err);
      // Solo responder si los headers de respuesta no se han enviado todavía
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error interno al descargar el archivo.' });
      }
    } else {
      console.log(`Descarga exitosa del PIN ${pin}. Eliminando registro y archivo temporal...`);
      deletePendingPrint(pin);
    }
  });
}
