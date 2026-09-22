import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GHL_BASE                = 'https://services.leadconnectorhq.com'
const GHL_VERSION             = '2021-07-28'
const GHL_STAGE_EN_DECISION_NAME = '🤔 En décision'

// Dans les deux nouveaux pipelines (« 📞 pipeline setting » et « 🎯 Vente »),
// c'est un workflow GHL qui déplace la carte : l'app n'y touche pas, sinon
// le déplacement se ferait deux fois.
// Il ne reste donc que l'ancien pipeline « Rencontre découverte », pour les
// contacts d'avant la bascule. Sans carte là, la fonction ne fait rien.
const CIBLES = [
  { pipelineId: 'YPTruORTl0LOSdS2vWJS', stageId: '31037861-7e3a-4051-b64d-467e90cadc8b', label: 'Rencontre découverte' },
]

function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!req.headers.get('Authorization')) return json({ error: 'Non autorisé' }, 401)

    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) return json({ error: 'GHL_API_KEY non configurée' }, 500)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json() as { contactId?: string }
    const { contactId } = body

    if (!contactId) return json({ error: 'contactId requis' }, 400)

    // ── 1. Trouver l'opportunité du contact : pipeline Vente d'abord ──
    const { data: opps, error: oppsErr } = await supabase
      .from('ghl_opportunities')
      .select('ghl_id, stage_name, pipeline_stage_id, pipeline_id, status')
      .eq('contact_id', contactId)
      .in('pipeline_id', CIBLES.map(c => c.pipelineId))

    if (oppsErr) {
      console.error('[ghl-move-stage] Erreur Supabase:', oppsErr.message)
      return json({ error: oppsErr.message }, 500)
    }

    const cible = CIBLES.find(c => (opps ?? []).some((o: { pipeline_id: string }) => o.pipeline_id === c.pipelineId))
    if (!cible) {
      console.log(`[ghl-move-stage] Contact ${contactId} : aucune carte « Rencontre découverte » — rien à faire (workflow GHL côté nouveaux pipelines)`)
      return json({ ok: true, skipped: true, reason: 'aucune carte dans l\'ancien pipeline' })
    }
    const candidates = (opps ?? []).filter((o: { pipeline_id: string }) => o.pipeline_id === cible.pipelineId)

    // Prioriser open > autre
    const opp = candidates.find((o: { status: string }) => o.status === 'open') ?? candidates[0]

    // Ne pas bouger si déjà Gagné
    const currentStage = (opp.stage_name ?? '').toLowerCase()
    if (currentStage.includes('gagn')) {
      console.log(`[ghl-move-stage] Déjà au stage "${opp.stage_name}" (Gagné) — ignoré`)
      return json({ ok: true, skipped: true, reason: 'déjà Gagné' })
    }

    // ── 2. Déplacer dans GHL ──────────────────────────────────
    const ghlRes = await fetch(`${GHL_BASE}/opportunities/${opp.ghl_id}`, {
      method: 'PUT',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ pipelineId: cible.pipelineId, pipelineStageId: cible.stageId }),
    })

    if (!ghlRes.ok) {
      const errText = await ghlRes.text()
      console.error(`[GHL] PUT error ${ghlRes.status}:`, errText)
      return json({ error: `GHL error ${ghlRes.status}: ${errText}` }, 502)
    }

    // ── 3. Mettre à jour Supabase ─────────────────────────────
    await supabase
      .from('ghl_opportunities')
      .update({ stage_name: GHL_STAGE_EN_DECISION_NAME, pipeline_stage_id: cible.stageId, synced_at: new Date().toISOString() })
      .eq('ghl_id', opp.ghl_id)

    console.log(`[ghl-move-stage] Contact ${contactId} → "${GHL_STAGE_EN_DECISION_NAME}" (${cible.label})`)
    return json({ ok: true, stage: GHL_STAGE_EN_DECISION_NAME, pipeline: cible.label })

  } catch (err) {
    console.error('ghl-move-stage error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
