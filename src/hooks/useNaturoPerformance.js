import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'pdf']

// Lecture des instantanés du naturo connecté (RLS = uniquement ses lignes visibles).
export function useNaturoPerformance() {
  const { profile } = useAuth()
  const naturoKey = profile?.perf_naturo_key || null
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('neo_naturo_monthly')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Soumet la cotisation du mois + téléverse la preuve (jpg/png/pdf).
  const submitContribution = useCallback(async (year, month, montant, file) => {
    if (!naturoKey) return { error: { message: 'Aucun naturo lié à ce compte.' } }
    let proofPath = null
    if (file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      if (!ALLOWED_EXT.includes(ext)) return { error: { message: 'Format accepté : JPG, PNG ou PDF.' } }
      proofPath = `${naturoKey}/${year}-${String(month).padStart(2, '0')}-${Date.now()}.${ext}`
      const up = await supabase.storage.from('reer-proofs').upload(proofPath, file, { upsert: true })
      if (up.error) return { error: up.error }
    }
    const { error } = await supabase.rpc('submit_my_contribution', {
      p_year: year, p_month: month, p_montant: Number(montant) || 0, p_proof_path: proofPath,
    })
    if (error) return { error }
    await load()
    return {}
  }, [naturoKey, load])

  // URL signée temporaire pour visualiser une preuve.
  const getProofUrl = useCallback(async (path) => {
    if (!path) return null
    const { data } = await supabase.storage.from('reer-proofs').createSignedUrl(path, 3600)
    return data?.signedUrl || null
  }, [])

  return { rows, loading, naturoKey, submitContribution, getProofUrl, refetch: load }
}

// Indique si le naturo connecté a accès à un espace Performance & REER visible.
export function useNaturoPerfAccess() {
  const { profile } = useAuth()
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    if (!profile?.perf_naturo_key) { setHasAccess(false); return }
    let active = true
    supabase
      .from('neo_naturo_monthly')
      .select('id', { count: 'exact', head: true })
      .eq('visible', true)
      .then(({ count }) => { if (active) setHasAccess((count || 0) > 0) })
    return () => { active = false }
  }, [profile?.perf_naturo_key])

  return hasAccess
}
