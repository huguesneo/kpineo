import { describe, it, expect } from 'vitest'
import { estAujourdhui, estAStatuer, prochainRdv, listeDuJour, mesDecisions, infosSetting, statutEffectif } from './closerAgenda'
import { PIPELINE_VENTE, PIPELINE_SETTING, FIELDS } from './salesConfig'

const NOW = new Date('2026-09-22T15:00:00Z').getTime()
const h = n => new Date(NOW + n * 3_600_000).toISOString()
const appt = (id, start, status = 'confirmed', extra = {}) => ({ ghl_id: id, contact_id: `c-${id}`, start_time: start, status, ...extra })
const champ = (id, v) => ({ customFields: [{ id, fieldValueString: v }] })

describe('agenda closeur', () => {
  it('à statuer : passé depuis plus de 2 h, sans statut GHL ni EOD', () => {
    expect(estAStatuer(appt('a', h(-3)), [], NOW)).toBe(true)
    expect(estAStatuer(appt('b', h(-1)), [], NOW)).toBe(false)
    expect(estAStatuer(appt('c', h(-3), 'showed'), [], NOW)).toBe(false)
    expect(estAStatuer(appt('d', h(-3)), [{ ghl_appointment_id: 'd', status: 'noshow' }], NOW)).toBe(false)
  })

  it('statut effectif : le rapport EOD passe avant GHL', () => {
    expect(statutEffectif(appt('a', h(-3), 'confirmed'), [{ ghl_appointment_id: 'a', status: 'show' }])).toBe('show')
    expect(statutEffectif(appt('b', h(-3), 'noshow'), [])).toBe('noshow')
  })

  it('prochain RDV : premier RDV actif pas encore terminé', () => {
    const appts = [appt('x', h(3)), appt('y', h(-0.25)), appt('z', h(1), 'cancelled')]
    expect(prochainRdv(appts, NOW).ghl_id).toBe('y')
    expect(prochainRdv([appt('x', h(-5))], NOW)).toBe(null)
  })

  it('liste du jour : épingle les RDV à statuer', () => {
    const { epingles, lignes } = listeDuJour([appt('a', h(-4)), appt('b', h(2)), appt('c', h(-5), 'showed')], [], NOW)
    expect(epingles.map(l => l.appt.ghl_id)).toEqual(['a'])
    expect(lignes.map(l => [l.appt.ghl_id, l.etat])).toEqual([['c', 'show'], ['b', 'prochain']])
  })

  it('décisions : filtre par closeur, orange après 72 h, rouge après 7 jours', () => {
    const S = PIPELINE_VENTE.stages
    const opp = (id, stage, closer, depuisH) => ({
      ghl_id: id, contact_id: `c-${id}`, contact_name: id, pipeline_id: PIPELINE_VENTE.id, pipeline_stage_id: stage,
      raw: { ...champ(FIELDS.closer, closer), lastStageChangeAt: h(-depuisH) },
    })
    const d = mesDecisions([
      opp('a', S.enDecision, 'Pascal NEO', 10),
      opp('b', S.rdvDecisionBooke, 'pascal', 80),
      opp('c', S.enDecision, 'Pascal NEO', 200),
      opp('d', S.enDecision, 'Vicky NEO', 200),
      opp('e', S.gagne, 'Pascal NEO', 200),
    ], 'Pascal NEO', NOW)
    expect(d.map(x => [x.ghlId, x.niveau])).toEqual([['c', 'rouge'], ['b', 'orange'], ['a', 'ok']])
    expect(d[0].jours).toBe(8)
  })

  it('infos setting : setter et source de la carte setting', () => {
    const opps = [{ pipeline_id: PIPELINE_SETTING.id, contact_id: 'x', source: 'Optin VS', raw: champ(FIELDS.setterNom, 'Kassy NEO') }]
    expect(infosSetting(opps, 'x')).toEqual({ setter: 'Kassy NEO', source: 'Optin VS' })
    expect(infosSetting(opps, 'y')).toEqual({ setter: null, source: null })
  })
})

describe('estAujourdhui', () => {
  it('compare le jour à Montréal, pas l’écart en heures', () => {
    // NOW = 22 sept. 11 h à Montréal
    expect(estAujourdhui('2026-09-22T21:00:00Z', NOW)).toBe(true)   // 17 h le jour même
    expect(estAujourdhui('2026-09-23T13:30:00Z', NOW)).toBe(false)  // demain 9 h 30, à moins de 24 h
    expect(estAujourdhui('2026-09-23T03:30:00Z', NOW)).toBe(true)   // 23 h 30 le soir même (UTC du lendemain)
    expect(estAujourdhui(null, NOW)).toBe(false)
  })
})
