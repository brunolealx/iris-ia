// Mapa de tipos de job → função.
import { onWhatsappMessage } from './whatsapp.js';
import { onMlNotification } from './mercadolivre.js';
import { sendFromPanel } from './outbound.js';
import { importOmie, syncStock } from './omie.js';
import { processNfe } from './nfe.js';
import { dispatchWebhook } from './webhooks.js';
import { onMpSubscription } from './billing.js';
import { setupSheet, exportAll, appendRow } from './google.js';

export const handlers = {
  'wa.message': onWhatsappMessage,
  'ml.notification': onMlNotification,
  'outbound.send': sendFromPanel,
  'omie.import': importOmie,
  'omie.stock': syncStock,
  'nfe.process': processNfe,
  'webhook.dispatch': dispatchWebhook,
  'mp.subscription': onMpSubscription,
  'google.setup': setupSheet,
  'google.export': exportAll,
  'google.append': appendRow,
};
