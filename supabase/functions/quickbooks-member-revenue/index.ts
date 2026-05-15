import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 heure

const QB_FIELDS: Record<string, string> = {
  naturopathe: 'Thérapeute',
  closer: 'closers',
  setter: 'Setter',
}

// ─── Refresh token ────────────────────────────────────────────
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
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: oldRefreshToken }),
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

// ─── Fetch paginé ─────────────────────────────────────────────
async function fetchAll(
  accessToken: string,
  realmId: string,
  txnType: 'SalesReceipt' | 'CreditMemo' | 'Invoice',
  startDate: string,
  endDate: string
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let startPos = 1
  const maxResults = 1000
  while (true) {
    const query = `SELECT * FROM ${txnType} WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' STARTPOSITION ${startPos} MAXRESULTS ${maxResults}`
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    })
    if (!res.ok) {
      console.error(`QB ${txnType} failed:`, res.status, await res.text())
      break
    }
    const data = await res.json() as Record<string, unknown>
    const batch = ((data?.QueryResponse as Record<string, unknown>)?.[txnType] ?? []) as Record<string, unknown>[]
    results.push(...batch)
    if (batch.length < maxResults) break
    startPos += maxResults
  }
  console.log(`Fetched ${results.length} ${txnType}`)
  return results
}

// ─── Valeur d'un champ custom ─────────────────────────────────
function getField(txn: Record<string, unknown>, fieldName: string): string {
  const fields = (txn?.CustomField ?? []) as Record<string, unknown>[]
  for (const f of fields) {
    if (String(f.Name ?? '').trim() === fieldName) return String(f.StringValue ?? '').trim()
  }
  return ''
}

interface PeriodTotals {
  monthly: number; prevMonthly: number; annual: number; quarterly: number
  monthlyUnpaid: number; quarterlyUnpaid: number; annualUnpaid: number
  monthlyDeposited: number; quarterlyDeposited: number; annualDeposited: number
}
interface MemberRevenues { naturopathe: PeriodTotals; closer: PeriodTotals; setter: PeriodTotals }

