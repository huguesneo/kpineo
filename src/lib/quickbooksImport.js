// =============================================================================
// quickbooksImport.js — Parse un export CSV « État des résultats par mois »
// de QuickBooks (français) et le mappe sur les champs de neo_monthly_metrics.
// =============================================================================

import { num } from './performanceCalc'

const MONTHS_FR = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
}
const MONTHS_ABBR = {
  'janv': 1, 'févr': 2, 'fevr': 2, 'mars': 3, 'avr': 4, 'mai': 5, 'juin': 6,
  'juil': 7, 'août': 8, 'aout': 8, 'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12, 'dec': 12,
}

// Découpe une ligne CSV en respectant les guillemets.
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

// "$23,947.96" -> 23947.96 ; "-$604.54" -> -604.54 ; "" -> 0
function parseAmount(raw) {
  if (raw == null) return 0
  let s = String(raw).trim()
  if (!s) return 0
  let sign = 1
  if (s.includes('-')) sign = -1
  s = s.replace(/[^0-9.]/g, '') // retire $, espaces, virgules de milliers, signe
  const n = parseFloat(s)
  return Number.isFinite(n) ? sign * n : 0
}

// Détecte mois + année dans n'importe quelle cellule.
function detectPeriod(rows) {
  for (const row of rows) {
    for (const cell of row) {
      const lc = cell.toLowerCase()
      const yearMatch = lc.match(/(20\d{2})/)
      if (!yearMatch) continue
      const year = Number(yearMatch[1])
      // mois complet
      for (const [name, n] of Object.entries(MONTHS_FR)) {
        if (lc.includes(name)) return { year, month: n }
      }
      // abréviation (ex: "janv. 2026")
      for (const [abbr, n] of Object.entries(MONTHS_ABBR)) {
        if (lc.includes(abbr + '.') || lc.includes(abbr + ' ')) return { year, month: n }
      }
    }
  }
  return null
}

// Parse le rapport complet.
// Retourne { ok, error, year, month, metrics, reconciliation, lines }
export function parseQuickBooksPnL(text) {
  if (!text || !text.trim()) return { ok: false, error: 'Fichier vide.' }

  const rawLines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  const rows = rawLines.map(parseCsvLine)

  const period = detectPeriod(rows)
  if (!period) {
    return { ok: false, error: "Impossible de détecter le mois/l'année dans le fichier." }
  }

  // Construit une liste { label, value } à partir de la 2e colonne (valeur du mois).
  const entries = rows
    .filter(r => r.length >= 2 && r[0])
    .map(r => ({ label: r[0], value: parseAmount(r[1]) }))

  const startsWith = (prefix) => {
    const e = entries.find(x => x.label.startsWith(prefix))
    return e ? e.value : null
  }
  const exact = (label) => {
    const e = entries.find(x => x.label === label)
    return e ? e.value : null
  }
  // tolère accents / casse pour les libellés sans code
  const includes = (substr) => {
    const lc = substr.toLowerCase()
    const e = entries.find(x => x.label.toLowerCase().startsWith(lc))
    return e ? e.value : null
  }

  // --- Revenus & COGS ---
  const revenue_total = exact('Total pour Revenu') ?? includes('Total pour Revenu') ?? 0
  const cogs_total = includes('Total pour Coût des produits vendus') ?? 0

  // --- Dépenses mappées ---
  const salary_charges = startsWith('Total pour 6000') ?? 0
  const loyer = startsWith('6100') ?? 0
  const bank_fees = startsWith('Total pour 6110') ?? 0
  const telecom = startsWith('6190') ?? 0
  const professional_fees = startsWith('Total pour 6200') ?? 0
  const ads_total = startsWith('Total pour 6310') ?? 0
  const ads_meta = startsWith('6311') ?? 0
  const ads_other = ads_total - ads_meta
  const auto_total = startsWith('Total pour 6330') ?? 0
  const essence = startsWith('6334') ?? 0
  const auto_fixe = auto_total - essence
  const abonnements = startsWith('6360') ?? 0
  const outils_info = startsWith('6390') ?? 0
  const amortissement = startsWith('6998') ?? 0

  // --- Totaux pour le résidu (dépenses exceptionnelles) ---
  const total_depenses = includes('Total pour Dépenses') ?? 0
  const total_autres = includes('Total pour Autres dépenses') ?? 0
  const profit_qb = exact('Profit') ?? null

  const mapped =
    salary_charges + loyer + bank_fees + telecom + professional_fees +
    ads_total + auto_total + abonnements + outils_info + amortissement

  // Tout le reste (assurances, fournitures, repas, impôts, change…) -> exceptionnel
  const exceptional_expenses = Math.round(((total_depenses + total_autres) - mapped) * 100) / 100

  const r2 = (n) => Math.round(num(n) * 100) / 100

  const metrics = {
    year: period.year,
    month: period.month,
    revenue_total: r2(revenue_total),
    cogs_total: r2(cogs_total),
    salary_charges: r2(salary_charges),
    ads_meta: r2(ads_meta),
    ads_other: r2(ads_other),
    bank_fees: r2(bank_fees),
    professional_fees: r2(professional_fees),
    exceptional_expenses: r2(exceptional_expenses),
    // Coûts fixes réels du mois
    loyer: r2(loyer),
    amortissement: r2(amortissement),
    auto_fixe: r2(auto_fixe),
    essence: r2(essence),
    telecom: r2(telecom),
    abonnements: r2(abonnements),
    outils_info: r2(outils_info),
  }

  // Profit recalculé selon notre modèle (doit égaler profit_qb)
  const fixed_total = loyer + amortissement + auto_fixe + essence + telecom + abonnements + outils_info
  const computed_profit = r2(
    revenue_total - cogs_total - salary_charges - ads_meta - ads_other -
    bank_fees - professional_fees - exceptional_expenses - fixed_total,
  )

  const reconciliation = {
    profit_qb: profit_qb != null ? r2(profit_qb) : null,
    computed_profit,
    diff: profit_qb != null ? r2(computed_profit - profit_qb) : null,
    matches: profit_qb != null ? Math.abs(computed_profit - profit_qb) < 1 : null,
  }

  return { ok: true, ...period, metrics, reconciliation }
}
