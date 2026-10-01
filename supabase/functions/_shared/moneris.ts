// Client Moneris API (nouvelle API REST, api.sb.moneris.io / api.moneris.io)
//
// Secrets requis (Supabase > Edge Functions > Secrets) :
//   MONERIS_API_BASE       https://api.sb.moneris.io (sandbox) ou https://api.moneris.io
//   MONERIS_CLIENT_ID      Client ID de l'application « portail neo »
//   MONERIS_CLIENT_SECRET  Client Secret
//   MONERIS_MERCHANT_ID    MID à 13 chiffres (test : 0030137014487)
//   MONERIS_API_VERSION    optionnel, défaut 2026-08-14

declare const Deno: { env: { get(key: string): string | undefined } }

const API_VERSION = () => Deno.env.get('MONERIS_API_VERSION') ?? '2026-08-14'
const BASE = () => {
  const b = Deno.env.get('MONERIS_API_BASE')
  if (!b) throw new Error('MONERIS_API_BASE manquant')
  return b.replace(/\/$/, '')
}

// Indicateurs de commerce électronique (à valider avec Moneris en sandbox)
export const ECI = {
  closerPhone: 'MAIL_TELEPHONE_ORDER_SINGLE', // closeur entre la carte au téléphone
  clientLink: 'SSL_MERCHANT',                  // client entre sa carte via le lien
  recurring: 'MAIL_TELEPHONE_ORDER_RECURRING', // versements suivants prélevés par NEO
} as const

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const clientId = Deno.env.get('MONERIS_CLIENT_ID')
  const clientSecret = Deno.env.get('MONERIS_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('MONERIS_CLIENT_ID / MONERIS_CLIENT_SECRET manquants')

  const res = await fetch(`${BASE()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'payment.write',
    }),
  })
  if (!res.ok) throw new Error(`Moneris OAuth ${res.status}: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in: string | number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 }
  return data.access_token
}

type Json = Record<string, unknown>

// Titulaire de la carte : nom, courriel, téléphone et adresse de facturation
// (sert à la vérification d'adresse AVS de Moneris)
export interface CardHolder {
  name: string; email?: string | null; phone?: string | null
  streetNumber?: string | null; streetName?: string | null; unit?: string | null
  city?: string | null; province?: string | null; postalCode?: string | null
}

function holderFields(h?: CardHolder): Json {
  if (!h) return {}
  const out: Json = { cardholderInformation: { cardholderName: h.name.slice(0, 60) } }
  const digits = (h.phone ?? '').replace(/\D/g, '')
  const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null
  if (h.email || phone) out.contactDetails = { email: h.email ?? null, phoneNumber: phone }
  if (h.streetName || h.postalCode) {
    out.billingAddress = {
      unitNumber: h.unit || null, streetNumber: h.streetNumber || null, streetName: h.streetName || null,
      city: h.city || null, province: h.province || null,
      postalCode: h.postalCode ? h.postalCode.toUpperCase().replace(/\s+/g, ' ').trim() : null,
      country: 'CA',
    }
  }
  return out
}

async function call(method: 'GET' | 'POST', path: string, body?: Json): Promise<{ status: number; data: Json }> {
  const merchantId = Deno.env.get('MONERIS_MERCHANT_ID')
  if (!merchantId) throw new Error('MONERIS_MERCHANT_ID manquant')
  const token = await getAccessToken()
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Api-Version': API_VERSION(),
      'X-Merchant-Id': merchantId,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: Json = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  return { status: res.status, data }
}
const post = (path: string, body: Json) => call('POST', path, body)

export interface MonerisResult {
  ok: boolean
  paymentId?: string
  paymentMethodId?: string
  issuerId?: string
  cardBrand?: string
  cardLast4?: string
  cardExpiry?: string
  message: string
  raw: Json
}

