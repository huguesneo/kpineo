import { describe, it, expect } from 'vitest'
import { PIPELINE_VENTE, avantTaxes, choisirCarteVente, payeAvantTaxes } from './venteValeur.js'

describe('avantTaxes', () => {
  it('retrouve le montant avant TPS et TVQ', () => {
    expect(avantTaxes(275940)).toBe(240000)
    expect(avantTaxes(63236)).toBe(55000)
    expect(avantTaxes(55188)).toBe(48000)
    expect(avantTaxes(0)).toBe(0)
  })
})

describe('payeAvantTaxes', () => {
  const plan = (insts, extra = {}) => ({ payment_installments: insts, ...extra })
  const v = (amount_cents, status = 'paid') => ({ amount_cents, status })
  it('ignore les paiements uniques hors produit', () => {
    expect(payeAvantTaxes([plan([v(55188)]), plan([v(63236)], { manual: true })])).toBe(48000)
  })
  it('additionne les versements payés de toutes les ventes du client, avant taxes', () => {
    expect(payeAvantTaxes([
      plan([v(55188), v(55188), v(55188, 'scheduled'), v(55188, 'declined')]),
      plan([v(63236)]),
    ])).toBe(96000 + 55000)
  })
  it('ignore les ventes retirées et compte 0 sans paiement', () => {
    expect(payeAvantTaxes([plan([v(63236)], { removed_at: '2026-10-10' })])).toBe(0)
    expect(payeAvantTaxes([plan([v(55188, 'scheduled')])])).toBe(0)
  })
})

describe('choisirCarteVente', () => {
  const opp = (id, status, createdAt, pipelineId = PIPELINE_VENTE) => ({ id, status, createdAt, pipelineId })
  it('prend la carte Vente la plus récente, ouverte ou gagnée', () => {
    expect(choisirCarteVente([
      opp('vieille', 'won', '2026-09-01'),
      opp('perdue', 'lost', '2026-10-15'),
      opp('setting', 'open', '2026-10-16', 'autre-pipeline'),
      opp('recente', 'won', '2026-10-06'),
    ])?.id).toBe('recente')
  })
  it('rien quand le client n’a aucune carte Vente utilisable', () => {
    expect(choisirCarteVente([opp('perdue', 'lost', '2026-10-15'), opp('x', 'open', '2026-10-16', 'autre')])).toBeNull()
    expect(choisirCarteVente([])).toBeNull()
  })
})
