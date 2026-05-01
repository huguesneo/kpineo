import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useMembers(filters = {}) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase.from('profiles').select('*').order('full_name')

    if (filters.role && filters.role !== 'tous') query = query.eq('role', filters.role)
    if (filters.isActive !== undefined) query = query.eq('is_active', filters.isActive)

    const { data, error: err } = await query
    if (err) setError(err.message)
    else setMembers(data || [])
    setLoading(false)
  }, [filters.role, filters.isActive])

  useEffect(() => { fetch() }, [fetch])

  return { members, loading, error, refetch: fetch }
}

export function useMember(id) {
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
    if (err) setError(err.message)
    else setMember(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  return { member, loading, error, refetch: fetch }
}

export async function createMember({ full_name, email, role, password }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  })
  return { data, error }
}

export async function updateMember(id, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}
