import { describe, it, expect } from 'vitest'
import { estAujourdhui, estAStatuer, prochainRdv, listeDuJour, mesDecisions, infosSetting, statutEffectif } from './closerAgenda'
import { PIPELINE_VENTE, PIPELINE_SETTING, FIELDS, CALENDARS } from './salesConfig'

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

  describe('décisions avec RDV décision', () => {
    const S = PIPELINE_VENTE.stages
    const opp = (id, stage, depuisH) => ({
      ghl_id: id, contact_id: `c-${id}`, contact_name: id, pipeline_id: PIPELINE_VENTE.id, pipeline_stage_id: stage,
      raw: { ...champ(FIELDS.closer, 'Pascal NEO'), lastStageChangeAt: h(-depuisH) },
    })
    const rdv = (id, contact, debutH, status = 'confirmed', calendar_id = CALENDARS.decision) =>
      appt(id, h(debutH), status, { contact_id: contact, calendar_id, end_time: h(debutH + 0.25) })
    const pour = (opps, rdvs) => mesDecisions(opps, 'Pascal NEO', NOW, rdvs)

    it('cas Sonia : en décision depuis 6 j, RDV décision plus tard aujourd’hui → bookée, jamais orange', () => {
      const [d] = pour([opp('sonia', S.enDecision, 144)], [rdv('r', 'c-sonia', 4.5)])
      expect(d).toMatchObject({
        etape: 'RDV décision bookée', decisionBookee: true, niveau: 'ok', aRelancer: false, rdvDecision: h(4.5),
      })
    })

    it('RDV décision en cours (commencé, pas terminé) : encore booké', () => {
      expect(pour([opp('a', S.enDecision, 144)], [rdv('r', 'c-a', -0.1)])[0].niveau).toBe('ok')
    })

    it('ignorés : RDV annulé, autre calendrier, RDV terminé, RDV d’un autre contact', () => {
      const cas = [
        rdv('r1', 'c-a', 2, 'cancelled'),
        rdv('r2', 'c-a', 2, 'confirmed', CALENDARS.decouvertePublic),
        rdv('r3', 'c-b', 2),
      ]
      const [d] = pour([opp('a', S.enDecision, 100)], cas)
      expect(d).toMatchObject({ etape: 'En décision', niveau: 'orange', aRelancer: true, rdvDecision: null })
    })

    it('deux RDV décision à venir : le plus tôt', () => {
      const [d] = pour([opp('a', S.enDecision, 10)], [rdv('tard', 'c-a', 48), rdv('tot', 'c-a', 3)])
      expect(d.rdvDecision).toBe(h(3))
    })

    it('après le RDV : l’âge part de la fin du dernier RDV décision', () => {
      // Étape changée il y a 10 j, RDV terminé il y a 24 h → ok, puis orange 72 h après, rouge 7 j après
      expect(pour([opp('a', S.enDecision, 240)], [rdv('r', 'c-a', -24.25)])[0]).toMatchObject({ niveau: 'ok', jours: 1, aRelancer: true })
      expect(pour([opp('a', S.enDecision, 240)], [rdv('r', 'c-a', -80)])[0].niveau).toBe('orange')
      expect(pour([opp('a', S.enDecision, 400)], [rdv('r', 'c-a', -200)])[0].niveau).toBe('rouge')
      // Un RDV annulé ne remet pas l'âge à zéro
      expect(pour([opp('a', S.enDecision, 240)], [rdv('r', 'c-a', -24.25, 'cancelled')])[0].niveau).toBe('rouge')
    })

    it('« RDV présentée » avec RDV décision à venir : entre dans Mes décisions', () => {
      const d = pour([opp('p', S.rdvPresente, 30)], [rdv('r', 'c-p', 24)])
      expect(d).toHaveLength(1)
      expect(d[0]).toMatchObject({ etape: 'RDV décision bookée', niveau: 'ok', aRelancer: false })
    })

    it('« RDV présentée » sans RDV décision à venir : dehors', () => {
      expect(pour([opp('p', S.rdvPresente, 30)], [rdv('r', 'c-p', -5)])).toEqual([])
    })

    it('« RDV confirmé » ou « RDV booké » avec RDV décision : dehors', () => {
      expect(pour([opp('c', S.rdvConfirme, 30), opp('b', S.rdvBooke, 30)], [rdv('r1', 'c-c', 24), rdv('r2', 'c-b', 24)])).toEqual([])
    })

    it('tri : à relancer d’abord (plus anciens en premier), puis RDV décision par date', () => {
      const d = pour(
        [opp('rdvTard', S.enDecision, 300), opp('neuf', S.enDecision, 5), opp('vieux', S.enDecision, 100), opp('rdvTot', S.rdvDecisionBooke, 1)],
        [rdv('r1', 'c-rdvTard', 30), rdv('r2', 'c-rdvTot', 2)],
      )
      expect(d.map(x => x.ghlId)).toEqual(['vieux', 'neuf', 'rdvTot', 'rdvTard'])
    })
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
