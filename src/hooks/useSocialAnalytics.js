import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================================
// Chargement et agrégation des données d'analyse
//
// Deux sources coexistent dans social_metric_snapshots : le sync Meta direct
// (fenêtres d1/d3/d7/d28) et l'import Metricool (window_tag null, raw.source =
// 'metricool'). Elles sont complémentaires plutôt que redondantes — Meta donne
// profile_visits et les fenêtres canoniques, Metricool donne le hook rate et
// couvre Facebook et TikTok. On fusionne donc champ par champ en gardant, pour
// chaque métrique, la valeur non nulle la plus récente.
// ============================================================================

const METRIC_FIELDS = [
  'reach', 'views', 'likes', 'comments', 'saves', 'shares', 'total_interactions',
  'profile_visits', 'follows', 'link_clicks',
  'avg_watch_time_s', 'total_watch_time_s', 'view_rate_3s', 'full_watch_rate',
]

function mergeSnapshots(snapshots) {
  // Du plus ancien au plus récent : la dernière valeur non nulle gagne.
  const ordered = [...snapshots].sort(
    (a, b) => new Date(a.captured_at) - new Date(b.captured_at),
  )
  const merged = {}
  for (const snap of ordered) {
    for (const field of METRIC_FIELDS) {
      if (snap[field] != null) merged[field] = Number(snap[field])
    }
  }
  return merged
}

// Le score canonique reste celui de J+7 quand il existe : c'est la fenêtre sur
// laquelle la baseline a été construite. J+28 est un repli, pas un équivalent.
function pickScore(rows) {
  if (!rows?.length) return null
  return rows.find(r => r.window_tag === 'd7') ?? rows.find(r => r.window_tag === 'd28') ?? rows[0]
}

