// Logique métier du terminal : enregistrement de carte, premier paiement,
// création de l'abonnement Moneris (Moneris prélève lui-même les versements
// suivants), synchronisation avec Moneris, notifications.
//
// Secrets :
//   MONERIS_CRON_SECRET        protège l'URL de notification (webhook) de Moneris
// Secrets optionnels :
//   MAKE_PAYMENT_WEBHOOK_URL   webhook Make qui crée le reçu QuickBooks
//   SLACK_PAYMENTS_WEBHOOK_URL webhook Slack pour les refus de paiement

import {
  chargeAndStoreCard, validateAndStoreCard, createSubscription, getSubscription, getPayment,
  MonerisResult, CardHolder,
} from './moneris.ts'
import { addInterval, todayMontreal } from './schedule.js'
import { createSalesReceipt, qboEnabled } from './qbo.ts'
import { firstNameCap, lookupTherapistAndSetter } from './ghl.ts'

declare const Deno: { env: { get(key: string): string | undefined } }

// deno-lint-ignore no-explicit-any
type DB = any

export interface Plan {
  id: string; closer_id: string; closer_name: string
  client_first_name: string; client_last_name: string; client_email: string; client_phone: string | null
  product_name: string; total_amount_cents: number; installments_count: number
  status: string; moneris_payment_method_id: string | null; moneris_issuer_id: string | null
  card_last4: string | null
  frequency_unit: 'DAY' | 'WEEK' | 'MONTH'; frequency_interval: number
  customer_reference?: string | null
  therapist_name?: string | null; setter_name?: string | null
  training_addon?: boolean; guarantee_addon?: boolean
  discount_type?: 'percent' | 'amount' | null; discount_value?: number | null
  moneris_subscription_id: string | null; subscription_status: string | null
  client_street_number?: string | null; client_street_name?: string | null; client_unit?: string | null
  client_city?: string | null; client_province?: string | null; client_postal_code?: string | null
}

const holderOf = (p: Plan): CardHolder => ({
  name: `${p.client_first_name} ${p.client_last_name}`.trim(),
  email: p.client_email, phone: p.client_phone,
  streetNumber: p.client_street_number, streetName: p.client_street_name, unit: p.client_unit,
  city: p.client_city, province: p.client_province, postalCode: p.client_postal_code,
})
export interface Installment {
  id: string; plan_id: string; number: number; amount_cents: number; due_date: string
  status: string; attempts: number; moneris_payment_id?: string | null
}

const shortId = (uuid: string) => uuid.replace(/-/g, '').slice(0, 12)
// ID client vu dans le MRC : le nom du client (sinon l'ancien identifiant court)
const custRef = (p: Plan) => p.customer_reference || shortId(p.id)
const orderIdFor = (planId: string, n: number, attempt: number) => `NEO-${shortId(planId)}-${n}-${attempt}`
const clientName = (p: Plan) => `${p.client_first_name} ${p.client_last_name}`.trim()

// ── Notifications ─────────────────────────────────────────────

export async function notifySlack(text: string) {
  const url = Deno.env.get('SLACK_PAYMENTS_WEBHOOK_URL')
  if (!url) { console.log('[Slack désactivé]', text); return }
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  } catch (e) { console.error('[Slack]', e) }
}

// Envoie le paiement réussi à Make, qui crée le reçu de vente QuickBooks
// (produit + champ « closers ») et l'envoie au client.
// Notes du reçu QuickBooks : ajouts et rabais de la vente
function receiptMemo(plan: Plan, inst: Installment): string | null {
  const parts: string[] = []
  if (plan.training_addon) parts.push("Ajout d'un programme d'entraînement")
  if (plan.guarantee_addon) parts.push("Ajout d'une garantie")
  const v = Number(plan.discount_value ?? 0)
  if (v > 0 && plan.discount_type === 'percent') parts.push(`Rabais de ${String(v).replace('.', ',')} %`)
  if (v > 0 && plan.discount_type === 'amount' && inst.number === 1) parts.push(`Rabais de ${v.toFixed(2).replace('.', ',')} $ (avant taxes) sur ce paiement`)
  return parts.length ? parts.join(' · ') : null
}

