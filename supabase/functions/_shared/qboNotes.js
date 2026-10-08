// Notes du dossier client QuickBooks, écrites au 1er paiement d'une vente du terminal :
//   Jessica - 1 paiement,  Programme d'optimisation métabolique, 10% de rabais (19 oct 2026)
//   Closer: Vicky
//   Setter : Vicky
// Naturopathe, rabais, date et setter : seulement s'il y a lieu.

const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

// ISO (« 2026-10-19T14:00:00-04:00 ») -> « 19 oct 2026 », jour de Montréal
export function dateCourte(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const [y, m, j] = d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }).split('-').map(Number)
  return `${j} ${MOIS[m - 1]} ${y}`
}

// « Forfait 15 semaines NEO - 3 paiements » -> « Programme d'optimisation métabolique »
export function programme(productName) {
  return /^Forfait 15 semaines NEO/.test(productName ?? '') ? "Programme d'optimisation métabolique" : String(productName ?? '')
}

const nombre = (v) => String(Number(v.toFixed(2))).replace('.', ',')

export function rabais(type, value) {
  const v = Number(value ?? 0)
  if (!(v > 0)) return null
  if (type === 'percent') return `${nombre(v)}% de rabais`
  if (type === 'amount') return `rabais de ${nombre(v)} $`
  return null
}

// plan : { product_name, installments_count, discount_type, discount_value }
// noms : { therapist, closer, setter } (prénoms) ; evaluationDate : ISO ou null
export function customerNotes(plan, { therapist, closer, setter } = {}, evaluationDate = null) {
  const n = Number(plan.installments_count) || 1
  const paiements = `${n} paiement${n > 1 ? 's' : ''}`
  const prog = [programme(plan.product_name), rabais(plan.discount_type, plan.discount_value)].filter(Boolean).join(', ')
  const date = dateCourte(evaluationDate)
  const ligne1 = `${therapist ? therapist + ' - ' : ''}${paiements},  ${prog}${date ? ` (${date})` : ''}`
  return [ligne1, closer ? `Closer: ${closer}` : null, setter ? `Setter : ${setter}` : null].filter(Boolean).join('\n')
}
