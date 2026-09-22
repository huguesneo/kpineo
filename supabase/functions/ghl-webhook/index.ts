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

// Rendez-vous (payload de workflow GHL, espace de vente v2) : mêmes calendriers
// que gohighlevel-sync, mêmes colonnes dans ghl_appointments.
const APPT_UPSERT_EVENTS = new Set(['AppointmentCreate', 'AppointmentUpdate'])
const APPT_CALENDAR_IDS = new Set([
  '4227QzeKvFczi5BZyHOC', // Rencontre découverte 1
  'DIN6EPtG7eNU3Gf6ZRoC', // Rencontre découverte 2
  'ucyJmhYKKDDm7U5JmaJ8', // Rencontre découverte 3
  'BQK4NoyrVNuJA3e1VHDH', // Rencontre de suivi / décision
])

// Ligne ghl_appointments à partir d'un RDV GHL (même logique que gohighlevel-sync)
function appointmentRow(e: Record<string, unknown>, locationId: string, contact?: Record<string, unknown>) {
  let meetingUrl = ''
  const loc = e.location ?? e.address ?? ''
  if (typeof loc === 'string' && (loc.startsWith('https://') || loc.startsWith('http://'))) {
    meetingUrl = loc
  } else if (e.googleMeetLink && typeof e.googleMeetLink === 'string') {
    meetingUrl = e.googleMeetLink
  }
  const contactFullName = contact
    ? (String(contact.name ?? '') || [contact.firstName, contact.lastName].filter(Boolean).join(' '))
    : ''
  const rawTitle = String(contactFullName || e.title || e.contactName || '')
  const cleanedTitle = rawTitle.replace(/\s+(Consultation|Rencontre|Suivi).*/i, '').trim()
  return {
    ghl_id:           String(e.id ?? ''),
    location_id:      String(e.locationId ?? locationId),
    calendar_id:      String(e.calendarId ?? ''),
    contact_id:       String(e.contactId ?? ''),
    contact_name:     cleanedTitle || rawTitle,
    contact_email:    String(contact?.email ?? ''),
    assigned_user_id: String(e.assignedUserId ?? e.userId ?? ''),
    start_time:       e.startTime ? new Date(e.startTime as string).toISOString() : null,
    end_time:         e.endTime   ? new Date(e.endTime   as string).toISOString() : null,
    status:           String(e.appoinmentStatus ?? e.appointmentStatus ?? ''),
    meeting_url:      meetingUrl,
    notes:            String(e.notes ?? ''),
    raw:              e,
    synced_at:        new Date().toISOString(),
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

    const body = await req.json() as Record<string, unknown>
    // Action « Webhook » d'un workflow GHL : nos clés arrivent dans customData
    // ({ type, id }) et passent devant les champs natifs (où `id` est celui du
    // contact). Un événement natif (app Marketplace) n'a pas de customData.
    const customData = (body.customData ?? {}) as Record<string, unknown>
    const payload    = { ...body, ...customData } as Record<string, unknown>
    const viaWorkflow = Object.keys(customData).length > 0
    const eventType  = String(payload.type ?? '')
    const locationId = String(payload.locationId ?? (body.location as Record<string, unknown>)?.id ?? Deno.env.get('GHL_LOCATION_ID') ?? '')

    console.log(`[GHL Webhook] appel reçu — type: ${eventType || '∅'} · id: ${String(payload.id ?? '∅')} · source: ${viaWorkflow ? 'workflow' : 'natif'}`)
    console.log(`[GHL Webhook] ${eventType} — payload: ${JSON.stringify(body).slice(0, 400)}`)

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

    // ── Rendez-vous : suppression ───────────────────────────────
    if (eventType === 'AppointmentDelete') {
      const calendar = (body.calendar ?? {}) as Record<string, unknown>
      const apptId = String(customData.id ?? calendar.appointmentId ?? payload.id ?? '')
      if (!apptId) return ack('no id')
      await supabase.from('ghl_appointments').delete().eq('ghl_id', apptId)
      console.log(`[GHL Webhook] RDV supprimé: ${apptId}`)
      return ack()
    }

    // ── Rendez-vous : création / mise à jour (re-fetch complet) ─
    if (APPT_UPSERT_EVENTS.has(eventType)) {
      // Repli sur le bloc « calendar » natif des webhooks de workflow
      const calendar = (body.calendar ?? {}) as Record<string, unknown>
      const apptId = String(customData.id ?? calendar.appointmentId ?? calendar.id ?? '')
      if (!apptId) return ack('no id')

      const res = await fetch(`${GHL_BASE}/calendars/events/appointments/${apptId}`, { headers: ghlHeaders(apiKey) })
      if (!res.ok) {
        console.error(`[GHL Webhook] Re-fetch RDV ${apptId} échoué: ${res.status}`)
        return ack('refetch failed')
      }
      const data = await res.json() as Record<string, unknown>
      const appt = (data?.appointment ?? data?.event ?? data) as Record<string, unknown>
      const calendarId = String(appt.calendarId ?? '')
      if (!APPT_CALENDAR_IDS.has(calendarId)) {
        console.log(`[GHL Webhook] RDV ${apptId} ignoré (calendrier ${calendarId} non suivi)`)
        return ack('calendar ignored')
      }

      // Nom et courriel du contact (comme la synchro, qui les reçoit avec l'événement)
      let contact: Record<string, unknown> | undefined
      const contactId = String(appt.contactId ?? '')
      if (contactId) {
        const cRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders(apiKey) })
        if (cRes.ok) {
          const cData = await cRes.json() as Record<string, unknown>
          contact = (cData?.contact ?? cData) as Record<string, unknown>
        }
      }

      const row = appointmentRow({ ...appt, id: String(appt.id ?? apptId) }, locationId, contact)
      const { error: upErr } = await supabase.from('ghl_appointments').upsert(row, { onConflict: 'ghl_id' })
      if (upErr) {
        console.error(`[GHL Webhook] Upsert RDV ${apptId} échoué: ${upErr.message}`)
        return ack('upsert failed')
      }
      console.log(`[GHL Webhook] RDV upserté (${eventType}): ${apptId} — statut ${row.status}`)
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
