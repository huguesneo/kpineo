import { describe, it, expect } from 'vitest'
import { fmtHeure, fmtRdvRelatif, fmtRdvAvecHeure, fmtAge, fmtDuree, fmtCAD, styleSource } from './format'

// 22 sept. 2026 11 h 00 à Montréal (UTC-4)
const NOW = new Date('2026-09-22T15:00:00Z').getTime()

describe('format v2', () => {
  it('fmtHeure en heure de Montréal', () => {
    expect(fmtHeure('2026-09-22T17:00:00Z')).toBe('13 h 00')
    expect(fmtHeure(null)).toBe('—')
  })
  it('fmtRdvRelatif', () => {
    expect(fmtRdvRelatif('2026-09-22T17:00:00Z', NOW)).toBe('Auj. 13 h 00')
    expect(fmtRdvRelatif('2026-09-23T13:30:00Z', NOW)).toBe('Demain 9 h 30')
    expect(fmtRdvRelatif('2026-09-21T19:00:00Z', NOW)).toBe('Hier 15 h')
  })
  it('fmtRdvAvecHeure : l’heure aussi au-delà de 6 jours', () => {
    expect(fmtRdvAvecHeure('2026-09-22T19:30:00Z', NOW)).toBe('Auj. 15 h 30')
    expect(fmtRdvAvecHeure('2026-10-01T19:30:00Z', NOW).replace(/\s/g, ' ')).toMatch(/1 oct\. 15 h 30$/)
    expect(fmtRdvAvecHeure(null, NOW)).toBe('—')
  })
  it('fmtAge et fmtDuree', () => {
    expect(fmtAge(2)).toBe('2 h')
    expect(fmtAge(50)).toBe('2 j')
    expect(fmtDuree(128 * 60_000)).toBe('2 h 08')
    expect(fmtDuree(45 * 60_000)).toBe('45 min')
  })
  it('fmtCAD et styleSource', () => {
    expect(fmtCAD(1285).replace(/\s/g, ' ')).toBe('1 285 $')
    expect(styleSource('Optin VS').color).toBe('#b45309')
    expect(styleSource('Quiz').color).toBe('#00897f')
    expect(styleSource('Groupe Facebook').color).toBe('#4b5563')
  })
})
