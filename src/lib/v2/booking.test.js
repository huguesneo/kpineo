import { describe, it, expect } from 'vitest'
import { prenomCle, cleBookingSetter, decouperNom, lienPrendreRdv } from './booking'

const SETTERS = [{ key: 'manuel_cloe' }, { key: 'manuel_maude' }, { key: 'manuel_hugues' }]
const BASE = 'https://api.leadconnectorhq.com/widget/booking/ucyJmhYKKDDm7U5JmaJ8'

describe('Prendre un rendez-vous', () => {
  it('clé du setter : prénom sans accent, présent dans la liste du Centre de vente', () => {
    expect(prenomCle('Cloé NEO')).toBe('cloe')
    expect(cleBookingSetter('Cloé NEO', SETTERS)).toBe('manuel_cloe')
    expect(cleBookingSetter('Hugues Pugliese', SETTERS)).toBe('manuel_hugues')
    expect(cleBookingSetter('Kassy NEO', SETTERS)).toBe(null)
  })

  it('découpe le nom du lead', () => {
    expect(decouperNom('Marie-Ève Tremblay Gagnon')).toEqual({ prenom: 'Marie-Ève', nom: 'Tremblay Gagnon' })
    expect(decouperNom('Annie')).toEqual({ prenom: 'Annie', nom: '' })
  })

  it('lien : attribution au setter + lead prérempli, valeurs encodées', () => {
    const url = new URL(lienPrendreRdv({
      base: BASE, cleSetter: 'manuel_maude',
      lead: { nom: 'Julie Côté', email: 'julie+test@exemple.ca', telephone: '+15145551234' },
    }))
    expect(url.origin + url.pathname).toBe(BASE)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      booking_source: 'manuel_maude', first_name: 'Julie', last_name: 'Côté',
      email: 'julie+test@exemple.ca', phone: '+15145551234',
    })
  })

  it('lien sans setter connu ni coordonnées', () => {
    expect(lienPrendreRdv({ base: BASE, cleSetter: null, lead: { nom: 'Sans nom' } })).toBe(BASE)
  })
})
