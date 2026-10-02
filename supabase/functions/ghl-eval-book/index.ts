// Prise de rendez-vous d'évaluation intégrée à l'app (closeurs), sur le modèle de
// ghl-client-book de l'app NEO :
//   action 'slots' : plages libres d'un calendrier d'évaluation, pour un membre
//                    (userId) ou tous les membres (round robin) ; d'un mois
//                    (mois 'AAAA-MM', jusqu'à 12 mois à l'avance) ou des 30 prochains jours
//   action 'book'  : revérifie la plage, met à jour le contact GHL (coordonnées,
//                    type de forfait, nombre de paiements) puis crée le RDV.
//                    Sans contactId (Centre de vente, nouveau client) : le contact
//                    est créé ou retrouvé par courriel/téléphone (upsert GHL).
// Accès : utilisateur connecté, rôle admin, resp_vente ou closeur.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decouperPeriode, extraireCreneaux, grouperParJour, creneauLibre, bornesMois, joursDuMois } from './creneaux.js'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GHL_BASE = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'YG2spvWJqnD75L3V95UJ'
const FUSEAU = 'America/Toronto'
const HORIZON_JOURS = 30

// Même configuration que src/lib/v2/salesConfig.js (EVALUATION)
const TYPES: Record<string, { calendarId: string; libelle: string; enLigne: boolean }> = {
  clinique:  { calendarId: 'nF4GjzBPg0JJu7aSdi4d', libelle: 'Évaluation en clinique', enLigne: false },
  ligne:     { calendarId: 'EN1rRFnOcotGonaMAV3N', libelle: 'Évaluation en ligne',    enLigne: true },
  ouverture: { calendarId: '7BpembfPxvDHewFh51EN', libelle: 'Ouverture de dossier',   enLigne: true },
}
const MEMBRES = new Set(['8h1d4Xjwbv0XXuFA1m9k', 'PqbFLm1W2ErWQpBUOHRL', 'LSAWdBBxee2VD7YkPZyB', 'qwjs0d2A8frAz2rguIja', '8f13uqX2I4N2ovK6Y4ck'])
const CHAMP_FORFAIT = 'MmpQg7j8EyzfQ7aYhigw'
const CHAMP_NB_PAIEMENTS = '7UixfQ3XzMDT3Yh362QI'
const FORFAITS = new Set([
  "Programme d'optimisation métabolique",
  "Programme d'optimisation métabolique plus 10%",
  "Programme d'optimisation métabolique plus garanti",
  "Programme d'optimisation métabolique plus 10% & garanti",
  'Forfait métabolique sans entrainement',
  'À la carte',
])
const NB_PAIEMENTS = new Set(['1', '2', '3', '5'])
const ROLES = ['admin', 'resp_vente', 'closer']

function entetes(token: string, version: string) {
  return { Authorization: `Bearer ${token}`, Version: version, 'Content-Type': 'application/json', Accept: 'application/json' }
}

const JOUR_MS = 86_400_000
const MOIS_MAX = 12

