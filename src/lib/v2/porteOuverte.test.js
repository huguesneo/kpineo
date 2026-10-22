import { describe, it, expect } from 'vitest'
import { PORTE_OUVERTE, EVALUATION, membrePorteOuverte } from './salesConfig'

describe('journée portes ouvertes : accès et configuration', () => {
  it('les quatre naturopathes ont accès (courriel insensible à la casse), pas les closeurs', () => {
    expect(membrePorteOuverte('Thibault@neoperformance.ca')?.nom).toBe('Thibault')
    expect(membrePorteOuverte('jessica@neoperformance.ca')?.userId).toBe('qwjs0d2A8frAz2rguIja')
    expect(membrePorteOuverte('tamara@neoperformance.ca')?.nom).toBe('Tamara')
    expect(membrePorteOuverte('brice@neoperformance.ca')?.nom).toBe('Brice')
    expect(membrePorteOuverte('pascal@neoperformance.ca')).toBeNull()
    expect(membrePorteOuverte(undefined)).toBeNull()
  })

  it('les userId des quatre sont ceux des membres des calendriers d’évaluation', () => {
    const ids = new Set(EVALUATION.membres.map(m => m.userId))
    for (const m of PORTE_OUVERTE.membres) expect(ids.has(m.userId)).toBe(true)
  })

  it('forfaits : noms exacts du formulaire Évaluation porte ouverte ; deux calendriers (en ligne, en clinique)', () => {
    expect(PORTE_OUVERTE.forfaits).toEqual(["Programme d'optimisation métabolique (portes ouvertes)", 'À la carte'])
    expect(PORTE_OUVERTE.types.map(t => [t.cle, t.enLigne, t.duree])).toEqual([['po_ligne', true, 45], ['po_clinique', false, 45]])
  })
})
