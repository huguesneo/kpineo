import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================================
// Compétiteurs — veille de contenu
//
// Metricool ne donne, par publication concurrente, que les interactions, la
// légende et la date : ni vues, ni portée, ni sauvegardes. Un compteur brut
// d'interactions n'est donc pas lisible tel quel — 400 interactions ne disent
// pas la même chose chez un compte de 19 000 abonnés et chez un compte de
// 1,2 million.
//
// On ramène chaque publication à la médiane de son propre auteur : index 100 =
// publication ordinaire pour ce compte. Même convention que le score interne,
// et c'est la seule lecture qui sépare « ce contenu a marché » de « ce compte
// est gros ».
// ============================================================================

// La baseline se calcule toujours sur la fenêtre de synchronisation complète,
// jamais sur la période choisie à l'écran : une médiane sur 7 jours ne veut
// rien dire. Le filtre de période ne décide que de ce qui s'affiche.
const BASELINE_DAYS = 90

// Même seuil que le score interne : sous 8 publications, on n'a pas de quoi
// dire ce qu'est une publication ordinaire pour ce compte.
const MIN_BASELINE = 8

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Seuils calés sur la distribution réellement observée (1 203 publications de
// compétiteurs, relevé du 2026-08-03), pas sur une intuition. Elle est très
// asymétrique : 31 % des publications font déjà le double de la médiane de leur
// compte, donc « 2× » ne distingue rien du tout. Les repères utiles sont plus
// haut — 90e centile ≈ 545, 95e ≈ 809, 99e ≈ 1 845.
export function indexTone(index) {
  if (index == null) return { label: 'baseline insuffisante', text: 'text-[#9ca3af]', bg: 'bg-gray-100' }
  if (index >= 500) return { label: 'percée', text: 'text-emerald-700', bg: 'bg-emerald-50' }
  if (index >= 200) return { label: 'au-dessus', text: 'text-[#009e95]', bg: 'bg-[#00bbb1]/10' }
  if (index >= 60) return { label: 'ordinaire', text: 'text-[#6b7280]', bg: 'bg-gray-100' }
  return { label: 'sous la médiane', text: 'text-red-600', bg: 'bg-red-50' }
}

// Une « percée » = le décile supérieur des publications d'un compte. Assez rare
// pour valoir le détour, assez fréquent pour qu'il y ait toujours quelque chose
// à étudier.
export const BREAKOUT_INDEX = 500

// Facebook ne renvoie pas d'URL de publication : le connecteur n'expose qu'une
// formule de tableur. L'identifiant a la forme « pageId_postId », ce qui suffit
// à reconstruire le lien. Instagram, lui, donne l'URL directement.
function permalink(post) {
  if (post.raw?.url) return post.raw.url
  if (post.network === 'facebook') {
    const match = String(post.platform_post_id ?? '').match(/^(\d+)_(\d+)$/)
    if (match) return `https://www.facebook.com/${match[1]}/posts/${match[2]}`
  }
  return null
}

// PostgREST plafonne une réponse à 1 000 lignes. Un seul concurrent prolifique
// suffit à dépasser ce seuil, et la troncature est silencieuse : on ne perdrait
// pas seulement des lignes à l'écran, on calculerait les médianes de référence
// sur un échantillon amputé — donc des index faux, sans le moindre signe.
const PAGE = 1000

async function fetchAll(table, orderColumn) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return { data: out, error: null }
  }
}

