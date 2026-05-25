import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_BASE = 'https://graph.facebook.com/v19.0'

function metaUrl(path: string, params: Record<string, string>) {
  const token = Deno.env.get('META_ACCESS_TOKEN') ?? ''
  const p = new URLSearchParams({ ...params, access_token: token })
  return `${META_BASE}${path}?${p}`
}

async function syncCampaigns(supabase: ReturnType<typeof createClient>, adAccountId: string) {
  const fields = [
    'id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget',
    'budget_remaining', 'start_time', 'stop_time', 'created_time', 'updated_time',
  ].join(',')

  const res = await fetch(metaUrl(`/${adAccountId}/campaigns`, {
    fields,
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
    limit: '500',
  }))

  if (!res.ok) {
    const txt = await res.text()
    console.error('Meta campaigns error:', res.status, txt)
    return { synced: 0, error: txt }
  }

  const json = await res.json() as { data: Record<string, unknown>[] }
  const campaigns = json.data ?? []

  const rows = campaigns.map(c => ({
    meta_id:          String(c.id ?? ''),
    name:             String(c.name ?? ''),
    status:           String(c.status ?? ''),
    objective:        String(c.objective ?? ''),
    daily_budget:     c.daily_budget ? Number(c.daily_budget) / 100 : null,
    lifetime_budget:  c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
    budget_remaining: c.budget_remaining ? Number(c.budget_remaining) / 100 : null,
    start_time:       c.start_time ? new Date(c.start_time as string).toISOString() : null,
    stop_time:        c.stop_time ? new Date(c.stop_time as string).toISOString() : null,
    created_time:     c.created_time ? new Date(c.created_time as string).toISOString() : null,
    synced_at:        new Date().toISOString(),
  }))

  if (rows.length > 0) {
    await supabase.from('meta_campaigns').upsert(rows, { onConflict: 'meta_id' })
  }

  return { synced: rows.length, error: null }
}

async function syncAds(supabase: ReturnType<typeof createClient>, adAccountId: string) {
  // Étape 1 : récupérer les ads (infos de base seulement)
  const adFields = ['id', 'name', 'status', 'campaign_id', 'adset_id', 'adset{name,daily_budget}'].join(',')

  const res = await fetch(metaUrl(`/${adAccountId}/ads`, {
    fields: adFields,
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
    limit: '100',
  }))

  if (!res.ok) {
    const txt = await res.text()
    console.error('Meta ads error:', res.status, txt)
    return { synced: 0, error: txt }
  }

  const json = await res.json() as { data: Record<string, unknown>[] }
  const ads = json.data ?? []
  if (ads.length === 0) return { synced: 0, error: null }

  // Étape 2 : récupérer les insights séparément via l'endpoint insights du compte
  const insightFields = 'impressions,clicks,spend,cpm,cpc,ctr,actions,action_values'
  const insRes = await fetch(metaUrl(`/${adAccountId}/insights`, {
    fields: `ad_id,ad_name,${insightFields}`,
    date_preset: 'last_30d',
    level: 'ad',
    limit: '500',
  }))

  const insightsMap: Record<string, Record<string, unknown>> = {}
  if (insRes.ok) {
    const insJson = await insRes.json() as { data: Record<string, unknown>[] }
    for (const ins of insJson.data ?? []) {
      insightsMap[String(ins.ad_id ?? '')] = ins
    }
  } else {
    console.error('Meta insights error:', insRes.status, await insRes.text())
  }

  const rows = ads.map(ad => {
    const adset = ad.adset as Record<string, unknown> | undefined
    const ins = insightsMap[String(ad.id ?? '')] ?? {}
    const actions = (ins.actions as Record<string, unknown>[] | undefined) ?? []
    const leads = actions.find(a => a.action_type === 'lead')?.value
    const purchases = actions.find(a => a.action_type === 'purchase')?.value
    const actionValues = (ins.action_values as Record<string, unknown>[] | undefined) ?? []
    const purchaseValue = actionValues.find(a => a.action_type === 'purchase')?.value

    return {
      meta_id:        String(ad.id ?? ''),
      name:           String(ad.name ?? ''),
      status:         String(ad.status ?? ''),
      campaign_id:    String(ad.campaign_id ?? ''),
      adset_id:       String(ad.adset_id ?? ''),
      adset_name:     adset ? String(adset.name ?? '') : null,
      adset_budget:   adset?.daily_budget ? Number(adset.daily_budget) / 100 : null,
      thumbnail_url:  null,
      ad_title:       null,
      ad_body:        null,
      impressions:    ins.impressions ? Number(ins.impressions) : 0,
      clicks:         ins.clicks ? Number(ins.clicks) : 0,
      spend:          ins.spend ? Number(ins.spend) : 0,
      cpm:            ins.cpm ? Number(ins.cpm) : 0,
      cpc:            ins.cpc ? Number(ins.cpc) : 0,
      ctr:            ins.ctr ? Number(ins.ctr) : 0,
      leads:          leads ? Number(leads) : 0,
      purchases:      purchases ? Number(purchases) : 0,
      purchase_value: purchaseValue ? Number(purchaseValue) : 0,
      synced_at:      new Date().toISOString(),
    }
  })

  if (rows.length > 0) {
    await supabase.from('meta_ads').upsert(rows, { onConflict: 'meta_id' })
  }

  return { synced: rows.length, error: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const adAccountId = Deno.env.get('META_AD_ACCOUNT_ID') ?? ''
    if (!adAccountId) return new Response(JSON.stringify({ error: 'META_AD_ACCOUNT_ID not set' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    const body = await req.json().catch(() => ({})) as { action?: string; date_start?: string; date_end?: string }
    const action = body.action ?? 'sync_all'

    if (action === 'sync_campaigns') {
      const result = await syncCampaigns(supabase, adAccountId)
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'sync_ads') {
      const result = await syncAds(supabase, adAccountId)
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'fetch_insights') {
      const { date_start, date_end } = body
      if (!date_start || !date_end) {
        return new Response(JSON.stringify({ error: 'date_start and date_end required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const insightFields = 'impressions,clicks,spend,cpm,cpc,ctr,actions,action_values'
      const insRes = await fetch(metaUrl(`/${adAccountId}/insights`, {
        fields: `ad_id,ad_name,campaign_id,adset_id,${insightFields}`,
        time_range: JSON.stringify({ since: date_start, until: date_end }),
        level: 'ad',
        limit: '500',
      }))
      if (!insRes.ok) {
        const txt = await insRes.text()
        return new Response(JSON.stringify({ error: txt }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const insJson = await insRes.json()
      return new Response(JSON.stringify(insJson), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // sync_all
    const [camps, adsResult] = await Promise.all([
      syncCampaigns(supabase, adAccountId),
      syncAds(supabase, adAccountId),
    ])

    return new Response(JSON.stringify({ campaigns: camps, ads: adsResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
