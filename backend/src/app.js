import express from 'express';
import rateLimit from 'express-rate-limit';
import { config, checkEnv } from './config.js';
import { handleVerification, handleWebhookEvent, verifySignature } from './webhook.js';
import { verifyKioskToken, handleGetFileInfo, handleDownloadFile } from './kiosk.js';
import { verifyKioskReportAuth, handleReportPrint } from './kiosks.js';
import {
  verifyAdminAuth,
  handleAdminLogin,
  handleAdminLogout,
  handleGetAdminSession,
  handleListKiosks,
  handleCreateKiosk,
  handleGetKiosk,
  handleUpdateKiosk,
  handleSetKioskStatus,
  handleGetKpis,
  handleGetConsumables,
  handleGetConsumableHistory,
  handleGetKioskPrintJobs,
  handleGetPrintJob,
  handleListPendingPrints,
  handleListPrintJobs,
} from './admin.js';
import { cleanupExpiredPrints } from './db.js';
import { corsMiddleware } from './cors.js';
import { requestContext, sendError } from './http.js';

const app = express();

// Configuración para proxies inversos (Render, Heroku, Nginx, etc.)
// Necesario para que express-rate-limit lea correctamente las IPs de los usuarios y no lance error.
app.set('trust proxy', 1);

// CORS debe procesarse antes de los limitadores: los preflight OPTIONS no son
// solicitudes de negocio y deben responder sin consumir la cuota de la ruta.
app.use(corsMiddleware);

// --- SISTEMAS DE SEGURIDAD (Rate Limiting) ---

// 1. Limitador para el Webhook (evita inundaciones)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60, // Máximo 60 peticiones por minuto por IP
  message: 'Demasiadas peticiones al Webhook. Intente más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Limitador para el Kiosco (evita ataques de fuerza bruta al PIN de 6 dígitos)
const kioskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30, // Máximo 30 peticiones cada 15 minutos por IP
  message: {
    success: false,
    message: 'Demasiadas peticiones al servicio del Kiosco. Acceso temporalmente bloqueado.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Aplicar limitador a las rutas del kiosco
app.use('/v1/kiosk', kioskLimiter);

// 3. Limitador para el panel de administración
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Máximo 100 peticiones cada 15 minutos por IP
  message: {
    success: false,
    message: 'Demasiadas peticiones al panel de administración. Acceso temporalmente bloqueado.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Aplicar limitador a las rutas de administración
app.use('/v1/admin', adminLimiter);

// --- MIDDLEWARES ---

// Middleware para loggear todas las peticiones en desarrollo
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Parsear cuerpo crudo y validar la firma digital de Meta (solo para el webhook)
app.use('/v1/webhook', express.json({
  verify: verifySignature
}));

// Para el resto de rutas (kiosco, admin), JSON normal sin firma de Meta
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// --- RUTAS DE WEBHOOK (META) ---
app.get('/v1/webhook', webhookLimiter, handleVerification);
app.post('/v1/webhook', webhookLimiter, (req, res, next) => {
  Promise.resolve(handleWebhookEvent(req, res)).catch(next);
});

// --- RUTAS DE KIOSCO (HOST LOCAL) ---

// Obtener nombre del archivo y metadatos enviando el PIN
app.get('/v1/kiosk/file-info', verifyKioskToken, handleGetFileInfo);

// Descargar el archivo físico y eliminarlo del servidor tras una descarga exitosa
app.get('/v1/kiosk/download', verifyKioskToken, handleDownloadFile);

// Reportar un trabajo de impresión completado (páginas, ingreso, consumibles)
app.post('/v1/kiosk/report', verifyKioskReportAuth, handleReportPrint);

// --- RUTAS DE ADMINISTRACIÓN ---

app.post('/v1/admin/login', handleAdminLogin);
app.post('/v1/admin/logout', handleAdminLogout);
app.get('/v1/admin/session', verifyAdminAuth, handleGetAdminSession);
app.get('/v1/admin/kiosks', verifyAdminAuth, handleListKiosks);
app.post('/v1/admin/kiosks', verifyAdminAuth, handleCreateKiosk);
app.get('/v1/admin/pending-prints', verifyAdminAuth, handleListPendingPrints);
app.get('/v1/admin/print-jobs', verifyAdminAuth, handleListPrintJobs);
app.get('/v1/admin/print-jobs/:id', verifyAdminAuth, handleGetPrintJob);
app.get('/v1/admin/kiosks/:id/print-jobs', verifyAdminAuth, handleGetKioskPrintJobs);
app.get('/v1/admin/kiosks/:id/consumables/history', verifyAdminAuth, handleGetConsumableHistory);
app.patch('/v1/admin/kiosks/:id/status', verifyAdminAuth, handleSetKioskStatus);
app.get('/v1/admin/kiosks/:id', verifyAdminAuth, handleGetKiosk);
app.patch('/v1/admin/kiosks/:id', verifyAdminAuth, handleUpdateKiosk);
app.get('/v1/admin/kpis', verifyAdminAuth, handleGetKpis);
app.get('/v1/admin/consumables', verifyAdminAuth, handleGetConsumables);

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => {
  res.json({ status: 'online', service: 'AvioNet PrintHub WhatsApp Bot' });
});

// Todas las rutas no declaradas responden JSON para facilitar el diagnóstico desde el frontend.
app.use((req, res) => sendError(res, {
  status: 404,
  code: 'ROUTE_NOT_FOUND',
  message: 'No existe un endpoint para esta ruta y método HTTP.',
  details: requestContext(req),
}));

// Respuestas homogéneas para errores de parseo, firma y errores no controlados.
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  const code = err.code || (err.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'INTERNAL_ERROR');
  const message = err.message || 'Ocurrió un error interno al procesar la solicitud.';

  console.error(`[API] ${code} en ${req.method} ${req.originalUrl}:`, err);
  return sendError(res, {
    status,
    code,
    message,
    details: requestContext(req),
  });
});

checkEnv();

// Iniciar tarea de limpieza automática (se ejecuta cada 1 minuto)
setInterval(cleanupExpiredPrints, 60 * 1000);

app.listen(config.port, () => {
  console.log(`🚀 Servidor de AvioNet PrintHub escuchando en el puerto ${config.port}`);
});
