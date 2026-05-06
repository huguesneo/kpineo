import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function usePayPeriodConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('pay_period_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setConfig(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { config, loading, refetch: fetch }
}

// Returns { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } for the period containing today
export function getCurrentPayPeriod(referencePayDate, periodLengthDays = 14) {
  if (!referencePayDate) return null

  // referencePayDate is the LAST day of a period (the pay day)
  const ref = new Date(referencePayDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Start of the first period
  const firstStart = new Date(ref)
  firstStart.setDate(firstStart.getDate() - (periodLengthDays - 1))

  const msSinceFirstStart = today.getTime() - firstStart.getTime()
  const daysSinceFirstStart = Math.floor(msSinceFirstStart / (1000 * 60 * 60 * 24))
  const periodIndex = Math.floor(daysSinceFirstStart / periodLengthDays)

  const start = new Date(firstStart)
  start.setDate(firstStart.getDate() + periodIndex * periodLengthDays)

  const end = new Date(start)
  end.setDate(start.getDate() + periodLengthDays - 1)

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export async function updatePayPeriodConfig(id, referencePayDate, updatedBy) {
  return supabase
    .from('pay_period_config')
    .update({
      reference_pay_date: referencePayDate,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq('id', id)
}
