// Passage automatique en « show » : un show déclenche la commission du setter,
// donc la règle doit rester stricte.
import { describe, it, expect } from 'vitest'
import { peutPasserEnShowAuto } from './SaleCallScript.jsx'

const debut = '2026-09-22T15:00:00-04:00'
const fin   = '2026-09-22T15:45:00-04:00'
const t = (h, m = 0) => new Date(`2026-09-22T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`).getTime()
const cas = (o = {}) => peutPasserEnShowAuto({ champsRemplis: 6, statut: 'confirmed', debut, fin, maintenant: t(15, 45), ...o })

describe('show automatique', () => {
  it('6 champs remplis à la fin du rendez-vous : oui', () => {
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

  it('pendant le rendez-vous, écran ouvert : pas encore', () => {
    expect(cas({ maintenant: t(15, 20) })).toBe(false)
    expect(cas({ maintenant: t(15, 44) })).toBe(false)
  })

  it('fermeture de l\'écran une fois la rencontre commencée : oui', () => {
    expect(cas({ fermeture: true, maintenant: t(15, 0) })).toBe(true)
    expect(cas({ fermeture: true, maintenant: t(15, 20) })).toBe(true)
  })

  it('fermeture de l\'écran avant le début (préparation) : non', () => {
    expect(cas({ fermeture: true, maintenant: t(14, 59) })).toBe(false)
    expect(cas({ fermeture: true, maintenant: t(14, 30) })).toBe(false)
  })

  it('trop tard : non', () => {
    expect(cas({ maintenant: t(23, 30) })).toBe(true)  // 7 h 45 après la fin
    expect(cas({ maintenant: t(23, 46) })).toBe(false) // plus de 8 h après la fin
    expect(cas({ fermeture: true, maintenant: t(23, 46) })).toBe(false)
  })

  it('sans heure de fin : une heure après le début', () => {
    expect(cas({ fin: null, maintenant: t(15, 59) })).toBe(false)
    expect(cas({ fin: null, maintenant: t(16, 0) })).toBe(true)
  })

  it('sans heure de début : non', () => {
    expect(cas({ debut: null })).toBe(false)
  })
})
