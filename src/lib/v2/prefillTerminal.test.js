import { describe, it, expect } from 'vitest'
import { prefillTerminal, decouperAdresse, codeProvince } from './prefillTerminal'

// Évaluation le jeudi 15 octobre 2026 à 13 h (Montréal)
const EVAL = '2026-10-15T17:00:00Z'
const client = { prenom: 'Mary', nom: 'Day-Leroy', courriel: 'm@x.ca', telephone: '+1514', numero: '12', rue: 'rue A', ville: 'Laval', province: 'QC', codePostal: 'H7A 1A1' }

describe('préremplissage du terminal', () => {
  it('programme, 1 paiement : produit 1 paiement, payer aujourd’hui, pas de 2e prélèvement', () => {
    const p = prefillTerminal({ forfait: "Programme d'optimisation métabolique", nbPaiements: '1', dateEvaluation: EVAL, client })
    expect(p).toMatchObject({ productName: 'Forfait 15 semaines NEO - 1 paiement', payToday: true, addGuarantee: false, discountValue: '', chargeDate: '' })
    expect(p).toMatchObject({ clientFirstName: 'Mary', clientLastName: 'Day-Leroy', clientCity: 'Laval', clientPostalCode: 'H7A 1A1' })
  })

  it('programme, 3 paiements : 2e prélèvement à évaluation + 5 semaines, puis aux 5 semaines', () => {
    const p = prefillTerminal({ forfait: "Programme d'optimisation métabolique", nbPaiements: '3', dateEvaluation: EVAL, client })
    expect(p).toMatchObject({ productName: 'Forfait 15 semaines NEO - 3 paiements', chargeDate: '2026-11-19', frequencyUnit: 'WEEK', frequencyInterval: 5 })
  })

  it('programme plus 10 % & garanti, 5 paiements : garantie, rabais 10 %, + 3 semaines, aux 3 semaines', () => {
    const p = prefillTerminal({ forfait: "Programme d'optimisation métabolique plus 10% & garanti", nbPaiements: '5', dateEvaluation: EVAL, client })
    expect(p).toMatchObject({
      productName: 'Forfait 15 semaines NEO - 5 paiements', addGuarantee: true, discountType: 'percent', discountValue: '10',
      payToday: true, chargeDate: '2026-11-05', frequencyUnit: 'WEEK', frequencyInterval: 3,
    })
  })

  it('variantes : plus 10% seul, plus garanti seul', () => {
    expect(prefillTerminal({ forfait: "Programme d'optimisation métabolique plus 10%", nbPaiements: '1', dateEvaluation: EVAL }))
      .toMatchObject({ addGuarantee: false, discountValue: '10' })
    expect(prefillTerminal({ forfait: "Programme d'optimisation métabolique plus garanti", nbPaiements: '1', dateEvaluation: EVAL }))
      .toMatchObject({ addGuarantee: true, discountValue: '' })
  })

  it('à la carte : évaluation naturopathie', () => {
    expect(prefillTerminal({ forfait: 'À la carte', nbPaiements: '1', dateEvaluation: EVAL }))
      .toMatchObject({ productName: 'Évaluation naturopathie', payToday: true, addGuarantee: false, discountValue: '' })
  })

  it('le jour de l’évaluation est celui de Montréal (soirée = même jour)', () => {
    const p = prefillTerminal({ forfait: "Programme d'optimisation métabolique", nbPaiements: '5', dateEvaluation: '2026-10-16T02:30:00Z' })
    expect(p.chargeDate).toBe('2026-11-05') // 15 oct. 22 h 30 à Montréal + 21 jours
  })

  it('forfait sans produit : null', () => {
    expect(prefillTerminal({ forfait: 'Forfait métabolique sans entrainement', nbPaiements: '1', dateEvaluation: EVAL })).toBe(null)
  })

  it('adresse et province', () => {
    expect(decouperAdresse('1234 rue Principale')).toEqual({ numero: '1234', rue: 'rue Principale' })
    expect(decouperAdresse('12B, boul. Lévesque')).toEqual({ numero: '12B', rue: 'boul. Lévesque' })
    expect(decouperAdresse('Rang 3')).toEqual({ numero: '', rue: 'Rang 3' })
    expect(codeProvince('Québec')).toBe('QC')
    expect(codeProvince('Ontario')).toBe('ON')
    expect(codeProvince('')).toBe('QC')
  })
})

describe('produits du terminal', () => {
  it('chaque forfait de l’évaluation donne un produit qui existe dans le terminal', async () => {
    const { TERMINAL_PRODUCTS } = await import('../../../supabase/functions/_shared/schedule.js')
    const { EVALUATION } = await import('./salesConfig.js')
    for (const forfait of EVALUATION.forfaits) {
      for (const n of EVALUATION.nbPaiements) {
        const p = prefillTerminal({ forfait, nbPaiements: n, dateEvaluation: '2026-10-05T14:00:00Z', client: {} })
        expect(TERMINAL_PRODUCTS).toContain(p.productName)
      }
    }
  })
})
