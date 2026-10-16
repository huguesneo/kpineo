// Actions du setter sur un lead (Setting v2) :
//   resultat        Rendez-vous booké / Non qualifié (+ raison) / Pas intéressé
//   rappel          Mettre en rappel (date, heure, note)
//   rappel_fait / rappel_annuler
//   reassigner      admin : donner le lead à un setter, ou le remettre dans la liste commune
// Écritures GHL soumises à l'interrupteur (settingGhl.ecrituresPermises) : tant
// qu'il est éteint, seul le contact test est réellement modifié dans GHL ; pour
// les autres, l'action est enregistrée dans l'app avec ghl_simule = true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { erreurResultat, noteNonQualifie, TAG_NON_QUALIFIE, TAG_PAS_INTERESSE, TAG_RAPPEL } from '../_shared/settingRegles.js'
import {
  ghl, lireConfig, resoudreChamps, ecrituresPermises, ecrire, prenomDe, fmtQuand,
  PIPELINE_SETTING_ID, STAGE_NON_QUALIFIE, STAGE_PAS_INTERESSE,
} from '../_shared/settingGhl.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ROLES_VENTE = ['admin', 'resp_vente', 'setter', 'closer']

// deno-lint-ignore no-explicit-any
type J = any

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
    const { data: profil } = await db.from('profiles').select('id, full_name, role, secondary_roles').eq('id', user.id).maybeSingle()
    const roles = [profil?.role, ...(profil?.secondary_roles ?? [])]
    if (!profil || !roles.some(r => ROLES_VENTE.includes(r))) return json({ error: 'Réservé à l’équipe de vente' }, 403)
    const estAdmin = profil.role === 'admin' || profil.role === 'resp_vente'

    const body = await req.json() as J
    const action = String(body.action ?? '')
    const contactId = String(body.contactId ?? '').trim()
    if (!contactId) return json({ error: 'contactId requis' }, 400)

    let config = await lireConfig(db)
    const reel = await ecrituresPermises(db, config, contactId)
    const prenom = prenomDe(profil.full_name)
    const maintenant = new Date().toISOString()

    // Opportunité setting du contact (vérifiée dans GHL, lecture)
    async function oppSetting(oppId: string | null): Promise<J | null> {
      if (!oppId) return null
      const r = await ghl(`/opportunities/${oppId}`)
      const o = r?.opportunity
      if (!o || o.contactId !== contactId || o.pipelineId !== PIPELINE_SETTING_ID) {
        throw new Error('Cette opportunité n’est pas la carte setting de ce contact')
      }
      return o
    }

    // Retire le tag rappel-manuel s'il ne reste aucun rappel actif sur le contact
    async function retirerTagRappelSiPlusRien(): Promise<void> {
      const { count } = await db.from('setting_rappels').select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId).eq('statut', 'actif')
      if ((count ?? 0) > 0 || !reel) return
      await ecrire.retirerTags(contactId, [TAG_RAPPEL])
      if (config.champs.date_rappel) await ecrire.champContact(contactId, config.champs.date_rappel, null)
    }

    // Une action du propriétaire repousse le retour dans la liste commune
    async function noterAction(): Promise<void> {
      await db.from('setting_proprietes').update({ derniere_action: maintenant })
        .eq('contact_id', contactId).eq('user_id', profil.id)
    }

    // ── Résultat de l'appel ──────────────────────────────────────────────
    if (action === 'resultat') {
      const err = erreurResultat(body)
      if (err) return json({ error: err }, 400)
      const resultat = body.resultat as string
      const opp = await oppSetting(body.opportunityId ?? null)
      if (resultat !== 'rdv_booke' && !opp) return json({ error: 'Carte du pipeline setting introuvable pour ce lead' }, 400)

      const ecrits: string[] = []
      if (reel && resultat === 'non_qualifie') {
        await ecrire.deplacerOpportunite(opp.id, PIPELINE_SETTING_ID, STAGE_NON_QUALIFIE); ecrits.push('opportunité → Non qualifié')
        await ecrire.statutOpportunite(opp.id, 'lost'); ecrits.push('opportunité → Perdue')
        await ecrire.ajouterTags(contactId, [TAG_NON_QUALIFIE]); ecrits.push(`tag ${TAG_NON_QUALIFIE}`)
        await ecrire.note(contactId, noteNonQualifie({ raison: body.raison, raisonTexte: body.raisonTexte, prenom, quand: fmtQuand() })); ecrits.push('note')
      }
      if (reel && resultat === 'pas_interesse') {
        await ecrire.deplacerOpportunite(opp.id, PIPELINE_SETTING_ID, STAGE_PAS_INTERESSE); ecrits.push('opportunité → Pas intéressé')
        await ecrire.statutOpportunite(opp.id, 'lost'); ecrits.push('opportunité → Perdue')
        await ecrire.ajouterTags(contactId, [TAG_PAS_INTERESSE]); ecrits.push(`tag ${TAG_PAS_INTERESSE}`)
      }

      // Source et canal au moment du résultat (compteur admin)
      const { data: c } = await db.from('ghl_contacts').select('tags, utm_source, raw, first_name, last_name').eq('ghl_id', contactId).maybeSingle()
      const tags: string[] = c?.tags ?? []
      const canal = ['canal-meta-ads', 'canal-organique', 'canal-inconnu'].find(t => tags.includes(t)) ?? null
      config = await resoudreChamps(db, config)
      const cycle = config.champs.cycle_utm_source
        ? (c?.raw?.customFields ?? []).find((f: J) => f.id === config.champs.cycle_utm_source)?.value
        : null
      const nom = opp?.name ?? ([c?.first_name, c?.last_name].filter(Boolean).join(' ') || null)

      const { error: insErr } = await db.from('setting_resultats').insert({
        contact_id: contactId, opportunity_id: opp?.id ?? body.opportunityId ?? null, contact_nom: nom,
        user_id: profil.id, resultat,
        raison: resultat === 'non_qualifie' ? body.raison : null,
        raison_texte: resultat === 'non_qualifie' && body.raison === 'autre' ? String(body.raisonTexte).trim().slice(0, 300) : null,
        source: cycle || c?.utm_source || null, canal,
        ghl_simule: !reel || resultat === 'rdv_booke',
      })
      if (insErr) throw new Error(insErr.message)

      // Un résultat clôt les rappels actifs du contact et retire le tag
      await db.from('setting_rappels').update({ statut: 'fait', termine_le: maintenant })
        .eq('contact_id', contactId).eq('statut', 'actif')
      await retirerTagRappelSiPlusRien()
      if (reel) ecrits.push(`tag ${TAG_RAPPEL} retiré si présent`)
      await noterAction()

      console.log(`[setting-actions] ${resultat} ${contactId} par ${user.email} (${reel ? 'GHL réel' : 'simulé'})`)
      return json({ ok: true, reel, ecrits })
    }

    // ── Mettre en rappel ─────────────────────────────────────────────────
    if (action === 'rappel') {
      const quand = new Date(body.rappelLe)
      if (Number.isNaN(quand.getTime())) return json({ error: 'Date et heure du rappel requises' }, 400)
      if (quand.getTime() < Date.now() - 60_000) return json({ error: 'Le rappel doit être dans le futur' }, 400)
      const note = String(body.note ?? '').trim().slice(0, 500) || null

      // Un seul rappel actif par contact : le nouveau remplace les anciens
      await db.from('setting_rappels').update({ statut: 'annule', termine_le: maintenant })
        .eq('contact_id', contactId).eq('statut', 'actif')

      const ecrits: string[] = []
      if (reel) {
        await ecrire.ajouterTags(contactId, [TAG_RAPPEL]); ecrits.push(`tag ${TAG_RAPPEL}`)
        config = await resoudreChamps(db, config)
        if (config.champs.date_rappel) {
          await ecrire.champContact(contactId, config.champs.date_rappel, quand.toISOString().slice(0, 10)); ecrits.push('champ date_rappel')
        } else {
          ecrits.push('champ date_rappel introuvable dans GHL (à créer)')
        }
      }
      // Lead déjà à un setter : le rappel est pour lui (même créé par l'admin) ;
      // sinon le lead devient celui du setter qui crée le rappel
      const { data: proprio } = await db.from('setting_proprietes').select('user_id').eq('contact_id', contactId).maybeSingle()
      if (proprio && proprio.user_id !== profil.id && !estAdmin) return json({ error: 'Ce lead appartient à un autre setter' }, 403)
      const pour = proprio?.user_id ?? profil.id
      const { data: r, error } = await db.from('setting_rappels').insert({
        contact_id: contactId, opportunity_id: body.opportunityId ?? null, contact_nom: body.contactNom ?? null,
        user_id: pour, rappel_le: quand.toISOString(), note, ghl_simule: !reel,
      }).select().single()
      if (error) throw new Error(error.message)

      if (proprio) {
        await db.from('setting_proprietes').update({ derniere_action: maintenant }).eq('contact_id', contactId)
      } else {
        await db.from('setting_proprietes').insert({
          contact_id: contactId, user_id: profil.id, origine: 'rappel', depuis: maintenant, derniere_action: maintenant, assigne_par: profil.id,
        })
      }
      return json({ ok: true, reel, ecrits, rappel: r })
    }

    if (action === 'rappel_fait' || action === 'rappel_annuler') {
      const id = String(body.rappelId ?? '')
      let q = db.from('setting_rappels').update({ statut: action === 'rappel_fait' ? 'fait' : 'annule', termine_le: maintenant })
        .eq('id', id).eq('contact_id', contactId).eq('statut', 'actif')
      if (!estAdmin) q = q.eq('user_id', profil.id)
      const { data, error } = await q.select()
      if (error) throw new Error(error.message)
      if (!data?.length) return json({ error: 'Rappel introuvable' }, 404)
      await retirerTagRappelSiPlusRien()
      await noterAction()
      return json({ ok: true, reel })
    }

    // ── Note depuis la fiche : dans GHL (si l'interrupteur le permet) et dans l'app
    if (action === 'note') {
      const texte = String(body.texte ?? '').trim().slice(0, 2000)
      if (!texte) return json({ error: 'Note vide' }, 400)
      let ghlNoteId: string | null = null
      if (reel) {
        const r = await ecrire.note(contactId, `📝 ${texte}\n— ${prenom || 'Setter'} (hub), le ${fmtQuand()}`)
        ghlNoteId = r?.note?.id ?? r?.id ?? 'ok'
      }
      const { data: n, error } = await db.from('setting_notes').insert({ contact_id: contactId, user_id: profil.id, texte, ghl_note_id: ghlNoteId }).select().single()
      if (error) throw new Error(error.message)
      await noterAction()
      return json({ ok: true, reel, note: n })
    }

    // ── Rendre le lead disponible aux autres setters ─────────────────────
    // Le propriétaire (ou l'admin) remet le lead dans la liste commune. Ses
    // rappels actifs sont annulés et le tag rappel-manuel retiré.
    if (action === 'liberer') {
      const { data: p } = await db.from('setting_proprietes').select('user_id').eq('contact_id', contactId).maybeSingle()
      if (!p) return json({ ok: true, deja: true })
      if (p.user_id !== profil.id && !estAdmin) return json({ error: 'Ce lead appartient à un autre setter' }, 403)
      await db.from('setting_proprietes').delete().eq('contact_id', contactId)
      await db.from('setting_liberations').upsert({ contact_id: contactId, libere_le: maintenant, libere_par: profil.id, ancien_user: p.user_id })
      await db.from('setting_rappels').update({ statut: 'annule', termine_le: maintenant }).eq('contact_id', contactId).eq('statut', 'actif')
      await db.from('setting_taches').update({ fait_le: maintenant }).eq('contact_id', contactId).in('type', ['rappel_du', 'inactif_2j']).is('fait_le', null)
      await retirerTagRappelSiPlusRien()
      console.log(`[setting-actions] liberer ${contactId} par ${user.email}`)
      return json({ ok: true, reel })
    }

    // ── Réassignation (admin) ────────────────────────────────────────────
    if (action === 'reassigner') {
      if (!estAdmin) return json({ error: 'Réservé à l’admin' }, 403)
      const cible = body.userId ? String(body.userId) : null
      if (!cible) {
        const { data: avant } = await db.from('setting_proprietes').select('user_id').eq('contact_id', contactId).maybeSingle()
        await db.from('setting_proprietes').delete().eq('contact_id', contactId)
        await db.from('setting_liberations').upsert({ contact_id: contactId, libere_le: maintenant, libere_par: profil.id, ancien_user: avant?.user_id ?? null })
        return json({ ok: true })
      }
      const { data: p } = await db.from('profiles').select('id').eq('id', cible).maybeSingle()
      if (!p) return json({ error: 'Setter introuvable' }, 400)
      await db.from('setting_proprietes').upsert({
        contact_id: contactId, user_id: cible, origine: 'admin', depuis: maintenant, derniere_action: maintenant, assigne_par: profil.id,
      })
      // Les rappels actifs suivent le lead
      await db.from('setting_rappels').update({ user_id: cible }).eq('contact_id', contactId).eq('statut', 'actif')
      return json({ ok: true })
    }

    return json({ error: `Action inconnue : ${action}` }, 400)
  } catch (err) {
    console.error('[setting-actions]', err)
    return json({ error: (err as Error).message }, 500)
  }
})
