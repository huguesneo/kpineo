import { describe, it, expect } from 'vitest'
import { repartitionObjections, precisionsAutre } from './objections.js'

const rapport = (closer, date, rows) => ({ report_date: date, user_id: closer, profiles: { full_name: closer }, data: { rows } })
const ligne = (o, extra = {}) => ({ contact_name: 'X', is_closed: false, objection_principale: o, ...extra })

describe('répartition des objections', () => {
  it('compte par closeur et donne son objection principale', () => {
    const r = repartitionObjections([
      rapport('Vicky NEO', '2026-09-22', [ligne('Prix'), ligne('Prix'), ligne('Temps')]),
      rapport('Pascal NEO', '2026-09-22', [ligne('Conjoint')]),
    ])
    expect(r.total).toBe(4)
    expect(r.parObjection).toEqual({ Prix: 2, Temps: 1, Conjoint: 1, Autre: 0 })
    expect(r.parCloser[0]).toMatchObject({ closer: 'Vicky NEO', total: 3, principale: 'Prix' })
    expect(r.parCloser[1]).toMatchObject({ closer: 'Pascal NEO', total: 1, principale: 'Conjoint' })
  })

  it('ignore les ventes', () => {
    const r = repartitionObjections([
      rapport('Vicky NEO', '2026-09-22', [{ is_closed: true, objection_principale: 'Prix' }, ligne('Temps')]),
    ])
    expect(r.total).toBe(1)
    expect(r.parObjection.Prix).toBe(0)
  })

  it('compte à part les lignes sans objection (saisies avant le champ)', () => {
    const r = repartitionObjections([
      rapport('Vicky NEO', '2026-09-20', [ligne(''), ligne('Prix')]),
    ])
    expect([r.total, r.sansObjection]).toEqual([1, 1])
    expect(r.parCloser[0].sansObjection).toBe(1)
  })

  it('remonte les précisions du choix « Autre »', () => {
    const p = precisionsAutre([
      rapport('Vicky NEO', '2026-09-22', [ligne('Autre', { contact_name: 'Marie', objection_reason: 'déménagement' }), ligne('Prix')]),
    ])
    expect(p).toEqual([{ date: '2026-09-22', contact: 'Marie', precision: 'déménagement' }])
  })

  it('sans rapport : tout à zéro', () => {
    expect(repartitionObjections([])).toEqual({ parCloser: [], total: 0, parObjection: { Prix: 0, Temps: 0, Conjoint: 0, Autre: 0 }, sansObjection: 0 })
  })
})
