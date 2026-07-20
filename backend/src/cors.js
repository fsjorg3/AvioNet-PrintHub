import { config } from './config.js';
import { sendError } from './http.js';

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // Las llamadas sin Origin (Meta, kioscos, curl) no son solicitudes CORS.
  if (!origin) return next();

  if (!config.corsOrigins.includes(origin)) {
    return sendError(res, {
      status: 403,
      code: 'CORS_ORIGIN_DENIED',
      message: 'El origen de esta solicitud no está autorizado para consumir la API.',
      details: { origin },
    });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Verify-Token,Idempotency-Key');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}
