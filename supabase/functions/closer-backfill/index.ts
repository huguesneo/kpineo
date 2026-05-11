import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GHL_PIPELINE_CLOSER  = 'YPTruORTl0LOSdS2vWJS'
const GHL_FIELD_CLOSER     = 'JSltN3nE7nm4cUjuGxTs'
const GHL_FIELD_DATE_CLOSE = 'UPqvJX8MkZ4thsPX2tjV'

function getGHLField(raw: Record<string, unknown>, fieldId: string): unknown {
  const fields = (raw?.customFields ?? []) as Record<string, unknown>[]
  const f = fields.find(f =>
    f.id === fieldId ||
    (f as Record<string, unknown>).key === fieldId ||
    (f as Record<string, unknown>).fieldKey === fieldId
  )
  if (!f) return null
  return (f as Record<string, unknown>).fieldValueNumber
    ?? (f as Record<string, unknown>).fieldValueString
    ?? (f as Record<string, unknown>).fieldValueDate
    ?? (f as Record<string, unknown>).value
    ?? null
}

function parseGHLDate(v: unknown): Date | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n > 9_999_999_999 ? n : n * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

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

    const body = await req.json().catch(() => ({})) as { dryRun?: boolean }
    const dryRun = body.dryRun === true

    // Lire toutes les opportunités Gagné du pipeline closer
    const { data: ghlOpps, error: oppsErr } = await supabase
      .from('ghl_opportunities')
      .select('contact_name, raw, closed_at, stage_name')
      .eq('pipeline_id', GHL_PIPELINE_CLOSER)

    if (oppsErr) return json({ error: oppsErr.message }, 500)

    type GHLOpp = { contact_name: string | null; raw: Record<string, unknown> | null; closed_at: string | null; stage_name: string | null }
    const opps = (ghlOpps as GHLOpp[]) ?? []
    console.log(`[Backfill] ${opps.length} opportunités dans le pipeline closer`)

    const rows: { closer_name: string; client_name: string; client_name_lower: string; first_close_date: string | null }[] = []
    const skipped: string[] = []

    for (const opp of opps) {
      // Filtrer stage Gagné
      const rawObj = opp.raw ?? {}
      const stageName = String(opp.stage_name ?? (rawObj.pipelineStage as Record<string, unknown> | undefined)?.name ?? '')
      if (!stageName.includes('Gagné')) continue

      // Extraire le prénom du closer (normalisé en minuscules)
      const closerRaw = String(getGHLField(rawObj, GHL_FIELD_CLOSER) ?? '').trim()
      if (!closerRaw) { skipped.push(String(opp.contact_name ?? '')); continue }
      const closerFirstName = closerRaw.toLowerCase().split(' ')[0]

      // Extraire le nom du client
      const clientName = String(opp.contact_name ?? '').trim()
      if (!clientName) continue

      // Extraire la date de close
      const closeDateRaw = String(getGHLField(rawObj, GHL_FIELD_DATE_CLOSE) ?? '') || null
      const closeDate = parseGHLDate(closeDateRaw) ?? (opp.closed_at ? new Date(opp.closed_at) : null)
      const closeDateStr = closeDate ? closeDate.toISOString().split('T')[0] : null

      rows.push({
        closer_name:       closerFirstName,
        client_name:       clientName,
        client_name_lower: clientName.toLowerCase(),
        first_close_date:  closeDateStr,
      })
    }

    // Dédoublonner : garder la date de close la plus ancienne par (closer, client)
    const deduped = new Map<string, typeof rows[0]>()
    for (const row of rows) {
      const key = `${row.closer_name}||${row.client_name_lower}`
      const existing = deduped.get(key)
      if (!existing) { deduped.set(key, row); continue }
      // Garder la date la plus ancienne
      if (row.first_close_date && (!existing.first_close_date || row.first_close_date < existing.first_close_date)) {
        deduped.set(key, row)
      }
    }

    const finalRows = [...deduped.values()]
    console.log(`[Backfill] ${finalRows.length} entrées à insérer (${skipped.length} sans closer ignorés)`)

    // Résumé par closer
    const summary: Record<string, number> = {}
    for (const r of finalRows) { summary[r.closer_name] = (summary[r.closer_name] ?? 0) + 1 }
    console.log('[Backfill] Résumé:', JSON.stringify(summary))

    if (dryRun) {
      return json({ dryRun: true, totalRows: finalRows.length, summary, skippedCount: skipped.length, sample: finalRows.slice(0, 10) })
    }

    // Insérer par lots de 100
    let inserted = 0
    for (let i = 0; i < finalRows.length; i += 100) {
      const batch = finalRows.slice(i, i + 100)
      const { error } = await supabase
        .from('closer_client_assignments')
        .upsert(batch, { onConflict: 'closer_name,client_name_lower', ignoreDuplicates: true })
      if (error) { console.error('[Backfill] upsert error:', error.message); continue }
      inserted += batch.length
    }

    console.log(`[Backfill] ${inserted} lignes insérées/mises à jour`)
    return json({ success: true, totalRows: finalRows.length, inserted, summary, skippedCount: skipped.length })

  } catch (err) {
    console.error('closer-backfill error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
