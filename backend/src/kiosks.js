import { getPendingPrint, verifyKioskSecret, touchKioskLastSeen, insertPrintJob, insertConsumableReports } from './db.js';
import { sendError } from './http.js';

const CONSUMABLE_TYPES = new Set([
  'paper',
  'toner_black',
  'toner_color',
  'toner_cyan',
  'toner_magenta',
  'toner_yellow',
  'drum_unit',
]);

const CONSUMABLE_STATUSES = new Set(['ok', 'low', 'critical', 'empty', 'unknown']);

/**
 * Middleware de autenticación por kiosco individual.
 * Header esperado: Authorization: Bearer <kiosk_id>.<secret>
 */
export function verifyKioskReportAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer\s+(.+)$/);
  const token = match ? match[1] : null;
  const [kioskId, secret] = token ? token.split('.') : [null, null];

  if (!kioskId || !secret || !verifyKioskSecret(kioskId, secret)) {
    console.warn('[KIOSKS] ❌ Autenticación de kiosco rechazada.');
    return sendError(res, {
      status: 403,
      code: 'KIOSK_CREDENTIALS_INVALID',
      message: 'La credencial del kiosco es inválida, está incompleta o no fue enviada.',
    });
  }

  req.kioskId = kioskId;
  touchKioskLastSeen(kioskId);
  next();
}

function validateConsumables(consumables) {
  if (consumables === undefined) return { valid: true, items: [] };
  if (!Array.isArray(consumables)) return { valid: false };

  for (const item of consumables) {
    if (!item || typeof item !== 'object') return { valid: false };
    if (!CONSUMABLE_TYPES.has(item.type)) return { valid: false };
    if (!CONSUMABLE_STATUSES.has(item.status)) return { valid: false };
    if (item.level_percent !== undefined && item.level_percent !== null) {
      const level = Number(item.level_percent);
      if (!Number.isFinite(level) || level < 0 || level > 100) return { valid: false };
    }
  }

  return { valid: true, items: consumables };
}

/**
 * Reporta un trabajo de impresión completado: páginas, ingreso y estado de consumibles.
 */
export function handleReportPrint(req, res) {
  const { pin, pages, revenue, consumables, idempotency_key: idempotencyKey } = req.body;
  const kioskId = req.kioskId;

  const pagesInt = Number(pages);
  if (!Number.isInteger(pagesInt) || pagesInt <= 0) {
    return sendError(res, {
      status: 400,
      code: 'INVALID_PRINT_PAGES',
      message: 'El parámetro "pages" debe ser un entero mayor a 0.',
      details: { received: pages },
    });
  }

  const revenueNum = Number(revenue);
  if (!Number.isFinite(revenueNum) || revenueNum < 0) {
    return sendError(res, {
      status: 400,
      code: 'INVALID_PRINT_REVENUE',
      message: 'El parámetro "revenue" debe ser un número mayor o igual a 0.',
      details: { received: revenue },
    });
  }

  if (pin) {
    const record = getPendingPrint(pin);
    if (!record) {
      return sendError(res, {
        status: 400,
        code: 'PRINT_PIN_UNKNOWN',
        message: 'El PIN indicado no existe en el historial de impresiones.',
        details: { pin },
      });
    }
  }

  const { valid, items } = validateConsumables(consumables);
  if (!valid) {
    return sendError(res, {
      status: 400,
      code: 'INVALID_CONSUMABLES',
      message: 'El parámetro "consumables" es inválido. Cada elemento requiere "type" y "status" con valores permitidos.',
    });
  }

  insertPrintJob({ kioskId, pin: pin || null, pages: pagesInt, revenue: revenueNum, idempotencyKey });
  if (items.length > 0) {
    insertConsumableReports(kioskId, items);
  }

  console.log(`[KIOSKS] ✅ Trabajo de impresión reportado por kiosco ${kioskId}: ${pagesInt} página(s), ingreso ${revenueNum}`);
  res.json({ success: true });
}
