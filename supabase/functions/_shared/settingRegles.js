// Règles du Setting v2, partagées par les edge functions (setting-actions,
// setting-cycle) et l'écran setter (src/lib/v2/settingV2.js). Fonctions pures.

export const SEUIL_APPEL_S = 60                // appel de 60 s ou plus = lead assigné
export const DELAI_RAPPEL_MS = 24 * 3_600_000  // 24 h entre deux tentatives
export const JOURS_OUVRABLES_LIBERATION = 3    // sans action : retour dans la liste commune
export const JOURS_OUVRABLES_ALERTE = 2        // tâche « sans action depuis 2 jours ouvrables »
export const TZ = 'America/Toronto'            // même fuseau que Montréal

export const TAG_RAPPEL = 'rappel-manuel'
export const TAG_NON_QUALIFIE = 'setting-non-qualifie'
export const TAG_PAS_INTERESSE = 'setting-pas-interesse'
export const CHAMP_DATE_RAPPEL = 'date_rappel'          // clé du champ personnalisé contact
export const CHAMP_CYCLE_UTM_SOURCE = 'cycle_utm_source'

export const RAISONS_NON_QUALIFIE = [
  { cle: 'age', libelle: 'Âge' },
  { cle: 'hors_cible', libelle: 'Hors cible' },
  { cle: 'mauvais_numero', libelle: 'Mauvais numéro' },
  { cle: 'autre', libelle: 'Autre' },
]

export function libelleRaison(cle, texte) {
  const r = RAISONS_NON_QUALIFIE.find(x => x.cle === cle)
  if (!r) return null
  return cle === 'autre' && texte ? `Autre : ${texte}` : r.libelle
}

// Valide la demande « Résultat de l'appel ». Retourne un message d'erreur ou null.
export function erreurResultat({ resultat, raison, raisonTexte } = {}) {
  if (!['rdv_booke', 'non_qualifie', 'pas_interesse'].includes(resultat)) return 'Résultat inconnu'
  if (resultat !== 'non_qualifie') return null
  if (!RAISONS_NON_QUALIFIE.some(r => r.cle === raison)) return 'Choisis une raison'
  if (raison === 'autre' && !String(raisonTexte ?? '').trim()) return 'Précise la raison'
  return null
}

// Note posée sur le contact GHL pour un « Non qualifié »
export function noteNonQualifie({ raison, raisonTexte, prenom, quand }) {
  return `🗑️ Non qualifié (setting) : ${libelleRaison(raison, String(raisonTexte ?? '').trim())}. Par ${prenom || 'un setter'}, le ${quand}.`
}

// Interrupteur des écritures GHL : tant qu'il est éteint, seul le contact test
// reçoit les écritures réelles (tags, champ, opportunité).
export function peutEcrireGhl({ ecrituresReelles, emailContact, emailTest }) {
  if (ecrituresReelles === true) return true
  const a = String(emailContact ?? '').trim().toLowerCase()
  const b = String(emailTest ?? '').trim().toLowerCase()
  return !!a && a === b
}

// ── Jours ouvrables (lundi au vendredi, fuseau de Montréal) ─────────────────
// Les jours fériés ne sont pas exclus.
function jourSemaine(ms) {
  const j = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(ms))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(j)
}
function estOuvrable(ms) {
  const j = jourSemaine(ms)
  return j >= 1 && j <= 5
}

// Instant + n jours ouvrables : on avance de 24 h en 24 h et on ne compte que
// les jours de semaine (un samedi ou un dimanche ne compte pas).
export function ajouterJoursOuvrables(depuis, n) {
  let t = new Date(depuis).getTime()
  let restants = n
  while (restants > 0) {
    t += 86_400_000
    if (estOuvrable(t)) restants--
  }
  return t
}

// Le lead assigné revient-il dans la liste commune ? (3 jours ouvrables sans action)
export function proprieteExpiree(derniereAction, now = Date.now()) {
  return now >= ajouterJoursOuvrables(derniereAction, JOURS_OUVRABLES_LIBERATION)
}

// Faut-il prévenir le setter ? (2 jours ouvrables sans action)
export function proprieteEnAlerte(derniereAction, now = Date.now()) {
  return now >= ajouterJoursOuvrables(derniereAction, JOURS_OUVRABLES_ALERTE)
}

// ── Journal d'appels GHL → lignes setting_appels ────────────────────────────
// messages : réponse de GET /conversations/messages/export?channel=Call
export function lignesAppels(messages, profilsParGhlId = {}) {
  const out = []
  for (const m of messages ?? []) {
    if (m?.messageType && m.messageType !== 'TYPE_CALL') continue
    const id = m?.id ?? m?._id
    const contactId = m?.contactId
    const date = m?.dateAdded ?? m?.createdAt
    if (!id || !contactId || !date) continue
    const call = m.meta?.call ?? {}
    const duree = Number(call.duration ?? m.callDuration)
    const ghlUserId = m.userId ?? call.userId ?? null
    out.push({
      id: String(id),
      contact_id: String(contactId),
      conversation_id: m.conversationId ?? null,
      ghl_user_id: ghlUserId,
      user_id: (ghlUserId && profilsParGhlId[ghlUserId]) || null,
      sortant: m.direction !== 'inbound',
      statut: String(call.status ?? m.callStatus ?? m.status ?? '') || null,
      duree: Number.isFinite(duree) ? Math.round(duree) : null,
      appele_le: new Date(date).toISOString(),
    })
  }
  return out
}

// Qui devient propriétaire de quels leads, d'après de nouveaux appels.
// Retourne { contactId: { user_id, appele_le } } : le dernier appel de 60 s ou
// plus fait par un setter connu de l'app.
export function nouveauxProprietaires(appels) {
  const out = {}
  for (const a of appels ?? []) {
    if (!a.user_id || (a.duree ?? 0) < SEUIL_APPEL_S) continue
    const cur = out[a.contact_id]
    if (!cur || a.appele_le > cur.appele_le) out[a.contact_id] = { user_id: a.user_id, appele_le: a.appele_le }
  }
  return out
}
