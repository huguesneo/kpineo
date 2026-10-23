// Adjoint : historique complet d'une personne (fiche Personne). Logique pure : chaque
// source (fils Gmail de info@, SMS et courriels GHL, App NEO, dossiers Léo) devient une
// liste d'éléments { cle, source, date, titre, extrait, sens, nombre, ref }, puis tout est
// fusionné du plus récent au plus ancien. Partagé par leo-adjoint et le front.
import { jourMontreal } from './adjoint.js'
import { entete, extraitTexte, lireAdresse, ADRESSE_INFO } from './gmailFil.js'

export const SOURCES = {
  gmail: { label: 'Courriel info@', icone: 'courriel' },
  ghl_sms: { label: 'SMS GHL', icone: 'sms' },
  ghl_courriel: { label: 'Courriel GHL', icone: 'courriel' },
  app: { label: 'App NEO', icone: 'sms' },
  leo: { label: 'Dossier Léo', icone: 'leo' },
}
// Nom de la source dans « … indisponible »
export const NOM_INDISPONIBLE = { gmail: 'Gmail', ghl: 'GHL', app: 'App' }

const iso = (v) => {
  const d = v instanceof Date ? v : new Date(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Recherche Gmail des fils où l'adresse est en from, to ou cc
export const requeteGmailPersonne = (courriel) => `from:${courriel} OR to:${courriel} OR cc:${courriel}`

// Fils Gmail (format metadata) → un élément par fil, daté de son dernier message
export function elementsGmail(threads) {
  return (threads ?? []).filter(t => t?.messages?.length).map(t => {
    const msgs = t.messages.filter(m => !(m.labelIds ?? []).includes('DRAFT'))
    const dernier = (msgs.length ? msgs : t.messages).reduce((a, b) => (Number(b.internalDate) > Number(a.internalDate) ? b : a))
    const premier = t.messages.reduce((a, b) => (Number(b.internalDate) < Number(a.internalDate) ? b : a))
    const de = lireAdresse(entete(dernier.payload?.headers, 'From'))
    return {
      cle: `gmail:${t.id}`,
      source: 'gmail',
      date: iso(dernier.internalDate),
      titre: entete(premier.payload?.headers, 'Subject') || '(sans objet)',
      extrait: extraitTexte(dernier.snippet ?? ''),
      sens: de.courriel === ADRESSE_INFO || (dernier.labelIds ?? []).includes('SENT') ? 'envoye' : 'recu',
      nombre: msgs.length || t.messages.length,
      ref: { threadId: t.id },
    }
  })
}

// Résumé par jour : nombre de messages, dernier message
function parJour(items, { source, titre }) {
  const jours = new Map()
  for (const it of items) {
    if (!it.date) continue
    const jour = jourMontreal(new Date(it.date))
    const j = jours.get(jour) ?? { items: [] }
    j.items.push(it)
    jours.set(jour, j)
  }
  return [...jours.entries()].map(([jour, j]) => {
    const dernier = j.items.reduce((a, b) => (b.date > a.date ? b : a))
    return {
      cle: `${source}:${jour}`,
      source,
      date: dernier.date,
      titre: titre(j.items),
      extrait: dernier.extrait,
      sens: dernier.sens,
      nombre: j.items.length,
      ref: { jour, ...(dernier.ref ?? {}) },
    }
  })
}

// Messages GHL (conversations du contact) → SMS résumés par jour, courriels un par un
export function elementsGhl(messages) {
  const sms = []
  const courriels = []
  for (const m of messages ?? []) {
    const date = iso(m.dateAdded ?? m.dateUpdated)
    if (!date) continue
    const type = String(m.messageType ?? m.type ?? '').toUpperCase()
    const sens = String(m.direction ?? '').toLowerCase() === 'outbound' ? 'envoye' : 'recu'
    const extrait = extraitTexte(m.body ?? m.meta?.email?.body ?? '')
    if (/SMS|WHATSAPP/.test(type) || type === '2') {
      sms.push({ date, sens, extrait, ref: { conversationId: m.conversationId ?? null } })
    } else if (/EMAIL/.test(type) || type === '3') {
      courriels.push({
        cle: `ghl_courriel:${m.id}`,
        source: 'ghl_courriel',
        date,
        titre: m.meta?.email?.subject || m.subject || 'Courriel GHL',
        extrait,
        sens,
        nombre: 1,
        ref: { conversationId: m.conversationId ?? null, messageId: m.id },
      })
    }
  }
  const titreSms = (items) => {
    const sens = new Set(items.map(i => i.sens))
    const pluriel = items.length > 1 ? 's' : ''
    return `${items.length} SMS ${sens.size > 1 ? `échangé${pluriel}` : sens.has('envoye') ? `envoyé${pluriel}` : `reçu${pluriel}`}`
  }
  return [...parJour(sms, { source: 'ghl_sms', titre: titreSms }), ...courriels]
}

// client_chats (projet Clinique) → un résumé par jour, sans le contenu complet
const SUJETS_APP = { leo: 'Léo', plan: 'plan', admin: 'équipe' }
export function elementsApp(chats) {
  const items = (chats ?? []).map(c => ({
    date: iso(c.created_at),
    sens: c.from_side === 'client' ? 'recu' : 'envoye',
    extrait: extraitTexte(c.message ?? '', 120),
    sujet: c.topic,
  }))
  return parJour(items, {
    source: 'app',
    titre: (its) => {
      const sujets = [...new Set(its.map(i => SUJETS_APP[i.sujet] ?? i.sujet).filter(Boolean))]
      return `${its.length} message${its.length > 1 ? 's' : ''} dans l’app${sujets.length ? ` (${sujets.join(', ')})` : ''}`
    },
  }).map(e => ({ ...e, ref: { jour: e.ref.jour } }))
}

// Dossiers Léo (résumés de leo-adjoint) → éléments
export function elementsLeo(dossiers) {
  return (dossiers ?? []).map(d => ({
    cle: `leo:${d.id}`,
    source: 'leo',
    date: iso(d.created_at),
    titre: d.resume?.sujet ?? d.sujet ?? 'Dossier',
    extrait: String(d.resume?.apercu ?? d.incoming_message ?? '').replace(/\s+/g, ' ').slice(0, 140),
    sens: 'recu',
    nombre: 1,
    canal: d.channel,
    decision: d.resume?.decisionAffichee ?? d.decision ?? null,
    ref: { id: d.id },
  }))
}

// Toutes les sources → une ligne du temps, du plus récent au plus ancien, sans doublon
export function fusionnerLigneDuTemps(...listes) {
  const vus = new Map()
  for (const e of listes.flat()) if (e?.cle && e.date && !vus.has(e.cle)) vus.set(e.cle, e)
  return [...vus.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))
}
