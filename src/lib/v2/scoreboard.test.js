import { describe, it, expect } from 'vitest'
import { ventesParCloseur, classement, rythme, banniereSetter, banniereCloseur, prenomCloseur, sommeCash } from './scoreboard'
import { PIPELINE_CLOSER_VENTE } from '../commissions/config'
import { GHL_FIELD_CLOSER, GHL_FIELD_DATE_CLOSE } from '../ghlHelpers'

const vente = (closer, date, stage = '🏆 Gagné') => ({
  stage_name: stage, pipeline_id: PIPELINE_CLOSER_VENTE,
  raw: { customFields: [
    { id: GHL_FIELD_CLOSER, fieldValueString: closer },
    { id: GHL_FIELD_DATE_CLOSE, fieldValueString: date },
  ] },
})

describe('scoreboard', () => {
  it('prenomCloseur', () => {
    expect(prenomCloseur('Brice NEO')).toBe('Brice')
    expect(prenomCloseur('vicky')).toBe('Vicky')
  })

  it('ventes par closeur : gagnées, dans le mois, après la bascule pour le pipeline Vente', () => {
    const r = ventesParCloseur([
      vente('Brice NEO', '2026-09-23'), vente('brice', '2026-09-25'), vente('Vicky NEO', '2026-09-24'),
      vente('Vicky NEO', '2026-10-02'), vente('Vicky NEO', '2026-09-24', '🤔 En décision'),
      vente('Pascal NEO', '2026-09-10'), // pipeline Vente avant la bascule : hors périmètre
    ], '2026-09-01', '2026-09-30')
    expect(r.map(x => [x.nom, x.valeur, x.rang, x.largeur])).toEqual([['Brice', 2, 1, 100], ['Vicky', 1, 2, 50]])
  })

  it('classement ignore les zéros', () => {
    expect(classement([{ nom: 'A', valeur: 0 }, { nom: 'B', valeur: 3 }]).map(x => x.nom)).toEqual(['B'])
  })

  it('rythme', () => {
    const r = rythme({ objectif: 120000, cash: 84250, jour: 22, joursDansMois: 30 })
    expect(r.attendu).toBe(88000)
    expect(r.ecart).toBe(-3750)
    expect(r.pctAtteint).toBe(70)
    expect(r.reste).toBe(35750)
    expect(r.joursRestants).toBe(8)
    expect(rythme({ objectif: null, cash: 1, jour: 1, joursDansMois: 30 })).toBe(null)
  })

  it('bannières', () => {
    expect(banniereSetter({ prenom: 'Brice', showups: 21, objectif: 25, bonusMensuel: 250 }).texte)
      .toBe('Brice, plus que 4 show-ups pour ton boni de 250 $')
    expect(banniereSetter({ prenom: 'Brice', showups: 25, objectif: 25 })).toBe(null)
    expect(banniereSetter({ prenom: 'Brice', showups: 1, objectif: 0 })).toBe(null)
    expect(banniereCloseur({ prenom: 'Vicky', cashTrimestre: 10000, objectifTrimestre: 12500 }).texte.replace(/\s/g, ' '))
      .toBe('Vicky, il te manque 2 500 $ pour ton objectif du trimestre')
  })

  it('sommeCash', () => {
    expect(sommeCash([{ amount: '10.5' }, { amount: 4 }])).toBe(14.5)
  })
})
