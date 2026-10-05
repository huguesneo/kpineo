// Confirmation des rencontres découverte (closeurs et setters), en fonctions pures.
// Source unique de l'état « confirmé » : l'étape de la carte 🎯 Vente du contact
// (« ✅ RDV confirmé » ou « 📅 RDV booké »). Le statut du RDV GHL ne sert pas :
// GHL le met à « confirmed » dès la réservation, pour tout le monde.
import { PIPELINE_VENTE, CALENDARS_DECOUVERTE } from './salesConfig'
import { fmtRdvRelatif } from './format'

const STATUTS_ACTIFS = new Set(['new', 'confirmed'])
// Après un clic, l'écran attend que la carte Vente bouge (workflow GHL, puis
// webhook) ; passé ce délai sans changement, il revient à l'état de la carte.
export const DELAI_MAJ_MS = 10 * 60_000

const ms = iso => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(t) ? null : t }

// { contactId: 'confirme' | 'nonConfirme' | null } d'après la carte Vente la plus récente.
// null : carte à une autre étape (présentée, annulée, gagnée…), sans objet ici.
export function indexConfirmations(opps) {
  const S = PIPELINE_VENTE.stages
  const parContact = new Map()
  for (const o of opps ?? []) {
    if (o?.pipeline_id !== PIPELINE_VENTE.id || !o.contact_id) continue
    const cur = parContact.get(o.contact_id)
    if (!cur || (ms(o.created_at_ghl) ?? 0) > (ms(cur.created_at_ghl) ?? 0)) parContact.set(o.contact_id, o)
  }
  const out = {}
  for (const [cid, o] of parContact) {
    out[cid] = o.pipeline_stage_id === S.rdvConfirme ? 'confirme'
      : o.pipeline_stage_id === S.rdvBooke ? 'nonConfirme' : null
  }
  return out
}

// Un contact sans carte Vente n'est pas confirmé
export function etatConfirmation(contactId, index) {
  if (!contactId) return null
  return contactId in (index ?? {}) ? index[contactId] : 'nonConfirme'
}

// Rencontre découverte à venir, ni annulée ni statuée (même règle que le serveur)
export function rdvConfirmable(appt, now = Date.now()) {
  if (!appt?.contact_id) return false
  if (!CALENDARS_DECOUVERTE.includes(appt.calendar_id)) return false
  if (!STATUTS_ACTIFS.has(appt.status)) return false
  const t = ms(appt.start_time)
  return t != null && t > now
}

// Rôles qui voient les boutons. Le serveur (ghl-confirmer-rencontre) refait la
// vérification complète : un closeur n'y confirme que ses propres RDV.
export function peutConfirmer(profile) {
  const roles = [profile?.role, ...(profile?.secondary_roles ?? [])]
  return roles.some(r => ['setter', 'closer', 'admin', 'resp_vente'].includes(r))
}

// État à l'écran : celui de la carte Vente, sauf juste après un clic tant que la
// carte n'a pas encore bougé (local = { action: 'confirmer' | 'annuler', at }).
export function etatAffiche(source, local, now = Date.now()) {
  if (local && now - local.at < DELAI_MAJ_MS) {
    if (local.action === 'confirmer' && source !== 'confirme') return 'confirmationEnCours'
    if (local.action === 'annuler' && source === 'confirme') return 'annulationEnCours'
  }
  return source
}

export const STYLES_CONFIRMATION = {
  confirme:            { label: 'Confirmé',       bg: '#ecfdf5', color: '#047857' },
  nonConfirme:         { label: 'Non confirmé',   bg: '#fffbeb', color: '#b45309' },
  confirmationEnCours: { label: 'Confirmation en cours…', bg: '#f3f4f6', color: '#4b5563' },
  annulationEnCours:   { label: 'Retrait en cours…',      bg: '#f3f4f6', color: '#4b5563' },
}

// Confirmations actives faites depuis le hub (v2_confirmations), par RDV
export function indexManuelles(rows) {
  const out = {}
  for (const r of rows ?? []) if (r?.appointment_id && !r.annule_le) out[r.appointment_id] = r
  return out
}

// ── Appels (journal GHL, fonction ghl-appels-recents) ─────────────────────
// Appels sortants vers le contact depuis la réservation : { nb, dernier }
export function appelsDepuis(appels, contactId, depuisIso) {
  const depuis = ms(depuisIso) ?? -Infinity
  const liste = (appels?.[contactId] ?? []).filter(a => a.sortant && (ms(a.date) ?? -Infinity) >= depuis)
  return { nb: liste.length, dernier: liste[0] ?? null }
}

// « Auj. 14 h 05 · répondu 55 s », « Hier 9 h · pas de réponse »
export function fmtAppel(dernier, now = Date.now()) {
  if (!dernier) return 'Pas appelé'
  const quand = fmtRdvRelatif(dernier.date, now)
  const s = dernier.statut
  const issue = s === 'completed' ? `répondu${dernier.duree != null ? ` ${dernier.duree} s` : ''}`
    : s === 'no-answer' ? 'pas de réponse'
    : s === 'busy' ? 'occupé'
    : s === 'voicemail' ? 'messagerie'
    : s ? 'échoué' : ''
  return issue ? `${quand} · ${issue}` : quand
}

// Filtres de la file « À confirmer » : confirmation (tous | confirmes | nonConfirmes)
// et appel (tous | appeles | nonAppeles). Un lead « en cours » compte comme sa cible.
export const FILTRES_DEFAUT = { confirmation: 'tous', appel: 'tous' }
export function filtrerAConfirmer(leads, filtres = FILTRES_DEFAUT) {
  const confirme = l => l.confirmation === 'confirme' || l.confirmation === 'confirmationEnCours'
  return (leads ?? []).filter(l => {
    if (filtres.confirmation === 'confirmes' && !confirme(l)) return false
    if (filtres.confirmation === 'nonConfirmes' && confirme(l)) return false
    if (filtres.appel === 'appeles' && !(l.appel?.nb > 0)) return false
    if (filtres.appel === 'nonAppeles' && l.appel?.nb > 0) return false
    return true
  })
}

// File « À confirmer » à l'écran : état affiché (clic récent pas encore reflété par
// la carte Vente) et appels depuis la réservation (repli : arrivée de la carte à
// l'étape). appels null (journal pas chargé ou indisponible) → appel null.
export function enrichirAConfirmer(leads, { locaux = {}, appels = null, now = Date.now() } = {}) {
  return (leads ?? []).map(l => ({
    ...l,
    confirmation: l.rdvAVenir ? etatAffiche(l.confirmation, locaux[l.rdvRef?.ghlId], now) : l.confirmation,
    appel: appels ? appelsDepuis(appels, l.contactId, l.rdvRef?.dateAjout ?? l.changementEtape) : null,
  }))
}
