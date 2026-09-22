// Passage automatique en « show » : un show déclenche la commission du setter,
// donc la règle doit rester stricte.
import { describe, it, expect } from 'vitest'
import { peutPasserEnShowAuto } from './SaleCallScript.jsx'

const debut = '2026-09-22T15:00:00-04:00'
const t = (h, m = 0) => new Date(`2026-09-22T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`).getTime()
const cas = (o = {}) => peutPasserEnShowAuto({ champsRemplis: 6, statut: 'confirmed', debut, maintenant: t(15, 20), ...o })

describe('show automatique', () => {
  it('6 champs remplis pendant l\'appel : oui', () => {
    expect(cas()).toBe(true)
  })

  it('moins de 6 champs : non', () => {
    expect(cas({ champsRemplis: 5 })).toBe(false)
  })

  it('ne passe jamais par-dessus un statut déjà choisi', () => {
    for (const statut of ['noshow', 'cancelled', 'showed', 'attended']) {
      expect(cas({ statut })).toBe(false)
    }
  })

  it('accepte un rendez-vous sans statut ou juste confirmé', () => {
    for (const statut of [null, '', 'new', 'pending', 'confirmed']) {
      expect(cas({ statut })).toBe(true)
    }
  })

  it('trop tôt avant le rendez-vous : non (préparation de l\'appel)', () => {
    expect(cas({ maintenant: t(14, 0) })).toBe(false)
    expect(cas({ maintenant: t(14, 56) })).toBe(true) // 5 min de tolérance
  })

  it('trop tard : non', () => {
    expect(cas({ maintenant: t(22, 30) })).toBe(true)  // 7 h 30 après
    expect(cas({ maintenant: t(23, 30) })).toBe(false) // plus de 8 h après
  })

  it('sans heure de début : non', () => {
    expect(cas({ debut: null })).toBe(false)
  })
})
