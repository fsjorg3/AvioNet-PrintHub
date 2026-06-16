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
    console.warn('Falta firma x-hub-signature-256 en cabeceras.');
    return;
  }

  const elements = signature.split('=');
  const signatureHash = elements[1];
  
  const expectedHash = crypto
    .createHmac('sha256', config.appSecret || '')
    .update(buf)
    .digest('hex');

  if (signatureHash !== expectedHash) {
    throw new Error('No se pudo validar la firma de la petición.');
  }
}

// Procesar eventos entrantes
export async function handleWebhookEvent(req, res) {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value) continue;

        // 1. Manejar Mensajes Entrantes
        if (value.messages) {
          for (const message of value.messages) {
            const from = message.from; // Número de teléfono del usuario
            const messageId = message.id;

            console.log(`\n[WEBHOOK] 📩 Nuevo mensaje entrante de: ${from}`);
            console.log(`[WEBHOOK] 📄 Tipo de mensaje: ${message.type}`);

            let isValidDocument = false;
            let doc = null;
            let finalFilename = '';
            
            if (message.type === 'document') {
              doc = message.document;
              const mimeType = doc.mime_type || '';
              const originalFilename = doc.filename || 'documento';
              const ext = path.extname(originalFilename).toLowerCase();
              
              const isPDF = mimeType === 'application/pdf' || ext === '.pdf';
              const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx';
              const isDoc = mimeType === 'application/msword' || ext === '.doc';
              
              if (isPDF || isDocx || isDoc) {
                console.log(`[WEBHOOK] ✅ Formato válido: ${ext} (MIME: ${mimeType})`);
                isValidDocument = true;
                finalFilename = originalFilename;
                if (isPDF && !finalFilename.toLowerCase().endsWith('.pdf')) {
                  finalFilename += '.pdf';
                } else if (isDocx && !finalFilename.toLowerCase().endsWith('.docx')) {
                  finalFilename += '.docx';
                } else if (isDoc && !finalFilename.toLowerCase().endsWith('.doc')) {
                  finalFilename += '.doc';
                }
              } else {
                console.warn(`[WEBHOOK] ⚠️ Formato no válido rechazado: ${ext} (MIME: ${mimeType})`);
              }
            }

            if (isValidDocument) {
              try {
                // Notificar al usuario que estamos procesando el archivo
                await sendTextMessage(from, '⏳ Recibiendo tu documento... Por favor espera un momento mientras generamos tu PIN.');
                
                const pin = generateUniquePin();
                // Limpiar caracteres extraños del nombre de archivo
                const safeFilename = `${pin}_${finalFilename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const filepath = path.join(TEMP_DIR, safeFilename);
                
                // Descargar el archivo físicamente
                await downloadMediaFile(doc.url || doc.id, filepath);
                
                // Guardar en la base de datos
                savePendingPrint(pin, finalFilename, filepath, from);
                
                // Enviar confirmación con el PIN y el aviso de 10 minutos
                await sendTextMessage(from, `✅ ¡Documento recibido con éxito en AvioNet PrintHub! 📄\n\nTu PIN de impresión es: *${pin}*\n\nPreséntalo en la pantalla del kiosco para liberar e imprimir tu archivo.\n\n⚠️ *Aviso:* Si no realizas la impresión en menos de 10 minutos, el archivo será eliminado de forma segura.`);
              } catch (err) {
                console.error('Error al procesar el documento recibido por WhatsApp:', err);
                await sendTextMessage(from, '❌ Ocurrió un error al procesar tu documento. Por favor, intenta enviarlo de nuevo.');
              }
            } else {
              // Cualquier otro tipo de mensaje (texto, imágenes, audios, documentos inválidos)
              await sendTextMessage(from, '❌ Formato no válido.\n\nPara imprimir en nuestro kiosco, debes enviar explícitamente un archivo en formato *PDF (.pdf)* o *Word (.doc, .docx)*.\n\nPuedes intentarlo de nuevo enviando el archivo correcto (no se ha almacenado nada de tu mensaje anterior).\n\n🌐 Si necesitas otros servicios o asistencia, visita nuestra página web: https://www.avionet.com.mx donde nuestro bot asistente te guiará.');
            }
          }
        }

        // 2. Manejar Actualizaciones de Estado
        if (value.statuses) {
          for (const status of value.statuses) {
            console.log(`Estado del mensaje ${status.id}: ${status.status} (usuario: ${status.recipient_id})`);
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
}

