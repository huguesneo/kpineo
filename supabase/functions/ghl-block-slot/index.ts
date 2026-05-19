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
      userId: string
      startTime: string
      endTime: string
      title?: string
    }

    const { userId, startTime, endTime, title = 'Bloqué' } = body
    if (!userId || !startTime || !endTime) return json({ error: 'userId, startTime, endTime requis' }, 400)

    // Get profile for ghl_user_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('ghl_user_id, ghl_calendar_id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.ghl_user_id) return json({ error: 'GHL User ID non trouvé' }, 404)

    // Get calendarId + locationId from most recent appointment
    // ghl_appointments has calendar_id and location_id columns directly
    const { data: appts } = await supabase
      .from('ghl_appointments')
      .select('calendar_id, location_id, raw')
      .eq('assigned_user_id', profile.ghl_user_id)
      .order('start_time', { ascending: false })
      .limit(10)

    type ApptRow = { calendar_id: string | null; location_id: string | null; raw: unknown }
    const recentAppt = (appts as ApptRow[] ?? []).find(a => a.calendar_id || (a.raw as Record<string, unknown>)?.calendarId)

    const calendarId: string =
      profile.ghl_calendar_id ??
      recentAppt?.calendar_id ??
      (recentAppt?.raw as Record<string, unknown>)?.calendarId as string ??
      ''

    const locationId: string =
      recentAppt?.location_id ??
      (recentAppt?.raw as Record<string, unknown>)?.locationId as string ??
      Deno.env.get('GHL_LOCATION_ID') ??
      ''

    if (!calendarId) {
      return json({
        error: 'Aucun calendrier GHL trouvé.',
        hint: 'Assurez-vous que le GHL User ID est correct et que vous avez des rendez-vous synchronisés.',
        ghl_user_id: profile.ghl_user_id,
      }, 404)
    }

    const payload = { calendarId, locationId, startTime, endTime, title }
    console.log(`[ghl-block-slot] POST block-slots`, JSON.stringify(payload))

    const res = await fetch(`${GHL_BASE}/calendars/events/block-slots`, {
      method: 'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify(payload),
    })

    const responseText = await res.text()
    console.log(`[ghl-block-slot] GHL response ${res.status}:`, responseText.slice(0, 500))

    let responseData: Record<string, unknown> = {}
    try { responseData = JSON.parse(responseText) } catch { /* ignore */ }

    if (!res.ok) {
      // GHL appointment/booking calendars don't support block-slots — return a specific code
      if (responseText.includes('not an event calendar')) {
        return json({ error: 'not_event_calendar' }, 422)
      }
      return json({ error: `GHL error ${res.status}`, detail: responseText }, 502)
    }

    // GHL may return the event under different keys
    const event = (responseData.event ?? responseData) as Record<string, unknown>
    const ghlEventId: string | null = (event.id ?? event._id ?? responseData.id) as string ?? null

    console.log(`[ghl-block-slot] Blocked ${startTime}–${endTime} → event ${ghlEventId}`)
    return json({ ok: true, ghlEventId })

  } catch (err) {
    console.error('ghl-block-slot error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
