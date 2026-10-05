import { describe, it, expect } from 'vitest'
import { refusDroits, refusRdv, texteNote, fmtDateHeure, prenomDe, closerCorrespond, resumerAppels, tagsDeLAction, CALENDARS_DECOUVERTE } from './confirmation'

const NOW = new Date('2026-10-05T15:00:00Z').getTime()
const rdv = (extra = {}) => ({
  ghl_id: 'r1', calendar_id: CALENDARS_DECOUVERTE[0], contact_id: 'c1',
  start_time: '2026-10-07T14:45:00Z', status: 'confirmed', assigned_user_id: 'uPascal', ...extra,
})

describe('refusDroits', () => {
  it('setter, admin, resp_vente : toute rencontre', () => {
    expect(refusDroits({ role: 'setter' }, rdv())).toBe(null)
    expect(refusDroits({ role: 'admin' }, rdv())).toBe(null)
    expect(refusDroits({ role: 'naturo', secondary_roles: ['resp_vente'] }, rdv())).toBe(null)
    expect(refusDroits({ role: 'closer', secondary_roles: ['setter'] }, rdv({ assigned_user_id: 'autre' }))).toBe(null)
  })
  it('closeur : seulement ses RDV (assigné ou carte Vente à son nom)', () => {
    const pascal = { role: 'closer', full_name: 'Pascal Tremblay', ghl_user_id: 'uPascal' }
    expect(refusDroits(pascal, rdv())).toBe(null)
    expect(refusDroits(pascal, rdv({ assigned_user_id: 'uVicky' }), 'Pascal NEO')).toBe(null)
    expect(refusDroits(pascal, rdv({ assigned_user_id: 'uVicky' }), 'Vicky NEO')).toMatch(/pas à ton agenda/)
    expect(refusDroits({ ...pascal, ghl_user_id: null }, rdv({ assigned_user_id: '' }))).toMatch(/pas à ton agenda/)
  })
  it('autres rôles et profil absent : refus', () => {
    expect(refusDroits({ role: 'naturo' }, rdv())).toMatch(/Seuls les setters/)
    expect(refusDroits(null, rdv())).toMatch(/Seuls les setters/)
  })
})

describe('refusRdv', () => {
  it('rencontre découverte à venir et active : permis', () => {
    expect(refusRdv(rdv(), NOW)).toBe(null)
    expect(refusRdv(rdv({ status: 'new' }), NOW)).toBe(null)
  })
  it('refus : absent, sans contact, autre calendrier, annulé ou statué, passé', () => {
    expect(refusRdv(null, NOW)).toMatch(/introuvable/)
    expect(refusRdv(rdv({ contact_id: '' }), NOW)).toMatch(/sans contact/)
    expect(refusRdv(rdv({ calendar_id: 'BQK4NoyrVNuJA3e1VHDH' }), NOW)).toMatch(/découverte/)
    expect(refusRdv(rdv({ status: 'cancelled' }), NOW)).toMatch(/annulé/)
    expect(refusRdv(rdv({ status: 'showed' }), NOW)).toMatch(/annulé/)
    expect(refusRdv(rdv({ start_time: '2026-10-05T14:59:00Z' }), NOW)).toMatch(/passé/)
  })
})

describe('note GHL', () => {
  it('date et heure de Montréal', () => {
    expect(fmtDateHeure('2026-10-07T14:45:00Z')).toBe('7 oct. 2026 à 10 h 45')
    expect(fmtDateHeure('2026-10-05T04:05:00Z')).toBe('5 oct. 2026 à 0 h 05')
  })
  it('prénom propre', () => {
    expect(prenomDe('maude NEO')).toBe('Maude')
    expect(prenomDe('marie-michèle cardinal')).toBe('Marie-Michèle')
    expect(prenomDe('')).toBe('quelqu’un')
  })
  it('confirmer et retirer : qui, quand, quelle rencontre', () => {
    expect(texteNote('confirmer', 'Maude NEO', '2026-10-07T14:45:00Z', NOW))
      .toBe('✅ Rencontre découverte du 7 oct. 2026 à 10 h 45 confirmée manuellement depuis le hub par Maude, le 5 oct. 2026 à 11 h 00.')
    expect(texteNote('annuler', 'Pascal Tremblay', '2026-10-07T14:45:00Z', NOW))
      .toBe('↩️ Confirmation de la rencontre découverte du 7 oct. 2026 à 10 h 45 retirée depuis le hub par Pascal, le 5 oct. 2026 à 11 h 00.')
  })
  it('closerCorrespond : suffixe NEO et prénom', () => {
    expect(closerCorrespond('Pascal NEO', 'Pascal Tremblay')).toBe(true)
    expect(closerCorrespond('Vicky NEO', 'Pascal Tremblay')).toBe(false)
    expect(closerCorrespond('', 'Pascal')).toBe(false)
  })
})

describe('resumerAppels', () => {
  it('garde les appels des contacts voulus, du plus récent au plus ancien', () => {
    const messages = [
      { contactId: 'a', messageType: 'TYPE_CALL', direction: 'outbound', status: 'completed', dateAdded: '2026-10-04T20:00:00Z', meta: { call: { duration: 55, status: 'completed' } } },
      { contactId: 'a', messageType: 'TYPE_CALL', direction: 'outbound', status: 'no-answer', dateAdded: '2026-10-04T21:00:00Z', meta: { call: { status: 'no-answer' } } },
      { contactId: 'b', messageType: 'TYPE_CALL', direction: 'inbound', status: 'completed', dateAdded: '2026-10-03T10:00:00Z', meta: { call: { duration: 12, status: 'completed' } } },
      { contactId: 'z', messageType: 'TYPE_CALL', direction: 'outbound', dateAdded: '2026-10-03T10:00:00Z' },
      { contactId: 'a', messageType: 'TYPE_SMS', direction: 'outbound', dateAdded: '2026-10-04T22:00:00Z' },
    ]
    expect(resumerAppels(messages, ['a', 'b'])).toEqual({
      a: [
        { date: '2026-10-04T21:00:00.000Z', statut: 'no-answer', duree: null, sortant: true },
        { date: '2026-10-04T20:00:00.000Z', statut: 'completed', duree: 55, sortant: true },
      ],
      b: [{ date: '2026-10-03T10:00:00.000Z', statut: 'completed', duree: 12, sortant: false }],
    })
  })
})

describe('tagsDeLAction', () => {
  it('confirmer : confirme-manuel seulement, jamais statut-confirme (LEAD-21b le pose)', () => {
    expect(tagsDeLAction('confirmer')).toEqual({ retirer: [], poser: ['confirme-manuel'] })
  })
  it('annuler : retire confirme-manuel et statut-confirme, pose app-confirmation-retiree', () => {
    expect(tagsDeLAction('annuler')).toEqual({
      retirer: ['confirme-manuel', 'statut-confirme'], poser: ['app-confirmation-retiree'],
    })
  })
})
