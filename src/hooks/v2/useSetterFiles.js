import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/ghlHelpers'
import { computeSetterFiles } from '../../lib/v2/setterFiles'
import { PIPELINE_SETTING, PIPELINE_VENTE, DELAIS } from '../../lib/v2/salesConfig'
import { useRealtimeRefetch } from './useRealtimeRefetch'

const HEURE = 3_600_000
// Fenêtre de RDV lue : 72 h en arrière (rebooking), 30 jours en avant (prochain RDV, bookés du jour)
const JOURS_AVANT = 30

// Les 4 files du setter, calculées depuis le cache GHL (ghl_opportunities,
// ghl_appointments). Temps réel + refetch de secours.
export function useSetterFiles({ enabled = true } = {}) {
  const [raw, setRaw] = useState({ opps: [], appts: [], userNames: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadedAt, setLoadedAt] = useState(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    setError(null)
    try {
      const now = Date.now()
      const from = new Date(now - DELAIS.rebookerHeures * HEURE).toISOString()
      const to   = new Date(now + JOURS_AVANT * 24 * HEURE).toISOString()
      const [opps, appts, { data: profiles }] = await Promise.all([
        fetchAllRows((a, b) => supabase
          .from('ghl_opportunities')
          .select('ghl_id, contact_id, contact_name, pipeline_id, pipeline_stage_id, stage_name, source, created_at_ghl, monetary_value, raw')
          .in('pipeline_id', [PIPELINE_SETTING.id, PIPELINE_VENTE.id])
          .order('id')
          .range(a, b)),
        fetchAllRows((a, b) => supabase
          .from('ghl_appointments')
          .select('ghl_id, calendar_id, contact_id, contact_name, assigned_user_id, start_time, status, date_added:raw->>dateAdded')
          .gte('start_time', from)
          .lte('start_time', to)
          .order('id')
          .range(a, b)),
        supabase.from('profiles').select('full_name, ghl_user_id').not('ghl_user_id', 'is', null),
      ])
      const userNames = Object.fromEntries((profiles ?? []).map(p => [p.ghl_user_id, p.full_name]))
      setRaw({ opps, appts, userNames })
      setLoadedAt(new Date())
    } catch (err) {
      console.error('[useSetterFiles]', err)
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(['ghl_opportunities', 'ghl_appointments'], load, { enabled })

  // Recalcul chaque minute : un RDV passe de « à confirmer » à « passé » sans événement
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(iv)
  }, [])

  const files = useMemo(
    () => computeSetterFiles({ ...raw, now: Date.now() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, tick],
  )

  return { files, raw, loading, error, loadedAt, refetch: load }
}
