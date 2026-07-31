import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================================
// Données locales (Supabase) — posts, idées, hooks
// ============================================================================

export function useSocialPosts() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('social_posts')
      .select('*')
      .order('number', { ascending: true, nullsFirst: false })
    if (err) setError(err.message)
    else setPosts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const createPost = useCallback(async (fields) => {
    const { data, error: err } = await supabase.from('social_posts').insert(fields).select().single()
    if (err) return { error: err.message }
    setPosts(p => [...p, data])
    return { data }
  }, [])

  const updatePost = useCallback(async (id, fields) => {
    const { data, error: err } = await supabase.from('social_posts').update(fields).eq('id', id).select().single()
    if (err) return { error: err.message }
    setPosts(p => p.map(x => (x.id === id ? data : x)))
    return { data }
  }, [])

  const deletePost = useCallback(async (id) => {
    const { error: err } = await supabase.from('social_posts').delete().eq('id', id)
    if (err) return { error: err.message }
    setPosts(p => p.filter(x => x.id !== id))
    return {}
  }, [])

  return { posts, loading, error, refetch, createPost, updatePost, deletePost }
}

export function useSocialIdeas() {
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('social_ideas').select('*').order('created_at')
    setIdeas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const addIdea = useCallback(async (title) => {
    const { data, error } = await supabase.from('social_ideas').insert({ title }).select().single()
    if (!error) setIdeas(p => [...p, data])
    return { data, error }
  }, [])

  const toggleUsed = useCallback(async (id, used) => {
    const { data } = await supabase.from('social_ideas').update({ used }).eq('id', id).select().single()
    if (data) setIdeas(p => p.map(x => (x.id === id ? data : x)))
  }, [])

  const removeIdea = useCallback(async (id) => {
    await supabase.from('social_ideas').delete().eq('id', id)
    setIdeas(p => p.filter(x => x.id !== id))
  }, [])

  return { ideas, loading, refetch, addIdea, toggleUsed, removeIdea }
}

export function useSocialHooks() {
  const [hooks, setHooks] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('social_hooks').select('*').order('created_at')
    setHooks(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const addHook = useCallback(async (text) => {
    const { data, error } = await supabase.from('social_hooks').insert({ text }).select().single()
    if (!error) setHooks(p => [...p, data])
    return { data, error }
  }, [])

  const toggleUsed = useCallback(async (id, used) => {
    const { data } = await supabase.from('social_hooks').update({ used }).eq('id', id).select().single()
    if (data) setHooks(p => p.map(x => (x.id === id ? data : x)))
  }, [])

  const removeHook = useCallback(async (id) => {
    await supabase.from('social_hooks').delete().eq('id', id)
    setHooks(p => p.filter(x => x.id !== id))
  }, [])

  return { hooks, loading, refetch, addHook, toggleUsed, removeHook }
}

// ============================================================================
// Moteur d'analyse — publications natives, scores, snapshots de compte
// ============================================================================

// Tout ce qu'il faut pour les onglets Performance et Patterns.
// Les trois tables sont petites (quelques centaines de lignes) : on charge
// tout et on fait la jointure côté client, comme pour le reste du module.
export function useSocialPerformance() {
  const [publications, setPublications] = useState([])
  const [scores, setScores] = useState([])
  const [accountSnapshots, setAccountSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [pubs, scr, snaps] = await Promise.all([
      supabase.from('social_publications').select('*').order('published_at', { ascending: false }),
      supabase.from('social_post_scores').select('*'),
      supabase.from('social_account_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(120),
    ])
    const err = pubs.error ?? scr.error ?? snaps.error
    if (err) setError(err.message)
    else {
      setError(null)
      setPublications(pubs.data ?? [])
      setScores(scr.data ?? [])
      setAccountSnapshots(snaps.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { publications, scores, accountSnapshots, loading, error, refetch }
}

// Historique des relevés d'une publication (panneau de détail).
export function useSocialSnapshots(publicationId) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publicationId) { setSnapshots([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    supabase
      .from('social_metric_snapshots')
      .select('*')
      .eq('publication_id', publicationId)
      .order('captured_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setSnapshots(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [publicationId])

  return { snapshots, loading }
}

// ============================================================================
// GHL (edge function social-planner) — comptes, publication, stats
// ============================================================================

async function invokePlanner(body) {
  const { data, error } = await supabase.functions.invoke('social-planner', { body })
  if (error) return { ok: false, error: error.message }
  if (data && data.ok === false) {
    const msg = typeof data.error === 'object'
      ? (data.error?.message || JSON.stringify(data.error))
      : (data.error || `Erreur GHL (${data.status})`)
    return { ok: false, error: msg, status: data.status }
  }
  return { ok: true, data: data?.data ?? data }
}

export function useSocialAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    invokePlanner({ action: 'accounts' }).then(res => {
      if (cancelled) return
      if (!res.ok) setError(res.error)
      else {
        const accs = res.data?.results?.accounts ?? res.data?.accounts ?? []
        setAccounts(accs.filter(a => !a.deleted && !a.isExpired))
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { accounts, loading, error }
}

// Crée (ou met à jour) un post dans le Social Planner GHL.
// payload: { accountIds, summary, media: [{url}], status: 'scheduled'|'draft', scheduleDate, type }
export async function ghlCreatePost(payload) {
  return invokePlanner({ action: 'create', payload })
}

export async function ghlUpdatePost(postId, payload) {
  return invokePlanner({ action: 'update', postId, payload })
}

export async function ghlDeletePost(postId) {
  return invokePlanner({ action: 'delete', postId })
}

export async function ghlGetPost(postId) {
  return invokePlanner({ action: 'get', postId })
}

export async function ghlListPosts(payload) {
  return invokePlanner({ action: 'list', payload })
}

// Posts existants dans le Social Planner GHL (créés depuis GHL ou ailleurs),
// sur une fenêtre de -60 jours à +120 jours.
export function useGhlPosts() {
  const [ghlPosts, setGhlPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const from = new Date(); from.setDate(from.getDate() - 60)
    const to = new Date(); to.setDate(to.getDate() + 120)
    const res = await invokePlanner({
      action: 'list',
      payload: {
        type: 'all',
        fromDate: from.toISOString(),
        toDate: to.toISOString(),
        skip: '0',
        limit: '100',
        includeUsers: 'false',
      },
    })
    if (!res.ok) setError(res.error)
    else {
      const list = res.data?.results?.posts ?? res.data?.posts ?? []
      setGhlPosts(list.filter(p => !p.deleted))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { ghlPosts, loading, error, refetch }
}

export async function ghlGetStats(profileIds, platforms) {
  return invokePlanner({ action: 'stats', payload: { profileIds, ...(platforms ? { platforms } : {}) } })
}

// ============================================================================
// Upload de médias vers le bucket public social-media
// ============================================================================

export async function uploadSocialMedia(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('social-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) return { error: error.message }
  const { data } = supabase.storage.from('social-media').getPublicUrl(path)
  return { url: data.publicUrl }
}
