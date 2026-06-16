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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Guarda un registro de impresión pendiente
 */
export function savePendingPrint(pin, filename, filepath, phone) {
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
        console.log(`Archivo físico eliminado: ${record.filepath}`);
      }
    } catch (err) {
      console.error(`Error al eliminar el archivo físico ${record.filepath}:`, err);
    }
    const stmt = db.prepare('DELETE FROM pending_prints WHERE pin = ?');
    stmt.run(pin);
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
  return pin;
}

/**
 * Tarea programada: Elimina los registros y archivos físicos que tienen más de 10 minutos
 */
export function cleanupExpiredPrints() {
  try {
    // CURRENT_TIMESTAMP es UTC, datetime('now', '-10 minute') compara correctamente
    const stmt = db.prepare("SELECT pin FROM pending_prints WHERE created_at <= datetime('now', '-10 minute')");
    const expiredRecords = stmt.all();
    
    for (const record of expiredRecords) {
      console.log(`⏱️ El documento asociado al PIN ${record.pin} ha expirado (más de 10 min). Eliminando...`);
      deletePendingPrint(record.pin);
    }
  } catch (err) {
    console.error('Error al limpiar archivos caducados:', err);
  }
}
