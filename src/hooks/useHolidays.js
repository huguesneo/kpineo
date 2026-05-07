import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useHolidays(year = null) {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('holidays').select('*').order('date')
    if (year) q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
    const { data } = await q
    setHolidays(data ?? [])
    setLoading(false)
  }, [year])

  useEffect(() => { fetch() }, [fetch])
  return { holidays, loading, refetch: fetch }
}

export function useUpcomingHolidays(withinDays = 14) {
  const [holidays, setHolidays] = useState([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const future = new Date()
    future.setDate(future.getDate() + withinDays)
    const futureStr = future.toISOString().split('T')[0]
    supabase.from('holidays').select('*')
      .gte('date', today).lte('date', futureStr).order('date')
      .then(({ data }) => setHolidays(data ?? []))
  }, [withinDays])

  return holidays
}

export async function createHoliday({ date, name, created_by }) {
  return supabase.from('holidays').insert({ date, name, created_by })
}

export async function deleteHoliday(id) {
  return supabase.from('holidays').delete().eq('id', id)
}
