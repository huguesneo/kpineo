import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
  }
}

const OPP_UPSERT_EVENTS = new Set([
  'OpportunityCreate',
  'OpportunityUpdate',
  'OpportunityStageUpdate',
  'OpportunityStatusUpdate',
  'OpportunityMonetaryValueUpdate',
  'OpportunityAssignedToUpdate',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // GHL attend toujours un 200 — on log les erreurs mais on ack toujours
  const ack = (msg?: string) =>
    new Response(JSON.stringify({ ok: true, msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  try {
    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) { console.error('[GHL Webhook] GHL_API_KEY manquante'); return ack('config error') }

    // Vérifier le secret (query param ?secret=...)
    const webhookSecret = Deno.env.get('GHL_WEBHOOK_SECRET')
    if (webhookSecret) {
      const url = new URL(req.url)
      const provided = url.searchParams.get('secret') ?? req.headers.get('x-ghl-secret')
      if (provided !== webhookSecret) {
        console.warn('[GHL Webhook] Secret invalide')
        return new Response('Unauthorized', { status: 401 })
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const payload = await req.json() as Record<string, unknown>
    const eventType  = String(payload.type ?? '')
    const locationId = String(payload.locationId ?? Deno.env.get('GHL_LOCATION_ID') ?? '')

    console.log(`[GHL Webhook] ${eventType} — payload: ${JSON.stringify(payload).slice(0, 400)}`)

    // ── Suppression d'opportunité ──────────────────────────────
    if (eventType === 'OpportunityDelete') {
      const oppId = String(payload.id ?? '')
      if (oppId) {
        await supabase.from('ghl_opportunities').delete().eq('ghl_id', oppId)
        console.log(`[GHL Webhook] Opportunité supprimée: ${oppId}`)
      }
      return ack()
    }

    // ── Suppression de contact ─────────────────────────────────
    if (eventType === 'ContactDelete') {
      const contactId = String(payload.id ?? '')
      if (contactId) {
        await supabase.from('ghl_contacts').delete().eq('ghl_id', contactId)
        // Nettoyer aussi les opportunités liées à ce contact
        await supabase.from('ghl_opportunities').delete().eq('contact_id', contactId)
        console.log(`[GHL Webhook] Contact + opportunités supprimés: ${contactId}`)
      }
      return ack()
    }

    // ── Création / mise à jour d'opportunité ───────────────────
    if (OPP_UPSERT_EVENTS.has(eventType)) {
      const oppId = String(payload.id ?? '')
      if (!oppId) return ack('no id')

      // Re-fetch complet pour avoir les customFields (indispensable pour les commissions)
      const fetchRes = await fetch(`${GHL_BASE}/opportunities/${oppId}`, {
        headers: ghlHeaders(apiKey),
      })

      if (!fetchRes.ok) {
        console.error(`[GHL Webhook] Re-fetch opp ${oppId} échoué: ${fetchRes.status}`)
        return ack('refetch failed')
      }

      const fetchData  = await fetchRes.json() as Record<string, unknown>
      const opp        = (fetchData?.opportunity ?? fetchData) as Record<string, unknown>
      const pipelineId = String(opp.pipelineId ?? '')
      const stageId    = String(opp.pipelineStageId ?? '')

      // Résoudre le nom du stage depuis le pipeline en DB
      let stageName = ''
      if (pipelineId && stageId) {
        const { data: pipe } = await supabase
          .from('ghl_pipelines')
          .select('stages')
          .eq('ghl_id', pipelineId)
          .maybeSingle()
        const stages = (pipe?.stages ?? []) as Array<{ id: string; name: string }>
        stageName = stages.find(s => s.id === stageId)?.name ?? ''
      }

      await supabase.from('ghl_opportunities').upsert({
        ghl_id:            oppId,
        location_id:       locationId,
        contact_id:        String(opp.contactId ?? ''),
        contact_name:      String((opp.contact as Record<string, unknown>)?.name ?? ''),
        pipeline_id:       pipelineId,
        pipeline_stage_id: stageId,
        stage_name:        stageName,
        status:            String(opp.status ?? ''),
        monetary_value:    Number(opp.monetaryValue ?? 0),
        assigned_to:       String(opp.assignedTo ?? ''),
        source:            String(opp.source ?? ''),
        created_at_ghl:    opp.createdAt ? new Date(opp.createdAt as string).toISOString() : null,
        // closed_at : date de close GHL, sinon (opp gagnée) le passage au stage Gagné.
        closed_at:         opp.closedDate
                             ? new Date(opp.closedDate as string).toISOString()
                             : (String(opp.status ?? '').toLowerCase() === 'won' && opp.lastStageChangeAt
                                 ? new Date(opp.lastStageChangeAt as string).toISOString()
                                 : null),
        raw:               opp,
        synced_at:         new Date().toISOString(),
      }, { onConflict: 'ghl_id' })

      console.log(`[GHL Webhook] Opportunité upsertée (${eventType}): ${oppId}`)
      return ack()
    }

    // Événement non géré — on ack quand même
    console.log(`[GHL Webhook] Événement ignoré: ${eventType}`)
    return ack(`ignored: ${eventType}`)

  } catch (err) {
    console.error('[GHL Webhook] Erreur:', err)
    return ack((err as Error).message)
  }
})
