// Cycle du Setting v2, appelé toutes les 2 min par pg_cron (migration
// 20261016a_setting_v2.sql). Ne reçoit aucune donnée : un appel de trop ne fait
// que refaire ce que le prochain ferait.
//  1. Copie le journal d'appels GHL dans setting_appels (LECTURE SEULE dans GHL)
//  2. Propriété : appel de 60 s ou plus d'un setter → lead assigné pour de bon
//     (le premier setter le garde) ; libéré seulement par le setter ou l'admin
//  3. Tâches : rappel arrivé à échéance, lead assigné sans action depuis
//     2 jours ouvrables, no-show / annulation à relancer
//  4. Rappels : à l'échéance, ou dès qu'un RDV est booké, retire le tag
//     rappel-manuel (seule écriture GHL, soumise à l'interrupteur)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  lignesAppels, nouveauxProprietaires, proprieteEnAlerte, TAG_RAPPEL,
} from '../_shared/settingRegles.js'
import { ghl, locationId, lireConfig, resoudreChamps, ecrituresPermises, ecrire, fmtQuand } from '../_shared/settingGhl.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

// deno-lint-ignore no-explicit-any
type J = any

const JOURS_HISTORIQUE = 31            // premier passage : un mois d'appels
const RECOUVREMENT_MS = 10 * 60_000    // relit 10 min avant le curseur (appels finis en retard)
const MAX_PAGES = 10
const CALENDRIERS_DECOUVERTE = ['DIN6EPtG7eNU3Gf6ZRoC', 'ucyJmhYKKDDm7U5JmaJ8', '4227QzeKvFczi5BZyHOC']
const PIPELINE_SETTING_ID = 'KkPiFjw0ztAXc7z6Ab9c'
const FIELD_SETTER_NOM = 'II5NrZGZrIScYItkxCi8'

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const bilan: Record<string, unknown> = {}
  try {
    let config = await lireConfig(db)
    config = await resoudreChamps(db, config)

    const { data: profils } = await db.from('profiles').select('id, full_name, ghl_user_id')
    const parGhl = Object.fromEntries((profils ?? []).filter((p: J) => p.ghl_user_id).map((p: J) => [p.ghl_user_id, p.id]))
    const parNom = Object.fromEntries((profils ?? []).map((p: J) => [String(p.full_name ?? '').trim().toLowerCase(), p.id]))

    // ── 1. Journal d'appels (lecture GHL) ──────────────────────────────
    const { data: cur } = await db.from('setting_config').select('valeur').eq('cle', 'appels_curseur').maybeSingle()
    const depuisMs = cur?.valeur ? new Date(cur.valeur).getTime() - RECOUVREMENT_MS : now - JOURS_HISTORIQUE * 86_400_000
    const loc = await locationId(db)
    const messages: J[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ locationId: loc, channel: 'Call', startDate: new Date(depuisMs).toISOString(), limit: '1000', sortOrder: 'desc' })
      if (cursor) qs.set('cursor', cursor)
      const data = await ghl(`/conversations/messages/export?${qs}`, { version: '2021-04-15' })
      messages.push(...(data?.messages ?? []))
      cursor = data?.nextCursor ?? null
      if (!cursor || (data?.messages ?? []).length === 0) break
    }
    const appels = lignesAppels(messages, parGhl)
    // Ids déjà connus : seuls les nouveaux appels comptent pour la propriété
    const connus = new Set<string>()
    for (let i = 0; i < appels.length; i += 500) {
      const { data } = await db.from('setting_appels').select('id').in('id', appels.slice(i, i + 500).map(a => a.id))
      for (const r of data ?? []) connus.add(r.id)
    }
    for (let i = 0; i < appels.length; i += 500) {
      const { error } = await db.from('setting_appels').upsert(appels.slice(i, i + 500))
      if (error) throw new Error(`setting_appels : ${error.message}`)
    }
    const nouveaux = appels.filter(a => !connus.has(a.id))
    // Profil relié après coup (ghl_user_id saisi dans le dossier membre) : les
    // appels déjà copiés reçoivent leur auteur
    let relies = 0
    for (const [ghlId, profilId] of Object.entries(parGhl)) {
      const { count } = await db.from('setting_appels').update({ user_id: profilId }, { count: 'exact' })
        .eq('ghl_user_id', ghlId).is('user_id', null)
      relies += count ?? 0
    }
    if (appels.length) {
      const max = appels.reduce((m, a) => (a.appele_le > m ? a.appele_le : m), appels[0].appele_le)
      await db.from('setting_config').upsert({ cle: 'appels_curseur', valeur: max, maj_le: iso })
    } else if (!cur?.valeur) {
      await db.from('setting_config').upsert({ cle: 'appels_curseur', valeur: iso, maj_le: iso })
    }
    bilan.appels = { lus: appels.length, nouveaux: nouveaux.length, sansAuteur: appels.filter(a => !a.ghl_user_id).length, relies }

    // ── 2. Propriété ───────────────────────────────────────────────────
    const { data: props } = await db.from('setting_proprietes').select('*')
    const proprio = new Map<string, J>((props ?? []).map((p: J) => [p.contact_id, p]))
    // Profils qui ne reçoivent jamais de lead par la règle des 60 s (setting_config)
    const { data: cfgExclus } = await db.from('setting_config').select('valeur').eq('cle', 'proprietaires_exclus').maybeSingle()
    const exclus = new Set<string>(Array.isArray(cfgExclus?.valeur) ? cfgExclus.valeur : [])
    // Tous les appels relus (fenêtre de 10 min avant le curseur), pas seulement
    // les nouveaux : un appel copié pendant qu'il était en cours n'a pas encore de
    // durée ; sa durée arrive au passage suivant. Un lead qui a déjà un
    // propriétaire n'est jamais repris (voir plus bas).
    // Lead libéré (« Rendre disponible ») : seule une conversation postérieure
    // à la libération le réattribue
    const { data: libs } = await db.from('setting_liberations').select('contact_id, libere_le')
    const libereLe = new Map<string, string>((libs ?? []).map((l: J) => [l.contact_id, l.libere_le]))
    const gagnants = nouveauxProprietaires(appels.filter(a => !exclus.has(a.user_id)
      && !(libereLe.has(a.contact_id) && new Date(a.appele_le).getTime() <= new Date(libereLe.get(a.contact_id)!).getTime())))
    let assignes = 0
    for (const [contactId, g] of Object.entries(gagnants) as [string, J][]) {
      // Le lead reste au premier setter qui lui a parlé (jamais repris par un autre)
      if (proprio.get(contactId)) continue
      const ligne = { contact_id: contactId, user_id: g.user_id, origine: 'appel_60s', depuis: g.appele_le, derniere_action: g.appele_le, assigne_par: null }
      await db.from('setting_proprietes').upsert(ligne)
      proprio.set(contactId, ligne); assignes++
    }
    // Tout appel du propriétaire (même court) est une action
    for (const a of nouveaux) {
      const p = proprio.get(a.contact_id)
      if (p && a.user_id === p.user_id && a.appele_le > p.derniere_action) {
        await db.from('setting_proprietes').update({ derniere_action: a.appele_le }).eq('contact_id', a.contact_id).eq('user_id', p.user_id)
        p.derniere_action = a.appele_le
      }
    }

    const { data: rappelsActifs } = await db.from('setting_rappels').select('*').eq('statut', 'actif')
    const rappelAVenir = new Set((rappelsActifs ?? []).filter((r: J) => new Date(r.rappel_le).getTime() > now).map((r: J) => r.contact_id))

    const opps: J[] = []
    for (let a = 0; ; a += 1000) {
      const { data, error } = await db.from('ghl_opportunities').select('contact_id, contact_name, raw, status, pipeline_stage_id')
        .eq('pipeline_id', PIPELINE_SETTING_ID).order('id').range(a, a + 999)
      if (error) throw new Error(`ghl_opportunities : ${error.message}`)
      opps.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }
    const nomContact = new Map<string, string>(opps.map((o: J) => [o.contact_id, o.contact_name]))

    // Carte « 💬 Contact établi » sans propriétaire (le workflow GHL l'a déplacée,
    // appel de moins de 60 s ou sans durée) : le lead va au setter qui a appelé
    // en dernier avant le changement d'étape, sinon au setter du champ setter__nom.
    // Jamais pour un lead libéré depuis, ni pour un profil exclu.
    const STAGE_CONTACT_ETABLI = '0a3237b7-6878-4a45-bd3e-3013908ee257'
    const appelsParContact = new Map<string, J[]>()
    {
      const ids = opps.filter((o: J) => o.status === 'open' && o.pipeline_stage_id === STAGE_CONTACT_ETABLI && !proprio.has(o.contact_id)).map((o: J) => o.contact_id)
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await db.from('setting_appels').select('contact_id, user_id, appele_le').in('contact_id', ids.slice(i, i + 200)).not('user_id', 'is', null)
        for (const a of data ?? []) {
          if (!appelsParContact.has(a.contact_id)) appelsParContact.set(a.contact_id, [])
          appelsParContact.get(a.contact_id)!.push(a)
        }
      }
    }
    let parEtape = 0
    for (const o of opps) {
      if (o.status !== 'open' || o.pipeline_stage_id !== STAGE_CONTACT_ETABLI || proprio.has(o.contact_id)) continue
      const chg = o.raw?.lastStageChangeAt ?? null
      if (libereLe.has(o.contact_id) && (!chg || new Date(libereLe.get(o.contact_id)!).getTime() >= new Date(chg).getTime())) continue
      const limite = chg ? new Date(new Date(chg).getTime() + 15 * 60_000).toISOString() : iso
      const dernier = (appelsParContact.get(o.contact_id) ?? [])
        .filter((a: J) => !exclus.has(a.user_id) && new Date(a.appele_le).getTime() <= new Date(limite).getTime())
        .sort((a: J, b: J) => new Date(b.appele_le).getTime() - new Date(a.appele_le).getTime())[0]
      let user = dernier?.user_id ?? null
      if (!user) {
        const cf = (o.raw?.customFields ?? []).find((f: J) => f.id === FIELD_SETTER_NOM)
        const nom = String(cf?.fieldValueString ?? cf?.value ?? '').trim().toLowerCase()
        const p = nom ? parNom[nom] : null
        user = p && !exclus.has(p) ? p : null
      }
      if (!user) continue
      const quand = dernier?.appele_le ?? chg ?? iso
      const ligne = { contact_id: o.contact_id, user_id: user, origine: 'appel_60s', depuis: quand, derniere_action: quand, assigne_par: null }
      const { error } = await db.from('setting_proprietes').insert(ligne)
      if (!error) { proprio.set(o.contact_id, ligne); parEtape++ }
    }

    // Propriété permanente : plus aucun retour automatique dans la liste commune
    // (décision du 16 oct. 2026). Seul le bouton « Rendre disponible aux autres
    // setters » ou l'admin libère un lead. Rappel au setter après 2 jours ouvrables
    // sans action.
    const liberes = 0
    const taches: J[] = []
    // Seulement les leads encore au travail dans le pipeline setting (carte
    // ouverte, de « Nouveau lead » à « Contact établi ») et dont la dernière
    // action date de moins de 14 jours : pas de tâche pour un lead booké, perdu
    // ou ancien.
    const ETAPES_TRAVAIL = new Set([
      '5e98eb57-e85a-4e9c-8657-b7e1a66cd80b', '8251ffae-ea6a-4bcf-8e9a-86feebc4449b',
      '74b49788-5c9d-4c72-a3e1-6161f4424e86', '20e227e1-6320-496e-9927-650d12f23261',
      '5acf7aa4-393f-46b6-a214-369985df04b3', '0a3237b7-6878-4a45-bd3e-3013908ee257',
    ])
    const auTravail = new Set(opps.filter((o: J) => o.status === 'open' && ETAPES_TRAVAIL.has(o.pipeline_stage_id)).map((o: J) => o.contact_id))
    for (const p of proprio.values()) {
      if (rappelAVenir.has(p.contact_id) || !auTravail.has(p.contact_id)) continue
      if (now - new Date(p.derniere_action).getTime() > 14 * 86_400_000) continue
      if (proprieteEnAlerte(p.derniere_action, now)) {
        taches.push({
          cle: `inactif:${p.contact_id}:${p.derniere_action}`, type: 'inactif_2j', user_id: p.user_id,
          contact_id: p.contact_id, contact_nom: nomContact.get(p.contact_id) ?? null,
          titre: `Lead sans action depuis 2 jours ouvrables : ${nomContact.get(p.contact_id) ?? 'lead'}`,
          detail: 'Rappelle-le, mets un rappel ou un résultat, ou rends-le disponible aux autres setters.', due_le: iso,
        })
      }
    }
    bilan.proprietes = { assignes, parEtape, liberes }

    // ── 3a. Rappels arrivés à échéance ─────────────────────────────────
    const { data: rdvs } = await db.from('ghl_appointments').select('ghl_id, contact_id, contact_name, calendar_id, start_time, status')
      .in('calendar_id', CALENDRIERS_DECOUVERTE)
      .gte('start_time', new Date(now - 72 * 3_600_000).toISOString())
    const rdvAVenir = new Set((rdvs ?? []).filter((a: J) => ['new', 'confirmed'].includes(a.status) && new Date(a.start_time).getTime() > now).map((a: J) => a.contact_id))

    let tagsRetires = 0
    for (const r of rappelsActifs ?? []) {
      const du = new Date(r.rappel_le).getTime() <= now
      if (rdvAVenir.has(r.contact_id)) {
        // RDV booké depuis : le rappel est fait
        await db.from('setting_rappels').update({ statut: 'fait', termine_le: iso }).eq('id', r.id)
      } else if (du) {
        taches.push({
          cle: `rappel:${r.id}`, type: 'rappel_du', user_id: r.user_id, contact_id: r.contact_id, contact_nom: r.contact_nom,
          titre: `Rappel : ${r.contact_nom ?? 'lead'}`, detail: r.note, due_le: r.rappel_le,
        })
      }
      if ((du || rdvAVenir.has(r.contact_id)) && !r.tag_retire_le) {
        if (!r.ghl_simule && await ecrituresPermises(db, config, r.contact_id)) {
          try {
            await ecrire.retirerTags(r.contact_id, [TAG_RAPPEL])
            if (config.champs.date_rappel) await ecrire.champContact(r.contact_id, config.champs.date_rappel, null)
            tagsRetires++
          } catch (e) { console.error('[setting-cycle] retrait tag', r.contact_id, (e as Error).message); continue }
        }
        await db.from('setting_rappels').update({ tag_retire_le: iso }).eq('id', r.id)
      }
    }
    // Rappels terminés : leurs tâches sont faites
    const { data: finis } = await db.from('setting_rappels').select('id').neq('statut', 'actif').gte('termine_le', new Date(now - 86_400_000).toISOString())
    for (const f of finis ?? []) await db.from('setting_taches').update({ fait_le: iso }).eq('cle', `rappel:${f.id}`).is('fait_le', null)

    // ── 3b. No-show / annulation à relancer ────────────────────────────
    const setterDe = (contactId: string): string | null => {
      const p = proprio.get(contactId)
      if (p) return p.user_id
      const o = opps.find((x: J) => x.contact_id === contactId)
      const nom = String((o?.raw?.customFields ?? []).find((f: J) => f.id === FIELD_SETTER_NOM)?.fieldValueString
        ?? (o?.raw?.customFields ?? []).find((f: J) => f.id === FIELD_SETTER_NOM)?.value ?? '').trim().toLowerCase()
      return (nom && parNom[nom]) || null
    }
    for (const a of rdvs ?? []) {
      if (!a.contact_id || !['noshow', 'cancelled'].includes(a.status)) continue
      if (new Date(a.start_time).getTime() > now && a.status === 'noshow') continue
      if (rdvAVenir.has(a.contact_id)) continue
      const type = a.status === 'noshow' ? 'no_show' : 'annulation'
      taches.push({
        cle: `${type}:${a.ghl_id}`, type, user_id: setterDe(a.contact_id), contact_id: a.contact_id,
        contact_nom: a.contact_name ?? nomContact.get(a.contact_id) ?? null,
        titre: `${type === 'no_show' ? 'No-show' : 'Annulation'} à relancer : ${a.contact_name ?? 'lead'}`,
        detail: `Rencontre découverte du ${fmtQuand(a.start_time)}`, due_le: iso,
      })
    }
    // Rebooké : les tâches no-show / annulation du contact sont faites
    if (rdvAVenir.size) {
      await db.from('setting_taches').update({ fait_le: iso }).in('type', ['no_show', 'annulation'])
        .in('contact_id', [...rdvAVenir]).is('fait_le', null)
    }

    if (taches.length) {
      const { error } = await db.from('setting_taches').upsert(taches, { onConflict: 'cle', ignoreDuplicates: true })
      if (error) throw new Error(`setting_taches : ${error.message}`)
    }
    bilan.taches = taches.length
    bilan.tagsRetires = tagsRetires
    console.log('[setting-cycle]', JSON.stringify(bilan))
    return new Response(JSON.stringify({ ok: true, ...bilan }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[setting-cycle]', err)
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message, ...bilan }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
