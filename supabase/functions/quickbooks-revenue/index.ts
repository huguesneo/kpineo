import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'
const CACHE_ROW_ID = '00000000-0000-0000-0000-000000000002'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 heure

// ─── Extraction du revenu total depuis un rapport P&L ────────
function extractTotalIncome(report: Record<string, unknown>): number {
  try {
    const rowsWrapper = report?.Rows as Record<string, unknown>
    const rows = rowsWrapper?.Row as Record<string, unknown>[]
    if (!Array.isArray(rows)) return 0

    // Groupes à chercher dans l'ordre de priorité
    const targetGroups = ['Income', 'GrossProfit']

    for (const group of targetGroups) {
      for (const row of rows) {
        const r = row as Record<string, unknown>
        if (r.group === group) {
          const summary = r.Summary as Record<string, unknown>
          const colData = summary?.ColData as Record<string, unknown>[]
          if (!Array.isArray(colData)) continue
          // Chercher de gauche à droite (index 1 = première valeur)
          for (let i = 1; i < colData.length; i++) {
            const raw = String(colData[i]?.value ?? '').trim()
            if (raw === '' || raw === '0' || raw === 'null') continue
            const val = parseFloat(raw)
            if (!isNaN(val)) return val
          }
        }
      }
    }

    // Fallback : chercher "Total Income" dans n'importe quel Summary
    for (const row of rows) {
      const r = row as Record<string, unknown>
      const summary = r.Summary as Record<string, unknown>
      const colData = summary?.ColData as Record<string, unknown>[]
      if (!Array.isArray(colData)) continue
      const label = String(colData[0]?.value ?? '').toLowerCase()
      if (label.includes('total income') || label.includes('revenu total')) {
        for (let i = 1; i < colData.length; i++) {
          const val = parseFloat(String(colData[i]?.value ?? ''))
          if (!isNaN(val) && val !== 0) return val
        }
      }
    }

    // Debug : logger la structure reçue
    console.log('QB P&L rows reçus:', JSON.stringify(rows.map(r => ({
      group: (r as Record<string, unknown>).group,
      type: (r as Record<string, unknown>).type,
    }))))

    return 0
  } catch (e) {
    console.error('extractTotalIncome error:', e)
    return 0
  }
}

