import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function usePunchEntries(userId, year = null) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setEntries([]); setLoading(false); return }
    let query = supabase
      .from('daily_punch_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    if (year) {
      query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
    }
    const { data } = await query
    setEntries(data ?? [])
    setLoading(false)
  }, [userId, year])

  useEffect(() => { fetch() }, [fetch])
  return { entries, loading, refetch: fetch }
}

export async function upsertPunchEntry({ user_id, date, hours, notes }) {
  return supabase.from('daily_punch_entries').upsert(
    { user_id, date, hours: Number(hours), notes: notes || null },
    { onConflict: 'user_id,date' }
  )
}

export async function deletePunchEntry(id) {
  return supabase.from('daily_punch_entries').delete().eq('id', id)
}
