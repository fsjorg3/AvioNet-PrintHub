import { config } from './config.js';
import { sendError } from './http.js';

function ipv4ToNumber(address) {
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some(octet => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) return null;
  return octets.reduce((value, octet) => (value * 256) + Number(octet), 0);
}

/**
 * Permite reglas CORS locales con CIDR, por ejemplo:
 * http://192.168.1.0/24:5173
 *
 * No se admite "*": con cookies, el navegador exige que Access-Control-Allow-Origin
 * sea el origen concreto que hizo la solicitud.
 */
function matchesCidrOrigin(origin, rule) {
  const match = rule.match(/^(https?):\/\/(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])(?::(\d{1,5}))?$/i);
  if (!match) return false;

  let requestOrigin;
  try {
    requestOrigin = new URL(origin);
  } catch {
    return false;
  }

  const [, protocol, networkAddress, prefixText, port] = match;
  if (requestOrigin.protocol !== `${protocol.toLowerCase()}:` || requestOrigin.port !== (port || '')) return false;

  const requestAddress = ipv4ToNumber(requestOrigin.hostname);
  const network = ipv4ToNumber(networkAddress);
  if (requestAddress === null || network === null) return false;

  const prefix = Number(prefixText);
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(requestAddress / blockSize) === Math.floor(network / blockSize);
}

export function isAllowedCorsOrigin(origin) {
  return config.corsOrigins.some(rule => rule === origin || matchesCidrOrigin(origin, rule));
}

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // Las llamadas sin Origin (Meta, kioscos, curl) no son solicitudes CORS.
  if (!origin) return next();

  if (!isAllowedCorsOrigin(origin)) {
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
