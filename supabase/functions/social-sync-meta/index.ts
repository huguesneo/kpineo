import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_BASE = 'https://graph.facebook.com/v19.0'

function metaUrl(path: string, params: Record<string, string>) {
  const token = Deno.env.get('META_ACCESS_TOKEN') ?? ''
  const p = new URLSearchParams({ ...params, access_token: token })
  return `${META_BASE}${path}?${p}`
}

// Métriques confirmées disponibles au 2026-07-31.
// `follows` et `profile_visits` sont rejetés par l'API (code 100) — pas demandés.
const BASE_METRICS = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions']
const REELS_METRICS = ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']

const MATCH_WINDOW_MS = 5 * 60 * 1000   // ±5 min pour la réconciliation avec le backfill Metricool
const FINAL_AFTER_H = 72

// ── Matching GHL → plateforme (section 4.3 du plan) ────────────────────────
// GHL ne renvoie pas l'identifiant natif du média : il faut le retrouver.
const LINK_MAX_AGE_DAYS = 14          // au-delà, on cesse d'essayer
const LINK_WINDOW_BEFORE_MS = 2 * 3_600_000   // published_at − 2 h
const LINK_WINDOW_AFTER_MS = 8 * 3_600_000    // published_at + 8 h (retard de publication GHL)
const LINK_TIME_SPAN_MIN = 240        // dénominateur du score de temps
const LINK_AUTO_MIN = 0.80            // seuil de match automatique
const LINK_AUTO_MARGIN = 0.15         // écart minimal avec le 2e candidat
const LINK_AMBIGUOUS_MIN = 0.50       // en dessous : on ne lie rien, on réessaie

type Media = {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  timestamp?: string
  permalink?: string
}

type InsightValue = { name?: string; values?: { value?: unknown }[] }

function metricsFor(media: Media): string[] {
  const isReel = media.media_type === 'VIDEO' && media.media_product_type === 'REELS'
  return isReel ? [...BASE_METRICS, ...REELS_METRICS] : [...BASE_METRICS]
}

function windowTag(ageHours: number): string | null {
  if (ageHours >= 648) return 'd28'
  if (ageHours >= 156 && ageHours <= 180) return 'd7'
  if (ageHours >= 60 && ageHours <= 84) return 'd3'
  if (ageHours < 30) return 'd1'
  return null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Récupère les insights d'un nœud Graph API (média ou compte). Si l'API rejette
 *  une métrique (code 100), on retire les métriques nommées dans le message
 *  d'erreur et on réessaie une fois. */
async function fetchNodeInsights(nodeId: string, metrics: string[], extraParams: Record<string, string> = {}) {
  const call = async (list: string[]) => {
    const res = await fetch(metaUrl(`/${nodeId}/insights`, { metric: list.join(','), ...extraParams }))
    const txt = await res.text()
    let json: Record<string, unknown> = {}
    try { json = JSON.parse(txt) } catch { /* réponse non JSON */ }
    return { ok: res.ok, status: res.status, txt, json }
  }

  let attempt = await call(metrics)
  if (attempt.ok) return { data: attempt.json, metrics, error: null as string | null }

  // Message d'erreur Meta — on ne logue jamais l'URL (elle contient le token).
  const err = (attempt.json.error as Record<string, unknown> | undefined) ?? {}
  const message = String(err.message ?? attempt.txt).slice(0, 400)
  const rejected = metrics.filter(m => message.includes(m))
  const retryList = metrics.filter(m => !rejected.includes(m))

  if (retryList.length === 0 || rejected.length === 0) {
    return { data: null, metrics, error: `insights ${nodeId}: ${message}` }
  }

  console.warn(`insights ${nodeId}: retrait de [${rejected.join(',')}] — ${message}`)
  attempt = await call(retryList)
  if (attempt.ok) return { data: attempt.json, metrics: retryList, error: null }

  const err2 = (attempt.json.error as Record<string, unknown> | undefined) ?? {}
  return { data: null, metrics: retryList, error: `insights ${nodeId}: ${String(err2.message ?? attempt.txt).slice(0, 400)}` }
}

async function fetchInsights(mediaId: string, metrics: string[]) {
  return fetchNodeInsights(mediaId, metrics)
}

function metricMap(insights: Record<string, unknown> | null): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  const rows = (insights?.data as InsightValue[] | undefined) ?? []
  for (const row of rows) {
    if (!row.name) continue
    out[row.name] = num(row.values?.[0]?.value)
  }
  return out
}

