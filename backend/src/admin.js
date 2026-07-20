import crypto from 'crypto';
import { config } from './config.js';
import {
  createKiosk,
  getConsumableHistory,
  getKioskById,
  getKpis,
  getLatestConsumablesByKiosk,
  getPrintJobById,
  listKiosks,
  listPendingPrints,
  listPrintJobs,
  setKioskActive,
  updateKioskConfiguration,
  updateKiosk,
} from './db.js';
import { sendError } from './http.js';
import { validateKioskConfig } from './kiosk-config.js';

const SESSION_COOKIE = 'avionet_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const CONSUMABLE_TYPES = new Set(['paper', 'toner_black', 'toner_color', 'toner_cyan', 'toner_magenta', 'toner_yellow', 'drum_unit']);

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(item => {
    const separator = item.indexOf('=');
    if (separator === -1) return [];
    return [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function cookieOptions() {
  const isProduction = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/v1/admin',
  };
}

function credentialsMatch(user, password) {
  if (!config.adminUser || !config.adminPassword) return false;

  const expectedHash = crypto.createHash('sha256').update(`${config.adminUser}:${config.adminPassword}`).digest();
  const providedHash = crypto.createHash('sha256').update(`${user || ''}:${password || ''}`).digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
}

function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ user, expiresAt: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.adminSessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getSessionUser(req) {
  if (!config.adminSessionSecret) return null;

  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator === -1) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expectedSignature = crypto.createHmac('sha256', config.adminSessionSecret).update(payload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.user && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now() ? session.user : null;
  } catch {
    return null;
  }
}

function basicCredentials(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Basic\s+(.+)$/);
  if (!match) return null;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * Middleware de autenticación del panel de administración (HTTP Basic Auth
 * contra ADMIN_USER / ADMIN_PASSWORD). Comparación con hash + timingSafeEqual
 * para no filtrar información por temporización, igual que verifyKioskSecret en db.js.
 */
export function verifyAdminAuth(req, res, next) {
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    req.adminUser = sessionUser;
    return next();
  }

  const credentials = basicCredentials(req);
  if (credentials && credentialsMatch(credentials.user, credentials.password)) {
    req.adminUser = credentials.user;
    return next();
  }

  if (credentials) {
    console.warn('[ADMIN] ❌ Autenticación de administrador rechazada.');
  }

  return sendError(res, {
    status: 401,
    code: 'ADMIN_AUTH_REQUIRED',
    message: 'Inicia sesión con una cookie de sesión válida o proporciona credenciales Basic válidas.',
  });
}

/**
 * Inicia una sesión administrativa en una cookie firmada y HttpOnly.
 */
export function handleAdminLogin(req, res) {
  const { user, password } = req.body || {};

  if (!config.adminSessionSecret) {
    return sendError(res, {
      status: 503,
      code: 'ADMIN_SESSION_NOT_CONFIGURED',
      message: 'El servidor no tiene configurada la variable ADMIN_SESSION_SECRET.',
    });
  }

  if (!credentialsMatch(user, password)) {
    console.warn('[ADMIN] ❌ Intento de inicio de sesión rechazado.');
    return sendError(res, {
      status: 401,
      code: 'ADMIN_LOGIN_INVALID',
      message: 'El usuario o la contraseña son incorrectos.',
    });
  }

  res.cookie(SESSION_COOKIE, createSession(user), cookieOptions());
  return res.json({ success: true, user, expiresInSeconds: SESSION_TTL_MS / 1000 });
}

export function handleAdminLogout(req, res) {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(SESSION_COOKIE, options);
  return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
}

export function handleGetAdminSession(req, res) {
  return res.json({ success: true, user: req.adminUser });
}

function parsePagination(req, res) {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const pageSize = req.query.pageSize === undefined ? 25 : Number(req.query.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    sendError(res, {
      status: 400,
      code: 'INVALID_PAGINATION',
      message: 'Los parámetros "page" y "pageSize" deben ser enteros; page debe ser ≥ 1 y pageSize debe estar entre 1 y 100.',
      details: { page: req.query.page, pageSize: req.query.pageSize },
    });
    return null;
  }
  return { page, pageSize };
}

function parseDateRange(req, res) {
  const { from, to } = req.query;
  const validDate = value => !value || /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(value);
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
    sendError(res, {
      status: 400,
      code: 'INVALID_DATE_RANGE',
      message: '"from" y "to" deben usar el formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, y "from" no puede ser posterior a "to".',
      details: { from, to },
    });
    return null;
  }
  return { from, to };
}

function paginationResponse({ items, total }, { page, pageSize }) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function maskPhone(phone) {
  if (!phone || phone.length <= 6) return '***';
  return `${phone.slice(0, 4)}${'*'.repeat(Math.max(3, phone.length - 8))}${phone.slice(-4)}`;
}

function getKioskOrError(req, res) {
  const kiosk = getKioskById(req.params.id);
  if (!kiosk) {
    sendError(res, {
      status: 404,
      code: 'KIOSK_NOT_FOUND',
      message: 'No existe un kiosco con el identificador indicado.',
      details: { kioskId: req.params.id },
    });
    return null;
  }
  return kiosk;
}

/**
 * Lista todos los kioscos registrados
 */
export function handleListKiosks(req, res) {
  res.json({ success: true, kiosks: listKiosks() });
}

/**
 * Crea un nuevo kiosco. El secreto solo se retorna en esta respuesta.
 */
