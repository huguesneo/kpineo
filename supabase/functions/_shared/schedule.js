// Logique partagée du terminal de paiement : utilisée par les edge functions
// (Deno) ET par l'app (aperçu de l'échéancier). Garder en JS pur, sans import.

// Produits QuickBooks que le closeur peut vendre au terminal.
// Le nombre de versements vient du nom du produit : c'est ce que lit le
// calcul des commissions (closer-cash-collected).
export const TERMINAL_PRODUCTS = [
  'Forfait 15 semaines NEO - 1 paiement',
  'Forfait 15 semaines NEO - 3 paiements',
  'Forfait 15 semaines NEO - 5 paiements',
  'Évaluation naturopathie',
  'Évaluation entrainement',
]

// Ajouts possibles à la vente (section « Ajout supplémentaire »)
export const TRAINING_ADDON_CENTS = 10000 // programme d'entraînement : +100 $ avant taxes

// TPS 5 % + TVQ 9,975 %, calculées séparément puis arrondies au cent
export function withTax(pretaxCents) {
  const tps = Math.round(pretaxCents * 0.05)
  const tvq = Math.round(pretaxCents * 0.09975)
  return { pretax: pretaxCents, tps, tvq, total: pretaxCents + tps + tvq }
}

// Prix de la vente à partir de ce que le closeur a saisi.
//   discountType 'percent' : le % s'applique au total, donc à tous les versements
//   discountType 'amount'  : le montant (avant taxes) est retiré du 1er versement seulement
export function priceSale({ pretaxCents, training = false, discountType = 'percent', discountValue = 0 }) {
  if (!Number.isInteger(pretaxCents) || pretaxCents <= 0) throw new Error('Montant avant taxes invalide')
  const basePretax = pretaxCents + (training ? TRAINING_ADDON_CENTS : 0)
  const v = Number(discountValue) || 0
  if (v < 0) throw new Error('Rabais invalide')
  if (discountType === 'percent') {
    if (v >= 100) throw new Error('Le rabais doit être plus petit que 100 %')
    const pretaxTotal = Math.round(basePretax * (1 - v / 100))
    return { basePretax, discountPretax: basePretax - pretaxTotal, pretaxTotal, firstDiscountTotal: 0, totalCents: withTax(pretaxTotal).total }
  }
  if (discountType === 'amount') {
    const d = Math.round(v * 100)
    if (d >= basePretax) throw new Error('Le rabais doit être plus petit que le montant')
    return { basePretax, discountPretax: d, pretaxTotal: basePretax - d, firstDiscountTotal: d ? withTax(d).total : 0, totalCents: withTax(basePretax).total }
  }
  throw new Error('Type de rabais invalide')
}

// Échéancier final : le rabais en $ (taxes comprises) est retiré du 1er versement.
export function buildSaleSchedule(price, opts) {
  const sched = buildSchedule({ ...opts, totalCents: price.totalCents })
  if (price.firstDiscountTotal) {
    sched[0].amountCents -= price.firstDiscountTotal
    if (sched[0].amountCents <= 0) throw new Error('Le rabais en $ dépasse le 1er versement')
  }
  return sched
}

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

export function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const total = (m - 1) + months
  const ty = y + Math.floor(total / 12)
  const tm = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  return new Date(Date.UTC(ty, tm, Math.min(d, last))).toISOString().slice(0, 10)
}

export const FREQUENCY_UNITS = ['DAY', 'WEEK', 'MONTH']

// Date après `steps` intervalles : « tous les 2 semaines », « tous les 1 mois »...
// Calculée depuis la date de départ (pas de dérive d'un mois à l'autre).
export function addInterval(isoDate, unit, interval, steps = 1) {
  const n = interval * steps
  if (unit === 'MONTH') return addMonths(isoDate, n)
  if (unit === 'WEEK') return addDays(isoDate, 7 * n)
  return addDays(isoDate, n)
}

// Nombre de jours approximatif (affichage et colonne frequency_days seulement)
export function approxDays(unit, interval) {
  const per = unit === 'MONTH' ? 30 : unit === 'WEEK' ? 7 : 1
  return Math.min(365, per * interval)
}

// Montants égaux en cents ; le reste (quelques cents) va sur le 1er versement
// pour que la somme soit exactement le total.
// firstDate : date du 1er versement. secondDate (optionnel) : date du 2e
// versement quand il ne suit pas la fréquence (ex. 1er aujourd'hui, 2e choisi
// par le closeur) ; les suivants reprennent la fréquence à partir du 2e.
// Fréquence : frequencyUnit (DAY | WEEK | MONTH) + frequencyInterval (« tous les N »).
export function buildSchedule(opts) {
  const { totalCents, count, frequencyUnit = 'DAY', frequencyInterval, frequencyDays, firstDate, secondDate } = opts
  const interval = frequencyInterval ?? frequencyDays
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('Montant total invalide')
  if (!Number.isInteger(count) || count < 1) throw new Error('Nombre de versements invalide')
  if (count > 1) {
    if (!FREQUENCY_UNITS.includes(frequencyUnit)) throw new Error('Unité de fréquence invalide')
    if (!Number.isInteger(interval) || interval < 1 || interval > 99) throw new Error('Fréquence invalide')
  }
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')
  if (!isDate(firstDate)) throw new Error('Date de début invalide')
  if (secondDate != null && count > 1) {
    if (!isDate(secondDate)) throw new Error('Date du 2e prélèvement invalide')
    if (secondDate <= firstDate) throw new Error('Le 2e prélèvement doit être après le 1er')
  }

  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    amountCents: base + (i === 0 ? remainder : 0),
    dueDate: i === 0
      ? firstDate
      : secondDate != null
        ? addInterval(secondDate, frequencyUnit, interval, i - 1)
        : addInterval(firstDate, frequencyUnit, interval, i),
  }))
}

export function formatCents(cents) {
  return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
}
