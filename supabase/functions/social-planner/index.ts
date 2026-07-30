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

// Seuls Hugues et Cloé ont accès au module Réseaux sociaux
const ALLOWED_EMAILS = [
  'hugues@neoperformance.ca',
  'cloe@neoperformance.ca',
  'info@neoperformance.ca',
]

function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    // Vérifier que l'utilisateur connecté fait partie de l'allowlist
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.email || !ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
      return json({ error: 'Accès refusé' }, 403)
    }

    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) return json({ error: 'GHL_API_KEY non configurée' }, 500)
    const locationId = Deno.env.get('GHL_LOCATION_ID') ?? 'YG2spvWJqnD75L3V95UJ'

    const body = await req.json() as {
      action: string
      postId?: string
      payload?: Record<string, unknown>
    }
    const { action, postId, payload } = body

    const call = async (method: string, path: string, data?: unknown) => {
      const res = await fetch(`${GHL_BASE}${path}`, {
        method,
        headers: ghlHeaders(apiKey),
        body: data != null ? JSON.stringify(data) : undefined,
      })
      const text = await res.text()
      let parsed: unknown
      try { parsed = text ? JSON.parse(text) : null } catch { parsed = { raw: text } }
      if (!res.ok) {
        console.error(`[GHL social] ${method} ${path} → ${res.status}:`, text.slice(0, 500))
        return { ok: false, status: res.status, error: parsed }
      }
      return { ok: true, status: res.status, data: parsed }
    }

    switch (action) {
      // Comptes sociaux connectés (Instagram, Facebook, TikTok, ...)
      case 'accounts':
        return json(await call('GET', `/social-media-posting/${locationId}/accounts`))

      // Créer un post (draft ou programmé)
      case 'create':
        return json(await call('POST', `/social-media-posting/${locationId}/posts`, payload))

      // Modifier un post existant
      case 'update':
        if (!postId) return json({ error: 'postId requis' }, 400)
        return json(await call('PUT', `/social-media-posting/${locationId}/posts/${postId}`, payload))

      // Supprimer un post
      case 'delete':
        if (!postId) return json({ error: 'postId requis' }, 400)
        return json(await call('DELETE', `/social-media-posting/${locationId}/posts/${postId}`))

      // Détails d'un post (inclut le statut de publication GHL)
      case 'get':
        if (!postId) return json({ error: 'postId requis' }, 400)
        return json(await call('GET', `/social-media-posting/${locationId}/posts/${postId}`))

      // Liste des posts GHL (filtrable par statut / dates)
      case 'list':
        return json(await call('POST', `/social-media-posting/${locationId}/posts/list`, payload))

      // Statistiques des comptes (7 derniers jours vs 7 précédents)
      case 'stats':
        return json(await call('POST', `/social-media-posting/statistics?locationId=${locationId}`, payload))

      default:
        return json({ error: `action inconnue: ${action}` }, 400)
    }
  } catch (err) {
    console.error('social-planner error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
