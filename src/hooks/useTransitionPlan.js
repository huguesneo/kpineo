import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTransitionPlans(userId) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('transition_plans')
      .select('*')
      .eq('user_id', userId)
      .order('month', { ascending: true })
    setPlans(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { plans, loading, refetch: fetch }
}

export function useVisibleTransitionPlans(userId) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('transition_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('visible_to_member', true)
      .order('month', { ascending: true })
    setPlans(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { plans, loading, refetch: fetch }
}

export async function upsertTransitionPlan({ id, user_id, month, time_split, focus_items, notes, visible_to_member }) {
  const payload = {
    user_id,
    month,
    time_split: time_split || null,
    focus_items: focus_items ?? [],
    notes: notes || null,
    visible_to_member: visible_to_member ?? false,
  }
  if (id) {
    const { error } = await supabase.from('transition_plans').update(payload).eq('id', id)
    return { error }
  }
  const { error } = await supabase.from('transition_plans').insert(payload)
  return { error }
}

export async function deleteTransitionPlan(id) {
  const { error } = await supabase.from('transition_plans').delete().eq('id', id)
  return { error }
}

export async function toggleTransitionPlanVisibility(id, visible) {
  const { error } = await supabase
    .from('transition_plans')
    .update({ visible_to_member: visible })
    .eq('id', id)
  return { error }
}
