import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { updateUserPoints } from './usePoints'

// ─── Catalog ─────────────────────────────────────────────────────────────────

export function useRewardsCatalog(includeInactive = false) {
  const [rewards, setRewards] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('rewards_catalog')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (!includeInactive) q = q.eq('is_active', true)
    const { data } = await q
    setRewards(data ?? [])
    setLoading(false)
  }, [includeInactive])

  useEffect(() => { fetch() }, [fetch])
  return { rewards, loading, refetch: fetch }
}

export async function createReward(payload) {
  const { data, error } = await supabase
    .from('rewards_catalog')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

export async function updateReward(id, updates) {
  const { data, error } = await supabase
    .from('rewards_catalog')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteReward(id) {
  const { error } = await supabase.from('rewards_catalog').delete().eq('id', id)
  return { error }
}

export async function reorderRewards(updates) {
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('rewards_catalog').update({ sort_order }).eq('id', id)
    )
  )
}

// ─── Redemptions ─────────────────────────────────────────────────────────────

/**
 * @param {string|null} userId — null = admin (all redemptions), string = member (own only)
 * @param {string|null} status — optional filter
 */
export function useRedemptions(userId = null, statusFilter = null) {
  const [redemptions, setRedemptions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('redemptions')
      .select('*, reward:rewards_catalog(*), profile:profiles(id, full_name, role)')
      .order('redeemed_at', { ascending: false })
    if (userId) q = q.eq('user_id', userId)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    setRedemptions(data ?? [])
    setLoading(false)
  }, [userId, statusFilter])

  useEffect(() => { fetch() }, [fetch])

  // Realtime
  useEffect(() => {
    const key = userId ? `redemptions-member-${userId}` : 'redemptions-admin'
    const channel = supabase
      .channel(key)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'redemptions',
        ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
      }, () => fetch())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId, fetch])

  return { redemptions, loading, refetch: fetch }
}

/**
 * Badge count for sidebar:
 *  - Member  → count of 'available' redemptions (ready to use)
 *  - Admin   → count of 'pending' redemptions (waiting review)
 */
export function usePendingRedemptionsCount(userId = null) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let q = supabase.from('redemptions').select('id', { count: 'exact', head: true })
    if (userId) {
      q = q.eq('user_id', userId).eq('status', 'available')
    } else {
      q = q.eq('status', 'pending')
    }
    q.then(({ count: c }) => setCount(c || 0))

    // keep live
    const key = userId ? `redemptions-badge-${userId}` : 'redemptions-badge-admin'
    const channel = supabase
      .channel(key)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'redemptions',
        ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
      }, () => {
        let q2 = supabase.from('redemptions').select('id', { count: 'exact', head: true })
        if (userId) q2 = q2.eq('user_id', userId).eq('status', 'available')
        else        q2 = q2.eq('status', 'pending')
        q2.then(({ count: c }) => setCount(c || 0))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId])

  return { count }
}

/** Create a redemption and deduct points immediately. */
export async function createRedemption(userId, rewardId, pointsCost) {
  const { data, error } = await supabase
    .from('redemptions')
    .insert({
      user_id:      userId,
      reward_id:    rewardId,
      points_spent: pointsCost,
      status:       'pending',
      redeemed_at:  new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return { data: null, error }
  await updateUserPoints(userId, -pointsCost, data.id, 'redemption')
  return { data, error: null }
}

/** Admin: update redemption status. */
export async function updateRedemptionStatus(id, status, adminNotes = null) {
  const updates = { status }
  if (status === 'available') updates.validated_at = new Date().toISOString()
  if (status === 'used')      updates.used_at      = new Date().toISOString()
  if (adminNotes !== null)    updates.admin_notes  = adminNotes
  const { data, error } = await supabase
    .from('redemptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

/** Admin: cancel and refund. */
export async function cancelAndRefundRedemption(redemption) {
  const { error } = await updateRedemptionStatus(redemption.id, 'cancelled')
  if (error) return { error }
  await updateUserPoints(redemption.user_id, redemption.points_spent, redemption.id, 'refund')
  return { error: null }
}

// ─── Team points (admin) ──────────────────────────────────────────────────────

export function useTeamPoints() {
  const [teamPoints, setTeamPoints] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_points')
      .select('*, profiles(id, full_name, role)')
      .order('points_current_month', { ascending: false })
    setTeamPoints((data ?? []).filter(r => r.profiles?.role !== 'admin'))
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    const channel = supabase
      .channel('team-points-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_points' }, () => fetch())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetch])

  return { teamPoints, loading, refetch: fetch }
}