// ============================================================================
// Matching GHL → plateforme (plan, section 4.3)
// ============================================================================

/** Normalisation avant comparaison : accents retirés, emojis et symboles
 *  retirés, casse ignorée, espaces normalisés, 120 premiers caractères. */
function normalizeCaption(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // diacritiques
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')  // ponctuation et symboles
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** Similarité de légende : indice de Jaccard sur les trigrammes de caractères.
 *
 *  Le plan ne tranche pas entre Jaccard et Levenshtein normalisée — je retiens
 *  Jaccard sur trigrammes pour trois raisons : il est insensible au
 *  réordonnancement (une légende retravaillée avant publication garde son
 *  score), il dégrade proprement quand un texte est tronqué ou allongé — ce
 *  qui est le cas courant ici — et il coûte O(n) là où Levenshtein coûte
 *  O(n·m). Sur 120 caractères la différence de coût est négligeable, mais la
 *  robustesse au réordonnancement, elle, ne l'est pas. */
function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

function captionSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const A = trigrams(a), B = trigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/** KIND(format) du plan — même logique que postKind() côté React. */
function postKind(format: string | null | undefined): string {
  const f = (format ?? '').toLowerCase()
  if (f.includes('reel')) return 'reel'
  // 'carrous' couvre « Carrousel » et « Carroussel » (l'orthographe de la
  // liste FORMATS), 'carous' couvre l'anglais « Carousel ».
  if (f.includes('carrous') || f.includes('carous')) return 'carrousel'
  if (f.includes('story')) return 'story'
  if (f.trim()) return 'post'
  return 'autre'
}

/** 1.0 si le media_type natif concorde avec KIND(format), 0.3 sinon.
 *  Meta range les Reels sous media_type = VIDEO (REELS est dans
 *  media_product_type, que la table ne conserve pas). */
const KIND_MEDIA_TYPE: Record<string, string> = {
  reel: 'VIDEO', carrousel: 'CAROUSEL_ALBUM', post: 'IMAGE', story: 'STORY',
}

function formatScore(format: string | null | undefined, mediaType: string | null | undefined): number {
  const want = KIND_MEDIA_TYPE[postKind(format)]
  if (!want || !mediaType) return 0.3
  return want === mediaType ? 1.0 : 0.3
}

type Candidate = { id: string; published_at: string; caption: string | null; media_type: string | null }

function scoreCandidate(
  post: { published_at: string; caption: string | null; title: string | null; format: string | null },
  cand: Candidate,
) {
  const deltaMin = Math.abs(new Date(cand.published_at).getTime() - new Date(post.published_at).getTime()) / 60_000
  const timeScore = Math.max(0, 1 - deltaMin / LINK_TIME_SPAN_MIN)

  // Repli sur le titre quand la légende locale est vide : les posts importés
  // depuis GHL n'ont pas de caption, et sans repli le terme qui pèse 0,50
  // vaudrait toujours zéro — aucun match ne pourrait jamais atteindre 0,80.
  const localText = normalizeCaption(post.caption || post.title)
  const captionScore = captionSimilarity(localText, normalizeCaption(cand.caption))

  const fmtScore = formatScore(post.format, cand.media_type)
  const total = 0.35 * timeScore + 0.50 * captionScore + 0.15 * fmtScore
  return { total, timeScore, captionScore, fmtScore, deltaMin }
}

// ============================================================================
// Insights de compte (Instagram + Facebook) — une fois par passage.
// Le nœud IG expose followers_count comme champ direct (pas une métrique
// insights) ; Facebook aussi via le champ Page. Les vraies "insights" ne
// couvrent que reach/profile_views/non-follower share.
// ============================================================================

type AccountRow = { id: string; platform: string; external_id: string }

async function fetchFollowerCount(nodeId: string): Promise<number | null> {
  const res = await fetch(metaUrl(`/${nodeId}`, { fields: 'followers_count' }))
  if (!res.ok) return null
  const json = await res.json().catch(() => ({})) as { followers_count?: unknown }
  return num(json.followers_count)
}

async function fetchInstagramAccountSnapshot(account: AccountRow) {
  const nodeId = account.external_id
  const followers = await fetchFollowerCount(nodeId)

  const { data: basic, error: basicErr } = await fetchNodeInsights(
    nodeId, ['reach', 'profile_views'], { period: 'day', metric_type: 'total_value' },
  )
  const { data: breakdown, error: breakdownErr } = await fetchNodeInsights(
    nodeId, ['reach'], { period: 'day', metric_type: 'total_value', breakdown: 'follow_type' },
  )

  const rows = (basic?.data as InsightValue[] | undefined) ?? []
  const byName: Record<string, number | null> = {}
  for (const row of rows) {
    if (!row.name) continue
    const tv = (row as unknown as { total_value?: { value?: unknown } }).total_value
    byName[row.name] = num(tv?.value ?? row.values?.[0]?.value)
  }

  let nonFollowerShare: number | null = null
  const bRows = (breakdown?.data as InsightValue[] | undefined) ?? []
  const reachRow = bRows.find(r => r.name === 'reach') as unknown as
    { total_value?: { breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] } } | undefined
  const results = reachRow?.total_value?.breakdowns?.[0]?.results ?? []
  if (results.length) {
    let follower = 0, nonFollower = 0
    for (const r of results) {
      const dim = (r.dimension_values ?? [])[0]
      const v = num(r.value) ?? 0
      if (dim === 'FOLLOWER') follower += v
      else if (dim === 'NON_FOLLOWER') nonFollower += v
    }
    if (follower + nonFollower > 0) nonFollowerShare = nonFollower / (follower + nonFollower)
  }

  return {
    followers,
    reach: byName['reach'] ?? null,
    profile_views: byName['profile_views'] ?? null,
    non_follower_view_share: nonFollowerShare,
    error: basicErr ?? breakdownErr,
    raw: { basic: basic ?? null, breakdown: breakdown ?? null },
  }
}

