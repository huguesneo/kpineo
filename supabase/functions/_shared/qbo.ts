// Reçu de vente QuickBooks créé directement par le terminal (remplace Make).
//
// Secrets / réglages (Supabase) :
//   QBO_RECEIPTS     « on » pour activer la création (sinon rien n'est écrit dans QuickBooks)
//   QBO_SEND_EMAIL   « off » pour ne PAS faire envoyer le reçu au client par QuickBooks
// Les connexions QuickBooks (quickbooks_tokens) sont celles déjà utilisées par les commissions.

declare const Deno: { env: { get(key: string): string | undefined } }
// deno-lint-ignore no-explicit-any
type DB = any
// deno-lint-ignore no-explicit-any
type J = any

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'
const TAX_CODE_QC = '8'            // « TPS/TVQ QC - 9,975 », comme tes reçus existants
const DEPOSIT_ACCOUNT = '3'        // « 1260 Fonds non déposés »
const PAYMENT_METHOD = '3'         // « Carte de crédit »
const CLOSERS_FIELD_ID = '2'       // champ personnalisé « closers » (jamais le 4)
const THERAPIST_FIELD_ID = '1'     // « Thérapeute »
const SETTER_FIELD_ID = '3'        // « Setter »

export interface ReceiptInput {
  firstName: string; lastName: string; email: string; phone?: string | null
  productName: string; closerName: string
  therapistName?: string | null; setterName?: string | null
  memo?: string | null
  customerNotes?: string | null   // notes du dossier client (1er paiement seulement)
  amountCents: number; paidDate: string
  installmentNumber: number; installmentsCount: number; mutexId: string
}

async function getAccess(db: DB) {
  const { data: row } = await db.from('quickbooks_tokens').select('access_token, refresh_token, realm_id, expires_at').eq('id', TOKEN_ROW_ID).maybeSingle()
  if (!row) throw new Error('Pas de connexion QuickBooks')
  if (!row.expires_at || new Date(row.expires_at) > new Date(Date.now() + 60_000)) return { token: row.access_token as string, realmId: row.realm_id as string }
  const id = Deno.env.get('QUICKBOOKS_CLIENT_ID')!, secret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')!
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(`${id}:${secret}`), 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token }),
  })
  if (!res.ok) throw new Error('Rafraîchissement QuickBooks refusé (' + res.status + ')')
  const t = await res.json()
  await db.from('quickbooks_tokens').upsert({
    id: TOKEN_ROW_ID, access_token: t.access_token, refresh_token: t.refresh_token ?? row.refresh_token,
    realm_id: row.realm_id, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  })
  return { token: t.access_token as string, realmId: row.realm_id as string }
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

