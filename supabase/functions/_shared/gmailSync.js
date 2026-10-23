// Adjoint, temps réel : la boîte de réception de info@ copiée dans inbox_messages
// (neo-admin) par gmail-sync, puis reliée aux dossiers de Léo. Logique pure, partagée
// par gmail-sync, leo-adjoint et le front (file sans doublon).
import { entete, extraitTexte, lireAdresse, ADRESSE_INFO } from './gmailFil.js'

export const ETATS_INBOX = ['nouveau', 'traite_par_leo', 'traite_dans_hub']
export const BADGE_NON_TRAITE = 'Pas encore traité par Léo'
export const BADGE_NOUVELLE_REPONSE = 'Nouvelle réponse'
// Bruit déjà filtré par Léo (noms de libellés) et libellés système à ignorer
const LIBELLES_BRUIT = /^(blocked|promotions?|wordpress)$|\/(blocked|promotions?|wordpress)$/i
const SYSTEME_BRUIT = ['SPAM', 'TRASH', 'DRAFT', 'SENT', 'CATEGORY_PROMOTIONS']
export const DOMAINE_INTERNE = '@neoperformance.ca'
export const PREFIXE_INBOX = 'inbox:'

export const estInterne = (courriel) => String(courriel ?? '').toLowerCase().endsWith(DOMAINE_INTERNE)

// labelIds Gmail → noms (table id → nom lue une fois par gmail-sync)
export const nomsDesLibelles = (labelIds, table = {}) => (labelIds ?? []).map(id => table[id] ?? id)

// Avis WooCommerce « [Neo Performance]: Nouvelle commande #… » : envoyés par info@ à
// info@ (libellés SENT et INBOX), ce sont des commandes, pas des courriels internes.
export const PREFIXE_AVIS_COMMANDE = '[Neo Performance]: Nouvelle commande'
export const estAvisCommande = (sujet, de) =>
  String(de ?? '').toLowerCase() === ADRESSE_INFO && String(sujet ?? '').trim().startsWith(PREFIXE_AVIS_COMMANDE)
// Ligne d'inbox_messages déjà copiée (l'expéditeur y est le client)
export const estLigneCommande = (m) => String(m?.sujet ?? '').trim().startsWith(PREFIXE_AVIS_COMMANDE)

