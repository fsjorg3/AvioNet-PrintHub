import fs from 'fs';
import { config } from './config.js';

/**
 * Envía un payload JSON a la API de WhatsApp Cloud
 */
async function sendToWhatsApp(payload) {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`WhatsApp API Error: ${JSON.stringify(data)}`);
    }
    return data;
  } catch (error) {
    console.error('Error al enviar mensaje a WhatsApp:', error);
    throw error;
  }
}

/**
 * Envía un mensaje de texto simple
 */
export async function sendTextMessage(to, text) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: text }
  };
  return sendToWhatsApp(payload);
}

/**
 * Envía botones interactivos (Respuesta rápida)
 * Máximo 3 botones permitidos por WhatsApp en este formato
 */
export async function sendButtonsMessage(to, bodyText, buttons) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(btn => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title }
        }))
      }
    }
  };
  return sendToWhatsApp(payload);
}

/**
 * Descarga un archivo multimedia desde los servidores de Meta
 */
export async function downloadMediaFile(mediaUrlOrId, destinationPath) {
  let downloadUrl = mediaUrlOrId;
  
  // Si no es una URL completa, asumimos que es el Media ID y obtenemos la URL primero
  if (!mediaUrlOrId.startsWith('http')) {
    const url = `https://graph.facebook.com/${config.apiVersion}/${mediaUrlOrId}`;
    
    // 1. Obtener la URL de descarga
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`
      }
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(`Error al obtener metadatos del medio: ${JSON.stringify(errData)}`);
    }
    
    const mediaData = await res.json();
    downloadUrl = mediaData.url;
    
    if (!downloadUrl) {
      throw new Error(`No se encontró la URL de descarga para el mediaId: ${mediaUrlOrId}`);
    }
  }
  
  // 2. Descargar el archivo binario (usando la URL directa de CDN o la obtenida del paso anterior)
  const fileRes = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${config.accessToken}`
    }
  });
  
  if (!fileRes.ok) {
    throw new Error(`Error al descargar el archivo físico: ${fileRes.statusText}`);
  }
  
  // Guardar el archivo físicamente
  const arrayBuffer = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(destinationPath, buffer);
  
  return true;
}

