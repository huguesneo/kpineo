import { describe, it, expect } from 'vitest'
import { decouperPeriode, extraireCreneaux, grouperParJour, creneauLibre, jourDe } from './creneaux'
import { EVALUATION } from './salesConfig'

const J = 86_400_000

describe('créneaux GHL', () => {
  it('découpe 30 jours en morceaux de 25 jours au plus', () => {
    const m = decouperPeriode(0, 30 * J)
    expect(m).toEqual([[0, 25 * J], [25 * J, 30 * J]])
    expect(decouperPeriode(0, 10 * J)).toEqual([[0, 10 * J]])
  })

  it('lit la réponse free-slots en ignorant les clés qui ne sont pas des jours', () => {
    const r = { '2026-10-05': { slots: ['2026-10-05T09:30:00-04:00'] }, '2026-10-06': { slots: ['a', 'b'] }, traceId: 'x' }
    expect(extraireCreneaux(r)).toEqual(['2026-10-05T09:30:00-04:00', 'a', 'b'])
  })

  it('regroupe par jour de Montréal, retire le passé et les doublons', () => {
    const now = new Date('2026-10-05T12:00:00Z').getTime() // 8 h à Montréal
    const jours = grouperParJour([
      '2026-10-05T09:30:00-04:00',          // passé ? non : 13 h 30 UTC > 12 h UTC
      '2026-10-05T13:30:00Z',               // même instant, autre écriture
      '2026-10-05T07:00:00-04:00',          // passé
      '2026-10-06T03:30:00Z',               // 23 h 30 le 5 à Montréal
      '2026-10-07T10:00:00-04:00',
      'pas une date',
    ], now)
    expect(jours.map(j => [j.jour, j.creneaux.length])).toEqual([['2026-10-05', 2], ['2026-10-07', 1]])
    expect(jourDe('2026-10-06T03:30:00Z')).toBe('2026-10-05')
  })

  it('creneauLibre compare les instants', () => {
    const jours = [{ jour: '2026-10-05', creneaux: ['2026-10-05T13:30:00.000Z'] }]
    expect(creneauLibre(jours, '2026-10-05T09:30:00-04:00')).toBe(true)
    expect(creneauLibre(jours, '2026-10-05T10:00:00-04:00')).toBe(false)
  })

  it('configuration des évaluations', () => {
    expect(EVALUATION.types.map(t => t.cle)).toEqual(['clinique', 'ligne', 'ouverture'])
    expect(EVALUATION.membres).toHaveLength(5)
  })
})

describe('copie serveur', () => {
  it('supabase/functions/ghl-eval-book/creneaux.js est identique à src/lib/v2/creneaux.js', async () => {
    const { readFileSync } = await import('node:fs')
    const a = readFileSync(new URL('./creneaux.js', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../../supabase/functions/ghl-eval-book/creneaux.js', import.meta.url), 'utf8')
    expect(b).toBe(a)
  })
})

describe('calendrier mensuel', () => {
  it('grille d’octobre 2026 : commence un jeudi, 5 semaines', async () => {
    const { grilleMois } = await import('./creneaux')
    const g = grilleMois('2026-10')
    expect(g).toHaveLength(5)
    expect(g[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(g[4].filter(Boolean).at(-1)).toBe('2026-10-31')
    expect(g.every(s => s.length === 7)).toBe(true)
  })

  it('mois suivant / précédent, y compris changement d’année', async () => {
    const { moisSuivant } = await import('./creneaux')
    expect(moisSuivant('2026-12', 1)).toBe('2027-01')
    expect(moisSuivant('2026-01', -1)).toBe('2025-12')
  })

  it('bornes du mois : jamais avant maintenant, débordent d’un jour', async () => {
    const { bornesMois } = await import('./creneaux')
    const now = Date.UTC(2026, 9, 15)
    expect(bornesMois('2026-10', now)).toEqual([now, Date.UTC(2026, 10, 1) + J])
    expect(bornesMois('2026-11', now)).toEqual([Date.UTC(2026, 10, 1) - J, Date.UTC(2026, 11, 1) + J])
  })

  it('joursDuMois retire les jours voisins', async () => {
    const { joursDuMois } = await import('./creneaux')
    const jours = [{ jour: '2026-09-30', creneaux: [] }, { jour: '2026-10-01', creneaux: [] }, { jour: '2026-11-01', creneaux: [] }]
    expect(joursDuMois(jours, '2026-10').map(j => j.jour)).toEqual(['2026-10-01'])
  })
})
