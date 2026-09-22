// Découpage des périodes de paie (fonctions pures, sans Supabase).
// referencePayDate = DERNIER jour d'une période (jour de paie), 'YYYY-MM-DD'.
// Même découpage que getCurrentPayPeriod (src/hooks/usePayPeriod.js).

const DAY = 86_400_000

function currentPeriodAt(referencePayDate, periodLengthDays, today) {
  const [y, m, d] = referencePayDate.split('-').map(Number)
  const firstStart = Date.UTC(y, m - 1, d - (periodLengthDays - 1))
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const idx = Math.floor((t - firstStart) / DAY / periodLengthDays)
  return firstStart + idx * periodLengthDays * DAY
}

// Périodes de paie, de la période en cours vers le passé : [{ start, end }]
export function listPayPeriods(referencePayDate, periodLengthDays = 14, count = 12, today = new Date()) {
  if (!referencePayDate) return []
  const currentStart = currentPeriodAt(referencePayDate, periodLengthDays, today)
  return Array.from({ length: count }, (_, k) => {
    const start = currentStart - k * periodLengthDays * DAY
    const end = start + (periodLengthDays - 1) * DAY
    return { start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10) }
  })
}
