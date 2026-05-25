import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'

// Normalise un nom pour le matching (minuscules, espaces simples, sans accents)
function normName(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

// Normalise un nom de campagne/ad (insensible casse + espaces)
function normTag(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

async function getQBToken(supabase: ReturnType<typeof createClient>): Promise<{ token: string; realmId: string } | null> {
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

// ── Dépenses Meta par ad pour la période (clé = ad_id) ──────────
async function fetchMetaSpend(startDate: string, endDate: string): Promise<{ byAdId: Map<string, number>; byCampaignName: Map<string, number>; adNameById: Map<string, string>; campaignNameByAdId: Map<string, string> } | null> {
  const token = Deno.env.get('META_ACCESS_TOKEN') ?? ''
  const adAccountId = Deno.env.get('META_AD_ACCOUNT_ID') ?? ''
  if (!token || !adAccountId) return null

  const params = new URLSearchParams({
    fields: 'ad_id,ad_name,campaign_name,spend',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'ad',
    limit: '500',
    access_token: token,
  })
  const res = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/insights?${params}`)
  if (!res.ok) { console.error('Meta spend fetch failed:', res.status, await res.text()); return null }
  const json = await res.json() as { data: Record<string, unknown>[] }

  const byAdId = new Map<string, number>()
  const byCampaignName = new Map<string, number>()
  const adNameById = new Map<string, string>()
  const campaignNameByAdId = new Map<string, string>()
  for (const row of (json.data ?? [])) {
    const adId = String(row.ad_id ?? '')
    const campName = String(row.campaign_name ?? '')
    const spend = Number(row.spend ?? 0)
    if (adId) { byAdId.set(adId, spend); adNameById.set(adId, String(row.ad_name ?? '')); campaignNameByAdId.set(adId, campName) }
    if (campName) byCampaignName.set(campName, (byCampaignName.get(campName) ?? 0) + spend)
  }
  return { byAdId, byCampaignName, adNameById, campaignNameByAdId }
}

async function fetchQBEntity(entity: string, token: string, realmId: string, startDate: string, endDate: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let startPos = 1
  while (true) {
    const query = `SELECT * FROM ${entity} WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' STARTPOSITION ${startPos} MAXRESULTS 1000`
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
    if (!res.ok) { console.error(`QB ${entity} batch failed:`, res.status, await res.text()); break }
    const data = await res.json() as Record<string, unknown>
    const batch = ((data?.QueryResponse as Record<string, unknown>)?.[entity] ?? []) as Record<string, unknown>[]
    results.push(...batch)
    if (batch.length < 1000) break
    startPos += 1000
  }
  return results
}

// Calendriers "Rencontre découverte" (exclut le calendrier de suivi)
const DISCOVERY_CALENDAR_IDS = [
  '4227QzeKvFczi5BZyHOC',
  'DIN6EPtG7eNU3Gf6ZRoC',
  'ucyJmhYKKDDm7U5JmaJ8',
]

interface LeadDetail { name: string; email: string; revenueLTV: number; revenuePeriod: number; reservation: boolean; held: boolean; reservationDate: string }

interface AttRow {
  leads: number
  reservations: number
  attended: number
  clientsLTV: number
  revenueLTV: number
  clientsPeriodSet: Set<string>
  revenuePeriod: number
  leadList: LeadDetail[]
}

function emptyRow(): AttRow {
  return { leads: 0, reservations: 0, attended: 0, clientsLTV: 0, revenueLTV: 0, clientsPeriodSet: new Set(), revenuePeriod: 0, leadList: [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({})) as { startDate?: string; endDate?: string }
    const { startDate, endDate } = body
    if (!startDate || !endDate) return json({ error: 'startDate et endDate requis' }, 400)

    // ── 1. Données Meta (métadonnées + dépenses réelles de la période) ──
    const [{ data: campaigns }, { data: ads }, metaSpend] = await Promise.all([
      supabase.from('meta_campaigns').select('meta_id, name'),
      supabase.from('meta_ads').select('meta_id, name, campaign_id'),
      fetchMetaSpend(startDate, endDate),
    ])

    // ── 2. Contacts de la cohorte (créés dans la période, avec UTM) ─────
    const { data: contacts } = await supabase
      .from('ghl_contacts')
      .select('ghl_id, first_name, last_name, email, utm_campaign, utm_content, created_at_ghl')
      .gte('created_at_ghl', `${startDate}T00:00:00Z`)
      .lte('created_at_ghl', `${endDate}T23:59:59Z`)
      .neq('utm_campaign', '')

    // ── 2b. TOUS les contacts UTM (pour attribuer le cash période des anciens clients) ──
    const { data: allUtmContacts } = await supabase
      .from('ghl_contacts')
      .select('first_name, last_name, email, utm_campaign, utm_content')
      .neq('utm_campaign', '')
    const nameToTags  = new Map<string, { campKey: string; adKey: string }>()
    const emailToTags = new Map<string, { campKey: string; adKey: string }>()
    for (const c of (allUtmContacts ?? [])) {
      const tags = { campKey: normTag(String(c.utm_campaign ?? '')), adKey: normTag(String(c.utm_content ?? '')) }
      const nm = normName(`${c.first_name ?? ''} ${c.last_name ?? ''}`)
      const em = String(c.email ?? '').toLowerCase().trim()
      if (nm && !nameToTags.has(nm)) nameToTags.set(nm, tags)
      if (em && !emailToTags.has(em)) emailToTags.set(em, tags)
    }

    // ── 2c. Réservations (rencontres découvertes) par contact — date + statut tenu ──
    const reservedDateByContact = new Map<string, string>()
    const heldContactIds = new Set<string>()  // RDV réellement tenu (showed/attended)
    const { data: appts } = await supabase
      .from('ghl_appointments')
      .select('contact_id, calendar_id, start_time, status')
      .in('calendar_id', DISCOVERY_CALENDAR_IDS)
    for (const a of (appts ?? [])) {
      if (!a.contact_id) continue
      const id = String(a.contact_id)
      const d = a.start_time ? String(a.start_time) : ''
      const cur = reservedDateByContact.get(id)
      if (cur === undefined || (d && d > cur)) reservedDateByContact.set(id, d)
      if (a.status === 'showed' || a.status === 'attended') heldContactIds.add(id)
    }

    // ── 3. Transactions QuickBooks (reçus + remboursements) ─────────────
    // Chaque transaction garde nom + email pour un matching fiable, et un id pour dédupliquer.
    interface Txn { id: string; email: string; name: string; amt: number; inPeriod: boolean }
    const txns: Txn[] = []
    const byEmail = new Map<string, Txn[]>()
    const byName  = new Map<string, Txn[]>()
    const qbAuth = await getQBToken(supabase)
    let qbConnected = false
    if (qbAuth) {
      qbConnected = true
      const todayISO = new Date().toISOString().slice(0, 10)
      const upper = endDate > todayISO ? endDate : todayISO
      const [receipts, refunds] = await Promise.all([
        fetchQBEntity('SalesReceipt',  qbAuth.token, qbAuth.realmId, startDate, upper),
        fetchQBEntity('RefundReceipt', qbAuth.token, qbAuth.realmId, startDate, upper),
      ])
      const inPeriod = (d: string) => d >= startDate && d <= endDate
      const apply = (list: Record<string, unknown>[], sign: number, type: string) => {
        for (const r of list) {
          const name  = normName(String((r.CustomerRef as Record<string, unknown>)?.name ?? ''))
          const email = String((r.BillEmail as Record<string, unknown>)?.Address ?? '').toLowerCase().trim()
          if (!name && !email) continue
          // Montant AVANT taxes = total − taxes
          const tax = Number((r.TxnTaxDetail as Record<string, unknown>)?.TotalTax ?? 0)
          const preTax = Number(r.TotalAmt ?? 0) - tax
          const t: Txn = { id: `${type}_${r.Id}`, email, name, amt: sign * preTax, inPeriod: inPeriod(String(r.TxnDate ?? '')) }
          txns.push(t)
          if (email) { if (!byEmail.has(email)) byEmail.set(email, []); byEmail.get(email)!.push(t) }
          if (name)  { if (!byName.has(name))  byName.set(name, []);  byName.get(name)!.push(t) }
        }
      }
      apply(receipts, 1, 'S')
      apply(refunds, -1, 'R')
    }

    // Revenu d'un contact = union dédupliquée des reçus matchés par email OU par nom
    function revFor(email: string, name: string): { ltv: number; period: number } {
      const seen = new Set<string>()
      let ltv = 0, period = 0
      const list = [...(email ? byEmail.get(email) ?? [] : []), ...(name ? byName.get(name) ?? [] : [])]
      for (const t of list) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        ltv += t.amt
        if (t.inPeriod) period += t.amt
      }
      return { ltv, period }
    }

    // ── 4. Agréger par campagne et par ad ───────────────────────────────
    const byCampaign = new Map<string, AttRow>()
    const byAd = new Map<string, AttRow>()
    const ensure = (m: Map<string, AttRow>, k: string) => { if (!m.has(k)) m.set(k, emptyRow()); return m.get(k)! }

    // 4a. Cohorte : leads, réservations, revenu LTV (matché par email OU nom)
    for (const c of (contacts ?? [])) {
      const campKey = normTag(String(c.utm_campaign ?? ''))
      const adKey   = normTag(String(c.utm_content ?? ''))
      const displayName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
      const fullName = normName(displayName)
      const email = String(c.email ?? '').toLowerCase().trim()
      const cid = String(c.ghl_id ?? '')
      const reservationDate = reservedDateByContact.get(cid) ?? ''
      const reservation = reservedDateByContact.has(cid)
      const held = heldContactIds.has(cid)
      const { ltv: revLTV, period: revPer } = revFor(email, fullName)
      const detail: LeadDetail = { name: displayName, email, revenueLTV: revLTV, revenuePeriod: revPer, reservation, held, reservationDate }

      for (const [m, key] of [[byCampaign, campKey], [byAd, adKey]] as [Map<string, AttRow>, string][]) {
        if (!key) continue
        const row = ensure(m, key)
        row.leads += 1
        if (reservation) row.reservations += 1
        if (held) row.attended += 1
        row.leadList.push(detail)
        if (revLTV > 0) { row.clientsLTV += 1; row.revenueLTV += revLTV }
      }
    }

    // 4b. Modèle "encaissé période" : chaque transaction de la période attribuée à l'ad d'origine du client (même ancien)
    const periodSeen = new Set<string>()
    for (const t of txns) {
      if (!t.inPeriod || t.amt === 0 || periodSeen.has(t.id)) continue
      periodSeen.add(t.id)
      const tags = (t.email && emailToTags.get(t.email)) || (t.name && nameToTags.get(t.name))
      if (!tags) continue
      const customer = t.email || t.name
      const amt = t.amt
      if (tags.campKey) { const row = ensure(byCampaign, tags.campKey); row.revenuePeriod += amt; if (amt > 0) row.clientsPeriodSet.add(customer) }
      if (tags.adKey)   { const row = ensure(byAd, tags.adKey);       row.revenuePeriod += amt; if (amt > 0) row.clientsPeriodSet.add(customer) }
    }

    // ── 5. Dépenses réelles de la période (depuis Meta) + ROAS ──────────
    // Dépenses par campagne (clé normTag du nom) depuis les insights Meta
    const spendByCampaignName = new Map<string, number>()
    if (metaSpend) {
      for (const [campName, spend] of metaSpend.byCampaignName) {
        spendByCampaignName.set(normTag(campName), spend)
      }
    }
    // Dépenses par ad (clé = meta_id de l'ad)
    const spendByAdId = metaSpend?.byAdId ?? new Map<string, number>()

    const shape = (att: AttRow) => ({
      leads: att.leads,
      reservations: att.reservations,
      attended: att.attended,
      clientsLTV: att.clientsLTV,
      revenueLTV: att.revenueLTV,
      clientsPeriod: att.clientsPeriodSet.size,
      revenuePeriod: att.revenuePeriod,
      leadList: att.leadList,
    })

    // Fusionne plusieurs AttRow (ex: leads matchés par nom + par ID de campagne).
    // Pas de double-comptage : chaque contact n'a qu'une valeur utm_campaign donc une seule clé.
    const mergeRows = (...rows: (AttRow | undefined)[]): AttRow => {
      const out = emptyRow()
      for (const r of rows) {
        if (!r) continue
        out.leads += r.leads
        out.reservations += r.reservations
        out.attended += r.attended
        out.clientsLTV += r.clientsLTV
        out.revenueLTV += r.revenueLTV
        out.revenuePeriod += r.revenuePeriod
        for (const c of r.clientsPeriodSet) out.clientsPeriodSet.add(c)
        out.leadList.push(...r.leadList)
      }
      return out
    }

    const campaignResults = (campaigns ?? []).map(camp => {
      // matche par nom (insensible casse) OU par ID Meta de la campagne (cas où l'UTM = {{campaign.id}})
      const att = mergeRows(byCampaign.get(normTag(camp.name)), byCampaign.get(String(camp.meta_id)))
      return { meta_id: camp.meta_id, name: camp.name, spend: spendByCampaignName.get(normTag(camp.name)) ?? 0, ...shape(att) }
    })

    const adResults = (ads ?? []).map(ad => {
      // matche par nom OU par ID Meta de l'ad (cas où l'UTM content = {{ad.id}})
      const att = mergeRows(byAd.get(normTag(ad.name)), byAd.get(String(ad.meta_id)))
      return { meta_id: ad.meta_id, name: ad.name, campaign_id: ad.campaign_id, spend: spendByAdId.get(ad.meta_id) ?? 0, ...shape(att) }
    })

    const payload = {
      qbConnected,
      contactsMatched: contacts?.length ?? 0,
      adAccountId: Deno.env.get('META_AD_ACCOUNT_ID') ?? '',
      campaigns: campaignResults,
      ads: adResults,
    }

    // Mettre en cache pour des chargements instantanés
    await supabase.from('meta_attribution_cache').upsert(
      { cache_key: `${startDate}_${endDate}`, payload, computed_at: new Date().toISOString() },
      { onConflict: 'cache_key' },
    )

    return json(payload)

  } catch (err) {
    console.error('meta-attribution error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
