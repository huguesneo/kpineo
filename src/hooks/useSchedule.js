import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useSchedules(userId) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false })
    setSchedules(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])
  return { schedules, loading, refetch: fetch }
}

export function useAbsences(userId, year) {
  const [absences, setAbsences] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('absences')
      .select('*')
      .eq('user_id', userId)
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)
      .order('start_date', { ascending: false })
    setAbsences(data ?? [])
    setLoading(false)
  }, [userId, year])

  useEffect(() => { fetch() }, [fetch])
  return { absences, loading, refetch: fetch }
}

export function useAbsenceAllowance(userId, year) {
  const [allowance, setAllowance] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('absence_allowances')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .maybeSingle()
    setAllowance(data)
    setLoading(false)
  }, [userId, year])

  useEffect(() => { fetch() }, [fetch])
  return { allowance, loading, refetch: fetch }
}

export function useOvertimeRecords(userId, year) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('overtime_records')
      .select('*')
      .eq('user_id', userId)
      .gte('week_start', `${year}-01-01`)
      .lte('week_start', `${year}-12-31`)
      .order('week_start', { ascending: false })
    setRecords(data ?? [])
    setLoading(false)
  }, [userId, year])

  useEffect(() => { fetch() }, [fetch])
  return { records, loading, refetch: fetch }
}

export async function upsertSchedule(schedule) {
  const { id, ...rest } = schedule
  if (id) {
    return supabase.from('schedules').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
  }
  return supabase.from('schedules').insert(rest)
}

export async function deleteSchedule(id) {
  return supabase.from('schedules').delete().eq('id', id)
}

export async function createAbsence(absence) {
  return supabase.from('absences').insert(absence)
}

export async function deleteAbsence(id) {
  return supabase.from('absences').delete().eq('id', id)
}

export async function updateAbsence(id, data) {
  return supabase.from('absences').update(data).eq('id', id)
}

export async function upsertAbsenceAllowance({ user_id, year, sick_hours, vacation_hours }) {
  return supabase.from('absence_allowances').upsert(
    { user_id, year, sick_hours: Number(sick_hours), vacation_hours: Number(vacation_hours), updated_at: new Date().toISOString() },
    { onConflict: 'user_id,year' }
  )
}

export async function upsertOvertimeRecord({ user_id, week_start, extra_hours, notes }) {
  return supabase.from('overtime_records').upsert(
    { user_id, week_start, extra_hours: Number(extra_hours), notes: notes || null },
    { onConflict: 'user_id,week_start' }
  )
}

export async function deleteOvertimeRecord(id) {
  return supabase.from('overtime_records').delete().eq('id', id)
}

export async function approveOvertimeRecord(id, approvedByUserId) {
  return supabase.from('overtime_records').update({
    is_approved: true,
    approved_at: new Date().toISOString(),
    approved_by: approvedByUserId,
  }).eq('id', id)
}

// Global pending OT count (for sidebar badge — admin only)
export function usePendingOvertimeCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    supabase
      .from('overtime_records')
      .select('id', { count: 'exact', head: true })
      .eq('is_approved', false)
      .then(({ count: c }) => setCount(c || 0))
  }, [])

  return count
}

// Combined sidebar badge: pending OT approvals + membres avec dépassement d'absences
export function useTotalHoraireAlertCount() {
  const [count, setCount] = useState(0)
  const year = new Date().getFullYear()

  useEffect(() => {
    async function load() {
      const [otRes, absRes, allowRes] = await Promise.all([
        supabase.from('overtime_records').select('id', { count: 'exact', head: true }).eq('is_approved', false),
        supabase.from('absences').select('user_id, type, hours').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
        supabase.from('absence_allowances').select('user_id, sick_hours, vacation_hours').eq('year', year),
      ])

      const { count: pendingChangesCount } = await supabase
        .from('pending_changes').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      const { count: pendingAdjCount } = await supabase
        .from('schedule_adjustments').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      const { count: pendingOverridesCount } = await supabase
        .from('schedule_overrides').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      const pendingOT = (otRes.count || 0) + (pendingChangesCount || 0) + (pendingAdjCount || 0) + (pendingOverridesCount || 0)

      const sickUsed = {}, vacUsed = {}
      for (const a of (absRes.data ?? [])) {
        if (a.type === 'sick') sickUsed[a.user_id] = (sickUsed[a.user_id] ?? 0) + Number(a.hours)
        else vacUsed[a.user_id] = (vacUsed[a.user_id] ?? 0) + Number(a.hours)
      }
      const allowMap = {}
      for (const al of (allowRes.data ?? [])) allowMap[al.user_id] = al

      let excessMembers = 0
      const allUids = new Set([...Object.keys(sickUsed), ...Object.keys(vacUsed)])
      for (const uid of allUids) {
        const allow = allowMap[uid]
        if (allow) {
          const se = Math.max(0, (sickUsed[uid] ?? 0) - Number(allow.sick_hours))
          const ve = Math.max(0, (vacUsed[uid] ?? 0) - Number(allow.vacation_hours))
          if (se > 0 || ve > 0) excessMembers++
        }
      }

      setCount(pendingOT + excessMembers)
    }
    load()
  }, [year])

  return count
}