async function fetchFacebookAccountSnapshot(account: AccountRow) {
  const nodeId = account.external_id
  const followers = await fetchFollowerCount(nodeId)

  const { data: basic, error: basicErr } = await fetchNodeInsights(
    nodeId, ['page_impressions_unique', 'page_views_total'], { period: 'day' },
  )
  const rows = (basic?.data as InsightValue[] | undefined) ?? []
  const byName: Record<string, number | null> = {}
  for (const row of rows) {
    if (!row.name) continue
    byName[row.name] = num(row.values?.[0]?.value)
  }

  // Meta n'expose pas d'équivalent "part de vues non-abonnés" pour les Pages.
  return {
    followers,
    reach: byName['page_impressions_unique'] ?? null,
    profile_views: byName['page_views_total'] ?? null,
    non_follower_view_share: null,
    error: basicErr,
    raw: { basic: basic ?? null },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const errors: string[] = []
  let accountId: string | null = null

  const summary = {
    media_fetched: 0,
    publications_created: 0,
    publications_reconciled: 0,
    snapshots_inserted: 0,
    match_attempts: 0,
    matched_auto: 0,
    matched_ambiguous: 0,
    match_rejected: 0,
    marked_unlinked: 0,
    errors,
  }

  try {
    // 1. Compte Instagram --------------------------------------------------
    const { data: account, error: accErr } = await supabase
      .from('social_accounts')
      .select('id, external_id')
      .eq('platform', 'instagram')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (accErr) throw new Error(`social_accounts: ${accErr.message}`)
    if (!account) throw new Error('Aucun compte instagram actif dans social_accounts')

    accountId = String(account.id)
    const igUserId = String(account.external_id)

    // 2. Liste des médias --------------------------------------------------
    const mediaRes = await fetch(metaUrl(`/${igUserId}/media`, {
      fields: 'id,caption,media_type,media_product_type,timestamp,permalink',
      limit: '50',
    }))
    if (!mediaRes.ok) {
      const t = await mediaRes.text()
      throw new Error(`media: ${t.slice(0, 400)}`)
    }
    const media = ((await mediaRes.json()) as { data?: Media[] }).data ?? []
    summary.media_fetched = media.length

    // 3. Publications déjà connues pour ce compte (pour la réconciliation) --
    const { data: existing, error: exErr } = await supabase
      .from('social_publications')
      .select('id, platform_post_id, published_at, source')
      .eq('account_id', accountId)
    if (exErr) throw new Error(`social_publications select: ${exErr.message}`)

    const byPlatformId = new Map<string, string>()
    const metricoolRows: { id: string; ts: number }[] = []
    for (const row of existing ?? []) {
      byPlatformId.set(String(row.platform_post_id), String(row.id))
      if (row.source === 'metricool') {
        metricoolRows.push({ id: String(row.id), ts: new Date(String(row.published_at)).getTime() })
      }
    }

    const usedMetricool = new Set<string>()
    const now = Date.now()

    for (const m of media) {
      try {
        if (!m.id || !m.timestamp) continue
        const publishedAt = new Date(m.timestamp)
        const publishedMs = publishedAt.getTime()
        const ageHours = (now - publishedMs) / 3_600_000
        const isFinal = ageHours > FINAL_AFTER_H

        // 4. Réconciliation -------------------------------------------------
        let publicationId = byPlatformId.get(m.id) ?? null

        if (!publicationId) {
          let best: { id: string; delta: number } | null = null
          for (const row of metricoolRows) {
            if (usedMetricool.has(row.id)) continue
            const delta = Math.abs(row.ts - publishedMs)
            if (delta <= MATCH_WINDOW_MS && (!best || delta < best.delta)) {
              best = { id: row.id, delta }
            }
          }

          if (best) {
            const { error: updErr } = await supabase
              .from('social_publications')
              .update({
                platform_post_id: m.id,
                permalink: m.permalink ?? null,
                media_type: m.media_type ?? null,
                caption: m.caption ?? null,
                is_final: isFinal,
              })
              .eq('id', best.id)
            if (updErr) throw new Error(`update ${m.id}: ${updErr.message}`)

            usedMetricool.add(best.id)
            publicationId = best.id
            byPlatformId.set(m.id, best.id)
            summary.publications_reconciled++
          }
        }

        // Sinon : nouvelle publication ------------------------------------
        if (!publicationId) {
          const { data: ins, error: insErr } = await supabase
            .from('social_publications')
            .upsert({
              account_id: accountId,
              platform: 'instagram',
              platform_post_id: m.id,
              permalink: m.permalink ?? null,
              media_type: m.media_type ?? null,
              caption: m.caption ?? null,
              published_at: publishedAt.toISOString(),
              source: 'meta_direct',
              // Pas encore de post_id : le statut le dit. Le passage de
              // matching (étape 6) le fait passer en 'auto' ou 'ambiguous'
              // s'il trouve une correspondance crédible.
              match_status: 'unlinked',
              is_final: isFinal,
            }, { onConflict: 'platform,platform_post_id', ignoreDuplicates: true })
            .select('id')

          if (insErr) throw new Error(`insert ${m.id}: ${insErr.message}`)

          if (ins && ins.length > 0) {
            publicationId = String(ins[0].id)
            summary.publications_created++
          } else {
            // conflit ignoré : la ligne existe déjà, on la relit
            const { data: found } = await supabase
              .from('social_publications')
              .select('id')
              .eq('platform', 'instagram')
              .eq('platform_post_id', m.id)
              .maybeSingle()
            publicationId = found ? String(found.id) : null
          }
          if (publicationId) byPlatformId.set(m.id, publicationId)
        } else if (byPlatformId.has(m.id)) {
          // publication déjà canonisée : on tient is_final à jour
          await supabase.from('social_publications')
            .update({ is_final: isFinal })
            .eq('id', publicationId)
        }

        if (!publicationId) {
          errors.push(`publication introuvable pour ${m.id}`)
          continue
        }

        // 5. Snapshot -------------------------------------------------------
        const { data: insights, error: insightErr } = await fetchInsights(m.id, metricsFor(m))
        if (insightErr) { errors.push(insightErr); continue }

        const mm = metricMap(insights)
        const avgWatchMs = mm['ig_reels_avg_watch_time']
        const totalWatchMs = mm['ig_reels_video_view_total_time']

        const { error: snapErr } = await supabase.from('social_metric_snapshots').insert({
          publication_id:     publicationId,
          age_hours:          Number(ageHours.toFixed(4)),
          window_tag:         windowTag(ageHours),
          reach:              mm['reach'],
          views:              mm['views'],
          likes:              mm['likes'],
          comments:           mm['comments'],
          saves:              mm['saved'],
          shares:             mm['shares'],
          total_interactions: mm['total_interactions'],
          avg_watch_time_s:   avgWatchMs !== null && avgWatchMs !== undefined ? avgWatchMs / 1000 : null,
          total_watch_time_s: totalWatchMs !== null && totalWatchMs !== undefined ? totalWatchMs / 1000 : null,
          view_rate_3s:       null,   // pas d'équivalent confirmé côté API Meta
          raw:                insights ?? {},
        })

        // 23505 = la fenêtre est déjà capturée (index unique partiel
        // publication_id + window_tag) → rien à faire, ce n'est pas une erreur.
        if (snapErr && snapErr.code !== '23505') {
          throw new Error(`snapshot ${m.id}: ${snapErr.message}`)
        }
        if (!snapErr) summary.snapshots_inserted++
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    // 6. Matching GHL → plateforme (plan, section 4.3) ---------------------
    //
    // « Un mauvais appariement pollue les baselines de façon invisible et
    //   durable. Mieux vaut un post non lié — visible dans l'UI, corrigeable
    //   en deux clics — qu'un post mal lié qui fausse silencieusement tes
    //   médianes pendant six mois. »
    //
    // D'où : en dessous de 0,50 on ne lie rien du tout et on réessaiera au
    // prochain passage. On ne force jamais.
    try {
      const cutoff = new Date(now - LINK_MAX_AGE_DAYS * 86_400_000).toISOString()

      const { data: candidates, error: candErr } = await supabase
        .from('social_publications')
        .select('id, published_at, caption, media_type, post_id, match_status')
        .eq('account_id', accountId)
        .gte('published_at', new Date(now - (LINK_MAX_AGE_DAYS * 86_400_000 + LINK_WINDOW_AFTER_MS)).toISOString())
      if (candErr) throw new Error(`candidats: ${candErr.message}`)

      // Une publication déjà liée n'est plus candidate : c'est ce qui rend
      // deux passages successifs idempotents.
      const free: Candidate[] = (candidates ?? [])
        .filter(c => !c.post_id)
        .map(c => ({
          id: String(c.id),
          published_at: String(c.published_at),
          caption: c.caption as string | null,
          media_type: c.media_type as string | null,
        }))

      const { data: posts, error: postErr } = await supabase
        .from('social_posts')
        .select('id, title, caption, format, platforms, published_at')
        .eq('status', 'publie')
        .gte('published_at', cutoff)
      if (postErr) throw new Error(`social_posts: ${postErr.message}`)

      // Un post déjà représenté sur cette plateforme est terminé.
      const alreadyLinked = new Set(
        (candidates ?? []).filter(c => c.post_id).map(c => String(c.post_id)),
      )

      const claimed = new Set<string>()
      for (const post of posts ?? []) {
        const platforms = (post.platforms as string[] | null) ?? []
        if (!platforms.includes('instagram')) continue
        if (alreadyLinked.has(String(post.id))) continue
        if (!post.published_at) continue

        const postMs = new Date(String(post.published_at)).getTime()
        const scored = free
          .filter(c => !claimed.has(c.id))
          .filter(c => {
            const t = new Date(c.published_at).getTime()
            return t >= postMs - LINK_WINDOW_BEFORE_MS && t <= postMs + LINK_WINDOW_AFTER_MS
          })
          .map(c => ({ cand: c, ...scoreCandidate({
            published_at: String(post.published_at),
            caption: post.caption as string | null,
            title: post.title as string | null,
            format: post.format as string | null,
          }, c) }))
          .sort((a, b) => b.total - a.total)

        summary.match_attempts++
        if (!scored.length) continue

        const best = scored[0]
        const runnerUp = scored[1]?.total ?? 0

        let status: string | null = null
        if (best.total >= LINK_AUTO_MIN && best.total - runnerUp >= LINK_AUTO_MARGIN) status = 'auto'
        else if (best.total >= LINK_AMBIGUOUS_MIN) status = 'ambiguous'

        if (!status) {
          // Aucun candidat crédible : on ne crée rien, on réessaiera.
          summary.match_rejected++
          continue
        }

        const { error: linkErr } = await supabase
          .from('social_publications')
          .update({
            post_id: post.id,
            match_status: status,
            match_score: Number(best.total.toFixed(4)),
          })
          .eq('id', best.cand.id)
          .is('post_id', null)   // garde-fou concurrent : ne vole pas un lien déjà posé
        if (linkErr) { errors.push(`lien ${post.id}: ${linkErr.message}`); continue }

        claimed.add(best.cand.id)
        alreadyLinked.add(String(post.id))
        if (status === 'auto') summary.matched_auto++
        else summary.matched_ambiguous++
      }

      // Après 14 jours sans correspondance, le média reste en base mais son
      // statut dit la vérité : non lié, avec un bouton « Lier à un post »
      // dans l'UI plutôt qu'un lien inventé.
      const { data: stale, error: staleErr } = await supabase
        .from('social_publications')
        .update({ match_status: 'unlinked' })
        .eq('account_id', accountId)
        .is('post_id', null)
        .neq('match_status', 'unlinked')
        .neq('match_status', 'manual')
        .lt('published_at', cutoff)
        .select('id')
      if (staleErr) errors.push(`unlinked: ${staleErr.message}`)
      else summary.marked_unlinked = stale?.length ?? 0
    } catch (e) {
      errors.push(`matching: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 6.5. Insights de compte — Instagram + Facebook, une fois par passage --
    try {
      const { data: acctRows, error: acctErr } = await supabase
        .from('social_accounts')
        .select('id, platform, external_id')
        .in('platform', ['instagram', 'facebook'])
        .eq('is_active', true)
      if (acctErr) throw new Error(`social_accounts (insights compte): ${acctErr.message}`)

      const today = new Date().toISOString().slice(0, 10)

      for (const acct of (acctRows ?? []) as AccountRow[]) {
        const snap = acct.platform === 'instagram'
          ? await fetchInstagramAccountSnapshot(acct)
          : await fetchFacebookAccountSnapshot(acct)

        if (snap.error) errors.push(`compte ${acct.platform}: ${snap.error}`)

        const { error: upsertErr } = await supabase.from('social_account_snapshots').upsert({
          account_id: acct.id,
          snapshot_date: today,
          followers: snap.followers,
          reach: snap.reach,
          views: null,
          non_follower_view_share: snap.non_follower_view_share,
          profile_views: snap.profile_views,
          raw: snap.raw,
        }, { onConflict: 'account_id,snapshot_date' })
        if (upsertErr) errors.push(`snapshot compte ${acct.platform}: ${upsertErr.message}`)

        if (snap.followers != null) {
          const { error: followErr } = await supabase.from('social_accounts')
            .update({ followers_count: snap.followers })
            .eq('id', acct.id)
          if (followErr) errors.push(`followers_count ${acct.platform}: ${followErr.message}`)
        }
      }
    } catch (e) {
      errors.push(`insights compte: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 7. Horodatage du compte ---------------------------------------------
    await supabase.from('social_accounts')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: errors.length ? errors.join(' | ').slice(0, 2000) : null })
      .eq('id', accountId)

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    if (accountId) {
      await supabase.from('social_accounts')
        .update({ last_sync_error: msg.slice(0, 2000) })
        .eq('id', accountId)
    }
    return new Response(JSON.stringify(summary), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