async function sendToMake(db: DB, plan: Plan, inst: Installment, paymentId: string | undefined, paidDate: string) {
  if (qboEnabled()) {
    // Reçu QuickBooks direct. On « réserve » le versement (sent) avant de créer, pour ne jamais faire deux reçus.
    const { data: claimed } = await db.from('payment_installments')
      .update({ receipt_status: 'sent' }).eq('id', inst.id).in('receipt_status', ['pending', 'failed']).select('id').maybeSingle()
    if (!claimed) return
    try {
      // Thérapeute et setter : lus dans GHL au 1er reçu, puis gardés sur la vente pour les reçus suivants.
      let therapist = plan.therapist_name ?? null, setterName = plan.setter_name ?? null
      if (!therapist || !setterName) {
        const found = await lookupTherapistAndSetter(db, plan.client_email)
        therapist = therapist ?? found.therapist
        setterName = setterName ?? found.setter
        if (therapist !== (plan.therapist_name ?? null) || setterName !== (plan.setter_name ?? null)) {
          await db.from('payment_plans').update({ therapist_name: therapist, setter_name: setterName }).eq('id', plan.id)
        }
      }
      await createSalesReceipt(db, {
        therapistName: therapist, setterName, memo: receiptMemo(plan, inst),
        firstName: plan.client_first_name, lastName: plan.client_last_name, email: plan.client_email, phone: plan.client_phone,
        productName: plan.product_name, closerName: firstNameCap(plan.closer_name) ?? plan.closer_name,
        amountCents: inst.amount_cents, paidDate,
        installmentNumber: inst.number, installmentsCount: plan.installments_count, mutexId: inst.id.slice(0, 8),
      })
    } catch (e) {
      console.error('[QBO]', e)
      await db.from('payment_installments').update({ receipt_status: 'failed' }).eq('id', inst.id)
      await notifySlack(`Reçu QuickBooks non créé (${clientName(plan)}, paiement ${inst.number}/${plan.installments_count}) : ${(e as Error).message}`)
    }
    return
  }
  const url = Deno.env.get('MAKE_PAYMENT_WEBHOOK_URL')
  if (!url) { console.log('[Make désactivé] versement', inst.id); return }
  const payload = {
    event: 'payment_succeeded',
    installment_id: inst.id,
    plan_id: plan.id,
    client_first_name: plan.client_first_name,
    client_last_name: plan.client_last_name,
    client_name: clientName(plan),
    client_email: plan.client_email,
    client_phone: plan.client_phone,
    product_name: plan.product_name,
    closer_name: plan.closer_name,
    amount: inst.amount_cents / 100,
    currency: 'CAD',
    installment_number: inst.number,
    installments_count: plan.installments_count,
    paid_date: paidDate,
    card_last4: plan.card_last4,
    moneris_payment_id: paymentId ?? null,
  }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    await db.from('payment_installments').update({ receipt_status: res.ok ? 'sent' : 'failed' }).eq('id', inst.id)
  } catch (e) {
    console.error('[Make]', e)
    await db.from('payment_installments').update({ receipt_status: 'failed' }).eq('id', inst.id)
  }
}

// ── Verrou du 1er paiement ───────────────────────────────────

async function lockInstallment(db: DB, instId: string): Promise<Installment | null> {
  const { data } = await db.from('payment_installments')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('id', instId)
    .in('status', ['scheduled', 'declined'])
    .select('*')
    .maybeSingle()
  return data ?? null
}

async function markPaid(db: DB, plan: Plan, inst: Installment, paymentId: string | undefined, paidAtIso: string, orderId?: string) {
  await db.from('payment_installments').update({
    status: 'paid', paid_at: paidAtIso,
    moneris_payment_id: paymentId ?? null, ...(orderId ? { moneris_order_id: orderId } : {}),
    error_message: null, next_retry_date: null,
  }).eq('id', inst.id)

  const { count } = await db.from('payment_installments')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', plan.id).neq('status', 'paid').neq('status', 'canceled')
  if (count === 0) {
    await db.from('payment_plans').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', plan.id)
  }
  await sendToMake(db, plan, inst, paymentId, todayMontreal(new Date(paidAtIso)))
}

