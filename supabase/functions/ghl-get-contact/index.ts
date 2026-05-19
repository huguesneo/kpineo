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

// Fetch a single contact from GHL API (includes fieldKey in customFields)
// and upsert into ghl_contacts so the cache is up-to-date.
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

    // GET /contacts/{id} returns full contact including fieldKey in customFields
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      headers: ghlHeaders(apiKey),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[GHL] GET contact ${contactId} error ${res.status}:`, errText)
      return json({ error: `GHL error ${res.status}` }, 502)
    }

    const data = await res.json() as Record<string, unknown>
    const c = (data?.contact ?? data) as Record<string, unknown>

    if (!c?.id) return json({ error: 'Contact non trouvé dans GHL' }, 404)

    // Upsert fresh contact into Supabase cache
    const row = {
      ghl_id:         String(c.id),
      first_name:     String(c.firstName ?? ''),
      last_name:      String(c.lastName ?? ''),
      email:          String(c.email ?? ''),
      phone:          String(c.phone ?? ''),
      tags:           (c.tags ?? []) as string[],
      source:         String(c.source ?? ''),
      raw:            c,
      synced_at:      new Date().toISOString(),
    }

    await supabase
      .from('ghl_contacts')
      .upsert(row, { onConflict: 'ghl_id' })

    console.log(`[GHL] Contact ${contactId} rafraîchi dans le cache`)
    return json({ ok: true, contact: row })

  } catch (err) {
    console.error('ghl-get-contact error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
