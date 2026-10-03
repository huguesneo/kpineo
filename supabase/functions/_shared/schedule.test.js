import { describe, it, expect } from 'vitest'
import { buildSchedule, installmentsForProduct, addDays, addMonths, addInterval, todayMontreal } from './schedule.js'

describe('installmentsForProduct', () => {
  it('lit le nombre de paiements dans le nom du produit', () => {
    expect(installmentsForProduct('Forfait 15 semaines NEO - 3 paiements')).toBe(3)
    expect(installmentsForProduct('Forfait 15 semaines DUO - 5 paiements')).toBe(5)
    expect(installmentsForProduct('Forfait 15 semaines NEO - 1 paiement')).toBe(1)
    expect(installmentsForProduct('Évaluation naturopathie')).toBe(1)
  })
})

describe('buildSchedule', () => {
  it('répartit le total et met le reste sur le 1er versement', () => {
    const s = buildSchedule({ totalCents: 100000, count: 3, frequencyDays: 21, firstDate: '2026-10-01' })
    expect(s.map(i => i.amountCents)).toEqual([33334, 33333, 33333])
    expect(s.reduce((a, i) => a + i.amountCents, 0)).toBe(100000)
    expect(s.map(i => i.dueDate)).toEqual(['2026-10-01', '2026-10-22', '2026-11-12'])
  })

  it('1er aujourd’hui, 2e à une date choisie, puis la fréquence', () => {
    const s = buildSchedule({ totalCents: 90000, count: 3, frequencyDays: 21, firstDate: '2026-09-30', secondDate: '2026-10-15' })
    expect(s.map(i => i.dueDate)).toEqual(['2026-09-30', '2026-10-15', '2026-11-05'])
    expect(() => buildSchedule({ totalCents: 90000, count: 3, frequencyDays: 21, firstDate: '2026-09-30', secondDate: '2026-09-30' })).toThrow()
  })

  it('gère un paiement unique', () => {
    expect(buildSchedule({ totalCents: 5000, count: 1, frequencyDays: 0, firstDate: '2026-10-01' }))
      .toEqual([{ number: 1, amountCents: 5000, dueDate: '2026-10-01' }])
  })

  it('refuse les données invalides', () => {
    expect(() => buildSchedule({ totalCents: 0, count: 3, frequencyDays: 7, firstDate: '2026-10-01' })).toThrow()
    expect(() => buildSchedule({ totalCents: 100, count: 3, frequencyDays: 0, firstDate: '2026-10-01' })).toThrow()
    expect(() => buildSchedule({ totalCents: 100, count: 1, frequencyDays: 7, firstDate: '01/10/2026' })).toThrow()
  })
})

describe('fréquence jour / semaine / mois', () => {
  it('tous les 2 semaines', () => {
    const s = buildSchedule({ totalCents: 30000, count: 3, frequencyUnit: 'WEEK', frequencyInterval: 2, firstDate: '2026-10-01' })
    expect(s.map(i => i.dueDate)).toEqual(['2026-10-01', '2026-10-15', '2026-10-29'])
  })
  it('tous les 1 mois, sans dérive en fin de mois', () => {
    const s = buildSchedule({ totalCents: 30000, count: 3, frequencyUnit: 'MONTH', frequencyInterval: 1, firstDate: '2026-01-31' })
    expect(s.map(i => i.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
  it('1er aujourd’hui, 2e choisi, puis tous les 1 mois', () => {
    const s = buildSchedule({ totalCents: 30000, count: 3, frequencyUnit: 'MONTH', frequencyInterval: 1, firstDate: '2026-10-01', secondDate: '2026-10-15' })
    expect(s.map(i => i.dueDate)).toEqual(['2026-10-01', '2026-10-15', '2026-11-15'])
  })
  it('refuse une unité invalide', () => {
    expect(() => buildSchedule({ totalCents: 100, count: 2, frequencyUnit: 'YEAR', frequencyInterval: 1, firstDate: '2026-10-01' })).toThrow()
  })
  it('addMonths / addInterval', () => {
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15')
    expect(addInterval('2026-10-01', 'WEEK', 2, 2)).toBe('2026-10-29')
  })
})

describe('dates', () => {
  it('traverse les fins de mois et d’année', () => {
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08')
  })
  it('utilise le fuseau de Montréal', () => {
    // 2026-10-01 02:00 UTC = 30 sept. 22 h à Montréal
    expect(todayMontreal(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30')
  })
})

import { priceSale, buildSaleSchedule, withTax } from './schedule.js'

describe('priceSale', () => {
  it('ajoute 100 $ pour le programme d’entraînement', () => {
    const p = priceSale({ pretaxCents: 100000, training: true })
    expect(p.pretaxTotal).toBe(110000)
    expect(p.totalCents).toBe(withTax(110000).total)
  })
  it('rabais % sur le total', () => {
    const p = priceSale({ pretaxCents: 100000, discountType: 'percent', discountValue: 10 })
    expect(p.pretaxTotal).toBe(90000)
    expect(p.totalCents).toBe(103478)
  })
  it('rabais $ retiré du 1er versement seulement', () => {
    const p = priceSale({ pretaxCents: 300000, discountType: 'amount', discountValue: 100 })
    const s = buildSaleSchedule(p, { count: 3, frequencyUnit: 'WEEK', frequencyInterval: 2, firstDate: '2026-10-02' })
    expect(s[1].amountCents).toBe(s[2].amountCents)
    expect(s[0].amountCents).toBe(s[1].amountCents + (withTax(300000).total - s[1].amountCents * 3) - withTax(10000).total)
    expect(s.reduce((a, x) => a + x.amountCents, 0)).toBe(withTax(300000).total - withTax(10000).total)
  })
  it('refuse un rabais trop grand', () => {
    expect(() => priceSale({ pretaxCents: 5000, discountType: 'amount', discountValue: 60 })).toThrow()
    expect(() => priceSale({ pretaxCents: 5000, discountType: 'percent', discountValue: 100 })).toThrow()
  })
})
