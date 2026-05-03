import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useQBConnection() {
  const [connected, setConnected] = useState(null) // null = chargement
  const [connectedAt, setConnectedAt] = useState(null)
  const [realmId, setRealmId] = useState(null)

  const check = useCallback(async () => {
    const { data } = await supabase
      .from('quickbooks_tokens')
      .select('realm_id, created_at, updated_at')
      .maybeSingle()
    setConnected(!!data)
    setConnectedAt(data?.updated_at ?? data?.created_at ?? null)
    setRealmId(data?.realm_id ?? null)
  }, [])

  useEffect(() => { check() }, [check])

  return { connected, connectedAt, realmId, refetch: check }
}

export function useQBRevenue() {
  const [revenue, setRevenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetch = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke('quickbooks-revenue', {
      body: { force_refresh: forceRefresh },
    })

    setLoading(false)
    setRefreshing(false)

    if (fnError) { setError(fnError.message); return }
    if (data?.error === 'not_connected') { setRevenue(null); return }
    if (data?.error) { setError(data.error); return }

    setRevenue(data)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { revenue, loading, refreshing, error, refetch: () => fetch(true) }
}

// Rôle → nom du champ custom QuickBooks
export const ROLE_QB_FIELD = {
  naturopathe: 'Thérapeute',
  closer: 'Closer',
  setter: 'Setter',
}

// revenue = { naturopathe: {monthly,prevMonthly,annual}, closer: {...}, setter: {...} }
export function useQBMemberRevenue(firstName) {
  const [revenue, setRevenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (forceRefresh = false) => {
    if (!firstName) { setLoading(false); return }
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke('quickbooks-member-revenue', {
      body: { firstName, force_refresh: forceRefresh },
    })

    setLoading(false)
    setRefreshing(false)

    if (fnError) { setError(fnError.message); return }
    if (data?.error === 'not_connected') { setRevenue(null); return }
    if (data?.error) { setError(data.error); return }

    setRevenue(data)
  }, [firstName])

  useEffect(() => { load() }, [load])

  return { revenue, loading, refreshing, error, refetch: () => load(true) }
}

// ─── Revenus QB d'un mois spécifique (clinique) ──────────────
export function useQBRevenueForMonth(month, year) {
  const [revenue, setRevenue] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!month || !year) return
    setLoading(true)
    setRevenue(null)
    supabase.functions.invoke('quickbooks-revenue', {
      body: { targetMonth: month, targetYear: year },
    }).then(({ data }) => {
      setRevenue(data?.monthly_revenue ?? null)
      setLoading(false)
    })
  }, [month, year])

  return { revenue, loading }
}

// ─── Revenus QB d'un membre pour un mois spécifique ──────────
export function useQBMemberRevenueForMonth(firstName, month, year) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!firstName || !month || !year) return
    setLoading(true)
    setData(null)
    supabase.functions.invoke('quickbooks-member-revenue', {
      body: { firstName, targetMonth: month, targetYear: year },
    }).then(({ data: d }) => {
      setData(d)
      setLoading(false)
    })
  }, [firstName, month, year])

  return { data, loading }
}

// ─── Revenus QB d'un membre pour un trimestre complet ────────
export function useQBMemberRevenueForQuarter(firstName, quarter, year) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!firstName || !quarter || !year) return
    setLoading(true)
    setData(null)
    supabase.functions.invoke('quickbooks-member-revenue', {
      body: { firstName, targetQuarter: quarter, targetYear: year },
    }).then(({ data: d }) => {
      setData(d)
      setLoading(false)
    })
  }, [firstName, quarter, year])

  return { data, loading }
}

export async function connectQuickBooks() {
  const { data, error } = await supabase.functions.invoke('quickbooks-connect')
  if (error || !data?.auth_url) return { error: error?.message ?? 'Erreur de connexion' }
  window.location.href = data.auth_url
  return { error: null }
}

export async function disconnectQuickBooks() {
  // Supprimer les tokens
  const { error: tokErr } = await supabase
    .from('quickbooks_tokens')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000001')

  // Vider le cache
  await supabase
    .from('revenue_cache')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000002')

  return { error: tokErr }
}
