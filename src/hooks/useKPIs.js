import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { startOfWeek, startOfMonth, startOfQuarter, endOfMonth, endOfQuarter, format } from 'date-fns'

export function useKPIEntries(filters = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('kpi_entries')
      .select('*, profiles(full_name, role)')
      .order('entry_date', { ascending: false })

    if (filters.userId) query = query.eq('user_id', filters.userId)
    if (filters.scope) query = query.eq('scope', filters.scope)
    if (filters.dateFrom) query = query.gte('entry_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('entry_date', filters.dateTo)

    const { data, error: err } = await query
    if (err) setError(err.message)
    else setEntries(data || [])
    setLoading(false)
  }, [filters.userId, filters.scope, filters.dateFrom, filters.dateTo])

  useEffect(() => { fetch() }, [fetch])

  return { entries, loading, error, refetch: fetch }
}

export function useClinicKPIEntries(filters = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('kpi_entries')
      .select('*')
      .eq('scope', 'clinic')
      .order('entry_date', { ascending: false })

    if (filters.dateFrom) query = query.gte('entry_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('entry_date', filters.dateTo)

    const { data } = await query
    setEntries(data || [])
    setLoading(false)
  }, [filters.dateFrom, filters.dateTo])

  useEffect(() => { fetch() }, [fetch])

  return { entries, loading, refetch: fetch }
}

export function useEODReports(filters = {}) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('end_of_day_reports')
      .select('*, profiles(full_name, role)')
      .order('report_date', { ascending: false })

    if (filters.userId) query = query.eq('user_id', filters.userId)
    if (filters.dateFrom) query = query.gte('report_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('report_date', filters.dateTo)

    const { data } = await query
    setReports(data || [])
    setLoading(false)
  }, [filters.userId, filters.dateFrom, filters.dateTo])

  useEffect(() => { fetch() }, [fetch])

  return { reports, loading, refetch: fetch }
}

export function getPeriodDates(period) {
  const now = new Date()
  switch (period) {
    case 'semaine':
      return {
        from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        to: format(now, 'yyyy-MM-dd'),
      }
    case 'trimestre':
      return {
        from: format(startOfQuarter(now), 'yyyy-MM-dd'),
        to: format(endOfQuarter(now), 'yyyy-MM-dd'),
      }
    default:
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      }
  }
}

export const KPI_TYPE_LABELS = {
  monthly_revenue: 'Revenus ($)',
  monthly_consultations: 'Consultations',
  quarterly_revenue: 'Revenus trim. ($)',
  quarterly_consultations: 'Consultations trim.',
  daily_calls: 'Appels',
  daily_closes: 'Closes',
  daily_bookings: 'Rendez-vous bookés',
  clinic_revenue: 'Revenu clinique ($)',
}

export const CLINIC_KPI_TYPES = [
  { value: 'clinic_revenue', label: 'Revenu clinique ($)' },
]

export const KPI_TYPES_BY_ROLE = {
  naturopathe: [
    { value: 'monthly_revenue', label: 'Revenus ($)' },
    { value: 'monthly_consultations', label: 'Consultations' },
  ],
  closer: [
    { value: 'daily_calls', label: 'Appels' },
    { value: 'daily_closes', label: 'Closes' },
  ],
  setter: [
    { value: 'daily_calls', label: 'Appels' },
    { value: 'daily_bookings', label: 'Rendez-vous bookés' },
  ],
  service_client: [],
  resp_vente:     [],
}
