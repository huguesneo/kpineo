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

    // ── 1. Mettre à jour le statut du rendez-vous dans GHL ────────
    const apptRes = await fetch(`${GHL_BASE}/calendars/events/${appointmentId}`, {
      method: 'PUT',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ appointmentStatus: ghlStatus }),
    })

    if (!apptRes.ok) {
      const errText = await apptRes.text()
      console.error(`GHL PUT appointment error ${apptRes.status}:`, errText)
      return json({ error: `GHL error ${apptRes.status}: ${errText}` }, 502)
    }

    console.log(`[GHL] Appointment ${appointmentId} → ${ghlStatus}`)

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