export function useSocialAnalytics() {
  const [data, setData] = useState({
    publications: [], snapshots: [], scores: [], accounts: [],
    accountSnapshots: [], audience: [], posts: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [pubs, snaps, scores, accounts, acctSnaps, audience, posts] = await Promise.all([
      supabase.from('social_publications').select('*').order('published_at', { ascending: false }),
      supabase.from('social_metric_snapshots')
        .select('publication_id, captured_at, window_tag, is_late_measure, ' + METRIC_FIELDS.join(', ')),
      supabase.from('social_post_scores').select('*'),
      supabase.from('social_accounts').select('*'),
      supabase.from('social_account_snapshots').select('*').order('snapshot_date'),
      supabase.from('social_audience_snapshots').select('*').order('snapshot_date', { ascending: false }),
      supabase.from('social_posts').select('*'),
    ])

    const err = [pubs, snaps, scores, accounts, acctSnaps, audience, posts]
      .map(r => r.error).find(Boolean)
    if (err) { setError(err.message); setLoading(false); return }

    setError(null)
    setData({
      publications: pubs.data ?? [],
      snapshots: snaps.data ?? [],
      scores: scores.data ?? [],
      accounts: accounts.data ?? [],
      accountSnapshots: acctSnaps.data ?? [],
      audience: audience.data ?? [],
      posts: posts.data ?? [],
    })
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  // ── Une ligne par publication, métriques fusionnées ───────────────────────
  const rows = useMemo(() => {
    const snapsByPub = new Map()
    for (const s of data.snapshots) {
      if (!snapsByPub.has(s.publication_id)) snapsByPub.set(s.publication_id, [])
      snapsByPub.get(s.publication_id).push(s)
    }
    const scoresByPub = new Map()
    for (const s of data.scores) {
      if (!scoresByPub.has(s.publication_id)) scoresByPub.set(s.publication_id, [])
      scoresByPub.get(s.publication_id).push(s)
    }
    const postsById = new Map(data.posts.map(p => [p.id, p]))

    return data.publications.map(pub => {
      const snaps = snapsByPub.get(pub.id) ?? []
      const m = mergeSnapshots(snaps)
      const post = pub.post_id ? postsById.get(pub.post_id) ?? null : null
      const score = pickScore(scoresByPub.get(pub.id))
      // Le score a-t-il été calculé sur un relevé pris bien après sa fenêtre ?
      // On regarde le relevé de la fenêtre exacte qui a servi au calcul.
      const lateMeasure = !!score && snaps.some(
        s => s.window_tag === score.window_tag && s.is_late_measure,
      )
      const reach = m.reach ?? null
      // Somme de repli quand la plateforme ne renvoie pas total_interactions.
      // Zéro interaction est une valeur légitime : on ne la convertit pas en
      // « non mesuré », sauf si aucune des composantes n'existe.
      const parts = [m.likes, m.comments, m.saves, m.shares]
      const interactions = m.total_interactions ?? (
        parts.some(v => v != null)
          ? parts.reduce((a, b) => a + (b ?? 0), 0)
          : null
      )

      return {
        id: pub.id,
        publication: pub,
        post,
        platform: pub.platform,
        publishedAt: pub.published_at,
        mediaType: pub.media_type,
        permalink: pub.permalink,
        durationSeconds: pub.duration_seconds != null ? Number(pub.duration_seconds) : null,
        score,
        lateMeasure,

        views: m.views ?? null,
        reach,
        likes: m.likes ?? null,
        comments: m.comments ?? null,
        saves: m.saves ?? null,
        shares: m.shares ?? null,
        follows: m.follows ?? null,
        interactions,
        // Le taux d'engagement se rapporte à la portée, pas aux abonnés : c'est
        // la seule base comparable entre une publication vue par 500 personnes
        // et une autre vue par 50 000.
        engagementRate: reach && interactions != null ? (interactions / reach) * 100 : null,
        hookRate: m.view_rate_3s ?? null,
        avgWatch: m.avg_watch_time_s ?? null,
        totalWatch: m.total_watch_time_s ?? null,

        // Champs de regroupement de l'onglet Patterns
        sphere: post?.sphere ?? null,
        format: post?.format ?? null,
        hookType: post?.hook_type ?? null,
        audienceProblem: post?.audience_problem ?? null,
      }
    })
  }, [data])

  // ── Séries journalières par plateforme ────────────────────────────────────
  const daily = useMemo(() => {
    const byPlatform = new Map(data.accounts.map(a => [a.id, a.platform]))
    const out = {}
    for (const snap of data.accountSnapshots) {
      const platform = byPlatform.get(snap.account_id)
      if (!platform) continue
      ;(out[platform] ??= []).push({
        date: snap.snapshot_date,
        followers: snap.followers != null ? Number(snap.followers) : null,
        views: snap.views != null ? Number(snap.views) : null,
        reach: snap.reach != null ? Number(snap.reach) : null,
      })
    }
    for (const key of Object.keys(out)) out[key].sort((a, b) => a.date.localeCompare(b.date))
    return out
  }, [data])

  // ── Démographie : on ne garde que l'instantané le plus récent ─────────────
  const audience = useMemo(() => {
    const latestDate = data.audience[0]?.snapshot_date ?? null
    if (!latestDate) return { date: null, ageGender: [], countries: [], accountIds: [] }
    const rows_ = data.audience.filter(a => a.snapshot_date === latestDate)
    const ageGender = rows_
      .filter(a => a.dimension === 'age_gender')
      .map(a => {
        const [age, gender] = a.bucket.split('|')
        return { age, gender, value: Number(a.value) }
      })
    const countries = rows_
      .filter(a => a.dimension === 'country')
      .map(a => ({ code: a.bucket, value: Number(a.value) }))
      .sort((a, b) => b.value - a.value)
    return {
      date: latestDate,
      ageGender,
      countries,
      accountIds: [...new Set(rows_.map(a => a.account_id))],
    }
  }, [data])

  return {
    loading, error, refetch,
    rows, daily, audience,
    accounts: data.accounts,
    posts: data.posts,
  }
}

// ============================================================================
// Lecture hebdomadaire générée par IA
//
// Le rapport est écrit dans social_ai_reports par la tâche de synchronisation.
// Le front ne fait pas confiance à son contenu : toute publication citée doit
// exister dans les données chargées, sinon le rapport est rejeté en bloc. Une
// recommandation qui s'appuie sur une publication introuvable est soit périmée,
// soit inventée — dans les deux cas elle ne doit pas s'afficher.
// ============================================================================

export function useSocialAiReport(rows) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('social_ai_reports')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) { setRow(data ?? null); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  const report = useMemo(() => {
    const payload = row?.report
    if (!payload?.headline || !payload?.why) return null

    const known = new Set(rows.map(r => r.id))
    const cited = payload.cited_publication_ids ?? []
    if (!cited.length || cited.some(id => !known.has(id))) return null

    return {
      headline: payload.headline,
      why: payload.why,
      stats: (payload.stats ?? []).slice(0, 3),
      weekStart: row.week_start,
      citedCount: cited.length,
    }
  }, [row, rows])

  return { report, loading }
}

// ============================================================================
// Attribution des rendez-vous
//
// Passe par une fonction SECURITY DEFINER : les tables ghl_* ne sont pas
// ouvertes au module Réseaux sociaux, et la fonction ne renvoie que des
// totaux — jamais un contact nominatif.
// ============================================================================

export function useSocialAttribution() {
  const [attribution, setAttribution] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('social_attribution').then(({ data, error: err }) => {
      if (cancelled) return
      if (err) setError(err.message)
      else setAttribution(data ?? [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { attribution, loading, error }
}

// ── Filtres et agrégats, utilisés par les vues ──────────────────────────────

export function filterRows(rows, { platform = 'all', days = 30 } = {}) {
  const cutoff = Date.now() - days * 864e5
  return rows.filter(r => {
    if (platform !== 'all' && r.platform !== platform) return false
    return r.publishedAt && Date.parse(r.publishedAt) >= cutoff
  })
}

export function sum(rows, key) {
  let total = 0
  let n = 0
  for (const r of rows) if (r[key] != null) { total += r[key]; n++ }
  return n ? total : null
}

export function mean(rows, key) {
  const values = rows.map(r => r[key]).filter(v => v != null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values) {
  const v = values.filter(x => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

// Variation entre la fenêtre courante et la fenêtre précédente de même durée.
// Renvoie null plutôt que zéro quand la période précédente n'a pas de données :
// afficher « 0 % » alors qu'on ne sait rien serait un mensonge.
export function periodDelta(rows, { platform, days, key, aggregate = sum }) {
  const now = Date.now()
  const inWindow = (from, to) => rows.filter(r => {
    if (platform !== 'all' && r.platform !== platform) return false
    const t = Date.parse(r.publishedAt)
    return t >= from && t < to
  })
  const current = aggregate(inWindow(now - days * 864e5, now), key)
  const previous = aggregate(inWindow(now - 2 * days * 864e5, now - days * 864e5), key)
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}
