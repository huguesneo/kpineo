import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useScheduleAdjustments(userId) {
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('schedule_adjustments')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    setAdjustments(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])
  return { adjustments, loading, refetch: fetch }
}

export async function createAdjustment(data) {
  return supabase.from('schedule_adjustments').insert(data)
}

export async function approveAdjustment(id, adminUserId) {
  return supabase.from('schedule_adjustments')
    .update({ status: 'approved', reviewed_by: adminUserId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
}

export async function rejectAdjustment(id, adminUserId, reason = null) {
  return supabase.from('schedule_adjustments')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function deleteAdjustment(id) {
  return supabase.from('schedule_adjustments').delete().eq('id', id)
}
