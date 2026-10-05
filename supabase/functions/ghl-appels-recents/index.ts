// Journal d'appels GHL des contacts demandés (lecture seule), pour l'info « appelé »
// de la file « À confirmer ». Une seule lecture paginée de tous les appels de la
// location depuis `depuis` (GET /conversations/messages/export?channel=Call), puis
// filtre sur les contacts : jamais un appel GHL par contact.
// Réponse : { appels: { contactId: [{ date, statut, duree, sortant }] } }.
// Clé sans la portée conversations/message.readonly : { error, portee: true }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resumerAppels } from '../_shared/confirmation.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-04-15'  // version des endpoints conversations
const MAX_JOURS   = 31
const MAX_CONTACTS = 500
const MAX_PAGES   = 10            // 10 × 1000 appels : largement au-delà d'un mois

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)
    const auth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ error: 'Non autorisé' }, 401)

    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) return json({ error: 'GHL_API_KEY non configurée' }, 500)

    let locationId = Deno.env.get('GHL_LOCATION_ID') ?? ''
    if (!locationId) {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data } = await db.from('ghl_config').select('location_id').limit(1).maybeSingle()
      locationId = data?.location_id ?? ''
    }
    if (!locationId) return json({ error: 'GHL_LOCATION_ID non configurée' }, 500)

    const body = await req.json() as { contactIds?: string[]; depuis?: string }
    const contactIds = [...new Set((body.contactIds ?? []).map(String).filter(Boolean))]
    if (contactIds.length === 0) return json({ appels: {} })
    if (contactIds.length > MAX_CONTACTS) return json({ error: `Au plus ${MAX_CONTACTS} contacts` }, 400)

    const plancher = Date.now() - MAX_JOURS * 86_400_000
    const demande = body.depuis ? new Date(body.depuis).getTime() : NaN
    const depuis = new Date(Number.isNaN(demande) ? plancher : Math.max(demande, plancher)).toISOString()

    // deno-lint-ignore no-explicit-any
    const messages: any[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ locationId, channel: 'Call', startDate: depuis, limit: '1000', sortOrder: 'desc' })
      if (cursor) qs.set('cursor', cursor)
      const res = await fetch(`${GHL_BASE}/conversations/messages/export?${qs}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION, 'Accept': 'application/json' },
      })
      if (res.status === 401 || res.status === 403) {
        console.error(`[appels] GHL ${res.status} : portée conversations/message.readonly manquante ?`, (await res.text()).slice(0, 200))
        return json({ error: 'La clé GHL du serveur n’a pas accès au journal d’appels (portée conversations/message.readonly).', portee: true }, 502)
      }
      if (!res.ok) {
        console.error(`[appels] GHL ${res.status}:`, (await res.text()).slice(0, 300))
        return json({ error: `GHL a refusé la lecture du journal d’appels (${res.status}).` }, 502)
      }
      const data = await res.json()
      messages.push(...(data?.messages ?? []))
      cursor = data?.nextCursor ?? null
      if (!cursor || (data?.messages ?? []).length === 0) break
    }

    return json({ appels: resumerAppels(messages, contactIds), depuis })

  } catch (err) {
    console.error('ghl-appels-recents error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
