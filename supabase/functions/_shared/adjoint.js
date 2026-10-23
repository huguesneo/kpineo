// Adjoint (page /adjoint du hub) : règles pures sur les dossiers de Léo
// (leo_service_interactions du projet Clinique). Partagées par l'edge function
// leo-adjoint (Deno) et la page (React). Aucune dépendance : testées avec vitest.

// Accès : Hugues et Cloé. Cloé a le rôle service_client (pas admin) et Pierre est
// admin : une liste explicite colle à « Cloé et moi » mieux que le rôle.
export const ACCES_ADJOINT = ['hugues@neoperformance.ca', 'info@neoperformance.ca']
export const peutUtiliserAdjoint = (email) => ACCES_ADJOINT.includes(String(email ?? '').trim().toLowerCase())

export const NON_RENSEIGNE = 'non renseigné'

// ── Canaux et sections ──────────────────────────────────────────────────────
export const CANAUX = {
  courriel: { label: 'Courriel', pluriel: 'Courriels' },
  commande: { label: 'Commande', pluriel: 'Commandes' },
  agenda: { label: 'Agenda', pluriel: 'Agenda' },
  sms: { label: 'SMS', pluriel: 'SMS' },
  reseaux_sociaux: { label: 'Réseaux sociaux', pluriel: 'Réseaux sociaux' },
}

export const SECTIONS = [
  { cle: 'tout', label: 'Tout', canaux: null },
  { cle: 'courriel', label: 'Courriels', canaux: ['courriel'] },
  { cle: 'commande', label: 'Commandes', canaux: ['commande'] },
  { cle: 'agenda', label: 'Agenda', canaux: ['agenda'] },
  { cle: 'reseaux_sociaux', label: 'Réseaux sociaux', canaux: ['reseaux_sociaux'], bientot: true },
  { cle: 'autonome', label: 'Fait seul par Léo', canaux: null, autonome: true },
]
export const sousSectionsDe = (section) => (section === 'autonome'
  ? [{ cle: 'aujourdhui', label: "Aujourd'hui" }, { cle: 'historique', label: 'Historique' }]
  : [{ cle: 'a_traiter', label: 'À traiter' }, { cle: 'traite', label: 'Déjà traité' }])

const ACTIONS_AUTONOMES = ['classer', 'archiver']
export const estAutonome = (row) => ACTIONS_AUTONOMES.includes(row?.suggested_action) || row?.decision === 'auto_envoye'

// Filtres PostgREST d'une liste, sous forme d'opérations [méthode, ...arguments]
// appliquées telles quelles par l'edge function (query[méthode](...arguments)).
// « Déjà traité » exclut ce que Léo a fait seul : il a sa propre section, et ces
// lignes (80 % du journal) noieraient le reste. Le filtre de décision « fait_seul »
// les ramène au besoin.
export function filtresListe({ section = 'tout', sousSection = 'a_traiter', filtres = {}, debutJour = null, now = new Date() } = {}) {
  const ops = []
  const def = SECTIONS.find(s => s.cle === section) ?? SECTIONS[0]
  const canal = filtres.canal && CANAUX[filtres.canal] ? filtres.canal : null
  if (def.canaux) ops.push(['in', 'channel', def.canaux])
  else if (canal) ops.push(['eq', 'channel', canal])

  if (def.autonome) {
    ops.push(['or', `suggested_action.in.(${ACTIONS_AUTONOMES.join(',')}),decision.eq.auto_envoye`])
    if (sousSection === 'aujourdhui' && debutJour) ops.push(['gte', 'created_at', debutJour])
  } else if (sousSection === 'a_traiter') {
    ops.push(['eq', 'decision', 'pending'])
  } else {
    ops.push(['neq', 'decision', 'pending'])
    const dec = FILTRES_DECISION[filtres.decision]
    if (dec) ops.push(...dec)
    else ops.push(['not', 'suggested_action', 'in', `(${ACTIONS_AUTONOMES.join(',')})`], ['neq', 'decision', 'auto_envoye'])
  }

  const jours = PERIODES[filtres.periode]
  if (jours && sousSection !== 'aujourdhui') ops.push(['gte', 'created_at', new Date(now.getTime() - jours * 86400000).toISOString()])
  return ops
}

