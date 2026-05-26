import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useKPITypes() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('kpi_types')
      .select('*')
      .eq('is_active', true)
      .order('label')
    setTypes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { types, loading, refetch: fetch }
}

export function getTypesForRole(allTypes, role, scope = 'individual') {
  if (scope === 'clinic') return allTypes.filter(t => t.role_scope === 'clinic')
  if (!role) return allTypes.filter(t => t.role_scope !== 'clinic')
  return allTypes.filter(t => t.role_scope === role || t.role_scope === 'all')
}

export async function createKPIType({ label, role_scope }) {
  const value = label
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

  const { data, error } = await supabase
    .from('kpi_types')
    .insert({ label, value, role_scope })
    .select()
    .single()
  return { data, error }
}

export async function deactivateKPIType(id) {
  const { error } = await supabase
    .from('kpi_types')
    .update({ is_active: false })
    .eq('id', id)
  return { error }
}
