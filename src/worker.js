// Processa a fila: busca os dados, chama o Claude, envia ou cria rascunho.
import { config } from './config.js';
import { claimNextJob, finishJob, failJob, addMessage, recentMessages, createDraft } from './db.js';
import { generateReply, BudgetExceededError } from './claude.js';
import { decide } from './policy.js';
import { deliver } from './sender.js';
import * as ml from './channels/mercadolivre.js';

const log = (...a) => console.log(new Date().toISOString(), '[worker]', ...a);

/** Gera a resposta e decide entre enviar direto ou mandar para o painel. */
async function respond({ channel, mode, target, contactName, customerText, context, history }) {
  let result;
  try {
    result = await generateReply({ channel, context, history, customerText });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      createDraft({ channel, target, contactName, customerText, reply: '', reason: err.message });
      return 'draft';
    }
    throw err;
  }

  const verdict = decide({ channel, mode, customerText, result, minConfidence: config.minConfidence });
  if (verdict.send) {
    await deliver(target, result.reply);
    log(`enviado (${channel})`);
    return 'sent';
  }
  createDraft({ channel, target, contactName, customerText, reply: result.reply, reason: verdict.reason });
  log(`rascunho (${channel}): ${verdict.reason}`);
  return 'draft';
}

const handlers = {
  async 'whatsapp:message'(p) {
    const target = { channel: 'whatsapp', to: p.from };
    if (!p.text) {
      createDraft({
        channel: 'whatsapp', target, contactName: p.name,
        customerText: `[${p.type} — a Iris ainda não lê este tipo de mensagem]`,
        reply: 'Recebi sua mensagem! Já já um atendente te responde por aqui.',
        reason: 'mensagem que não é texto',
      });
      return;
    }
    const history = recentMessages('whatsapp', p.from);
    addMessage('whatsapp', p.from, 'in', p.text);
    await respond({
      channel: 'whatsapp', mode: config.whatsapp.mode, target, contactName: p.name,
      customerText: p.text, context: p.name ? `Nome do cliente no WhatsApp: ${p.name}` : '', history,
    });
  },

  async 'mercadolivre:question'(p) {
    const q = await ml.getQuestion(p.resource.split('/').pop());
    if (q.status !== 'UNANSWERED') return; // já respondida, apagada ou banida
    const context = await ml.itemContext(q.item_id);
    await respond({
      channel: 'mercadolivre', mode: config.mercadolivre.mode,
      target: { channel: 'mercadolivre', type: 'question', questionId: q.id },
      contactName: `Pergunta no anúncio ${q.item_id}`, customerText: q.text, context, history: [],
    });
  },

  async 'mercadolivre:ml_message'(p) {
    const m = await ml.getPostSaleMessage(p.resource);
    if (!m.text || !m.packId) return;
    if (m.fromUserId === ml.sellerId()) return; // mensagem enviada por você
    const history = recentMessages('mercadolivre', m.packId);
    addMessage('mercadolivre', m.packId, 'in', m.text);
    await respond({
      channel: 'mercadolivre', mode: config.mercadolivre.mode,
      target: { channel: 'mercadolivre', type: 'message', packId: m.packId, toUserId: m.fromUserId },
      contactName: `Venda ${m.packId}`, customerText: m.text,
      context: 'Mensagem pós-venda de um comprador (já comprou). Limite de 350 caracteres na resposta.', history,
    });
  },
};

export async function processOne() {
  const job = claimNextJob();
  if (!job) return false;
  const handler = handlers[`${job.channel}:${job.kind}`];
  try {
    if (!handler) throw new Error(`Sem handler para ${job.channel}:${job.kind}`);
    await handler(job.payload);
    finishJob(job.id);
  } catch (err) {
    log(`erro no job ${job.id} (tentativa ${job.attempts}):`, err.message);
    failJob(job.id, err.message, job.attempts);
  }
  return true;
}

/** Loop simples: verifica a fila a cada 2 segundos. */
export function startWorker(intervalMs = 2000) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      while (await processOne()) { /* esvazia a fila */ }
    } finally {
      busy = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
