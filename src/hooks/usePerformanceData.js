import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  NATUROS, calcProfitNEO, calcREER, hasMonthData,
} from '../lib/performanceCalc'

// Construit les lignes d'instantané (1 par naturo × mois saisi) à publier.
function buildSnapshotRows(months, params) {
  const rows = []
  ;(months || []).filter(hasMonthData).forEach(m => {
    const neo = calcProfitNEO(m, params)
    const reer = calcREER(m, params)
    NATUROS.forEach(n => {
      const info = reer.perNaturo[n.key]
      // Champs CALCULÉS uniquement. On n'inclut PAS montant_naturo / proof_path /
      // montant_neo / eligible : ils sont gérés par le naturo (soumission) et par
      // l'admin (confirmation), et ne doivent jamais être écrasés par une publication.
      // own_profit n'est PAS exposé au naturo (il voit sa marge, pas son profit).
      rows.push({
        naturo_key: n.key,
        year: m.year,
        month: m.month,
        visible: !!params[`reer_visible_${n.key}`],
        profit_neo: neo.profit_neo,
        depenses_total: neo.total_couts,
        plancher: reer.plancher,
        plancher_atteint: reer.plancherAtteint,
        own_revenue: info.revenu,
        own_profit: null,
        own_marge: info.marge,
        marge_seuil: info.seuil,
        marge_ok: info.margeOK,
        published_at: new Date().toISOString(),
      })
    })
  })
  return rows
}

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
  const [naturoProfiles, setNaturoProfiles] = useState([])
  const [naturoSnapshots, setNaturoSnapshots] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [metricsRes, paramsRes, histoRes, profilesRes, snapsRes] = await Promise.all([
      supabase.from('neo_monthly_metrics').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('neo_performance_params').select('*').eq('id', 1).maybeSingle(),
      supabase.from('neo_reer_marge_historique').select('*').order('date_effet', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, role, perf_naturo_key').order('full_name'),
      supabase.from('neo_naturo_monthly').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
    ])

    if (metricsRes.error) setError(metricsRes.error.message)
    else setMonths(metricsRes.data || [])

    if (paramsRes.data) setParams({ ...PARAMS_DEFAULTS, ...paramsRes.data })
    if (histoRes.data) setMargeHistorique(histoRes.data)
    if (profilesRes.data) setNaturoProfiles(profilesRes.data)
    if (snapsRes.data) setNaturoSnapshots(snapsRes.data)

    setLoading(false)
  }, [])

  const refetchSnapshots = useCallback(async () => {
    const { data } = await supabase.from('neo_naturo_monthly').select('*')
      .order('year', { ascending: false }).order('month', { ascending: false })
    if (data) setNaturoSnapshots(data)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const getMonthData = useCallback((year, month) => {
    return months.find(m => m.year === year && m.month === month) || null
  }, [months])

  const selectMonth = useCallback((year, month) => {
    setSelectedMonth({ year, month })
  }, [])

  // Refs vers le dernier état committé (pour publier avec des données fraîches)
  const monthsRef = useRef([])
  const paramsRef = useRef(PARAMS_DEFAULTS)
  useEffect(() => { monthsRef.current = months }, [months])
  useEffect(() => { paramsRef.current = params }, [params])

  // Publie / régénère les instantanés naturo (upsert). Best-effort.
  const publishNaturoSnapshots = useCallback(async (monthsArg, paramsArg) => {
    const rows = buildSnapshotRows(monthsArg ?? monthsRef.current, paramsArg ?? paramsRef.current)
    if (!rows.length) return { data: [] }
    const { error } = await supabase
      .from('neo_naturo_monthly')
      .upsert(rows, { onConflict: 'naturo_key,year,month' })
    if (!error) await refetchSnapshots()
    return { error }
  }, [refetchSnapshots])

  const saveMonth = useCallback(async (data) => {
    const payload = { ...data, updated_at: new Date().toISOString() }
    const { data: saved, error: err } = await supabase
      .from('neo_monthly_metrics')
      .upsert(payload, { onConflict: 'year,month' })
      .select()
      .single()
    if (err) return { error: err }
    const prev = monthsRef.current
    const idx = prev.findIndex(m => m.year === saved.year && m.month === saved.month)
    const next = idx >= 0
      ? prev.map((m, i) => (i === idx ? saved : m))
      : [saved, ...prev].sort((a, b) => b.year - a.year || b.month - a.month)
    monthsRef.current = next
    setMonths(next)
    publishNaturoSnapshots(next, paramsRef.current)
    return { data: saved }
  }, [publishNaturoSnapshots])

  const saveParams = useCallback(async (data) => {
    const payload = { ...data, id: 1, updated_at: new Date().toISOString() }
    const { data: saved, error: err } = await supabase
      .from('neo_performance_params')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single()
    if (err) return { error: err }
    const merged = { ...PARAMS_DEFAULTS, ...saved }
    paramsRef.current = merged
    setParams(merged)
    publishNaturoSnapshots(monthsRef.current, merged)
    return { data: saved }
  }, [publishNaturoSnapshots])

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
    const merged = { ...PARAMS_DEFAULTS, ...saved }
    paramsRef.current = merged
    setParams(merged)

    if (historyRows.length) {
      const { data: inserted } = await supabase
        .from('neo_reer_marge_historique')
        .insert(historyRows)
        .select()
      if (inserted) setMargeHistorique(prev => [...inserted, ...prev].sort((a, b) => new Date(b.date_effet) - new Date(a.date_effet)))
    }
    publishNaturoSnapshots(monthsRef.current, merged)
    return { data: saved }
  }, [publishNaturoSnapshots])

  // Active/désactive l'affichage du REER pour un naturo, puis republie.
  const saveReerVisibility = useCallback(async (naturoKey, visible) => {
    const col = `reer_visible_${naturoKey}`
    const { data: saved, error: err } = await supabase
      .from('neo_performance_params')
      .update({ [col]: visible, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single()
    if (err) return { error: err }
    const merged = { ...PARAMS_DEFAULTS, ...saved }
    paramsRef.current = merged
    setParams(merged)
    await publishNaturoSnapshots(monthsRef.current, merged)
    return { data: saved }
  }, [publishNaturoSnapshots])

  // L'admin confirme le montant que NEO verse (visible ensuite par le naturo).
  const confirmNeoContribution = useCallback(async (naturoKey, year, month, montantNeo) => {
    const { error } = await supabase
      .from('neo_naturo_monthly')
      .update({ montant_neo: Number(montantNeo) || 0, neo_confirmed_at: new Date().toISOString() })
      .eq('naturo_key', naturoKey).eq('year', year).eq('month', month)
    if (error) return { error }
    await refetchSnapshots()
    return {}
  }, [refetchSnapshots])

  // Lie un compte (profile) à une clé naturo (et délie tout autre compte sur cette clé).
  const linkNaturoAccount = useCallback(async (naturoKey, profileId) => {
    // Délier les autres comptes qui portaient cette clé
    await supabase.from('profiles').update({ perf_naturo_key: null })
      .eq('perf_naturo_key', naturoKey).neq('id', profileId || '00000000-0000-0000-0000-000000000000')
    if (profileId) {
      await supabase.from('profiles').update({ perf_naturo_key: naturoKey }).eq('id', profileId)
    }
    const { data } = await supabase
      .from('profiles').select('id, full_name, email, role, perf_naturo_key').order('full_name')
    if (data) setNaturoProfiles(data)
    return { data }
  }, [])

  return {
    months,
    params,
    margeHistorique,
    naturoProfiles,
    naturoSnapshots,
    selectedMonth,
    loading,
    error,
    saveMonth,
    saveParams,
    saveMargeConfig,
    saveReerVisibility,
    linkNaturoAccount,
    confirmNeoContribution,
    publishNaturoSnapshots,
    refetchSnapshots,
    selectMonth,
    getMonthData,
    refetch: fetchAll,
  }
}
