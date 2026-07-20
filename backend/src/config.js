import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 10000,
  verifyToken: process.env.VERIFY_TOKEN,
  appSecret: process.env.APP_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  phoneNumberId: process.env.PHONE_NUMBER_ID,
  apiVersion: process.env.API_VERSION || 'v20.0',
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Validar que las variables esenciales existan
export function checkEnv() {
  const required = [
    'ACCESS_TOKEN',
    'VERIFY_TOKEN',
    'PHONE_NUMBER_ID',
    'APP_SECRET',
    'ADMIN_USER',
    'ADMIN_PASSWORD',
    'ADMIN_SESSION_SECRET',
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`⚠️ Advertencia: Faltan variables de entorno: ${missing.join(', ')}`);
  }
}
