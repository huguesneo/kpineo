// Fiche d'un lead (Setting v2), lecture seule dans GHL : coordonnées, âge si
// connu, source, notes, historique (appels avec durée et auteur, SMS, courriels).
// Réponse : { contact, notes, historique, conversationId, avertissementPortee? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ghl, locationId } from '../_shared/settingGhl.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ROLES_VENTE = ['admin', 'resp_vente', 'setter', 'closer']
// Mêmes champs que BOOKING_FORM_FIELDS (src/hooks/useGHLContact.js)
const FORMULAIRE = [
  { id: 'N4LsXlp2RjtQF74WjuBD', libelle: 'Information complémentaire' },
  { id: '4SdaSD7vozfcKONhiQAL', libelle: 'Référence appel découverte' },
]
const TYPES = { TYPE_CALL: 'appel', TYPE_SMS: 'sms', TYPE_EMAIL: 'courriel' } as Record<string, string>

// deno-lint-ignore no-explicit-any
type J = any

function age(dateNaissance: string | null | undefined): number | null {
  if (!dateNaissance) return null
  const d = new Date(dateNaissance)
  if (Number.isNaN(d.getTime())) return null
  const n = new Date()
  let a = n.getFullYear() - d.getFullYear()
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--
  return a >= 0 && a < 120 ? a : null
}

// Notes GHL (HTML de l'éditeur) → texte, en gardant les retours à la ligne
function noteEnTexte(s: string): string {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sansHtml(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ error: 'Ta session a expiré : déconnecte-toi et reconnecte-toi.', session: true }, 401)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profil } = await db.from('profiles').select('role, secondary_roles').eq('id', user.id).maybeSingle()
    if (!profil || ![profil.role, ...(profil.secondary_roles ?? [])].some(r => ROLES_VENTE.includes(r))) {
      return json({ error: 'Réservé à l’équipe de vente' }, 403)
    }

    const { contactId, notesSeulement = false } = await req.json() as { contactId?: string; notesSeulement?: boolean }
    if (!contactId) return json({ error: 'contactId requis' }, 400)

    const { data: profils } = await db.from('profiles').select('full_name, ghl_user_id').not('ghl_user_id', 'is', null)
    const nomParGhl = Object.fromEntries((profils ?? []).map((p: J) => [p.ghl_user_id, p.full_name]))

    const [rc, rn] = await Promise.all([
      ghl(`/contacts/${contactId}`),
      ghl(`/contacts/${contactId}/notes`).catch(() => ({ notes: [] })),
    ])
    const c = rc?.contact ?? {}

    // Historique : conversation(s) du contact, 100 derniers messages
    const historique: J[] = []
    let conversationId: string | null = null
    let avertissementPortee: string | null = null
    if (!notesSeulement) try {
      const loc = await locationId(db)
      const rs = await ghl(`/conversations/search?locationId=${loc}&contactId=${contactId}&limit=5`, { version: '2021-04-15' })
      const convs: J[] = rs?.conversations ?? []
      conversationId = convs[0]?.id ?? null
      for (const conv of convs.slice(0, 2)) {
        let dernier: string | null = null
        for (let page = 0; page < 2; page++) {
          const qs = new URLSearchParams({ limit: '50' })
          if (dernier) qs.set('lastMessageId', dernier)
          const rm = await ghl(`/conversations/${conv.id}/messages?${qs}`, { version: '2021-04-15' })
          const bloc = rm?.messages ?? {}
          const msgs: J[] = bloc.messages ?? []
          for (const m of msgs) {
            const type = TYPES[m.messageType]
            if (!type) continue
            const call = m.meta?.call ?? {}
            const duree = Number(call.duration ?? m.callDuration)
            historique.push({
              id: m.id, type,
              sortant: m.direction !== 'inbound',
              date: m.dateAdded,
              par: m.userId ? (nomParGhl[m.userId] ?? 'Utilisateur GHL') : (m.direction === 'inbound' ? null : 'Automatisation'),
              duree: type === 'appel' && Number.isFinite(duree) ? duree : null,
              statut: type === 'appel' ? (call.status ?? m.status ?? null) : (m.status ?? null),
              texte: type === 'courriel'
                ? (m.meta?.email?.subject ?? (m.body ? sansHtml(String(m.body)).slice(0, 300) : null))
                : (m.body ? String(m.body).slice(0, 600) : null),
            })
          }
          if (!bloc.nextPage || msgs.length === 0) break
          dernier = bloc.lastMessageId ?? msgs[msgs.length - 1]?.id
        }
      }
    } catch (e) {
      console.error('[setting-fiche] historique :', (e as Error).message)
      avertissementPortee = 'Historique GHL indisponible (accès aux conversations refusé ?)'
    }
    historique.sort((a, b) => String(b.date).localeCompare(String(a.date)))

    return json({
      contact: {
        id: c.id ?? contactId,
        nom: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.contactName || null,
        telephone: c.phone ?? null,
        courriel: c.email ?? null,
        age: age(c.dateOfBirth),
        source: c.source ?? c.attributionSource?.utmSource ?? null,
        creeLe: c.dateAdded ?? null,
        tags: c.tags ?? [],
      },
      // Réponses du formulaire de réservation (champs contact, comme l'écran closeur)
      formulaire: FORMULAIRE.map(f => ({
        libelle: f.libelle,
        valeur: (c.customFields ?? []).find((x: J) => x.id === f.id)?.value ?? null,
      })).filter(f => f.valeur && String(f.valeur).trim()),
      notes: (rn?.notes ?? []).map((n: J) => ({ id: n.id, texte: noteEnTexte(n.body), date: n.dateAdded, par: n.userId ? (nomParGhl[n.userId] ?? null) : null }))
        .sort((a: J, b: J) => String(b.date).localeCompare(String(a.date))),
      historique,
      conversationId,
      avertissementPortee,
    })
  } catch (err) {
    console.error('[setting-fiche]', err)
    return json({ error: (err as Error).message }, 500)
  }
})
