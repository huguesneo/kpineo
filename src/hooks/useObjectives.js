import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useObjectives(userId) {
  const [objectives, setObjectives] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('objectives')
      .select('*')
      .eq('user_id', userId)
      .eq('scope', 'individual')
      .order('period_start', { ascending: false })
    if (err) setError(err.message)
    else setObjectives(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { objectives, loading, error, refetch: fetch }
}

export function useClinicObjectives() {
  const [objectives, setObjectives] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('objectives')
      .select('*')
      .eq('scope', 'clinic')
      .order('period_start', { ascending: false })
    setObjectives(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { objectives, loading, refetch: fetch }
}

export async function createObjective(objective) {
  const { data, error } = await supabase
    .from('objectives')
    .insert(objective)
    .select()
    .single()
  return { data, error }
}

export async function deleteObjective(id) {
  const { error } = await supabase.from('objectives').delete().eq('id', id)
  return { error }
}

export async function setObjectiveForPeriod({ user_id, type, target_value, period_start, period_end }) {
  const { data: existing } = await supabase
    .from('objectives')
    .select('id')
    .eq('user_id', user_id)
    .eq('type', type)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .eq('scope', 'individual')
    .maybeSingle()

  if (!target_value || Number(target_value) === 0) {
    if (existing) {
      const { error } = await supabase.from('objectives').delete().eq('id', existing.id)
      return { error }
    }
    return { error: null }
  }

  if (existing) {
    const { error } = await supabase.from('objectives').update({ target_value: Number(target_value) }).eq('id', existing.id)
    return { error }
  }

  const { error } = await supabase.from('objectives')
    .insert({ user_id, type, target_value: Number(target_value), period_start, period_end, scope: 'individual' })
  return { error }
}

export const OBJECTIVE_TYPES_BY_ROLE = {
  naturopathe: [
    { value: 'monthly_revenue', label: 'Objectif mensuel revenus ($)' },
    { value: 'monthly_consultations', label: 'Objectif mensuel consultations' },
    { value: 'quarterly_revenue', label: 'Objectif trimestriel revenus ($)' },
    { value: 'quarterly_consultations', label: 'Objectif trimestriel consultations' },
  ],
  closer: [
    { value: 'daily_calls', label: 'Appels par jour' },
    { value: 'daily_closes', label: 'Closes par jour' },
  ],
  setter: [
    { value: 'daily_calls', label: 'Appels par jour' },
    { value: 'daily_bookings', label: 'Rendez-vous bookés par jour' },
  ],
}

export const CLINIC_OBJECTIVE_TYPES = [
  { value: 'clinic_revenue', label: 'Revenu clinique mensuel ($)' },
  { value: 'clinic_revenue_annual', label: 'Revenu clinique annuel ($)' },
]

export const OBJECTIVE_TYPE_LABELS = {
  monthly_revenue: 'Revenus mensuels ($)',
  monthly_consultations: 'Consultations mensuelles',
  quarterly_revenue: 'Revenus trimestriels ($)',
  quarterly_consultations: 'Consultations trimestrielles',
  daily_calls: 'Appels par jour',
  daily_closes: 'Closes par jour',
  daily_bookings: 'Rendez-vous bookés/jour',
  clinic_revenue: 'Revenu clinique mensuel',
  clinic_revenue_annual: 'Revenu clinique annuel',
}
