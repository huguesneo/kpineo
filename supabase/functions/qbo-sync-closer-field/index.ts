import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'

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

async function fetchSalesReceipts(token: string, realmId: string, startDate: string, endDate: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let startPos = 1
  while (true) {
    const query = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' STARTPOSITION ${startPos} MAXRESULTS 1000`
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
    if (!res.ok) { console.error('[QB] fetch failed:', res.status, await res.text()); break }
    const data = await res.json() as Record<string, unknown>
    const batch = ((data?.QueryResponse as Record<string, unknown>)?.SalesReceipt ?? []) as Record<string, unknown>[]
    results.push(...batch)
    if (batch.length < 1000) break
    startPos += 1000
  }
  return results
}

function getCustomField(receipt: Record<string, unknown>, fieldName: string): string {
  const fields = (receipt.CustomField ?? []) as Record<string, unknown>[]
  const f = fields.find(f => String(f.Name ?? '').trim().toLowerCase() === fieldName.toLowerCase())
  return String(f?.StringValue ?? '').trim()
}

// Copie la valeur de "closer" dans "closers" — tous les autres champs intacts.
function buildUpdatedReceipt(receipt: Record<string, unknown>, closerValue: string): Record<string, unknown> {
  const customFields = [...((receipt.CustomField ?? []) as Record<string, unknown>[])]
  const idx = customFields.findIndex(f => String(f.Name ?? '').trim().toLowerCase() === 'closers')
  if (idx >= 0) {
    customFields[idx] = { ...customFields[idx], StringValue: closerValue }
  } else {
    // Champ "closers" absent du reçu — l'ajouter avec DefinitionId 2
    customFields.push({ DefinitionId: '2', Name: 'closers', Type: 'StringType', StringValue: closerValue })
  }
  return { ...receipt, CustomField: customFields }
}

// ── Handler ───────────────────────────────────────────────────

type SyncResult = {
  id: string
  txnDate: string
  customerName: string
  closerValue: string
  status: 'updated' | 'skipped_already_set' | 'skipped_no_closer' | 'dry_run' | 'error'
  error?: string
}

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

    const body = await req.json().catch(() => ({})) as {
      dry_run?:    boolean
      start_date?: string
      end_date?:   string
      debug?:      boolean
    }
    const dryRun    = body.dry_run    === true
    const debugMode = body.debug      === true
    const startDate = body.start_date ?? '2026-01-01'
    const endDate   = body.end_date   ?? '2026-12-31'
    console.log(`[qbo-sync-closer-field] ${startDate} → ${endDate}, dryRun=${dryRun}`)

    const qbAuth = await getAccessToken(supabase)
    if (!qbAuth) return json({ error: 'not_connected' })

    const { token, realmId } = qbAuth

    const allReceipts = await fetchSalesReceipts(token, realmId, startDate, endDate)
    console.log(`[QB] ${allReceipts.length} reçus récupérés pour la période`)

    // Mode debug : retourne les CustomField des 5 premiers reçus pour identifier les noms de champs
    if (debugMode) {
      const sample = allReceipts.slice(0, 5).map(r => ({
        id: String(r.Id ?? ''),
        txnDate: String(r.TxnDate ?? ''),
        customer: String((r.CustomerRef as Record<string, unknown>)?.name ?? ''),
        customFields: (r.CustomField ?? []) as unknown[],
      }))
      return json({ debug: true, totalReceipts: allReceipts.length, sample })
    }

    const results: SyncResult[] = []
    let totalUpdated          = 0
    let totalSkippedAlreadySet = 0
    let totalSkippedNoCloser   = 0
    let totalErrors            = 0
    let totalDryRun            = 0

    for (const receipt of allReceipts) {
      const receiptId    = String(receipt.Id ?? '')
      const txnDate      = String(receipt.TxnDate ?? '')
      const customerName = String((receipt.CustomerRef as Record<string, unknown>)?.name ?? '')

      const closerValue  = getCustomField(receipt, 'closer')   // ancien champ source
      const closersValue = getCustomField(receipt, 'closers')  // nouveau champ cible

      // Pas de valeur dans l'ancien champ → rien à copier
      if (!closerValue) {
        totalSkippedNoCloser++
        continue
      }

      // Nouveau champ déjà rempli avec la même valeur → skip
      if (closersValue.toLowerCase() === closerValue.toLowerCase()) {
        console.log(`[Skip] Reçu ${receiptId} (${txnDate}) ${customerName} — closers déjà "${closersValue}"`)
        totalSkippedAlreadySet++
        results.push({ id: receiptId, txnDate, customerName, closerValue, status: 'skipped_already_set' })
        continue
      }

      if (dryRun) {
        console.log(`[DryRun] Reçu ${receiptId} (${txnDate}) ${customerName} — closer="${closerValue}" → closers="${closerValue}" (était: "${closersValue}")`)
        results.push({ id: receiptId, txnDate, customerName, closerValue, status: 'dry_run' })
        totalDryRun++
        continue
      }

      // Update
      const updatedReceipt = buildUpdatedReceipt(receipt, closerValue)
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
        console.error(`[Error] Reçu ${receiptId} (${txnDate}) ${customerName} — ${updateRes.status}:`, errText)
        results.push({ id: receiptId, txnDate, customerName, closerValue, status: 'error', error: `HTTP ${updateRes.status}: ${errText}` })
        totalErrors++
      } else {
        console.log(`[Updated] Reçu ${receiptId} (${txnDate}) ${customerName} — closers="${closerValue}"`)
        results.push({ id: receiptId, txnDate, customerName, closerValue, status: 'updated' })
        totalUpdated++
      }
    }

    const summary = {
      dryRun,
      startDate,
      endDate,
      totalReceipts: allReceipts.length,
      totalUpdated,
      totalSkippedAlreadySet,
      totalSkippedNoCloser,
      totalErrors,
      ...(dryRun ? { totalDryRun } : {}),
    }
    console.log('[qbo-sync-closer-field] Terminé —', JSON.stringify(summary))
    return json({ summary, results })

  } catch (err) {
    console.error('qbo-sync-closer-field error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