// ─── Rafraîchir le token si expiré ───────────────────────────
async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  oldRefreshToken: string,
  realmId: string
): Promise<string | null> {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')!
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')!

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: oldRefreshToken,
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('quickbooks_tokens').upsert({
    id: TOKEN_ROW_ID,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? oldRefreshToken,
    realm_id: realmId,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  return tokens.access_token
}

// ─── Appel API QuickBooks P&L (macro ou plage de dates) ──────
async function fetchPnL(
  accessToken: string,
  realmId: string,
  dateMacroOrStart: string,
  endDate?: string,
  method: 'Accrual' | 'Cash' = 'Accrual'
): Promise<number> {
  const params = endDate
    ? `start_date=${dateMacroOrStart}&end_date=${endDate}&accounting_method=${method}`
    : `date_macro=${encodeURIComponent(dateMacroOrStart)}&accounting_method=${method}`
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?${params}&minorversion=65`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    console.error(`QB PnL fetch failed: HTTP ${res.status}`, await res.text())
    return 0
  }
  const data = await res.json()
  const result = extractTotalIncome(data)
  console.log(`QB PnL ${method} (${params}): ${result}`)
  return result
}

// ─── Factures impayées : somme des Invoice.Balance où Balance > 0 ─
async function fetchUnpaidInvoicesBalance(
  accessToken: string,
  realmId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  // Récupère toutes les factures émises dans la période qui ont encore un solde > 0
  const query = `SELECT * FROM Invoice WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 1000`
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    console.error(`QB Invoice query failed: HTTP ${res.status}`, await res.text())
    return 0
  }
  const data = await res.json()
  const invoices: { Balance?: string | number }[] = data?.QueryResponse?.Invoice ?? []
  // Sommer uniquement les balances > 0 (factures non entièrement payées)
  const total = invoices.reduce((sum, inv) => {
    const bal = parseFloat(String(inv.Balance ?? 0)) || 0
    return bal > 0 ? sum + bal : sum
  }, 0)
  console.log(`QB UnpaidBalance (${startDate}→${endDate}): ${total} (${invoices.length} factures dont ${invoices.filter(i => parseFloat(String(i.Balance ?? 0)) > 0).length} impayées)`)
  return total
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

// ─── Handler principal ────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let forceRefresh = false, targetMonth: number | null = null, targetYear: number | null = null
    try {
      const b = await req.json()
      forceRefresh = !!b?.force_refresh
      targetMonth = b?.targetMonth ? Number(b.targetMonth) : null
      targetYear = b?.targetYear ? Number(b.targetYear) : null
    } catch { /* ok */ }

    const now = new Date()
    const isHistorical = targetMonth !== null && targetYear !== null &&
      !(targetMonth === now.getMonth() + 1 && targetYear === now.getFullYear())

    // Requête historique — pas de cache, retourne directement
    if (isHistorical && targetMonth && targetYear) {
      const { data: tok2 } = await supabase.from('quickbooks_tokens').select('*').eq('id', TOKEN_ROW_ID).maybeSingle()
      if (!tok2) return json({ error: 'not_connected' })
      let accessToken2 = tok2.access_token
      if (new Date(tok2.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
        const newToken = await refreshAccessToken(supabase, tok2.refresh_token, tok2.realm_id)
        if (!newToken) return json({ error: 'token_expired' }, 401)
        accessToken2 = newToken
      }
      const { start, end } = monthRange(targetYear, targetMonth)
      const [revenue, unpaid] = await Promise.all([
        fetchPnL(accessToken2, tok2.realm_id, start, end, 'Accrual'),
        fetchUnpaidInvoicesBalance(accessToken2, tok2.realm_id, start, end),
      ])
      return json({
        monthly_revenue: revenue,
        monthly_unpaid: unpaid,
        monthly_deposited: Math.max(0, revenue - unpaid),
        targetMonth, targetYear, from_cache: false,
      })
    }

    // ── Cache ──
    const { data: cache } = await supabase
      .from('revenue_cache')
      .select('*')
      .eq('id', CACHE_ROW_ID)
      .maybeSingle()

    if (cache && !forceRefresh) {
      const age = Date.now() - new Date(cache.last_synced_at).getTime()
      if (age < CACHE_TTL_MS) {
        return json({
          monthly_revenue: cache.monthly_revenue,
          prev_monthly_revenue: cache.prev_monthly_revenue,
          annual_revenue: cache.annual_revenue,
          monthly_invoices_paid: cache.monthly_invoices_paid ?? null,
          annual_invoices_paid: cache.annual_invoices_paid ?? null,
          monthly_deposited: cache.monthly_deposited ?? null,
          annual_deposited: cache.annual_deposited ?? null,
          last_synced_at: cache.last_synced_at,
          from_cache: true,
        })
      }
    }

    // ── Tokens ──
    const { data: tok } = await supabase
      .from('quickbooks_tokens')
      .select('*')
      .eq('id', TOKEN_ROW_ID)
      .maybeSingle()

    if (!tok) return json({ error: 'not_connected' })

    // Refresh si expiré (marge 5 min)
    let accessToken = tok.access_token
    if (new Date(tok.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
      const newToken = await refreshAccessToken(supabase, tok.refresh_token, tok.realm_id)
      if (!newToken) {
        if (cache) {
          return json({
            monthly_revenue: cache.monthly_revenue,
            prev_monthly_revenue: cache.prev_monthly_revenue,
            annual_revenue: cache.annual_revenue,
            last_synced_at: cache.last_synced_at,
            from_cache: true,
            warning: 'token_refresh_failed',
          })
        }
        return json({ error: 'token_expired' }, 401)
      }
      accessToken = newToken
    }

    // ── Appels QuickBooks (parallèles) ──
    const now2 = new Date()
    const { start: monthStart, end: monthEnd } = monthRange(now2.getFullYear(), now2.getMonth() + 1)
    const yearStart = `${now2.getFullYear()}-01-01`
    const yearEnd = monthEnd // jusqu'à aujourd'hui

    const [monthly, prevMonthly, annual, monthlyUnpaid, annualUnpaid] = await Promise.all([
      fetchPnL(accessToken, tok.realm_id, 'This Month', undefined, 'Accrual'),
      fetchPnL(accessToken, tok.realm_id, 'Last Month', undefined, 'Accrual'),
      fetchPnL(accessToken, tok.realm_id, 'This Fiscal Year-to-date', undefined, 'Accrual'),
      fetchUnpaidInvoicesBalance(accessToken, tok.realm_id, monthStart, monthEnd),
      fetchUnpaidInvoicesBalance(accessToken, tok.realm_id, yearStart, yearEnd),
    ])

    const monthlyDeposited = Math.max(0, monthly - monthlyUnpaid)
    const annualDeposited  = Math.max(0, annual  - annualUnpaid)

    const nowStr = new Date().toISOString()
    await supabase.from('revenue_cache').upsert({
      id: CACHE_ROW_ID,
      monthly_revenue: monthly,
      prev_monthly_revenue: prevMonthly,
      annual_revenue: annual,
      monthly_deposited: monthlyDeposited,
      annual_deposited: annualDeposited,
      last_synced_at: nowStr,
    })

    return json({
      monthly_revenue: monthly,
      prev_monthly_revenue: prevMonthly,
      annual_revenue: annual,
      monthly_deposited: monthlyDeposited,
      annual_deposited: annualDeposited,
      last_synced_at: nowStr,
      from_cache: false,
    })
  } catch (err) {
    console.error('QB revenue error:', err)
    return json({ error: err.message }, 500)
  }
})