// Numéro (sujet), client, total et courriel (corps HTML de l'avis)
export function lireAvisCommande(sujet, html) {
  const t = extraitTexte(html ?? '', 100000)
  const numero = String(sujet ?? '').match(/#\s*(\d+)/)?.[1] ?? t.match(/n°\s*(\d+)/)?.[1] ?? null
  const client = t.match(/commande suivante de\s+(.+?)\s*:/)?.[1]?.trim() || null
  const total = t.match(/(?<![-\w])Total\s*:\s*([\d\s.,]+?)\s*\$/)?.[1]?.replace(/\s+/g, ' ').trim()
  const facturation = t.split(/Adresse de facturation/i)[1] ?? ''
  const courriel = facturation.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() ?? null
  return { numero, client, total: total ? `${total} $` : null, courriel }
}

// Courriel à ignorer : hors boîte de réception, interne (sauf avis de commande), ou bruit
export function doitIgnorer({ de, sujet = '', labelIds = [], tableLibelles = {} }) {
  if (!labelIds.includes('INBOX')) return true
  if (estAvisCommande(sujet, de)) return false
  if (estInterne(de)) return true
  if (labelIds.some(l => SYSTEME_BRUIT.includes(l))) return true
  return nomsDesLibelles(labelIds, tableLibelles).some(n => LIBELLES_BRUIT.test(String(n).trim()))
}

// Message Gmail (format metadata) → ligne inbox_messages, ou null s'il est à ignorer.
// html : corps de l'avis de commande (lu à part par gmail-sync), pour client et total.
export function ligneInbox(m, tableLibelles = {}, html = null) {
  const h = m?.payload?.headers ?? []
  const de = lireAdresse(entete(h, 'From'))
  const sujet = entete(h, 'Subject') || '(sans objet)'
  if (!m?.id || doitIgnorer({ de: de.courriel, sujet, labelIds: m.labelIds ?? [], tableLibelles })) return null
  const ligne = {
    gmail_message_id: m.id,
    gmail_thread_id: m.threadId,
    expediteur: de.courriel,
    expediteur_nom: de.nom,
    sujet,
    extrait: extraitTexte(m.snippet ?? '', 200),
    recu_le: new Date(Number(m.internalDate)).toISOString(),
    libelles: m.labelIds ?? [],
  }
  if (estAvisCommande(sujet, de.courriel)) {
    // Le client devient l'expéditeur : la ligne et la fiche montrent la bonne personne
    const c = lireAvisCommande(sujet, html)
    if (c.courriel) ligne.expediteur = c.courriel
    if (c.client) ligne.expediteur_nom = c.client
    ligne.extrait = [`Commande n°${c.numero ?? '?'}`, c.client, c.total ? `Total ${c.total}` : null].filter(Boolean).join(' · ')
  }
  return ligne
}

// Réponse de users.history.list → ids des messages arrivés dans INBOX, et libellés retirés
export function changementsHistorique(history) {
  const ajoutes = new Set()
  const libelles = new Map() // id → labelIds actuels connus
  for (const h of history ?? []) {
    for (const a of h.messagesAdded ?? []) if ((a.message?.labelIds ?? []).includes('INBOX')) ajoutes.add(a.message.id)
    for (const a of h.labelsAdded ?? []) {
      if ((a.labelIds ?? []).includes('INBOX')) ajoutes.add(a.message.id)
      libelles.set(a.message.id, a.message.labelIds ?? [])
    }
    for (const r of h.labelsRemoved ?? []) libelles.set(r.message.id, r.message.labelIds ?? [])
  }
  return { ajoutes: [...ajoutes], libelles }
}

// Dossier Léo relié : traité dans le Hub (ligne créée ou décidée dans le Hub) ou par Léo
export const etatLie = (leo) =>
  (leo?.payload?.hub_origine === 'hub' || leo?.payload?.hub_decided_by ? 'traite_dans_hub' : 'traite_par_leo')

// Moment où le dossier a été fermé (null s'il est encore en attente)
const fermeLe = (d) => (!d?.decision || d.decision === 'pending' ? null
  : Date.parse(d.decided_at ?? d.payload?.hub_decided_at ?? d.created_at))
const messageDuDossier = (d) => d?.gmail_message_id || d?.payload?.gmail_message_id || null

// Un dossier du fil peut-il absorber ce message ? Jamais s'il était déjà fermé quand le
// message est arrivé (nouvelle réponse = nouveau travail, Léo ou Hub), ni s'il a été créé
// dans le Hub pour un autre message du fil. Sinon : dossier postérieur au message.
function absorbeParFil(d, recu, messageId) {
  const ferme = fermeLe(d)
  if (ferme != null && ferme < recu) return false
  if (d.payload?.hub_origine === 'hub' && messageDuDossier(d) && messageDuDossier(d) !== messageId) return false
  return Date.parse(d.created_at) >= recu - 60_000
}

// Relie les courriels « nouveau » aux dossiers de Léo : même gmail_message_id, sinon un
// dossier du même fil qui peut l'absorber. Renvoie les mises à jour à écrire.
export function liaisons(inbox, dossiersLeo) {
  const parMessage = new Map()
  const parFil = new Map()
  for (const d of dossiersLeo ?? []) {
    if (d.gmail_message_id) parMessage.set(d.gmail_message_id, d)
    if (d.gmail_thread_id) (parFil.get(d.gmail_thread_id) ?? parFil.set(d.gmail_thread_id, []).get(d.gmail_thread_id)).push(d)
  }
  const out = []
  for (const m of inbox ?? []) {
    if (m.leo_interaction_id) continue
    const recu = Date.parse(m.recu_le)
    const d = parMessage.get(m.gmail_message_id)
      ?? (parFil.get(m.gmail_thread_id) ?? []).find(x => absorbeParFil(x, recu, m.gmail_message_id))
    if (d) out.push({ gmail_message_id: m.gmail_message_id, leo_interaction_id: d.id, etat: etatLie(d) })
  }
  return out
}

// Nouvelle réponse dans un fil déjà traité : le dernier dossier du fil fermé avant
// l'arrivée du message (null sinon). Il sert de « suite_de » ; on ne le rouvre jamais.
export function suiteDe(m, dossiersLeo) {
  const recu = Date.parse(m?.recu_le)
  const fermes = (dossiersLeo ?? [])
    .filter(d => d.gmail_thread_id === m?.gmail_thread_id && fermeLe(d) != null && fermeLe(d) < recu)
    .sort((a, b) => fermeLe(b) - fermeLe(a))
  return fermes[0]?.id ?? null
}

// File : courriels pas encore traités par Léo, sans doublon avec ses dossiers
export function courrielsNonTraites(inbox, dossiersLeo) {
  const vus = new Set((dossiersLeo ?? []).flatMap(d => [d.gmail, d.gmail_message_id]).filter(Boolean))
  return (inbox ?? [])
    .filter(m => m.etat === 'nouveau' && !m.leo_interaction_id && (m.libelles ?? []).includes('INBOX') && !vus.has(m.gmail_message_id))
    .sort((a, b) => String(b.recu_le).localeCompare(String(a.recu_le)))
}

// Courriel non traité → ligne de la file (même forme que resumeDossier)
export function elementFileInbox(m, delai, suite = null) {
  if (estLigneCommande(m)) {
    const numero = String(m.sujet).match(/#\s*(\d+)/)?.[1]
    const total = String(m.extrait ?? '').match(/Total ([\d\s.,]+ \$)/)?.[1]
    return {
      id: `${PREFIXE_INBOX}${m.gmail_message_id}`,
      inbox: true,
      channel: 'commande',
      nom: m.expediteur_nom || m.expediteur,
      courriel: m.expediteur,
      sujet: [`Commande #${numero ?? '?'}`, total].filter(Boolean).join(' · '),
      created_at: m.recu_le,
      decision: 'pending',
      attente: delai ?? null,
      retard: false,
      badgeAction: 'Nouvelle commande',
      etiquettes: [{ label: BADGE_NON_TRAITE, ton: 'info' }],
      apercu: m.extrait,
    }
  }
  return {
    id: `${PREFIXE_INBOX}${m.gmail_message_id}`,
    inbox: true,
    channel: 'courriel',
    nom: m.expediteur_nom || m.expediteur,
    courriel: m.expediteur,
    sujet: m.sujet,
    created_at: m.recu_le,
    decision: 'pending',
    attente: delai ?? null,
    retard: false,
    suiteDe: suite,
    badgeAction: suite ? BADGE_NOUVELLE_REPONSE : 'Nouveau courriel',
    etiquettes: [{ label: suite ? 'Fil déjà traité' : BADGE_NON_TRAITE, ton: 'info' }],
    apercu: m.extrait,
  }
}