export const PERIODES = { '7j': 7, '30j': 30, '90j': 90 }

// ── Décisions affichées ─────────────────────────────────────────────────────
export const DECISIONS = {
  en_attente: { label: 'À traiter', ton: 'neutre' },
  envoye: { label: 'Envoyé', ton: 'succes' },
  envoye_modifie: { label: 'Envoyé modifié', ton: 'succes' },
  recu_cree: { label: 'Reçu créé', ton: 'succes' },
  rejete: { label: 'Rejeté', ton: 'danger' },
  traite_main: { label: 'Traité à la main', ton: 'info' },
  fait_seul: { label: 'Fait seul', ton: 'neutre' },
}

// Filtre « décision » de la vue Déjà traité (opérations PostgREST)
const FILTRES_DECISION = {
  envoye: [['eq', 'decision', 'approved_as_is'], ['not', 'suggested_action', 'in', '(classer,archiver)'], ['is', 'recu_quickbooks', null]],
  envoye_modifie: [['in', 'decision', ['approved_modified', 'modified']]],
  recu_cree: [['eq', 'channel', 'commande'], ['not', 'recu_quickbooks', 'is', null]],
  rejete: [['eq', 'decision', 'rejected']],
  traite_main: [['eq', 'decision', 'traite_manuellement']],
  fait_seul: [['or', 'suggested_action.in.(classer,archiver),decision.eq.auto_envoye']],
}

export function decisionAffichee(row) {
  const d = row?.decision
  if (d === 'pending' || !d) return 'en_attente'
  if (d === 'traite_manuellement') return 'traite_main'
  if (d === 'rejected') return 'rejete'
  if (row.channel === 'commande' && recuQuickbooks(row)) return 'recu_cree'
  if (estAutonome(row)) return 'fait_seul'
  if (d === 'approved_modified' || d === 'modified') return 'envoye_modifie'
  return 'envoye'
}

// Qui a décidé et quand (decided_by est un id de l'autre projet : inutilisable)
export function decideur(row) {
  const p = row?.payload ?? {}
  return {
    par: p.hub_decided_by || p.ferme_par || p.slack_user || (estAutonome(row) ? 'Léo' : null),
    le: p.hub_decided_at || row?.decided_at || row?.executed_at || null,
    viaHub: !!p.hub_decided_by,
  }
}

