import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { DELAIS } from '../../lib/v2/salesConfig'

// Relance `refetch` à chaque changement Realtime sur `tables` (debounce 2 s),
// plus un refetch de secours toutes les 5 minutes si un événement se perd.
export function useRealtimeRefetch(tables, refetch, { enabled = true } = {}) {
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch }, [refetch])
  const key = tables.join(',')

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    const trigger = () => {
      clearTimeout(timer)
      timer = setTimeout(() => refetchRef.current?.(), DELAIS.debounceRealtimeMs)
    }

    const channel = supabase.channel(`v2-${key}-${Math.random().toString(36).slice(2, 8)}`)
    key.split(',').forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, trigger)
    })
    channel.subscribe()

    const secours = setInterval(() => refetchRef.current?.(), DELAIS.refetchSecoursMs)

    return () => {
      clearTimeout(timer)
      clearInterval(secours)
      supabase.removeChannel(channel)
    }
  }, [key, enabled])
}
