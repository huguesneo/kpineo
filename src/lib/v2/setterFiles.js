// Les 4 files du setter (« Ma journée »), en fonction pure.
// Entrées : lignes du cache Supabase (ghl_opportunities, ghl_appointments).
// Jamais setter_shared_tasks : les files se déduisent de GHL.
import {
  PIPELINE_SETTING, PIPELINE_VENTE, CALENDARS_DECOUVERTE, DELAIS, FIELDS,
  TENTATIVE_PAR_ETAPE, SOURCES_CHAUDES,
} from './salesConfig'

const HEURE = 3_600_000

function champ(raw, fieldId) {
  const f = (raw?.customFields ?? []).find(c => c.id === fieldId || c.key === fieldId || c.fieldKey === fieldId)
  if (!f) return null
  return f.fieldValueString ?? f.fieldValue ?? f.value ?? f.fieldValueNumber ?? f.fieldValueDate ?? null
}

function ms(iso) {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

export function isSourceChaude(source) {
  const s = String(source ?? '')
  return SOURCES_CHAUDES.some(re => re.test(s))
}

// Étape du pipeline setting → tentative à faire (1 à 5), null hors tentatives
export function tentativeDeLEtape(stageId) {
  return TENTATIVE_PAR_ETAPE[stageId] ?? null
}

// Date du dernier changement d'étape (raw GHL), repli sur la création
export function dernierChangementEtape(opp) {
  return opp?.raw?.lastStageChangeAt ?? opp?.raw?.lastStatusChangeAt ?? opp?.created_at_ghl ?? null
}

const ACTIFS = new Set(['new', 'confirmed'])

// Index utiles : prochain RDV actif par contact, carte Vente par contact
function indexer(opps, appts, now) {
  const prochainRdv = new Map()
  for (const a of appts ?? []) {
    if (!a?.contact_id || !ACTIFS.has(a.status)) continue
    const t = ms(a.start_time)
    if (t == null || t < now) continue
    const cur = prochainRdv.get(a.contact_id)
    if (!cur || t < ms(cur.start_time)) prochainRdv.set(a.contact_id, a)
  }
  const venteParContact = new Map()
  for (const o of opps ?? []) {
    if (o?.pipeline_id !== PIPELINE_VENTE.id || !o.contact_id) continue
    const cur = venteParContact.get(o.contact_id)
    // La carte la plus récente gagne
    if (!cur || (ms(o.created_at_ghl) ?? 0) > (ms(cur.created_at_ghl) ?? 0)) venteParContact.set(o.contact_id, o)
  }
  return { prochainRdv, venteParContact }
}

function nomCloseur({ venteOpp, rdv, userNames }) {
  const champCloseur = venteOpp ? String(champ(venteOpp.raw, FIELDS.closer) ?? '').trim() : ''
  if (champCloseur) return champCloseur
  const uid = rdv?.assigned_user_id
  return (uid && userNames?.[uid]) || null
}

// Carte lead commune aux 4 files
export function carteLead({ contactId, nom, source, creeLe, stageId = null, opp = null, rdvRef = null }, ctx) {
  const rdv = ctx.prochainRdv.get(contactId) ?? null
  const venteOpp = ctx.venteParContact.get(contactId) ?? null
  const setterOpp = opp
  return {
    key: `${contactId}:${rdvRef?.ghl_id ?? setterOpp?.ghl_id ?? ''}`,
    contactId,
    opportunityId: setterOpp?.ghl_id ?? null,
    nom: String(nom ?? '').trim() || 'Sans nom',
    source: source || null,
    sourceChaude: isSourceChaude(source),
    creeLe: creeLe ?? null,
    ageHeures: creeLe ? Math.max(0, Math.floor((ctx.now - ms(creeLe)) / HEURE)) : null,
    tentative: stageId ? tentativeDeLEtape(stageId) : null,
    etape: setterOpp?.stage_name ?? null,
    prochainRdv: rdv ? { start: rdv.start_time, status: rdv.status, calendarId: rdv.calendar_id } : null,
    rdvRef: rdvRef ? { ghlId: rdvRef.ghl_id, start: rdvRef.start_time, status: rdvRef.status } : null,
    closeur: nomCloseur({ venteOpp, rdv: rdvRef ?? rdv, userNames: ctx.userNames }),
    changementEtape: setterOpp ? dernierChangementEtape(setterOpp) : null,
  }
}

// opps  : cartes des pipelines setting et Vente
// appts : RDV (au moins les 72 dernières heures et les 24 prochaines)
// userNames : { ghl_user_id: 'Prénom' } pour nommer le closeur d'un RDV
export function computeSetterFiles({ opps = [], appts = [], now = Date.now(), userNames = {} } = {}) {
  const idx = indexer(opps, appts, now)
  const ctx = { ...idx, now, userNames }
  const S = PIPELINE_SETTING.stages
  const decouverte = new Set(CALENDARS_DECOUVERTE)
  const settingParContact = new Map(
    opps.filter(o => o.pipeline_id === PIPELINE_SETTING.id && o.contact_id).map(o => [o.contact_id, o]),
  )

  // ── À rebooker : no-show / annulé des 72 dernières heures, pas encore rebooké
  const depuis = now - DELAIS.rebookerHeures * HEURE
  const vusRebook = new Set()
  const aRebooker = appts
    .filter(a => decouverte.has(a.calendar_id) && (a.status === 'noshow' || a.status === 'cancelled'))
    .filter(a => { const t = ms(a.start_time); return t != null && t >= depuis && t <= now })
    .filter(a => a.contact_id && !idx.prochainRdv.has(a.contact_id))
    .sort((a, b) => ms(b.start_time) - ms(a.start_time))
    .filter(a => (vusRebook.has(a.contact_id) ? false : (vusRebook.add(a.contact_id), true)))
    .map(a => {
      const o = settingParContact.get(a.contact_id)
      return carteLead({
        contactId: a.contact_id, nom: a.contact_name || o?.contact_name, source: o?.source,
        creeLe: o?.created_at_ghl, opp: o ?? null, rdvRef: a,
      }, ctx)
    })

  // ── À confirmer : RDV découverte dans les 24 prochaines heures, carte Vente en « RDV booké »
  const jusqua = now + DELAIS.confirmerHeures * HEURE
  const aConfirmer = appts
    .filter(a => decouverte.has(a.calendar_id) && ACTIFS.has(a.status) && a.contact_id)
    .filter(a => { const t = ms(a.start_time); return t != null && t > now && t <= jusqua })
    .filter(a => {
      const vente = idx.venteParContact.get(a.contact_id)
      return !vente || vente.pipeline_stage_id === PIPELINE_VENTE.stages.rdvBooke
    })
    .sort((a, b) => ms(a.start_time) - ms(b.start_time))
    .map(a => {
      const o = settingParContact.get(a.contact_id)
      return carteLead({
        contactId: a.contact_id, nom: a.contact_name || o?.contact_name, source: o?.source,
        creeLe: o?.created_at_ghl, opp: o ?? null, rdvRef: a,
      }, ctx)
    })

  // ── À appeler : nouveau lead et tentatives 1 à 4
  const etapesAppel = new Set([S.nouveau, S.tentative1, S.tentative2, S.tentative3, S.tentative4])
  const aAppeler = opps
    .filter(o => o.pipeline_id === PIPELINE_SETTING.id && etapesAppel.has(o.pipeline_stage_id) && o.contact_id)
    .sort((a, b) => {
      const chaud = Number(isSourceChaude(b.source)) - Number(isSourceChaude(a.source))
      if (chaud !== 0) return chaud
      return (ms(a.created_at_ghl) ?? 0) - (ms(b.created_at_ghl) ?? 0)
    })
    .map(o => carteLead({
      contactId: o.contact_id, nom: o.contact_name, source: o.source,
      creeLe: o.created_at_ghl, stageId: o.pipeline_stage_id, opp: o,
    }, ctx))

  // ── Chaud à relancer : chaud à relancer et contact établi
  const etapesChaud = new Set([S.chaudRelancer, S.contactEtabli])
  const chaudARelancer = opps
    .filter(o => o.pipeline_id === PIPELINE_SETTING.id && etapesChaud.has(o.pipeline_stage_id) && o.contact_id)
    .sort((a, b) => (ms(dernierChangementEtape(a)) ?? 0) - (ms(dernierChangementEtape(b)) ?? 0))
    .map(o => carteLead({
      contactId: o.contact_id, nom: o.contact_name, source: o.source,
      creeLe: o.created_at_ghl, opp: o,
    }, ctx))

  return { aRebooker, aConfirmer, aAppeler, chaudARelancer }
}

// Jour calendaire à Montréal d'un instant ('AAAA-MM-JJ')
export function jourMontreal(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

// RDV découverte créés aujourd'hui (raw.dateAdded) dont la carte du pipeline
// setting porte ce setter dans le champ « setter » (nom complet du profil).
// appts : [{ contact_id, calendar_id, date_added }]
export function rdvBookesAujourdhui({ appts = [], opps = [], setterName, now = Date.now() }) {
  const nom = String(setterName ?? '').trim().toLowerCase()
  if (!nom) return 0
  const jour = jourMontreal(new Date(now))
  const decouverte = new Set(CALENDARS_DECOUVERTE)
  const contactsDuSetter = new Set(
    opps
      .filter(o => o.pipeline_id === PIPELINE_SETTING.id)
      .filter(o => String(champ(o.raw, FIELDS.setterNom) ?? '').trim().toLowerCase() === nom)
      .map(o => o.contact_id),
  )
  const vus = new Set()
  for (const a of appts) {
    if (!decouverte.has(a.calendar_id) || !a.date_added || !contactsDuSetter.has(a.contact_id)) continue
    const d = new Date(a.date_added)
    if (Number.isNaN(d.getTime()) || jourMontreal(d) !== jour) continue
    vus.add(a.ghl_id ?? `${a.contact_id}:${a.date_added}`)
  }
  return vus.size
}

// Total des éléments en attente dans les files (compteur du commutateur)
export function totalFiles(files) {
  return (files?.aRebooker?.length ?? 0) + (files?.aConfirmer?.length ?? 0)
    + (files?.aAppeler?.length ?? 0) + (files?.chaudARelancer?.length ?? 0)
}
