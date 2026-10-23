// Adjoint, temps réel : la boîte de réception de info@ copiée dans inbox_messages
// (neo-admin) par gmail-sync, puis reliée aux dossiers de Léo. Logique pure, partagée
// par gmail-sync, leo-adjoint et le front (file sans doublon).
import { entete, extraitTexte, lireAdresse } from './gmailFil.js'

export const ETATS_INBOX = ['nouveau', 'traite_par_leo', 'traite_dans_hub']
export const BADGE_NON_TRAITE = 'Pas encore traité par Léo'
// Bruit déjà filtré par Léo (noms de libellés) et libellés système à ignorer
const LIBELLES_BRUIT = /^(blocked|promotions?|wordpress)$|\/(blocked|promotions?|wordpress)$/i
const SYSTEME_BRUIT = ['SPAM', 'TRASH', 'DRAFT', 'SENT', 'CATEGORY_PROMOTIONS']
export const DOMAINE_INTERNE = '@neoperformance.ca'
export const PREFIXE_INBOX = 'inbox:'

export const estInterne = (courriel) => String(courriel ?? '').toLowerCase().endsWith(DOMAINE_INTERNE)

// labelIds Gmail → noms (table id → nom lue une fois par gmail-sync)
export const nomsDesLibelles = (labelIds, table = {}) => (labelIds ?? []).map(id => table[id] ?? id)

// Courriel à ignorer : interne, hors boîte de réception, ou bruit
export function doitIgnorer({ de, labelIds = [], tableLibelles = {} }) {
  if (!labelIds.includes('INBOX')) return true
  if (estInterne(de)) return true
  if (labelIds.some(l => SYSTEME_BRUIT.includes(l))) return true
  return nomsDesLibelles(labelIds, tableLibelles).some(n => LIBELLES_BRUIT.test(String(n).trim()))
}

// Message Gmail (format metadata) → ligne inbox_messages, ou null s'il est à ignorer
export function ligneInbox(m, tableLibelles = {}) {
  const h = m?.payload?.headers ?? []
  const de = lireAdresse(entete(h, 'From'))
  if (!m?.id || doitIgnorer({ de: de.courriel, labelIds: m.labelIds ?? [], tableLibelles })) return null
  return {
    gmail_message_id: m.id,
    gmail_thread_id: m.threadId,
    expediteur: de.courriel,
    expediteur_nom: de.nom,
    sujet: entete(h, 'Subject') || '(sans objet)',
    extrait: extraitTexte(m.snippet ?? '', 200),
    recu_le: new Date(Number(m.internalDate)).toISOString(),
    libelles: m.labelIds ?? [],
  }
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

// Relie les courriels « nouveau » aux dossiers de Léo : même gmail_message_id, sinon même
// fil quand le dossier est postérieur au courriel. Renvoie les mises à jour à écrire.
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
      ?? (parFil.get(m.gmail_thread_id) ?? []).find(x => Date.parse(x.created_at) >= recu - 60_000)
    if (d) out.push({ gmail_message_id: m.gmail_message_id, leo_interaction_id: d.id, etat: etatLie(d) })
  }
  return out
}

// File : courriels pas encore traités par Léo, sans doublon avec ses dossiers
export function courrielsNonTraites(inbox, dossiersLeo) {
  const vus = new Set((dossiersLeo ?? []).flatMap(d => [d.gmail, d.gmail_message_id]).filter(Boolean))
  return (inbox ?? [])
    .filter(m => m.etat === 'nouveau' && !m.leo_interaction_id && (m.libelles ?? []).includes('INBOX') && !vus.has(m.gmail_message_id))
    .sort((a, b) => String(b.recu_le).localeCompare(String(a.recu_le)))
}

// Courriel non traité → ligne de la file (même forme que resumeDossier)
export function elementFileInbox(m, delai) {
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
    badgeAction: 'Nouveau courriel',
    etiquettes: [{ label: BADGE_NON_TRAITE, ton: 'info' }],
    apercu: m.extrait,
  }
}
