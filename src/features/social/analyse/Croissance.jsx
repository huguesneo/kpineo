import { useMemo } from 'react'
import Card from '../../../components/shared/Card'
import { DailyLineChart, DailyAreaChart } from './charts'
import { fmtInt, fmtPct, fmtDate, platformMeta, PLATFORM_ORDER } from '../../../lib/socialFormat'

// ============================================================================
// Croissance
//
// L'historique journalier commence à la date de connexion de chaque compte à
// Metricool. Avant, la donnée n'existe nulle part et ne peut pas être
// reconstruite. Chaque bloc annonce donc son point de départ réel plutôt que
// de laisser croire à une absence d'activité.
// ============================================================================

const MIN_POINTS_FOR_DELTA = 14

function Kpi({ label, value, sub, delta }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</div>
      <div className="text-[28px] font-bold text-[#1a1a1a] mt-2 leading-none tabular-nums">{value}</div>
      <div className="flex items-center gap-2 mt-1.5">
        {delta != null && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            delta >= 0 ? 'bg-[#00bbb1]/10 text-[#009e95]' : 'bg-[#ef4444]/10 text-[#dc2626]'
          }`}>
            {delta >= 0 ? '+' : '−'}{Math.abs(delta).toFixed(1).replace('.', ',')} %
          </span>
        )}
        <span className="text-xs text-[#6b7280]">{sub}</span>
      </div>
    </Card>
  )
}

function buildSeries(daily, platforms, field, days) {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
  const byDate = new Map()
  let start = null
  const present = []
  for (const p of platforms) {
    let any = false
    for (const point of daily[p] ?? []) {
      if (point.date < cutoff || point[field] == null) continue
      any = true
      if (!start || point.date < start) start = point.date
      const entry = byDate.get(point.date) ?? { date: point.date }
      entry[p] = point[field]
      byDate.set(point.date, entry)
    }
    if (any) present.push(p)
  }
  return {
    data: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    series: present.map(p => ({ key: p, label: platformMeta(p).label, color: platformMeta(p).color })),
    start,
  }
}

export default function Croissance({ daily, filters }) {
  const { platform, days } = filters
  const platforms = useMemo(
    () => PLATFORM_ORDER.filter(p => daily[p]?.length && (platform === 'all' || p === platform)),
    [daily, platform],
  )

  const followers = useMemo(() => buildSeries(daily, platforms, 'followers', days), [daily, platforms, days])
  const views = useMemo(() => buildSeries(daily, platforms, 'views', days), [daily, platforms, days])

  const kpis = useMemo(() => {
    let total = 0
    let gained = 0
    let shortest = Infinity
    for (const p of platforms) {
      const known = (daily[p] ?? []).filter(pt => pt.followers != null)
      if (!known.length) continue
      total += known[known.length - 1].followers
      shortest = Math.min(shortest, known.length)
      const windowed = known.filter(pt => pt.date >= new Date(Date.now() - days * 864e5).toISOString().slice(0, 10))
      if (windowed.length >= 2) gained += windowed[windowed.length - 1].followers - windowed[0].followers
    }
    const viewsTotal = views.data.reduce(
      (acc, d) => acc + views.series.reduce((a, s) => a + (d[s.key] ?? 0), 0), 0,
    )
    return {
      total, gained, viewsTotal,
      growthPct: total && gained ? (gained / (total - gained)) * 100 : null,
      enoughHistory: shortest !== Infinity && shortest >= MIN_POINTS_FOR_DELTA,
    }
  }, [daily, platforms, days, views])

  return (
    <div className="flex flex-col gap-5">
      {!kpis.enoughHistory && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            L'historique journalier est encore court{followers.start ? ` — il commence le ${fmtDate(followers.start)}` : ''}.
            Il s'allonge d'un jour par jour. Aucune variation n'est affichée tant qu'il n'y a pas
            deux périodes complètes à comparer.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Abonnés totaux" value={fmtInt(kpis.total)}
          sub={platforms.map(p => platformMeta(p).label).join(' + ') || '—'}
        />
        <Kpi
          label="Abonnés gagnés" value={kpis.gained ? `+${fmtInt(kpis.gained)}` : '—'}
          sub="net, sur la période"
          delta={kpis.enoughHistory ? kpis.growthPct : null}
        />
        <Kpi
          label="Vues cumulées" value={fmtInt(kpis.viewsTotal || null)}
          sub="relevés de compte"
        />
        <Kpi
          label="Jours de données"
          value={String(Math.max(followers.data.length, views.data.length))}
          sub="depuis le début de la collecte"
        />
      </div>

      <Card className="p-5">
        <h3 className="text-base font-bold text-[#1a1a1a]">Abonnés</h3>
        <p className="text-xs text-[#6b7280] mt-0.5 mb-3">
          Une échelle par plateforme : Facebook et Instagram n'ont pas le même ordre de grandeur.
        </p>
        {followers.data.length > 1 ? (
          <DailyLineChart data={followers.data} series={followers.series} />
        ) : (
          <p className="text-sm text-[#9ca3af] py-10 text-center">
            Pas encore deux relevés d'abonnés sur cette période.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-bold text-[#1a1a1a]">Vues par jour</h3>
        <p className="text-xs text-[#6b7280] mt-0.5 mb-3">Contenus vus, tous formats confondus</p>
        {views.data.length > 1 ? (
          <DailyAreaChart data={views.data} series={views.series} height={260} />
        ) : (
          <p className="text-sm text-[#9ca3af] py-10 text-center">
            Pas encore assez de relevés journaliers sur cette période.
          </p>
        )}
      </Card>
    </div>
  )
}
