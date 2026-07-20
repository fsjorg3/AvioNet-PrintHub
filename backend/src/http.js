/**
 * Formato común para respuestas de error públicas de la API.
 */
export function sendError(res, {
  status = 500,
  code = 'INTERNAL_ERROR',
  message = 'Ocurrió un error interno.',
  details,
} = {}) {
  const error = { code, message };
  if (details !== undefined) error.details = details;

  return res.status(status).json({ success: false, error });
}

export function requestContext(req) {
  return { method: req.method, path: req.originalUrl };
}