// ── Abonnement Moneris pour les versements restants ───────────

// Le pare-feu de Moneris bloque (403 « The request is blocked ») les abonnements qui contiennent
// cette URL de rappel. Désactivée par défaut : la synchro quotidienne (pg_cron) suffit.
// Mettre MONERIS_CALLBACK=on pour la réactiver.
function webhookUrl(): string | undefined {
  if (Deno.env.get('MONERIS_CALLBACK') !== 'on') return undefined
  const base = Deno.env.get('SUPABASE_URL')
  const secret = Deno.env.get('MONERIS_CRON_SECRET')
  if (!base || !secret) return undefined
  return `${base}/functions/v1/moneris-webhook?s=${encodeURIComponent(secret)}`
}

// Crée l'abonnement des versements non encore payés. Idempotent : ne fait rien
// si le plan a déjà un abonnement.
export async function createPlanSubscription(db: DB, planId: string): Promise<{ ok: boolean; message: string }> {
  const { data: plan } = await db.from('payment_plans').select('*').eq('id', planId).maybeSingle() as { data: Plan | null }
  if (!plan) return { ok: false, message: 'Plan introuvable' }
  if (plan.moneris_subscription_id) return { ok: true, message: 'Abonnement déjà créé' }
  if (!plan.moneris_payment_method_id) return { ok: false, message: 'Carte absente' }

  const { data: remaining } = await db.from('payment_installments').select('*')
    .eq('plan_id', planId).eq('status', 'scheduled').order('number') as { data: Installment[] | null }
  if (!remaining?.length) return { ok: true, message: 'Aucun versement à planifier' }

  // Moneris exige une date de début future : si la date prévue est passée
  // (carte entrée par lien après quelques jours), on décale les versements.
  const today = todayMontreal()
  let start = remaining[0].due_date
  if (start <= today) {
    start = addInterval(today, 'DAY', 1, 1)
    for (let i = 0; i < remaining.length; i++) {
      const due = i === 0 ? start : addInterval(start, plan.frequency_unit, plan.frequency_interval, i)
      await db.from('payment_installments').update({ due_date: due }).eq('id', remaining[i].id)
    }
  }

  const amounts = new Set(remaining.map(i => i.amount_cents))
  if (amounts.size > 1) console.warn('[createPlanSubscription] montants inégaux, on utilise le dernier', [...amounts])
  const amountCents = remaining[remaining.length - 1].amount_cents

  let r
  try {
    r = await createSubscription({
      idempotencyKey: `sub-${plan.id}`.slice(0, 36),
      orderId: `NEO-${shortId(plan.id)}-S`,
      customerReference: custRef(plan),
      paymentMethodId: plan.moneris_payment_method_id,
      issuerId: plan.moneris_issuer_id,
      unit: plan.frequency_unit, interval: plan.frequency_interval,
      count: remaining.length, amountCents, startDate: start,
      callbackUrl: webhookUrl(),
    })
  } catch (e) {
    r = { ok: false, message: `Erreur technique : ${(e as Error).message}`, raw: {}, paymentIds: [] as string[] }
  }

  if (!r.ok || !r.subscriptionId) {
    console.error('[createPlanSubscription] échec', JSON.stringify(r.raw))
    await db.from('payment_plans').update({
      subscription_status: 'ERROR', subscription_error: r.message, updated_at: new Date().toISOString(),
    }).eq('id', planId)
    await notifySlack(
      `⚠️ L'échéancier Moneris n'a pas pu être créé : ${clientName(plan)} (closeur : ${plan.closer_name})\n` +
      `Raison : ${r.message}\nLe 1er paiement est passé. Ouvrir la vente dans le terminal et relancer la création de l'échéancier.`,
    )
    return { ok: false, message: r.message }
  }

  await db.from('payment_plans').update({
    moneris_subscription_id: r.subscriptionId, subscription_status: r.status ?? 'ACTIVE',
    subscription_error: null, updated_at: new Date().toISOString(),
  }).eq('id', planId)
  return { ok: true, message: 'Échéancier créé chez Moneris' }
}

