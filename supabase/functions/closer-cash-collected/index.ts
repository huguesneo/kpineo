import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'

const QB_CLOSER_PRODUCTS = [
  'Évaluation naturopathie',
  'Évaluation entrainement',
  'Forfait 15 semaines NEO - 1 paiement',
  'Forfait 15 semaines DUO - 1 paiement',
  'Forfait 15 semaines DUO - 2 paiements',
  'Forfait 15 semaines DUO - 3 paiements',
  'Forfait 15 semaines DUO - 5 paiements',
  'Forfait 15 semaines NEO - 2 paiements',
  'Forfait 15 semaines NEO - 3 paiements',
  'Forfait 15 semaines NEO - 5 paiements',
  "Programme d'optimisation ajout entraînement personnalisé",
]

const GHL_PIPELINE_CLOSER  = 'YPTruORTl0LOSdS2vWJS'
const GHL_FIELD_CLOSER     = 'JSltN3nE7nm4cUjuGxTs'
const GHL_FIELD_DATE_CLOSE = 'UPqvJX8MkZ4thsPX2tjV'
const COMMISSION_RATE = 0.086

interface PaymentLine {
  clientName:  string
  txnDate:     string
  productName: string
  amount:      number
  type:        'new' | 'recurring'
  receiptId:   string
  paymentNumber?: number
  totalPayments?: number
}

interface TrackingRow {
  id:                    string
  qb_receipt_id:         string
  qb_customer_name:      string
  qb_customer_name_lower: string
  product_name:          string
  closer_name:           string
  total_payments:        number
  payment_number:        number
  txn_date:              string
  amount:                number
}

interface TrackingInsert {
  qb_receipt_id:          string
  qb_customer_name:       string
  qb_customer_name_lower: string
  product_name:           string
  closer_name:            string
  total_payments:         number
  payment_number:         number
  txn_date:               string
  amount:                 number
}

// ── Helpers ───────────────────────────────────────────────────

// Extrait le nombre de paiements depuis le nom du produit
// "Forfait 15 semaines NEO - 3 paiements" → 3
// Tout autre produit → 1
function getTotalPayments(productName: string): number {
  const match = productName.match(/(\d+)\s+paiements?/i)
  const n = match ? parseInt(match[1]) : 1
  return n > 1 ? n : 1
}

async function getAccessToken(supabase: ReturnType<typeof createClient>): Promise<{ token: string; realmId: string } | null> {
  const { data: tokenRow } = await supabase
    .from('quickbooks_tokens')
    .select('access_token, refresh_token, realm_id, expires_at')
    .eq('id', TOKEN_ROW_ID)
    .maybeSingle()
  if (!tokenRow) return null
  const isExpired = tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()
  if (!isExpired) return { token: tokenRow.access_token, realmId: tokenRow.realm_id }
  const clientId     = Deno.env.get('QUICKBOOKS_CLIENT_ID')!
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')!
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`), 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenRow.refresh_token }),
  })
  if (!res.ok) return null
  const tokens = await res.json()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabase.from('quickbooks_tokens').upsert({
    id: TOKEN_ROW_ID, access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? tokenRow.refresh_token,
    realm_id: tokenRow.realm_id, expires_at: expiresAt, updated_at: new Date().toISOString(),
  })
  return { token: tokens.access_token, realmId: tokenRow.realm_id }
}

async function fetchSalesReceipts(token: string, realmId: string, startDate: string, endDate: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let startPos = 1
  while (true) {
    const query = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' STARTPOSITION ${startPos} MAXRESULTS 1000`
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
    if (!res.ok) { console.error('QB batch failed:', res.status, await res.text()); break }
    const data = await res.json() as Record<string, unknown>
    const batch = ((data?.QueryResponse as Record<string, unknown>)?.SalesReceipt ?? []) as Record<string, unknown>[]
    results.push(...batch)
    if (batch.length < 1000) break
    startPos += 1000
  }
  return results
}

function parseGHLDate(v: unknown): Date | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) { const d = new Date(n > 9_999_999_999 ? n : n * 1000); return isNaN(d.getTime()) ? null : d }
  const d = new Date(String(v)); return isNaN(d.getTime()) ? null : d
}