export function handleCreateKiosk(req, res) {
  const { name, pricePerPage } = req.body;

  if (!name || typeof name !== 'string') {
    return sendError(res, {
      status: 400,
      code: 'INVALID_KIOSK_NAME',
      message: 'El parámetro "name" es obligatorio y debe ser texto.',
    });
  }

  const price = pricePerPage === undefined ? 0 : Number(pricePerPage);
  if (!Number.isFinite(price) || price < 0) {
    return sendError(res, {
      status: 400,
      code: 'INVALID_KIOSK_PRICE',
      message: 'El parámetro "pricePerPage" debe ser un número mayor o igual a 0.',
      details: { received: pricePerPage },
    });
  }

  const kiosk = createKiosk(name, price);
  res.status(201).json({ success: true, ...kiosk });
}

export function handleGetKiosk(req, res) {
  const kiosk = getKioskOrError(req, res);
  if (kiosk) res.json({ success: true, kiosk });
}

export function handleUpdateKiosk(req, res) {
  const { name, pricePerPage, configuration } = req.body || {};
  if (name === undefined && pricePerPage === undefined && configuration === undefined) {
    return sendError(res, {
      status: 400,
      code: 'KIOSK_UPDATE_EMPTY',
      message: 'Envía al menos uno de los campos editables: "name", "pricePerPage" o "configuration".',
    });
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return sendError(res, { status: 400, code: 'INVALID_KIOSK_NAME', message: 'El campo "name" debe ser texto no vacío.' });
  }
  const price = pricePerPage === undefined ? undefined : Number(pricePerPage);
  if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
    return sendError(res, { status: 400, code: 'INVALID_KIOSK_PRICE', message: 'El campo "pricePerPage" debe ser un número mayor o igual a 0.' });
  }

  let kiosk = updateKiosk(req.params.id, { name: name?.trim(), pricePerPage: price });
  if (!kiosk) return getKioskOrError(req, res);

  if (configuration !== undefined) {
    const parsed = validateKioskConfig(configuration);
    if (!parsed.valid) return sendError(res, { status: 400, code: 'INVALID_KIOSK_CONFIGURATION', message: parsed.message });
    updateKioskConfiguration(req.params.id, parsed.values, { source: 'admin', changedAt: new Date().toISOString() });
    kiosk = getKioskById(req.params.id);
  }

  return res.json({ success: true, kiosk });
}

export function handleSetKioskStatus(req, res) {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    return sendError(res, {
      status: 400,
      code: 'INVALID_KIOSK_STATUS',
      message: 'El campo "isActive" debe ser booleano (true o false).',
    });
  }
  const kiosk = setKioskActive(req.params.id, isActive);
  if (!kiosk) return getKioskOrError(req, res);
  return res.json({ success: true, kiosk });
}

/**
 * Devuelve KPIs agregados de impresión/ingreso, opcionalmente filtrados por rango de fechas
 */
export function handleGetKpis(req, res) {
  const { from, to } = req.query;
  res.json({ success: true, ...getKpis({ from, to }) });
}

/**
 * Devuelve el último estado reportado de consumibles por kiosco
 */
export function handleGetConsumables(req, res) {
  res.json({ success: true, consumables: getLatestConsumablesByKiosk() });
}

export function handleListPrintJobs(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  const dates = parseDateRange(req, res);
  if (!dates) return;
  const { kioskId, pin } = req.query;
  const data = listPrintJobs({ kioskId, pin, ...dates, ...pagination });
  return res.json({ success: true, ...paginationResponse(data, pagination) });
}

export function handleGetPrintJob(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return sendError(res, { status: 400, code: 'INVALID_PRINT_JOB_ID', message: 'El identificador del trabajo debe ser un entero positivo.' });
  }
  const job = getPrintJobById(id);
  if (!job) {
    return sendError(res, { status: 404, code: 'PRINT_JOB_NOT_FOUND', message: 'No existe un trabajo de impresión con el identificador indicado.', details: { id } });
  }
  return res.json({ success: true, job });
}

export function handleListPendingPrints(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  const dates = parseDateRange(req, res);
  if (!dates) return;
  const { status, pin } = req.query;
  if (status && !['pending', 'downloaded', 'expired'].includes(status)) {
    return sendError(res, {
      status: 400,
      code: 'INVALID_PENDING_PRINT_STATUS',
      message: 'El filtro "status" debe ser pending, downloaded o expired.',
      details: { status },
    });
  }

  const data = listPendingPrints({ status, pin, ...dates, ...pagination });
  const items = data.items.map(item => ({ ...item, phone: maskPhone(item.phone) }));
  return res.json({ success: true, ...paginationResponse({ ...data, items }, pagination) });
}

export function handleGetKioskPrintJobs(req, res) {
  if (!getKioskOrError(req, res)) return;
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  const dates = parseDateRange(req, res);
  if (!dates) return;
  const data = listPrintJobs({ kioskId: req.params.id, pin: req.query.pin, ...dates, ...pagination });
  return res.json({ success: true, ...paginationResponse(data, pagination) });
}

export function handleGetConsumableHistory(req, res) {
  if (!getKioskOrError(req, res)) return;
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  const dates = parseDateRange(req, res);
  if (!dates) return;
  const { type } = req.query;
  if (type && !CONSUMABLE_TYPES.has(type)) {
    return sendError(res, {
      status: 400,
      code: 'INVALID_CONSUMABLE_TYPE',
      message: 'El filtro "type" no corresponde a un tipo de consumible permitido.',
      details: { type, allowedTypes: [...CONSUMABLE_TYPES] },
    });
  }
  const data = getConsumableHistory({ kioskId: req.params.id, type, ...dates, ...pagination });
  return res.json({ success: true, ...paginationResponse(data, pagination) });
}