// ── Synchronisation avec Moneris (webhook + passage quotidien) ──

const FINAL_OK = 'SUCCEEDED'
const FINAL_DECLINED = ['DECLINED', 'DECLINED_RETRY']

export async function syncPlan(db: DB, planId: string): Promise<{ paid: number; declined: number }> {
  const out = { paid: 0, declined: 0 }
  const { data: plan } = await db.from('payment_plans').select('*').eq('id', planId).maybeSingle() as { data: Plan | null }
  if (!plan?.moneris_subscription_id) return out

  const sub = await getSubscription(plan.moneris_subscription_id)
  if (!sub.ok) { console.error('[syncPlan] lecture abonnement', plan.id, sub.message); return out }

  const { data: insts } = await db.from('payment_installments').select('*')
    .eq('plan_id', plan.id).order('number') as { data: Installment[] }
  const byPayment = new Map<string, Installment>()
  for (const i of insts) if (i.moneris_payment_id) byPayment.set(i.moneris_payment_id, i)

  for (const pid of sub.paymentIds) {
    const info = await getPayment(pid)
    if (!info) continue
    const final = info.status === FINAL_OK || FINAL_DECLINED.includes(info.status)
    if (!final) continue
    let inst = byPayment.get(pid)
    if (!inst) {
      inst = insts.find(i => i.status === 'scheduled' && !i.moneris_payment_id)
      if (!inst) continue
      inst.moneris_payment_id = pid
      byPayment.set(pid, inst)
    }
    if (info.status === FINAL_OK && inst.status !== 'paid') {
      await markPaid(db, plan, inst, pid, info.createdAt || new Date().toISOString())
      inst.status = 'paid'
      out.paid++
    } else if (FINAL_DECLINED.includes(info.status) && inst.status !== 'declined' && inst.status !== 'paid') {
      await db.from('payment_installments').update({
        status: 'declined', moneris_payment_id: pid, error_message: info.message || 'Paiement refusé',
      }).eq('id', inst.id)
      inst.status = 'declined'
      out.declined++
      await notifySlack(
        `❌ Paiement refusé : ${clientName(plan)} (closeur : ${plan.closer_name})\n` +
        `Versement ${inst.number}/${plan.installments_count} de ${(inst.amount_cents / 100).toFixed(2)} $\n` +
        `Raison : ${info.message || 'refusé par la banque'}\nMoneris peut réessayer. Le closeur doit contacter le client si ça ne passe pas.`,
      )
    }
  }

  const changedStatus = sub.status && sub.status !== plan.subscription_status
  if (changedStatus) {
    await db.from('payment_plans').update({ subscription_status: sub.status, updated_at: new Date().toISOString() }).eq('id', plan.id)
    if (sub.status && FINAL_DECLINED.includes(sub.status) && out.declined === 0) {
      await notifySlack(`❌ Abonnement en échec chez Moneris : ${clientName(plan)} (closeur : ${plan.closer_name}). Statut : ${sub.status}.`)
    }
  }
  return out
}

export async function syncAllPlans(db: DB): Promise<{ plans: number; paid: number; declined: number }> {
  const { data: plans } = await db.from('payment_plans').select('id')
    .eq('status', 'active').not('moneris_subscription_id', 'is', null).limit(500)
  const total = { plans: plans?.length ?? 0, paid: 0, declined: 0 }
  for (const p of plans ?? []) {
    try {
      const r = await syncPlan(db, p.id)
      total.paid += r.paid; total.declined += r.declined
    } catch (e) { console.error('[syncAllPlans]', p.id, e) }
  }
  return total
}

// ── Enregistrement de la carte (closeur ou lien client) ─────────