async function lireJours(token: string, calendarId: string, userId: string | null,
  [debut, fin]: number[] = [Date.now(), Date.now() + HORIZON_JOURS * JOUR_MS]) {
  if (fin <= debut) return []
  const reponses = await Promise.all(decouperPeriode(debut, fin).map(async ([a, b]) => {
    const p = new URLSearchParams({ startDate: String(a), endDate: String(b), timezone: FUSEAU })
    if (userId) p.set('userId', userId)
    const r = await fetch(`${GHL_BASE}/calendars/${calendarId}/free-slots?${p}`, { headers: entetes(token, '2021-04-15') })
    if (!r.ok) throw new Error(`free-slots ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return r.json()
  }))
  return grouperParJour(reponses.flatMap(extraireCreneaux))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const jeton = String(req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jeton) return json({ ok: false, motif: 'non_autorise' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await supabase.auth.getUser(jeton)
    if (!user) return json({ ok: false, motif: 'non_autorise' }, 401)
    const { data: profil } = await supabase.from('profiles').select('full_name, role, secondary_roles').eq('id', user.id).maybeSingle()
    const roles = [profil?.role, ...((profil?.secondary_roles as string[] | null) ?? [])]
    if (!roles.some(r => ROLES.includes(String(r)))) return json({ ok: false, motif: 'non_autorise' }, 403)

    const token = Deno.env.get('GHL_API_KEY')
    if (!token) return json({ ok: false, motif: 'config' }, 500)

    const body = await req.json() as Record<string, string>
    const type = TYPES[String(body.type ?? '')]
    if (!type) return json({ ok: false, motif: 'type_inconnu' }, 400)
    const userId = body.userId ? String(body.userId) : null
    if (userId && !MEMBRES.has(userId)) return json({ ok: false, motif: 'membre_inconnu' }, 400)

    if (body.action === 'slots') {
      try {
        const mois = String(body.mois ?? '')
        if (/^\d{4}-\d{2}$/.test(mois)) {
          const [a, m] = mois.split('-').map(Number)
          const maintenant = new Date()
          const ecart = (a - maintenant.getUTCFullYear()) * 12 + (m - 1 - maintenant.getUTCMonth())
          if (ecart < 0 || ecart > MOIS_MAX) return json({ ok: true, mois, jours: [] })
          const jours = await lireJours(token, type.calendarId, userId, bornesMois(mois))
          return json({ ok: true, mois, jours: joursDuMois(jours, mois) })
        }
        return json({ ok: true, jours: await lireJours(token, type.calendarId, userId) })
      } catch (e) {
        console.error('[ghl-eval-book] slots', (e as Error).message)
        return json({ ok: false, motif: 'ghl_indisponible' })
      }
    }

    if (body.action === 'book') {
      const { contactId, startTime, prenom, nom, telephone, courriel, forfait, nbPaiements } = body
      if (!startTime) return json({ ok: false, motif: 'incomplet' }, 400)
      if (!contactId && !String(courriel ?? '').trim() && !String(telephone ?? '').trim()) {
        return json({ ok: false, motif: 'coordonnees_requises' }, 400)
      }
      if (!String(prenom ?? '').trim() || !String(nom ?? '').trim()) return json({ ok: false, motif: 'incomplet' }, 400)
      if (!FORFAITS.has(String(forfait))) return json({ ok: false, motif: 'forfait_inconnu' }, 400)
      if (!NB_PAIEMENTS.has(String(nbPaiements))) return json({ ok: false, motif: 'nb_paiements_inconnu' }, 400)

      // 1. La plage est-elle encore libre ? (lecture autour de son jour, quel que soit le mois)
      const t = new Date(startTime).getTime()
      if (Number.isNaN(t)) return json({ ok: false, motif: 'incomplet' }, 400)
      const autour = [Math.max(Date.now(), t - JOUR_MS), t + JOUR_MS]
      let jours
      try { jours = await lireJours(token, type.calendarId, userId, autour) } catch { return json({ ok: false, motif: 'ghl_indisponible' }) }
      if (!creneauLibre(jours, startTime)) return json({ ok: false, motif: 'creneau_pris', jours })

      // 2. Contact GHL : coordonnées, type de forfait, nombre de paiements
      const contact: Record<string, unknown> = {
        firstName: String(prenom).trim(),
        lastName: String(nom).trim(),
        customFields: [
          { id: CHAMP_FORFAIT, field_value: String(forfait) },
          { id: CHAMP_NB_PAIEMENTS, field_value: String(nbPaiements) },
        ],
      }
      if (String(courriel ?? '').trim()) contact.email = String(courriel).trim()
      if (String(telephone ?? '').trim()) contact.phone = String(telephone).trim()
      // Contact connu : mise à jour ; sinon création ou contact existant (upsert)
      const rc = contactId
        ? await fetch(`${GHL_BASE}/contacts/${contactId}`, {
          method: 'PUT', headers: entetes(token, '2021-07-28'), body: JSON.stringify(contact),
        })
        : await fetch(`${GHL_BASE}/contacts/upsert`, {
          method: 'POST', headers: entetes(token, '2021-07-28'), body: JSON.stringify({ ...contact, locationId: LOCATION_ID }),
        })
      const texteContact = await rc.text()
      if (!rc.ok) {
        console.error(`[ghl-eval-book] contact ${contactId ?? '(nouveau)'} ${rc.status}: ${texteContact.slice(0, 300)}`)
        return json({ ok: false, motif: 'contact_refuse', detail: texteContact.slice(0, 200) })
      }
      let idContact = contactId
      if (!idContact) {
        try { idContact = JSON.parse(texteContact)?.contact?.id } catch { /* réponse inattendue */ }
        if (!idContact) return json({ ok: false, motif: 'contact_refuse', detail: 'contact non retourné par GHL' })
      }

      // 3. Rendez-vous (sans membre choisi : GHL répartit en round robin)
      const rdv: Record<string, unknown> = {
        calendarId: type.calendarId,
        locationId: LOCATION_ID,
        contactId: idContact,
        startTime: new Date(startTime).toISOString(),
        appointmentStatus: 'confirmed',
        title: `${String(prenom).trim()} ${String(nom).trim()} – ${type.libelle}`,
      }
      if (userId) rdv.assignedUserId = userId
      if (type.enLigne) rdv.meetingLocationType = 'gmeet'
      const ra = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
        method: 'POST', headers: entetes(token, '2021-04-15'), body: JSON.stringify(rdv),
      })
      const texte = await ra.text()
      if (!ra.ok) {
        console.error(`[ghl-eval-book] RDV ${ra.status}: ${texte.slice(0, 300)}`)
        let joursFrais = jours
        try { joursFrais = await lireJours(token, type.calendarId, userId, autour) } catch { /* garde l'ancienne liste */ }
        return json({ ok: false, motif: ra.status >= 500 ? 'ghl_indisponible' : 'creneau_pris', detail: texte.slice(0, 200), jours: joursFrais })
      }
      let cree: Record<string, unknown> = {}
      try { cree = JSON.parse(texte) } catch { /* réponse vide */ }
      console.log(`[ghl-eval-book] RDV créé par ${profil?.full_name} : ${type.libelle} ${rdv.startTime} contact ${idContact} membre ${cree.assignedUserId ?? userId ?? 'round robin'}`)
      return json({
        ok: true,
        rdv: { id: cree.id ?? null, startTime: rdv.startTime, assignedUserId: cree.assignedUserId ?? userId ?? null, contactId: idContact },
      })
    }

    return json({ ok: false, motif: 'action_inconnue' }, 400)
  } catch (err) {
    console.error('[ghl-eval-book]', err)
    return json({ ok: false, motif: 'erreur', detail: (err as Error).message }, 500)
  }
})
