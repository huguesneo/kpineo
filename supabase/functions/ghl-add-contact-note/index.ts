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

    const body = await req.json() as { contactId?: string; note?: string }
    const { contactId, note } = body

    if (!contactId) return json({ error: 'contactId requis' }, 400)
    if (!note)      return json({ error: 'note requise' }, 400)

    const noteRes = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ body: note }),
    })

    if (!noteRes.ok) {
      const errText = await noteRes.text()
      console.error(`[GHL] Contact note error ${noteRes.status}:`, errText)
      return json({ error: `GHL error ${noteRes.status}: ${errText}` }, 502)
    }

    console.log(`[GHL] Note ajoutée au contact ${contactId}`)
    return json({ ok: true })

  } catch (err) {
    console.error('ghl-add-contact-note error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
