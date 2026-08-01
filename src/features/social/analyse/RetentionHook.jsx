import { useMemo } from 'react'
import Card from '../../../components/shared/Card'
import { DurationHookScatter } from './charts'
import { mean, median } from '../../../hooks/useSocialAnalytics'
import {
  fmtPct, fmtSeconds, fmtDate, platformMeta, publicationTitle, hookTone,
} from '../../../lib/socialFormat'

// ============================================================================
// Rétention & hook
//
// Le design d'origine montrait une courbe de rétention seconde par seconde.
// Aucune API — Meta, TikTok, Metricool — ne la fournit par publication. La
// question utile derrière cette courbe est « quelle durée retient le monde » :
// c'est à celle-là qu'on répond ici, avec des mesures réelles.
// ============================================================================

const MIN_VIDEOS = 12

function Kpi({ label, value, sub }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</div>
      <div className="text-[28px] font-bold text-[#1a1a1a] mt-2 leading-none tabular-nums">{value}</div>
      <div className="text-xs text-[#6b7280] mt-1.5">{sub}</div>
    </Card>
  )
}

export default function RetentionHook({ rows, onSelect }) {
  const videos = useMemo(() => rows.filter(r => r.hookRate != null), [rows])

  const withDuration = useMemo(
    () => videos.filter(r => r.durationSeconds != null),
    [videos],
  )

  const ranking = useMemo(
    () => [...videos].sort((a, b) => b.hookRate - a.hookRate),
    [videos],
  )

  const scatterPoints = useMemo(
    () => withDuration.map(r => ({
      id: r.id,
      duration: r.durationSeconds,
      hook: r.hookRate,
      color: platformMeta(r.platform).color,
      label: publicationTitle(r.publication, r.post).slice(0, 60),
    })),
    [withDuration],
  )

  const avgHook = mean(videos, 'hookRate')
  const medHook = median(videos.map(r => r.hookRate))
  const avgWatch = mean(videos, 'avgWatch')
  const medDuration = median(withDuration.map(r => r.durationSeconds))

  return (
    <div className="flex flex-col gap-5">
      {videos.length < MIN_VIDEOS && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            <b>{videos.length}</b> vidéo{videos.length > 1 ? 's' : ''} avec un hook rate mesuré sur cette période.
            Sous {MIN_VIDEOS}, lis les tendances ci-dessous comme des indices, pas comme des conclusions.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Hook rate moyen"
          value={avgHook != null ? fmtPct(avgHook) : '—'}
          sub="restent après 3 secondes"
        />
        <Kpi
          label="Hook rate médian"
          value={medHook != null ? fmtPct(medHook) : '—'}
          sub="moins sensible aux extrêmes"
        />
        <Kpi
          label="Écoute moyenne"
          value={avgWatch != null ? fmtSeconds(avgWatch) : '—'}
          sub="par vue"
        />
        <Kpi
          label="Durée médiane"
          value={medDuration != null ? `${Math.round(medDuration)} s` : '—'}
          sub={`${withDuration.length} vidéo${withDuration.length > 1 ? 's' : ''} avec une durée connue`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a]">Durée et hook rate</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-3">
            Chaque point est une vidéo. Le nuage montre si tes vidéos longues retiennent
            autant que les courtes — c'est ce qui remplace la courbe de rétention, que
            les plateformes ne publient pas.
          </p>
          <DurationHookScatter points={scatterPoints} onSelect={onSelect} />
          {withDuration.length > 0 && withDuration.length < videos.length && (
            <p className="text-[11px] text-[#9ca3af] mt-2">
              {videos.length - withDuration.length} vidéo{videos.length - withDuration.length > 1 ? 's sont absentes' : ' est absente'} du
              nuage : leur durée n'est pas renvoyée par la plateforme.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a] mb-3">Classement hook rate</h3>
          <div className="flex flex-col gap-1 max-h-[430px] overflow-y-auto">
            {ranking.map(r => {
              const tone = hookTone(r.hookRate)
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#fafafb] text-left transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: platformMeta(r.platform).color }}
                  />
                  <span className="flex-1 min-w-0 text-[13px] font-medium text-[#1a1a1a] truncate">
                    {publicationTitle(r.publication, r.post)}
                  </span>
                  <span className="text-[10px] text-[#9ca3af] shrink-0">{fmtDate(r.publishedAt)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${tone.bg} ${tone.text}`}>
                    {fmtPct(r.hookRate, 0)}
                  </span>
                </button>
              )
            })}
            {!ranking.length && (
              <p className="text-sm text-[#9ca3af] py-6 text-center">
                Aucun hook rate mesuré sur cette période.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