// ─── Calculer les totaux + impayés pour UN prénom + UN champ ──
function calcTotals(
  sales: Record<string, unknown>[],
  invoices: Record<string, unknown>[],   // ← raw invoices (pour Balance)
  credits: Record<string, unknown>[],
  prevSales: Record<string, unknown>[],
  prevCredits: Record<string, unknown>[],
  fieldName: string,
  firstName: string,
  year: number, month: number,
  prevYear: number, prevMonth: number,
  quarterStartMonth: number, today: string
): PeriodTotals {
  const nameLower = firstName.toLowerCase()

  const matchSales    = sales.filter(t => getField(t, fieldName).toLowerCase() === nameLower)
  const matchInvoices = invoices.filter(t => getField(t, fieldName).toLowerCase() === nameLower)
  const matchCredits  = credits.filter(t => getField(t, fieldName).toLowerCase() === nameLower)
  const matchPrevSales   = prevSales.filter(t => getField(t, fieldName).toLowerCase() === nameLower)
  const matchPrevCredits = prevCredits.filter(t => getField(t, fieldName).toLowerCase() === nameLower)

  function pretax(t: Record<string, unknown>): number {
    const tax = Number((t?.TxnTaxDetail as Record<string, unknown>)?.TotalTax ?? 0)
    return Number(t.TotalAmt ?? 0) - tax
  }

  function sumMonth(txns: Record<string, unknown>[], y: number, m: number) {
    return txns
      .filter(t => { const d = new Date(t.TxnDate as string); return d.getFullYear() === y && d.getMonth() + 1 === m })
      .reduce((s, t) => s + pretax(t), 0)
  }

  function sumRange(txns: Record<string, unknown>[], start: string, end: string) {
    return txns
      .filter(t => { const d = t.TxnDate as string; return d >= start && d <= end })
      .reduce((s, t) => s + pretax(t), 0)
  }

  const qStart = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`

  const monthly     = sumMonth(matchSales, year, month) - sumMonth(matchCredits, year, month)
  const prevMonthly = sumMonth(matchPrevSales, prevYear, prevMonth) - sumMonth(matchPrevCredits, prevYear, prevMonth)
  const annual      = matchSales.reduce((s, t) => s + pretax(t), 0) - matchCredits.reduce((s, t) => s + pretax(t), 0)
  const quarterly   = sumRange(matchSales, qStart, today) - sumRange(matchCredits, qStart, today)

  // ─── Factures impayées (Balance > 0 sur les invoices) ───────
  function sumUnpaid(txns: Record<string, unknown>[]) {
    return txns.reduce((s, t) => {
      const bal = parseFloat(String(t.Balance ?? 0)) || 0
      return bal > 0 ? s + bal : s
    }, 0)
  }

  const monthlyUnpaid   = sumUnpaid(matchInvoices.filter(t => { const d = new Date(t.TxnDate as string); return d.getFullYear() === year && d.getMonth() + 1 === month }))
  const quarterlyUnpaid = sumUnpaid(matchInvoices.filter(t => { const d = t.TxnDate as string; return d >= qStart && d <= today }))
  const annualUnpaid    = sumUnpaid(matchInvoices)

  return {
    monthly, prevMonthly, annual, quarterly,
    monthlyUnpaid, quarterlyUnpaid, annualUnpaid,
    monthlyDeposited:   Math.max(0, monthly   - monthlyUnpaid),
    quarterlyDeposited: Math.max(0, quarterly - quarterlyUnpaid),
    annualDeposited:    Math.max(0, annual    - annualUnpaid),
  }
}

// ─── Calculer les totaux pour TOUS les prénoms trouvés ────────
function computeAllRevenues(
  yearSales: Record<string, unknown>[],
  yearInvoices: Record<string, unknown>[],   // ← séparés des SalesReceipts
  yearCredits: Record<string, unknown>[],
  prevSales: Record<string, unknown>[],
  prevCredits: Record<string, unknown>[],
  year: number, month: number,
  prevYear: number, prevMonth: number,
  quarterStartMonth: number, today: string
): Map<string, MemberRevenues> {
  const allNames = new Set<string>()
  for (const txn of [...yearSales, ...yearCredits, ...prevSales, ...prevCredits]) {
    for (const fieldName of Object.values(QB_FIELDS)) {
      const name = getField(txn, fieldName)
      if (name) allNames.add(name)
    }
  }
  console.log('Prénoms trouvés dans QB:', [...allNames])

  const result = new Map<string, MemberRevenues>()
  for (const name of allNames) {
    const revenues: MemberRevenues = {
      naturopathe: calcTotals(yearSales, yearInvoices, yearCredits, prevSales, prevCredits, QB_FIELDS.naturopathe, name, year, month, prevYear, prevMonth, quarterStartMonth, today),
      closer:      calcTotals(yearSales, yearInvoices, yearCredits, prevSales, prevCredits, QB_FIELDS.closer,      name, year, month, prevYear, prevMonth, quarterStartMonth, today),
      setter:      calcTotals(yearSales, yearInvoices, yearCredits, prevSales, prevCredits, QB_FIELDS.setter,      name, year, month, prevYear, prevMonth, quarterStartMonth, today),
    }
    result.set(name, revenues)
  }
  return result
}

function buildCacheRow(name: string, rev: MemberRevenues, nowStr: string) {
  return {
    first_name:                    name,
    therapist_monthly:             rev.naturopathe.monthly,
    therapist_prev_monthly:        rev.naturopathe.prevMonthly,
    therapist_annual:              rev.naturopathe.annual,
    therapist_quarterly:           rev.naturopathe.quarterly,
    therapist_monthly_unpaid:      rev.naturopathe.monthlyUnpaid,
    therapist_annual_unpaid:       rev.naturopathe.annualUnpaid,
    therapist_quarterly_unpaid:    rev.naturopathe.quarterlyUnpaid,
    closer_monthly:                rev.closer.monthly,
    closer_prev_monthly:           rev.closer.prevMonthly,
    closer_annual:                 rev.closer.annual,
    closer_quarterly:              rev.closer.quarterly,
    closer_monthly_unpaid:         rev.closer.monthlyUnpaid,
    closer_annual_unpaid:          rev.closer.annualUnpaid,
    closer_quarterly_unpaid:       rev.closer.quarterlyUnpaid,
    setter_monthly:                rev.setter.monthly,
    setter_prev_monthly:           rev.setter.prevMonthly,
    setter_annual:                 rev.setter.annual,
    setter_quarterly:              rev.setter.quarterly,
    setter_monthly_unpaid:         rev.setter.monthlyUnpaid,
    setter_annual_unpaid:          rev.setter.annualUnpaid,
    setter_quarterly_unpaid:       rev.setter.quarterlyUnpaid,
    last_synced_at:                nowStr,
  }
}

function buildResponseFromCache(cache: Record<string, number>) {
  function roleData(prefix: string) {
    const m   = cache[`${prefix}_monthly`]   ?? 0
    const a   = cache[`${prefix}_annual`]    ?? 0
    const q   = cache[`${prefix}_quarterly`] ?? 0
    const mu  = cache[`${prefix}_monthly_unpaid`]   ?? 0
    const au  = cache[`${prefix}_annual_unpaid`]    ?? 0
    const qu  = cache[`${prefix}_quarterly_unpaid`] ?? 0
    return {
      monthly: m, prevMonthly: cache[`${prefix}_prev_monthly`] ?? 0, annual: a, quarterly: q,
      monthlyUnpaid:   mu, annualUnpaid:   au, quarterlyUnpaid:   qu,
      monthlyDeposited:   Math.max(0, m - mu),
      annualDeposited:    Math.max(0, a - au),
      quarterlyDeposited: Math.max(0, q - qu),
    }
  }
  return {
    naturopathe: roleData('therapist'),
    closer:      roleData('closer'),
    setter:      roleData('setter'),
  }
}

function buildResponse(rev: MemberRevenues, lastSynced: string, fromCache: boolean) {
  return { ...rev, last_synced_at: lastSynced, from_cache: fromCache }
}

// ─── Handler ──────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let firstName = '', forceRefresh = false
    let targetMonth: number | null = null, targetYear: number | null = null
    let targetQuarter: number | null = null
    try {
      const text = await req.text()
      const b = text ? JSON.parse(text) : {}
      firstName = String(b?.firstName ?? '').trim()
      forceRefresh = !!b?.force_refresh
      targetMonth = b?.targetMonth ? Number(b.targetMonth) : null
      targetYear = b?.targetYear ? Number(b.targetYear) : null
      targetQuarter = b?.targetQuarter ? Number(b.targetQuarter) : null
    } catch (e) {
      console.error('Body parse error:', e)
    }

    if (!firstName) return json({ error: 'firstName is required' }, 400)

    const QUARTER_MONTHS: Record<number, number[]> = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] }

    const nowCheck = new Date()
    const isHistorical = (targetQuarter !== null && targetYear !== null) ||
      (targetMonth !== null && targetYear !== null &&
        !(targetMonth === nowCheck.getMonth() + 1 && targetYear === nowCheck.getFullYear()))

    // ── Requête historique ────────────────────────────────────────
    if (isHistorical && targetYear) {
      const { data: tok2 } = await supabase.from('quickbooks_tokens').select('*').eq('id', TOKEN_ROW_ID).maybeSingle()
      if (!tok2) return json({ error: 'not_connected' })
      let accessToken2 = tok2.access_token
      if (new Date(tok2.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
        const newToken = await refreshAccessToken(supabase, tok2.refresh_token, tok2.realm_id)
        if (!newToken) return json({ error: 'token_expired' }, 401)
        accessToken2 = newToken
      }
      const yearStart = `${targetYear}-01-01`
      const yearEnd = `${targetYear}-12-31`
      const [hSales, hInvoices, hCredits] = await Promise.all([
        fetchAll(accessToken2, tok2.realm_id, 'SalesReceipt', yearStart, yearEnd),
        fetchAll(accessToken2, tok2.realm_id, 'Invoice', yearStart, yearEnd),
        fetchAll(accessToken2, tok2.realm_id, 'CreditMemo', yearStart, yearEnd),
      ])
      const hAllSales = [...hSales, ...hInvoices]
      const nameLower = firstName.toLowerCase()
      const months = targetQuarter !== null ? (QUARTER_MONTHS[targetQuarter] ?? []) : [targetMonth!]

      function pretaxH(t: Record<string, unknown>): number {
        const tax = Number((t?.TxnTaxDetail as Record<string, unknown>)?.TotalTax ?? 0)
        return Number(t.TotalAmt ?? 0) - tax
      }
      function sumForMonths(txns: Record<string, unknown>[], fieldName: string, ms: number[]) {
        return txns
          .filter(t => {
            const d = new Date(t.TxnDate as string)
            return d.getFullYear() === targetYear && ms.includes(d.getMonth() + 1) &&
              getField(t, fieldName).toLowerCase() === nameLower
          })
          .reduce((s, t) => s + pretaxH(t), 0)
      }
      function calcHistUnpaid(fieldName: string, ms: number[]) {
        return hInvoices
          .filter(t => {
            const d = new Date(t.TxnDate as string)
            return d.getFullYear() === targetYear && ms.includes(d.getMonth() + 1) &&
              getField(t, fieldName).toLowerCase() === nameLower
          })
          .reduce((s, t) => { const bal = parseFloat(String(t.Balance ?? 0)) || 0; return bal > 0 ? s + bal : s }, 0)
      }

      const roles = ['naturopathe', 'closer', 'setter'] as const
      const result: Record<string, unknown> = { targetMonth, targetQuarter, targetYear, from_cache: false }
      for (const role of roles) {
        const rev = sumForMonths(hAllSales, QB_FIELDS[role], months) - sumForMonths(hCredits, QB_FIELDS[role], months)
        const unpaid = calcHistUnpaid(QB_FIELDS[role], months)
        result[role] = { monthly: rev, monthlyUnpaid: unpaid, monthlyDeposited: Math.max(0, rev - unpaid) }
      }
      return json(result)
    }

    // ── Cache ──────────────────────────────────────────────────
    const { data: cache } = await supabase
      .from('member_revenue_cache')
      .select('*')
      .eq('first_name', firstName)
      .maybeSingle()

    if (cache && !forceRefresh) {
      const age = Date.now() - new Date(cache.last_synced_at).getTime()
      if (age < CACHE_TTL_MS) {
        console.log(`Cache hit for ${firstName}`)
        return json(buildResponse(buildResponseFromCache(cache) as unknown as MemberRevenues, cache.last_synced_at, true))
      }
    }

    // ── Tokens QB ──────────────────────────────────────────────
    const { data: tok } = await supabase.from('quickbooks_tokens').select('*').eq('id', TOKEN_ROW_ID).maybeSingle()
    if (!tok) return json({ error: 'not_connected' })

    let accessToken = tok.access_token
    if (new Date(tok.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
      const newToken = await refreshAccessToken(supabase, tok.refresh_token, tok.realm_id)
      if (!newToken) {
        if (cache) return json(buildResponse(buildResponseFromCache(cache) as unknown as MemberRevenues, cache.last_synced_at, true))
        return json({ error: 'token_expired' }, 401)
      }
      accessToken = newToken
    }

    // ── Plages de dates ───────────────────────────────────────
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const yearStart = `${year}-01-01`
    const today = now.toISOString().split('T')[0]
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1

    const prevMonthDate = new Date(year, month - 2, 1)
    const prevYear = prevMonthDate.getFullYear()
    const prevMonth = prevMonthDate.getMonth() + 1
    const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const prevMonthEnd = new Date(year, month - 1, 0).toISOString().split('T')[0]

    // ── Fetch QB (6 appels parallèles) ────────────────────────
    const [yearSalesReceipts, yearInvoices, yearCredits, prevExtraSalesReceipts, prevExtraInvoices, prevExtraCredits] = await Promise.all([
      fetchAll(accessToken, tok.realm_id, 'SalesReceipt', yearStart, today),
      fetchAll(accessToken, tok.realm_id, 'Invoice', yearStart, today),
      fetchAll(accessToken, tok.realm_id, 'CreditMemo', yearStart, today),
      prevYear < year ? fetchAll(accessToken, tok.realm_id, 'SalesReceipt', prevMonthStart, prevMonthEnd) : Promise.resolve([]),
      prevYear < year ? fetchAll(accessToken, tok.realm_id, 'Invoice', prevMonthStart, prevMonthEnd) : Promise.resolve([]),
      prevYear < year ? fetchAll(accessToken, tok.realm_id, 'CreditMemo', prevMonthStart, prevMonthEnd) : Promise.resolve([]),
    ])

    const yearSales = [...yearSalesReceipts, ...yearInvoices]
    const allPrevSales = prevYear >= year ? yearSales : [...prevExtraSalesReceipts, ...prevExtraInvoices]
    const allPrevCredits = prevYear >= year ? yearCredits : prevExtraCredits

    // ── Calculer pour TOUS les prénoms ────────────────────────
    const allRevenues = computeAllRevenues(
      yearSales, yearInvoices, yearCredits, allPrevSales, allPrevCredits,
      year, month, prevYear, prevMonth, quarterStartMonth, today
    )

    // ── Upsert cache ──────────────────────────────────────────
    const nowStr = new Date().toISOString()
    const cacheRows = [...allRevenues.entries()].map(([name, rev]) => buildCacheRow(name, rev, nowStr))
    if (cacheRows.length > 0) {
      await supabase.from('member_revenue_cache').upsert(cacheRows, { onConflict: 'first_name' })
      console.log(`Cached ${cacheRows.length} members`)
    }

    // ── Retourner les données du prénom demandé ───────────────
    let memberRev: MemberRevenues | undefined
    for (const [name, rev] of allRevenues.entries()) {
      if (name.toLowerCase() === firstName.toLowerCase()) { memberRev = rev; break }
    }

    if (!memberRev) {
      memberRev = {
        naturopathe: { monthly: 0, prevMonthly: 0, annual: 0, quarterly: 0, monthlyUnpaid: 0, quarterlyUnpaid: 0, annualUnpaid: 0, monthlyDeposited: 0, quarterlyDeposited: 0, annualDeposited: 0 },
        closer:      { monthly: 0, prevMonthly: 0, annual: 0, quarterly: 0, monthlyUnpaid: 0, quarterlyUnpaid: 0, annualUnpaid: 0, monthlyDeposited: 0, quarterlyDeposited: 0, annualDeposited: 0 },
        setter:      { monthly: 0, prevMonthly: 0, annual: 0, quarterly: 0, monthlyUnpaid: 0, quarterlyUnpaid: 0, annualUnpaid: 0, monthlyDeposited: 0, quarterlyDeposited: 0, annualDeposited: 0 },
      }
    }

    return json(buildResponse(memberRev, nowStr, false))

  } catch (err) {
    console.error('QB member revenue error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
