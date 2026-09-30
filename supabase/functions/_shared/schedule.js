// Logique partagée du terminal de paiement : utilisée par les edge functions
// (Deno) ET par l'app (aperçu de l'échéancier). Garder en JS pur, sans import.

// Produits QuickBooks que le closeur peut vendre au terminal.
// Le nombre de versements vient du nom du produit : c'est ce que lit le
// calcul des commissions (closer-cash-collected).
export const TERMINAL_PRODUCTS = [
  'Forfait 15 semaines NEO - 1 paiement',
  'Forfait 15 semaines NEO - 2 paiements',
  'Forfait 15 semaines NEO - 3 paiements',
  'Forfait 15 semaines NEO - 5 paiements',
  'Forfait 15 semaines DUO - 1 paiement',
  'Forfait 15 semaines DUO - 2 paiements',
  'Forfait 15 semaines DUO - 3 paiements',
  'Forfait 15 semaines DUO - 5 paiements',
  'Évaluation naturopathie',
  'Évaluation entrainement',
  "Programme d'optimisation ajout entraînement personnalisé",
]

export function installmentsForProduct(productName) {
  const m = String(productName ?? '').match(/(\d+)\s+paiements?/i)
  const n = m ? parseInt(m[1], 10) : 1
  return n > 1 ? n : 1
}

// Date du jour à Montréal, format AAAA-MM-JJ
export function todayMontreal(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

// Montants égaux en cents ; le reste (quelques cents) va sur le 1er versement
// pour que la somme soit exactement le total.
export function buildSchedule({ totalCents, count, frequencyDays, firstDate }) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('Montant total invalide')
  if (!Number.isInteger(count) || count < 1) throw new Error('Nombre de versements invalide')
  if (count > 1 && (!Number.isInteger(frequencyDays) || frequencyDays < 1)) throw new Error('Fréquence invalide')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate ?? '')) throw new Error('Date de début invalide')

  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    amountCents: base + (i === 0 ? remainder : 0),
    dueDate: addDays(firstDate, i * (frequencyDays || 0)),
  }))
}

export function formatCents(cents) {
  return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
}
