import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useSetterSharedTasks(currentUserId, isAdminOrRespVente) {
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const hasLoaded             = useRef(false)

  const fetch = useCallback(async () => {
    // Only show the skeleton on the very first load — subsequent refetches
    // (realtime sync, completing a task) update silently so accordions stay open.
    if (!hasLoaded.current) setLoading(true)

    // Shared tasks (all types except personal)
    const { data: shared } = await supabase
      .from('setter_shared_tasks')
      .select(`
        *,
        completed_by_profile:profiles!setter_shared_tasks_completed_by_fkey(full_name),
        creator:profiles!setter_shared_tasks_created_by_fkey(full_name)
      `)
      .neq('type', 'personnel')
      .order('created_at', { ascending: false })

    // Personal tasks — admin/resp_vente see all, others see only their own
    let personalQuery = supabase
      .from('setter_shared_tasks')
      .select(`
        *,
        completed_by_profile:profiles!setter_shared_tasks_completed_by_fkey(full_name),
        creator:profiles!setter_shared_tasks_created_by_fkey(full_name),
        owner:profiles!setter_shared_tasks_user_id_fkey(full_name)
      `)
      .eq('type', 'personnel')
      .order('created_at', { ascending: false })

    if (!isAdminOrRespVente) {
      personalQuery = personalQuery.eq('user_id', currentUserId)
    }

    const { data: personal } = await personalQuery

    setTasks([...(shared || []), ...(personal || [])])
    hasLoaded.current = true
    setLoading(false)
  }, [currentUserId, isAdminOrRespVente])

  useEffect(() => { fetch() }, [fetch])

  // Real-time sync
  useEffect(() => {
    const channel = supabase
      .channel('setter-shared-tasks-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'setter_shared_tasks' }, fetch)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetch])

  return { tasks, loading, refetch: fetch }
}

export async function completeSetterTask(taskId, userId) {
  const { error } = await supabase
    .from('setter_shared_tasks')
    .update({
      is_completed: true,
      completed_by: userId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)
  return { error }
}

export async function uncompleteSetterTask(taskId) {
  const { error } = await supabase
    .from('setter_shared_tasks')
    .update({ is_completed: false, completed_by: null, completed_at: null })
    .eq('id', taskId)
  return { error }
}

export async function createSetterTask({ type, title, description, userId }) {
  const { error } = await supabase
    .from('setter_shared_tasks')
    .insert({
      type,
      title:      title.trim(),
      description: description?.trim() || null,
      user_id:    type === 'personnel' ? userId : null,
      created_by: userId,
      is_completed: false,
    })
  return { error }
}

export async function deleteSetterTask(taskId) {
  const { error } = await supabase
    .from('setter_shared_tasks')
    .delete()
    .eq('id', taskId)
  return { error }
}
