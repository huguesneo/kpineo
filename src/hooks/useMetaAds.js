import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useMetaCampaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('meta_campaigns')
      .select('*')
      .order('synced_at', { ascending: false })
    setCampaigns(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { campaigns, loading, refetch: load }
}

export function useMetaAds(campaignId = null) {
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('meta_ads').select('*').order('spend', { ascending: false })
    if (campaignId) q = q.eq('campaign_id', campaignId)
    const { data } = await q
    setAds(data ?? [])
    setLoading(false)
  }, [campaignId])

  useEffect(() => { load() }, [load])

  return { ads, loading, refetch: load }
}

export function useMetaSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error, setError] = useState(null)

  async function sync() {
    setSyncing(true)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('meta-ads-sync', {
      body: { action: 'sync_all' },
    })
    setSyncing(false)
    if (fnError || data?.error) {
      setError(fnError?.message ?? data?.error)
      return false
    }
    setLastSync(new Date())
    return true
  }

  return { sync, syncing, lastSync, error }
}

export function useMetaAttribution(dateStart, dateEnd) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)   // lecture cache (rapide)
  const [computing, setComputing] = useState(false) // recalcul live (lent)
  const [computedAt, setComputedAt] = useState(null)
  const [error, setError] = useState(null)

  // Lecture instantanée depuis le cache Supabase
  const loadCache = useCallback(async () => {
    if (!dateStart || !dateEnd) return false
    setLoading(true)
    const { data: row } = await supabase
      .from('meta_attribution_cache')
      .select('payload, computed_at')
      .eq('cache_key', `${dateStart}_${dateEnd}`)
      .maybeSingle()
    setLoading(false)
    if (row?.payload) { setData(row.payload); setComputedAt(row.computed_at); return true }
    return false
  }, [dateStart, dateEnd])

  // Recalcul live (appelle l'Edge Function — lent car interroge QuickBooks)
  const recompute = useCallback(async () => {
    if (!dateStart || !dateEnd) return
    setComputing(true)
    setError(null)
    const { data: res, error: fnError } = await supabase.functions.invoke('meta-attribution', {
      body: { startDate: dateStart, endDate: dateEnd },
    })
    setComputing(false)
    if (fnError || res?.error) { setError(fnError?.message ?? res?.error); return }
    setData(res)
    setComputedAt(new Date().toISOString())
  }, [dateStart, dateEnd])

  return { data, loading, computing, computedAt, error, loadCache, recompute }
}

export function useMetaInsightsByDate() {
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchByDate(dateStart, dateEnd) {
    setLoading(true)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('meta-ads-sync', {
      body: { action: 'fetch_insights', date_start: dateStart, date_end: dateEnd },
    })
    setLoading(false)
    if (fnError || data?.error) {
      setError(fnError?.message ?? data?.error)
      return
    }
    setInsights(data?.data ?? [])
  }

  return { insights, loading, error, fetchByDate }
}

export function useMetaStats(ads = []) {
  if (!ads.length) return null

  const totalSpend     = ads.reduce((s, a) => s + Number(a.spend ?? 0), 0)
  const totalLeads     = ads.reduce((s, a) => s + Number(a.leads ?? 0), 0)
  const totalClicks    = ads.reduce((s, a) => s + Number(a.clicks ?? 0), 0)
  const totalImpressions = ads.reduce((s, a) => s + Number(a.impressions ?? 0), 0)
  const totalPurchases = ads.reduce((s, a) => s + Number(a.purchases ?? 0), 0)
  const totalRevenue   = ads.reduce((s, a) => s + Number(a.purchase_value ?? 0), 0)

  const cpl  = totalLeads > 0 ? totalSpend / totalLeads : 0
  const cpc  = totalClicks > 0 ? totalSpend / totalClicks : 0
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0
  const ctr  = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

  return { totalSpend, totalLeads, totalClicks, totalImpressions, totalPurchases, totalRevenue, cpl, cpc, roas, ctr }
}
