// Confirmer (ou retirer la confirmation d')une rencontre découverte depuis le hub.
// Confirmer : tag confirme-manuel sur le contact GHL + note « confirmée par … le … »
// + ligne dans v2_confirmations. Dans GHL, confirme-manuel déclenche LEAD-21b, qui
// pose statut-confirme, met la carte Vente en « ✅ RDV confirmé » et envoie le SMS.
// Retirer : retire confirme-manuel et statut-confirme, pose app-confirmation-retiree
// (NEOHUB-05 ramène la carte en « 📅 RDV booké »), note, annule la ligne.
// Seulement pour une confirmation faite depuis le hub : celle d'un lead qui a cliqué
// « Je confirme » ne se retire pas ici.
// L'app ne déplace aucune carte et ne touche pas le statut du RDV dans le calendrier
// (docs/V2-WEBHOOKS-GHL.md).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { tagsDeLAction, refusDroits, refusRdv, texteNote } from '../_shared/confirmation.ts'

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
// 🎯 Vente et champ « closer » : mêmes IDs que src/lib/commissions/config.js et salesConfig.js
const PIPELINE_VENTE = 'pc4eWgm1TOfZgMgqh6Gv'
const FIELD_CLOSER   = 'JSltN3nE7nm4cUjuGxTs'

function ghlHeaders(apiKey: string) {
  return { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION, 'Content-Type': 'application/json' }
}

// deno-lint-ignore no-explicit-any
function champCloser(raw: any): string | null {
  const f = (raw?.customFields ?? []).find((c: { id?: string }) => c.id === FIELD_CLOSER)
  const v = String(f?.fieldValueString ?? f?.fieldValue ?? f?.value ?? '').trim()
  return v || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    // Utilisateur connecté de l'app
    const auth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ error: 'Non autorisé' }, 401)

    const apiKey = Deno.env.get('GHL_API_KEY')
    if (!apiKey) return json({ error: 'GHL_API_KEY non configurée' }, 500)

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const body = await req.json() as { action?: string; appointmentId?: string }
    const action = body.action
    const appointmentId = String(body.appointmentId ?? '').trim()
    if (action !== 'confirmer' && action !== 'annuler') return json({ error: 'action : confirmer ou annuler' }, 400)
    if (!appointmentId) return json({ error: 'appointmentId requis' }, 400)

    const [{ data: profil }, { data: rdv }] = await Promise.all([
      db.from('profiles').select('id, role, secondary_roles, full_name, ghl_user_id').eq('id', user.id).maybeSingle(),
      db.from('ghl_appointments').select('ghl_id, calendar_id, contact_id, start_time, status, assigned_user_id')
        .eq('ghl_id', appointmentId).maybeSingle(),
    ])

    // Le contact vient toujours du RDV en cache, jamais du navigateur
    const refus = refusRdv(rdv)
    if (refus) return json({ error: refus }, 409)

    // Closeur : la carte Vente du contact porte-t-elle son nom ?
    const { data: ventes } = await db.from('ghl_opportunities').select('raw, created_at_ghl')
      .eq('pipeline_id', PIPELINE_VENTE).eq('contact_id', rdv!.contact_id)
      .order('created_at_ghl', { ascending: false }).limit(1)
    const interdit = refusDroits(profil, rdv!, champCloser(ventes?.[0]?.raw))
    if (interdit) return json({ error: interdit }, 403)

    const contactId = rdv!.contact_id as string
    const nom = profil?.full_name ?? user.email ?? null

    // Confirmation active posée depuis le hub (table absente : on le dit, sans bloquer la confirmation)
    const { data: active, error: errJournal } = await db.from('v2_confirmations')
      .select('id').eq('appointment_id', appointmentId).is('annule_le', null).maybeSingle()
    const journalAbsent = !!errJournal
    if (errJournal) console.error('[confirmer] v2_confirmations illisible :', errJournal.message)

    if (action === 'annuler') {
      if (journalAbsent) return json({ error: 'Le journal des confirmations (v2_confirmations) n’est pas encore en place : retire confirme-manuel et statut-confirme dans GHL.' }, 503)
      if (!active) return json({ error: 'Cette rencontre n’a pas été confirmée depuis le hub : rien à retirer ici.' }, 409)
    }

    // 1. Tags : retirer d'abord (annulation), puis poser
    const tags = tagsDeLAction(action)
    const tagsGhl = (method: 'POST' | 'DELETE', liste: string[]) => fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method, headers: ghlHeaders(apiKey), body: JSON.stringify({ tags: liste }),
    })
    if (tags.retirer.length > 0) {
      const res = await tagsGhl('DELETE', tags.retirer)
      if (!res.ok) {
        console.error(`[confirmer] retrait ${tags.retirer.join(', ')} ${res.status}:`, (await res.text()).slice(0, 300))
        return json({ error: `GHL a refusé le retrait des tags (${res.status}).` }, 502)
      }
    }
    const poseRes = await tagsGhl('POST', tags.poser)
    if (!poseRes.ok) {
      console.error(`[confirmer] pose ${tags.poser.join(', ')} ${poseRes.status}:`, (await poseRes.text()).slice(0, 300))
      return json({
        error: action === 'confirmer'
          ? `GHL a refusé le tag confirme-manuel (${poseRes.status}).`
          : `Les tags confirme-manuel et statut-confirme sont retirés, mais GHL a refusé app-confirmation-retiree (${poseRes.status}) : ramène la carte Vente en « RDV booké » à la main.`,
      }, 502)
    }

    // 2. Note : qui et quand (attribuée à la personne dans GHL si on connaît son userId)
    const note: Record<string, string> = { body: texteNote(action, nom, rdv!.start_time as string) }
    if (profil?.ghl_user_id) note.userId = profil.ghl_user_id
    const poserNote = (corps: Record<string, string>) => fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: 'POST', headers: ghlHeaders(apiKey), body: JSON.stringify(corps),
    })
    let noteRes = await poserNote(note)
    // userId refusé (utilisateur GHL inconnu) : la note part quand même, le texte dit qui
    if (!noteRes.ok && note.userId) {
      console.warn(`[confirmer] note avec userId refusée (${noteRes.status}), nouvel essai sans userId`)
      noteRes = await poserNote({ body: note.body })
    }
    const noteOk = noteRes.ok
    if (!noteOk) console.error(`[confirmer] note ${noteRes.status}:`, (await noteRes.text()).slice(0, 300))

    // 3. Journal
    let journalOk = !journalAbsent
    if (!journalAbsent) {
      const maintenant = new Date().toISOString()
      const { error } = action === 'confirmer'
        ? (active ? { error: null } : await db.from('v2_confirmations').insert({
          appointment_id: appointmentId, contact_id: contactId,
          confirme_par: user.id, confirme_par_nom: nom, confirme_le: maintenant,
        }))
        : await db.from('v2_confirmations')
          .update({ annule_par: user.id, annule_par_nom: nom, annule_le: maintenant })
          .eq('id', active!.id)
      if (error) { journalOk = false; console.error('[confirmer] journal :', error.message) }
    }

    console.log(`[confirmer] ${action} RDV ${appointmentId} par ${user.email} (note ${noteOk ? 'ok' : 'échouée'}, journal ${journalOk ? 'ok' : 'absent'})`)
    return json({ ok: true, noteOk, journalOk })

  } catch (err) {
    console.error('ghl-confirmer-rencontre error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
