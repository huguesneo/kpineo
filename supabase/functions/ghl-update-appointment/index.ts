import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// UI status → GHL appointmentStatus
const STATUS_MAP: Record<string, string> = {
  show:   'showed',
  noshow: 'noshow',
  annule: 'cancelled',
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
      appointmentId?: string
      contactId?:     string
      status?:        string  // 'show' | 'noshow' | 'annule'
      note?:          string  // contact note (optional, added on EOD submit)
    }

    const { appointmentId, contactId, status, note } = body

    if (!appointmentId) return json({ error: 'appointmentId requis' }, 400)
    if (!status)        return json({ error: 'status requis' }, 400)

    const ghlStatus = STATUS_MAP[status]
    if (!ghlStatus) return json({ error: `Statut invalide: ${status}` }, 400)

    // ── 1. Récupérer calendarId + locationId depuis Supabase ─────
    // L'API GHL exige ces champs dans le body du PUT, sinon il répond
    // 200 mais ignore silencieusement le changement de statut.
    const { data: apptRecord } = await supabase
      .from('ghl_appointments')
      .select('calendar_id, location_id, raw')
      .eq('ghl_id', appointmentId)
      .maybeSingle()

    const locationId = apptRecord?.location_id
      || (apptRecord?.raw as Record<string, unknown>)?.locationId as string
      || Deno.env.get('GHL_LOCATION_ID')
      || ''

    const calendarId = apptRecord?.calendar_id
      || (apptRecord?.raw as Record<string, unknown>)?.calendarId as string
      || ''

    const putPayload = { appointmentStatus: ghlStatus, calendarId, locationId }
    console.log(`[GHL] Updating appointment ${appointmentId} → ${ghlStatus}`, JSON.stringify(putPayload))

    // ── 2. Mettre à jour le statut via l'endpoint appointments ────
    const apptRes = await fetch(`${GHL_BASE}/calendars/events/appointments/${appointmentId}`, {
      method: 'PUT',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify(putPayload),
    })

    if (!apptRes.ok) {
      const errText = await apptRes.text()
      console.error(`GHL PUT appointment error ${apptRes.status}:`, errText)
      return json({ error: `GHL error ${apptRes.status}: ${errText}` }, 502)
    }

    const apptResponseText = await apptRes.text()
    console.log(`[GHL] PUT response (${apptRes.status}): ${apptResponseText.slice(0, 500)}`)

    // ── 2. Mettre à jour le statut dans Supabase ──────────────────
    await supabase
      .from('ghl_appointments')
      .update({ status: ghlStatus, synced_at: new Date().toISOString() })
      .eq('ghl_id', appointmentId)

    // ── 3. Ajouter une note sur le contact GHL (si fournie) ───────
    if (note && contactId) {
      const noteRes = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: ghlHeaders(apiKey),
        body: JSON.stringify({ body: note }),
      })

      if (!noteRes.ok) {
        const errText = await noteRes.text()
        console.warn(`[GHL] Contact note error ${noteRes.status}:`, errText)
        // Non-bloquant — on ne fail pas pour ça
      } else {
        console.log(`[GHL] Note ajoutée au contact ${contactId}`)
      }
    }

    return json({ ok: true })

  } catch (err) {
    console.error('ghl-update-appointment error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
