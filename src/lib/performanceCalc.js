// =============================================================================
// performanceCalc.js — Toutes les formules du module Performance & REER de NEO.
// Chaque fonction reçoit les données brutes et retourne un objet contenant tous
// les calculs intermédiaires, afin de pouvoir afficher le détail au survol.
// =============================================================================

// Liste des naturopathes (ordre d'affichage)
export const NATUROS = [
  { key: 'thibault', label: 'Thibault', revenueKey: 'revenue_thibault', salaryKey: 'salaire_thibault' },
  { key: 'brice',    label: 'Brice',    revenueKey: 'revenue_brice',    salaryKey: 'salaire_brice' },
  { key: 'jessica',  label: 'Jessica',  revenueKey: 'revenue_jessica',  salaryKey: 'salaire_jessica' },
  { key: 'tamara',   label: 'Tamara',   revenueKey: 'revenue_tamara',   salaryKey: 'salaire_tamara' },
]

// Postes de coûts fixes mensuels
export const FIXED_KEYS = ['loyer', 'amortissement', 'auto_fixe', 'essence', 'telecom', 'abonnements', 'outils_info']
export const FIXED_LABELS = {
  loyer: 'Loyer',
  amortissement: 'Amortissement',
  auto_fixe: 'Auto (fixe)',
  essence: 'Essence',
  telecom: 'Télécom',
  abonnements: 'Abonnements',
  outils_info: 'Outils informatiques',
}

// Postes de coûts variables (saisis manuellement)
export const VARIABLE_KEYS = [
  'cogs_total', 'salary_charges', 'ads_meta', 'ads_other',
  'bank_fees', 'professional_fees', 'exceptional_expenses',
]
export const VARIABLE_LABELS = {
  cogs_total: 'COGS (coût des marchandises)',
  salary_charges: 'Charges salariales',
  ads_meta: 'Publicité Meta',
  ads_other: 'Publicité autre',
  bank_fees: 'Frais bancaires',
  professional_fees: 'Frais professionnels',
  exceptional_expenses: 'Dépenses exceptionnelles',
}

// ----------------------------------------------------------------------------
// Helpers numériques / formatage
// ----------------------------------------------------------------------------

export function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function safeDiv(a, b) {
  const denom = num(b)
  return denom === 0 ? 0 : num(a) / denom
}

