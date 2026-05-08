import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
  }
}

// ─── Fetch paginé GHL avec batch upsert ──────────────────────
async function fetchAndUpsertContacts(
  apiKey: string,
  locationId: string,
  supabase: ReturnType<typeof createClient>,
  startAfterCursor?: string,
  maxContacts = 2000,
  sinceDate?: string
): Promise<{ synced: number; nextCursor: string | null }> {
  let synced = 0
  let nextCursor: string | null = null
  let cursor: string | undefined = startAfterCursor
  const BATCH_SIZE = 500

  while (synced < maxContacts) {
    const params = new URLSearchParams({ locationId, limit: '100' })
    if (cursor) params.set('startAfter', cursor)
    if (sinceDate) params.set('startDate', sinceDate)

    const res = await fetch(`${GHL_BASE}/contacts/?${params}`, { headers: ghlHeaders(apiKey) })
    if (!res.ok) {
      console.error('GHL contacts failed:', res.status, await res.text())
      break
    }
    const data = await res.json() as Record<string, unknown>
    const contacts = (data?.contacts ?? []) as Record<string, unknown>[]

    const rows = contacts.map(c => ({
      ghl_id:         String(c.id ?? ''),
      location_id:    locationId,
      first_name:     String(c.firstName ?? ''),
      last_name:      String(c.lastName ?? ''),
      email:          String(c.email ?? ''),
      phone:          String(c.phone ?? ''),
      tags:           (c.tags ?? []) as string[],
      source:         String(c.source ?? ''),
      created_at_ghl: c.dateAdded ? new Date(c.dateAdded as string).toISOString() : null,
      raw:            c,
      synced_at:      new Date().toISOString(),
    }))

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await supabase.from('ghl_contacts').upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'ghl_id' })
    }
    synced += rows.length

    const meta = data?.meta as Record<string, unknown>
    if (contacts.length < 100 || !meta?.nextPageUrl) break

    const next = String(meta?.nextPageUrl ?? '')
    const m = next.match(/startAfter=([^&]+)/)
    if (!m) break
    cursor = m[1]

    if (synced >= maxContacts) {
      nextCursor = cursor
      break
    }
  }

  return { synced, nextCursor }
}

