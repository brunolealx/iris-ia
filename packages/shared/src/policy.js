// Decide se a resposta da IA pode sair sozinha ou vai para aprovação.

// Assuntos que sempre passam por um humano, mesmo no modo automático.
export const SENSITIVE = [
  'reembolso', 'estorno', 'devolu', 'devolver', 'cancel', 'troca', 'trocar',
  'desconto', 'abaixar o preco', 'mais barato', 'pagamento', 'paguei', 'cobranca', 'cobrado',
  'procon', 'reclama', 'processo', 'advogado', 'golpe', 'fraude',
  'defeito', 'quebrad', 'nao chegou', 'atrasad', 'errado', 'nota fiscal',
];

// Proibido em respostas do Mercado Livre (contato fora da plataforma).
const ML_FORBIDDEN = [
  /https?:\/\//i,
  /www\./i,
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/,
  /\(?\b\d{2}\)?\s?9\d{4}[-\s]?\d{4}\b/,
  /whats\s?app|zap\b|instagram|facebook|telegram/i,
];

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function findSensitive(text) {
  const t = normalize(text);
  return SENSITIVE.filter((w) => t.includes(w));
}

/**
 * @param {{channel:'whatsapp'|'mercadolivre', mode:'suggest'|'auto'|'off', customerText:string,
 *          result:{reply:string, confidence:number, needsHuman:boolean, reason?:string}, minConfidence:number}} p
 * @returns {{ send: boolean, reason: string }}
 */
export function decide({ channel, mode, customerText, result, minConfidence }) {
  const reasons = [];
  if (channel === 'mercadolivre' && ML_FORBIDDEN.some((re) => re.test(result.reply))) {
    reasons.push('resposta contém contato ou link (proibido no ML)');
  }
  if (result.needsHuman) reasons.push(result.reason ? `IA pediu humano: ${result.reason}` : 'IA pediu humano');
  if (result.confidence < minConfidence) reasons.push(`confiança baixa (${result.confidence.toFixed(2)})`);
  const hits = findSensitive(customerText);
  if (hits.length) reasons.push(`assunto sensível: ${hits.slice(0, 3).join(', ')}`);
  if (mode !== 'auto') reasons.push('modo sugestão');
  return { send: reasons.length === 0, reason: reasons.join('; ') };
}