function parseDateClose(raw: string | null, fallback: string | null): Date | null {
  const d = parseGHLDate(raw); if (d) return d
  if (fallback) { const f = new Date(fallback); return isNaN(f.getTime()) ? null : f }
  return null
}

function getGHLField(raw: Record<string, unknown>, fieldId: string): unknown {
  const fields = (raw?.customFields ?? []) as Record<string, unknown>[]
  const f = fields.find(f => f.id === fieldId || (f as Record<string, unknown>).key === fieldId || (f as Record<string, unknown>).fieldKey === fieldId)
  if (!f) return null
  return (f as Record<string, unknown>).fieldValueNumber ?? (f as Record<string, unknown>).fieldValueString ?? (f as Record<string, unknown>).fieldValueDate ?? (f as Record<string, unknown>).value ?? null
}

function getCommissionableLines(txn: Record<string, unknown>): { productName: string; amount: number }[] {
  const lines = (txn?.Line ?? []) as Record<string, unknown>[]
  const result: { productName: string; amount: number }[] = []
  for (const line of lines) {
    if (String(line.DetailType ?? '') !== 'SalesItemLineDetail') continue
    const detail = line.SalesItemLineDetail as Record<string, unknown> | undefined
    const itemName = String((detail?.ItemRef as Record<string, unknown>)?.name ?? '')
    if (QB_CLOSER_PRODUCTS.includes(itemName)) result.push({ productName: itemName, amount: Number(line.Amount ?? 0) })
  }
  return result
}

function nameMatches(qbName: string, ghlName: string): boolean {
  if (qbName === ghlName) return true
  const parts = ghlName.split(/\s+/).filter(Boolean)
  return parts.length > 1 && parts.every(p => qbName.includes(p))
}

function clientInSet(qbNameLower: string, names: Set<string>): boolean {
  if (names.has(qbNameLower)) return true
  for (const n of names) { if (nameMatches(qbNameLower, n) || nameMatches(n, qbNameLower)) return true }
  return false
}

// ── Handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json() as { closerName?: string; startDate?: string; endDate?: string }
    const { closerName, startDate, endDate } = body
    if (!closerName || !startDate || !endDate) return json({ error: 'closerName, startDate et endDate sont requis' }, 400)

    const qbAuth = await getAccessToken(supabase)
    if (!qbAuth) return json({ error: 'not_connected' })

    const fullNameLower = closerName.trim().toLowerCase()
    const firstName     = fullNameLower.split(' ')[0]
    const startMs       = new Date(startDate + 'T00:00:00').getTime()
    const endMs         = new Date(endDate   + 'T23:59:59').getTime()

    // ── Étape 1 : GHL – trouver les nouvelles ventes de ce closer dans la période ──
    // Utilisé pour attribuer les paiements uniques ET le premier paiement des multi-versements
    const { data: ghlOpps } = await supabase
      .from('ghl_opportunities')
      .select('contact_name, raw, closed_at, stage_name')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    type GHLOpp = { contact_name: string | null; raw: Record<string, unknown> | null; closed_at: string | null; stage_name: string | null }
    const allMyOpps = (ghlOpps as GHLOpp[] ?? []).filter(o => {
      const cf = String(getGHLField(o.raw ?? {}, GHL_FIELD_CLOSER) ?? '').trim().toLowerCase()
      if (!cf) return false
      const cfFirst = cf.split(' ')[0]
      return cf === fullNameLower || cf === firstName || cfFirst === firstName
    })
    console.log(`[GHL] ${allMyOpps.length} opportunités pour "${firstName}"`)

    // Clients closés dans cette période par ce closer (pour attribution paiement 1 / single)
    const newSaleClientNames = new Set<string>()
    for (const opp of allMyOpps) {
      const rawObj   = opp.raw as Record<string, unknown>
      const stageName = String(opp.stage_name ?? (rawObj?.pipelineStage as Record<string, unknown> | undefined)?.name ?? '')
      if (!stageName.includes('Gagné')) continue
      const closeDateRaw = String(getGHLField(opp.raw ?? {}, GHL_FIELD_DATE_CLOSE) ?? '') || null
      const closeDate    = parseDateClose(closeDateRaw, opp.closed_at)
      if (!closeDate) continue
      const ms = closeDate.getTime()
      if (ms < startMs || ms > endMs) continue
      const name = String(opp.contact_name ?? '').trim()
      if (name) newSaleClientNames.add(name.toLowerCase())
    }
    console.log(`[GHL] ${newSaleClientNames.size} nouvelles ventes dans la période:`, JSON.stringify([...newSaleClientNames]))

    // ── Étape 2 : reçus QB de la période ─────────────────────────────────────────
    const allReceipts = await fetchSalesReceipts(qbAuth.token, qbAuth.realmId, startDate, endDate)
    const commissionableReceipts = allReceipts.filter(r => getCommissionableLines(r).length > 0)
    console.log(`[QB] ${allReceipts.length} reçus total, ${commissionableReceipts.length} commissionnables`)

    // ── Étape 3 : pré-charger closer_payment_tracking ────────────────────────────
    // Pour les produits multi-paiements dans cette période
    const multiReceiptIds:    string[] = []
    const multiCustomerLowers: string[] = []
    for (const r of commissionableReceipts) {
      const customerName = String((r.CustomerRef as Record<string, unknown>)?.name ?? '').trim()
      if (!customerName) continue
      for (const line of getCommissionableLines(r)) {
        if (getTotalPayments(line.productName) > 1) {
          multiReceiptIds.push(String(r.Id ?? ''))
          multiCustomerLowers.push(customerName.toLowerCase())
        }
      }
    }

    const trackingByReceiptProduct = new Map<string, TrackingRow>()
    const trackingByCustomerProduct = new Map<string, TrackingRow[]>()

    if (multiReceiptIds.length > 0) {
      const uniqueReceiptIds = [...new Set(multiReceiptIds)]
      const uniqueCustomers  = [...new Set(multiCustomerLowers)]

      // Lignes correspondant aux reçus de cette période (idempotence)
      const { data: byReceipt } = await supabase
        .from('closer_payment_tracking')
        .select('*')
        .in('qb_receipt_id', uniqueReceiptIds)

      // Toutes les lignes historiques pour ces clients (pour compter les paiements précédents)
      const { data: byCustomer } = await supabase
        .from('closer_payment_tracking')
        .select('*')
        .in('qb_customer_name_lower', uniqueCustomers)

      const allRows = [...(byReceipt ?? []), ...(byCustomer ?? [])] as TrackingRow[]
      const seenIds = new Set<string>()

      for (const row of allRows) {
        if (seenIds.has(row.id)) continue
        seenIds.add(row.id)

        const rpKey = `${row.qb_receipt_id}|||${row.product_name}`
        if (!trackingByReceiptProduct.has(rpKey)) trackingByReceiptProduct.set(rpKey, row)

        const cpKey = `${row.qb_customer_name_lower}|||${row.product_name}`
        if (!trackingByCustomerProduct.has(cpKey)) trackingByCustomerProduct.set(cpKey, [])
        trackingByCustomerProduct.get(cpKey)!.push(row)
      }
    }

    // ── Étape 4 : classifier les reçus ───────────────────────────────────────────
    const newSales:  PaymentLine[]   = []
    const recurring: PaymentLine[]   = []
    const trackingInserts: TrackingInsert[] = []

    for (const receipt of commissionableReceipts) {
      const customerName = String((receipt.CustomerRef as Record<string, unknown>)?.name ?? '').trim()
      const qbNameLower  = customerName.toLowerCase()
      const txnDate      = String(receipt.TxnDate ?? '')
      const receiptId    = String(receipt.Id ?? '')
      const lines        = getCommissionableLines(receipt)
      if (!customerName || lines.length === 0) continue

      for (const line of lines) {
        const totalPayments = getTotalPayments(line.productName)

        if (totalPayments === 1) {
          // ── Paiement unique : attribuer si client dans les nouvelles ventes GHL ──
          if (!clientInSet(qbNameLower, newSaleClientNames)) continue
          newSales.push({
            clientName: customerName, txnDate, productName: line.productName,
            amount: line.amount, type: 'new', receiptId,
            paymentNumber: 1, totalPayments: 1,
          })

        } else {
          // ── Multi-versements : utiliser la table de tracking ──────────────────
          const rpKey = `${receiptId}|||${line.productName}`
          const cpKey = `${qbNameLower}|||${line.productName}`

          // Déjà traité (idempotence) ?
          const alreadyProcessed = trackingByReceiptProduct.get(rpKey)
          if (alreadyProcessed) {
            if (alreadyProcessed.closer_name === firstName) {
              const entry: PaymentLine = {
                clientName: customerName, txnDate, productName: line.productName,
                amount: line.amount, receiptId,
                type: alreadyProcessed.payment_number === 1 ? 'new' : 'recurring',
                paymentNumber: alreadyProcessed.payment_number,
                totalPayments,
              }
              if (alreadyProcessed.payment_number === 1) newSales.push(entry)
              else recurring.push(entry)
            }
            continue
          }

          // Déterminer le numéro du paiement
          const historicalRows = trackingByCustomerProduct.get(cpKey) ?? []
          // Compter aussi les inserts en attente dans cette même exécution
          const pendingCount = trackingInserts.filter(
            i => i.qb_customer_name_lower === qbNameLower && i.product_name === line.productName
          ).length
          const paymentsDone  = historicalRows.length + pendingCount
          const paymentNumber = paymentsDone + 1

          let closerForThis: string | null = null

          if (paymentNumber === 1) {
            // Premier paiement → trouver le closer via GHL (nouvelle vente dans la période)
            if (clientInSet(qbNameLower, newSaleClientNames)) {
              closerForThis = firstName
            } else {
              // Pas une nouvelle vente de ce closer dans cette période → ignorer
              continue
            }
          } else {
            // Paiement suivant → le closer est déjà stocké dans la table
            const firstRow = [...historicalRows].sort((a, b) => a.payment_number - b.payment_number)[0]
            const pendingFirst = trackingInserts.find(
              i => i.qb_customer_name_lower === qbNameLower && i.product_name === line.productName
            )
            closerForThis = firstRow?.closer_name ?? pendingFirst?.closer_name ?? null
            if (!closerForThis) {
              console.warn(`[Tracking] Aucun paiement 1 trouvé pour "${customerName}" / "${line.productName}" — backfill requis`)
              continue
            }
          }

          // Enregistrer dans la table de tracking
          trackingInserts.push({
            qb_receipt_id:          receiptId,
            qb_customer_name:       customerName,
            qb_customer_name_lower: qbNameLower,
            product_name:           line.productName,
            closer_name:            closerForThis,
            total_payments:         totalPayments,
            payment_number:         paymentNumber,
            txn_date:               txnDate,
            amount:                 line.amount,
          })

          // Attribuer à ce closer si c'est bien lui
          if (closerForThis === firstName) {
            const entry: PaymentLine = {
              clientName: customerName, txnDate, productName: line.productName,
              amount: line.amount, receiptId,
              type: paymentNumber === 1 ? 'new' : 'recurring',
              paymentNumber, totalPayments,
            }
            if (paymentNumber === 1) newSales.push(entry)
            else recurring.push(entry)
          }
        }
      }
    }

    // ── Étape 5 : persister les nouvelles lignes de tracking ─────────────────────
    if (trackingInserts.length > 0) {
      const { error: insertErr } = await supabase
        .from('closer_payment_tracking')
        .upsert(trackingInserts, { onConflict: 'qb_receipt_id,product_name', ignoreDuplicates: true })
      if (insertErr) console.error('[DB] tracking insert error:', insertErr.message)
      else console.log(`[DB] ${trackingInserts.length} lignes tracking enregistrées`)
    }

    console.log(`[Result] nouvelles=${newSales.length}, récurrents=${recurring.length}`)

    const newTotal       = newSales.reduce((s, l) => s + l.amount, 0)
    const recurringTotal = recurring.reduce((s, l) => s + l.amount, 0)
    const total          = newTotal + recurringTotal
    const commission     = Math.round(total * COMMISSION_RATE * 100) / 100

    return json({ newSales, recurring, total, newTotal, recurringTotal, commission })

  } catch (err) {
    console.error('closer-cash-collected error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
