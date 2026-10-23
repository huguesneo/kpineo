// Page Adjoint du hub : la file d'approbation de Léo.
// Le journal de Léo (leo_service_interactions) et les clients sont dans le projet
// Clinique : RLS sans politique, donc tout passe ici, avec la clé service du projet
// Clinique (secrets CLINIQUE_SUPABASE_URL, CLINIQUE_SERVICE_ROLE_KEY). Rien de ce
// projet ne va dans le front, et le payload est filtré avant d'être renvoyé.
//
// Les actions réelles passent par le scénario Make « Léo : Actions Slack » (4860558),
// inchangé : on lui envoie ce que Slack lui envoie (secret LEO_ACTIONS_WEBHOOK_URL).
// Make répond tout de suite, puis fait le travail et poste son accusé à
// response_url = leo-adjoint-ack, qui confirme dans la ligne (hub_execution, hub_ack).
//
// Une seule fonction, champ « op » : liste, dossier, fil, recherche, personne, commandes,
// compteurs, decider, reclasser, rediger, historique (une source à la fois : gmail, ghl,
// app), filGmail (un fil par son id, depuis l'historique), creerDepuisCourriel (ligne Léo
// pour un courriel que Léo n'a pas encore traité, avant d'y répondre ou de le fermer). « fil » lit le vrai fil Gmail de info@ (_shared/gmail.ts).
// Accès : Hugues et Cloé (peutUtiliserAdjoint).
// Déploiement : avec vérification JWT (par défaut).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  peutUtiliserAdjoint, filtresListe, filtresCommandes, actionPrincipale, valeurMake, corpsFormulaireMake,
  complementsMake, manquesMake, refusDecision, trierFile, courrielDuDossier, normaliserCourriel, nomDuDossier, sujetDuDossier,
  sujetReponse, statutPersonne, STATUTS_PERSONNE, semaineProgramme, analyserRecherche, motifTelephone, dossierPourEcran,
  resumeDossier, texteVersHtml, remplacerCorpsHtml, htmlVersTexte, messageSlack, corpsSlackTraite, debutJourMontreal, jourMontreal,
  numeroCommande, blocageCommande, estLibelleGmail, ACTIONS_MAKE, formatDate, enRetard, CANAUX,
} from '../_shared/adjoint.js'
import {
  requeteAnthropic, texteReponse, nettoyerBrouillon, avertissementsBrouillon, ajouterJournalRedaction,
} from '../_shared/adjointRedaction.js'
import { idsGmail, libelleDeClassement, classementAReessayer, messageDuFil } from '../_shared/gmailFil.js'
import { filDuDossier, classerFil, filsDeLaPersonne, gmailApi, GmailIndisponible } from '../_shared/gmail.ts'
import { estInterne } from '../_shared/gmailSync.js'
import { elementsGmail, elementsGhl, elementsApp } from '../_shared/historique.js'
import { ghl, locationId, contactIdByEmail } from '../_shared/ghl.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

// deno-lint-ignore no-explicit-any
type J = any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TABLE = 'leo_service_interactions'
const COLONNES = 'id,channel,client_id,contact_email,contact_phone,category,incoming_message,proposed_reply,decision,final_reply,decided_at,created_at,suggested_action,executed_at,etape,recu_quickbooks,total_qbo,gmail_message_id,gmail_thread_id,slack_channel_id,slack_message_ts,payload'
const PAGE = 50

class Refus extends Error {
  constructor(message: string, public status = 409, public extra: J = {}) { super(message) }
}

