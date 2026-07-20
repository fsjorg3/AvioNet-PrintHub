import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { sendTextMessage, sendButtonsMessage, downloadMediaFile } from './whatsapp.js';
import { savePendingPrint, generateUniquePin } from './db.js';

const TEMP_DIR = path.resolve('temp_files');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Verificación del Webhook (Handshake con Meta)
export function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.verifyToken) {
    console.log('✅ Webhook verificado correctamente.');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ Token de verificación inválido.');
    res.sendStatus(403);
  }
}

// Middleware para validar la firma de Meta
export function verifySignature(req, res, buf, encoding) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    const err = new Error('Falta la cabecera X-Hub-Signature-256 requerida para validar el webhook.');
    err.status = 401;
    err.code = 'WEBHOOK_SIGNATURE_MISSING';
    throw err;
  }

  const elements = signature.split('=');
  const signatureHash = elements[1];

  const expectedHash = crypto
    .createHmac('sha256', config.appSecret || '')
    .update(buf)
    .digest('hex');

  if (signatureHash !== expectedHash) {
    const err = new Error('La firma X-Hub-Signature-256 no coincide con el cuerpo recibido.');
    err.status = 401;
    err.code = 'WEBHOOK_SIGNATURE_INVALID';
    throw err;
  }
}

// Tipos de mensaje que Meta envía pero que no requieren respuesta al usuario
const SILENT_MESSAGE_TYPES = new Set(['reaction', 'system', 'unknown', 'unsupported']);

// Texto que envía el QR del kiosco al abrirse la conversación
const QR_GREETING_TEXT = '¡Este es mi documento a imprimir!';

// Procesar eventos entrantes
export async function handleWebhookEvent(req, res) {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value) continue;

        // 1. Actualizaciones de estado (enviado, entregado, leído, fallido)
        if (value.statuses) {
          for (const status of value.statuses) {
            console.log(`[WEBHOOK] 📊 Estado del mensaje ${status.id}: ${status.status} (usuario: ${status.recipient_id})`);
          }
        }

        // 2. Mensajes entrantes
        if (value.messages) {
          for (const message of value.messages) {
            let from = message.from;
            const messageType = message.type;

            // Corrección para México: Si empieza con 521 y tiene 13 dígitos, quitamos el 1.
            if (from.startsWith('521') && from.length === 13) {
              console.log(`[WEBHOOK] 🛠️ Corrigiendo prefijo de México: "${from}" -> "52${from.substring(3)}"`);
              from = '52' + from.substring(3);
            }

            console.log(`\n[WEBHOOK] 📩 Mensaje de: "${from}" | tipo: ${messageType}`);

            // Reacciones, eventos de sistema y tipos desconocidos: ignorar sin responder
            if (SILENT_MESSAGE_TYPES.has(messageType)) {
              console.log(`[WEBHOOK] 🔕 Tipo "${messageType}" ignorado.`);
              continue;
            }

            if (messageType === 'document') {
              await processDocument(message, from);
            } else if (messageType === 'text' && message.text?.body === QR_GREETING_TEXT) {
              // El usuario escaneó el QR del kiosco — orientarlo a enviar su archivo
              console.log(`[WEBHOOK] 📲 Saludo QR detectado de: "${from}"`);
              await sendTextMessage(from, '¡Hola! 👋 Bienvenido a *AvioNet PrintHub*.\n\nPara imprimir tu documento, solo envíalo en este chat en formato *PDF (.pdf)* o *Word (.doc, .docx)* y te generaremos un PIN para recogerlo en el kiosco.');
            } else {
              // Texto libre, imagen, audio, video, sticker, ubicación, contacto, etc.
              console.log(`[WEBHOOK] ℹ️ Tipo "${messageType}" no procesable — enviando instrucciones.`);
              await sendTextMessage(from, 'Para imprimir en nuestro kiosco, envía un archivo en formato *PDF (.pdf)* o *Word (.doc, .docx)*.\n\nNo se ha almacenado nada de tu mensaje anterior.\n\n🌐 Para otros servicios visita: https://www.avionet.com.mx');
            }
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
}

async function processDocument(message, from) {
  const doc = message.document;
  const mimeType = doc.mime_type || '';
  const originalFilename = doc.filename || 'documento';
  const ext = path.extname(originalFilename).toLowerCase();

  const isPDF = mimeType === 'application/pdf' || ext === '.pdf';
  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx';
  const isDoc = mimeType === 'application/msword' || ext === '.doc';

  if (!isPDF && !isDocx && !isDoc) {
    console.warn(`[WEBHOOK] ⚠️ Formato rechazado: ${ext} (MIME: ${mimeType})`);
    await sendTextMessage(from, `El archivo *${originalFilename}* no es compatible.\n\nSolo se aceptan archivos *PDF (.pdf)* o *Word (.doc, .docx)*. Por favor envía el archivo en uno de esos formatos.`);
    return;
  }

  console.log(`[WEBHOOK] ✅ Formato válido: ${ext} (MIME: ${mimeType})`);

  let finalFilename = originalFilename;
  if (isPDF && !finalFilename.toLowerCase().endsWith('.pdf')) finalFilename += '.pdf';
  else if (isDocx && !finalFilename.toLowerCase().endsWith('.docx')) finalFilename += '.docx';
  else if (isDoc && !finalFilename.toLowerCase().endsWith('.doc')) finalFilename += '.doc';

  try {
    await sendTextMessage(from, '⏳ Recibiendo tu documento... Por favor espera un momento mientras generamos tu PIN.');

    const pin = generateUniquePin();
    const safeFilename = `${pin}_${finalFilename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filepath = path.join(TEMP_DIR, safeFilename);

    await downloadMediaFile(doc.url || doc.id, filepath);
    savePendingPrint(pin, finalFilename, filepath, from);

    await sendTextMessage(from, `✅ ¡Documento recibido con éxito en AvioNet PrintHub! 📄\n\nTu PIN de impresión es: *${pin}*\n\nPreséntalo en la pantalla del kiosco para liberar e imprimir tu archivo.\n\n⚠️ *Aviso:* Si no realizas la impresión en menos de 10 minutos, el archivo será eliminado de forma segura.`);
  } catch (err) {
    console.error('[WEBHOOK] Error al procesar documento:', err);
    await sendTextMessage(from, '❌ Ocurrió un error al procesar tu documento. Por favor, intenta enviarlo de nuevo.');
  }
}
