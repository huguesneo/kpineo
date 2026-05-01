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
