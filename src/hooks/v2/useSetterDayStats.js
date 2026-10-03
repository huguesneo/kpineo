import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useSetterCommissions } from '../useSetterCommissions'
import { jourMontreal } from '../../lib/v2/setterFiles'

function debutJourMontrealISO(now = new Date()) {
  // Minuit à Montréal : on part du jour calendaire et on cherche l'instant UTC correspondant
  const jour = jourMontreal(now)
  for (const off of [4, 5]) {
    const d = new Date(`${jour}T0${off}:00:00Z`)
    if (jourMontreal(d) === jour && jourMontreal(new Date(d.getTime() - 3_600_000)) !== jour) return d.toISOString()
  }
  return new Date(`${jour}T04:00:00Z`).toISOString()
}

// Bandeau du jour setter : appels faits (journal v2_call_attempts),
// objectifs du jour s'ils existent, commission et show-ups du mois (moteur
// de commissions, via useSetterCommissions tel quel).
export function useSetterDayStats(profile) {
  const userId = profile?.id ?? null
  const fullName = profile?.full_name ?? ''
  const [calls, setCalls] = useState(0)
  const [objectifs, setObjectifs] = useState({ calls: null, bookings: null, showups: null })

  const today = jourMontreal(new Date())
  const monthStart = `${today.slice(0, 7)}-01`
  const month = useSetterCommissions(fullName, monthStart, today)

  const loadCalls = useCallback(async () => {
    if (!userId) return
    const { count, error } = await supabase
      .from('v2_call_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', debutJourMontrealISO())
    if (!error) setCalls(count ?? 0)
  }, [userId])

  useEffect(() => { loadCalls() }, [loadCalls])

  useEffect(() => {
    if (!userId) return
    const lastDay = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
    const monthEnd = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
    supabase
      .from('objectives')
      .select('type, target_value, period_start, period_end')
      .eq('user_id', userId)
      .eq('scope', 'individual')
      .in('type', ['daily_calls', 'daily_bookings', 'setter_showup_target'])
      .lte('period_start', today)
      .gte('period_end', today)
      .then(({ data }) => {
        const pick = type => (data ?? []).find(o => o.type === type)?.target_value ?? null
        // Show-ups : même règle que SetterDashboardView (objectif du mois exact)
        const showup = (data ?? []).find(o => o.type === 'setter_showup_target'
          && o.period_start === monthStart && o.period_end === monthEnd)?.target_value ?? null
        setObjectifs({ calls: pick('daily_calls'), bookings: pick('daily_bookings'), showups: showup })
      })
  }, [userId, today, monthStart])

  const showupCount = month.data?.showupCount ?? 0
  // Même calcul que showupsMissing de SetterDashboardView
  const showupsMissing = objectifs.showups > 0 && showupCount < objectifs.showups ? objectifs.showups - showupCount : null
  const monthlyBonus = profile?.annual_bonus ? Math.round(profile.annual_bonus / 12) : null

  return {
    calls, setCalls, refetchCalls: loadCalls,
    objectifs,
    showupCount,
    commission: month.data?.totalPay ?? 0,
    commissionLoading: month.loading,
    showupsMissing, monthlyBonus,
    detail: month.data,
  }
}
