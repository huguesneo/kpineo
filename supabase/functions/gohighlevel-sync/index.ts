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

// ─── Fetch paginé GHL ────────────────────────────────────────
async function fetchAllContacts(
  apiKey: string,
  locationId: string,
  startAfter?: string
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let nextCursor: string | undefined = undefined

  while (true) {
    const params = new URLSearchParams({ locationId, limit: '100' })
    if (nextCursor) params.set('startAfter', nextCursor)

    const res = await fetch(`${GHL_BASE}/contacts/?${params}`, { headers: ghlHeaders(apiKey) })
    if (!res.ok) {
      console.error('GHL contacts failed:', res.status, await res.text())
      break
    }
    const data = await res.json() as Record<string, unknown>
    const contacts = (data?.contacts ?? []) as Record<string, unknown>[]
    results.push(...contacts)

    const meta = data?.meta as Record<string, unknown>
    if (contacts.length < 100 || !meta?.nextPageUrl) break
    // Extract cursor from nextPageUrl if available
    const next = String(meta?.nextPageUrl ?? '')
    const m = next.match(/startAfter=([^&]+)/)
    if (!m) break
    nextCursor = m[1]
  }
  return results
}

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
  pipelineId?: string
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({ location_id: locationId, limit: '100', page: String(page) })
    if (pipelineId) params.set('pipeline_id', pipelineId)

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

    let action = 'test', locationId = ''
    try {
      const text = await req.text()
      const b = text ? JSON.parse(text) : {}
      action = b?.action ?? 'test'
      locationId = b?.locationId ?? ''
    } catch { /* ok */ }

    // ── Test de connexion ──
    if (action === 'test') {
      const testLocId = locationId || DEFAULT_LOCATION_ID

      if (testLocId) {
        // Validate with contacts endpoint — works with sub-account PIT tokens
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

      // No locationId — try agency endpoint
      const agencyRes = await fetch(`${GHL_BASE}/locations/search?limit=10`, { headers: ghlHeaders(apiKey) })
      if (agencyRes.ok) {
        const data = await agencyRes.json()
        return json({ ok: true, locations: data?.locations ?? [] })
      }

      return json({ ok: true, locations: [] })
    }

    if (!locationId) return json({ error: 'locationId requis' }, 400)

    // ── Sync contacts ──
    if (action === 'sync_contacts') {
      const contacts = await fetchAllContacts(apiKey, locationId)
      const rows = contacts.map(c => ({
        ghl_id:       String(c.id ?? ''),
        location_id:  locationId,
        first_name:   String(c.firstName ?? ''),
        last_name:    String(c.lastName ?? ''),
        email:        String(c.email ?? ''),
        phone:        String(c.phone ?? ''),
        tags:         (c.tags ?? []) as string[],
        source:       String(c.source ?? ''),
        created_at_ghl: c.dateAdded ? new Date(c.dateAdded as string).toISOString() : null,
        raw:          c,
        synced_at:    new Date().toISOString(),
      }))

      if (rows.length > 0) {
        await supabase.from('ghl_contacts').upsert(rows, { onConflict: 'ghl_id' })
      }
      return json({ ok: true, synced: rows.length })
    }

    // ── Sync opportunités ──
    if (action === 'sync_opportunities') {
      const [pipelines, opps] = await Promise.all([
        fetchPipelines(apiKey, locationId),
        fetchOpportunities(apiKey, locationId),
      ])

      // Upsert pipelines
      if (pipelines.length > 0) {
        await supabase.from('ghl_pipelines').upsert(
          pipelines.map(p => ({
            ghl_id: String(p.id ?? ''),
            location_id: locationId,
            name: String(p.name ?? ''),
            stages: p.stages ?? [],
            synced_at: new Date().toISOString(),
          })),
          { onConflict: 'ghl_id' }
        )
      }

      // Upsert opportunités
      const oppRows = opps.map(o => ({
        ghl_id:        String(o.id ?? ''),
        location_id:   locationId,
        contact_id:    String(o.contactId ?? ''),
        contact_name:  String(o.contact?.name ?? ''),
        pipeline_id:   String(o.pipelineId ?? ''),
        pipeline_stage_id: String(o.pipelineStageId ?? ''),
        stage_name:    String(o.pipelineStage?.name ?? o.stage?.name ?? ''),
        status:        String(o.status ?? ''),
        monetary_value: Number(o.monetaryValue ?? 0),
        assigned_to:   String(o.assignedTo ?? ''),
        source:        String(o.source ?? ''),
        created_at_ghl: o.createdAt ? new Date(o.createdAt as string).toISOString() : null,
        closed_at:     o.closedDate ? new Date(o.closedDate as string).toISOString() : null,
        raw:           o,
        synced_at:     new Date().toISOString(),
      }))

      if (oppRows.length > 0) {
        await supabase.from('ghl_opportunities').upsert(oppRows, { onConflict: 'ghl_id' })
      }

      return json({ ok: true, pipelines: pipelines.length, opportunities: oppRows.length })
    }

    return json({ error: `Action inconnue: ${action}` }, 400)

  } catch (err) {
    console.error('GHL sync error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
