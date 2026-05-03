import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTasks(filters = {}) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase
      .from('tasks')
      .select('*, profiles!tasks_user_id_fkey(full_name, role), creator:profiles!tasks_created_by_fkey(full_name)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (filters.userId) query = query.eq('user_id', filters.userId)
    if (filters.priority) query = query.eq('priority', filters.priority)
    if (filters.isCompleted !== undefined) query = query.eq('is_completed', filters.isCompleted)

    const { data, error: err } = await query
    if (err) setError(err.message)
    else setTasks(data || [])
    setLoading(false)
  }, [filters.userId, filters.priority, filters.isCompleted])

  useEffect(() => { fetch() }, [fetch])

  return { tasks, loading, error, refetch: fetch }
}

export function usePendingTasksCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_completed', false)
      .then(({ count: c }) => setCount(c || 0))
  }, [])

  return { count }
}

// ─── Recurrence helpers ───────────────────────────────────────

function nextDueDate(dueDateStr, rule) {
  if (!dueDateStr || !rule) return null
  // Use noon to avoid DST edge cases
  const current = new Date(dueDateStr + 'T12:00:00')

  if (rule.type === 'daily') {
    current.setDate(current.getDate() + (rule.interval || 1))
    return current.toISOString().split('T')[0]
  }

  if (rule.type === 'weekly') {
    const days = [...(rule.weekdays || [1])].sort((a, b) => a - b)
    const currentDay = current.getDay() // 0=Sun

    if (rule.interval === 1) {
      const nextDayInWeek = days.find(d => d > currentDay)
      if (nextDayInWeek !== undefined) {
        current.setDate(current.getDate() + (nextDayInWeek - currentDay))
        return current.toISOString().split('T')[0]
      }
    }

    // Move to first day of next cycle
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

  // Check end conditions
  if (rule.end_type === 'count' && newIndex >= rule.end_count) return
  if (rule.end_type === 'date' && rule.end_date && nextDate > rule.end_date) return

  await supabase.from('tasks').insert({
    user_id: task.user_id,
    created_by: task.created_by,
    title: task.title,
    description: task.description,
    priority: task.priority,
    due_date: nextDate,
    recurrence_rule: rule,
    recurrence_parent_id: task.recurrence_parent_id ?? task.id,
    recurrence_index: newIndex,
  })
}

export function formatRecurrenceLabel(rule) {
  if (!rule) return ''
  const DAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  const n = rule.interval || 1

  if (rule.type === 'daily') {
    return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`
  }
  if (rule.type === 'weekly') {
    const dayLabels = (rule.weekdays || []).sort((a, b) => a - b).map(d => DAYS[d]).join(' · ')
    return n === 1 ? `Chaque semaine · ${dayLabels}` : `Toutes les ${n} sem. · ${dayLabels}`
  }
  if (rule.type === 'monthly') {
    return n === 1 ? 'Tous les mois' : `Tous les ${n} mois`
  }
  return 'Récurrent'
}

// ─── CRUD ─────────────────────────────────────────────────────

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single()
  return { data, error }
}

export async function toggleTaskCompletion(id, isCompleted, task = null) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (!error && isCompleted && task?.recurrence_rule) {
    await maybeCreateNextRecurrence(task)
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
