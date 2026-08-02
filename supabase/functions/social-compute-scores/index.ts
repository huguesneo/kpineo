import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Taille maximale de l'échantillon de baseline, et seuil sous lequel on refuse
// de trancher (verdict 'insuffisant' peu importe le score).
const BASELINE_MAX = 20
const BASELINE_MIN = 8

// Plancher appliqué à chaque PI avant la moyenne géométrique : un follow_rate à
// zéro doit peser lourd contre, pas annuler le score entier.
const EPS = 0.05

// Poids de référence. Les formats sans watch_through (carrousel, image) — et
// plus généralement toute métrique non mesurable — sont retirés puis les poids
// restants sont renormalisés sur 1,00.
const WEIGHTS = {
  pi_share:  0.30,
  pi_save:   0.20,
  pi_reach:  0.20,
  pi_follow: 0.20,
  pi_watch:  0.10,
} as const

type PiKey = keyof typeof WEIGHTS

type RatioKey = 'er_reach' | 'save_rate' | 'share_rate' | 'follow_rate' | 'profile_ctr' | 'watch_through'

// PI → ratio normalisé dont il dérive.
const PI_SOURCE: Record<PiKey, RatioKey> = {
  pi_share:  'share_rate',
  pi_save:   'save_rate',
  pi_reach:  'er_reach',
  pi_follow: 'follow_rate',
  pi_watch:  'watch_through',
}

const RATIO_KEYS: RatioKey[] = ['er_reach', 'save_rate', 'share_rate', 'follow_rate', 'profile_ctr', 'watch_through']

const VIDEO_TYPES = new Set(['VIDEO', 'REELS', 'REEL'])

// Les deux fenêtres de mesure calculées à chaque run. Elles constituent deux
// pistes strictement indépendantes : le backfill historique n'a que du d28,
// les publications récentes n'ont encore que du d7. Un score d7 ne se compare
// jamais à un score d28 — univers, bucket et baseline sont cloisonnés par
// fenêtre, et les deux lignes coexistent dans social_post_scores.
const WINDOWS = ['d7', 'd28'] as const
type WindowTag = typeof WINDOWS[number]

type Snapshot = {
  publication_id: string
  reach: number | null
  views: number | null
  total_interactions: number | null
  saves: number | null
  shares: number | null
  follows: number | null
  profile_visits: number | null
  full_watch_rate: number | null
}

type Publication = {
  id: string
  platform: string
  media_type: string | null
  published_at: string
}

type Denominator = 'reach' | 'views'

type Row = {
  publicationId: string
  bucket: string
  denominator: Denominator
  publishedMs: number
  ratios: Record<RatioKey, number | null>
}