// Opérations [méthode, ...arguments] de _shared/adjoint.js appliquées à la requête
function appliquer(q: J, ops: J[][]) {
  for (const [m, ...a] of ops) q = q[m](...a)
  return q
}
// Valeur entre guillemets dans un filtre or() de PostgREST
const g = (v: string) => `"${String(v).replace(/"/g, '')}"`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ error: 'Non autorisé' }, 401)
    if (!peutUtiliserAdjoint(user.email)) return json({ error: 'La page Adjoint est réservée à Hugues et Cloé.' }, 403)

    const urlClinique = Deno.env.get('CLINIQUE_SUPABASE_URL')
    const cleClinique = Deno.env.get('CLINIQUE_SERVICE_ROLE_KEY')
    if (!urlClinique || !cleClinique) return json({ error: 'Secrets CLINIQUE_SUPABASE_URL et CLINIQUE_SERVICE_ROLE_KEY manquants.' }, 500)
    const db = createClient(urlClinique, cleClinique, { auth: { persistSession: false } })

    // Prénom affiché dans Slack (« Traité dans le Hub par Cloé »)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profil } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const moi = { courriel: String(user.email).toLowerCase(), prenom: String(profil?.full_name ?? user.email).split(' ')[0] }

    const body = await req.json().catch(() => ({}))
    const now = Date.now()
    const aujourdhui = jourMontreal(new Date(now))

    // ── Lectures ─────────────────────────────────────────────────────────────
    async function lireLigne(id: string) {
      const { data, error } = await db.from(TABLE).select(COLONNES).eq('id', id).maybeSingle()
      if (error) throw error
      return data
    }

    // clients par courriel (insensible à la casse), sans les supprimés
    async function clientsParCourriel(courriels: string[]): Promise<Map<string, J>> {
      const uniques = [...new Set(courriels.filter(Boolean))]
      const carte = new Map<string, J>()
      for (let i = 0; i < uniques.length; i += 40) {
        const lot = uniques.slice(i, i + 40)
        const { data } = await db.from('clients')
          .select('id,first_name,last_name,email,phone,naturopath_id,start_date,end_date,end_date_manual,program_finished,package_taken,created_at,is_deleted')
          .or(lot.map(e => `email.ilike.${g(e)}`).join(','))
        for (const c of data ?? []) {
          if (c.is_deleted) continue
          const k = normaliserCourriel(c.email)
          if (k && !carte.has(k)) carte.set(k, c)
        }
      }
      return carte
    }

    async function fichePersonne({ courriel, clientId }: { courriel?: string | null; clientId?: string | null }) {
      let client: J = null
      if (clientId) {
        const { data } = await db.from('clients').select('*').eq('id', clientId).maybeSingle()
        client = data
      }
      if (!client && courriel) {
        const { data } = await db.from('clients').select('*').ilike('email', courriel).or('is_deleted.is.null,is_deleted.eq.false')
          .order('created_at', { ascending: false }).limit(1)
        client = data?.[0] ?? null
      }
      let naturopathe: string | null = null
      if (client?.naturopath_id) {
        // clients.naturopath_id → profiles.user_id (clé étrangère du projet Clinique)
        const { data } = await db.from('profiles').select('first_name,email').eq('user_id', client.naturopath_id).maybeSingle()
        naturopathe = data?.first_name || data?.email || null
      }
      let prochainRdv: J = null
      if (client?.id) {
        const { data } = await db.from('client_appointments').select('title,appointment_type,start_time,status')
          .eq('client_id', client.id).gte('start_time', new Date(now).toISOString())
          .not('status', 'in', '(cancelled,invalid,noshow)').order('start_time', { ascending: true }).limit(1)
        prochainRdv = data?.[0] ?? null
      }
      const statut = statutPersonne(client, aujourdhui)
      const semaine = client ? semaineProgramme(client, aujourdhui) : null
      const forfait = String(client?.package_taken ?? '').trim()
      return {
        clientId: client?.id ?? null,
        prenom: client?.first_name ?? null,
        nom: client ? [client.first_name, client.last_name].filter(Boolean).join(' ') : null,
        courriel: normaliserCourriel(client?.email) ?? courriel ?? null,
        telephone: client?.phone ?? null,
        statut,
        statutLabel: STATUTS_PERSONNE[statut].label,
        naturopathe,
        programme: [forfait, semaine].filter(Boolean).join(' · ') || null,
        prochainRdv,
        clientDepuis: client ? (client.start_date || client.created_at) : null,
      }
    }

    // Tous les dossiers d'une personne : courriel (contact ou commande) ou client_id
    async function dossiersPersonne({ courriel, clientId }: { courriel?: string | null; clientId?: string | null }, limite = 200) {
      const conds: string[] = []
      if (courriel) conds.push(`contact_email.ilike.${g(courriel)}`, `payload->>client_courriel.ilike.${g(courriel)}`)
      if (clientId) conds.push(`client_id.eq.${clientId}`)
      if (!conds.length) return []
      const { data, error } = await db.from(TABLE).select(COLONNES).or(conds.join(','))
        .order('created_at', { ascending: false }).limit(limite)
      if (error) throw error
      return data ?? []
    }

    async function listeAvecNoms(rows: J[]) {
      const clients = await clientsParCourriel(rows.map(r => courrielDuDossier(r)))
      return rows.map(r => resumeDossier(r, clients.get(courrielDuDossier(r) ?? '') ?? null, now))
    }

    // ── Écritures ────────────────────────────────────────────────────────────
    // Écrit seulement si la ligne est encore en attente : refuse sinon, avec l'état réel
    // Écrit seulement si la ligne est encore en attente, puis vérifie ce que la base a
    // vraiment enregistré : 0 ligne modifiée ou valeur différente = erreur, jamais un 200.
    async function ecrireSiEnAttente(id: string, patch: J) {
      const { data, error } = await db.from(TABLE).update(patch).eq('id', id).eq('decision', 'pending').select('id,decision,payload')
      if (error) throw error
      if (!data?.length) {
        const actuelle = await lireLigne(id)
        throw new Refus(refusDecision(actuelle, now) ?? 'Ce dossier vient de changer. Recharge la page.', 409, { dossier: actuelle ? resumeDossier(actuelle, null, now) : null })
      }
      const ligne = data[0]
      const attendu = patch.decision ?? 'pending'
      const parAttendu = patch.payload?.hub_decided_by
      if (ligne.decision !== attendu || (parAttendu && ligne.payload?.hub_decided_by !== parAttendu)) {
        throw new Refus(`La base n’a pas enregistré la décision (lu : ${ligne.decision}). Rien n’a changé, réessaie.`, 500)
      }
      return ligne
    }
    // Ajoute des clés au payload en relisant la ligne juste avant (Make et l'accusé écrivent aussi)
    async function completerPayload(id: string, ajout: J) {
      const actuelle = await lireLigne(id)
      if (!actuelle) return
      await db.from(TABLE).update({ payload: { ...(actuelle.payload ?? {}), ...ajout } }).eq('id', id)
    }

    // chat.update : « Traité dans le Hub par … », bouton retiré. Un échec ne bloque rien.
    async function majSlack(row: J, resultat: string, quand: string) {
      const msg = messageSlack(row)
      if (!msg) return
      const token = Deno.env.get('SLACK_BOT_TOKEN')
      let erreur: string | null = null
      if (!token) erreur = 'SLACK_BOT_TOKEN absent'
      else {
        const corps = corpsSlackTraite({ par: moi.prenom, quand, resultat, sujet: sujetDuDossier(row) })
        const erreurs: string[] = []
        for (const canal of msg.canaux) {
          try {
            const r = await fetch('https://slack.com/api/chat.update', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify({ channel: canal, ts: msg.ts, ...corps }),
            })
            const j = await r.json().catch(() => ({}))
            if (j.ok) { erreurs.length = 0; break }
            erreurs.push(`${canal}: ${j.error ?? r.status}`)
          } catch (e) {
            erreurs.push(`${canal}: ${(e as Error).message}`)
          }
        }
        erreur = erreurs.length ? erreurs.join(' ; ') : null
      }
      if (erreur) await completerPayload(row.id, { hub_slack_erreur: { erreur, le: new Date().toISOString() } }).catch(() => {})
    }

    // Libellé Gmail le plus utilisé pour cette catégorie (Make en a besoin pour classer)
    async function libelleDeCategorie(categorie: string | null) {
      if (!categorie) return null
      const { data } = await db.from(TABLE).select('label:payload->>label_final').eq('category', categorie)
        .like('payload->>label_final', 'Label\\_%').order('created_at', { ascending: false }).limit(300)
      const n = new Map<string, number>()
      for (const r of data ?? []) if (estLibelleGmail(r.label)) n.set(r.label, (n.get(r.label) ?? 0) + 1)
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }

    // Rejeter / Déjà traité : classe aussi dans Gmail. Un échec ne bloque pas la décision,
    // il est noté dans payload.hub_gmail.erreur (bouton « Réessayer » dans le dossier).
    async function classerDansGmail(row: J) {
      const ids = idsGmail(row)
      if (!ids.threadId && !ids.messageId) return null
      const label = libelleDeClassement(row, await libelleDeCategorie(row.category).catch(() => null))
      const le = new Date().toISOString()
      let hubGmail: J
      try {
        const fil = await classerFil(ids, label)
        hubGmail = { classe_le: le, label, thread_id: fil, par: moi.courriel }
      } catch (e) {
        if (!(e instanceof GmailIndisponible)) console.error('leo-adjoint classement', e)
        hubGmail = { erreur: (e as Error).message, le, label, par: moi.courriel }
      }
      await completerPayload(row.id, { hub_gmail: hubGmail }).catch(() => {})
      return hubGmail
    }

    // ── Opérations ───────────────────────────────────────────────────────────
    const op = body.op

    if (op === 'compteurs') {
      const debut = debutJourMontreal(new Date(now))
      const [attente, traites, auto] = await Promise.all([
        db.from(TABLE).select('id,channel,created_at').eq('decision', 'pending').limit(1000),
        db.from(TABLE).select('id', { count: 'exact', head: true }).neq('decision', 'pending')
          .not('suggested_action', 'in', '(classer,archiver)').neq('decision', 'auto_envoye')
          .or(`executed_at.gte.${debut},decided_at.gte.${debut}`),
        db.from(TABLE).select('id', { count: 'exact', head: true })
          .or('suggested_action.in.(classer,archiver),decision.eq.auto_envoye').gte('created_at', debut),
      ])
      if (attente.error) throw attente.error
      const rows = attente.data ?? []
      const parCanal: Record<string, number> = {}
      for (const r of rows) parCanal[r.channel] = (parCanal[r.channel] ?? 0) + 1
      return json({
        aTraiter: rows.length,
        plusDe24h: rows.filter(r => enRetard(r, now)).length,
        traitesAujourdhui: traites.count ?? 0,
        faitsSeulsAujourdhui: auto.count ?? 0,
        parCanal,
      })
    }

    if (op === 'liste') {
      const { section = 'tout', sousSection = 'a_traiter', filtres = {}, curseur = 0 } = body
      const ops = filtresListe({ section, sousSection, filtres, debutJour: debutJourMontreal(new Date(now)), now: new Date(now) })
      if (sousSection === 'a_traiter') {
        // File complète, triée par urgence (78 dossiers aujourd'hui)
        const { data, error } = await appliquer(db.from(TABLE).select(COLONNES), ops).order('created_at', { ascending: true }).limit(500)
        if (error) throw error
        return json({ dossiers: await listeAvecNoms(trierFile(data ?? [], now)), suivant: null })
      }
      const debut = Math.max(0, Number(curseur) || 0)
      const { data, error } = await appliquer(db.from(TABLE).select(COLONNES), ops)
        .order('created_at', { ascending: false }).range(debut, debut + PAGE - 1)
      if (error) throw error
      const rows = data ?? []
      return json({ dossiers: await listeAvecNoms(rows), suivant: rows.length === PAGE ? debut + PAGE : null })
    }

    if (op === 'dossier') {
      const row = await lireLigne(String(body.id ?? ''))
      if (!row) return json({ error: 'Dossier introuvable.' }, 404)
      const courriel = courrielDuDossier(row)
      const fiche = await fichePersonne({ courriel, clientId: row.client_id })
      const autres = await dossiersPersonne({ courriel, clientId: fiche.clientId ?? row.client_id }, 100)
      const action = actionPrincipale(row)
      return json({
        dossier: {
          ...dossierPourEcran(row), resume: resumeDossier(row, null, now), action, refus: refusDecision(row, now),
          aFilGmail: Object.values(idsGmail(row)).some(Boolean),
        },
        fiche,
        ligneDuTemps: autres.map(r => resumeDossier(r, null, now)),
      })
    }

    // Le fil Gmail est chargé à part : s'il échoue, le dossier s'affiche quand même
    if (op === 'fil') {
      const row = await lireLigne(String(body.id ?? ''))
      if (!row) return json({ error: 'Dossier introuvable.' }, 404)
      try {
        return json(await filDuDossier(idsGmail(row)))
      } catch (e) {
        if (!(e instanceof GmailIndisponible)) console.error('leo-adjoint fil', e)
        return json({ indisponible: true, raison: (e as Error).message })
      }
    }

    // Historique de la fiche Personne : une source par appel, pour qu'une panne n'en
    // bloque pas une autre. Réponse { elements } ou { indisponible, raison }.
    if (op === 'historique') {
      const source = String(body.source ?? '')
      const courriel = normaliserCourriel(body.email)
      const telephone = String(body.telephone ?? '').trim() || null
      const clientId = body.client_id ? String(body.client_id) : null
      const indispo = (raison: string) => json({ indisponible: true, raison })

      if (source === 'gmail') {
        if (!courriel) return json({ elements: [] })
        try {
          return json({ elements: elementsGmail(await filsDeLaPersonne(courriel)) })
        } catch (e) {
          if (!(e instanceof GmailIndisponible)) console.error('leo-adjoint historique gmail', e)
          return indispo((e as Error).message)
        }
      }

      if (source === 'ghl') {
        if (!Deno.env.get('GHL_API_KEY')) return indispo('clé GHL absente')
        const loc = await locationId(admin)
        if (!loc) return indispo('location GHL inconnue')
        let contact: string | null = courriel ? await contactIdByEmail(admin, loc, courriel) : null
        if (!contact && telephone) {
          const r = await ghl(`/contacts/search/duplicate?locationId=${loc}&number=${encodeURIComponent(telephone)}`)
          contact = r?.contact?.id ?? null
        }
        if (!contact) return json({ elements: [], note: 'Aucun contact GHL avec ce courriel ou ce téléphone.' })
        const conv = await ghl(`/conversations/search?locationId=${loc}&contactId=${contact}&limit=10`)
        if (!conv) return indispo('GHL ne répond pas')
        const listes = await Promise.all((conv.conversations ?? []).slice(0, 10).map(async (c: J) => {
          const r = await ghl(`/conversations/${c.id}/messages?limit=100`)
          return (r?.messages?.messages ?? r?.messages ?? []).map((m: J) => ({ ...m, conversationId: m.conversationId ?? c.id }))
        }))
        return json({ elements: elementsGhl(listes.flat()) })
      }

      if (source === 'app') {
        if (!clientId) return json({ elements: [], note: 'Pas de compte dans l’app NEO.' })
        const { data, error } = await db.from('client_chats').select('created_at,from_side,topic,message')
          .eq('client_id', clientId).order('created_at', { ascending: false }).limit(3000)
        if (error) return indispo(error.message)
        return json({ elements: elementsApp(data ?? []) })
      }

      return json({ error: `Source inconnue : ${source}` }, 400)
    }

    // Un fil Gmail par son id (clic dans l'historique de la fiche Personne)
    if (op === 'filGmail') {
      const threadId = String(body.threadId ?? '')
      if (!/^[0-9a-f]{6,24}$/i.test(threadId)) return json({ error: 'Fil invalide.' }, 400)
      try {
        return json(await filDuDossier({ threadId, messageId: null }))
      } catch (e) {
        return json({ indisponible: true, raison: (e as Error).message })
      }
    }

    // Courriel « Pas encore traité par Léo » : crée sa ligne dans leo_service_interactions
    // (même chemin ensuite : Make pour répondre, classement Gmail pour fermer). Idempotent :
    // si une ligne existe déjà pour ce gmail_message_id, on la renvoie. Léo doit faire de
    // même avant de créer la sienne (champ gmail_message_id, payload.hub_origine = 'hub').
    if (op === 'creerDepuisCourriel') {
      const messageId = String(body.gmail_message_id ?? '')
      if (!/^[0-9a-f]{6,24}$/i.test(messageId)) throw new Refus('Courriel invalide.', 400)
      const { data: deja } = await db.from(TABLE).select('id').eq('gmail_message_id', messageId).order('created_at', { ascending: true }).limit(1)
      const lier = (id: string) => admin.from('inbox_messages')
        .update({ leo_interaction_id: id, etat: 'traite_dans_hub', maj_le: new Date().toISOString() }).eq('gmail_message_id', messageId)
      if (deja?.[0]) { await lier(deja[0].id); return json({ id: deja[0].id, existait: true }) }
      let m: J
      try {
        m = messageDuFil(await gmailApi(`/messages/${messageId}?format=full`))
      } catch (e) {
        throw new Refus(`Courriel introuvable dans Gmail (${(e as Error).message}).`, 502)
      }
      const courriel = normaliserCourriel(m.de?.courriel)
      if (!courriel || estInterne(courriel)) throw new Refus('Courriel interne ou sans expéditeur : rien à créer.', 409)
      const fiche = await fichePersonne({ courriel })
      const quand = new Date().toISOString()
      const corps = htmlVersTexte(m.html).trim()
      const { data: cree, error } = await db.from(TABLE).insert({
        channel: 'courriel',
        category: fiche.clientId && fiche.statut === 'client_actif' ? 'Client actif/Général' : 'autre',
        decision: 'pending',
        suggested_action: 'repondre',
        contact_email: courriel,
        client_id: fiche.clientId,
        gmail_message_id: messageId,
        gmail_thread_id: (await gmailApi(`/messages/${messageId}?format=minimal`).catch(() => ({})))?.threadId ?? null,
        incoming_message: `Courriel reçu, pas encore lu par Léo : ${corps.slice(0, 1500) || m.extrait || '(vide)'}`,
        payload: {
          to: [courriel], subject: sujetReponse(m.sujet), gmail_subject: m.sujet, gmail_message_id: messageId,
          client_courriel: courriel, client_nom: m.de?.nom ?? null,
          hub_origine: 'hub', hub_cree_par: moi.courriel, hub_cree_le: quand,
        },
      }).select('id').single()
      if (error) throw error
      await lier(cree.id)
      return json({ id: cree.id, existait: false })
    }

    if (op === 'personne') {
      const courriel = normaliserCourriel(body.email)
      const clientId = body.client_id ? String(body.client_id) : null
      const fiche = await fichePersonne({ courriel, clientId })
      const rows = await dossiersPersonne({ courriel: fiche.courriel ?? courriel, clientId: fiche.clientId ?? clientId })
      return json({ fiche, dossiers: rows.map(r => ({ ...dossierPourEcran(r), resume: resumeDossier(r, null, now) })) })
    }

    if (op === 'recherche') {
      const q = analyserRecherche(body.q)
      if (q.type === 'vide') return json({ personnes: [], commandes: [] })
      const v = q.valeur
      let reqClients: J = null
      let reqDossiers: J = db.from(TABLE).select(COLONNES).order('created_at', { ascending: false }).limit(150)
      if (q.type === 'courriel') {
        reqClients = db.from('clients').select('*').ilike('email', `%${v}%`)
        reqDossiers = reqDossiers.or(`contact_email.ilike.*${v}*,payload->>client_courriel.ilike.*${v}*`)
      } else if (q.type === 'commande') {
        reqDossiers = reqDossiers.eq('channel', 'commande').or(`payload->>commande.eq.${v},payload->>numero_commande.eq.${v}`)
      } else if (q.type === 'telephone') {
        const motif = motifTelephone(v)
        reqClients = db.from('clients').select('*').ilike('phone', motif)
        reqDossiers = reqDossiers.or(`contact_phone.ilike.${motif.replace(/%/g, '*')},payload->>client_tel.ilike.${motif.replace(/%/g, '*')}`)
      } else {
        const mots: string[] = q.mots
        reqClients = mots.length > 1
          ? db.from('clients').select('*').ilike('first_name', `%${mots[0]}%`).ilike('last_name', `%${mots.slice(1).join(' ')}%`)
          : db.from('clients').select('*').or(`first_name.ilike.*${v}*,last_name.ilike.*${v}*,email.ilike.*${v}*`)
        reqDossiers = reqDossiers.or(`payload->>client_nom.ilike.*${v}*,payload->>client_nom_reel.ilike.*${v}*,contact_email.ilike.*${v}*`)
      }
      const [rc, rd] = await Promise.all([reqClients ? reqClients.limit(30) : Promise.resolve({ data: [] }), reqDossiers])
      if (rd.error) throw rd.error
      const clients = (rc.data ?? []).filter((c: J) => !c.is_deleted)
      const dossiers = rd.data ?? []

      // Regroupe par personne : courriel, sinon fiche client
      const personnes = new Map<string, J>()
      const cle = (courriel: string | null, id: string | null) => courriel ?? (id ? `client:${id}` : null)
      for (const c of clients) {
        const k = cle(normaliserCourriel(c.email), c.id)
        if (!k) continue
        personnes.set(k, {
          cle: k, courriel: normaliserCourriel(c.email), clientId: c.id, telephone: c.phone ?? null,
          nom: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email,
          statut: statutPersonne(c, aujourdhui), nbDossiers: 0, dernier: null,
        })
      }
      for (const r of dossiers) {
        const k = cle(courrielDuDossier(r), r.client_id)
        if (!k) continue
        const p = personnes.get(k) ?? {
          cle: k, courriel: courrielDuDossier(r), clientId: r.client_id ?? null, telephone: r.contact_phone ?? r.payload?.client_tel ?? null,
          nom: nomDuDossier(r), statut: null, nbDossiers: 0, dernier: null,
        }
        p.nbDossiers += 1
        if (!p.dernier || r.created_at > p.dernier) p.dernier = r.created_at
        personnes.set(k, p)
      }
      // Statut des personnes trouvées seulement par leurs dossiers
      const sansStatut = [...personnes.values()].filter(p => p.statut == null && p.courriel)
      const fiches = await clientsParCourriel(sansStatut.map(p => p.courriel))
      for (const p of sansStatut) {
        const c = fiches.get(p.courriel)
        p.statut = statutPersonne(c ?? null, aujourdhui)
        if (c) { p.clientId = c.id; p.nom = [c.first_name, c.last_name].filter(Boolean).join(' ') || p.nom }
      }
      const liste = [...personnes.values()]
        .map(p => ({ ...p, statutLabel: STATUTS_PERSONNE[p.statut ?? 'prospect'].label }))
        .sort((a, b) => String(b.dernier ?? '').localeCompare(String(a.dernier ?? ''))).slice(0, 30)
      const commandes = dossiers.filter((r: J) => r.channel === 'commande').slice(0, 20).map((r: J) => resumeDossier(r, null, now))
      return json({ personnes: liste, commandes })
    }

    if (op === 'commandes') {
      const { q = '', statutRecu = 'tous', curseur = 0 } = body
      const debut = Math.max(0, Number(curseur) || 0)
      let req: J = db.from(TABLE).select(COLONNES, { count: 'exact' }).eq('channel', 'commande')
      req = appliquer(req, filtresCommandes(statutRecu))
      const a = analyserRecherche(q)
      if (a.type === 'commande') req = req.or(`payload->>commande.eq.${a.valeur},payload->>numero_commande.eq.${a.valeur}`)
      else if (a.type === 'courriel') req = req.or(`contact_email.ilike.*${a.valeur}*,payload->>client_courriel.ilike.*${a.valeur}*`)
      else if (a.type === 'telephone') req = req.ilike('payload->>client_tel', motifTelephone(a.valeur))
      else if (a.type === 'nom') {
        const mots: string[] = a.mots
        req = mots.length > 1
          ? req.ilike('payload->>client_prenom', `%${mots[0]}%`).ilike('payload->>client_famille', `%${mots.slice(1).join(' ')}%`)
          : req.or(`payload->>client_nom.ilike.*${a.valeur}*,payload->>client_courriel.ilike.*${a.valeur}*`)
      }
      const { data, error, count } = await req.order('created_at', { ascending: false }).range(debut, debut + PAGE - 1)
      if (error) throw error
      const rows = data ?? []
      return json({
        commandes: rows.map((r: J) => ({ ...resumeDossier(r, null, now), dateCommande: r.payload?.date_commande ?? null })),
        total: count ?? rows.length,
        suivant: rows.length === PAGE ? debut + PAGE : null,
      })
    }

    if (op === 'decider') {
      const id = String(body.id ?? '')
      const action = String(body.action ?? '')
      const row = await lireLigne(id)
      const refus = refusDecision(row, now)
      if (refus) throw new Refus(refus, 409, { dossier: row ? resumeDossier(row, null, now) : null })
      const quand = new Date(now).toISOString()
      const signature = { hub_decided_by: moi.courriel, hub_decided_at: quand }

      if (action === 'rejeter' || action === 'deja_traite') {
        const raison = String(body.raison ?? '').trim() || null
        const decision = action === 'rejeter' ? 'rejected' : 'traite_manuellement'
        const ajout = action === 'rejeter' ? { hub_rejet: { raison, par: moi.courriel, le: quand } } : { hub_traite_main: { note: raison, par: moi.courriel, le: quand } }
        const ligne = await ecrireSiEnAttente(id, { decision, decided_at: quand, payload: { ...(row.payload ?? {}), ...signature, ...ajout } })
        // L'un après l'autre : les deux complètent le payload
        const gmail = await classerDansGmail(row)
        await majSlack(row, action === 'rejeter' ? 'Rejeté' : 'Déjà traité à la main', quand)
        return json({ ok: true, id: ligne.id, decision: ligne.decision, message: action === 'rejeter' ? 'Dossier rejeté' : 'Marqué comme déjà traité', gmail })
      }

      if (action !== 'executer' && action !== 'repondre') throw new Refus('Action inconnue.', 400)
      const webhook = Deno.env.get('LEO_ACTIONS_WEBHOOK_URL')
      if (!webhook) throw new Refus('Secret LEO_ACTIONS_WEBHOOK_URL manquant.', 500)

      // repondre : texte écrit par Cloé (ou rédigé par Léo puis relu), envoyé par la route courriel de Make
      const texte = String((action === 'repondre' ? body.texte : body.texteModifie) ?? '').trim()
      let actionId: string
      if (action === 'repondre') {
        if (!texte) throw new Refus('Écris la réponse avant de l’envoyer.', 400)
        actionId = ACTIONS_MAKE.envoyer_reponse_courriel
      } else {
        const a = actionPrincipale(row)
        if (!a) throw new Refus(blocageCommande(row) ? `Commande bloquée : ${blocageCommande(row)}` : 'Aucune action automatique pour ce dossier.', 400)
        actionId = a.actionId
      }
      if (actionId === ACTIONS_MAKE.creer_recu_commande) {
        // Make prend la ligne la plus récente qui porte ce numéro : ce doit être celle-ci
        const { data: memes } = await db.from(TABLE).select('id').eq('channel', 'commande')
          .eq('payload->>commande', numeroCommande(row)).order('created_at', { ascending: false }).limit(1)
        if (memes?.[0]?.id && memes[0].id !== id) throw new Refus(`Une ligne plus récente porte aussi la commande #${numeroCommande(row)}. Traite celle-là, ou marque celle-ci comme déjà traitée.`)
      }

      const p = { ...(row.payload ?? {}) }
      const patch: J = {}
      const modifie = action === 'repondre' || (!!texte && actionId === ACTIONS_MAKE.envoyer_reponse_courriel)
      if (action === 'repondre') {
        const adresse = normaliserCourriel(row.contact_email) || normaliserCourriel(p.client_courriel)
        if (adresse) p.to = [adresse]
        p.subject = sujetReponse(p.gmail_subject || sujetDuDossier(row))
        if (p.html) p.hub_html_leo = p.html
        p.html = texteVersHtml(texte)
        patch.final_reply = texte
      } else if (modifie) {
        p.hub_html_leo = p.html
        p.html = remplacerCorpsHtml(p.html, texte)
        patch.final_reply = texte
      }
      const labelCategorie = actionId === ACTIONS_MAKE.envoyer_reponse_courriel && !estLibelleGmail(p.label_final)
        ? await libelleDeCategorie(row.category) : null
      Object.assign(p, complementsMake({ ...row, payload: p }, actionId, { labelCategorie }))
      const manques = manquesMake({ ...row, payload: p }, actionId)
      if (manques.length) throw new Refus(`Make ne pourrait pas faire l’action : ${manques.join(', ')} manquant.`, 400)

      const jeton = crypto.randomUUID()
      p.hub_execution = { action_id: actionId, demande_le: quand, par: moi.courriel, jeton, modifie }
      await ecrireSiEnAttente(id, { ...patch, payload: { ...p, ...signature } })

      const responseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/leo-adjoint-ack?id=${id}&jeton=${jeton}`
      let erreurMake: string | null = null
      try {
        const r = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: corpsFormulaireMake({ actionId, valeur: valeurMake(row, actionId), courriel: moi.courriel, responseUrl }),
        })
        if (!r.ok) erreurMake = `Make a répondu ${r.status}`
      } catch (e) {
        erreurMake = (e as Error).message
      }
      if (erreurMake) {
        // Rien n'est parti : on libère le dossier
        const actuelle = await lireLigne(id)
        const { hub_execution: _x, ...reste } = actuelle?.payload ?? {}
        await db.from(TABLE).update({ payload: { ...reste, hub_make_erreur: { erreur: erreurMake, le: quand } } }).eq('id', id)
        throw new Refus(`Make n’a pas reçu l’action (${erreurMake}). Rien n’a été envoyé, tu peux réessayer.`, 502)
      }
      await majSlack(row, actionId === ACTIONS_MAKE.creer_recu_commande ? 'Reçu de vente demandé' : modifie ? 'Envoyé (modifié)' : 'Envoyé', quand)
      return json({ ok: true, message: 'Action transmise à Make', enAttenteDeMake: true })
    }

    if (op === 'reclasser') {
      const row = await lireLigne(String(body.id ?? ''))
      if (!row) throw new Refus('Dossier introuvable.', 404)
      if (!classementAReessayer(row)) throw new Refus('Rien à reclasser : ce dossier est déjà archivé dans Gmail, ou n’a pas été fermé dans le Hub.', 409)
      const gmail = await classerDansGmail(row)
      if (gmail?.erreur) throw new Refus(`Toujours pas archivé dans Gmail (${gmail.erreur}).`, 502)
      return json({ ok: true, gmail })
    }

    if (op === 'rediger') {
      const id = String(body.id ?? '')
      const consigne = String(body.consigne ?? '').trim()
      if (!consigne) throw new Refus('Écris une consigne pour Léo.', 400)
      const cle = Deno.env.get('ANTHROPIC_API_KEY')
      if (!cle) throw new Refus('Secret ANTHROPIC_API_KEY manquant : Léo ne peut pas rédiger.', 500)
      const row = await lireLigne(id)
      if (!row) throw new Refus('Dossier introuvable.', 404)
      const courriel = courrielDuDossier(row)
      const fiche = await fichePersonne({ courriel, clientId: row.client_id })
      const autres = (await dossiersPersonne({ courriel, clientId: fiche.clientId }, 6)).filter(r => r.id !== id).slice(0, 5)
      const prenom = fiche.prenom || String(row.payload?.client_prenom ?? nomDuDossier(row)).split(' ')[0]
      const requete = requeteAnthropic({
        consigne,
        messageRecu: row.incoming_message,
        sujet: sujetDuDossier(row),
        fiche: { prenom, nom: fiche.nom, statut: fiche.statutLabel, naturopathe: fiche.naturopathe, programme: fiche.programme },
        echanges: autres.map(r => ({
          canal: CANAUX[r.channel]?.label ?? r.channel, quand: formatDate(r.created_at), sujet: sujetDuDossier(r),
          extrait: String(r.final_reply || htmlVersTexte(r.payload?.html) || r.incoming_message || '').replace(/\s+/g, ' ').slice(0, 200),
        })),
      })
      let texte = ''
      try {
        const ctrl = new AbortController()
        const minuteur = setTimeout(() => ctrl.abort(), 45000)
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(requete),
          signal: ctrl.signal,
        })
        clearTimeout(minuteur)
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error?.message ?? `API ${r.status}`)
        texte = nettoyerBrouillon(texteReponse(j))
        if (!texte) throw new Error('réponse vide')
      } catch (e) {
        throw new Refus(`Léo n’a pas pu rédiger (${(e as Error).message}). Écris la réponse toi-même ou réessaie.`, 502)
      }
      await completerPayload(id, {
        hub_redaction: ajouterJournalRedaction(row.payload?.hub_redaction, { consigne, texte, le: new Date().toISOString(), par: moi.courriel }),
      }).catch(() => {})
      return json({ texte, avertissements: avertissementsBrouillon(texte, consigne) })
    }

    return json({ error: `Opération inconnue : ${op}` }, 400)
  } catch (e) {
    if (e instanceof Refus) return json({ error: e.message, ...e.extra }, e.status)
    console.error('leo-adjoint', e)
    return json({ error: (e as J)?.message ?? 'Erreur inattendue' }, 500)
  }
})

