// Ajoute un ou plusieurs tags à un contact GHL.
// Calquée sur ghl-add-contact-note. Sert au bouton « Appelé, pas de réponse »
// de l'espace de vente v2 : l'app ne déplace aucune carte, elle pose le tag
// app-tentative-faite et un workflow GHL avance la carte puis retire le tag.
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

// Tags que l'app a le droit de poser (évite qu'un appel arbitraire tague n'importe quoi)
const TAGS_AUTORISES = new Set(['app-tentative-faite'])

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    // Vérifie que l'appelant est un utilisateur connecté de l'app
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Non autorisé' }, 401)

    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) return json({ error: 'GHL_API_KEY non configurée' }, 500)

    const body = await req.json() as { contactId?: string; tags?: string[]; tag?: string }
    const contactId = body.contactId
    const tags = (body.tags ?? (body.tag ? [body.tag] : [])).map(t => String(t).trim()).filter(Boolean)

    if (!contactId) return json({ error: 'contactId requis' }, 400)
    if (tags.length === 0) return json({ error: 'tags requis' }, 400)
    const refuses = tags.filter(t => !TAGS_AUTORISES.has(t))
    if (refuses.length > 0) return json({ error: `Tag non autorisé : ${refuses.join(', ')}` }, 400)

    const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ tags }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[GHL] Contact tag error ${res.status}:`, errText)
      return json({ error: `GHL error ${res.status}: ${errText}` }, 502)
    }

    console.log(`[GHL] Tag(s) ${tags.join(', ')} ajouté(s) au contact ${contactId} par ${user.email}`)
    return json({ ok: true })

  } catch (err) {
    console.error('ghl-add-contact-tag error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