function readResult(status: number, data: Json, statusField: 'paymentStatus' | 'validationStatus', idField: 'paymentId' | 'validationId'): MonerisResult {
  const pm = (data.paymentMethod ?? {}) as Json
  const info = ((pm.paymentMethodInformation ?? {}) as Json)
  const card = (info.cardInformation ?? {}) as Json
  const tx = (data.transactionDetails ?? {}) as Json
  const cof = (data.credentialOnFileResponse ?? {}) as Json
  const st = String(data[statusField] ?? '')
  const ok = status >= 200 && status < 300 && st === 'SUCCEEDED'
  const expM = card.expiryMonth ? String(card.expiryMonth).padStart(2, '0') : ''
  const expY = card.expiryYear ? String(card.expiryYear).slice(-2) : ''
  return {
    ok,
    paymentId: data[idField] ? String(data[idField]) : undefined,
    paymentMethodId: pm.paymentMethodId ? String(pm.paymentMethodId) : undefined,
    issuerId: cof.issuerId ? String(cof.issuerId) : undefined,
    cardBrand: card.cardBrand ? String(card.cardBrand) : undefined,
    cardLast4: card.lastFour ? String(card.lastFour) : undefined,
    cardExpiry: expM && expY ? `${expM}/${expY}` : undefined,
    message: ok
      ? 'Approuvé'
      : String(tx.message ?? data.detail ?? data.title ?? st ?? `Erreur ${status}`),
    raw: data,
  }
}

// 1er paiement : débite la carte ET l'enregistre pour les versements suivants
export async function chargeAndStoreCard(p: {
  idempotencyKey: string; orderId: string; amountCents: number; temporaryToken: string
  eci: string; customerReference?: string; holder?: CardHolder
}): Promise<MonerisResult> {
  const { status, data } = await post('/payments', {
    idempotencyKey: p.idempotencyKey,
    orderId: p.orderId,
    amount: { amount: p.amountCents, currency: 'CAD' },
    customerReference: p.customerReference,
    paymentMethod: {
      paymentMethodSource: 'TEMPORARY_TOKEN',
      temporaryToken: p.temporaryToken,
      storePaymentMethod: 'MERCHANT_INITIATED',
      credentialOnFileInformation: { paymentIndicator: 'RECURRING', paymentInformation: 'FIRST' },
      ...holderFields(p.holder),
    },
    ecommerceIndicator: p.eci,
    automaticCapture: true,
    dynamicDescriptor: 'NEO Performance',
  })
  return readResult(status, data, 'paymentStatus', 'paymentId')
}

// Début futur : valide la carte (sans débit) et l'enregistre
export async function validateAndStoreCard(p: {
  idempotencyKey: string; orderId: string; temporaryToken: string; eci: string; customerReference?: string
  holder?: CardHolder
}): Promise<MonerisResult> {
  const { status, data } = await post('/validations', {
    idempotencyKey: p.idempotencyKey,
    orderId: p.orderId,
    customerReference: p.customerReference,
    paymentMethod: {
      paymentMethodSource: 'TEMPORARY_TOKEN',
      temporaryToken: p.temporaryToken,
      storePaymentMethod: 'MERCHANT_INITIATED',
      credentialOnFileInformation: { paymentIndicator: 'RECURRING', paymentInformation: 'FIRST' },
      ...holderFields(p.holder),
    },
    ecommerceIndicator: p.eci,
    dynamicDescriptor: 'NEO Performance',
  })
  return readResult(status, data, 'validationStatus', 'validationId')
}

// Versements suivants : prélèvement sur la carte enregistrée (merchant-initiated)
export async function chargeStoredCard(p: {
  idempotencyKey: string; orderId: string; amountCents: number
  paymentMethodId: string; issuerId?: string | null; customerReference?: string
}): Promise<MonerisResult> {
  const cof: Json = { paymentIndicator: 'RECURRING', paymentInformation: 'SUBSEQUENT' }
  if (p.issuerId) cof.issuerId = p.issuerId
  const { status, data } = await post('/payments', {
    idempotencyKey: p.idempotencyKey,
    orderId: p.orderId,
    amount: { amount: p.amountCents, currency: 'CAD' },
    customerReference: p.customerReference,
    paymentMethod: {
      paymentMethodSource: 'PAYMENT_METHOD_ID',
      paymentMethodId: p.paymentMethodId,
      storePaymentMethod: 'DO_NOT_STORE',
      credentialOnFileInformation: cof,
    },
    ecommerceIndicator: ECI.recurring,
    automaticCapture: true,
    dynamicDescriptor: 'NEO Performance',
  })
  return readResult(status, data, 'paymentStatus', 'paymentId')
}