// ── Commandes ───────────────────────────────────────────────────────────────
export const numeroCommande = (row) => {
  const n = row?.payload?.commande ?? row?.payload?.numero_commande
  return n == null || n === '' ? null : String(n).replace(/^#/, '')
}
export const recuQuickbooks = (row) => row?.recu_quickbooks || row?.payload?.recu_quickbooks || row?.payload?.recu_id || null

const ETAPES_LISIBLES = {
  bloque_variante_produit: 'Variante de produit à confirmer',
  bloque_carte_cadeau_et_variante: 'Carte-cadeau et variante de produit à confirmer',
  attente_variante_digestzymes: 'Variante de Digestzymes à confirmer',
  attente_decision_cloe_carte_cadeau: 'Carte-cadeau : décision de Cloé attendue',
  attente_validation_cloe: 'Validation de Cloé attendue',
  attente_decision_hugues: 'Décision de Hugues attendue',
  attente_validation_hugues: 'Validation de Hugues attendue',
}
export const etapeLisible = (etape) => ETAPES_LISIBLES[etape] ?? (etape ? String(etape).replace(/_/g, ' ') : null)

// « attente_clic_bouton » : prêt, le bouton Slack n'a jamais été posé ou cliqué
export const ETAPE_BOUTON_JAMAIS_POSE = 'attente_clic_bouton'
export const boutonJamaisPose = (row) => row?.decision === 'pending' && row?.etape === ETAPE_BOUTON_JAMAIS_POSE

// Raison du blocage d'une commande, ou null : bloque_* et attente_* (sauf
// attente_clic_bouton), ou payload.blocage
export function blocageCommande(row) {
  if (row?.channel !== 'commande') return null
  const p = row.payload ?? {}
  const etape = row.etape ?? ''
  const parEtape = (etape.startsWith('bloque_') || etape.startsWith('attente_')) && etape !== ETAPE_BOUTON_JAMAIS_POSE
  if (!parEtape && !p.blocage) return null
  const texte = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return texte(p.raison_blocage) || texte(p.blocage) || texte(p.produit_bloque && `Produit bloqué : ${p.produit_bloque}`)
    || etapeLisible(etape) || 'Commande bloquée'
}

export const STATUTS_RECU = {
  cree: { label: 'Reçu créé', ton: 'succes' },
  non_cree: { label: 'Reçu non créé', ton: 'alerte' },
  note_credit: { label: 'Note de crédit', ton: 'info' },
  bloque: { label: 'Bloqué', ton: 'danger' },
  main: { label: 'Traité à la main', ton: 'info' },
}
export function statutRecu(row) {
  if (recuQuickbooks(row)) return 'cree'
  if (row?.payload?.note_credit_id) return 'note_credit'
  if (row?.decision === 'traite_manuellement') return 'main'
  if (blocageCommande(row)) return 'bloque'
  return 'non_cree'
}
// Filtre « statut du reçu » de la liste des commandes (opérations PostgREST)
export function filtresCommandes(statutRecuFiltre) {
  if (statutRecuFiltre === 'cree') return [['or', 'recu_quickbooks.not.is.null,payload->>recu_quickbooks.not.is.null']]
  if (statutRecuFiltre === 'non_cree') {
    return [['is', 'recu_quickbooks', null], ['is', 'payload->>recu_quickbooks', null], ['is', 'payload->>note_credit_id', null],
      ['not', 'decision', 'in', '(traite_manuellement,rejected)']]
  }
  return []
}

// ── Action principale (bouton) ──────────────────────────────────────────────
export const ACTIONS_MAKE = {
  envoyer_reponse_courriel: 'envoyer_reponse_courriel',
  creer_recu_commande: 'creer_recu_commande',
  valider_creneaux: 'valider_creneaux',
}

const aDuHtml = (row) => typeof row?.payload?.html === 'string' && row.payload.html.trim() !== ''

// { actionId, libelle, badge, toast } ou null (seulement « Déjà traité à la main » et « Rejeter »)
export function actionPrincipale(row) {
  if (!row || row.decision !== 'pending') return null
  const p = row.payload ?? {}
  if (row.channel === 'commande') {
    if (row.suggested_action !== 'commande' || blocageCommande(row) || !numeroCommande(row)) return null
    return { actionId: ACTIONS_MAKE.creer_recu_commande, libelle: 'Créer le reçu de vente', badge: 'Reçu QuickBooks', toast: 'Reçu de vente demandé à QuickBooks' }
  }
  if (row.channel === 'agenda') {
    if (aDuHtml(row)) {
      const creneaux = Array.isArray(p.options_proposees) && p.options_proposees.length > 0
      return { actionId: ACTIONS_MAKE.envoyer_reponse_courriel, libelle: creneaux ? 'Proposer ces créneaux' : 'Envoyer la réponse', badge: creneaux ? 'Créneaux GHL' : 'Réponse', toast: 'Réponse envoyée' }
    }
    // Sans courriel prêt, Make poste le texte dans Slack (flux agenda d'aujourd'hui)
    if (p.slack_texte) return { actionId: ACTIONS_MAKE.valider_creneaux, libelle: 'Proposer ces créneaux', badge: 'Créneaux GHL', toast: 'Créneaux validés' }
    return null
  }
  if (!aDuHtml(row)) return null
  if (row.suggested_action === 'escalader_hugues' || row.suggested_action === 'transferer_cloe') {
    return { actionId: ACTIONS_MAKE.envoyer_reponse_courriel, libelle: "Envoyer l'accusé de réception", badge: 'Accusé de réception', toast: 'Accusé de réception envoyé' }
  }
  return { actionId: ACTIONS_MAKE.envoyer_reponse_courriel, libelle: 'Envoyer la réponse', badge: 'Réponse', toast: 'Réponse envoyée' }
}

// Valeur lue par Make dans actions[1].value : le numéro de commande pour le reçu
// (Make cherche payload->>commande), l'id de la ligne sinon.
export const valeurMake = (row, actionId) => (actionId === ACTIONS_MAKE.creer_recu_commande ? numeroCommande(row) : row.id)

// Corps du POST vers le webhook Make (format interactivité Slack)
export function payloadMake({ actionId, valeur, courriel, responseUrl }) {
  return {
    type: 'block_actions',
    source: 'neo-hub',
    user: { username: courriel },
    actions: [{ action_id: actionId, value: String(valeur) }],
    response_url: responseUrl,
  }
}
export const corpsFormulaireMake = (args) => new URLSearchParams({ payload: JSON.stringify(payloadMake(args)) }).toString()

// Ce que Make lit dans payload et qui manque souvent : gmail_message_id (dans la
// colonne pour 54 dossiers sur 61), label_final (id de libellé Gmail « Label_… »,
// sinon l'étape Gmail de Make plante après l'envoi), to (adresse).
// labelCategorie : le libellé le plus utilisé pour cette catégorie (lu par l'edge function).
export const estLibelleGmail = (v) => typeof v === 'string' && /^Label_\d+$/.test(v)
export function complementsMake(row, actionId, { labelCategorie = null } = {}) {
  const p = row.payload ?? {}
  const patch = {}
  if (!p.gmail_message_id && row.gmail_message_id) patch.gmail_message_id = row.gmail_message_id
  if (actionId === ACTIONS_MAKE.envoyer_reponse_courriel) {
    if (!estLibelleGmail(p.label_final) && labelCategorie) patch.label_final = labelCategorie
    const to = destinataires(p.to)
    if (to.length === 0) {
      const adresse = courrielDuDossier(row)
      if (adresse) patch.to = [adresse]
    }
  }
  return patch
}
// Manques qui feraient échouer Make : on refuse avant d'appeler
export function manquesMake(row, actionId, patch = {}) {
  const p = { ...(row.payload ?? {}), ...patch }
  const manques = []
  if (actionId === ACTIONS_MAKE.envoyer_reponse_courriel) {
    if (destinataires(p.to).length === 0) manques.push('adresse du destinataire')
    if (!p.subject) manques.push('sujet')
    if (!p.html) manques.push('texte du courriel')
    if (!p.gmail_message_id) manques.push('id du courriel Gmail')
    if (!estLibelleGmail(p.label_final)) manques.push('libellé Gmail')
  }
  if (actionId === ACTIONS_MAKE.creer_recu_commande) {
    if (!numeroCommande(row)) manques.push('numéro de commande')
    if (!Array.isArray(p.Line) || p.Line.length === 0) manques.push('lignes de la commande')
  }
  return manques
}

// Refus d'une décision : la ligne n'est plus en attente, ou un envoi est déjà en cours
export const DELAI_EXECUTION_MS = 15 * 60 * 1000
export function refusDecision(row, now = Date.now()) {
  if (!row) return 'Dossier introuvable.'
  if (row.decision !== 'pending') {
    const d = DECISIONS[decisionAffichee(row)]?.label ?? row.decision
    const { par, le } = decideur(row)
    return `Ce dossier est déjà traité (${d}${par ? `, par ${par}` : ''}${le ? `, le ${formatDateHeure(le)}` : ''}).`
  }
  const ex = row.payload?.hub_execution
  if (ex?.demande_le && !ex.confirme_le && now - new Date(ex.demande_le).getTime() < DELAI_EXECUTION_MS) {
    return 'Un envoi est déjà en cours pour ce dossier. Attends la confirmation de Make.'
  }
  return null
}

// ── File « À traiter » ──────────────────────────────────────────────────────
const MOTS_ARGENT = /rembours|annul|factur|paiement|prélèvement|prelevement|crédit|credit|\$/i
export const estEscalade = (row) => row?.suggested_action === 'escalader_hugues' || !!row?.payload?.escalade_hugues
export const estPlainte = (row) => /plainte/i.test(row?.category ?? '') || /plainte/i.test(row?.payload?.motif ?? '')
export function estArgent(row) {
  const p = row?.payload ?? {}
  if (p.montant || p.montant_en_jeu || p.montant_reclame || p.refund_case) return true
  return /annulation|rembours/i.test(row?.category ?? '') || MOTS_ARGENT.test(`${p.subject ?? ''} ${p.motif ?? ''}`)
}
export const heuresAttente = (row, now = Date.now()) => Math.max(0, (now - new Date(row.created_at).getTime()) / 3600000)
export const enRetard = (row, now = Date.now()) => heuresAttente(row, now) > 24
// Périmé : en attente depuis plus de 7 jours, le brouillon de Léo est à relire
export const JOURS_PERIME = 7
export const estPerime = (row, now = Date.now()) => row?.decision === 'pending' && heuresAttente(row, now) > JOURS_PERIME * 24
export function delaiAttente(row, now = Date.now()) {
  const h = heuresAttente(row, now)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.floor(h)} h`
  return `${Math.floor(h / 24)} j`
}
// 0 : escalade, argent ou plainte ; 1 : plus de 24 h ; 2 : le reste. Puis le plus ancien.
export function rangUrgence(row, now = Date.now()) {
  if (estEscalade(row) || estArgent(row) || estPlainte(row)) return 0
  return enRetard(row, now) ? 1 : 2
}
export function trierFile(rows, now = Date.now()) {
  return [...(rows ?? [])].sort((a, b) => rangUrgence(a, now) - rangUrgence(b, now)
    || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}
export function etiquettesDossier(row, now = Date.now()) {
  const t = []
  if (estPerime(row, now)) t.push({ label: 'Périmé, à relire', ton: 'alerte' })
  if (estEscalade(row)) t.push({ label: 'Escaladé à Hugues', ton: 'danger' })
  if (estArgent(row)) t.push({ label: 'Argent', ton: 'danger' })
  if (estPlainte(row)) t.push({ label: 'Plainte', ton: 'danger' })
  if (boutonJamaisPose(row)) t.push({ label: 'Bouton jamais posé', ton: 'alerte' })
  const b = blocageCommande(row)
  if (b) t.push({ label: 'Bloqué', ton: 'danger' })
  return t
}

// ── Personne ────────────────────────────────────────────────────────────────
export function destinataires(to) {
  if (Array.isArray(to)) return to.filter(x => typeof x === 'string' && x.includes('@'))
  if (typeof to === 'string' && to.includes('@')) return to.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  return []
}
export const normaliserCourriel = (e) => (typeof e === 'string' && e.includes('@') ? e.trim().toLowerCase() : null)
export function courrielDuDossier(row) {
  const p = row?.payload ?? {}
  return normaliserCourriel(row?.contact_email) || normaliserCourriel(p.client_courriel) || normaliserCourriel(destinataires(p.to)[0])
}
export function nomDuDossier(row, client = null) {
  const p = row?.payload ?? {}
  const complet = (a, b) => [a, b].filter(Boolean).join(' ').trim()
  return complet(client?.first_name, client?.last_name) || p.client_nom_reel || p.client_nom
    || complet(p.client_prenom, p.client_famille) || courrielDuDossier(row) || row?.contact_phone || 'Inconnu'
}
export function sujetDuDossier(row) {
  const p = row?.payload ?? {}
  if (row?.channel === 'commande' && numeroCommande(row)) return `Commande #${numeroCommande(row)}`
  const s = p.subject || p.gmail_subject
  if (s) return String(s).replace(/^\s*(re|tr|fwd?)\s*:\s*/i, '')
  return row?.category || CANAUX[row?.channel]?.label || 'Dossier'
}
export const sujetReponse = (sujet) => {
  const s = String(sujet ?? '').trim()
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`
}

// Statut : Prospect (aucun client), Client actif (fin future ou vide, programme
// non terminé), Ancien client (sinon)
export const STATUTS_PERSONNE = {
  prospect: { label: 'Prospect' },
  client_actif: { label: 'Client actif' },
  ancien_client: { label: 'Ancien client' },
}
export function statutPersonne(client, aujourdhui) {
  if (!client) return 'prospect'
  const fin = client.end_date_manual || client.end_date
  if (!client.program_finished && (!fin || fin >= aujourdhui)) return 'client_actif'
  return 'ancien_client'
}
// « Semaine 4 sur 15 » quand les dates sont connues
export function semaineProgramme(client, aujourdhui) {
  const debut = client?.start_date
  const fin = client?.end_date_manual || client?.end_date
  if (!debut || !fin || aujourdhui < debut) return null
  const jour = (d) => new Date(`${d}T12:00:00Z`).getTime()
  const total = Math.max(1, Math.round((jour(fin) - jour(debut)) / (7 * 86400000)))
  const courante = Math.floor((jour(aujourdhui) - jour(debut)) / (7 * 86400000)) + 1
  return courante > total ? null : `Semaine ${courante} sur ${total}`
}

// Analyse de la recherche globale
export function analyserRecherche(q) {
  const brut = String(q ?? '').trim()
  // Retire ce qui casserait un filtre or() de PostgREST
  const propre = brut.replace(/[,()*%\\"]/g, ' ').replace(/\s+/g, ' ').trim()
  if (propre.length < 2) return { type: 'vide', valeur: '' }
  if (propre.includes('@')) return { type: 'courriel', valeur: propre.toLowerCase() }
  const chiffres = propre.replace(/[^\d]/g, '')
  if (/^#?\d{3,6}$/.test(propre)) return { type: 'commande', valeur: chiffres }
  if (chiffres.length >= 7 && /^[\d\s()+.-]+$/.test(propre)) return { type: 'telephone', valeur: chiffres.slice(-10) }
  return { type: 'nom', valeur: propre, mots: propre.split(' ') }
}
// « 450 486-4006 » → motif ilike qui tolère les séparateurs : %450%486%4006%
export const motifTelephone = (chiffres) => `%${String(chiffres).slice(-10).replace(/^(\d{3})(\d{3})(\d{4})$/, '$1%$2%$3')}%`

// ── Payload filtré pour l'écran ─────────────────────────────────────────────
const CHAMPS_COMMUNS = ['to', 'cc', 'subject', 'html', 'raison', 'note_leo', 'motif', 'note', 'montant', 'devise', 'escalade_hugues',
  'client_nom_reel', 'destinataire_interne', 'facture_payee', 'fournisseur', 'gmail_subject', 'client_courriel']
const CHAMPS_CANAL = {
  commande: ['commande', 'numero_commande', 'date_commande', 'client_nom', 'client_prenom', 'client_famille', 'client_courriel',
    'client_tel', 'Line', 'total_woocommerce', 'tps', 'tvq', 'total_taxes', 'rabais_montant', 'coupon', 'frais_livraison',
    'carte_cadeau', 'carte_cadeau_montant', 'paiement_type', 'recu_quickbooks', 'note_credit_id', 'blocage', 'raison_blocage',
    'produit_bloque', 'type', 'ferme_par', 'ferme_le'],
  agenda: ['ancien_creneau', 'nouveau_creneau', 'options_proposees', 'conseiller', 'lien_meet', 'statut', 'slack_texte'],
}
const CHAMPS_HUB = ['hub_decided_by', 'hub_decided_at', 'hub_rejet', 'hub_ack', 'hub_execution', 'hub_redaction', 'hub_slack_erreur', 'hub_make_erreur', 'hub_gmail']

export function payloadPourEcran(row) {
  const p = row?.payload ?? {}
  const garder = [...CHAMPS_COMMUNS, ...(CHAMPS_CANAL[row?.channel] ?? []), ...CHAMPS_HUB]
  const out = {}
  for (const k of garder) if (p[k] !== undefined && p[k] !== null) out[k] = p[k]
  if (out.hub_execution) out.hub_execution = { action_id: out.hub_execution.action_id, demande_le: out.hub_execution.demande_le, confirme_le: out.hub_execution.confirme_le ?? null }
  return out
}
const COLONNES_ECRAN = ['id', 'channel', 'client_id', 'contact_email', 'contact_phone', 'category', 'incoming_message', 'proposed_reply',
  'decision', 'final_reply', 'decided_at', 'created_at', 'suggested_action', 'executed_at', 'etape', 'recu_quickbooks', 'total_qbo']
export function dossierPourEcran(row) {
  const out = {}
  for (const k of COLONNES_ECRAN) out[k] = row?.[k] ?? null
  out.payload = payloadPourEcran(row)
  return out
}
// Version courte (listes, ligne du temps) : sans le message ni le html
export function resumeDossier(row, client = null, now = Date.now()) {
  const action = actionPrincipale(row)
  return {
    id: row.id,
    channel: row.channel,
    nom: nomDuDossier(row, client),
    courriel: courrielDuDossier(row),
    sujet: sujetDuDossier(row),
    category: row.category ?? null,
    created_at: row.created_at,
    decision: row.decision,
    decisionAffichee: decisionAffichee(row),
    decideur: decideur(row),
    etape: row.etape ?? null,
    attente: row.decision === 'pending' ? delaiAttente(row, now) : null,
    retard: row.decision === 'pending' && enRetard(row, now),
    badgeAction: action?.badge ?? (row.decision === 'pending' ? 'À traiter à la main' : null),
    etiquettes: row.decision === 'pending' ? etiquettesDossier(row, now) : [],
    perime: estPerime(row, now),
    numeroCommande: row.channel === 'commande' ? numeroCommande(row) : null,
    statutRecu: row.channel === 'commande' ? statutRecu(row) : null,
    recuQuickbooks: row.channel === 'commande' ? recuQuickbooks(row) : null,
    total: row.channel === 'commande' ? (row.payload?.total_woocommerce ?? row.total_qbo ?? null) : null,
    blocage: blocageCommande(row),
    apercu: String(row.incoming_message ?? '').replace(/\s+/g, ' ').slice(0, 140),
  }
}

// ── Texte ↔ html ────────────────────────────────────────────────────────────
const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Paragraphes séparés par une ligne vide → <p>, retour simple → <br>
export function texteVersHtml(texte) {
  return String(texte ?? '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)
    .map(par => par.trim()).filter(Boolean)
    .map(par => `<p>${echapper(par).replace(/\n/g, '<br>')}</p>`).join('')
}
export function htmlVersTexte(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<\/(div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim()
}

// Texte modifié par Cloé → html à envoyer. La signature de Léo (« <p>Cloé<br>NEO
// Performance<br>… lien », ou « Cloé » seul) est gardée en html si le texte se
// termine encore par elle : le lien et la mise en forme ne se perdent pas.
export function remplacerCorpsHtml(htmlOriginal, texte) {
  const html = String(htmlOriginal ?? '')
  const i = html.search(/<p>\s*Clo[ée]\s*(<br\s*\/?>|<\/p>)/i)
  if (i > 0) {
    const signatureHtml = html.slice(i)
    const signatureTexte = htmlVersTexte(signatureHtml)
    const t = String(texte ?? '').trimEnd()
    if (signatureTexte && t.endsWith(signatureTexte)) {
      return texteVersHtml(t.slice(0, t.length - signatureTexte.length)) + signatureHtml
    }
  }
  return texteVersHtml(texte)
}

// ── Slack ───────────────────────────────────────────────────────────────────
// Canal du message Slack : colonne, sinon les canaux où Léo poste pour ce canal
// (vérifié dans le journal le 23 oct. 2026)
const CANAUX_SLACK = { courriel: ['C0BC6FL929E', 'C0BB2QLFRQF'], commande: ['C0BBE3FLNHF'], agenda: ['C0BB5SA2ZCK', 'C0BC6FL929E'] }
export function messageSlack(row) {
  const ts = row?.slack_message_ts || row?.payload?.slack_ts || null
  if (!ts) return null
  const canaux = row.slack_channel_id ? [row.slack_channel_id] : (CANAUX_SLACK[row.channel] ?? [])
  return canaux.length ? { ts, canaux } : null
}
export function corpsSlackTraite({ par, quand, resultat, sujet }) {
  const texte = `Traité dans le Hub par ${par} le ${formatDateHeure(quand)} : ${resultat}`
  return {
    text: texte,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${sujet}*\n${texte}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Le bouton a été retiré : ce dossier se gère maintenant dans la page Adjoint du hub.' }] },
    ],
  }
}

// ── Dates ───────────────────────────────────────────────────────────────────
export const FUSEAU = 'America/Montreal'
export function jourMontreal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
// Minuit à Montréal, en ISO UTC
export function debutJourMontreal(d = new Date()) {
  const jour = jourMontreal(d)
  for (const h of [4, 5]) {
    const essai = new Date(`${jour}T${String(h).padStart(2, '0')}:00:00Z`)
    if (jourMontreal(essai) === jour && jourMontreal(new Date(essai.getTime() - 3600000)) !== jour) return essai.toISOString()
  }
  return new Date(`${jour}T05:00:00Z`).toISOString()
}
export function formatDateHeure(iso) {
  if (!iso) return NON_RENSEIGNE
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d)
}
export function formatDate(iso) {
  if (!iso) return NON_RENSEIGNE
  const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}
export function formatArgent(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return NON_RENSEIGNE
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n)
}
