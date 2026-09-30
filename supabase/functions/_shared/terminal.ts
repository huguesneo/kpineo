// Logique métier du terminal : enregistrement de carte, prélèvements,
// notifications (Make pour le reçu QuickBooks, Slack pour les échecs).
//
// Secrets optionnels :
//   MAKE_PAYMENT_WEBHOOK_URL  webhook Make qui crée le reçu QuickBooks
//   SLACK_PAYMENTS_WEBHOOK_URL webhook Slack pour les refus de paiement

import { chargeAndStoreCard, chargeStoredCard, validateAndStoreCard, MonerisResult, CardHolder } from './moneris.ts'
import { addDays, todayMontreal } from './schedule.js'

declare const Deno: { env: { get(key: string): string | undefined } }

// deno-lint-ignore no-explicit-any
type DB = any

export const MAX_ATTEMPTS = 3
export const RETRY_AFTER_DAYS = 3

export interface Plan {
  id: string; closer_id: string; closer_name: string
  client_first_name: string; client_last_name: string; client_email: string; client_phone: string | null
  product_name: string; total_amount_cents: number; installments_count: number
  status: string; moneris_payment_method_id: string | null; moneris_issuer_id: string | null
  card_last4: string | null
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
  status: string; attempts: number
}

const shortId = (uuid: string) => uuid.replace(/-/g, '').slice(0, 12)
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
async function sendToMake(db: DB, plan: Plan, inst: Installment, paymentId?: string) {
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
    paid_date: todayMontreal(),
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

// ── Verrou : un versement ne peut être prélevé que par un seul appel ──

async function lockInstallment(db: DB, instId: string): Promise<Installment | null> {
  const { data } = await db.from('payment_installments')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('id', instId)
    .in('status', ['scheduled', 'declined'])
    .select('*')
    .maybeSingle()
  return data ?? null
}

async function markPaid(db: DB, plan: Plan, inst: Installment, r: MonerisResult, attempt: number) {
  await db.from('payment_installments').update({
    status: 'paid', attempts: attempt, paid_at: new Date().toISOString(),
    moneris_payment_id: r.paymentId ?? null, moneris_order_id: orderIdFor(plan.id, inst.number, attempt),
    error_message: null, next_retry_date: null,
  }).eq('id', inst.id)

  const { count } = await db.from('payment_installments')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', plan.id).neq('status', 'paid').neq('status', 'canceled')
  if (count === 0) {
    await db.from('payment_plans').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', plan.id)
  }
  await sendToMake(db, plan, inst, r.paymentId)
}

async function markDeclined(db: DB, plan: Plan, inst: Installment, r: MonerisResult, attempt: number) {
  const finalFail = attempt >= MAX_ATTEMPTS
  await db.from('payment_installments').update({
    status: 'declined', attempts: attempt,
    moneris_order_id: orderIdFor(plan.id, inst.number, attempt),
    error_message: r.message,
    next_retry_date: finalFail ? null : addDays(todayMontreal(), RETRY_AFTER_DAYS),
  }).eq('id', inst.id)

  const next = finalFail
    ? 'Plus de nouvel essai automatique : le closeur doit contacter le client.'
    : `Nouvel essai automatique dans ${RETRY_AFTER_DAYS} jours.`
  await notifySlack(
    `❌ Paiement refusé : ${clientName(plan)} (closeur : ${plan.closer_name})\n` +
    `Versement ${inst.number}/${plan.installments_count} de ${(inst.amount_cents / 100).toFixed(2)} $, essai ${attempt}/${MAX_ATTEMPTS}\n` +
    `Raison : ${r.message}\n${next}`,
  )
}

// ── Enregistrement de la carte (closeur ou lien client) ─────────

export async function attachCard(db: DB, planId: string, temporaryToken: string, mode: 'closer' | 'client_link', eci: string)
  : Promise<{ ok: boolean; message: string; charged: boolean }> {
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
  const ref = shortId(planId)

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

  if (chargeNow) await markPaid(db, { ...plan, ...updatedPlan } as Plan, first, r, attempt)
  return { ok: true, message: chargeNow ? 'Paiement approuvé, carte enregistrée.' : 'Carte validée et enregistrée.', charged: chargeNow }
}

// ── Prélèvement d'un versement sur la carte enregistrée ─────────

export async function chargeInstallment(db: DB, instId: string): Promise<{ ok: boolean; message: string }> {
  const locked = await lockInstallment(db, instId)
  if (!locked) return { ok: false, message: 'Versement déjà payé, annulé ou en cours.' }

  const { data: plan } = await db.from('payment_plans').select('*').eq('id', locked.plan_id).maybeSingle() as { data: Plan | null }
  const release = (msg: string) => db.from('payment_installments')
    .update({ status: 'scheduled', error_message: msg }).eq('id', instId)

  if (!plan || plan.status !== 'active' || !plan.moneris_payment_method_id) {
    await release('Plan inactif ou carte absente')
    return { ok: false, message: 'Plan inactif ou carte absente.' }
  }

  const attempt = locked.attempts + 1
  let r: MonerisResult
  try {
    r = await chargeStoredCard({
      idempotencyKey: `${locked.id}-${attempt}`.slice(0, 36),
      orderId: orderIdFor(plan.id, locked.number, attempt),
      amountCents: locked.amount_cents,
      paymentMethodId: plan.moneris_payment_method_id,
      issuerId: plan.moneris_issuer_id,
      customerReference: shortId(plan.id),
    })
  } catch (e) {
    // Erreur technique (réseau, OAuth) : on ne compte pas l'essai
    await release(`Erreur technique : ${(e as Error).message}`)
    return { ok: false, message: 'Erreur technique, réessayer plus tard.' }
  }

  if (r.ok) {
    await markPaid(db, plan, locked, r, attempt)
    return { ok: true, message: 'Paiement approuvé.' }
  }
  console.error('[chargeInstallment] refus', JSON.stringify(r.raw))
  await markDeclined(db, plan, locked, r, attempt)
  return { ok: false, message: `Refusé : ${r.message}` }
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
