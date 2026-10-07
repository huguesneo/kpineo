// Logique pure de l'écran closeur « Mon agenda et mes deals ».
import { PIPELINE_VENTE, PIPELINE_SETTING, DELAIS, FIELDS, CALENDARS, CONTACTS_TEST } from './salesConfig'
import { closerFieldMatches } from '../ghlHelpers'

const HEURE = 3_600_000
const DUREE_DEFAUT_MS = 45 * 60_000
const STATUTS_FINAUX = new Set(['showed', 'attended', 'noshow', 'cancelled'])
const STATUTS_ACTIFS = new Set(['new', 'confirmed'])
const STATUTS_RDV_ANNULES = new Set(['cancelled', 'invalid'])

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

// RDV décision d'un contact (annulés exclus) : le prochain pas encore terminé,
// et la fin du dernier terminé
export function rdvsDecisionDuContact(appts, contactId, now = Date.now()) {
  const rdvs = (appts ?? []).filter(a => a.calendar_id === CALENDARS.decision && a.contact_id === contactId
    && !STATUTS_RDV_ANNULES.has(a.status) && ms(a.start_time) != null)
  const aVenir = rdvs
    .filter(a => a.status !== 'noshow' && finRdv(a) > now)
    .sort((a, b) => ms(a.start_time) - ms(b.start_time))[0] ?? null
  const fins = rdvs.map(finRdv).filter(f => f <= now)
  return { aVenir, finDernier: fins.length ? Math.max(...fins) : null }
}

// Décisions : opportunités Vente de ce closeur en « RDV décision bookée » ou « En décision »,
// ou en « RDV présentée » avec un RDV décision à venir. Un RDV décision à venir l'emporte
// sur l'étape GHL (souvent écrasée par le statut de l'appel) : « RDV décision bookée »,
// jamais à relancer. Sinon l'âge part du dernier changement d'étape ou de la fin du
// dernier RDV décision, le plus récent des deux.
export function mesDecisions(opps, closerName, now = Date.now(), rdvsDecision = []) {
  const S = PIPELINE_VENTE.stages
  const etapes = { [S.rdvDecisionBooke]: 'RDV décision bookée', [S.enDecision]: 'En décision' }
  return (opps ?? [])
    .filter(o => o.pipeline_id === PIPELINE_VENTE.id && !CONTACTS_TEST.has(o.contact_id))
    .map(o => ({ o, rdv: rdvsDecisionDuContact(rdvsDecision, o.contact_id, now) }))
    .filter(({ o, rdv }) => etapes[o.pipeline_stage_id] || (o.pipeline_stage_id === S.rdvPresente && rdv.aVenir))
    .filter(({ o }) => closerFieldMatches(String(champ(o.raw, FIELDS.closer) ?? '').trim(), closerName))
    .map(({ o, rdv }) => {
      const debut = Math.max(ms(o.raw?.lastStageChangeAt ?? o.created_at_ghl) ?? 0, rdv.finDernier ?? 0)
      const heures = debut ? Math.max(0, (now - debut) / HEURE) : 0
      const bookee = rdv.aVenir != null
      const niveau = bookee ? 'ok'
        : heures >= DELAIS.decisionRougeJours * 24 ? 'rouge'
          : heures >= DELAIS.decisionOrangeHeures ? 'orange' : 'ok'
      return {
        ghlId: o.ghl_id,
        contactId: o.contact_id,
        nom: String(o.contact_name ?? '').trim() || 'Sans nom',
        etape: bookee ? 'RDV décision bookée' : etapes[o.pipeline_stage_id],
        decisionBookee: bookee || o.pipeline_stage_id === S.rdvDecisionBooke,
        rdvDecision: rdv.aVenir?.start_time ?? null,
        aRelancer: !bookee,
        valeur: Number(o.monetary_value ?? 0),
        jours: Math.floor(heures / 24),
        heures,
        niveau,
      }
    })
    // À relancer d'abord (les plus anciens en premier), puis les RDV décision par date
    .sort((a, b) => (a.aRelancer === b.aRelancer
      ? (a.aRelancer ? b.heures - a.heures : ms(a.rdvDecision) - ms(b.rdvDecision))
      : (a.aRelancer ? -1 : 1)))
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
