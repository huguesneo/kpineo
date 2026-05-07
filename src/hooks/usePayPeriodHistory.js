import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { eachDayOfInterval, parseISO } from 'date-fns'

const JS_DAY_TO_KEY = ['sunday_hours','monday_hours','tuesday_hours','wednesday_hours','thursday_hours','friday_hours','saturday_hours']

function getActiveSchedule(schedules, dateStr) {
  return schedules.find(s =>
    s.effective_from <= dateStr && (s.effective_to == null || s.effective_to >= dateStr)
  ) ?? null
}

export function calcPayPeriodHoursWithAdjustments(schedules, adjustments, periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return 0
  const approvedAdj = new Map(
    (adjustments ?? [])
      .filter(a => a.status === 'approved' && a.date >= periodStart && a.date <= periodEnd)
      .map(a => [a.date, a])
  )
  try {
    return eachDayOfInterval({ start: parseISO(periodStart), end: parseISO(periodEnd) })
      .reduce((total, d) => {
        const ds = d.toISOString().split('T')[0]
        const adj = approvedAdj.get(ds)
        if (adj) {
          const delta = Number(adj.adjusted_hours) - Number(adj.normal_hours)
          return total + (delta >= 0
            ? Number(adj.normal_hours)
            : Number(adj.adjusted_hours) + Number(adj.bank_hours_applied ?? 0))
        }
        const s = getActiveSchedule(schedules, ds)
        return total + (s ? Number(s[JS_DAY_TO_KEY[d.getDay()]] ?? 0) : 0)
      }, 0)
  } catch { return 0 }
}

// Génère toutes les périodes de paie depuis la première jusqu'à aujourd'hui (+ quelques à venir)
export function getAllPayPeriods(referencePayDate, periodLengthDays = 14, countBack = 25) {
  if (!referencePayDate) return []

  const ref = new Date(referencePayDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const firstStart = new Date(ref)
  firstStart.setDate(firstStart.getDate() - (periodLengthDays - 1))

  const msSinceFirstStart = today.getTime() - firstStart.getTime()
  const daysSinceFirstStart = Math.floor(msSinceFirstStart / (1000 * 60 * 60 * 24))
  const currentIndex = Math.max(0, Math.floor(daysSinceFirstStart / periodLengthDays))

  const periods = []
  for (let i = currentIndex; i >= Math.max(0, currentIndex - countBack); i--) {
    const start = new Date(firstStart)
    start.setDate(firstStart.getDate() + i * periodLengthDays)
    const end = new Date(start)
    end.setDate(start.getDate() + periodLengthDays - 1)
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]
    periods.push({
      start: startStr,
      end: endStr,
      isCurrent: i === currentIndex,
      isPast: i < currentIndex,
    })
  }
  return periods
}

export function usePayPeriodOverrides(userId) {
  const [overrides, setOverrides] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('pay_period_overrides')
      .select('*')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
    setOverrides(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])
  return { overrides, loading, refetch: fetch }
}

export async function upsertPayPeriodOverride({ user_id, period_start, override_hours, notes, updated_by }) {
  return supabase.from('pay_period_overrides').upsert(
    {
      user_id, period_start,
      override_hours: Number(override_hours),
      notes: notes || null,
      updated_by,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,period_start' }
  )
}

export async function deletePayPeriodOverride(id) {
  return supabase.from('pay_period_overrides').delete().eq('id', id)
}
