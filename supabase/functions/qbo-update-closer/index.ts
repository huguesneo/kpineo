import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'

// DefinitionId 2 = closers  (seul champ modifié)
// DefinitionId 1 = Thérapeute
// DefinitionId 3 = Setter
// DefinitionId 4 = closer   (ne jamais toucher)
const CLOSER_DEF_ID = '2'

const QB_CLOSER_PRODUCTS = new Set([
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
])


// ── Auth ──────────────────────────────────────────────────────

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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenRow.refresh_token }),
  })
  if (!res.ok) return null
  const tokens = await res.json()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabase.from('quickbooks_tokens').upsert({
    id: TOKEN_ROW_ID,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? tokenRow.refresh_token,
    realm_id: tokenRow.realm_id,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })
  return { token: tokens.access_token, realmId: tokenRow.realm_id }
}

// ── QBO Helpers ───────────────────────────────────────────────

function escapeQBL(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function qbQuery(token: string, realmId: string, query: string): Promise<Record<string, unknown>> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
  if (!res.ok) {
    console.error(`[QB] Query failed (${res.status}):`, await res.text())
    return {}
  }
  return await res.json() as Record<string, unknown>
}

async function findCustomerIds(token: string, realmId: string, displayName: string): Promise<{ id: string; name: string }[]> {
  const data = await qbQuery(token, realmId, `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${escapeQBL(displayName)}'`)
  const customers = ((data?.QueryResponse as Record<string, unknown>)?.Customer ?? []) as Record<string, unknown>[]
  return customers.map(c => ({ id: String(c.Id), name: String(c.DisplayName) }))
}

async function fetchReceiptsByCustomerId(token: string, realmId: string, customerId: string): Promise<Record<string, unknown>[]> {
  const allReceipts: Record<string, unknown>[] = []
  let startPos = 1
  while (true) {
    const query = `SELECT * FROM SalesReceipt WHERE CustomerRef = '${customerId}' STARTPOSITION ${startPos} MAXRESULTS 1000`
    const data = await qbQuery(token, realmId, query)
    const batch = ((data?.QueryResponse as Record<string, unknown>)?.SalesReceipt ?? []) as Record<string, unknown>[]
    allReceipts.push(...batch)
    if (batch.length < 1000) break
    startPos += 1000
  }
  return allReceipts
}

function hasCloserProduct(receipt: Record<string, unknown>): boolean {
  const lines = (receipt.Line ?? []) as Record<string, unknown>[]
  return lines.some(line => {
    if (String(line.DetailType ?? '') !== 'SalesItemLineDetail') return false
    const detail = line.SalesItemLineDetail as Record<string, unknown> | undefined
    const itemName = String((detail?.ItemRef as Record<string, unknown>)?.name ?? '')
    return QB_CLOSER_PRODUCTS.has(itemName)
  })
}

function getCloserFieldValue(receipt: Record<string, unknown>): string {
  const fields = (receipt.CustomField ?? []) as Record<string, unknown>[]
  const f = fields.find(f => String(f.Name ?? '').trim().toLowerCase() === 'closers')
  return String(f?.StringValue ?? '').trim()
}

// Retourne une copie du reçu avec uniquement le champ "closers" (cherché par nom) modifié.
// Tous les autres champs (y compris les autres CustomField) restent intacts.
function buildUpdatedReceipt(receipt: Record<string, unknown>, closerName: string): Record<string, unknown> {
  const customFields = [...((receipt.CustomField ?? []) as Record<string, unknown>[])]
  const idx = customFields.findIndex(f => String(f.Name ?? '').trim().toLowerCase() === 'closers')
  if (idx >= 0) {
    customFields[idx] = { ...customFields[idx], StringValue: closerName }
  } else {
    customFields.push({ DefinitionId: CLOSER_DEF_ID, Name: 'closers', Type: 'StringType', StringValue: closerName })
  }
  return { ...receipt, CustomField: customFields }
}

// ── Handler ───────────────────────────────────────────────────

