import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

const GHL_FIELD_CLOSER     = 'JSltN3nE7nm4cUjuGxTs'
const GHL_FIELD_DATE_CLOSE = 'UPqvJX8MkZ4thsPX2tjV'
const GHL_PIPELINE_CLOSER  = 'YPTruORTl0LOSdS2vWJS'
// opportunity.objection_principale (liste : Prix, Temps, Conjoint, Autre)
const GHL_FIELD_OBJECTION  = 'zrl9xl1YyMLfdjMGlOAB'
// L'objection s'écrit UNIQUEMENT sur la carte du pipeline Vente, jamais sur
// la carte Setting du même contact.
const GHL_PIPELINE_VENTE   = 'pc4eWgm1TOfZgMgqh6Gv'
const OBJECTIONS = ['Prix', 'Temps', 'Conjoint', 'Autre']

// Clé du champ custom contact {{ contact.closer_neo }}
const GHL_CONTACT_FIELD_CLOSER_NEO = 'closer_neo'

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

    const body = await req.json() as {
      ghlOpportunityId?:   string
      closerName?:         string
      closeDate?:          string   // ISO date string: "YYYY-MM-DD"
      contactId?:          string   // pour objectionPrincipale sans id d'opportunité
      objectionPrincipale?: string  // Prix | Temps | Conjoint | Autre
    }

    const { closerName, closeDate, objectionPrincipale } = body
    let { ghlOpportunityId } = body

    if (objectionPrincipale && !OBJECTIONS.includes(objectionPrincipale)) {
      return json({ error: `objectionPrincipale invalide (attendu : ${OBJECTIONS.join(', ')})` }, 400)
    }
    if (!closerName && !objectionPrincipale) return json({ error: 'closerName ou objectionPrincipale requis' }, 400)

    // Sans id d'opportunité : on prend la carte du pipeline Vente du contact.
    if (!ghlOpportunityId && body.contactId) {
      const { data: venteOpps } = await supabase
        .from('ghl_opportunities')
        .select('ghl_id, status')
        .eq('contact_id', body.contactId)
        .eq('pipeline_id', GHL_PIPELINE_VENTE)
      const opp = (venteOpps ?? []).find((o: { status: string }) => o.status === 'open') ?? (venteOpps ?? [])[0]
      if (!opp) {
        console.warn(`[ghl-update-opportunity] Aucune carte Vente pour le contact ${body.contactId}`)
        return json({ error: 'Aucune carte du pipeline Vente pour ce contact', skipped: true })
      }
      ghlOpportunityId = opp.ghl_id
    }

    if (!ghlOpportunityId) return json({ error: 'ghlOpportunityId ou contactId requis' }, 400)

    // ── Récupérer le contact_id depuis Supabase ───────────────
    const { data: existing } = await supabase
      .from('ghl_opportunities')
      .select('contact_id, stage_name, location_id, pipeline_id')
      .eq('ghl_id', ghlOpportunityId)
      .maybeSingle()

    const contactId = existing?.contact_id ?? body.contactId ?? null

    // Garde-fou : ne jamais écrire l'objection ailleurs que sur une carte Vente
    if (objectionPrincipale && existing && existing.pipeline_id !== GHL_PIPELINE_VENTE) {
      return json({ error: 'L\'objection ne s\'écrit que sur une carte du pipeline Vente' }, 400)
    }

    // ── 1. Mettre à jour l'opportunité GHL ────────────────────
    const oppCustomFields: { id: string; field_value: string }[] = []
    if (closerName) oppCustomFields.push({ id: GHL_FIELD_CLOSER, field_value: closerName.trim() })
    if (objectionPrincipale) oppCustomFields.push({ id: GHL_FIELD_OBJECTION, field_value: objectionPrincipale })

    const ghlRes = await fetch(`${GHL_BASE}/opportunities/${ghlOpportunityId}`, {
      method: 'PUT',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ customFields: oppCustomFields }),
    })

    if (!ghlRes.ok) {
      const errText = await ghlRes.text()
      console.error(`GHL PUT opportunity error ${ghlRes.status}:`, errText)
      return json({ error: `GHL error ${ghlRes.status}: ${errText}` }, 502)
    }

    const ghlData = await ghlRes.json() as Record<string, unknown>
    const updatedOpp = (ghlData?.opportunity ?? ghlData) as Record<string, unknown>
    console.log(`[GHL] Opportunité ${ghlOpportunityId} mise à jour — closer: "${closerName ?? '—'}" objection: "${objectionPrincipale ?? '—'}" closeDate: "${closeDate}"`)

    // ── 2. Mettre à jour le champ contact.closer_neo ──────────
    if (closerName && contactId) {
      const contactRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders(apiKey),
        body: JSON.stringify({
          customFields: [
            { key: GHL_CONTACT_FIELD_CLOSER_NEO, field_value: closerName.trim() },
          ],
        }),
      })

      if (!contactRes.ok) {
        const errText = await contactRes.text()
        console.error(`[GHL] Contact PUT error ${contactRes.status}:`, errText)
        // On ne bloque pas pour ça — l'opportunité est déjà mise à jour
      } else {
        console.log(`[GHL] Contact ${contactId} — closer_neo mis à jour: "${closerName}"`)
      }
    }

    // ── 3. Resync de l'opportunité dans Supabase ──────────────
    const fetchRes = await fetch(`${GHL_BASE}/opportunities/${ghlOpportunityId}`, {
      headers: ghlHeaders(apiKey),
    })

    if (fetchRes.ok) {
      const fetchData = await fetchRes.json() as Record<string, unknown>
      const opp = (fetchData?.opportunity ?? fetchData) as Record<string, unknown>

      await supabase.from('ghl_opportunities').upsert({
        ghl_id:            ghlOpportunityId,
        location_id:       existing?.location_id ?? Deno.env.get('GHL_LOCATION_ID') ?? '',
        contact_id:        String(opp.contactId ?? contactId ?? ''),
        contact_name:      String((opp.contact as Record<string, unknown>)?.name ?? ''),
        pipeline_id:       String(opp.pipelineId ?? GHL_PIPELINE_CLOSER),
        pipeline_stage_id: String(opp.pipelineStageId ?? ''),
        stage_name:        existing?.stage_name ?? '',
        status:            String(opp.status ?? ''),
        monetary_value:    Number(opp.monetaryValue ?? 0),
        assigned_to:       String(opp.assignedTo ?? ''),
        closed_at:         opp.closedDate
                             ? new Date(opp.closedDate as string).toISOString()
                             : (String(opp.status ?? '').toLowerCase() === 'won' && opp.lastStageChangeAt
                                 ? new Date(opp.lastStageChangeAt as string).toISOString()
                                 : null),
        raw:               opp,
        synced_at:         new Date().toISOString(),
      }, { onConflict: 'ghl_id' })

      console.log(`[DB] Opportunité ${ghlOpportunityId} resyncée`)
    } else {
      // Fallback : mise à jour minimale du raw en DB
      console.warn(`[GHL] Re-fetch échoué (${fetchRes.status}), mise à jour minimale Supabase`)
      const { data: current } = await supabase
        .from('ghl_opportunities')
        .select('raw')
        .eq('ghl_id', ghlOpportunityId)
        .maybeSingle()

      if (current?.raw) {
        const raw = current.raw as Record<string, unknown>
        const fields = ((raw.customFields ?? []) as Record<string, unknown>[]).filter(
          (f) => f.id !== GHL_FIELD_CLOSER && f.id !== GHL_FIELD_DATE_CLOSE && f.id !== GHL_FIELD_OBJECTION
        )
        if (closerName) fields.push({ id: GHL_FIELD_CLOSER, fieldValueString: closerName.trim(), value: closerName.trim() })
        if (objectionPrincipale) fields.push({ id: GHL_FIELD_OBJECTION, fieldValueString: objectionPrincipale, value: objectionPrincipale })
        await supabase.from('ghl_opportunities')
          .update({ raw: { ...raw, customFields: fields }, synced_at: new Date().toISOString() })
          .eq('ghl_id', ghlOpportunityId)
      }
    }

    return json({ ok: true, opportunityId: ghlOpportunityId, opportunity: updatedOpp })

  } catch (err) {
    console.error('ghl-update-opportunity error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