// ── Abonnements : Moneris tient l'horaire et prélève lui-même ──────────

export interface SubscriptionResult {
  ok: boolean
  subscriptionId?: string
  status?: string
  nextBillingDate?: string
  paymentIds: string[]
  message: string
  raw: Json
}

function readSubscription(status: number, data: Json): SubscriptionResult {
  const bi = (data.billingInformation ?? {}) as Json
  const payments = Array.isArray(data.payments) ? data.payments as Json[] : []
  const ok = status >= 200 && status < 300 && !!data.subscriptionId
  return {
    ok,
    subscriptionId: data.subscriptionId ? String(data.subscriptionId) : undefined,
    status: data.subscriptionStatus ? String(data.subscriptionStatus) : undefined,
    nextBillingDate: bi.nextBillingDate ? String(bi.nextBillingDate) : undefined,
    paymentIds: payments.map(p => String(p.paymentId)).filter(Boolean),
    message: ok ? 'OK' : String(data.detail ?? data.title ?? `Erreur ${status}`),
    raw: data,
  }
}

// Crée l'abonnement sur la carte enregistrée. count = nombre de prélèvements
// que Moneris fera (sans le paiement déjà fait aujourd'hui). startDate : date future.
export async function createSubscription(p: {
  idempotencyKey: string; orderId: string; customerReference?: string
  paymentMethodId: string; issuerId?: string | null
  unit: 'DAY' | 'WEEK' | 'MONTH'; interval: number; count: number
  amountCents: number; startDate: string; callbackUrl?: string
}): Promise<SubscriptionResult> {
  const cof: Json = { paymentIndicator: 'RECURRING', paymentInformation: 'SUBSEQUENT' }
  if (p.issuerId) cof.issuerId = p.issuerId
  const { status, data } = await call('POST', '/subscriptions', {
    idempotencyKey: p.idempotencyKey,
    orderId: p.orderId,
    customerReference: p.customerReference,
    subscriptionType: 'RECURRING',
    billingInformation: {
      billingIntervalUnit: p.unit,
      billingIntervalFrequency: p.interval,
      billingIntervalCount: p.count,
      billingAmount: { amount: p.amountCents, currency: 'CAD' },
      billingStartDate: p.startDate,
    },
    paymentMethod: {
      paymentMethodSource: 'PAYMENT_METHOD_ID',
      paymentMethodId: p.paymentMethodId,
      credentialOnFileInformation: cof,
    },
    ecommerceIndicator: ECI.recurring,
    callbackUrl: p.callbackUrl,
  })
  return readSubscription(status, data)
}

export async function getSubscription(id: string): Promise<SubscriptionResult> {
  const { status, data } = await call('GET', `/subscriptions/${encodeURIComponent(id)}`)
  return readSubscription(status, data)
}

export async function cancelSubscription(id: string, reason?: string): Promise<SubscriptionResult> {
  const { status, data } = await call('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    idempotencyKey: crypto.randomUUID(), reason: reason?.slice(0, 100),
  })
  return readSubscription(status, data)
}

export interface PaymentInfo { paymentId: string; status: string; amountCents: number; createdAt: string; message: string }

export async function getPayment(id: string): Promise<PaymentInfo | null> {
  const { status, data } = await call('GET', `/payments/${encodeURIComponent(id)}`)
  if (status < 200 || status >= 300) return null
  const amt = (data.amount ?? {}) as Json
  const tx = (data.transactionDetails ?? {}) as Json
  return {
    paymentId: String(data.paymentId ?? id),
    status: String(data.paymentStatus ?? ''),
    amountCents: Number(amt.amount ?? 0),
    createdAt: String(data.createdAt ?? ''),
    message: String(tx.message ?? ''),
  }
}
