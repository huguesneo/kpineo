// Valeur de la carte du pipeline 🎯 Vente : ce que le client a payé au
// terminal, avant taxes. JS pur (Deno et tests).

import { withTax } from './schedule.js'

export const PIPELINE_VENTE = 'pc4eWgm1TOfZgMgqh6Gv'

// Montant avant taxes d'un total taxes comprises (TPS et TVQ arrondies chacune au cent)
export function avantTaxes(totalCents) {
  const base = Math.round(totalCents / 1.14975)
  for (const p of [base, base - 1, base + 1]) if (withTax(p).total === totalCents) return p
  return base
}

// Total payé avant taxes, toutes ventes du client confondues (sauf ventes retirées)
export function payeAvantTaxes(plans) {
  let total = 0
  for (const p of plans) {
    if (p.removed_at) continue
    const paye = (p.payment_installments ?? []).filter(i => i.status === 'paid').reduce((a, i) => a + i.amount_cents, 0)
    total += avantTaxes(paye)
  }
  return total
}

// Carte visée : la plus récente du pipeline Vente, ouverte ou gagnée (jamais une carte perdue)
export function choisirCarteVente(opps) {
  const t = o => new Date(o.createdAt ?? 0).getTime()
  return opps
    .filter(o => o.pipelineId === PIPELINE_VENTE && ['open', 'won'].includes(o.status))
    .sort((a, b) => t(b) - t(a))[0] ?? null
}