export async function attachCard(db: DB, planId: string, temporaryToken: string, mode: 'closer' | 'client_link', eci: string)
  : Promise<{ ok: boolean; message: string; charged: boolean; warning?: string }> {
  const { data: plan } = await db.from('payment_plans').select('*').eq('id', planId).maybeSingle() as { data: Plan | null }
  if (!plan) return { ok: false, message: 'Plan introuvable', charged: false }
  if (!['pending_card', 'card_failed'].includes(plan.status)) {
    return { ok: false, message: 'La carte de ce plan est déjà enregistrée ou le plan est annulé.', charged: false }
  }

  const { data: first } = await db.from('payment_installments').select('*')
    .eq('plan_id', planId).eq('number', 1).maybeSingle() as { data: Installment | null }
  if (!first) return { ok: false, message: 'Échéancier introuvable', charged: false }

  const today = todayMontreal()
  const chargeNow = first.due_date <= today
  const attempt = first.attempts + 1
  const ref = custRef(plan)

  let r: MonerisResult
  if (chargeNow) {
    const locked = await lockInstallment(db, first.id)
    if (!locked) return { ok: false, message: 'Un paiement est déjà en cours pour ce plan.', charged: false }
  }
  try {
    r = chargeNow
      ? await chargeAndStoreCard({
          idempotencyKey: `${first.id}-${attempt}`.slice(0, 36),
          orderId: orderIdFor(planId, 1, attempt),
          amountCents: first.amount_cents, temporaryToken, eci, customerReference: ref, holder: holderOf(plan),
        })
      : await validateAndStoreCard({
          idempotencyKey: crypto.randomUUID(),
          orderId: `NEO-${ref}-V${attempt}`,
          temporaryToken, eci, customerReference: ref, holder: holderOf(plan),
        })
  } catch (e) {
    console.error('[attachCard] erreur technique', e)
    if (chargeNow) await db.from('payment_installments').update({ status: 'scheduled' }).eq('id', first.id)
    return { ok: false, message: 'Erreur technique avec Moneris. Vérifie dans le portail Moneris si le paiement est passé avant de réessayer.', charged: false }
  }

  if (!r.ok || !r.paymentMethodId) {
    if (chargeNow) {
      await db.from('payment_installments').update({
        status: 'scheduled', attempts: attempt, error_message: r.message,
      }).eq('id', first.id)
    }
    await db.from('payment_plans').update({ status: 'card_failed', updated_at: new Date().toISOString() }).eq('id', planId)
    console.error('[attachCard] refus', JSON.stringify(r.raw))
    return { ok: false, message: `Carte refusée : ${r.message}`, charged: false }
  }

  const updatedPlan = {
    status: 'active', card_entry_mode: mode,
    moneris_payment_method_id: r.paymentMethodId, moneris_issuer_id: r.issuerId ?? null,
    card_brand: r.cardBrand ?? null, card_last4: r.cardLast4 ?? null, card_expiry: r.cardExpiry ?? null,
    updated_at: new Date().toISOString(),
  }
  await db.from('payment_plans').update(updatedPlan).eq('id', planId)

  if (chargeNow) {
    await db.from('payment_installments').update({ attempts: attempt }).eq('id', first.id)
    await markPaid(db, { ...plan, ...updatedPlan } as Plan, first, r.paymentId, new Date().toISOString(), orderIdFor(planId, 1, attempt))
  }

  // Les versements restants : c'est Moneris qui les prélève
  const sub = await createPlanSubscription(db, planId)
  const base = chargeNow ? 'Paiement approuvé, carte enregistrée.' : 'Carte validée et enregistrée.'
  if (!sub.ok) {
    return {
      ok: true, charged: chargeNow, message: base,
      warning: `Attention : l'échéancier des prochains prélèvements n'a pas pu être créé chez Moneris (${sub.message}). Ouvre la vente et relance la création.`,
    }
  }
  return { ok: true, charged: chargeNow, message: base }
}

// ── Lien client ──────────────────────────────────────────────

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function newLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
