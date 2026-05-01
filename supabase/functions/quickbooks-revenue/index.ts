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

    for (const row of rows) {
      const r = row as Record<string, unknown>
      if (r.group === 'Income') {
        const summary = r.Summary as Record<string, unknown>
        const colData = summary?.ColData as Record<string, unknown>[]
        if (!Array.isArray(colData)) continue
        for (let i = colData.length - 1; i >= 1; i--) {
          const val = parseFloat(String(colData[i]?.value ?? ''))
          if (!isNaN(val)) return val
        }
      }
    }
    return 0
  } catch {
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

// ─── Appel API QuickBooks P&L ────────────────────────────────
async function fetchPnL(accessToken: string, realmId: string, dateMacro: string): Promise<number> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?date_macro=${encodeURIComponent(dateMacro)}&minorversion=65`
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    console.error(`QB PnL fetch failed (${dateMacro}):`, res.status, await res.text())
    return 0
  }

  return extractTotalIncome(await res.json())
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

    // Lire force_refresh depuis le body
    let forceRefresh = false
    try { const b = await req.json(); forceRefresh = !!b?.force_refresh } catch { /* ok */ }

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

    // ── Appels QuickBooks ──
    const [monthly, prevMonthly, annual] = await Promise.all([
      fetchPnL(accessToken, tok.realm_id, 'This Month'),
      fetchPnL(accessToken, tok.realm_id, 'Last Month'),
      fetchPnL(accessToken, tok.realm_id, 'This Year'),
    ])

    const now = new Date().toISOString()
    await supabase.from('revenue_cache').upsert({
      id: CACHE_ROW_ID,
      monthly_revenue: monthly,
      prev_monthly_revenue: prevMonthly,
      annual_revenue: annual,
      last_synced_at: now,
    })

    return json({ monthly_revenue: monthly, prev_monthly_revenue: prevMonthly, annual_revenue: annual, last_synced_at: now, from_cache: false })
  } catch (err) {
    console.error('QB revenue error:', err)
    return json({ error: err.message }, 500)
  }
})