async function qbo(acc: { token: string; realmId: string }, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: J }> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://quickbooks.api.intuit.com/v3/company/${acc.realmId}${path}${sep}minorversion=65`, {
    method,
    headers: { Authorization: `Bearer ${acc.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: J = null
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { ok: res.ok, status: res.status, json }
}
const query = async (acc: { token: string; realmId: string }, q: string) => {
  const r = await qbo(acc, 'GET', `/query?query=${encodeURIComponent(q)}`)
  if (!r.ok) throw new Error('Requête QuickBooks refusée (' + r.status + ')')
  return r.json?.QueryResponse ?? {}
}

// Ajoute les notes au dossier client existant (sous les notes déjà là), sauf si elles y sont déjà.
async function appendNotes(acc: { token: string; realmId: string }, id: string, notes: string) {
  const c = (await query(acc, `SELECT Id, SyncToken, Notes FROM Customer WHERE Id = '${esc(id)}'`)).Customer?.[0]
  if (!c) return
  const old = String(c.Notes ?? '').trim()
  if (old.includes(notes)) return
  const r = await qbo(acc, 'POST', '/customer', { Id: c.Id, SyncToken: c.SyncToken, sparse: true, Notes: (old ? old + '\n\n' + notes : notes).slice(0, 2000) })
  if (!r.ok) console.error('[QBO] notes du client refusées', r.status, JSON.stringify(r.json).slice(0, 300))
}

// Client : courriel, puis nom exact, sinon création (ajoute « . » si le nom est pris par quelqu'un d'autre).
async function findOrCreateCustomer(acc: { token: string; realmId: string }, i: ReceiptInput): Promise<string> {
  const email = i.email.trim()
  const name = `${i.firstName} ${i.lastName}`.trim()
  const notes = i.customerNotes?.trim() || null
  const existing = async (id: string) => { if (notes) await appendNotes(acc, id, notes); return id }
  if (email) {
    const r = await query(acc, `SELECT Id FROM Customer WHERE PrimaryEmailAddr = '${esc(email)}' MAXRESULTS 1`)
    if (r.Customer?.[0]) return existing(r.Customer[0].Id)
  }
  const byName = await query(acc, `SELECT Id FROM Customer WHERE DisplayName = '${esc(name)}' MAXRESULTS 1`)
  if (byName.Customer?.[0]) return existing(byName.Customer[0].Id)
  for (let n = 0; n < 4; n++) {
    const displayName = name + '.'.repeat(n)
    const r = await qbo(acc, 'POST', '/customer', {
      DisplayName: displayName, GivenName: i.firstName, FamilyName: i.lastName,
      ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
      ...(i.phone ? { PrimaryPhone: { FreeFormNumber: i.phone } } : {}),
      ...(notes ? { Notes: notes.slice(0, 2000) } : {}),
    })
    if (r.ok) return r.json.Customer.Id
    const dup = JSON.stringify(r.json).includes('6240') || JSON.stringify(r.json).toLowerCase().includes('duplicate')
    if (!dup) throw new Error('Création du client QuickBooks refusée : ' + JSON.stringify(r.json).slice(0, 300))
  }
  throw new Error('Nom de client déjà pris dans QuickBooks')
}

// Retourne l'identifiant du reçu créé.
export async function createSalesReceipt(db: DB, i: ReceiptInput): Promise<string> {
  const acc = await getAccess(db)
  const item = (await query(acc, `SELECT Id, Name FROM Item WHERE Name = '${esc(i.productName)}' AND Active = true MAXRESULTS 1`)).Item?.[0]
  if (!item) throw new Error(`Produit QuickBooks introuvable : ${i.productName}`)
  const customerId = await findOrCreateCustomer(acc, i)
  // Le montant prélevé contient déjà TPS+TVQ. On le ramène avant taxes et on laisse QuickBooks
  // ajouter les taxes (comme tes reçus actuels : TaxExcluded). Écart possible : 1 cent au maximum.
  const amount = Math.round(i.amountCents / 1.14975) / 100
  const receipt = {
    CustomerRef: { value: customerId },
    TxnDate: i.paidDate,
    GlobalTaxCalculation: 'TaxExcluded',
    DepositToAccountRef: { value: DEPOSIT_ACCOUNT },
    PaymentMethodRef: { value: PAYMENT_METHOD },
    CurrencyRef: { value: 'CAD' },
    ...(i.email ? { BillEmail: { Address: i.email.trim() } } : {}),
    CustomField: [
      { DefinitionId: CLOSERS_FIELD_ID, Name: 'closers', Type: 'StringType', StringValue: i.closerName },
      ...(i.therapistName ? [{ DefinitionId: THERAPIST_FIELD_ID, Name: 'Thérapeute', Type: 'StringType', StringValue: i.therapistName }] : []),
      ...(i.setterName ? [{ DefinitionId: SETTER_FIELD_ID, Name: 'Setter', Type: 'StringType', StringValue: i.setterName }] : []),
    ],
    PrivateNote: `Terminal NEO ${i.mutexId} (paiement ${i.installmentNumber}/${i.installmentsCount})${i.memo ? ' : ' + i.memo : ''}`,
    ...(i.memo ? { CustomerMemo: { value: i.memo } } : {}),
    Line: [{
      DetailType: 'SalesItemLineDetail', Amount: amount,
      Description: `Paiement ${i.installmentNumber} de ${i.installmentsCount}`,
      SalesItemLineDetail: { ItemRef: { value: item.Id }, Qty: 1, UnitPrice: amount, TaxCodeRef: { value: TAX_CODE_QC } },
    }],
  }
  const r = await qbo(acc, 'POST', '/salesreceipt', receipt)
  if (!r.ok) throw new Error('Création du reçu refusée : ' + JSON.stringify(r.json).slice(0, 400))
  const id = r.json.SalesReceipt.Id as string
  if (i.email && Deno.env.get('QBO_SEND_EMAIL') !== 'off') {
    const s = await qbo(acc, 'POST', `/salesreceipt/${id}/send?sendTo=${encodeURIComponent(i.email.trim())}`)
    if (!s.ok) console.error('[QBO] envoi du reçu refusé', s.status)
  }
  return id
}

export const qboEnabled = () => Deno.env.get('QBO_RECEIPTS') === 'on'
