import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { DELAIS } from '../../lib/v2/salesConfig'
import { useRealtimeRefetch } from './useRealtimeRefetch'

const VERROU_MS = DELAIS.verrouMinutes * 60_000

// Verrous de 15 min sur les leads (table lead_locks).
// locks : { [contact_id]: { userId, prenom, lockedAt } } (verrous encore valides)
export function useLeadLocks(userId) {
  const [locks, setLocks] = useState({})

  const load = useCallback(async () => {
    const since = new Date(Date.now() - VERROU_MS).toISOString()
    const { data, error } = await supabase
      .from('lead_locks')
      .select('contact_id, user_id, locked_at, profiles(full_name)')
      .gte('locked_at', since)
    if (error) { console.error('[useLeadLocks]', error.message); return }
    setLocks(Object.fromEntries((data ?? []).map(l => [l.contact_id, {
      userId: l.user_id,
      prenom: String(l.profiles?.full_name ?? '').split(' ')[0] || 'un collègue',
      lockedAt: l.locked_at,
    }])))
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch(['lead_locks'], load)

  // Prendre un lead : remplace un verrou échu, refuse si un autre le tient
  const lock = useCallback(async (contactId) => {
    if (!userId || !contactId) return { ok: false }
    const cur = locks[contactId]
    if (cur && cur.userId !== userId) return { ok: false, heldBy: cur.prenom }
    await supabase.from('lead_locks').delete().eq('contact_id', contactId)
      .lt('locked_at', new Date(Date.now() - VERROU_MS).toISOString())
    const { error } = await supabase.from('lead_locks')
      .upsert({ contact_id: contactId, user_id: userId, locked_at: new Date().toISOString() }, { onConflict: 'contact_id' })
    if (error) { await load(); return { ok: false, error: error.message } }
    setLocks(prev => ({ ...prev, [contactId]: { userId, prenom: 'toi', lockedAt: new Date().toISOString() } }))
    return { ok: true }
  }, [userId, locks, load])

  const unlock = useCallback(async (contactId) => {
    if (!userId || !contactId) return
    await supabase.from('lead_locks').delete().eq('contact_id', contactId).eq('user_id', userId)
    setLocks(prev => { const n = { ...prev }; delete n[contactId]; return n })
  }, [userId])

  return { locks, lock, unlock, refetch: load }
}

// Verrou tenu par quelqu'un d'autre et encore valide ?
export function verrouAutre(locks, contactId, userId, now = Date.now()) {
  const l = locks?.[contactId]
  if (!l || l.userId === userId) return null
  const age = now - new Date(l.lockedAt).getTime()
  if (age > VERROU_MS) return null
  return { prenom: l.prenom, minutes: Math.max(1, Math.round(age / 60_000)) }
}