// ─── Pipelines + Opportunités ─────────────────────────────────
async function fetchPipelines(apiKey: string, locationId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${GHL_BASE}/opportunities/pipelines/?locationId=${locationId}`, {
    headers: ghlHeaders(apiKey),
  })
  if (!res.ok) return []
  const data = await res.json() as Record<string, unknown>
  return (data?.pipelines ?? []) as Record<string, unknown>[]
}

async function fetchOpportunities(
  apiKey: string,
  locationId: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({ location_id: locationId, limit: '100', page: String(page) })
    const res = await fetch(`${GHL_BASE}/opportunities/search?${params}`, { headers: ghlHeaders(apiKey) })
    if (!res.ok) {
      console.error('GHL opportunities failed:', res.status, await res.text())
      break
    }
    const data = await res.json() as Record<string, unknown>
    const opps = (data?.opportunities ?? []) as Record<string, unknown>[]
    results.push(...opps)
    const meta = data?.meta as Record<string, unknown>
    if (opps.length < 100 || !meta?.nextPage) break
    page++
  }
  return results
}

async function syncOpportunities(
  apiKey: string,
  locationId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ pipelines: number; opportunities: number }> {
  const [pipelines, opps] = await Promise.all([
    fetchPipelines(apiKey, locationId),
    fetchOpportunities(apiKey, locationId),
  ])

  if (pipelines.length > 0) {
    await supabase.from('ghl_pipelines').upsert(
      pipelines.map(p => ({
        ghl_id:      String(p.id ?? ''),
        location_id: locationId,
        name:        String(p.name ?? ''),
        stages:      p.stages ?? [],
        synced_at:   new Date().toISOString(),
      })),
      { onConflict: 'ghl_id' }
    )
  }

  const stageNameMap: Record<string, string> = {}
  for (const p of pipelines) {
    const stages = (p.stages ?? []) as Array<{ id: string; name: string }>
    for (const s of stages) {
      if (s.id) stageNameMap[s.id] = s.name
    }
  }

  const oppRows = opps.map(o => ({
    ghl_id:            String(o.id ?? ''),
    location_id:       locationId,
    contact_id:        String(o.contactId ?? ''),
    contact_name:      String((o.contact as Record<string, unknown>)?.name ?? ''),
    pipeline_id:       String(o.pipelineId ?? ''),
    pipeline_stage_id: String(o.pipelineStageId ?? ''),
    stage_name:        stageNameMap[String(o.pipelineStageId ?? '')] ?? String((o.pipelineStage as Record<string, unknown>)?.name ?? ''),
    status:            String(o.status ?? ''),
    monetary_value:    Number(o.monetaryValue ?? 0),
    assigned_to:       String(o.assignedTo ?? ''),
    source:            String(o.source ?? ''),
    created_at_ghl:    o.createdAt ? new Date(o.createdAt as string).toISOString() : null,
    closed_at:         o.closedDate ? new Date(o.closedDate as string).toISOString() : null,
    raw:               o,
    synced_at:         new Date().toISOString(),
  }))

  if (oppRows.length > 0) {
    await supabase.from('ghl_opportunities').upsert(oppRows, { onConflict: 'ghl_id' })
  }

  return { pipelines: pipelines.length, opportunities: oppRows.length }
}

// ─── Handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) return json({ error: 'GHL_API_KEY non configurée' }, 500)

    const DEFAULT_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID') ?? 'YG2spvWJqnD75L3V95UJ'

    let action = 'test', locationId = '', startAfterCursor: string | undefined, maxContacts = 2000
    try {
      const text = await req.text()
      const b = text ? JSON.parse(text) : {}
      action = b?.action ?? 'test'
      locationId = b?.locationId ?? ''
      startAfterCursor = b?.startAfterCursor ?? undefined
      maxContacts = b?.maxContacts ?? 2000
    } catch { /* ok */ }

    // ── Test de connexion ──
    if (action === 'test') {
      const testLocId = locationId || DEFAULT_LOCATION_ID
      if (testLocId) {
        const testRes = await fetch(
          `${GHL_BASE}/contacts/?locationId=${testLocId}&limit=1`,
          { headers: ghlHeaders(apiKey) }
        )
        if (!testRes.ok) {
          const errText = await testRes.text()
          return json({ error: `Token GHL invalide (${testRes.status}) : ${errText}` })
        }
        return json({ ok: true, locations: [{ id: testLocId, name: 'NEO Performance' }] })
      }
      const agencyRes = await fetch(`${GHL_BASE}/locations/search?limit=10`, { headers: ghlHeaders(apiKey) })
      if (agencyRes.ok) {
        const data = await agencyRes.json()
        return json({ ok: true, locations: data?.locations ?? [] })
      }
      return json({ ok: true, locations: [] })
    }

    if (!locationId) return json({ error: 'locationId requis' }, 400)

    // ── Sync contacts (full, paginée) ──
    if (action === 'sync_contacts') {
      const { synced, nextCursor } = await fetchAndUpsertContacts(
        apiKey, locationId, supabase, startAfterCursor, maxContacts
      )
      // Mettre à jour last_synced_at seulement à la fin (pas de nextCursor)
      if (!nextCursor) {
        await supabase.from('ghl_config')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('location_id', locationId)
      }
      return json({ ok: true, synced, nextCursor })
    }

    // ── Sync opportunités (full) ──
    if (action === 'sync_opportunities') {
      const result = await syncOpportunities(apiKey, locationId, supabase)
      await supabase.from('ghl_config')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('location_id', locationId)
      return json({ ok: true, ...result })
    }

    // ── Sync incrémentale (cron toutes les 30 min) ──
    if (action === 'sync_incremental') {
      const locId = locationId || DEFAULT_LOCATION_ID

      // Lire la dernière sync depuis ghl_config
      const { data: cfg } = await supabase
        .from('ghl_config')
        .select('last_synced_at')
        .eq('location_id', locId)
        .maybeSingle()

      const sinceDate = cfg?.last_synced_at ?? undefined
      const now = new Date().toISOString()

      // Nouveaux contacts depuis la dernière sync seulement
      const { synced: newContacts } = await fetchAndUpsertContacts(
        apiKey, locId, supabase, undefined, 5000, sinceDate
      )

      // Opportunités : toujours full sync (changements de stage fréquents)
      const { pipelines, opportunities } = await syncOpportunities(apiKey, locId, supabase)

      // Mettre à jour le timestamp de dernière sync
      await supabase.from('ghl_config')
        .update({ last_synced_at: now })
        .eq('location_id', locId)

      console.log(`Incremental sync: +${newContacts} contacts, ${opportunities} opps (since ${sinceDate ?? 'beginning'})`)
      return json({ ok: true, newContacts, pipelines, opportunities, syncedAt: now })
    }

    return json({ error: `Action inconnue: ${action}` }, 400)

  } catch (err) {
    console.error('GHL sync error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
