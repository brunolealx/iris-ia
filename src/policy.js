// Decide se a resposta pode ser enviada sozinha ou vai para o painel.

// Assuntos que sempre passam por você, mesmo no modo auto.
const SENSITIVE = [
  'reembolso', 'estorno', 'devolu', 'devolver', 'cancel', 'troca', 'trocar',
  'desconto', 'abaixa', 'abaixar o preço', 'mais barato', 'pix', 'boleto', 'pagamento', 'paguei', 'cobrança', 'cobrado',
  'procon', 'reclama', 'processo', 'advogado', 'golpe', 'fraude',
  'defeito', 'quebrad', 'não chegou', 'nao chegou', 'atrasad', 'errado',
];

// Coisas proibidas em respostas do Mercado Livre.
const ML_FORBIDDEN = [
  /https?:\/\//i,
  /www\./i,
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // e-mail
  /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/, // telefone
  /whats\s?app|instagram|facebook|telegram/i,
];

function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function findSensitive(text) {
  const t = normalize(text);
  return SENSITIVE.filter((w) => t.includes(normalize(w)));
}

/**
 * @returns {{ send: boolean, reason: string }}
 */
export function decide({ channel, mode, customerText, result, minConfidence }) {
  const reasons = [];

  if (channel === 'mercadolivre' && ML_FORBIDDEN.some((re) => re.test(result.reply))) {
    reasons.push('resposta contém contato/link (proibido no ML)');
  }
  if (result.needsHuman) reasons.push(result.reason ? `IA pediu humano: ${result.reason}` : 'IA pediu humano');
  if (result.confidence < minConfidence) reasons.push(`confiança baixa (${result.confidence.toFixed(2)})`);
  const hits = findSensitive(customerText);
  if (hits.length) reasons.push(`assunto sensível: ${hits.slice(0, 3).join(', ')}`);
  if (mode !== 'auto') reasons.push('modo sugestão');

  return { send: reasons.length === 0, reason: reasons.join('; ') };
}
