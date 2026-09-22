import { describe, it, expect } from 'vitest'
import { computeSetterFiles, isSourceChaude, tentativeDeLEtape } from './setterFiles'
import { PIPELINE_SETTING, PIPELINE_VENTE, CALENDARS, FIELDS } from './salesConfig'

const NOW = new Date('2026-09-22T15:00:00Z').getTime()
const h = n => new Date(NOW + n * 3_600_000).toISOString()
const S = PIPELINE_SETTING.stages

function oppSetting(id, stage, extra = {}) {
  return { ghl_id: `o-${id}`, contact_id: id, contact_name: `Lead ${id}`, pipeline_id: PIPELINE_SETTING.id,
    pipeline_stage_id: stage, source: '', created_at_ghl: h(-100), raw: {}, ...extra }
}
function appt(id, contact, start, status, cal = CALENDARS.decouvertePublic, extra = {}) {
  return { ghl_id: id, contact_id: contact, contact_name: `RDV ${contact}`, start_time: start, status, calendar_id: cal, ...extra }
}

describe('computeSetterFiles', () => {
  it('À appeler : sources chaudes d’abord, puis les plus anciens', () => {
    const opps = [
      oppSetting('a', S.nouveau, { created_at_ghl: h(-10) }),
      oppSetting('b', S.tentative2, { created_at_ghl: h(-50) }),
      oppSetting('c', S.tentative1, { created_at_ghl: h(-5), source: 'Optin VS' }),
      oppSetting('d', S.contactEtabli),
    ]
    const { aAppeler } = computeSetterFiles({ opps, now: NOW })
    expect(aAppeler.map(l => l.contactId)).toEqual(['c', 'b', 'a'])
    expect(aAppeler[0].tentative).toBe(2)
    expect(aAppeler[2].tentative).toBe(1)
  })

  it('Chaud à relancer : chaud et contact établi, le plus ancien changement d’étape en premier', () => {
    const opps = [
      oppSetting('a', S.chaudRelancer, { raw: { lastStageChangeAt: h(-2) } }),
      oppSetting('b', S.contactEtabli, { raw: { lastStageChangeAt: h(-30) } }),
      oppSetting('c', S.rencontreBook),
    ]
    const { chaudARelancer } = computeSetterFiles({ opps, now: NOW })
    expect(chaudARelancer.map(l => l.contactId)).toEqual(['b', 'a'])
  })

  it('À rebooker : no-show et annulés des 72 dernières heures, sans RDV déjà repris', () => {
    const appts = [
      appt('r1', 'a', h(-5), 'noshow'),
      appt('r2', 'b', h(-80), 'cancelled'),              // trop vieux
      appt('r3', 'c', h(-1), 'cancelled'),
      appt('r4', 'd', h(-3), 'noshow'),
      appt('r5', 'd', h(20), 'confirmed'),                // déjà rebooké
      appt('r6', 'e', h(-2), 'noshow', CALENDARS.decision), // pas un calendrier découverte
    ]
    const { aRebooker } = computeSetterFiles({ appts, now: NOW })
    expect(aRebooker.map(l => l.contactId)).toEqual(['c', 'a'])
  })

  it('À confirmer : RDV des 24 prochaines heures dont la carte Vente est en RDV booké', () => {
    const appts = [
      appt('c1', 'a', h(3), 'confirmed'),
      appt('c2', 'b', h(1), 'new'),
      appt('c3', 'c', h(30), 'confirmed'),   // trop loin
      appt('c4', 'd', h(2), 'confirmed'),    // carte déjà « RDV confirmé »
    ]
    const opps = [
      { ghl_id: 'v-a', contact_id: 'a', pipeline_id: PIPELINE_VENTE.id, pipeline_stage_id: PIPELINE_VENTE.stages.rdvBooke,
        raw: { customFields: [{ id: FIELDS.closer, fieldValueString: 'Pascal NEO' }] } },
      { ghl_id: 'v-d', contact_id: 'd', pipeline_id: PIPELINE_VENTE.id, pipeline_stage_id: PIPELINE_VENTE.stages.rdvConfirme, raw: {} },
    ]
    const { aConfirmer } = computeSetterFiles({ opps, appts, now: NOW, userNames: {} })
    expect(aConfirmer.map(l => l.contactId)).toEqual(['b', 'a'])
    expect(aConfirmer[1].closeur).toBe('Pascal NEO')
  })

  it('Closeur : repli sur l’utilisateur assigné au RDV', () => {
    const appts = [appt('c1', 'a', h(3), 'confirmed', CALENDARS.decouverteCloseurs, { assigned_user_id: 'u1' })]
    const { aConfirmer } = computeSetterFiles({ appts, now: NOW, userNames: { u1: 'Vicky NEO' } })
    expect(aConfirmer[0].closeur).toBe('Vicky NEO')
  })
})

describe('helpers', () => {
  it('isSourceChaude', () => {
    expect(isSourceChaude('Optin VS')).toBe(true)
    expect(isSourceChaude('VSL avril')).toBe(true)
    expect(isSourceChaude('Quiz métabolique')).toBe(true)
    expect(isSourceChaude('Groupe Facebook')).toBe(false)
    expect(isSourceChaude(null)).toBe(false)
  })
  it('tentativeDeLEtape', () => {
    expect(tentativeDeLEtape(S.nouveau)).toBe(1)
    expect(tentativeDeLEtape(S.tentative4)).toBe(5)
    expect(tentativeDeLEtape(S.contactEtabli)).toBe(null)
  })
})

describe('rdvBookesAujourdhui', () => {
  it('compte les RDV découverte créés aujourd’hui (Montréal) pour les cartes du setter', async () => {
    const { rdvBookesAujourdhui } = await import('./setterFiles')
    const setterField = nom => ({ customFields: [{ id: FIELDS.setterNom, fieldValueString: nom }] })
    const opps = [
      oppSetting('a', S.rencontreBook, { raw: setterField('Kassy NEO') }),
      oppSetting('b', S.rencontreBook, { raw: setterField('Maude NEO') }),
      oppSetting('c', S.rencontreBook, { raw: setterField('kassy neo ') }),
    ]
    const appts = [
      appt('x1', 'a', h(20), 'confirmed', CALENDARS.decouvertePublic, { date_added: h(-1) }),
      appt('x2', 'b', h(20), 'confirmed', CALENDARS.decouvertePublic, { date_added: h(-1) }),  // autre setter
      appt('x3', 'c', h(20), 'confirmed', CALENDARS.decouvertePublic, { date_added: h(-30) }), // hier
      appt('x4', 'c', h(5), 'new', CALENDARS.decision, { date_added: h(-1) }),                // pas découverte
    ]
    expect(rdvBookesAujourdhui({ appts, opps, setterName: 'Kassy NEO', now: NOW })).toBe(1)
    expect(rdvBookesAujourdhui({ appts, opps, setterName: '', now: NOW })).toBe(0)
  })
})

describe('contacts test', () => {
  it('ne sont jamais dans les files', async () => {
    const { TEST_CONTACT_IDS } = await import('../commissions/config')
    const test = TEST_CONTACT_IDS[0]
    const { aRebooker, aAppeler } = computeSetterFiles({
      opps: [oppSetting(test, S.nouveau), oppSetting('z', S.nouveau)],
      appts: [appt('t1', test, h(-2), 'noshow')],
      now: NOW,
    })
    expect(aAppeler.map(l => l.contactId)).toEqual(['z'])
    expect(aRebooker).toEqual([])
  })
})
