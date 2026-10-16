// Setting v2 : priorité des leads à appeler, propriété, rappels, tentatives.
// Fonctions pures ; les règles communes avec le serveur sont dans
// supabase/functions/_shared/settingRegles.js.
import { DELAI_RAPPEL_MS, SEUIL_APPEL_S } from '../../../supabase/functions/_shared/settingRegles.js'
import { PIPELINE_SETTING } from './salesConfig'

const STAGE_CONTACT_ETABLI = PIPELINE_SETTING.stages.contactEtabli
import { fmtRdvRelatif } from './format'

export { RAISONS_NON_QUALIFIE, erreurResultat, libelleRaison, SEUIL_APPEL_S, DELAI_RAPPEL_MS } from '../../../supabase/functions/_shared/settingRegles.js'

const MIN = 60_000
const HEURE = 3_600_000

function ms(iso) {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

export function prenom(nom) {
  const w = String(nom ?? '').trim().split(/\s+/)[0] ?? ''
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''
}

// Appels par contact, du plus récent au plus ancien
export function indexerAppels(appels) {
  const out = new Map()
  for (const a of appels ?? []) {
    if (!a?.contact_id) continue
    if (!out.has(a.contact_id)) out.set(a.contact_id, [])
    out.get(a.contact_id).push(a)
  }
  for (const l of out.values()) l.sort((a, b) => (ms(b.appele_le) ?? 0) - (ms(a.appele_le) ?? 0))
  return out
}

// Dernière tentative d'un lead : dernier appel sortant du journal, sinon le
// dernier changement d'étape d'un lead déjà tenté (LEAD-11 avance la carte).
// { date, par (nom ou null), duree } ou null si jamais appelé.
export function derniereTentative(lead, appelsDuContact = [], nomsParId = {}) {
  const a = (appelsDuContact ?? []).find(x => x.sortant !== false)
  if (a) return { date: a.appele_le, par: (a.user_id && nomsParId[a.user_id]) || null, duree: a.duree ?? null }
  if ((lead?.tentative ?? 1) > 1 && lead?.changementEtape) return { date: lead.changementEtape, par: null, duree: null }
  return null
}

// Groupes de priorité (3C), plus deux états pour les leads déjà joints :
//   1   rappel dû du setter connecté
//   1.5 contact établi : on a parlé au lead (dernier appel de 60 s ou plus, ou
//       étape « 💬 Contact établi ») et aucun rappel n'est prévu → mettre un
//       rappel ou un résultat
//   2   jamais appelé   3 prêt (≥ 24 h)   4 en attente (< 24 h)
//   5   rappel prévu plus tard
export const GROUPE_CONTACT = 1.5
export const GROUPE_RAPPEL_PREVU = 5

export function groupeLead({ tentative, rappelDu, rappelFutur = false, conversation = false }, now = Date.now()) {
  if (rappelDu) return 1
  if (rappelFutur) return GROUPE_RAPPEL_PREVU
  if (conversation) return GROUPE_CONTACT
  if (!tentative) return 2
  const t = ms(tentative.date)
  if (t == null) return 3
  return now - t >= DELAI_RAPPEL_MS ? 3 : 4
}

// Dernière conversation (appel de 60 s ou plus) si c'est le dernier appel du lead
export function derniereConversation(appelsDuContact = [], nomsParId = {}) {
  const dernier = (appelsDuContact ?? [])[0]
  if (!dernier || (dernier.duree ?? 0) < SEUIL_APPEL_S) return null
  return { date: dernier.appele_le, par: (dernier.user_id && nomsParId[dernier.user_id]) || null, duree: dernier.duree }
}

// Ajoute { derniere, conversation, groupe, rappelableLe, rappel } à chaque lead,
// puis trie : 1 le plus en retard d'abord, 1.5 la conversation la plus récente
// d'abord, 2 le plus récent d'abord, 3 celui qui attend depuis le plus longtemps
// d'abord, 4 le premier rappelable d'abord, 5 le rappel le plus proche d'abord.
export function prioriserLeads(leads, { appelsParContact = new Map(), rappelsParContact = new Map(), nomsParId = {}, now = Date.now() } = {}) {
  const enrichis = (leads ?? []).map(l => {
    const appels = appelsParContact.get(l.contactId) ?? []
    const derniere = derniereTentative(l, appels, nomsParId)
    const conversation = derniereConversation(appels, nomsParId)
    const rappel = rappelsParContact.get(l.contactId) ?? null
    const rappelDu = !!rappel && (ms(rappel.rappel_le) ?? Infinity) <= now
    const groupe = groupeLead({
      tentative: derniere, rappelDu, rappelFutur: !!rappel && !rappelDu,
      conversation: !!conversation || l.stageId === STAGE_CONTACT_ETABLI,
    }, now)
    const rappelableLe = derniere && groupe === 4 ? (ms(derniere.date) + DELAI_RAPPEL_MS) : null
    // Appels sortants du journal (31 jours) : servent de tentatives quand l'étape
    // GHL n'en donne plus (ex. « Contact établi »)
    const nbAppels = appels.filter(a => a.sortant !== false).length
    return { ...l, derniere, conversation, rappel, groupe, rappelableLe, nbAppels }
  })
  const cle = l => {
    if (l.groupe === 1) return ms(l.rappel?.rappel_le) ?? 0
    if (l.groupe === GROUPE_CONTACT) return -(ms(l.conversation?.date ?? l.changementEtape) ?? 0)
    if (l.groupe === 2) return -(ms(l.creeLe) ?? 0)
    if (l.groupe === 3) return ms(l.derniere?.date) ?? 0
    if (l.groupe === GROUPE_RAPPEL_PREVU) return ms(l.rappel?.rappel_le) ?? Infinity
    return l.rappelableLe ?? Infinity
  }
  return enrichis.sort((a, b) => (a.groupe - b.groupe) || (cle(a) - cle(b)))
}

// Liste « Nouveaux leads » : pas de groupes de priorité (tous jamais contactés
// d'après l'étape GHL). 🔥 chauds en tête, puis du plus ancien au plus récent.
// Le dernier appel du journal reste affiché s'il y en a un.
export function prioriserNouveaux(leads, ctx = {}) {
  const cree = l => ms(l.creeLe) ?? Infinity
  return prioriserLeads(leads, ctx)
    .map(l => ({ ...l, groupe: 2, rappelableLe: null }))
    .sort((a, b) => (Number(!!b.chaud) - Number(!!a.chaud)) || (cree(a) - cree(b)))
}

// Tentatives à afficher (0 à 4) : d'après l'étape du pipeline setting, sinon le
// nombre d'appels sortants du journal ; null si aucune des deux
export function tentativesAffichees(lead) {
  if (lead?.tentative != null) return Math.min(4, Math.max(0, lead.tentative - 1))
  if (lead?.nbAppels > 0) return Math.min(4, lead.nbAppels)
  return null
}

// « 2e tentative · hier 14 h 32 · Vicky » ; « Jamais appelé »
export function fmtTentative(lead, now = Date.now()) {
  const n = lead?.tentative != null ? Math.max(0, lead.tentative - 1) : null
  const d = lead?.derniere
  if (!d) return n ? `${n}e tentative` : 'Jamais appelé'
  const rang = n ? (n === 1 ? '1re tentative' : `${n}e tentative`) : 'Appelé'
  const quand = fmtRdvRelatif(d.date, now).replace(/^Auj\. /, 'auj. ').replace(/^Hier /, 'hier ')
  return [rang, quand, d.par ? prenom(d.par) : null].filter(Boolean).join(' · ')
}

// « 6 h », « 45 min », « 1 h 20 »
export function fmtDuree(msRestants) {
  const m = Math.max(1, Math.ceil(msRestants / MIN))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`
}

// « 2 min 14 s »
export function fmtDureeAppel(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60), r = Math.round(s % 60)
  return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`
}

// Avertissement en haut de la fiche : appel de quelqu'un d'autre dans les 24 h.
// « Appelé par Vicky il y a 3 h, 2 min 14 s : écoute l'appel avant de rappeler »
export function avertissementAppelRecent(appelsDuContact, userId, nomsParId = {}, now = Date.now()) {
  const a = (appelsDuContact ?? []).find(x => x.user_id !== userId && now - (ms(x.appele_le) ?? 0) < DELAI_RAPPEL_MS)
  if (!a) return null
  const qui = prenom(nomsParId[a.user_id]) || 'un autre membre de l’équipe'
  const ilya = fmtDuree(now - ms(a.appele_le))
  const duree = a.duree ? `, ${fmtDureeAppel(a.duree)}` : ''
  const conseil = (a.duree ?? 0) >= 60 ? ' : écoute l’appel avant de rappeler' : ''
  return `Appelé par ${qui} il y a ${ilya}${duree}${conseil}`
}

// Répartit les leads selon la propriété (3B). Un lead assigné à un autre setter
// disparaît de la liste commune ; l'admin le voit dans « Leads assignés ».
// traites : contacts sortis par un résultat (Non qualifié / Pas intéressé).
export function repartirLeads(leads, { proprietes = new Map(), traites = new Set(), userId, estAdmin = false }) {
  const miens = [], communs = [], assignes = []
  const vus = new Set()
  for (const l of leads ?? []) {
    if (vus.has(l.contactId) || traites.has(l.contactId)) continue
    vus.add(l.contactId)
    const p = proprietes.get(l.contactId)
    const avecProprio = p ? { ...l, proprietaire: p.user_id } : l
    if (!p) communs.push(avecProprio)
    else if (p.user_id === userId) miens.push(avecProprio)
    else if (estAdmin) assignes.push(avecProprio)
  }
  return { miens, communs, assignes }
}

// Événements qui sortent un lead des listes de setting : résultat « Non
// qualifié » / « Pas intéressé », rencontre découverte, carte Vente.
// evenements : Map contactId → date du plus récent. Le lead n'est masqué que si
// l'événement est postérieur au dernier changement d'étape de sa carte setting :
// un lead qui revient (lead magnet, carte remise à « Nouveau lead ») réapparaît.
export function sortiDesListes(lead, evenements) {
  const ev = ms(evenements?.get(lead?.contactId))
  if (ev == null) return false
  const carte = ms(lead.changementEtape) ?? ms(lead.creeLe)
  return carte == null || ev >= carte
}

export function ajouterEvenement(map, contactId, date) {
  const t = ms(date)
  if (!contactId || t == null) return map
  if (!map.has(contactId) || t > ms(map.get(contactId))) map.set(contactId, date)
  return map
}

// Mes rappels : en retard d'abord (le plus en retard en premier), puis
// aujourd'hui, puis à venir. Statut d'affichage : retard / aujourdhui / avenir.
export function trierRappels(rappels, now = Date.now(), jourDe = d => new Date(d).toDateString()) {
  const auj = jourDe(now)
  return [...(rappels ?? [])]
    .filter(r => r.statut === 'actif')
    .map(r => {
      const t = ms(r.rappel_le)
      const etat = t <= now ? 'retard' : jourDe(t) === auj ? 'aujourdhui' : 'avenir'
      return { ...r, etat }
    })
    .sort((a, b) => ms(a.rappel_le) - ms(b.rappel_le))
}

// Valeur par défaut du champ date/heure d'un rappel : demain, même heure, à la demi-heure
export function rappelParDefaut(now = Date.now()) {
  const d = new Date(now + 24 * HEURE)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return d
}

// Tâches du jour : non faites, dues avant la fin de la journée (heure locale)
export function tachesDuJour(taches, now = Date.now()) {
  const fin = new Date(now); fin.setHours(23, 59, 59, 999)
  return (taches ?? []).filter(t => !t.fait_le && (ms(t.due_le) ?? 0) <= fin.getTime())
}
