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
      .select('*, profiles!tasks_user_id_fkey(full_name, role)')
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

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single()
  return { data, error }
}

export async function toggleTaskCompletion(id, isCompleted) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  return { error }
}