// Format canadien-français : « 15 000 $ ». Les zéros deviennent « — $ ».
export function formatCAD(value, { showZeroDash = true, decimals = 0 } = {}) {
  const n = num(value)
  if (showZeroDash && n === 0) return '— $'
  const formatted = n.toLocaleString('fr-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${formatted} $`
}

export function formatNumber(value, decimals = 0) {
  return num(value).toLocaleString('fr-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPct(ratio, decimals = 1) {
  return `${(num(ratio) * 100).toLocaleString('fr-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} %`
}

// Un mois est considéré « saisi » si un revenu total a été entré.
export function hasMonthData(metrics) {
  return !!metrics && num(metrics.revenue_total) > 0
}

// ----------------------------------------------------------------------------
// Coûts fixes
// ----------------------------------------------------------------------------

// Valeur fixe d'un poste : la valeur réelle du mois (metrics) si elle est
// renseignée, sinon le paramètre global.
export function resolveFixedValue(key, params, metrics) {
  const mv = metrics?.[key]
  if (mv != null && mv !== '') return num(mv)
  return num(params?.[key])
}

export function calcFixedTotal(params, metrics) {
  return FIXED_KEYS.reduce((sum, k) => sum + resolveFixedValue(k, params, metrics), 0)
}

// ----------------------------------------------------------------------------
// Profit NEO du mois
// ----------------------------------------------------------------------------

export function calcProfitNEO(metrics, params) {
  const fixed_total = calcFixedTotal(params, metrics)

  const cogs_total = num(metrics?.cogs_total)
  const salary_charges = num(metrics?.salary_charges)
  const ads_meta = num(metrics?.ads_meta)
  const ads_other = num(metrics?.ads_other)
  const bank_fees = num(metrics?.bank_fees)
  const professional_fees = num(metrics?.professional_fees)
  const exceptional_expenses = num(metrics?.exceptional_expenses)
  const revenue_total = num(metrics?.revenue_total)

  const total_couts =
    cogs_total + salary_charges + ads_meta + ads_other +
    bank_fees + professional_fees + exceptional_expenses + fixed_total

  const profit_neo = revenue_total - total_couts

  return {
    revenue_total,
    fixed_total,
    cogs_total,
    salary_charges,
    ads_meta,
    ads_other,
    bank_fees,
    professional_fees,
    exceptional_expenses,
    total_couts,
    profit_neo,
    marge: safeDiv(profit_neo, revenue_total),
    hasData: hasMonthData(metrics),
  }
}

// Somme des salaires mensuels (avec charges) des 4 naturopathes
function sumNaturoSalairesMensuelCharges(params) {
  const pct = num(params?.charges_sociales_pct)
  return NATUROS.reduce(
    (sum, n) => sum + (num(params?.[n.salaryKey]) / 12) * (1 + pct),
    0,
  )
}

// ----------------------------------------------------------------------------
// Profit individuel par naturopathe
// ----------------------------------------------------------------------------

export function calcProfitNaturo(metrics, params, naturoKey) {
  const naturo = NATUROS.find(n => n.key === naturoKey)
  if (!naturo) return null

  const fixed_total = calcFixedTotal(params, metrics)
  const revenue_total = num(metrics?.revenue_total)
  const revenu_naturo = num(metrics?.[naturo.revenueKey])
  const cogs_ratio = num(params?.cogs_ratio)
  const charges_pct = num(params?.charges_sociales_pct)

  const salaire_mensuel_charges = (num(params?.[naturo.salaryKey]) / 12) * (1 + charges_pct)
  const cogs_attribue = revenu_naturo * cogs_ratio

  // Salaires non-naturos (Liliane, Cloé, Isabelle, Jason) = charges salariales
  // totales moins la somme des salaires des naturos.
  const somme_salaires_naturos = sumNaturoSalairesMensuelCharges(params)
  const salaires_non_naturos = num(metrics?.salary_charges) - somme_salaires_naturos

  const total_frais_a_repartir =
    fixed_total +
    num(metrics?.ads_meta) +
    num(metrics?.ads_other) +
    num(metrics?.bank_fees) +
    num(metrics?.professional_fees) +
    num(metrics?.exceptional_expenses) +
    salaires_non_naturos

  const part_revenu = safeDiv(revenu_naturo, revenue_total)
  const quote_part_frais = part_revenu * total_frais_a_repartir

  const profit_naturo = revenu_naturo - cogs_attribue - salaire_mensuel_charges - quote_part_frais

  return {
    key: naturo.key,
    label: naturo.label,
    revenu_naturo,
    part_revenu,
    cogs_attribue,
    salaire_mensuel_charges,
    salaires_non_naturos,
    total_frais_a_repartir,
    quote_part_frais,
    profit_naturo,
    marge: safeDiv(profit_naturo, revenu_naturo),
  }
}

export function calcAllNaturos(metrics, params) {
  return NATUROS.map(n => calcProfitNaturo(metrics, params, n.key))
}

// ----------------------------------------------------------------------------
// REER mensuel — modèle de cotisation égalée (matching)
// ----------------------------------------------------------------------------
//
// Pour chaque naturo, NEO verse un montant ce mois SI les 3 conditions sont
// remplies :
//   1. Le naturo a cotisé (montant saisi > 0 = preuve reçue)
//   2. Profit NEO du mois >= plancher
//   3. NEO égale la cotisation, plafonnée à reer_match_cap_pct du salaire mensuel
// Sinon → 0 $ versé par NEO pour ce naturo ce mois.

export const REER_CONTRIB_KEYS = NATUROS.map(n => `reer_contrib_${n.key}`)
export function contribKey(naturoKey) { return `reer_contrib_${naturoKey}` }

export function calcREER(metrics, params) {
  const { profit_neo } = calcProfitNEO(metrics, params)
  const plancher = num(params?.reer_plancher)
  const capPct = num(params?.reer_match_cap_pct) || 0.03
  const plancherAtteint = profit_neo >= plancher

  const perNaturo = {}
  const parNaturo = {}        // compat : montant versé par NEO (match) par naturo
  let total_match = 0
  let total_contrib = 0

  NATUROS.forEach(n => {
    const contrib = num(metrics?.[contribKey(n.key)])
    const salaire_mensuel = num(params?.[n.salaryKey]) / 12
    const cap = capPct * salaire_mensuel
    const eligible = plancherAtteint && contrib > 0
    const match = eligible ? Math.min(contrib, cap) : 0
    perNaturo[n.key] = { contrib, salaire_mensuel, cap, eligible, match }
    parNaturo[n.key] = match
    total_match += match
    total_contrib += contrib
  })

  return {
    profit_neo,
    plancher,
    plancherAtteint,
    capPct,
    perNaturo,
    parNaturo,
    total_match,                       // ce que NEO (Hugues) verse
    total_contrib,                     // ce que les naturos versent
    total_global: total_match + total_contrib,
    active: plancherAtteint && total_match > 0,
    profit_apres_reer: profit_neo - total_match,
    // compat avec l'ancien nommage
    reer_pool: total_match,
    reer_avec_charges: total_match,
  }
}

// ----------------------------------------------------------------------------
// Scénario / projection
// ----------------------------------------------------------------------------

// baseMetrics : { revenue_total, profit_neo, revenue_*, reer_contrib_* }
// overrides   : { reer_plancher?, marge_incrementale? }
export function calcScenario(baseMetrics, params, growthMultiplier, overrides = {}) {
  const M = num(growthMultiplier)
  const marge_incrementale = overrides.marge_incrementale != null
    ? num(overrides.marge_incrementale)
    : num(params?.marge_incrementale)
  const plancher = overrides.reer_plancher != null
    ? num(overrides.reer_plancher)
    : num(params?.reer_plancher)
  const capPct = num(params?.reer_match_cap_pct) || 0.03

  const revenue_base = num(baseMetrics?.revenue_total)
  const profit_base = num(baseMetrics?.profit_neo)

  const revenue_projete = revenue_base * M
  const profit_projete = profit_base + (revenue_projete - revenue_base) * marge_incrementale

  // Revenus naturos projetés (mêmes parts, multipliées par M)
  const naturoRevenues = {}
  NATUROS.forEach(n => { naturoRevenues[n.key] = num(baseMetrics?.[n.revenueKey]) * M })

  // REER matching : les cotisations ne changent pas avec la croissance ; seul
  // le franchissement du plancher est conditionné par le profit projeté.
  const plancherAtteint = profit_projete >= plancher
  const reer_par_naturo = {}
  let reer_match = 0
  NATUROS.forEach(n => {
    const contrib = num(baseMetrics?.[contribKey(n.key)])
    const cap = capPct * (num(params?.[n.salaryKey]) / 12)
    const match = (plancherAtteint && contrib > 0) ? Math.min(contrib, cap) : 0
    reer_par_naturo[n.key] = match
    reer_match += match
  })

  return {
    growthMultiplier: M,
    marge_incrementale,
    plancher,
    revenue_base,
    profit_base,
    revenue_projete,
    profit_projete,
    naturoRevenues,
    plancherAtteint,
    reer_pool: reer_match,
    reer_avec_charges: reer_match,
    reer_par_naturo,
    reer_active: plancherAtteint && reer_match > 0,
    profit_apres_reer: profit_projete - reer_match,
    annual: {
      revenue: revenue_projete * 12,
      profit: profit_projete * 12,
      reer_pool: reer_match * 12,
      reer_avec_charges: reer_match * 12,
      profit_apres_reer: (profit_projete - reer_match) * 12,
      reer_par_naturo: Object.fromEntries(
        NATUROS.map(n => [n.key, reer_par_naturo[n.key] * 12]),
      ),
    },
  }
}

// ----------------------------------------------------------------------------
// Résumé annuel
// ----------------------------------------------------------------------------

export function calcAnnualSummary(monthsArray, params) {
  const months = (monthsArray || []).filter(m => hasMonthData(m))

  const perMonth = months.map(m => {
    const neo = calcProfitNEO(m, params)
    const reer = calcREER(m, params)
    return {
      year: m.year,
      month: m.month,
      revenue_total: neo.revenue_total,
      profit_neo: neo.profit_neo,
      marge: neo.marge,
      reer_pool: reer.reer_pool,
      reer_match: reer.total_match,
      reer_contrib: reer.total_contrib,
      reer_global: reer.total_global,
      reer_avec_charges: reer.reer_avec_charges,
      reer_active: reer.active,
      profit_apres_reer: reer.profit_apres_reer,
    }
  })

  const sum = (key) => perMonth.reduce((s, p) => s + num(p[key]), 0)
  const count = perMonth.length

  const revenue_total = sum('revenue_total')
  const profit_neo = sum('profit_neo')
  const reer_pool = sum('reer_pool')
  const reer_match = sum('reer_match')
  const reer_contrib = sum('reer_contrib')
  const reer_avec_charges = sum('reer_avec_charges')
  const profit_apres_reer = sum('profit_apres_reer')
  const mois_plancher_atteint = perMonth.filter(p => p.reer_active).length

  return {
    perMonth,
    count,
    revenue_total,
    profit_neo,
    reer_pool,
    reer_match,
    reer_contrib,
    reer_global: reer_match + reer_contrib,
    reer_avec_charges,
    profit_apres_reer,
    marge: safeDiv(profit_neo, revenue_total),
    revenue_moyen: safeDiv(revenue_total, count),
    profit_moyen: safeDiv(profit_neo, count),
    mois_plancher_atteint,
  }
}

// ----------------------------------------------------------------------------
// Bases de projection (moyennes)
// ----------------------------------------------------------------------------

// Calcule une base (revenue_total + profit_neo + revenus naturos) à partir d'un
// ensemble de mois. Retourne la moyenne.
export function buildBaseFromMonths(monthsArray, params) {
  const months = (monthsArray || []).filter(m => hasMonthData(m))
  const count = months.length || 1

  const base = {
    revenue_total: 0,
    profit_neo: 0,
  }
  NATUROS.forEach(n => { base[n.revenueKey] = 0; base[contribKey(n.key)] = 0 })

  months.forEach(m => {
    const neo = calcProfitNEO(m, params)
    base.revenue_total += neo.revenue_total
    base.profit_neo += neo.profit_neo
    NATUROS.forEach(n => {
      base[n.revenueKey] += num(m[n.revenueKey])
      base[contribKey(n.key)] += num(m[contribKey(n.key)])
    })
  })

  base.revenue_total /= count
  base.profit_neo /= count
  NATUROS.forEach(n => { base[n.revenueKey] /= count; base[contribKey(n.key)] /= count })

  return base
}

// Moyenne des placeholders pour pré-remplir un formulaire vide.
export function buildPlaceholders(monthsArray) {
  const months = (monthsArray || []).filter(m => hasMonthData(m))
  if (months.length === 0) return {}
  const keys = ['revenue_total', ...NATUROS.map(n => n.revenueKey), ...VARIABLE_KEYS]
  const out = {}
  keys.forEach(k => {
    const avg = months.reduce((s, m) => s + num(m[k]), 0) / months.length
    out[k] = Math.round(avg)
  })
  return out
}
