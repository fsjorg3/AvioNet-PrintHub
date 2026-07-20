import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

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

// Migración: agregar file_deleted_at (las filas de pending_prints ya no se borran,
// solo se marca cuándo se eliminó el archivo físico, para que print_jobs pueda referenciarlas)
try {
  db.exec('ALTER TABLE pending_prints ADD COLUMN file_deleted_at DATETIME DEFAULT NULL');
  console.log('[DB] 🔧 Migración aplicada: columna file_deleted_at agregada.');
} catch {
  // La columna ya existe, no se necesita migración
}

db.exec(`
  CREATE TABLE IF NOT EXISTS kiosks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  price_per_page REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT NULL
  )
`);

// Migración: permite desactivar kioscos sin perder su historial de trabajos.
try {
  db.exec('ALTER TABLE kiosks ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  console.log('[DB] 🔧 Migración aplicada: columna is_active agregada a kiosks.');
} catch {
  // La columna ya existe, no se necesita migración.
}

db.exec(`
  CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id TEXT NOT NULL REFERENCES kiosks(id),
    pin TEXT DEFAULT NULL REFERENCES pending_prints(pin),
    pages INTEGER NOT NULL,
    revenue REAL NOT NULL,
    idempotency_key TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_idem
    ON print_jobs(kiosk_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS kiosk_consumables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id TEXT NOT NULL REFERENCES kiosks(id),
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    level_percent INTEGER DEFAULT NULL,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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
 * Borra el archivo físico asociado a un PIN y marca la fila como expirada.
 * La fila de pending_prints se conserva de forma permanente como registro
 * histórico, para que print_jobs pueda referenciarla incluso después de
 * que el archivo ya no exista.
 */
export function expirePendingPrintFile(pin) {
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
    const stmt = db.prepare("UPDATE pending_prints SET file_deleted_at = datetime('now') WHERE pin = ?");
    stmt.run(pin);
    console.log(`[DB] 🗑️  Archivo marcado como eliminado para el PIN: ${pin} (registro conservado)`);
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
 * Tarea programada: elimina el archivo físico (no la fila) según la política de expiración:
 * - Sin descarga: expiran a los 10 minutos desde created_at
 * - Con descarga: expiran a los 5 minutos desde downloaded_at
 */
export function cleanupExpiredPrints() {
  try {
    const stmt = db.prepare(`
      SELECT pin FROM pending_prints WHERE
        file_deleted_at IS NULL
        AND (
          (downloaded_at IS NULL     AND created_at    <= datetime('now', '-10 minute'))
          OR
          (downloaded_at IS NOT NULL AND downloaded_at <= datetime('now', '-5 minute'))
        )
    `);
    const expiredRecords = stmt.all();

    for (const record of expiredRecords) {
      console.log(`⏱️ PIN ${record.pin} expirado. Eliminando archivo...`);
      expirePendingPrintFile(record.pin);
    }
  } catch (err) {
    console.error('Error al limpiar archivos caducados:', err);
  }
}

/**
 * Crea un nuevo kiosco con un id público y un secreto generados aleatoriamente.
 * El secreto solo se retorna aquí; en la BD únicamente se guarda su hash.
 */
export function createKiosk(name, pricePerPage) {
  const id = `kiosk_${crypto.randomBytes(4).toString('hex')}`;
  const secret = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(secret).digest('hex');

  const stmt = db.prepare('INSERT INTO kiosks (id, name, api_key_hash, price_per_page) VALUES (?, ?, ?, ?)');
  stmt.run(id, name, apiKeyHash, pricePerPage);
  console.log(`[DB] 🖨️ Kiosco creado: ${id} (${name})`);

  return { id, secret, name, pricePerPage };
}

/**
 * Obtiene un kiosco por su id (sin exponer el hash del secreto)
 */
export function getKioskById(id) {
  const stmt = db.prepare('SELECT id, name, price_per_page, is_active, created_at, last_seen_at FROM kiosks WHERE id = ?');
  return stmt.get(id);
}

/**
 * Lista todos los kioscos (sin exponer el hash del secreto)
 */
export function listKiosks() {
  const stmt = db.prepare('SELECT id, name, price_per_page, is_active, created_at, last_seen_at FROM kiosks ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Verifica el secreto de un kiosco contra el hash almacenado
 */
export function verifyKioskSecret(id, secret) {
  const stmt = db.prepare('SELECT api_key_hash, is_active FROM kiosks WHERE id = ?');
  const row = stmt.get(id);
  if (!row || !row.is_active) return false;

  const providedHash = Buffer.from(crypto.createHash('sha256').update(secret).digest('hex'));
  const storedHash = Buffer.from(row.api_key_hash);
  if (providedHash.length !== storedHash.length) return false;

  return crypto.timingSafeEqual(providedHash, storedHash);
}

/**
 * Actualiza la marca de "última vez visto" de un kiosco
 */
export function touchKioskLastSeen(id) {
  const stmt = db.prepare("UPDATE kiosks SET last_seen_at = datetime('now') WHERE id = ?");
  stmt.run(id);
}

/**
 * Actualiza campos administrativos de un kiosco sin modificar su secreto.
 */
export function updateKiosk(id, { name, pricePerPage }) {
  const fields = [];
  const params = [];
  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }
  if (pricePerPage !== undefined) {
    fields.push('price_per_page = ?');
    params.push(pricePerPage);
  }
  if (!fields.length) return getKioskById(id);

  params.push(id);
  const result = db.prepare(`UPDATE kiosks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return result.changes ? getKioskById(id) : null;
}

/**
 * Activa o desactiva un kiosco. Los kioscos inactivos no pueden reportar trabajos.
 */
export function setKioskActive(id, isActive) {
  const result = db.prepare('UPDATE kiosks SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
  return result.changes ? getKioskById(id) : null;
}

/**
 * Registra un trabajo de impresión completado (páginas + ingreso).
 * Si se envía idempotencyKey y ya existe para ese kiosco, no se duplica.
 */
export function insertPrintJob({ kioskId, pin, pages, revenue, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = db.prepare(
      'SELECT id FROM print_jobs WHERE kiosk_id = ? AND idempotency_key = ?'
    ).get(kioskId, idempotencyKey);
    if (existing) {
      console.log(`[DB] ♻️ Trabajo de impresión duplicado ignorado (idempotency_key: ${idempotencyKey})`);
      return existing.id;
    }
  }

  const stmt = db.prepare(
    'INSERT INTO print_jobs (kiosk_id, pin, pages, revenue, idempotency_key) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(kioskId, pin || null, pages, revenue, idempotencyKey || null);
  console.log(`[DB] 💰 Trabajo de impresión registrado -> Kiosco: ${kioskId} | Páginas: ${pages} | Ingreso: ${revenue}`);
  return result.lastInsertRowid;
}

/**
 * Inserta un reporte de consumibles (una fila por tipo, como log histórico)
 */
export function insertConsumableReports(kioskId, consumables) {
  const stmt = db.prepare(
    'INSERT INTO kiosk_consumables (kiosk_id, type, status, level_percent) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmt.run(kioskId, item.type, item.status, item.level_percent ?? null);
    }
  });
  insertMany(consumables);
  console.log(`[DB] 🧯 Reporte de consumibles registrado para kiosco ${kioskId} (${consumables.length} ítem(s))`);
}

/**
 * Obtiene el último estado reportado de cada consumible, por kiosco
 */
export function getLatestConsumablesByKiosk() {
  // ROW_NUMBER (no MAX+JOIN) para evitar filas duplicadas cuando dos reportes
  // caen dentro del mismo segundo (reported_at con precisión de solo un segundo).
  const stmt = db.prepare(`
    SELECT kiosk_id, type, status, level_percent, reported_at
    FROM (
      SELECT
        kiosk_id, type, status, level_percent, reported_at,
        ROW_NUMBER() OVER (
          PARTITION BY kiosk_id, type
          ORDER BY reported_at DESC, id DESC
        ) AS rn
      FROM kiosk_consumables
    )
    WHERE rn = 1
    ORDER BY kiosk_id, type
  `);
  return stmt.all();
}

function addDateFilters(conditions, params, column, { from, to }) {
  if (from) {
    conditions.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(`${column} <= ?`);
    params.push(to);
  }
}

/**
 * Lista trabajos de impresión con filtros y paginación para el panel.
 */
export function listPrintJobs({ kioskId, pin, from, to, page, pageSize }) {
  const conditions = [];
  const params = [];
  if (kioskId) {
    conditions.push('pj.kiosk_id = ?');
    params.push(kioskId);
  }
  if (pin) {
    conditions.push('pj.pin = ?');
    params.push(pin);
  }
  addDateFilters(conditions, params, 'pj.created_at', { from, to });
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const total = db.prepare(`SELECT COUNT(*) AS total FROM print_jobs pj ${whereClause}`).get(...params).total;
  const items = db.prepare(`
    SELECT pj.id, pj.kiosk_id, k.name AS kiosk_name, pj.pin, pj.pages, pj.revenue, pj.created_at
    FROM print_jobs pj
    JOIN kiosks k ON k.id = pj.kiosk_id
    ${whereClause}
    ORDER BY pj.created_at DESC, pj.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { items, total };
}

export function getPrintJobById(id) {
  return db.prepare(`
    SELECT pj.id, pj.kiosk_id, k.name AS kiosk_name, pj.pin, pj.pages, pj.revenue, pj.created_at
    FROM print_jobs pj
    JOIN kiosks k ON k.id = pj.kiosk_id
    WHERE pj.id = ?
  `).get(id);
}

/**
 * Lista la cola histórica de documentos recibidos por WhatsApp, sin filepath.
 */
export function listPendingPrints({ status, pin, from, to, page, pageSize }) {
  const conditions = [];
  const params = [];
  if (pin) {
    conditions.push('pin = ?');
    params.push(pin);
  }
  if (status === 'pending') conditions.push('downloaded_at IS NULL AND file_deleted_at IS NULL');
  if (status === 'downloaded') conditions.push('downloaded_at IS NOT NULL AND file_deleted_at IS NULL');
  if (status === 'expired') conditions.push('file_deleted_at IS NOT NULL');
  addDateFilters(conditions, params, 'created_at', { from, to });
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const total = db.prepare(`SELECT COUNT(*) AS total FROM pending_prints ${whereClause}`).get(...params).total;
  const items = db.prepare(`
    SELECT
      pin, filename, phone, created_at, downloaded_at, file_deleted_at,
      CASE
        WHEN file_deleted_at IS NOT NULL THEN 'expired'
        WHEN downloaded_at IS NOT NULL THEN 'downloaded'
        ELSE 'pending'
      END AS status,
      CASE
        WHEN file_deleted_at IS NOT NULL THEN NULL
        WHEN downloaded_at IS NOT NULL THEN datetime(downloaded_at, '+5 minute')
        ELSE datetime(created_at, '+10 minute')
      END AS expires_at
    FROM pending_prints
    ${whereClause}
    ORDER BY created_at DESC, pin DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { items, total };
}

/**
 * Historial paginado de consumibles de un kiosco.
 */
export function getConsumableHistory({ kioskId, type, from, to, page, pageSize }) {
  const conditions = ['kiosk_id = ?'];
  const params = [kioskId];
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  addDateFilters(conditions, params, 'reported_at', { from, to });
  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const offset = (page - 1) * pageSize;
  const total = db.prepare(`SELECT COUNT(*) AS total FROM kiosk_consumables ${whereClause}`).get(...params).total;
  const items = db.prepare(`
    SELECT id, kiosk_id, type, status, level_percent, reported_at
    FROM kiosk_consumables
    ${whereClause}
    ORDER BY reported_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  return { items, total };
}

/**
 * Calcula KPIs agregados de impresión/ingreso, opcionalmente filtrados por rango de fechas.
 */
export function getKpis({ from, to } = {}) {
  const conditions = [];
  const params = [];
  if (from) {
    conditions.push('pj.created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('pj.created_at <= ?');
    params.push(to);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const joinExtra = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(pj.revenue), 0) AS totalRevenue,
      COALESCE(SUM(pj.pages), 0) AS totalPages,
      COUNT(*) AS totalJobs
    FROM print_jobs pj
    ${whereClause}
  `).get(...params);

  // El filtro de fecha va en el ON (no en un WHERE posterior) para que los kioscos
  // sin trabajos en el rango sigan apareciendo con revenue/pages/jobs en 0.
  const byKiosk = db.prepare(`
    SELECT
      k.id AS kiosk_id,
      k.name AS name,
      COALESCE(SUM(pj.revenue), 0) AS revenue,
      COALESCE(SUM(pj.pages), 0) AS pages,
      COUNT(pj.id) AS jobs
    FROM kiosks k
    LEFT JOIN print_jobs pj ON pj.kiosk_id = k.id ${joinExtra}
    GROUP BY k.id, k.name
    ORDER BY revenue DESC
  `).all(...params);

  return {
    totalRevenue: totals.totalRevenue,
    totalPages: totals.totalPages,
    totalJobs: totals.totalJobs,
    byKiosk,
  };
}
