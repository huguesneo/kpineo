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
  it('Nouveaux leads : 🔥 chauds en tête, puis nouveaux du plus vieux au plus jeune', () => {
    const opps = [
      oppSetting('a', S.nouveau, { created_at_ghl: h(-10) }),
      oppSetting('b', S.nouveau, { created_at_ghl: h(-50), source: 'Optin VS' }),
      oppSetting('c', S.chaudRelancer, { created_at_ghl: h(-2) }),
      oppSetting('d', S.chaudRelancer, { created_at_ghl: h(-5) }),
      oppSetting('e', S.tentative1),
      oppSetting('f', S.contactEtabli),
    ]
    const { nouveauxLeads } = computeSetterFiles({ opps, now: NOW })
    expect(nouveauxLeads.map(l => [l.contactId, l.chaud])).toEqual([['d', true], ['c', true], ['b', false], ['a', false]])
    expect(nouveauxLeads[2].tentative).toBe(1)
  })

  it('Leads à rappeler : tentatives 1 à 4, du plus vieux au plus jeune', () => {
    const opps = [
      oppSetting('a', S.tentative1, { created_at_ghl: h(-10) }),
      oppSetting('b', S.tentative3, { created_at_ghl: h(-50) }),
      oppSetting('c', S.tentative4, { created_at_ghl: h(-20) }),
      oppSetting('d', S.nouveau),
    ]
    const { aRappeler } = computeSetterFiles({ opps, now: NOW })
    expect(aRappeler.map(l => l.contactId)).toEqual(['b', 'c', 'a'])
  })

  it('Contact établi : file à part, du plus vieux au plus jeune', () => {
    const opps = [
      oppSetting('a', S.contactEtabli, { created_at_ghl: h(-2) }),
      oppSetting('b', S.contactEtabli, { created_at_ghl: h(-30) }),
      oppSetting('c', S.chaudRelancer),
    ]
    const { contactEtabli } = computeSetterFiles({ opps, now: NOW })
    expect(contactEtabli.map(l => l.contactId)).toEqual(['b', 'a'])
  })

  it('totalFiles compte les cinq files', async () => {
    const { totalFiles } = await import('./setterFiles')
    expect(totalFiles({ nouveauxLeads: [1], aRappeler: [1, 2], aRebooker: [1], aConfirmer: [1], contactEtabli: [1, 2, 3] })).toBe(8)
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
    const { aRebooker, nouveauxLeads } = computeSetterFiles({
      opps: [oppSetting(test, S.nouveau), oppSetting('z', S.nouveau)],
      appts: [appt('t1', test, h(-2), 'noshow')],
      now: NOW,
    })
    expect(nouveauxLeads.map(l => l.contactId)).toEqual(['z'])
    expect(aRebooker).toEqual([])
  })
})

describe('tri des files', () => {
  it('âge : plus vieux d’abord par défaut, plus jeune au clic ; chauds toujours en tête', async () => {
    const { trierLeads } = await import('./setterFiles')
    const leads = [
      { key: 'jeune', creeLe: h(-1), tentative: 2 },
      { key: 'vieux', creeLe: h(-100), tentative: 1 },
      { key: 'chaud', creeLe: h(-3), chaud: true },
      { key: 'sansDate', creeLe: null, tentative: 5 },
    ]
    expect(trierLeads(leads).map(l => l.key)).toEqual(['chaud', 'vieux', 'jeune', 'sansDate'])
    expect(trierLeads(leads, { cle: 'age', sens: 'jeune' }).map(l => l.key)).toEqual(['chaud', 'jeune', 'vieux', 'sansDate'])
  })

  it('tentatives : le plus d’abord, puis le moins ; l’âge départage (plus vieux d’abord)', async () => {
    const { trierLeads } = await import('./setterFiles')
    const leads = [
      { key: 't1-jeune', creeLe: h(-1), tentative: 2 },
      { key: 't1-vieux', creeLe: h(-100), tentative: 2 },
      { key: 't3', creeLe: h(-5), tentative: 4 },
      { key: 't0', creeLe: h(-50), tentative: 1 },
    ]
    expect(trierLeads(leads, { cle: 'tentatives', sens: 'plus' }).map(l => l.key)).toEqual(['t3', 't1-vieux', 't1-jeune', 't0'])
    expect(trierLeads(leads, { cle: 'tentatives', sens: 'moins' }).map(l => l.key)).toEqual(['t0', 't1-vieux', 't1-jeune', 't3'])
  })

  it('clics sur les colonnes', async () => {
    const { triSuivant, TRI_DEFAUT } = await import('./setterFiles')
    const a1 = triSuivant(TRI_DEFAUT, 'age')
    expect(a1).toEqual({ cle: 'age', sens: 'jeune' })
    expect(triSuivant(a1, 'age')).toEqual({ cle: 'age', sens: 'vieux' })
    const t1 = triSuivant(TRI_DEFAUT, 'tentatives')
    expect(t1).toEqual({ cle: 'tentatives', sens: 'plus' })
    expect(triSuivant(t1, 'tentatives')).toEqual({ cle: 'tentatives', sens: 'moins' })
    expect(triSuivant(t1, 'age')).toEqual({ cle: 'age', sens: 'vieux' })
  })
})
