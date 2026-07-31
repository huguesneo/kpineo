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

/** Récupère les insights d'un média. Si l'API rejette une métrique (code 100),
 *  on retire les métriques nommées dans le message d'erreur et on réessaie une fois. */
async function fetchInsights(mediaId: string, metrics: string[]) {
  const call = async (list: string[]) => {
    const res = await fetch(metaUrl(`/${mediaId}/insights`, { metric: list.join(',') }))
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
  const retryList = rejected.length > 0
    ? metrics.filter(m => !rejected.includes(m))
    : BASE_METRICS.filter(m => metrics.includes(m))

  if (retryList.length === 0 || retryList.length === metrics.length) {
    return { data: null, metrics, error: `insights ${mediaId}: ${message}` }
  }

  console.warn(`insights ${mediaId}: retrait de [${metrics.filter(m => !retryList.includes(m)).join(',')}] — ${message}`)
  attempt = await call(retryList)
  if (attempt.ok) return { data: attempt.json, metrics: retryList, error: null }

  const err2 = (attempt.json.error as Record<string, unknown> | undefined) ?? {}
  return { data: null, metrics: retryList, error: `insights ${mediaId}: ${String(err2.message ?? attempt.txt).slice(0, 400)}` }
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
              match_status: 'auto',
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

    // 6. Horodatage du compte ---------------------------------------------
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
