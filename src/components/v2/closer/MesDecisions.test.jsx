// Cartes de « Mes décisions », rendues côté serveur (pas de DOM dans les tests du hub).
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MesDecisions from './MesDecisions'

const NOW = new Date('2026-10-07T15:00:00Z').getTime()
const carte = extra => ({
  ghlId: 'o1', contactId: 'c1', nom: 'Sonia Poirier', etape: 'En décision', decisionBookee: false,
  rdvDecision: null, aRelancer: true, valeur: 0, jours: 6, heures: 144, niveau: 'orange', ...extra,
})

describe('MesDecisions', () => {
  it('RDV décision à venir : date et heure, pas de bouton Relancé', () => {
    const html = renderToStaticMarkup(<MesDecisions now={NOW} decisions={[carte({
      etape: 'RDV décision bookée', decisionBookee: true, rdvDecision: '2026-10-07T19:30:00Z', aRelancer: false, niveau: 'ok',
    })]} />)
    expect(html).toContain('RDV décision bookée')
    expect(html).toContain('Auj. 15 h 30')
    expect(html).not.toContain('Relancé')
    expect(html).not.toContain('6 j')
  })

  it('sans RDV décision : pastille de jours et bouton Relancé', () => {
    const html = renderToStaticMarkup(<MesDecisions now={NOW} decisions={[carte()]} />)
    expect(html).toContain('En décision')
    expect(html).toContain('6 j')
    expect(html).toContain('Relancé')
  })
})
