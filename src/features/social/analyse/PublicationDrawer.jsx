import { useEffect } from 'react'
import { ScoreCell, PiBars, RATIO_KEYS, VERDICT_META, num } from './scoring'
import {
  fmtInt, fmtPct, fmtSeconds, fmtDuration, fmtDateLong, platformMeta,
  publicationTitle, mediaLabel,
} from '../../../lib/socialFormat'

// ============================================================================
// Panneau latéral de détail d'une publication
// ============================================================================

function Stat({ label, value }) {
  return (
    <div className="bg-[#f7f7f9] rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">{label}</div>
      <div className="text-lg font-bold text-[#1a1a1a] mt-1 tabular-nums">{value}</div>
    </div>
  )
}

export default function PublicationDrawer({ row, onClose, onEditPost }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!row) return null

  const meta = platformMeta(row.platform)
  const score = row.score
  const verdict = VERDICT_META[score?.verdict ?? 'insuffisant'] ?? VERDICT_META.insuffisant

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#14141a]/30" onClick={onClose} />
      <div
        className="absolute top-0 right-0 bottom-0 bg-white shadow-2xl overflow-y-auto"
        style={{ width: 'min(560px, 94vw)' }}
      >
        <div
          className="relative h-44"
          style={{ background: `linear-gradient(150deg,${meta.color}55,${meta.color}cc)` }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-[#1a1a1a] text-lg leading-none hover:bg-white"
            aria-label="Fermer"
          >
            ×
          </button>
          <span
            className="absolute top-4 left-5 text-[10px] font-bold uppercase tracking-wider bg-white px-3 py-1 rounded-full"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <div className="absolute bottom-5 left-6 right-6 text-white">
            <div className="text-lg font-bold leading-snug">
              {publicationTitle(row.publication, row.post)}
            </div>
            <div className="text-xs opacity-90 mt-1.5">
              {mediaLabel(row.mediaType)}
              {row.durationSeconds != null && ` · ${Math.round(row.durationSeconds)} s`}
              {' · '}{fmtDateLong(row.publishedAt)}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Vues" value={fmtInt(row.views)} />
            <Stat label="Portée" value={fmtInt(row.reach)} />
            <Stat label="Hook rate" value={row.hookRate != null ? fmtPct(row.hookRate, 0) : '—'} />
            <Stat label="Écoute moy." value={row.avgWatch != null ? fmtSeconds(row.avgWatch) : '—'} />
            <Stat label="Écoute totale" value={row.totalWatch != null ? fmtDuration(row.totalWatch) : '—'} />
            <Stat label="Engagement" value={row.engagementRate != null ? fmtPct(row.engagementRate) : '—'} />
            <Stat label="Mentions j'aime" value={fmtInt(row.likes)} />
            <Stat label="Commentaires" value={fmtInt(row.comments)} />
            <Stat label="Partages" value={fmtInt(row.shares)} />
            <Stat label="Sauvegardes" value={fmtInt(row.saves)} />
            <Stat label="Abonnés gagnés" value={row.follows != null ? `+${fmtInt(row.follows)}` : '—'} />
            <Stat label="Interactions" value={fmtInt(row.interactions)} />
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#1a1a1a]">Score et index de performance</h4>
              <ScoreCell score={score} />
            </div>
            {score ? (
              <>
                <p className="text-xs text-[#6b7280] mt-1.5">
                  {verdict.label} · baseline de {score.baseline_n ?? 0} publications
                  {score.window_tag === 'd28' && ' · mesuré à J+28'}
                </p>
                <div className="mt-3"><PiBars score={score} /></div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4">
                  {RATIO_KEYS.map(k => {
                    const v = num(score[k.key])
                    return (
                      <div key={k.key} className="flex items-center justify-between text-xs">
                        <span className="text-[#9ca3af]">{k.label}</span>
                        <span className="font-semibold text-[#1a1a1a] tabular-nums">
                          {v == null ? '—' : fmtPct(v * 100, 2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-[#6b7280] mt-1.5">
                Pas encore de score : le calcul se fait sur la fenêtre J+7 après publication.
              </p>
            )}
          </div>

          {row.publication?.caption && (
            <div className="mt-7">
              <h4 className="text-sm font-bold text-[#1a1a1a] mb-2">Légende</h4>
              <p className="text-[13px] text-[#4b5563] leading-relaxed whitespace-pre-line max-h-52 overflow-y-auto">
                {row.publication.caption}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-7">
            {row.permalink && (
              <a
                href={row.permalink} target="_blank" rel="noreferrer"
                className="text-sm font-semibold text-[#009e95] hover:underline"
              >
                Ouvrir sur {meta.label} ↗
              </a>
            )}
            {row.post && onEditPost && (
              <button
                onClick={() => onEditPost(row.post)}
                className="text-sm font-semibold text-[#6b7280] hover:text-[#1a1a1a]"
              >
                Modifier le contenu lié
              </button>
            )}
          </div>

          {!row.post && (
            <p className="text-[11px] text-[#9ca3af] mt-4">
              Cette publication n'est reliée à aucun contenu du pipeline : sphère, hook et problème
              d'audience restent inconnus pour l'analyse par patterns.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
