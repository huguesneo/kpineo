import { describe, it, expect } from 'vitest'
import { finRendezVous, showPermis, heureShowPermis } from './showHoraire.js'

const t = (h, m = 0) => new Date(`2026-09-29T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`).getTime()
const appt = { start_time: '2026-09-29T18:15:00-04:00', end_time: '2026-09-29T19:00:00-04:00' }

describe('show manuel : pas avant la fin prévue', () => {
  it('avant la fin : non', () => {
    expect(showPermis(appt, t(17, 43))).toBe(false)  // cas de Virginie Hamel
    expect(showPermis(appt, t(18, 59))).toBe(false)
  })

  it('à partir de la fin : oui', () => {
    expect(showPermis(appt, t(19, 0))).toBe(true)
    expect(showPermis(appt, t(21, 0))).toBe(true)
  })

  it('sans heure de fin : durée GHL, sinon une heure', () => {
    expect(finRendezVous({ start_time: appt.start_time, raw: { duration: 45 } })).toBe(t(19, 0))
    expect(finRendezVous({ start_time: appt.start_time })).toBe(t(19, 15))
  })

  it('sans aucune heure : on ne bloque pas', () => {
    expect(showPermis({}, t(12, 0))).toBe(true)
  })

  it('heure affichée au closeur', () => {
    expect(heureShowPermis({ ...appt, end_time: new Date(t(19, 0)).toISOString() })).toBe(new Date(t(19, 0)).toTimeString().slice(0, 5))
  })
})

import { champsFiche, ficheRemplie } from './showHoraire.js'

describe('fiche de qualification', () => {
  const q = (n) => Object.fromEntries(['reference', 'source', 'objectif', 'pourquoi', 'depuis', 'deja_essaye', 'problematique', 'solution', 'note'].slice(0, n).map(k => [k, 'x']))

  it('6 champs remplis : oui ; 5 : non', () => {
    expect(ficheRemplie(q(6))).toBe(true)
    expect(ficheRemplie(q(5))).toBe(false)
  })

  it('les champs vides ou blancs ne comptent pas', () => {
    expect(champsFiche({ ...q(5), solution: '   ', autre: 'x' })).toBe(5)
  })

  it('pas de fiche : non', () => {
    expect(ficheRemplie(null)).toBe(false)
  })
})
