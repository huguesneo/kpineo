import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useScheduleOverrides(userId) {
  const [overrides, setOverrides] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('schedule_overrides')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setOverrides(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])
  return { overrides, loading, refetch: fetch }
}

export async function createScheduleOverride({ user_id, start_date, end_date, days, notes }) {
  return supabase.from('schedule_overrides').insert({
    user_id,
    start_date,
    end_date,
    days: days ?? [],
    notes: notes || null,
    status: 'pending',
  })
}

export async function approveScheduleOverride(id, adminId) {
  return supabase.from('schedule_overrides')
    .update({ status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
}

export async function rejectScheduleOverride(id, adminId, reason = null) {
  return supabase.from('schedule_overrides')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function deleteScheduleOverride(id) {
  return supabase.from('schedule_overrides').delete().eq('id', id)
}
