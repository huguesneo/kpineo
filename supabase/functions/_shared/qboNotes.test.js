import { describe, expect, it } from 'vitest'
import { customerNotes, dateCourte, rabais } from './qboNotes.js'

const plan = { product_name: 'Forfait 15 semaines NEO - 1 paiement', installments_count: 1, discount_type: 'percent', discount_value: 0 }

describe('customerNotes', () => {
  it('reprend le gabarit de la capture', () => {
    expect(customerNotes(plan, { therapist: 'Jessica', closer: 'Vicky', setter: 'Vicky' }, '2026-10-19T14:00:00-04:00'))
      .toBe("Jessica - 1 paiement,  Programme d'optimisation métabolique (19 oct 2026)\nCloser: Vicky\nSetter : Vicky")
  })
  it('ajoute le rabais entre le programme et la date', () => {
    expect(customerNotes({ ...plan, installments_count: 3, discount_value: 10 }, { therapist: 'Brice', closer: 'Maude' }, '2026-10-19T14:00:00-04:00'))
      .toBe("Brice - 3 paiements,  Programme d'optimisation métabolique, 10% de rabais (19 oct 2026)\nCloser: Maude")
  })
  it('omet naturopathe, date et setter absents', () => {
    expect(customerNotes({ ...plan, product_name: 'Évaluation naturopathie', discount_type: 'amount', discount_value: 50 }, { closer: 'Maude' }))
      .toBe('1 paiement,  Évaluation naturopathie, rabais de 50 $\nCloser: Maude')
  })
})

describe('dateCourte / rabais', () => {
  it('jour de Montréal', () => expect(dateCourte('2026-08-02T02:00:00Z')).toBe('1 août 2026'))
  it('rabais décimal', () => expect(rabais('percent', 7.5)).toBe('7,5% de rabais'))
  it('aucun rabais', () => expect(rabais('percent', 0)).toBe(null))
})
