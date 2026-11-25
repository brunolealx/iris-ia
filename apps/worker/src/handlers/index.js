// Mapa de tipos de job → função.
import { onWhatsappMessage, onWhatsappStatus } from './whatsapp.js';
import { onMlNotification } from './mercadolivre.js';
import { sendFromPanel } from './outbound.js';
import { processNfe } from './nfe.js';
import { emitNfse, cancelNfse } from './nfse.js';
import { dispatchWebhook } from './webhooks.js';
import { onMpSubscription } from './billing.js';
import { setupSheet, exportAll, appendRow } from './google.js';

export const handlers = {
  'wa.message': onWhatsappMessage,
  'wa.status': onWhatsappStatus,
  'ml.notification': onMlNotification,
  'outbound.send': sendFromPanel,
  'nfe.process': processNfe,
  'nfse.emit': emitNfse,
  'nfse.cancel': cancelNfse,
  'webhook.dispatch': dispatchWebhook,
  'mp.subscription': onMpSubscription,
  'google.setup': setupSheet,
  'google.export': exportAll,
  'google.append': appendRow,
};
