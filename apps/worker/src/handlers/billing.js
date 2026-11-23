// Assinaturas pelo Mercado Pago: ativa, pausa ou cancela o plano do cliente.
import { db, eq } from '../db.js';
import { forgetOrg } from '../tenants.js';
import * as mp from '../channels/mercadopago.js';

export async function onMpSubscription({ id }) {
  const pre = await mp.getPreapproval(id);
  // external_reference = "<org_id>:<plan_id>" (definido no checkout do painel)
  const [orgId, planId] = String(pre.external_reference || '').split(':');
  if (!orgId || !planId) return;
  const plan = await db.one('plans', { id: eq(planId), select: 'price_cents' });
  if (!plan || Math.round(Number(pre.auto_recurring?.transaction_amount || 0) * 100) < plan.price_cents) {
    console.warn('[billing] valor da assinatura não confere com o plano', pre.id);
    return;
  }
  const status = mp.statusFromPreapproval(pre.status);
  if (!status) return;
  const patch = { status, mp_preapproval_id: pre.id };
  if (status === 'active') patch.plan_id = planId;
  if (status === 'canceled') patch.plan_id = 'gratis';
  await db.update('organizations', { id: eq(orgId) }, patch);
  forgetOrg(orgId);
}
