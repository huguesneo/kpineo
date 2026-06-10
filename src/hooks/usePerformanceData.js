import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PARAMS_DEFAULTS = {
  id: 1,
  loyer: 9680, amortissement: 1403, auto_fixe: 3446, essence: 600,
  telecom: 286, abonnements: 500, outils_info: 1000,
  salaire_thibault: 130000, salaire_brice: 64240, salaire_jessica: 82600, salaire_tamara: 70342,
  charges_sociales_pct: 0.16, cogs_ratio: 0.1084, marge_incrementale: 0.55,
  reer_plancher: 17000, reer_match_cap_pct: 0.03,
  marge_seuil_thibault: 15.0, marge_seuil_brice: 15.0, marge_seuil_jessica: 12.0, marge_seuil_tamara: 12.0,
  objectif_debut_thibault: null, objectif_debut_brice: null, objectif_debut_jessica: null, objectif_debut_tamara: null,
}

export function usePerformanceData() {
  const [months, setMonths] = useState([])
  const [params, setParams] = useState(PARAMS_DEFAULTS)
  const [margeHistorique, setMargeHistorique] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [metricsRes, paramsRes, histoRes] = await Promise.all([
      supabase.from('neo_monthly_metrics').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('neo_performance_params').select('*').eq('id', 1).maybeSingle(),
      supabase.from('neo_reer_marge_historique').select('*').order('date_effet', { ascending: false }),
    ])

    if (metricsRes.error) setError(metricsRes.error.message)
    else setMonths(metricsRes.data || [])

    if (paramsRes.data) setParams({ ...PARAMS_DEFAULTS, ...paramsRes.data })
    if (histoRes.data) setMargeHistorique(histoRes.data)

    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const getMonthData = useCallback((year, month) => {
    return months.find(m => m.year === year && m.month === month) || null
  }, [months])

  const selectMonth = useCallback((year, month) => {
    setSelectedMonth({ year, month })
  }, [])

  const saveMonth = useCallback(async (data) => {
    const payload = { ...data, updated_at: new Date().toISOString() }
    const { data: saved, error: err } = await supabase
      .from('neo_monthly_metrics')
      .upsert(payload, { onConflict: 'year,month' })
      .select()
      .single()
    if (err) return { error: err }
    setMonths(prev => {
      const idx = prev.findIndex(m => m.year === saved.year && m.month === saved.month)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev].sort((a, b) => b.year - a.year || b.month - a.month)
    })
    return { data: saved }
  }, [])

  const saveParams = useCallback(async (data) => {
    const payload = { ...data, id: 1, updated_at: new Date().toISOString() }
    const { data: saved, error: err } = await supabase
      .from('neo_performance_params')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single()
    if (err) return { error: err }
    setParams({ ...PARAMS_DEFAULTS, ...saved })
    return { data: saved }
  }, [])

  // Sauvegarde les seuils de marge + dates d'objectif, et journalise les changements.
  // paramUpdates : { marge_seuil_*, objectif_debut_* }
  // historyRows  : [{ naturo, ancien_seuil, nouveau_seuil, date_effet, note }]
  const saveMargeConfig = useCallback(async (paramUpdates, historyRows = []) => {
    const { data: saved, error: err } = await supabase
      .from('neo_performance_params')
      .update({ ...paramUpdates, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single()
    if (err) return { error: err }
    setParams({ ...PARAMS_DEFAULTS, ...saved })

    if (historyRows.length) {
      const { data: inserted } = await supabase
        .from('neo_reer_marge_historique')
        .insert(historyRows)
        .select()
      if (inserted) setMargeHistorique(prev => [...inserted, ...prev].sort((a, b) => new Date(b.date_effet) - new Date(a.date_effet)))
    }
    return { data: saved }
  }, [])

  return {
    months,
    params,
    margeHistorique,
    selectedMonth,
    loading,
    error,
    saveMonth,
    saveParams,
    saveMargeConfig,
    selectMonth,
    getMonthData,
    refetch: fetchAll,
  }
}