export function useSocialCompetitors() {
  const [data, setData] = useState({ competitors: [], posts: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [comps, posts] = await Promise.all([
      fetchAll('social_competitors', 'snapshot_date'),
      fetchAll('social_competitor_posts', 'published_at'),
    ])
    const err = comps.error ?? posts.error
    if (err) { setError(err.message); setLoading(false); return }
    setError(null)
    setData({ competitors: comps.data ?? [], posts: posts.data ?? [] })
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  // ── Identité : le relevé le plus récent de chaque compte ──────────────────
  // La requête est déjà triée par date décroissante, donc la première
  // occurrence d'une clé est la plus fraîche.
  const profiles = useMemo(() => {
    const byKey = new Map()
    for (const c of data.competitors) {
      const key = `${c.network}|${c.screen_name}`
      if (!byKey.has(key)) byKey.set(key, c)
    }
    return byKey
  }, [data.competitors])

  // ── Une ligne par publication, avec son index ─────────────────────────────
  const rows = useMemo(() => {
    const cutoff = Date.now() - BASELINE_DAYS * 864e5

    const baselineValues = new Map()
    for (const p of data.posts) {
      if (p.interactions == null) continue
      if (!p.published_at || Date.parse(p.published_at) < cutoff) continue
      const key = `${p.network}|${p.competitor}`
      if (!baselineValues.has(key)) baselineValues.set(key, [])
      baselineValues.get(key).push(Number(p.interactions))
    }

    const baselines = new Map()
    for (const [key, values] of baselineValues) {
      baselines.set(key, { n: values.length, median: median(values) })
    }

    return data.posts.map(p => {
      const key = `${p.network}|${p.competitor}`
      const base = baselines.get(key)
      const interactions = p.interactions != null ? Number(p.interactions) : null
      // Une baseline trop maigre, une médiane nulle ou une publication non
      // mesurée : dans les trois cas l'index n'existe pas. Il vaut mieux ne
      // rien afficher qu'un nombre qui ne repose sur rien.
      const index =
        base && base.n >= MIN_BASELINE && base.median > 0 && interactions != null
          ? (interactions / base.median) * 100
          : null

      return {
        id: p.id,
        network: p.network,
        competitor: p.competitor,
        profile: profiles.get(key) ?? null,
        publishedAt: p.published_at,
        mediaType: p.media_type ?? null,
        caption: (p.caption ?? '').trim(),
        interactions,
        likes: p.likes != null ? Number(p.likes) : null,
        comments: p.comments != null ? Number(p.comments) : null,
        // Instagram n'expose pas les partages pour les concurrents. La colonne
        // reste vide de ce côté — c'est une absence de mesure, pas un zéro.
        shares: p.shares != null ? Number(p.shares) : null,
        engagementRate: p.engagement_rate != null ? Number(p.engagement_rate) : null,
        url: permalink(p),
        picture: p.raw?.picture ?? null,
        index,
        baselineN: base?.n ?? 0,
        baselineMedian: base?.median ?? null,
      }
    })
  }, [data.posts, profiles])

  // ── Un résumé par compte suivi ────────────────────────────────────────────
  const accounts = useMemo(() => {
    const cutoff = Date.now() - BASELINE_DAYS * 864e5
    const byKey = new Map()

    for (const row of rows) {
      if (!row.publishedAt || Date.parse(row.publishedAt) < cutoff) continue
      const key = `${row.network}|${row.competitor}`
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          network: row.network,
          competitor: row.competitor,
          profile: row.profile,
          posts: [],
        })
      }
      byKey.get(key).posts.push(row)
    }

    // Un compte suivi dans Metricool mais qui n'a rien publié sur la fenêtre
    // doit rester visible : « aucune publication en 90 jours » est en soi une
    // information sur un concurrent.
    for (const [key, profile] of profiles) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          network: profile.network,
          competitor: profile.screen_name,
          profile,
          posts: [],
        })
      }
    }

    return [...byKey.values()]
      .map(a => {
        const interactions = a.posts.map(p => p.interactions).filter(v => v != null)
        const reels = a.posts.filter(p => p.mediaType === 'REEL').length
        return {
          ...a,
          displayName: a.profile?.display_name || a.competitor,
          pictureUrl: a.profile?.picture_url ?? null,
          followers: a.profile?.followers != null ? Number(a.profile.followers) : null,
          postCount: a.posts.length,
          reelCount: reels,
          // Sur quoi le compte mise réellement. Un concurrent qui publie
          // exclusivement des Reels ne se combat pas avec des carrousels.
          reelShare: a.posts.length ? reels / a.posts.length : null,
          perWeek: a.posts.length / (BASELINE_DAYS / 7),
          medianInteractions: median(interactions),
          breakouts: a.posts.filter(p => p.index != null && p.index >= BREAKOUT_INDEX).length,
          hasBaseline: interactions.length >= MIN_BASELINE,
        }
      })
      .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))
  }, [rows, profiles])

  const lastSync = useMemo(
    () => data.competitors.map(c => c.snapshot_date).filter(Boolean).sort().at(-1) ?? null,
    [data.competitors],
  )

  return { loading, error, refetch, rows, accounts, lastSync, minBaseline: MIN_BASELINE, baselineDays: BASELINE_DAYS }
}