type ReceiptResult = { id: string; txnDate: string; status: 'updated' | 'skipped' | 'dry_run' | 'error' | 'no_product'; previousCloser?: string; error?: string }
type CustomerResult = { customerName: string; customerId: string; receipts: ReceiptResult[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean; closer_name?: string; customers?: string[]; offset?: number; limit?: number; skip_product_filter?: boolean }
    const dryRun            = body.dry_run === true
    const skipProductFilter = body.skip_product_filter === true
    const targetCloser      = (body.closer_name ?? 'Jason').trim()
    const fullList     = body.customers ?? []
    if (fullList.length === 0) return json({ error: 'customers est requis' }, 400)
    const offset       = body.offset ?? 0
    const limit        = body.limit  ?? 20
    const customerList = fullList.slice(offset, offset + limit)
    const nextOffset   = offset + limit < fullList.length ? offset + limit : null
    console.log(`[qbo-update-closer] closer="${targetCloser}", batch=${offset}-${offset + customerList.length - 1}/${fullList.length}, dryRun=${dryRun}`)

    const qbAuth = await getAccessToken(supabase)
    if (!qbAuth) return json({ error: 'not_connected' })

    const { token, realmId } = qbAuth

    const results: CustomerResult[] = []
    let totalUpdated = 0
    let totalSkipped = 0
    let totalErrors  = 0
    let totalDryRun  = 0
    const notFoundCustomers: string[] = []

    for (const customerName of customerList) {
      console.log(`[Customer] Recherche: "${customerName}"`)
      const customers = await findCustomerIds(token, realmId, customerName)

      if (customers.length === 0) {
        console.warn(`[NotFound] Client introuvable dans QBO: "${customerName}"`)
        notFoundCustomers.push(customerName)
        totalErrors++
        continue
      }

      for (const customer of customers) {
        console.log(`[Customer] Trouvé: ${customer.name} (id=${customer.id})`)
        const receipts = await fetchReceiptsByCustomerId(token, realmId, customer.id)
        console.log(`[Customer] ${customer.name}: ${receipts.length} reçu(s)`)

        const receiptResults: ReceiptResult[] = []

        for (const receipt of receipts) {
          const receiptId   = String(receipt.Id ?? '')
          const txnDate     = String(receipt.TxnDate ?? '')

          if (!hasCloserProduct(receipt)) {
            console.log(`[Skip] Reçu ${receiptId} (${txnDate}) — aucun produit commissionnable`)
            continue
          }

          const prevCloser  = getCloserFieldValue(receipt)

          if (prevCloser === targetCloser) {
            console.log(`[Skip] Reçu ${receiptId} (${txnDate}) — closers déjà "${targetCloser}"`)
            receiptResults.push({ id: receiptId, txnDate, status: 'skipped' })
            totalSkipped++
            continue
          }

          if (dryRun) {
            console.log(`[DryRun] Reçu ${receiptId} (${txnDate}) — closers actuel: "${prevCloser}" → "${targetCloser}"`)
            receiptResults.push({ id: receiptId, txnDate, status: 'dry_run', previousCloser: prevCloser })
            totalDryRun++
            continue
          }

          const updatedReceipt = buildUpdatedReceipt(receipt, targetCloser)
          const updateUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}/salesreceipt`
          const updateRes = await fetch(updateUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedReceipt),
          })

          if (!updateRes.ok) {
            const errText = await updateRes.text()
            console.error(`[Error] Reçu ${receiptId} (${txnDate}) — HTTP ${updateRes.status}:`, errText)
            receiptResults.push({ id: receiptId, txnDate, status: 'error', previousCloser: prevCloser, error: `HTTP ${updateRes.status}: ${errText}` })
            totalErrors++
          } else {
            console.log(`[Updated] Reçu ${receiptId} (${txnDate}) — closers: "${prevCloser}" → "${targetCloser}"`)
            receiptResults.push({ id: receiptId, txnDate, status: 'updated', previousCloser: prevCloser })
            totalUpdated++
          }
        }

        results.push({ customerName: customer.name, customerId: customer.id, receipts: receiptResults })
      }
    }

    const summary = {
      dryRun,
      offset,
      limit,
      nextOffset,
      totalUpdated,
      totalSkipped,
      totalErrors,
      ...(dryRun ? { totalDryRun } : {}),
      notFoundCustomers,
    }
    console.log('[qbo-update-closer] Terminé —', JSON.stringify(summary))
    return json({ summary, results })

  } catch (err) {
    console.error('qbo-update-closer error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
