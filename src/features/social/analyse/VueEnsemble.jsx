import { useMemo } from 'react'
import Card from '../../../components/shared/Card'
import { Sparkline, BarRow, DailyAreaChart } from './charts'
import { sum, mean, median, periodDelta } from '../../../hooks/useSocialAnalytics'
import {
  fmtInt, fmtPct, fmtDuration, fmtDelta, fmtDate, platformMeta,
  publicationTitle, mediaLabel, hookTone,
} from '../../../lib/socialFormat'

// ============================================================================
// Vue d'ensemble — la décision d'abord
// ============================================================================

function DeltaPill({ value, unit = '%' }) {
  const label = fmtDelta(value, { unit })
  if (label == null) {
    return (
      <span
        className="text-[11px] font-semibold text-[#9ca3af]"
        title="Pas de période précédente comparable — on n'invente pas une variation."
      >
        —
      </span>
    )
  }
  const positive = value >= 0
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
      positive ? 'bg-[#00bbb1]/10 text-[#009e95]' : 'bg-[#ef4444]/10 text-[#dc2626]'
    }`}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, sub, delta, deltaUnit, spark, marks }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</span>
        <DeltaPill value={delta} unit={deltaUnit} />
      </div>
      <div className="text-[30px] font-bold text-[#1a1a1a] mt-2 leading-none tabular-nums">{value}</div>
      <div className="text-xs text-[#6b7280] mt-1.5">{sub}</div>
      <div className="mt-3"><Sparkline values={spark} /></div>
      {marks?.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[#f0f0f2]">
          {marks.map(m => (
            <div key={m.label} className="flex items-center justify-between text-[11px]">
              <span className="text-[#9ca3af]">{m.label}</span>
              <span className="font-semibold text-[#1a1a1a]">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function RecoBanner({ report, scoredCount }) {
  // Sous 10 publications scorées, aucune lecture n'est générée : une
  // recommandation tirée de 4 publications serait de l'astrologie.
  if (!report) {
    const missing = Math.max(0, 10 - scoredCount)
    return (
      <Card className="p-6 border-dashed">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">
          Quoi publier cette semaine
        </div>
        <p className="text-[15px] text-[#1a1a1a] mt-2 leading-relaxed max-w-3xl">
          {missing > 0
            ? `Pas encore de lecture. Il manque ${missing} publication${missing > 1 ? 's' : ''} scorée${missing > 1 ? 's' : ''} sur la période pour qu'une recommandation tienne debout.`
            : 'Pas encore de lecture générée pour cette semaine. Le rapport hebdomadaire s\'écrit à partir des publications scorées.'}
        </p>
      </Card>
    )
  }

  return (
    <div className="rounded-xl p-7 text-white" style={{ background: 'linear-gradient(100deg,#00bbb1,#009e95)' }}>
      <div className="flex gap-8 flex-wrap items-center">
        <div className="flex-1 min-w-[320px]">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">
            Quoi publier cette semaine
          </div>
          <div className="text-[24px] font-bold leading-snug mt-3 max-w-2xl">{report.headline}</div>
          <div className="text-sm leading-relaxed mt-3 opacity-90 max-w-2xl">{report.why}</div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {(report.stats ?? []).map(s => (
            <div key={s.label} className="bg-white/15 rounded-xl px-5 py-4 min-w-[120px]">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-[11px] uppercase tracking-wide opacity-85 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TopPostCard({ row, onSelect }) {
  const meta = platformMeta(row.platform)
  return (
    <Card
      className="overflow-hidden cursor-pointer hover:border-[#00bbb1] transition-colors flex flex-col"
      onClick={() => onSelect(row.id)}
    >
      <div
        className="h-28 relative"
        style={{ background: `linear-gradient(135deg,${meta.color}22,${meta.color}55)` }}
      >
        <span
          className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
          style={{ background: meta.color }}
        >
          {meta.label}
        </span>
        <span className="absolute bottom-3 left-3 text-[11px] font-semibold text-white bg-black/45 px-2 py-1 rounded-full">
          {mediaLabel(row.mediaType)} · {fmtDate(row.publishedAt)}
        </span>
      </div>
      <div className="p-4">
        <div className="text-sm font-semibold leading-snug text-[#1a1a1a] min-h-[40px]">
          {publicationTitle(row.publication, row.post)}
        </div>
        <div className="flex gap-5 mt-3">
          <div>
            <div className="text-base font-bold text-[#1a1a1a] tabular-nums">{fmtInt(row.views)}</div>
            <div className="text-[10px] uppercase tracking-wide text-[#9ca3af] mt-0.5">Vues</div>
          </div>
          <div>
            <div className="text-base font-bold text-[#1a1a1a] tabular-nums">
              {row.hookRate != null ? fmtPct(row.hookRate, 0) : '—'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[#9ca3af] mt-0.5">Hook</div>
          </div>
          <div>
            <div className="text-base font-bold text-[#1a1a1a] tabular-nums">{fmtInt(row.shares)}</div>
            <div className="text-[10px] uppercase tracking-wide text-[#9ca3af] mt-0.5">Partages</div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function VueEnsemble({ rows, allRows, daily, audience, filters, report, onSelect }) {
  const { platform, days } = filters

  // ── Séries journalières, limitées à la période et aux plateformes visibles ─
  const { dailyData, dailySeries, dailyStart } = useMemo(() => {
    const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
    const platforms = Object.keys(daily).filter(p => platform === 'all' || p === platform)
    const byDate = new Map()
    let start = null
    for (const p of platforms) {
      for (const point of daily[p]) {
        if (point.date < cutoff || point.views == null) continue
        if (!start || point.date < start) start = point.date
        const entry = byDate.get(point.date) ?? { date: point.date }
        entry[p] = point.views
        byDate.set(point.date, entry)
      }
    }
    return {
      dailyData: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      dailySeries: platforms
        .filter(p => [...byDate.values()].some(d => d[p] != null))
        .map(p => ({ key: p, label: platformMeta(p).label, color: platformMeta(p).color })),
      dailyStart: start,
    }
  }, [daily, platform, days])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const chrono = [...rows].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
    const viewsSpark = dailyData.map(d => dailySeries.reduce((acc, s) => acc + (d[s.key] ?? 0), 0))
    const hooks = chrono.map(r => r.hookRate).filter(v => v != null)
    const engagements = chrono.map(r => r.engagementRate).filter(v => v != null)

    const totalViews = sum(rows, 'views')
    const avgHook = mean(rows, 'hookRate')
    const avgEng = mean(rows, 'engagementRate')
    const watch = sum(rows, 'totalWatch')

    // Les abonnés viennent de la série journalière des comptes, pas des
    // publications : Meta n'attribue les nouveaux abonnés par publication que
    // sur Instagram, ce qui sous-compterait Facebook et TikTok.
    const followersGained = Object.entries(daily)
      .filter(([p]) => platform === 'all' || p === platform)
      .reduce((acc, [, points]) => {
        const known = points.filter(pt => pt.followers != null)
        if (known.length < 2) return acc
        return acc + (known[known.length - 1].followers - known[0].followers)
      }, 0)

    const allHooks = allRows.map(r => r.hookRate).filter(v => v != null)
    const allEng = allRows.map(r => r.engagementRate).filter(v => v != null)
    const medianHook = median(allHooks)
    const medianEng = median(allEng)

    return [
      {
        label: 'Vues totales', value: fmtInt(totalViews), sub: `${rows.length} publications`,
        delta: periodDelta(allRows, { platform, days, key: 'views', aggregate: sum }),
        spark: viewsSpark,
        marks: [{ label: 'Vues par publication', value: fmtInt(rows.length ? totalViews / rows.length : null) }],
      },
      {
        label: 'Hook rate moyen', value: avgHook != null ? fmtPct(avgHook) : '—',
        sub: 'restent après 3 secondes',
        delta: periodDelta(allRows, { platform, days, key: 'hookRate', aggregate: mean }),
        deltaUnit: '%', spark: hooks,
        marks: [
          { label: 'Ma médiane, tout l\'historique', value: medianHook != null ? fmtPct(medianHook) : '—' },
          { label: 'Vidéos mesurées', value: `${hooks.length} sur ${rows.length}` },
        ],
      },
      {
        label: 'Temps d\'écoute', value: fmtDuration(watch), sub: 'cumulé sur la période',
        delta: periodDelta(allRows, { platform, days, key: 'totalWatch', aggregate: sum }),
        spark: chrono.map(r => r.totalWatch).filter(v => v != null),
        marks: [{ label: 'Écoute moyenne par vue', value: mean(rows, 'avgWatch') != null ? `${mean(rows, 'avgWatch').toFixed(1).replace('.', ',')} s` : '—' }],
      },
      {
        label: 'Taux d\'engagement', value: avgEng != null ? fmtPct(avgEng) : '—',
        sub: 'interactions sur portée',
        delta: periodDelta(allRows, { platform, days, key: 'engagementRate', aggregate: mean }),
        spark: engagements,
        marks: [
          { label: 'Ma médiane, tout l\'historique', value: medianEng != null ? fmtPct(medianEng) : '—' },
          { label: 'Publications avec portée', value: `${engagements.length} sur ${rows.length}` },
        ],
      },
      {
        label: 'Abonnés gagnés', value: followersGained ? `+${fmtInt(followersGained)}` : '—',
        sub: 'net, depuis le début de la série',
        delta: null, spark: [],
        marks: [{ label: 'Source', value: 'relevés de compte' }],
      },
      {
        label: 'Partages', value: fmtInt(sum(rows, 'shares')), sub: 'le signal le plus fort',
        delta: periodDelta(allRows, { platform, days, key: 'shares', aggregate: sum }),
        spark: chrono.map(r => r.shares).filter(v => v != null),
        marks: [{ label: 'Sauvegardes', value: fmtInt(sum(rows, 'saves')) }],
      },
    ]
  }, [rows, allRows, daily, dailyData, dailySeries, platform, days])

  const topPosts = useMemo(
    () => [...rows].filter(r => r.views != null).sort((a, b) => b.views - a.views).slice(0, 3),
    [rows],
  )

  // Hook rate moyen par type de média — remplace le « par format » du design,
  // qui supposait un tagging que 103 publications sur 104 n'ont pas.
  const byMedia = useMemo(() => {
    const groups = new Map()
    for (const r of rows) {
      if (r.hookRate == null) continue
      const key = `${platformMeta(r.platform).label} · ${mediaLabel(r.mediaType)}`
      const g = groups.get(key) ?? { label: key, values: [] }
      g.values.push(r.hookRate)
      groups.set(key, g)
    }
    return [...groups.values()]
      .map(g => ({
        label: g.label,
        value: g.values.reduce((a, b) => a + b, 0) / g.values.length,
        n: g.values.length,
      }))
      .sort((a, b) => b.value - a.value)
  }, [rows])

  const watchByPlatform = useMemo(() => {
    const groups = new Map()
    for (const r of rows) {
      if (r.totalWatch == null) continue
      groups.set(r.platform, (groups.get(r.platform) ?? 0) + r.totalWatch)
    }
    const total = [...groups.values()].reduce((a, b) => a + b, 0)
    return { total, rows: [...groups.entries()].sort((a, b) => b[1] - a[1]) }
  }, [rows])

  const genderSplit = useMemo(() => {
    const totals = { F: 0, M: 0, U: 0 }
    for (const a of audience.ageGender) totals[a.gender] = (totals[a.gender] ?? 0) + a.value
    const all = totals.F + totals.M + totals.U
    return all ? { f: (totals.F / all) * 100, m: (totals.M / all) * 100, u: (totals.U / all) * 100 } : null
  }, [audience])

  const scoredCount = rows.filter(r => r.score?.score != null).length

  return (
    <div className="flex flex-col gap-5">
      <RecoBanner report={report} scoredCount={scoredCount} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h3 className="text-base font-bold text-[#1a1a1a]">Vues par jour</h3>
              <p className="text-xs text-[#6b7280] mt-0.5">Relevés de compte, par plateforme</p>
            </div>
          </div>
          {dailyData.length > 1 ? (
            <>
              <DailyAreaChart data={dailyData} series={dailySeries} />
              {dailyStart && (
                <p className="text-[11px] text-[#9ca3af] mt-2">
                  La série commence le {fmtDate(dailyStart)} : c'est la date à laquelle la collecte
                  journalière a démarré, pas une absence d'activité avant.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#9ca3af] py-10 text-center">
              Pas encore assez de relevés journaliers sur cette période.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a]">Temps d'écoute</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-4">Combien de temps le monde t'a écouté</p>
          <div className="text-4xl font-bold text-[#1a1a1a] leading-none">
            {fmtDuration(watchByPlatform.total)}
          </div>
          <div className="flex flex-col gap-3 mt-6">
            {watchByPlatform.rows.map(([p, value]) => {
              const share = watchByPlatform.total ? (value / watchByPlatform.total) * 100 : 0
              return (
                <div key={p}>
                  <div className="flex justify-between text-[13px] mb-1.5">
                    <span className="font-medium text-[#1a1a1a]">{platformMeta(p).label}</span>
                    <span className="text-[#6b7280]">{fmtDuration(value)}</span>
                  </div>
                  <div className="h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: platformMeta(p).color }} />
                  </div>
                </div>
              )
            })}
            {!watchByPlatform.rows.length && (
              <p className="text-sm text-[#9ca3af]">Aucun temps de visionnement mesuré sur la période.</p>
            )}
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg font-bold text-[#1a1a1a]">Top 3 publications</h3>
          <span className="text-xs text-[#6b7280]">Clique pour ouvrir le détail</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topPosts.map(r => <TopPostCard key={r.id} row={r} onSelect={onSelect} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a]">Ce qui retient, ce qui ne retient pas</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-4">Hook rate moyen par plateforme et type de contenu</p>
          <div className="flex flex-col gap-3">
            {byMedia.map(f => (
              <BarRow
                key={f.label} label={f.label} value={f.value} max={Math.max(...byMedia.map(x => x.value))}
                display={fmtPct(f.value, 0)}
                color={hookTone(f.value).label === 'bon' ? '#00bbb1' : hookTone(f.value).label === 'moyen' ? '#7fdeda' : '#cfe9e7'}
                labelWidth={170}
              />
            ))}
            {!byMedia.length && (
              <p className="text-sm text-[#9ca3af]">Aucun hook rate mesuré sur la période.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a]">Ton audience</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-4">
            Abonnés Instagram{audience.date ? ` · relevé du ${fmtDate(audience.date)}` : ''}
          </p>
          {genderSplit ? (
            <>
              <div className="flex h-3.5 rounded-full overflow-hidden mb-3">
                <div style={{ width: `${genderSplit.f}%`, background: '#00bbb1' }} />
                <div style={{ width: `${genderSplit.m}%`, background: '#cfd2d8' }} />
                <div style={{ width: `${genderSplit.u}%`, background: '#eceef1' }} />
              </div>
              <div className="flex gap-5 text-[13px] text-[#6b7280]">
                <span><b className="text-[#1a1a1a]">{fmtPct(genderSplit.f, 0)}</b> femmes</span>
                <span><b className="text-[#1a1a1a]">{fmtPct(genderSplit.m, 0)}</b> hommes</span>
                <span><b className="text-[#1a1a1a]">{fmtPct(genderSplit.u, 0)}</b> non déclaré</span>
              </div>
              <p className="text-[11px] text-[#9ca3af] mt-4">
                Le détail par âge, par pays et les meilleurs moments pour publier sont dans l'onglet Audience.
              </p>
            </>
          ) : (
            <p className="text-sm text-[#9ca3af]">Aucun relevé démographique.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
