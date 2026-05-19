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

    const body = await req.json() as { ghlEventId?: string }
    const { ghlEventId } = body

    if (!ghlEventId) return json({ error: 'ghlEventId requis' }, 400)

    const res = await fetch(`${GHL_BASE}/calendars/events/${ghlEventId}`, {
      method: 'DELETE',
      headers: ghlHeaders(apiKey),
    })

    if (!res.ok && res.status !== 404) {
      const errText = await res.text()
      console.error(`[ghl-unblock-slot] GHL error ${res.status}:`, errText)
      return json({ error: `GHL error ${res.status}` }, 502)
    }

    console.log(`[ghl-unblock-slot] Deleted event ${ghlEventId}`)
    return json({ ok: true })

  } catch (err) {
    console.error('ghl-unblock-slot error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