// Per-member alert data for admin Horaires page
export function useScheduleAlerts(memberIds, year) {
  const [alerts, setAlerts] = useState({})  // { userId: { pendingOT, hasExcess, pendingChanges } }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!memberIds || memberIds.length === 0) { setLoading(false); return }
    async function load() {
      setLoading(true)
      const [otRes, absRes, allowRes, pcRes, adjRes, ovRes] = await Promise.all([
        supabase.from('overtime_records').select('user_id, extra_hours').eq('is_approved', false).in('user_id', memberIds),
        supabase.from('absences').select('user_id, type, hours').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).in('user_id', memberIds),
        supabase.from('absence_allowances').select('user_id, sick_hours, vacation_hours').eq('year', year).in('user_id', memberIds),
        supabase.from('pending_changes').select('user_id').eq('status', 'pending').in('user_id', memberIds),
        supabase.from('schedule_adjustments').select('user_id').eq('status', 'pending').in('user_id', memberIds),
        supabase.from('schedule_overrides').select('user_id').eq('status', 'pending').in('user_id', memberIds),
      ])
      const pendingOT = {}
      for (const r of (otRes.data ?? [])) {
        pendingOT[r.user_id] = (pendingOT[r.user_id] ?? 0) + 1
      }
      const pendingAdj = {}
      for (const r of (adjRes.data ?? [])) {
        pendingAdj[r.user_id] = (pendingAdj[r.user_id] ?? 0) + 1
      }
      const pendingOverrides = {}
      for (const r of (ovRes.data ?? [])) {
        pendingOverrides[r.user_id] = (pendingOverrides[r.user_id] ?? 0) + 1
      }
      const sickUsed = {}, vacUsed = {}
      for (const a of (absRes.data ?? [])) {
        if (a.type === 'sick') sickUsed[a.user_id] = (sickUsed[a.user_id] ?? 0) + Number(a.hours)
        else vacUsed[a.user_id] = (vacUsed[a.user_id] ?? 0) + Number(a.hours)
      }
      const allowMap = {}
      for (const al of (allowRes.data ?? [])) allowMap[al.user_id] = al

      const pendingChanges = {}
      for (const c of (pcRes.data ?? [])) {
        pendingChanges[c.user_id] = (pendingChanges[c.user_id] ?? 0) + 1
      }

      const result = {}
      for (const uid of memberIds) {
        const allow = allowMap[uid]
        const sickExcess = allow ? Math.max(0, (sickUsed[uid] ?? 0) - Number(allow.sick_hours)) : 0
        const vacExcess  = allow ? Math.max(0, (vacUsed[uid]  ?? 0) - Number(allow.vacation_hours)) : 0
        result[uid] = {
          pendingOT: pendingOT[uid] ?? 0,
          hasExcess: sickExcess > 0 || vacExcess > 0,
          pendingChanges: pendingChanges[uid] ?? 0,
          pendingAdj: pendingAdj[uid] ?? 0,
          pendingOverrides: pendingOverrides[uid] ?? 0,
        }
      }
      setAlerts(result)
      setLoading(false)
    }
    load()
  }, [memberIds?.join(','), year])

  return { alerts, loading }
}

// ─── Pending changes (demandes de modification/suppression) ───

// Fetch pending changes for a user (member sees own, admin sees all via RLS)
export function usePendingChanges(userId) {
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('pending_changes')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setChanges(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])
  return { changes, loading, refetch: fetch }
}

// Admin: all pending changes across all members
export function useAllPendingChanges() {
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('pending_changes')
      .select('*, profiles(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setChanges(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { changes, loading, refetch: fetch }
}

// Member: recently reviewed changes (for notification)
export function useReviewedChanges(userId) {
  const [changes, setChanges] = useState([])

  useEffect(() => {
    if (!userId) return
    async function load() {
      const { data } = await supabase
        .from('pending_changes')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(10)
      const seen = new Set(JSON.parse(localStorage.getItem('pending_change_seen') ?? '[]'))
      setChanges((data ?? []).filter(c => !seen.has(c.id)))
    }
    load()
  }, [userId])

  return { changes }
}

// Submit a change request (member)
export async function requestChange({ user_id, entity_type, action, record_id, proposed_data }) {
  return supabase.from('pending_changes').insert({
    user_id, entity_type, action, record_id,
    proposed_data: proposed_data ?? null,
    status: 'pending',
  })
}

// Cancel a pending change request (member)
export async function cancelChangeRequest(id) {
  return supabase.from('pending_changes').delete().eq('id', id)
}

// Admin: approve a pending change and apply it
export async function approveChange(change, adminUserId) {
  // 1. Apply the actual change
  if (change.action === 'delete') {
    if (change.entity_type === 'absence') {
      await supabase.from('absences').delete().eq('id', change.record_id)
    } else {
      await supabase.from('schedules').delete().eq('id', change.record_id)
    }
  } else if (change.action === 'modify') {
    const table = change.entity_type === 'absence' ? 'absences' : 'schedules'
    await supabase.from(table).update({ ...change.proposed_data, updated_at: new Date().toISOString() }).eq('id', change.record_id)
  }
  // 2. Mark as approved
  return supabase.from('pending_changes').update({
    status: 'approved',
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', change.id)
}

// Admin: reject a pending change (keep original)
export async function rejectChange(changeId, adminUserId) {
  return supabase.from('pending_changes').update({
    status: 'rejected',
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', changeId)
}

// Count of all pending changes (for sidebar badge, admin only)
export function usePendingChangesCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    supabase
      .from('pending_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count: c }) => setCount(c || 0))
  }, [])

  return count
}