type WindowStats = {
  snapshots: number
  buckets: number
  skipped_no_denominator: number
  by_denominator: Record<Denominator, number>
  scored: number
  verdicts: Record<string, number>
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Ratio normalisé sur le dénominateur du bucket — portée, ou vues en repli.
 *  NULL si le numérateur n'est pas mesuré : absence de mesure n'est pas la
 *  même chose qu'une valeur nulle. */
function ratio(numerator: number | null, denominator: number): number | null {
  return numerator === null ? null : numerator / denominator
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function verdictFor(score: number | null, baselineN: number): string {
  if (baselineN < BASELINE_MIN || score === null) return 'insuffisant'
  if (score >= 120) return 'surperforme'
  if (score > 80) return 'normal'
  return 'sous_performe'
}

/** Lit une table par pages de 1000 — les tables sociales sont petites mais
 *  la limite implicite de PostgREST tronquerait silencieusement plus tard. */
async function fetchAll<T>(
  // deno-lint-ignore no-explicit-any
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** Calcule les scores d'UNE fenêtre. Tout ce que cette fonction lit est filtré
 *  sur `windowTag` : aucune donnée d'une autre fenêtre n'entre dans l'univers,
 *  les buckets ou les baselines. */
async function computeWindow(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  windowTag: WindowTag,
): Promise<{ payload: Record<string, unknown>[]; stats: WindowStats }> {
  const stats: WindowStats = {
    snapshots: 0,
    buckets: 0,
    skipped_no_denominator: 0,
    by_denominator: { reach: 0, views: 0 },
    scored: 0,
    verdicts: { surperforme: 0, normal: 0, sous_performe: 0, insuffisant: 0 },
  }

  // 1. Univers de calcul : les publications ayant atteint cette fenêtre —
  //    pas de score partiel sur une publication qui n'y est pas encore.
  const snapshots = await fetchAll<Snapshot>((from, to) =>
    supabase
      .from('social_metric_snapshots')
      .select('publication_id, reach, views, total_interactions, saves, shares, follows, profile_visits, full_watch_rate')
      .eq('window_tag', windowTag)
      .range(from, to))
  stats.snapshots = snapshots.length

  if (snapshots.length === 0) return { payload: [], stats }

  // L'index unique partiel (publication_id, window_tag) garantit un seul
  // snapshot par fenêtre ; on se protège quand même d'un doublon historique.
  const byPublication = new Map<string, Snapshot>()
  for (const s of snapshots) byPublication.set(String(s.publication_id), s)

  const publications = await fetchAll<Publication>((from, to) =>
    supabase
      .from('social_publications')
      .select('id, platform, media_type, published_at')
      .in('id', [...byPublication.keys()])
      .range(from, to))

  // 2. Ratios normalisés ------------------------------------------------------
  const rows: Row[] = []
  for (const pub of publications) {
    const snap = byPublication.get(String(pub.id))
    if (!snap) continue

    // Dénominateur : la portée quand la plateforme la donne, les vues sinon.
    // Meta n'expose pas la portée des Reels Facebook et l'API TikTok pas du
    // tout — sans repli, ces deux univers resteraient à jamais non scorés.
    // Le repli ne dégrade pas la comparaison : le dénominateur entre dans la
    // clé de bucket, donc un bucket ne mélange jamais les deux bases.
    const reach = num(snap.reach)
    const views = num(snap.views)
    const useReach = reach !== null && reach > 0
    const denominator: Denominator = useReach ? 'reach' : 'views'
    const base = useReach ? (reach as number) : (views ?? 0)
    if (base === 0) { stats.skipped_no_denominator++; continue }
    stats.by_denominator[denominator]++

    const isVideo = VIDEO_TYPES.has(String(pub.media_type ?? '').toUpperCase())

    rows.push({
      publicationId: String(pub.id),
      // La fenêtre et le dénominateur font partie de la clé de bucket : même
      // si cette passe ne voit qu'un seul tag, l'invariant reste explicite
      // dans la donnée.
      bucket: `${pub.platform}|${pub.media_type ?? 'inconnu'}|${windowTag}|${denominator}`,
      denominator,
      publishedMs: new Date(String(pub.published_at)).getTime(),
      ratios: {
        er_reach:      ratio(num(snap.total_interactions), base),
        save_rate:     ratio(num(snap.saves), base),
        share_rate:    ratio(num(snap.shares), base),
        follow_rate:   ratio(num(snap.follows), base),
        profile_ctr:   ratio(num(snap.profile_visits), base),
        // Pas de watch_through hors format vidéo : NULL, pas 1.
        watch_through: isVideo ? num(snap.full_watch_rate) : null,
      },
    })
  }

  // 3. Buckets de baseline = (plateforme, type de média, fenêtre) ------------
  const buckets = new Map<string, Row[]>()
  for (const r of rows) {
    const list = buckets.get(r.bucket) ?? []
    list.push(r)
    buckets.set(r.bucket, list)
  }
  for (const list of buckets.values()) list.sort((a, b) => b.publishedMs - a.publishedMs)
  stats.buckets = buckets.size

  // 4. Baselines, PI, score, verdict -----------------------------------------
  const payload: Record<string, unknown>[] = []
  const computedAt = new Date().toISOString()

  for (const r of rows) {
    // Une publication est exclue de sa propre baseline : sinon un post
    // extrême se compare en partie à lui-même.
    const sample = (buckets.get(r.bucket) ?? [])
      .filter(o => o.publicationId !== r.publicationId)
      .slice(0, BASELINE_MAX)
    const baselineN = sample.length

    const baseline: Record<RatioKey, number | null> = {} as Record<RatioKey, number | null>
    for (const k of RATIO_KEYS) {
      baseline[k] = median(sample.map(o => o.ratios[k]).filter((v): v is number => v !== null))
    }

    // PI(m) = valeur / baseline, planché à EPS. Une métrique non mesurée
    // (valeur NULL) ou sans baseline exploitable est retirée du score et son
    // poids redistribué — c'est le cas général dont le carrousel sans
    // watch_through est une instance.
    const pi: Record<PiKey, number | null> = {} as Record<PiKey, number | null>
    for (const key of Object.keys(WEIGHTS) as PiKey[]) {
      const value = r.ratios[PI_SOURCE[key]]
      const base = baseline[PI_SOURCE[key]]
      pi[key] = value === null || base === null || base === 0
        ? null
        : Math.max(value / base, EPS)
    }

    const active = (Object.keys(WEIGHTS) as PiKey[]).filter(k => pi[k] !== null)
    const totalWeight = active.reduce((sum, k) => sum + WEIGHTS[k], 0)

    let score: number | null = null
    if (totalWeight > 0) {
      // Moyenne géométrique pondérée : 100 × Π PI(m)^w(m), poids renormalisés.
      const logSum = active.reduce(
        (sum, k) => sum + (WEIGHTS[k] / totalWeight) * Math.log(pi[k] as number), 0)
      score = 100 * Math.exp(logSum)
    }

    const verdict = verdictFor(score, baselineN)
    stats.verdicts[verdict]++

    payload.push({
      publication_id: r.publicationId,
      window_tag:    windowTag,
      denominator:   r.denominator,
      er_reach:      r.ratios.er_reach,
      save_rate:     r.ratios.save_rate,
      share_rate:    r.ratios.share_rate,
      follow_rate:   r.ratios.follow_rate,
      profile_ctr:   r.ratios.profile_ctr,
      watch_through: r.ratios.watch_through,
      pi_reach:      pi.pi_reach,
      pi_save:       pi.pi_save,
      pi_share:      pi.pi_share,
      pi_follow:     pi.pi_follow,
      pi_watch:      pi.pi_watch,
      score:         score === null ? null : Number(score.toFixed(4)),
      baseline_n:    baselineN,
      verdict,
      computed_at:   computedAt,
    })
  }

  return { payload, stats }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Corps optionnel — le cron poste `{}` et obtient les deux fenêtres.
  // `dry_run` sert à auditer la formule sans toucher à la table.
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* corps vide ou non JSON */ }
  const dryRun = body.dry_run === true

  const errors: string[] = []
  const summary = {
    dry_run: dryRun,
    scored_total: 0,
    windows: {} as Record<string, WindowStats>,
    errors,
  }

  try {
    const payload: Record<string, unknown>[] = []

    for (const windowTag of WINDOWS) {
      const res = await computeWindow(supabase, windowTag)
      summary.windows[windowTag] = res.stats
      payload.push(...res.payload)
    }

    // 5. UPSERT sur (publication_id, window_tag) : on recalcule et on écrase à
    //    chaque run — contrairement aux snapshots, cette table n'est jamais en
    //    append. Les deux fenêtres d'une même publication sont deux lignes
    //    distinctes et ne s'écrasent pas l'une l'autre.
    if (dryRun) {
      return new Response(JSON.stringify({ ...summary, rows: payload }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500)
      const { error: upErr } = await supabase
        .from('social_post_scores')
        .upsert(chunk, { onConflict: 'publication_id,window_tag' })
      if (upErr) throw new Error(`social_post_scores upsert: ${upErr.message}`)
      summary.scored_total += chunk.length
    }

    for (const windowTag of WINDOWS) {
      const s = summary.windows[windowTag]
      if (s) s.scored = payload.filter(p => p.window_tag === windowTag).length
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    return new Response(JSON.stringify(summary), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
