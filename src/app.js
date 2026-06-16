import express from 'express';
import rateLimit from 'express-rate-limit';
import { config, checkEnv } from './config.js';
import { handleVerification, handleWebhookEvent, verifySignature } from './webhook.js';
import { verifyKioskToken, handleGetFileInfo, handleDownloadFile } from './kiosk.js';
import { cleanupExpiredPrints } from './db.js';

const app = express();

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

// --- MIDDLEWARES ---

// Parsear cuerpo crudo para validar la firma digital de Meta (solo para el webhook)
app.use(express.json({
  verify: verifySignature
}));

app.use(express.urlencoded({ extended: true }));

// --- RUTAS DE WEBHOOK (META) ---
app.get('/v1/webhook', webhookLimiter, handleVerification);
app.post('/v1/webhook', webhookLimiter, handleWebhookEvent);

// --- RUTAS DE KIOSCO (HOST LOCAL) ---

// Obtener nombre del archivo y metadatos enviando el PIN
app.get('/v1/kiosk/file-info', verifyKioskToken, handleGetFileInfo);

// Descargar el archivo físico y eliminarlo del servidor tras una descarga exitosa
app.get('/v1/kiosk/download', verifyKioskToken, handleDownloadFile);

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => {
  res.json({ status: 'online', service: 'AvioNet PrintHub WhatsApp Bot' });
});

checkEnv();

// Iniciar tarea de limpieza automática (se ejecuta cada 1 minuto)
setInterval(cleanupExpiredPrints, 60 * 1000);

app.listen(config.port, () => {
  console.log(`🚀 Servidor de AvioNet PrintHub escuchando en el puerto ${config.port}`);
});


