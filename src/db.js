import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve('database.sqlite');
const db = new Database(dbPath);

// Crear la tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_prints (
    pin TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    downloaded_at DATETIME DEFAULT NULL
  )
`);

// Migración: agregar downloaded_at en bases de datos existentes que no la tengan
try {
  db.exec('ALTER TABLE pending_prints ADD COLUMN downloaded_at DATETIME DEFAULT NULL');
  console.log('[DB] 🔧 Migración aplicada: columna downloaded_at agregada.');
} catch {
  // La columna ya existe, no se necesita migración
}

/**
 * Guarda un registro de impresión pendiente
 */
export function savePendingPrint(pin, filename, filepath, phone) {
  console.log(`[DB] 💾 Guardando impresión pendiente -> PIN: ${pin} | Archivo: ${filename}`);
  const stmt = db.prepare('INSERT INTO pending_prints (pin, filename, filepath, phone) VALUES (?, ?, ?, ?)');
  stmt.run(pin, filename, filepath, phone);
}

/**
 * Obtiene un registro por PIN
 */
export function getPendingPrint(pin) {
  const stmt = db.prepare('SELECT * FROM pending_prints WHERE pin = ?');
  return stmt.get(pin);
}

/**
 * Elimina el registro de la base de datos y borra el archivo físico asociado
 */
export function deletePendingPrint(pin) {
  const record = getPendingPrint(pin);
  if (record) {
    try {
      if (fs.existsSync(record.filepath)) {
        fs.unlinkSync(record.filepath);
        console.log(`[DB] 🗑️  Archivo físico eliminado: ${record.filepath}`);
      }
    } catch (err) {
      console.error(`[DB] ❌ Error al eliminar el archivo físico ${record.filepath}:`, err);
    }
    const stmt = db.prepare('DELETE FROM pending_prints WHERE pin = ?');
    stmt.run(pin);
    console.log(`[DB] 🗑️  Registro eliminado de la base de datos para el PIN: ${pin}`);
    return true;
  }
  return false;
}

/**
 * Genera un PIN numérico de 6 dígitos único que no exista en la BD
 */
export function generateUniquePin() {
  let pin;
  let exists = true;
  while (exists) {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
    const stmt = db.prepare('SELECT 1 FROM pending_prints WHERE pin = ?');
    const row = stmt.get(pin);
    if (!row) {
      exists = false;
    }
  }
  console.log(`[DB] 🔑 Nuevo PIN generado: ${pin}`);
  return pin;
}

/**
 * Marca un PIN como descargado. El archivo persiste 5 minutos más para reintentos.
 */
export function markAsDownloaded(pin) {
  const stmt = db.prepare("UPDATE pending_prints SET downloaded_at = datetime('now') WHERE pin = ?");
  const result = stmt.run(pin);
  if (result.changes > 0) {
    console.log(`[DB] ✅ PIN ${pin} marcado como descargado. Expira en 5 minutos.`);
  }
}

/**
 * Tarea programada: elimina registros según la política de expiración:
 * - Sin descarga: expiran a los 10 minutos desde created_at
 * - Con descarga: expiran a los 5 minutos desde downloaded_at
 */
export function cleanupExpiredPrints() {
  try {
    const stmt = db.prepare(`
      SELECT pin FROM pending_prints WHERE
        (downloaded_at IS NULL     AND created_at    <= datetime('now', '-10 minute'))
        OR
        (downloaded_at IS NOT NULL AND downloaded_at <= datetime('now', '-5 minute'))
    `);
    const expiredRecords = stmt.all();

    for (const record of expiredRecords) {
      console.log(`⏱️ PIN ${record.pin} expirado. Eliminando...`);
      deletePendingPrint(record.pin);
    }
  } catch (err) {
    console.error('Error al limpiar archivos caducados:', err);
  }
}
