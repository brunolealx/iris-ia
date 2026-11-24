// Regras de plano usadas pelo painel e pelo worker.
// Os valores oficiais ficam na tabela "plans" do banco; isto é só a lógica.

export function isActive(org, now = new Date()) {
  if (org.status === 'active') return true;
  if (org.status === 'trial') return new Date(org.trial_ends_at) > now;
  return false;
}

export function hasFeature(plan, feature) {
  return Array.isArray(plan?.features) && plan.features.includes(feature);
}

/** Retorna null se pode usar a IA, ou o motivo do bloqueio. */
export function aiBlockReason(org, plan, usedThisMonth) {
  if (!isActive(org)) return org.status === 'trial' ? 'teste grátis encerrado' : `assinatura ${org.status}`;
  if (usedThisMonth >= plan.ai_replies_month) return `limite de ${plan.ai_replies_month} respostas da IA do plano ${plan.name} atingido`;
  return null;
}

export const brl = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
