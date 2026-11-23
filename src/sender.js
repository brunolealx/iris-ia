// Envia uma resposta para o destino certo (usado pelo worker e pelo painel).
import * as wa from './channels/whatsapp.js';
import * as ml from './channels/mercadolivre.js';
import { addMessage } from './db.js';

/**
 * target:
 *  { channel: 'whatsapp', to }
 *  { channel: 'mercadolivre', type: 'question', questionId }
 *  { channel: 'mercadolivre', type: 'message', packId, toUserId }
 */
export async function deliver(target, text) {
  if (target.channel === 'whatsapp') {
    await wa.sendText(target.to, text);
    addMessage('whatsapp', target.to, 'out', text);
  } else if (target.channel === 'mercadolivre' && target.type === 'question') {
    await ml.answerQuestion(target.questionId, text);
  } else if (target.channel === 'mercadolivre' && target.type === 'message') {
    await ml.sendPostSaleMessage(target.packId, target.toUserId, text);
    addMessage('mercadolivre', target.packId, 'out', text);
  } else {
    throw new Error(`Destino desconhecido: ${JSON.stringify(target)}`);
  }
}
