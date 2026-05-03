import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { updateUserPoints } from './usePoints'

// ─── Fetch ────────────────────────────────────────────────────────────────────

export function useTasks(filters = {}) {
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase
      .from('tasks')
      .select('*, profiles!tasks_user_id_fkey(full_name, role), creator:profiles!tasks_created_by_fkey(full_name)')
      .order('priority_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (filters.userId)                           query = query.eq('user_id', filters.userId)
    if (filters.priority)                         query = query.eq('priority', filters.priority)
    if (filters.isCompleted !== undefined)        query = query.eq('is_completed', filters.isCompleted)
    if (filters.pendingApproval !== undefined)    query = query.eq('pending_approval', filters.pendingApproval)

    const { data, error: err } = await query
    if (err) setError(err.message)
    else setTasks(data || [])
    setLoading(false)
  }, [filters.userId, filters.priority, filters.isCompleted, filters.pendingApproval])

  useEffect(() => { fetch() }, [fetch])
  return { tasks, loading, error, refetch: fetch }
}

// ─── Pending tasks count (sidebar badge) ─────────────────────────────────────

export function usePendingTasksCount(userId = null) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let query = supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_completed', false)

    if (userId) query = query.eq('user_id', userId)

    query.then(({ count: c }) => setCount(c || 0))
  }, [userId])

  return { count }
}

// ─── Pending approval count (admin badge) ────────────────────────────────────

export function usePendingApprovalCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const load = () =>
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('pending_approval', true)
        .then(({ count: c }) => setCount(c || 0))

    load()

    const channel = supabase
      .channel('pending-approval-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  return { count }
}

// ─── Pending approval tasks (admin list) ─────────────────────────────────────

