import { describe, it, expect } from 'vitest'
import { listPayPeriods } from './payPeriods.js'

describe('périodes de paie (référence 2026-06-06, 14 jours)', () => {
  it('donne la période en cours puis les périodes payées', () => {
    const p = listPayPeriods('2026-06-06', 14, 4, new Date(2026, 8, 22))
    expect(p).toEqual([
      { start: '2026-09-13', end: '2026-09-26' },
      { start: '2026-08-30', end: '2026-09-12' },
      { start: '2026-08-16', end: '2026-08-29' },
      { start: '2026-08-02', end: '2026-08-15' },
    ])
  })
  it('le dernier jour d\'une période reste dans cette période', () => {
    expect(listPayPeriods('2026-06-06', 14, 1, new Date(2026, 8, 26))[0]).toEqual({ start: '2026-09-13', end: '2026-09-26' })
    expect(listPayPeriods('2026-06-06', 14, 1, new Date(2026, 8, 27))[0]).toEqual({ start: '2026-09-27', end: '2026-10-10' })
  })
})
