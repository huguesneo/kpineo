import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Test de connexion + discovery des locations ──────────────
export function useGHLConnection(savedLocationId = null, configReady = false) {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const check = useCallback(async (locId) => {
    setLoading(true)
    setError(null)
    const body = { action: 'test' }
    if (locId) body.locationId = locId
    const { data, error: fnError } = await supabase.functions.invoke('gohighlevel-sync', { body })
    setLoading(false)
    if (fnError || data?.error) { setError(fnError?.message ?? data?.error); return }
    setLocations(data?.locations ?? [])
  }, [])

  useEffect(() => {
    if (!configReady) return
    check(savedLocationId)
  }, [check, savedLocationId, configReady])

  return { locations, loading, error, refetch: () => check(savedLocationId) }
}

// ─── Config (location ID sauvegardée) ────────────────────────
export function useGHLConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('ghl_config').select('*').maybeSingle()
    setConfig(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveLocationId(locationId, name = '') {
    await supabase.from('ghl_config').upsert({ location_id: locationId, name }, { onConflict: 'location_id' })
    await load()
  }

  return { config, loading, saveLocationId, refetch: load }
}

// ─── Sync contacts depuis GHL ────────────────────────────────
export async function syncGHLContacts(locationId) {
  const { data, error } = await supabase.functions.invoke('gohighlevel-sync', {
    body: { action: 'sync_contacts', locationId },
  })
  return { data, error: error?.message ?? data?.error ?? null }
}

// ─── Sync opportunités depuis GHL ────────────────────────────
export async function syncGHLOpportunities(locationId) {
  const { data, error } = await supabase.functions.invoke('gohighlevel-sync', {
    body: { action: 'sync_opportunities', locationId },
  })
  return { data, error: error?.message ?? data?.error ?? null }
}

// ─── Contacts depuis le cache Supabase ───────────────────────
export function useGHLContacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('ghl_contacts').select('*').order('created_at_ghl', { ascending: false })
      .then(({ data }) => { setContacts(data || []); setLoading(false) })
  }, [])

  return { contacts, loading }
}

// ─── Opportunités / leads depuis le cache Supabase ───────────
export function useGHLOpportunities({ status, pipelineId } = {}) {
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let q = supabase.from('ghl_opportunities').select('*').order('created_at_ghl', { ascending: false })
    if (status) q = q.eq('status', status)
    if (pipelineId) q = q.eq('pipeline_id', pipelineId)
    q.then(({ data }) => { setOpportunities(data || []); setLoading(false) })
  }, [status, pipelineId])

  return { opportunities, loading }
}

// ─── Stats agrégées (pour dashboard) ─────────────────────────
export function useGHLStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

      const [contactsRes, oppsRes, wonRes] = await Promise.all([
        supabase.from('ghl_contacts').select('id', { count: 'exact', head: true })
          .gte('created_at_ghl', monthStart).lte('created_at_ghl', monthEnd),
        supabase.from('ghl_opportunities').select('id', { count: 'exact', head: true })
          .gte('created_at_ghl', monthStart).lte('created_at_ghl', monthEnd),
        supabase.from('ghl_opportunities').select('monetary_value')
          .eq('status', 'won').gte('closed_at', monthStart).lte('closed_at', monthEnd),
      ])

      const wonRevenue = (wonRes.data || []).reduce((s, o) => s + Number(o.monetary_value ?? 0), 0)

      setStats({
        leadsThisMonth: contactsRes.count ?? 0,
        opportunitiesThisMonth: oppsRes.count ?? 0,
        wonRevenue,
        closeRate: oppsRes.count > 0
          ? Math.round(((wonRes.data?.length ?? 0) / oppsRes.count) * 100)
          : 0,
      })
      setLoading(false)
    }
    load()
  }, [])

  return { stats, loading }
}
