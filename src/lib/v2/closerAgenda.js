// Logique pure de l'écran closeur « Mon agenda et mes deals ».
import { PIPELINE_VENTE, PIPELINE_SETTING, DELAIS, FIELDS, CALENDARS, CONTACTS_TEST } from './salesConfig'
import { closerFieldMatches } from '../ghlHelpers'

const HEURE = 3_600_000
const DUREE_DEFAUT_MS = 45 * 60_000
const STATUTS_FINAUX = new Set(['showed', 'attended', 'noshow', 'cancelled'])
const STATUTS_ACTIFS = new Set(['new', 'confirmed'])

function champ(raw, fieldId) {
  const f = (raw?.customFields ?? []).find(c => c.id === fieldId || c.key === fieldId || c.fieldKey === fieldId)
  if (!f) return null
  return f.fieldValueString ?? f.fieldValue ?? f.value ?? f.fieldValueNumber ?? f.fieldValueDate ?? null
}
const ms = iso => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(t) ? null : t }
function finRdv(a) { return ms(a.end_time) ?? ((ms(a.start_time) ?? 0) + DUREE_DEFAUT_MS) }

// GHL → statut du rapport de fin de journée
export function statutEOD(ghlStatus) {
  if (ghlStatus === 'showed' || ghlStatus === 'attended') return 'show'
  if (ghlStatus === 'noshow') return 'noshow'
  if (ghlStatus === 'cancelled') return 'annule'
  return ''
}

// Statut effectif d'un RDV : celui du rapport EOD s'il existe, sinon celui de GHL
export function statutEffectif(appt, eodRows = []) {
  const row = eodRows.find(r => r.ghl_appointment_id === appt.ghl_id)
  return row?.status || statutEOD(appt.status)
}

// RDV passé depuis plus de 2 h sans statut (ni GHL ni EOD) → « à statuer »
export function estAStatuer(appt, eodRows, now = Date.now()) {
  if (STATUTS_FINAUX.has(appt.status)) return false
  if (statutEffectif(appt, eodRows)) return false
  const debut = ms(appt.start_time)
  return debut != null && now - debut > DELAIS.aStatuerHeures * HEURE
}

// Prochain RDV : le premier RDV actif pas encore terminé
export function prochainRdv(appts, now = Date.now()) {
  return [...(appts ?? [])]
    .filter(a => STATUTS_ACTIFS.has(a.status) && finRdv(a) > now)
    .sort((a, b) => ms(a.start_time) - ms(b.start_time))[0] ?? null
}

// Liste du jour : RDV à statuer épinglés en haut (les plus anciens d'abord), le reste par heure
export function listeDuJour(appts, eodRows, now = Date.now()) {
  const tries = [...(appts ?? [])].sort((a, b) => ms(a.start_time) - ms(b.start_time))
  const prochain = prochainRdv(tries, now)
  const lignes = tries.map(a => {
    const aStatuer = estAStatuer(a, eodRows, now)
    const statut = statutEffectif(a, eodRows)
    let etat = statut || 'aVenir'
    if (!statut && prochain?.ghl_id === a.ghl_id) etat = 'prochain'
    else if (!statut && !aStatuer && ms(a.start_time) < now) etat = 'enCours'
    return { appt: a, aStatuer, etat, depuisMs: now - (ms(a.start_time) ?? now) }
  })
  return {
    epingles: lignes.filter(l => l.aStatuer),
    lignes: lignes.filter(l => !l.aStatuer),
  }
}

// Décisions : opportunités Vente en « RDV décision bookée » ou « En décision » de ce closeur
export function mesDecisions(opps, closerName, now = Date.now()) {
  const S = PIPELINE_VENTE.stages
  const etapes = { [S.rdvDecisionBooke]: 'RDV décision bookée', [S.enDecision]: 'En décision' }
  return (opps ?? [])
    .filter(o => o.pipeline_id === PIPELINE_VENTE.id && etapes[o.pipeline_stage_id] && !CONTACTS_TEST.has(o.contact_id))
    .filter(o => closerFieldMatches(String(champ(o.raw, FIELDS.closer) ?? '').trim(), closerName))
    .map(o => {
      const depuis = o.raw?.lastStageChangeAt ?? o.created_at_ghl
      const heures = depuis ? Math.max(0, (now - ms(depuis)) / HEURE) : 0
      const niveau = heures >= DELAIS.decisionRougeJours * 24 ? 'rouge'
        : heures >= DELAIS.decisionOrangeHeures ? 'orange' : 'ok'
      return {
        ghlId: o.ghl_id,
        contactId: o.contact_id,
        nom: String(o.contact_name ?? '').trim() || 'Sans nom',
        etape: etapes[o.pipeline_stage_id],
        decisionBookee: o.pipeline_stage_id === S.rdvDecisionBooke,
        valeur: Number(o.monetary_value ?? 0),
        jours: Math.floor(heures / 24),
        heures,
        niveau,
      }
    })
    .sort((a, b) => b.heures - a.heures)
}

// Setter et source d'un contact, depuis sa carte du pipeline setting
export function infosSetting(opps, contactId) {
  const o = (opps ?? []).find(x => x.pipeline_id === PIPELINE_SETTING.id && x.contact_id === contactId)
  if (!o) return { setter: null, source: null }
  return { setter: String(champ(o.raw, FIELDS.setterNom) ?? '').trim() || null, source: o.source || null }
}

// Le RDV a-t-il lieu aujourd'hui (jour calendaire à Montréal) ?
export function estAujourdhui(iso, now = Date.now()) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const jour = x => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(x)
  return jour(d) === jour(new Date(now))
}

export function typeRdv(appt) {
  return appt?.calendar_id === CALENDARS.decision ? 'Rencontre de décision' : 'Rencontre découverte'
}