export function usePendingApprovalTasks(userIdFilter = null) {
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tasks')
      .select('*, profiles!tasks_user_id_fkey(full_name, role), creator:profiles!tasks_created_by_fkey(full_name)')
      .eq('pending_approval', true)
      .order('created_at', { ascending: true })

    if (userIdFilter) query = query.eq('user_id', userIdFilter)

    const { data } = await query
    setTasks(data ?? [])
    setLoading(false)
  }, [userIdFilter])

  useEffect(() => { fetch() }, [fetch])

  // Realtime — update badge and list live
  useEffect(() => {
    const channel = supabase
      .channel('pending-approval-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetch)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetch])

  return { tasks, loading, refetch: fetch }
}

// ─── Recurrence helpers ───────────────────────────────────────────────────────

function nextDueDate(dueDateStr, rule) {
  if (!dueDateStr || !rule) return null
  const current = new Date(dueDateStr + 'T12:00:00')

  if (rule.type === 'daily') {
    current.setDate(current.getDate() + (rule.interval || 1))
    return current.toISOString().split('T')[0]
  }

  if (rule.type === 'weekly') {
    const days = [...(rule.weekdays || [1])].sort((a, b) => a - b)
    const currentDay = current.getDay()

    if (rule.interval === 1) {
      const nextDayInWeek = days.find(d => d > currentDay)
      if (nextDayInWeek !== undefined) {
        current.setDate(current.getDate() + (nextDayInWeek - currentDay))
        return current.toISOString().split('T')[0]
      }
    }

    const firstDay = days[0]
    const rawDiff = (7 - currentDay + firstDay) % 7
    const daysUntilNext = rawDiff === 0 ? 7 : rawDiff
    current.setDate(current.getDate() + daysUntilNext + ((rule.interval || 1) - 1) * 7)
    return current.toISOString().split('T')[0]
  }

  if (rule.type === 'monthly') {
    current.setMonth(current.getMonth() + (rule.interval || 1))
    return current.toISOString().split('T')[0]
  }

  return null
}

async function maybeCreateNextRecurrence(task) {
  const rule = task.recurrence_rule
  if (!rule) return

  const newIndex = (task.recurrence_index ?? 0) + 1
  const nextDate = nextDueDate(task.due_date, rule)
  if (!nextDate) return

  if (rule.end_type === 'count' && newIndex >= rule.end_count) return
  if (rule.end_type === 'date'  && rule.end_date && nextDate > rule.end_date) return

  await supabase.from('tasks').insert({
    user_id:               task.user_id,
    created_by:            task.created_by,
    title:                 task.title,
    description:           task.description,
    priority:              task.priority,
    task_type:             task.task_type    ?? 'recurrente',
    points:                task.points       ?? 0,
    priority_order:        task.priority_order ?? 0,
    due_date:              nextDate,
    recurrence_rule:       rule,
    recurrence_parent_id:  task.recurrence_parent_id ?? task.id,
    recurrence_index:      newIndex,
  })
}

export function formatRecurrenceLabel(rule) {
  if (!rule) return ''
  const DAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  const n = rule.interval || 1

  if (rule.type === 'daily')   return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`
  if (rule.type === 'weekly') {
    const dayLabels = (rule.weekdays || []).sort((a, b) => a - b).map(d => DAYS[d]).join(' · ')
    return n === 1 ? `Chaque semaine · ${dayLabels}` : `Toutes les ${n} sem. · ${dayLabels}`
  }
  if (rule.type === 'monthly') return n === 1 ? 'Tous les mois' : `Tous les ${n} mois`
  return 'Récurrent'
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single()
  return { data, error }
}

/**
 * Coche / décoche une tâche.
 *
 * Règles :
 *  - Tâche SECONDAIRE + membre (isAdmin = false) :
 *      cocher   → pending_approval = true  (points mis en attente)
 *      décocher → pending_approval = false (annulation)
 *  - Tâche PRIORITAIRE ou admin qui coche :
 *      flux normal → is_completed mis à jour, points crédités directement si applicable.
 *
 * @param {string}  id
 * @param {boolean} isCompleted   — nouvel état souhaité
 * @param {object|null} task      — objet task complet (nécessaire pour points/récurrence)
 * @param {boolean} isAdmin       — true = flux direct, false = flux approbation pour secondaire
 */
export async function toggleTaskCompletion(id, isCompleted, task = null, isAdmin = false) {

  // ── Flux approbation : membre coche une tâche secondaire ──────────────────
  if (!isAdmin && task?.priority === 'secondaire') {
    if (isCompleted && !task.pending_approval) {
      // Cocher → mise en attente d'approbation + points_pending
      const { data, error } = await supabase
        .from('tasks')
        .update({ pending_approval: true })
        .eq('id', id)
        .select()
        .single()

      // Ajouter les points au compteur en attente
      if (!error && (task.points ?? 0) > 0 && task.user_id) {
        await supabase.from('user_points').upsert(
          {
            user_id:        task.user_id,
            points_pending: (await getPendingPoints(task.user_id)) + task.points,
            updated_at:     new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }

      return { data, error }
    }

    if (!isCompleted && task.pending_approval) {
      // Décocher → annuler la demande
      const { data, error } = await supabase
        .from('tasks')
        .update({ pending_approval: false })
        .eq('id', id)
        .select()
        .single()

      // Retirer les points du compteur en attente
      if (!error && (task.points ?? 0) > 0 && task.user_id) {
        const current = await getPendingPoints(task.user_id)
        await supabase.from('user_points').upsert(
          {
            user_id:        task.user_id,
            points_pending: Math.max(0, current - task.points),
            updated_at:     new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }

      return { data, error }
    }
  }

  // ── Flux normal (prioritaire ou admin) ────────────────────────────────────
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_completed:     isCompleted,
      completed_at:     isCompleted ? new Date().toISOString() : null,
      pending_approval: false, // assure la cohérence
    })
    .eq('id', id)
    .select()
    .single()

  if (!error && task) {
    if (isCompleted && task.recurrence_rule) {
      await maybeCreateNextRecurrence(task)
    }
    // Points directs (prioritaire sans approbation, ou admin qui complète manuellement)
    const hasPoints = task.priority === 'secondaire' && (task.points ?? 0) > 0 && task.user_id
    if (hasPoints) {
      const delta = isCompleted ? task.points : -task.points
      const type  = isCompleted ? 'task_completed' : 'task_uncompleted'
      await updateUserPoints(task.user_id, delta, task.id, type)
    }
  }

  return { data, error }
}

/** Helper interne — lit le compteur points_pending actuel d'un membre. */
async function getPendingPoints(userId) {
  const { data } = await supabase
    .from('user_points')
    .select('points_pending')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.points_pending ?? 0
}

/**
 * Admin : approuve une tâche secondaire en attente.
 * → is_completed = true, pending_approval = false, points crédités.
 */
export async function approveTask(taskId, task) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_completed:     true,
      pending_approval: false,
      completed_at:     new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single()

  if (!error && task) {
    // Récurrence
    if (task.recurrence_rule) await maybeCreateNextRecurrence(task)

    // Créditer les points (vrai solde) + retirer de pending
    const hasPoints = task.priority === 'secondaire' && (task.points ?? 0) > 0 && task.user_id
    if (hasPoints) {
      await updateUserPoints(task.user_id, task.points, task.id, 'task_completed')
      // Retirer du compteur en attente
      const current = await getPendingPoints(task.user_id)
      await supabase.from('user_points').upsert(
        {
          user_id:        task.user_id,
          points_pending: Math.max(0, current - task.points),
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
    }
  }

  return { data, error }
}

/**
 * Admin : refuse une tâche secondaire en attente.
 * → pending_approval = false, tâche reste non complétée.
 */
export async function rejectTask(taskId, task) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ pending_approval: false })
    .eq('id', taskId)
    .select()
    .single()

  // Retirer du compteur pending si applicable
  if (!error && task && (task.points ?? 0) > 0 && task.user_id) {
    const current = await getPendingPoints(task.user_id)
    await supabase.from('user_points').upsert(
      {
        user_id:        task.user_id,
        points_pending: Math.max(0, current - task.points),
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  }

  return { data, error }
}

export async function stopRecurrence(taskId) {
  const { error } = await supabase
    .from('tasks')
    .update({ recurrence_rule: null })
    .eq('id', taskId)
  return { error }
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  return { error }
}

export async function updateTaskOrders(updates) {
  const promises = updates.map(({ id, priority_order }) =>
    supabase.from('tasks').update({ priority_order }).eq('id', id)
  )
  await Promise.all(promises)
}
