import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 10000,
  verifyToken: process.env.VERIFY_TOKEN,
  appSecret: process.env.APP_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  phoneNumberId: process.env.PHONE_NUMBER_ID,
  apiVersion: process.env.API_VERSION || 'v20.0'
};

// Validar que las variables esenciales existan
export function checkEnv() {
  const required = ['ACCESS_TOKEN', 'VERIFY_TOKEN', 'PHONE_NUMBER_ID'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`⚠️ Advertencia: Faltan variables de entorno: ${missing.join(', ')}`);
  }
}
